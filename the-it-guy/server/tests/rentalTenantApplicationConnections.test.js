import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { rentalTenantApplicationDatabase, actor, org, property, unit, listing, tenant, lead } from './fixtures/rentalTenantApplicationDatabase.js'
import { rentalOnboardingClient } from './fixtures/rentalOnboardingClient.js'
import { ensureRentalListingVacancy } from '../../src/services/rentals/rentalListingInventoryRepository.js'
import { listRentalTenantApplicationChoices, prepareRentalTenantApplication, issueRentalTenantApplicationInvite } from '../../src/services/rentals/rentalTenantApplicationService.js'
vi.mock('../../src/lib/supabaseClient.js', () => ({ isSupabaseConfigured: true, supabase: null }))
let db, client, vacancyId, application
beforeAll(async()=>{
 db=await rentalTenantApplicationDatabase();client=rentalOnboardingClient(db,{},actor,true)
 vacancyId=(await ensureRentalListingVacancy(listing,org,{client})).vacancyId
 await db.query("update rental_vacancies set status='preparing' where id=$1",[vacancyId])
 await db.query("update rental_vacancies set status='marketing' where id=$1",[vacancyId])
},30000)
afterAll(async()=>{await db?.close()})
it('offers the saved property and unit through scoped RLS, without selecting unavailable vacancies',async()=>{
 expect(await listRentalTenantApplicationChoices(org,'',{client})).toEqual([expect.objectContaining({id:vacancyId,listingId:listing,propertyId:property,unitId:unit,title:'Saved home',unitLabel:'MAIN',eligible:true})])
 expect(await listRentalTenantApplicationChoices(randomUUID(),'',{client})).toEqual([])
 expect(await listRentalTenantApplicationChoices(org,'',{client:rentalOnboardingClient(db,{},randomUUID(),true)})).toEqual([])
 await db.query("update private_listings set listing_status='withdrawn' where id=$1",[listing])
 expect((await listRentalTenantApplicationChoices(org,'',{client}))[0].eligible).toBe(false)
 await expect(prepareRentalTenantApplication(org,lead,vacancyId,{client})).rejects.toThrow('not available')
 await db.query("update private_listings set listing_status='active' where id=$1",[listing])
})
it('atomically reuses one draft and links the lead, listing, property, unit and tenant contact',async()=>{
 const results=await Promise.all([prepareRentalTenantApplication(org,lead,vacancyId,{client}),prepareRentalTenantApplication(org,lead,vacancyId,{client})])
 application=results[0];expect(results[1].id).toBe(application.id)
 expect(application).toMatchObject({leadId:lead,vacancyId,unitId:unit,applicantPartyId:tenant,status:'draft',data:{identity:{firstName:'Saved',lastName:'Tenant',email:'tenant@example.test'},property:{listingId:listing,vacancyId,unitId:unit,propertyId:property}}})
 const metadata=(await db.query('select raw_enquiry_payload from leads where lead_id=$1',[lead])).rows[0].raw_enquiry_payload
 expect(metadata.relationships).toMatchObject({applicationId:application.id,listingId:listing,vacancyId,unitId:unit,propertyId:property})
 expect(metadata.stage).toBe('application_pending')
 expect((await db.query('select count(*)::int total from rental_applications')).rows[0].total).toBe(1)
})
it('rejects direct duplicate inserts and application reassignment of the saved property',async()=>{
 const duplicate=await client.from('rental_applications').insert({organisation_id:org,lead_id:lead,vacancy_id:vacancyId,unit_id:unit}).select().single()
 expect(duplicate.error.message).toContain('already has')
 const result=await client.from('rental_applications').update({application_data:{...application.data,property:{...application.data.property,listingId:randomUUID()}},version:application.version+1}).eq('id',application.id).select().single()
 expect(result.error.message).toMatch(/listing/)
})
it('rolls the new application back if its lead connection cannot save',async()=>{
 const id=randomUUID()
 // Historical lead fixture; adding a new live journey remains phase 1 guarded.
 await db.exec('alter table leads disable trigger zz_rental_lead_journey_guard')
 await db.query("insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,raw_enquiry_payload) select $1,organisation_id,contact_id,assigned_agent_id,raw_enquiry_payload-'relationships' from leads where lead_id=$2",[id,lead])
 await db.exec('alter table leads enable trigger zz_rental_lead_journey_guard')
 await db.exec(`create function test_refuse_lead_update() returns trigger language plpgsql as $$ begin raise exception 'Local lead save refused'; end $$; create trigger test_refuse_lead_update before update on leads for each row execute function test_refuse_lead_update();`)
 await expect(prepareRentalTenantApplication(org,id,vacancyId,{client})).rejects.toThrow('Local lead save refused')
 expect((await db.query('select count(*)::int total from rental_applications where lead_id=$1',[id])).rows[0].total).toBe(0)
 await db.exec('drop trigger test_refuse_lead_update on leads')
})
it.each([{role:'landlord',category:'seller',stage:'application_pending'},{role:'tenant',category:'buyer',stage:'qualified'},{role:'tenant',category:'buyer',stage:'application_pending',sales:true}])('rejects a wrong role, sales lead or premature stage: %j',async row=>{
 const id=randomUUID();await db.exec('alter table leads disable trigger zz_rental_lead_journey_guard')
 await db.query('insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,lead_category,raw_enquiry_payload) values($1,$2,$3,$4,$5,$6)',[id,org,tenant,actor,row.category,JSON.stringify(row.sales?{}:{arch9RentalLead:true,classification:'rental',role:row.role,stage:row.stage})])
 await db.exec('alter table leads enable trigger zz_rental_lead_journey_guard')
 await expect(prepareRentalTenantApplication(org,id,vacancyId,{client})).rejects.toThrow(/separate tenant|Application pending/)
})
it('rotates the main invitation and metadata together',async()=>{
 const first=await issueRentalTenantApplicationInvite(application,{client})
 expect(first.application.data.onboarding.accessId).toBe(first.id)
 const second=await issueRentalTenantApplicationInvite(first.application,{client})
 const rows=(await db.query('select id,revoked_at from rental_application_access_tokens where application_id=$1',[application.id])).rows
 expect(rows.find(row=>row.id===first.id).revoked_at).toBeTruthy()
 await expect(issueRentalTenantApplicationInvite(first.application,{client})).rejects.toThrow('changed')
 expect((await db.query('select count(*)::int total from rental_application_access_tokens where application_id=$1',[application.id])).rows[0].total).toBe(2)
 application=second.application
})
it('rolls invitation replacement back when its metadata write fails',async()=>{
 await db.exec(`create function test_refuse_application_update() returns trigger language plpgsql as $$ begin raise exception 'Local application save refused'; end $$;create trigger test_refuse_application_update before update on rental_applications for each row execute function test_refuse_application_update();`)
 const before=(await db.query('select id,revoked_at from rental_application_access_tokens where application_id=$1 order by id',[application.id])).rows
 await expect(issueRentalTenantApplicationInvite(application,{client})).rejects.toThrow('Local application save refused')
 expect((await db.query('select id,revoked_at from rental_application_access_tokens where application_id=$1 order by id',[application.id])).rows).toEqual(before)
 await db.exec('drop trigger test_refuse_application_update on rental_applications')
})
it('rejects anonymous preparation and browser use of the consent/submission command',async()=>{
 await db.exec('set role anon');await expect(db.query('select rental_prepare_tenant_application($1,$2,$3)',[org,lead,vacancyId])).rejects.toThrow('permission');await db.exec('reset role')
 expect((await client.rpc('rental_submit_tenant_application',{p_application_id:application.id,p_expected_version:application.version,p_declaration_accepted:true,p_consents:['privacy','credit_check','identity_verification']})).error.message).toContain('permission')
})

