import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { rentalOnboardingDatabase, actor, org, property, unit, vacancy } from './fixtures/rentalOnboardingDatabase.js'

const id = n => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12,'0')}`
const migration = readFileSync(new URL('../../../supabase/migrations/20261014185302_rental_lead_journey_guards.sql',import.meta.url),'utf8')
const contactActionMigration = readFileSync(new URL('../../../supabase/migrations/20261015074830_rental_landlord_next_action_contact_step.sql',import.meta.url),'utf8')
const submittedAt = '2026-10-14T08:00:00.000Z'
let db
const row = async n => (await db.query('select * from leads where lead_id=$1',[id(n)])).rows[0]
async function patch(n,payload,stage) {
  return db.query('update leads set raw_enquiry_payload=$1::jsonb,stage=coalesce($2,stage) where lead_id=$3 returning *',[JSON.stringify(payload),stage || null,id(n)])
}
async function advance(n,stage,values={}) {
  const current = (await row(n)).raw_enquiry_payload
  const event = { stage,recordedAt:submittedAt,recordedBy:actor,...values.evidence }
  const payload = { ...current,...values,stage,workflow:{lastEvent:event,events:[...(current.workflow?.events || []),event]} }
  delete payload.evidence
  return patch(n,payload,stage)
}
const relationships = n => ({applicationId:id(30+n),vacancyId:vacancy,unitId:unit})
const qualification = {monthlyBudget:11000,desiredArea:'Montana',occupationDate:'2026-11-01',employmentStatus:'Employed',depositAvailable:'No',screeningConsent:'Yes',propertyNeed:'Apartment',occupants:2,pets:'No pets',additionalNotes:'Call completed'}

beforeAll(async()=>{
  db=await rentalOnboardingDatabase()
  await db.exec(`alter table leads add column lead_domain text default 'agency',add column lead_category text default 'buyer',add column lead_source text default 'Manual',add column source_channel text,add column stage text default 'New Lead',add column listing_id text,add column enquired_listing_id uuid,add column seller_property_address text,add column assigned_agent_id uuid;
    alter table private_listings add column listing_category text,add column seller_type text default 'individual',add column seller_lead_id text,add column originating_crm_lead_id text,add column updated_at timestamptz;
    alter table leads add column contact_id uuid,add column updated_at timestamptz;
    create table contacts(contact_id uuid,organisation_id uuid);
    grant select on contacts to authenticated;
    grant update on private_listings to authenticated;
    create function bridge_can_access_private_listing(listing_id uuid) returns boolean language sql as $$ select auth.uid()='${actor}'::uuid and exists(select 1 from public.private_listings where id=listing_id and organisation_id='${org}'::uuid) $$;
    alter table rental_property_mandates add column authority_status text;
    create table listing_publication_data(listing_id uuid,listing_type text);
    create table private_listing_activity(id uuid primary key,private_listing_id uuid,activity_type text,metadata jsonb);
    grant select on private_listings,listing_publication_data,private_listing_activity,rental_property_mandates to authenticated;
    grant select,insert,update on leads to authenticated;
    grant update on rental_applications to authenticated;
    alter table leads enable row level security;
    create policy lead_scope on leads to authenticated using(rental_branch_access(organisation_id,branch_id)) with check(rental_branch_access(organisation_id,branch_id));
    insert into private_listings(id,organisation_id,listing_category) values('${id(20)}','${org}','rental'),('${id(21)}','${org}','private_sale');`)
  const stages={1:'new',2:'new',4:'contacted',5:'application_pending',6:'application_submitted',7:'screening_pending',8:'fica_pending',9:'fica_complete',10:'mandate_pending',11:'listing_ready',12:'qualified',16:'contacted',17:'contacted'}
  for(const [n,stage] of Object.entries(stages)) {
    const role=[2,10,11,16,17].includes(Number(n))?'landlord':'tenant'
    await db.query('insert into leads(lead_id,organisation_id,lead_category,raw_enquiry_payload,stage) values($1,$2,$3,$4::jsonb,$5)',[id(n),org,role==='landlord'?'seller':'buyer',JSON.stringify({classification:'rental',role,stage,custom:'preserved'}),stage])
  }
  await db.query('insert into leads(lead_id,organisation_id,lead_category,raw_enquiry_payload) values($1,$2,$3,$4::jsonb)',[id(3),org,'seller',JSON.stringify({classification:'sale'})])
  await db.query('insert into leads(lead_id,organisation_id,lead_category,raw_enquiry_payload,listing_id,enquired_listing_id) values($1,$2,$3,$4::jsonb,$5,$6)',[id(14),org,'seller',JSON.stringify({arch9RentalLead:'true',role:'landlord',stage:'new'}),id(21),id(21)])
  // These are pre-existing application snapshots for the lead guard, not an
  // application approval test. Restore the real parent guards before testing.
  await db.exec('alter table rental_applications disable trigger user')
  for(const n of [5,6,7,8,9]) {
    await db.query('insert into rental_applications(id,organisation_id,lead_id,vacancy_id,unit_id,status,application_data,submitted_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',[id(30+n),org,id(n),vacancy,unit,n===5?'draft':'under_review',JSON.stringify({entity:{type:'individual'},identity:{firstName:'Fixture',lastName:'Tenant'}}),submittedAt])
  }
  await db.query('insert into rental_applications(id,organisation_id,lead_id,vacancy_id,unit_id,status,application_data,submitted_at) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8)',[id(49),org,id(9),vacancy,unit,'approved',JSON.stringify({entity:{type:'individual'},identity:{firstName:'Approved',lastName:'Tenant'}}),submittedAt])
  await db.exec('alter table rental_applications enable trigger user')
  // Standing mandate snapshot: collection/disclosure acceptance is covered by
  // the existing onboarding tests. Keep those real gates enabled during tests.
  await db.exec('alter table rental_property_mandates disable trigger user')
  await db.query('insert into rental_property_mandates(id,organisation_id,property_id,mandate_status,authority_status,metadata_json) values($1,$2,$3,$4,$5,$6::jsonb)',[id(71),org,property,'active','confirmed',JSON.stringify({leadId:id(10),signedAt:submittedAt,signedEvidenceReference:'uploaded-mandate'})])
  await db.exec('alter table rental_property_mandates enable trigger user')
  const classifier=readFileSync(new URL('../../../supabase/migrations/20261007155955_property24_unlinked_rental_lead_classification.sql',import.meta.url),'utf8')
  await db.exec(classifier.slice(classifier.indexOf('create or replace function public.classify_new_rental_lead()'),classifier.indexOf('revoke all on function public.classify_new_rental_lead()')))
  await db.exec('create trigger classify_new_rental_lead before insert on leads for each row execute function classify_new_rental_lead()')
  await db.exec(readFileSync(new URL('../../../supabase/migrations/20261014114244_separate_rental_leads_from_seller_linking.sql',import.meta.url),'utf8'))
  await db.exec(migration)
  await db.exec(contactActionMigration)
  await db.query("select set_config('test.actor',$1,false)",[actor])
  await db.exec('set role authenticated')
},30000)
afterAll(async()=>{await db?.close()})
afterEach(async()=>{
  if(!db) return
  await db.exec('reset role')
  await db.query("select set_config('test.actor',$1,false)",[actor])
  await db.exec('set role authenticated')
})

it('keeps shared contacts possible while rejecting removed rental markers and role/category changes',async()=>{
  const before=await row(1)
  await expect(patch(1,{classification:'sale'})).rejects.toThrow('classification cannot be removed')
  await expect(patch(1,{...before.raw_enquiry_payload,role:'landlord'})).rejects.toThrow(/category|switch/)
  await expect(db.query("update leads set lead_category='seller' where lead_id=$1",[id(1)])).rejects.toThrow('category must match')
  expect((await row(1)).raw_enquiry_payload).toEqual(before.raw_enquiry_payload)
})
it('does not accept imported completion history on a new rental lead',async()=>{
  await expect(db.query('insert into leads(lead_id,organisation_id,raw_enquiry_payload) values($1,$2,$3::jsonb)',[id(99),org,JSON.stringify({classification:'rental',role:'tenant',stage:'new',workflow:{events:[{stage:'placement_ready'}]}})])).rejects.toThrow('cannot import completed milestones')
})
it('leaves genuine sales leads and their stages outside the rental guard',async()=>{
  await patch(3,{classification:'sale',note:'updated'},'Mandate Signed')
  expect((await row(3)).stage).toBe('Mandate Signed')
  await expect(db.query('update leads set enquired_listing_id=$1 where lead_id=$2',[id(20),id(3)])).rejects.toThrow('separate tenant or landlord lead')
  await db.query('update leads set listing_id=$1 where lead_id=$2',['legacy-sale-reference',id(3)])
  expect((await row(3)).listing_id).toBe('legacy-sale-reference')
})
it('blocks a historical rental in the atomic seller-link command even when its legacy listing columns already match',async()=>{
  await expect(db.query('select bridge_link_listing_seller_lead($1,$2,$3)',[id(21),id(14),org])).rejects.toThrow('Rental landlord and tenant leads cannot be linked')
  expect((await db.query('select seller_lead_id from private_listings where id=$1',[id(21)])).rows[0].seller_lead_id).toBeNull()
})
it('uses the existing website, PP and P24 classifier and flattens nested rental markers',async()=>{
  for(const [n,source,channel,payload,listing,category] of [
    [50,'Website','website',{attribution:{leadIntent:'rent'}},null,'buyer'],
    [51,'Website','website',{attribution:{leadIntent:'let'}},null,'seller'],
    [52,'Property24',null,{listingType:'Rental'},null,'buyer'],
    [53,'Private Property','private_property',{},id(20),'buyer'],
    [54,'Manual',null,{rentalCrm:{arch9RentalLead:'true',role:'landlord',stage:'new'}},null,'seller'],
  ]) {
    await db.query('insert into leads(lead_id,organisation_id,lead_category,lead_source,source_channel,raw_enquiry_payload,enquired_listing_id) values($1,$2,$3,$4,$5,$6::jsonb,$7)',[id(n),org,category,source,channel,JSON.stringify(payload),listing])
    const saved=(await row(n)).raw_enquiry_payload
    expect(saved.arch9RentalLead).toBe(true)
    expect(saved.rentalCrm).toBeUndefined()
    expect(saved.organisationId).toBe(org)
  }
})
it('rejects sales/foreign listing links and arbitrary stage skips without partial writes',async()=>{
  await expect(db.query('update leads set enquired_listing_id=$1 where lead_id=$2',[id(21),id(1)])).rejects.toThrow('sales or unavailable')
  await expect(patch(2,{...(await row(2)).raw_enquiry_payload,relationships:{listingId:id(21)}})).rejects.toThrow('sales or unavailable')
  await expect(advance(1,'qualified')).rejects.toThrow('one step')
  expect((await row(1)).enquired_listing_id).toBeNull()
  expect((await row(1)).raw_enquiry_payload.stage).toBe('new')
})
it('retains milestone history and rejects stale overwrite after an accepted stage',async()=>{
  const stale=(await row(1)).raw_enquiry_payload
  await advance(1,'contacted')
  const saved=(await row(1)).raw_enquiry_payload
  await expect(patch(1,{...stale,stage:'contacted'},'contacted')).rejects.toThrow('journey changed')
  expect((await row(1)).raw_enquiry_payload).toEqual(saved)
})
it('records the authenticated actor and database time rather than a supplied audit identity',async()=>{
  await advance(2,'contacted',{evidence:{recordedBy:id(99),recordedAt:'2000-01-01T00:00:00Z'}})
  const event=(await row(2)).raw_enquiry_payload.workflow.lastEvent
  expect(event.recordedBy).toBe(actor)
  expect(event.recordedAt).not.toBe('2000-01-01T00:00:00Z')
})
it('requires complete saved qualification, including explicit no answers',async()=>{
  await expect(advance(4,'qualified',{evidence:{qualificationOutcome:'qualified'}})).rejects.toThrow('complete tenant qualification')
  await advance(4,'qualified',{qualification,evidence:{qualificationOutcome:'qualified'}})
  expect((await row(4)).raw_enquiry_payload.qualification.depositAvailable).toBe('No')
})
it('requires this tenant’s saved appointment and attended outcome',async()=>{
  const evidence={viewingId:id(80),scheduledFor:submittedAt}
  await expect(advance(12,'viewing_scheduled',{evidence})).rejects.toThrow('linked viewing')
  await db.exec('reset role')
  await db.query('insert into private_listing_activity values($1,$2,$3,$4::jsonb)',[id(80),id(20),'rental_viewing_scheduled',JSON.stringify({tenantLeadId:id(12),startsAt:submittedAt})])
  await db.exec('set role authenticated')
  await advance(12,'viewing_scheduled',{evidence})
  await expect(advance(12,'viewing_completed',{evidence})).rejects.toThrow('attended outcome')
  await db.exec('reset role')
  await db.query('insert into private_listing_activity values($1,$2,$3,$4::jsonb)',[id(81),id(20),'rental_viewing_outcome',JSON.stringify({tenantLeadId:id(12),viewingId:id(80),outcome:'attended'})])
  await db.exec('set role authenticated')
  await advance(12,'viewing_completed',{evidence})
})
it('does not treat a draft or another tenant application as submitted evidence',async()=>{
  await expect(advance(5,'application_submitted',{relationships:relationships(5)})).rejects.toThrow('must submit')
  await expect(advance(5,'application_submitted',{relationships:relationships(6)})).rejects.toThrow('must submit')
  expect((await row(5)).raw_enquiry_payload.stage).toBe('application_pending')
  await advance(6,'screening_pending',{relationships:relationships(6)})
})
it('checks all current screening subjects before FICA, and current FICA evidence before completion',async()=>{
  await expect(advance(7,'fica_pending',{relationships:relationships(7)})).rejects.toThrow('current identity review')
  await expect(advance(8,'fica_complete',{relationships:relationships(8)})).rejects.toThrow('current fica review')
  await db.exec('reset role')
  for(const [n,kinds] of [[7,['identity','affordability','employment','reference']],[8,['fica']]]) {
    for(const kind of kinds) await db.query('insert into rental_application_screening_checks(application_id,organisation_id,check_type,status,result_json) values($1,$2,$3,$4,$5::jsonb)',[id(30+n),org,kind,'passed',JSON.stringify({subjects:{primary:{status:'passed',reviewedBy:actor,evidenceNote:'Reviewed uploaded evidence',submissionAt:submittedAt,expiresAt:'2099-01-01'}}})])
  }
  await db.exec('set role authenticated')
  await advance(7,'fica_pending',{relationships:relationships(7)})
  await advance(8,'fica_complete',{relationships:relationships(8)})
})
it('requires actual application approval for placement readiness',async()=>{
  await expect(advance(9,'placement_ready',{relationships:relationships(9)})).rejects.toThrow('Approve the linked application')
  await advance(9,'placement_ready',{relationships:{...relationships(9),applicationId:id(49)}})
  expect((await row(9)).raw_enquiry_payload.stage).toBe('placement_ready')
})
it('requires a saved signed mandate and a rental listing for landlord milestones',async()=>{
  await expect(advance(10,'mandate_signed',{relationships:{propertyId:id(70),mandateId:id(71)}})).rejects.toThrow('signed mandate')
  await expect(advance(11,'listing_created',{relationships:{listingId:id(21)}})).rejects.toThrow('sales or unavailable')
  await advance(10,'mandate_signed',{relationships:{propertyId:property,mandateId:id(71)}})
  await advance(11,'listing_created',{relationships:{listingId:id(20)}})
})
it('retains RLS denial and does not expose its trigger as a browser RPC',async()=>{
  await db.query("select set_config('test.actor',$1,false)",[id(99)])
  expect((await db.query('select * from leads')).rows).toEqual([])
  expect((await db.query('update leads set stage=$1 where lead_id=$2 returning *',['contacted',id(2)])).rows).toEqual([])
  await db.query("select set_config('test.actor',$1,false)",[actor])
  expect((await db.query("select has_function_privilege('authenticated','rental_guard_lead_journey()','EXECUTE') allowed")).rows[0].allowed).toBe(false)
})

it('lets confirmed landlord contact open the appraisal step before scheduling, without weakening scheduled-time evidence', async () => {
  await expect(advance(17,'appraisal_scheduled')).rejects.toThrow('appraisal time')
  await advance(16,'appraisal_scheduled',{evidence:{actionKey:'mark_contacted',note:'Landlord contact confirmed.'}})
  const saved=await row(16)
  expect(saved.raw_enquiry_payload.workflow.lastEvent).toMatchObject({stage:'appraisal_scheduled',actionKey:'mark_contacted',recordedBy:actor})
  expect(saved.raw_enquiry_payload.workflow.lastEvent.scheduledFor).toBeUndefined()
  await expect(advance(16,'appraisal_completed')).rejects.toThrow('appraisal milestone note')
  await advance(16,'appraisal_completed',{evidence:{note:'Appraisal marked complete by agent.'}})
})
