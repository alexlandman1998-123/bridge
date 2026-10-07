import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { rentalOnboardingDatabase, actor, org, property } from '../tests/fixtures/rentalOnboardingDatabase.js'
import { getRentalLeaseSigningWorkspace, saveRentalLeaseDraft, prepareRentalLeaseSigning, recordRentalLeaseSignature } from '../../src/services/rentals/rentalLeaseSigningRepository.js'
import { rentalOnboardingClient } from '../tests/fixtures/rentalOnboardingClient.js'
import { rentalApplicationFieldScenario } from '../tests/fixtures/rentalApplicationFieldScenario.js'
import { renderRentalLeaseSchedule, rentalLeaseScheduleSigners } from '../../src/services/rentals/rentalLeaseSchedule.js'
let db
const root = new URL('../../../supabase/migrations/', import.meta.url)
beforeAll(async () => {
 db = await rentalOnboardingDatabase()
 for (const file of ['20260830084850_rental_lease_versions.sql','20260830085317_rental_lease_manual_signing.sql','20260913123000_rental_lease_version_seed_for_conversions.sql','20261007211002_rental_application_lease_handoff.sql']) await db.exec(readFileSync(new URL(file,root),'utf8'))
 await db.exec(`create function rental_get_tenancy_workspace_summary(p_tenancy_id uuid) returns jsonb language sql as $$ select jsonb_build_object('tenancy',jsonb_build_object('id',t.id),'lease',jsonb_build_object('id',l.id,'status',l.status)) from rental_tenancies t join rental_leases l on l.tenancy_id=t.id where t.id=p_tenancy_id $$`)
 await db.query("select set_config('test.actor',$1,false)",[actor])
},20000)
afterAll(async()=>{await db?.close()})
const rpc=async(name,values)=>(await db.query(`select ${name}(${values.map((_,i)=>`$${i+1}`).join(',')}) result`,values)).rows[0].result
async function conversion(type) {
 const applicationId=randomUUID(),unitId=randomUUID(),vacancyId=randomUUID(),canonicalParty=randomUUID()
 const answers=rentalApplicationFieldScenario(type)
 answers.property={title:'Rental home',address:'12 Rental Road',monthlyRent:11000,depositAmount:22000,unitId}
 answers.people.push({id:'private-owner',role:'beneficial_owner',firstName:'Private owner',monthlyIncome:982431})
 answers.income.monthlyIncome=923417
 await db.query("insert into rental_units(id,organisation_id,status) values($1,$2,'available')",[unitId,org])
 await db.query('insert into rental_vacancies(id,organisation_id,property_id,unit_id,asking_rent,deposit_amount,lease_term_months) values($1,$2,$3,$4,11000,22000,12)',[vacancyId,org,property,unitId])
 await db.transaction(async tx=>{await tx.exec('set local session_replication_role=replica');await tx.query("insert into rental_applications(id,organisation_id,unit_id,vacancy_id,status,applicant_party_id,application_data,submitted_snapshot_json) values($1,$2,$3,$4,'approved',$5,$6::jsonb,$6::jsonb)",[applicationId,org,unitId,vacancyId,canonicalParty,JSON.stringify(answers)])})
 return {...await rpc('rental_convert_application_to_tenancy',[applicationId,1]),answers,applicationId,canonicalParty}
}
const draftTerms={lease_start_date:'2026-11-01',lease_end_date:'2027-10-31',occupation_date:'2026-11-01',monthly_rent:11000,deposit_amount:22000,tenant_notice_address:'12 Tenant Notice Road',landlord_name:'Lessor One',landlord_email:'lessor@example.test',landlord_notice_address:'34 Lessor Road',primary_authority_basis:'Reviewed trustee / director resolution',agreement_template_reference:'Agency lease 2026 v2',agreement_document_link:'https://example.test/reviewed-agreement.pdf'}
it.each(['individual','joint_individuals','company','close_corporation','trust'])('maps approved %s parties into the rendered schedule and requires every signature',async type=>{
 const converted=await conversion(type)
 expect((await rpc('rental_convert_application_to_tenancy',[converted.applicationId,1])).tenancy_id).toBe(converted.tenancy_id)
 const parties=(await db.query('select * from rental_tenancy_parties where tenancy_id=$1',[converted.tenancy_id])).rows
 expect(parties.some(p=>p.party_id===converted.canonicalParty)).toBe(true)
 expect(parties.find(p=>p.source_subject_id==='additional-person').party_id).toBeNull()
 expect(parties.some(p=>p.source_subject_id==='private-owner')).toBe(false)
 const saved=await rpc('rental_save_lease_draft',[converted.lease_id,1,{...draftTerms,party_notice_addresses:{'additional-person':'Confirmed additional notice address'},income:{monthlyIncome:923417},application_schedule:{forged:true}}])
 const schedule=await rpc('rental_get_lease_application_projection',[converted.lease_id])
 const stored=(await db.query('select terms_json from rental_lease_versions where id=$1',[saved.id])).rows[0].terms_json
 expect(stored.application_schedule).toEqual(schedule);expect(stored.income).toBeUndefined()
 expect(schedule.parties[1].noticeAddress).toBe('Confirmed additional notice address')
 expect(schedule.parties).toHaveLength(2)
 expect(schedule.parties[1].role).toBe(type==='individual'?'guarantor':type==='joint_individuals'?'tenant':'tenant_representative')
 const html=renderRentalLeaseSchedule({...schedule,income:{monthlyIncome:923417},documents:[{url:'PRIVATE-FICA'}]},saved.version_number)
 if(type==='individual') writeFileSync('/tmp/rental-phase5-schedule.html',html)
 for(const value of ['12 Rental Road','identity-firstName','people-firstName','Agency lease 2026 v2','11000','22000','2027-10-31','34 Lessor Road']) expect(html).toContain(value)
 for(const value of ['923417','982431','PRIVATE-FICA','employer','screening','beneficial_owner']) expect(html).not.toContain(value)
 const signers=rentalLeaseScheduleSigners(schedule,saved.version_number)
 await expect(rpc('rental_prepare_lease_signing',[converted.lease_id,saved.version_number,signers.slice(1)])).rejects.toThrow(/All application signers/)
 await rpc('rental_prepare_lease_signing',[converted.lease_id,saved.version_number,signers])
 const persisted=(await db.query('select * from rental_lease_signers where lease_version_id=$1 order by source_subject_id',[saved.id])).rows
 expect(persisted).toHaveLength(3)
 for(const signer of persisted.slice(0,2)) await rpc('rental_record_lease_signature',[signer.id,'signed','https://example.test/signed.pdf','Reviewed evidence'])
 expect((await db.query('select status from rental_leases where id=$1',[converted.lease_id])).rows[0].status).not.toBe('signed')
 await rpc('rental_record_lease_signature',[persisted[2].id,'signed','https://example.test/signed.pdf','Final signer'])
 expect((await db.query('select status from rental_leases where id=$1',[converted.lease_id])).rows[0].status).toBe('signed')
 await expect(rpc('rental_save_lease_draft',[converted.lease_id,saved.version_number,draftTerms])).rejects.toThrow(/locked/)
})
it('blocks unsaved, stale, missing notice/authority/agreement, forged signers and unauthorized access',async()=>{
 const converted=await conversion('trust')
 await expect(rpc('rental_prepare_lease_signing',[converted.lease_id,1,[]])).rejects.toThrow(/Save and review/)
 let version=1
 for(const patch of [{landlord_notice_address:''},{primary_authority_basis:''},{agreement_document_link:''}]) {
  const saved=await rpc('rental_save_lease_draft',[converted.lease_id,version,{...draftTerms,...patch}]);version=saved.version_number
  const schedule=await rpc('rental_get_lease_application_projection',[converted.lease_id])
  await expect(rpc('rental_prepare_lease_signing',[converted.lease_id,version,rentalLeaseScheduleSigners(schedule,version)])).rejects.toThrow(/required|complete/)
 }
 version=(await rpc('rental_save_lease_draft',[converted.lease_id,version,draftTerms])).version_number
 const signers=rentalLeaseScheduleSigners(await rpc('rental_get_lease_application_projection',[converted.lease_id]),version)
 await expect(rpc('rental_prepare_lease_signing',[converted.lease_id,version-1,signers])).rejects.toThrow(/changed/)
 await expect(rpc('rental_prepare_lease_signing',[converted.lease_id,null,signers])).rejects.toThrow(/current lease version/)
 await expect(rpc('rental_prepare_lease_signing',[converted.lease_id,version,signers.map(s=>({...s,reviewedVersion:version-1}))])).rejects.toThrow(/do not match/)
 await expect(rpc('rental_prepare_lease_signing',[converted.lease_id,version,signers.map(s=>s.role==='landlord'?s:{...s,name:'Forged'})])).rejects.toThrow(/do not match/)
 await db.query("select set_config('test.actor',$1,false)",[randomUUID()])
 await expect(rpc('rental_get_lease_application_projection',[converted.lease_id])).rejects.toThrow(/not authorized/)
 await expect(rpc('rental_save_lease_draft',[converted.lease_id,version,draftTerms])).rejects.toThrow(/not authorized/)
 await expect(rpc('rental_prepare_lease_signing',[converted.lease_id,version,signers])).rejects.toThrow(/not authorized/)
 await db.query("select set_config('test.actor',$1,false)",[actor]);await db.exec('set role authenticated')
 await expect(rpc('rental_save_lease_draft_before_application_handoff',[converted.lease_id,version,draftTerms])).rejects.toThrow(/permission denied/)
 await db.exec('reset role')
})
it('escapes captured HTML rather than rendering applicant content as markup',()=>{
 const html=renderRentalLeaseSchedule({tenant:{name:'<script>alert(1)</script>'},parties:[{name:'<img src=x onerror=alert(1)>',role:'tenant'}]},2)
 expect(html).not.toContain('<script>');expect(html).not.toContain('<img');expect(html).toContain('&lt;script&gt;')
})