it('preserves the original enquiry when the tenant explicitly applies for another listing',async()=>{
 const id=randomUUID(),original=randomUUID()
 await db.query('insert into private_listings(id,organisation_id,assigned_agent_id,title,seller_canonical_facts_json) values($1,$2,$3,$4,$5)',[original,org,actor,'Original enquiry home',JSON.stringify({propertyId:property,unitId:unit})])
 await db.exec('alter table leads disable trigger zz_rental_lead_journey_guard')
 await db.query("insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,enquired_listing_id,raw_enquiry_payload) values($1,$2,$3,$4,$5,$6)",[id,org,tenant,actor,original,JSON.stringify({arch9RentalLead:true,role:'tenant',stage:'application_pending',relationships:{listingId:original}})])
 await db.exec('alter table leads enable trigger zz_rental_lead_journey_guard')
 const saved=await prepareRentalTenantApplication(org,id,vacancyId,{client})
 expect(saved.data.property.listingId).toBe(listing)
 expect((await db.query('select raw_enquiry_payload from leads where lead_id=$1',[id])).rows[0].raw_enquiry_payload.relationships).toMatchObject({listingId:listing,enquiryListingId:original,applicationId:saved.id})
})
it('links an earlier submitted application without rewriting its signed answers or saved uploads',async()=>{
 const id=randomUUID(),appId=randomUUID(),documentId=randomUUID(),snapshot={property:{title:'Earlier signed title'},identity:{firstName:'Original'}}
 await db.transaction(async tx=>{
  // Historical fixture predates these linking guards and the schema v2 checklist.
  await tx.exec('set local session_replication_role=replica')
  await tx.query('insert into leads(lead_id,organisation_id,contact_id,assigned_agent_id,raw_enquiry_payload) values($1,$2,$3,$4,$5)',[id,org,tenant,actor,JSON.stringify({arch9RentalLead:true,role:'tenant',stage:'application_pending'})])
  await tx.query("insert into rental_applications(id,organisation_id,lead_id,vacancy_id,unit_id,status,application_data,submitted_snapshot_json,submitted_at) values($1,$2,$3,$4,$5,'submitted',$6,$6,now())",[appId,org,id,vacancyId,unit,JSON.stringify(snapshot)])
  await tx.query("insert into rental_application_documents(id,application_id,organisation_id,document_type,file_name,storage_path) values($1,$2,$3,'identity','original.pdf','private/original.pdf')",[documentId,appId,org])
 })
 const before=(await db.query('select * from rental_applications where id=$1',[appId])).rows[0]
 expect((await prepareRentalTenantApplication(org,id,vacancyId,{client})).id).toBe(appId)
 expect((await db.query('select * from rental_applications where id=$1',[appId])).rows[0]).toEqual(before)
 expect((await db.query('select storage_path from rental_application_documents where id=$1',[documentId])).rows[0].storage_path).toBe('private/original.pdf')
})

