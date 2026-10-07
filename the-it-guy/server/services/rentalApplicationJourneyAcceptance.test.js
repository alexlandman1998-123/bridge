import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, expect, it } from 'vitest'
import { rentalOnboardingDatabase, actor, org, property } from '../tests/fixtures/rentalOnboardingDatabase.js'
import { rentalOnboardingClient } from '../tests/fixtures/rentalOnboardingClient.js'
import { rentalApplicationFieldScenario } from '../tests/fixtures/rentalApplicationFieldScenario.js'
import { handlePublicRentalApplication } from './publicRentalApplicationApi.js'
import { createPersistedRentalApplicantAccess, getRentalApplicationReview, recordRentalApplicationReview, decideRentalApplication, convertRentalApplicationToTenancy } from '../../src/services/rentals/rentalApplicationRepository.js'
import { saveRentalLeaseDraft, prepareRentalLeaseSigning, recordRentalLeaseSignature } from '../../src/services/rentals/rentalLeaseSigningRepository.js'
import { rentalLeaseScheduleSigners, renderRentalLeaseSchedule } from '../../src/services/rentals/rentalLeaseSchedule.js'
const root = new URL('../../../supabase/migrations/', import.meta.url)
let db, client, agent
const files = new Map()
const storage = { from: () => ({ upload: async (path, bytes, options) => { files.set(path,{ size: bytes.length,contentType: options.contentType }); return {data:{}} }, remove:async paths=>{paths.forEach(path=>files.delete(path));return{}}, info:async path=>({data:files.get(path)}), createSignedUrl:async path=>({data:{signedUrl:`https://local.test/private/${path}`}}) }) }
beforeAll(async()=>{
 db=await rentalOnboardingDatabase()
 await db.exec(`create function bridge_current_workspace_role(workspace_id uuid) returns text language sql as $$ select 'owner'::text $$;
 alter table rental_applications add column created_by uuid;
 alter table rental_application_documents add column mime_type text,add column file_size_bytes integer;
 create table rental_application_access_tokens(id uuid primary key default gen_random_uuid(),application_id uuid,token_hash text unique,expires_at timestamptz,revoked_at timestamptz,last_accessed_at timestamptz,created_by uuid,subject_id text);
 create unique index consent_retry on rental_application_consents(application_id,consent_type,wording_version);
 alter table organisations add column name text,add column display_name text,add column logo_url text;
 create table organisation_settings(organisation_id uuid,settings_json jsonb);`)
 // Restore production parent RLS/version guards, not the relaxed fixture defaults.
 await db.exec(readFileSync(new URL('20260905141014_rental_applications_and_applicant_access.sql',root),'utf8'))
 for(const file of ['20261007194611_rental_application_cost_confirmation.sql','20261007204950_rental_application_document_packs.sql','20260830084850_rental_lease_versions.sql','20260830085317_rental_lease_manual_signing.sql','20260913123000_rental_lease_version_seed_for_conversions.sql','20261007211002_rental_application_lease_handoff.sql','20261007212433_rental_empty_document_pack_readiness.sql']) await db.exec(readFileSync(new URL(file,root),'utf8'))
 await db.query("insert into rental_application_fee_settings(organisation_id,amount,payment_instructions) values($1,350,'Use the application reference')",[org])
 client=rentalOnboardingClient(db,storage,actor);agent=rentalOnboardingClient(db,storage,actor,true)
},20000)
afterAll(async()=>{await db?.close()})
const request=(token,method='GET',body)=>handlePublicRentalApplication({token,method,body,env:{SUPABASE_URL:'https://local.test',SUPABASE_SERVICE_ROLE_KEY:'local-only'},clientFactory:()=>client})
const assertResult=(result,status)=>{expect(result.status,JSON.stringify(result.body)).toBe(status);return result.body.application}
it.each(['individual','joint_individuals','company','close_corporation','trust'])('completes the %s invitation → corrections → late documents → approval → lease journey',async type=>{
 const id=randomUUID(),unitId=randomUUID(),vacancyId=randomUUID(),data=rentalApplicationFieldScenario(type)
 data.property={title:'Accepted home',address:'12 Accepted Road',unitId,monthlyRent:11000,depositAmount:22000}
 await db.query("insert into rental_units(id,organisation_id,status) values($1,$2,'available')",[unitId,org])
 await db.query('insert into rental_vacancies(id,organisation_id,property_id,unit_id,asking_rent,deposit_amount,lease_term_months) values($1,$2,$3,$4,11000,22000,12)',[vacancyId,org,property,unitId])
 await db.query('insert into rental_applications(id,organisation_id,unit_id,vacancy_id,application_data) values($1,$2,$3,$4,$5::jsonb)',[id,org,unitId,vacancyId,JSON.stringify(data)])
 const invitation=await createPersistedRentalApplicantAccess(id,{createdBy:actor,client:agent})
 let current=assertResult(await request(invitation.token),200)
 expect(current.feeDueAt).toBeNull()
 current=assertResult(await request(invitation.token,'PATCH',{action:'confirm_context',version:current.version,propertyAccepted:true,costsAccepted:true,privacyAccepted:true}),200)
 current=assertResult(await request(invitation.token,'PUT',{action:'submit',version:current.version,declarationAccepted:true,consents:['privacy','credit_check','identity_verification']}),200)
 const due=current.feeDueAt
 expect(due).toBeTruthy();expect(current.requirements.some(r=>r.required&&r.state==='missing'),JSON.stringify(current.requirements)).toBe(true)
 await expect(decideRentalApplication({applicationId:id,expectedVersion:current.version,decision:'approved',reason:'Premature'},{client:agent})).rejects.toThrow()
 await recordRentalApplicationReview({applicationId:id,expectedVersion:current.version,command:'request_changes',payload:{message:'Please correct your phone'}},{client:agent})
 current=assertResult(await request(invitation.token),200)
 const previousVersion=current.version
 current=assertResult(await request(invitation.token,'PATCH',{version:previousVersion,patch:{identity:{phone:'0215550100'}}}),200)
 expect((await request(invitation.token,'PATCH',{version:previousVersion,patch:{identity:{phone:'FORGED STALE'}}})).status).toBe(409)
 current=assertResult(await request(invitation.token,'PUT',{action:'submit',version:current.version,declarationAccepted:true,consents:['privacy','credit_check','identity_verification']}),200)
 expect(current.feeDueAt).toEqual(due)
 const participant=await createPersistedRentalApplicantAccess(id,{subjectId:'additional-person',createdBy:actor,client:agent})
 const own=assertResult(await request(participant.token),200)
 expect(own.data.identity).toBeUndefined();expect(own.costs).toBeUndefined()
 expect((await request(participant.token,'POST',{action:'record_person_permission',version:current.version,privacyAccepted:true,screeningAccepted:true,identityAccepted:true,ownInformationAccepted:true})).status).toBe(200)
 current=assertResult(await request(invitation.token),200)
 for(const requirement of current.requirements.filter(r=>r.required&&r.state!=='accepted')) {
  const response=await request(invitation.token,'POST',{version:current.version,subjectId:requirement.subjectId,purpose:requirement.purpose,requirementId:requirement.id,generation:requirement.generation,fileName:'accepted.pdf',mimeType:'application/pdf',contentBase64:Buffer.from('Local acceptance evidence').toString('base64')})
  current=assertResult(response,201)
 }
 let review=await getRentalApplicationReview(id,{client:agent})
 expect(review.feeDueAt).toEqual(due);expect(review.costs.amount).toBe(350)
 const command=async(name,payload)=>{await recordRentalApplicationReview({applicationId:id,expectedVersion:review.version,command:name,payload},{client:agent});review=await getRentalApplicationReview(id,{client:agent})}
 for(const document of review.documents) await command('review_document',{documentId:document.id,status:'accepted',note:'Current original checked'})
 for(const checkType of ['identity','fica','affordability','employment','reference']) {
  const subjects=(await db.query('select subject_id from rental_review_subjects($1::jsonb,$2)',[JSON.stringify(review.data),checkType])).rows
  expect(subjects.length).toBeGreaterThan(0)
  for(const {subject_id:subjectId} of subjects) await command('screening',{subjectId,checkType,status:'passed',evidenceNote:'Current evidence verified',expiresAt:'2099-01-01'})
 }
 await command('landlord_response',{name:'Approved Owner',outcome:'approved',channel:'written',note:'Confirmed'})
 await decideRentalApplication({applicationId:id,expectedVersion:review.version,decision:'approved',reason:'All current requirements checked'},{client:agent})
 review=await getRentalApplicationReview(id,{client:agent});expect(review.status).toBe('approved')
 const converted=await convertRentalApplicationToTenancy({applicationId:id,expectedVersion:review.version},{client:agent})
 expect((await convertRentalApplicationToTenancy({applicationId:id,expectedVersion:review.version},{client:agent})).tenancy_id).toBe(converted.tenancy_id)
 const saved=await saveRentalLeaseDraft({leaseId:converted.lease_id,expectedVersion:1,terms:{lease_start_date:'2026-11-01',lease_end_date:'2027-10-31',occupation_date:'2026-11-01',monthly_rent:11000,deposit_amount:22000,tenant_notice_address:'Tenant notice',landlord_name:'Approved Owner',landlord_notice_address:'Owner notice',primary_authority_basis:'Reviewed resolution',agreement_template_reference:'Fixture reviewed template',agreement_document_link:'https://local.test/fixture-reviewed-agreement.pdf'}},{client:agent})
 const projection=(await agent.rpc('rental_get_lease_application_projection',{p_lease_id:converted.lease_id})).data
 const html=renderRentalLeaseSchedule(projection,saved.version_number)
 expect(html).toContain('12 Accepted Road');expect(html).not.toContain('income-monthlyIncome');expect(projection.parties).toHaveLength(2)
 await prepareRentalLeaseSigning({leaseId:converted.lease_id,expectedVersion:saved.version_number,signers:rentalLeaseScheduleSigners(projection,saved.version_number)},{client:agent})
 const signers=(await db.query('select id from rental_lease_signers where lease_version_id=$1',[saved.id])).rows
 for(const signer of signers) await recordRentalLeaseSignature({signerId:signer.id,documentLink:'https://local.test/signed-evidence.pdf'},{client:agent})
 expect((await db.query('select status from rental_leases where id=$1',[converted.lease_id])).rows[0].status).toBe('signed')
 expect((await db.query('select tenant_snapshot_json from rental_tenancies where id=$1',[converted.tenancy_id])).rows[0].tenant_snapshot_json.identity.phone).toBe('0215550100')
 await db.query('update rental_application_access_tokens set revoked_at=now() where id=$1',[invitation.id])
 expect((await request(invitation.token)).status).toBe(401)
})