it('loads the real agent repository and protected commands through a scoped database client',async()=>{
 const converted=await conversion('joint_individuals'),client=rentalOnboardingClient(db,{},actor,true)
 const initial=await getRentalLeaseSigningWorkspace(converted.tenancy_id,{client})
 expect(initial.projection.parties).toHaveLength(2)
 const saved=await saveRentalLeaseDraft({leaseId:converted.lease_id,expectedVersion:1,terms:draftTerms},{client})
 const workspace=await getRentalLeaseSigningWorkspace(converted.tenancy_id,{client})
 expect(workspace.version.version_number).toBe(saved.version_number)
 await prepareRentalLeaseSigning({leaseId:converted.lease_id,expectedVersion:saved.version_number,signers:rentalLeaseScheduleSigners(workspace.projection,saved.version_number)},{client})
 const prepared=await getRentalLeaseSigningWorkspace(converted.tenancy_id,{client})
 expect(prepared.signers).toHaveLength(3)
 await recordRentalLeaseSignature({signerId:prepared.signers[0].id,documentLink:'https://example.test/signed.pdf'},{client})
 expect((await getRentalLeaseSigningWorkspace(converted.tenancy_id,{client})).signers.filter(s=>s.status==='signed')).toHaveLength(1)
})

it('backfills existing conversions without changing lease versions or inventing contact IDs',async()=>{
 const historical=await rentalOnboardingDatabase()
 try {
  for(const file of ['20260830084850_rental_lease_versions.sql','20260830085317_rental_lease_manual_signing.sql','20260913123000_rental_lease_version_seed_for_conversions.sql']) await historical.exec(readFileSync(new URL(file,root),'utf8'))
  await historical.query("select set_config('test.actor',$1,false)",[actor])
  const converted=[]
  for(const type of ['joint_individuals','company']) {
   const id=randomUUID(),unitId=randomUUID(),vacancyId=randomUUID(),partyId=type==='company'?null:randomUUID()
   await historical.query("insert into rental_units(id,organisation_id,status) values($1,$2,'available')",[unitId,org])
   await historical.query('insert into rental_vacancies(id,organisation_id,property_id,unit_id,asking_rent,deposit_amount,lease_term_months) values($1,$2,$3,$4,11000,22000,12)',[vacancyId,org,property,unitId])
   await historical.transaction(async tx=>{await tx.exec('set local session_replication_role=replica');await tx.query("insert into rental_applications(id,organisation_id,unit_id,vacancy_id,status,applicant_party_id,submitted_snapshot_json) values($1,$2,$3,$4,'approved',$5,$6::jsonb)",[id,org,unitId,vacancyId,partyId,JSON.stringify(rentalApplicationFieldScenario(type))])})
   const result=(await historical.query('select rental_convert_application_to_tenancy($1,1) result',[id])).rows[0].result
   converted.push({...result,type,partyId})
  }
  const versionsBefore=(await historical.query('select * from rental_lease_versions order by id')).rows
  await historical.exec(readFileSync(new URL('20261007211002_rental_application_lease_handoff.sql',root),'utf8'))
  expect((await historical.query('select * from rental_lease_versions order by id')).rows).toEqual(versionsBefore)
  for(const item of converted) {
   const parties=(await historical.query('select * from rental_tenancy_parties where tenancy_id=$1',[item.tenancy_id])).rows
   expect(parties).toHaveLength(item.type==='company'?3:2)
   const primary=parties.find(p=>p.is_primary)
   expect(primary.party_id).toBe(item.partyId)
   expect(primary.source_subject_id).toBe(item.type==='company'?'entity':'primary')
   expect(parties.find(p=>p.source_subject_id==='additional-person').party_id).toBeNull()
  }
 } finally {await historical.close()}
},20000)