it('saves consent and submission together, accepts safe retries, and retains later uploaded evidence',async()=>{
 const {rentalApplicationFieldScenario}=await import('./fixtures/rentalApplicationFieldScenario.js')
 const {handlePublicRentalApplication}=await import('../services/publicRentalApplicationApi.js')
 const {savePersistedRentalApplication,createPersistedRentalApplicantAccess,recordRentalApplicationReview}=await import('../../src/services/rentals/rentalApplicationRepository.js')
 const data=rentalApplicationFieldScenario('joint_individuals');data.property=application.data.property
 application=await savePersistedRentalApplication(application,data,{client})
 const invitation=await issueRentalTenantApplicationInvite(application,{client});application=invitation.application
 const files=new Map(),storage={from:()=>({upload:async(path,bytes)=>{files.set(path,bytes);return {data:{}}},remove:async paths=>{paths.forEach(path=>files.delete(path));return {}}})}
 const server=rentalOnboardingClient(db,storage,actor)
 const request=(method,body)=>handlePublicRentalApplication({token:invitation.token,method,body,env:{SUPABASE_URL:'https://local.test',SUPABASE_SERVICE_ROLE_KEY:'local-only'},clientFactory:()=>server})
 let response=await request('PATCH',{action:'confirm_context',version:application.version,propertyAccepted:true,costsAccepted:true,privacyAccepted:true});expect(response.status,JSON.stringify(response.body)).toBe(200)
 let current=response.body.application
 const submit={action:'submit',version:current.version,declarationAccepted:true,consents:['privacy','credit_check','identity_verification']}
 await db.exec(`create function test_refuse_submission() returns trigger language plpgsql as $$ begin if new.status='submitted' then raise exception 'Local submission refused'; end if;return new;end $$;create trigger test_refuse_submission before update on rental_applications for each row execute function test_refuse_submission();`)
 const refused=await request('PUT',submit);expect(refused.status).toBe(400)
 expect((await db.query('select count(*)::int total from rental_application_consents where application_id=$1',[application.id])).rows[0].total).toBe(0)
 expect((await db.query('select version,status from rental_applications where id=$1',[application.id])).rows[0]).toEqual({version:current.version,status:'draft'})
 await db.exec('drop trigger test_refuse_submission on rental_applications')
 response=await request('PUT',submit);expect(response.status,JSON.stringify(response.body)).toBe(200);current=response.body.application
 expect(current.status).toBe('submitted')
 const consentBefore=(await db.query('select * from rental_application_consents where application_id=$1 order by consent_type',[application.id])).rows
 expect(consentBefore).toHaveLength(3)
 for(const consent of consentBefore) expect(new Date(consent.accepted_at).toISOString()).toBe(new Date(current.submittedAt).toISOString())
 const retried=await request('PUT',submit);expect(retried.status).toBe(200);expect(retried.body.application.version).toBe(current.version)
 expect((await db.query('select * from rental_application_consents where application_id=$1 order by consent_type',[application.id])).rows).toEqual(consentBefore)
 expect((await request('PATCH',{version:current.version,patch:{identity:{firstName:'Changed signed answer'}}})).status).toBe(409)
 const requirement=current.requirements.find(item=>item.subjectId==='primary'&&item.purpose==='identity'&&item.active)
 expect(requirement).toBeTruthy()
 const upload=await request('POST',{version:current.version,subjectId:requirement.subjectId,purpose:requirement.purpose,requirementId:requirement.id,generation:requirement.generation,fileName:'identity.pdf',mimeType:'application/pdf',contentBase64:Buffer.from('Local uploaded identity evidence').toString('base64')})
 expect(upload.status,JSON.stringify(upload.body)).toBe(201)
 const reopened=await request('GET');expect(reopened.status).toBe(200)
 expect(reopened.body.application.requirements.find(item=>item.id===requirement.id).documentId).toBe(upload.body.document.id)
 expect(reopened.body.application.data.identity.firstName).toBe(data.identity.firstName)
 const before=(await db.query('select application_data,submitted_snapshot_json from rental_applications where id=$1',[application.id])).rows[0]
 expect((await prepareRentalTenantApplication(org,lead,vacancyId,{client})).id).toBe(application.id)
 expect((await db.query('select application_data,submitted_snapshot_json from rental_applications where id=$1',[application.id])).rows[0]).toEqual(before)
 // A correction can reopen the draft after participant access was already issued.
 const participant=await createPersistedRentalApplicantAccess(application.id,{subjectId:'additional-person',createdBy:actor,client})
 await recordRentalApplicationReview({applicationId:application.id,expectedVersion:reopened.body.application.version,command:'request_changes',payload:{message:'Correct your phone'}},{client})
 const corrected=await prepareRentalTenantApplication(org,lead,vacancyId,{client})
 const replacement=await issueRentalTenantApplicationInvite(corrected,{client})
 expect((await db.query('select revoked_at from rental_application_access_tokens where id=$1',[participant.id])).rows[0].revoked_at).toBeNull()
 const {revokeRentalTenantApplicationInvite}=await import('../../src/services/rentals/rentalTenantApplicationService.js')
 const revoked=await revokeRentalTenantApplicationInvite(replacement.application,{client})
 expect(revoked.data.onboarding.revokedAt).toBeTruthy()
 expect((await db.query('select revoked_at from rental_application_access_tokens where id=$1',[replacement.id])).rows[0].revoked_at).toBeTruthy()
 expect((await db.query('select revoked_at from rental_application_access_tokens where id=$1',[participant.id])).rows[0].revoked_at).toBeNull()
})

it('rejects unlinked browser applications and a contact belonging to another journey',async()=>{
 const unlinked=await client.from('rental_applications').insert({organisation_id:org,vacancy_id:vacancyId,unit_id:unit}).select().single()
 expect(unlinked.error.message).toContain('separate tenant lead')
 const wrongContact=await client.from('rental_applications').insert({organisation_id:org,lead_id:lead,vacancy_id:vacancyId,unit_id:unit,applicant_party_id:actor}).select().single()
 expect(wrongContact.error.message).toContain('contact must match')
})