it('denies expired invitations and another organisation’s agent at the parent scope',async()=>{
 const id=(await db.query('select id from rental_applications limit 1')).rows[0].id
 const invitation=await createPersistedRentalApplicantAccess(id,{createdBy:actor,client:agent})
 await db.query("update rental_application_access_tokens set expires_at='2000-01-01' where id=$1",[invitation.id])
 expect((await request(invitation.token)).status).toBe(401)
 const otherOrg=randomUUID(),otherProperty=randomUUID(),otherUnit=randomUUID(),otherVacancy=randomUUID(),otherApplication=randomUUID()
 await db.query('insert into organisations(id) values($1)',[otherOrg])
 await db.query('insert into rental_properties(id,organisation_id) values($1,$2)',[otherProperty,otherOrg])
 await db.query("insert into rental_units(id,organisation_id,status) values($1,$2,'available')",[otherUnit,otherOrg])
 await db.query('insert into rental_vacancies(id,organisation_id,property_id,unit_id) values($1,$2,$3,$4)',[otherVacancy,otherOrg,otherProperty,otherUnit])
 await db.query('insert into rental_applications(id,organisation_id,unit_id,vacancy_id) values($1,$2,$3,$4)',[otherApplication,otherOrg,otherUnit,otherVacancy])
 await expect(createPersistedRentalApplicantAccess(otherApplication,{client:agent})).rejects.toThrow(/row-level security/)
 const deniedReview=await getRentalApplicationReview(otherApplication,{client:agent})
 expect(deniedReview).toBeNull()
 const foreign=rentalOnboardingClient(db,storage,randomUUID(),true)
 await expect(createPersistedRentalApplicantAccess(id,{client:foreign})).rejects.toThrow(/row-level security/)
 await expect(recordRentalApplicationReview({applicationId:id,expectedVersion:1,command:'start_review'},{client:foreign})).rejects.toThrow(/scope|authorized|access|not found/i)
})
it('exercises the release preflight as read-only and reports the fee backfill blocker',async()=>{
 await db.exec("create schema supabase_migrations;create table supabase_migrations.schema_migrations(version text)")
 const id=randomUUID()
 // A historical draft predating the fee snapshot. Fixture setup only.
 await db.transaction(async tx=>{await tx.exec('set local session_replication_role=replica');await tx.query("insert into rental_applications(id,organisation_id,status) values($1,$2,'draft')",[id,org])})
 const before=(await db.query('select id,version,status,cost_snapshot_json from rental_applications order by id')).rows
 const countsBefore=(await db.query('select count(*) from rental_application_events')).rows
 const audit=await db.exec(readFileSync(new URL('../../scripts/rental-onboarding-release-preflight.sql',import.meta.url),'utf8'))
 expect(audit.at(-1).rows[0]).toMatchObject({eligible_existing_applications:1,fee_migration_pending:true,fee_backfill_release_blocked:true})
 expect((await db.query('select id,version,status,cost_snapshot_json from rental_applications order by id')).rows).toEqual(before)
 expect((await db.query('select count(*) from rental_application_events')).rows).toEqual(countsBefore)
})

it('reproduces the legacy-row fee backfill failure with the real version guard enabled',async()=>{
 const legacy=await rentalOnboardingDatabase()
 try {
  await legacy.exec(`create function bridge_current_workspace_role(workspace_id uuid) returns text language sql as $$ select 'owner'::text $$;`)
  const base=readFileSync(new URL('20260905141014_rental_applications_and_applicant_access.sql',root),'utf8')
  await legacy.exec(base.slice(base.indexOf('create or replace function public.rental_application_validate_scope()'),base.indexOf('drop trigger if exists trg_rental_applications_updated_at')))
  const vacancy=(await legacy.query('select * from rental_vacancies limit 1')).rows[0],id=randomUUID()
  await legacy.query('insert into rental_applications(id,organisation_id,vacancy_id,unit_id) values($1,$2,$3,$4)',[id,org,vacancy.id,vacancy.unit_id])
  await expect(legacy.exec(readFileSync(new URL('20261007194611_rental_application_cost_confirmation.sql',root),'utf8'))).rejects.toThrow(/version conflict/)
  expect((await legacy.query('select version,cost_snapshot_json from rental_applications where id=$1',[id])).rows[0]).toEqual({version:1,cost_snapshot_json:{}})
  await legacy.exec(readFileSync(new URL('20261007213448_rental_fee_backfill_version_compatibility.sql',root),'utf8'))
  await legacy.exec(readFileSync(new URL('20261007194611_rental_application_cost_confirmation.sql',root),'utf8'))
  expect((await legacy.query('select version,cost_snapshot_json from rental_applications where id=$1',[id])).rows[0]).toMatchObject({version:2,cost_snapshot_json:{amount:0,currency:'ZAR'}})
  await legacy.exec(readFileSync(new URL('20261007213448_rental_fee_backfill_version_compatibility.sql',root),'utf8'))
  expect((await legacy.query('select version from rental_applications where id=$1',[id])).rows[0].version).toBe(2)
 } finally {await legacy.close()}
},20000)
