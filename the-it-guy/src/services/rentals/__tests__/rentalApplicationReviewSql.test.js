import { beforeAll, afterAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const root = new URL('../../../../../supabase/migrations/', import.meta.url)
const actor = '11111111-1111-4111-8111-111111111111'
const org = '22222222-2222-4222-8222-222222222222'
const property = '33333333-3333-4333-8333-333333333333'
const unit = '44444444-4444-4444-8444-444444444444'
const vacancy = '55555555-5555-4555-8555-555555555555'
const app = '66666666-6666-4666-8666-666666666666'
let db
let version = 1
const data = { entity: { type: 'joint_individuals' }, identity: { firstName: 'Alex', lastName: 'Tenant' }, people: [{ id: 'guarantor-1', role: 'guarantor', firstName: 'Sam', lastName: 'Support' }], household: { intendedOccupationDate: '2026-11-01', leasePeriodMonths: 12 }, income: { monthlyIncome: 30000 }, contacts: { email: 'a@example.test' }, property: { monthlyRent: 11000 } }
const review = async (command, payload = {}, expected = version) => {
  const result = await db.query('select rental_record_application_review($1,$2,$3,$4::jsonb) result', [app, expected, command, JSON.stringify(payload)])
  version = result.rows[0].result.version
  return result.rows[0].result
}
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users(id uuid primary key); insert into auth.users values('${actor}');
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
  create table organisations(id uuid primary key); insert into organisations values('${org}');
  create table rental_properties(id uuid primary key,organisation_id uuid,branch_id uuid); insert into rental_properties values('${property}','${org}',null);
  create table rental_units(id uuid primary key,organisation_id uuid,status text,active_tenancy_id uuid); insert into rental_units values('${unit}','${org}','available',null);
  create table rental_vacancies(id uuid primary key,organisation_id uuid,property_id uuid,unit_id uuid,asking_rent numeric,deposit_amount numeric,lease_term_months integer); insert into rental_vacancies values('${vacancy}','${org}','${property}','${unit}',11000,22000,12);
  create function rental_branch_access(uuid,uuid) returns boolean language sql as $$ select auth.uid()='${actor}'::uuid and $1='${org}'::uuid $$;
  create function rental_set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at:=now(); return new; end $$;
  create table rental_applications(id uuid primary key,organisation_id uuid,vacancy_id uuid,unit_id uuid,lead_id uuid,applicant_party_id uuid,status text default 'draft',version integer default 1,application_data jsonb default '{}',submitted_snapshot_json jsonb,submitted_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
  create table rental_application_consents(id uuid primary key default gen_random_uuid(),application_id uuid,organisation_id uuid,consent_type text,wording_version text,accepted_at timestamptz default now(),source text default 'applicant',evidence_json jsonb);
  create table rental_application_documents(id uuid primary key default gen_random_uuid(),application_id uuid,organisation_id uuid,document_type text,status text default 'uploaded',file_name text,uploaded_at timestamptz default now(),created_at timestamptz default now(),review_note text,reviewed_by uuid,reviewed_at timestamptz);
  grant select,insert,update on rental_application_documents to authenticated; grant select,insert on rental_application_consents to authenticated;`)
  for (const file of ['20260905141017_rental_application_review_workspace.sql','20260905141018_rental_application_screening.sql','20260905141020_rental_application_decisions.sql','20260905141021_rental_application_tenancy_conversion.sql','20260913120000_rental_application_approval_readiness.sql','20261002213625_rental_application_review_and_handoff.sql']) await db.exec(readFileSync(new URL(file, root),'utf8'))
  await db.query('insert into rental_applications(id,organisation_id,vacancy_id,unit_id,application_data) values($1,$2,$3,$4,$5::jsonb)', [app,org,vacancy,unit,JSON.stringify(data)])
  const links = []
  for (const [subject,purpose,type] of [['primary','identity','identity'],['primary','proof_of_income','proof_of_income'],['guarantor-1','identity','identity'],['guarantor-1','signed_consent','other'],['guarantor-1','proof_of_income','proof_of_income']]) {
    const result = await db.query('insert into rental_application_documents(application_id,organisation_id,document_type,file_name) values($1,$2,$3,$4) returning id',[app,org,type,`${purpose}.pdf`]); links.push({ documentId: result.rows[0].id, subjectId: subject, purpose })
  }
  data.documentLinks = links
  await db.query("update rental_applications set application_data=$2::jsonb,status='submitted',submitted_at=now(),submitted_snapshot_json=$2::jsonb,version=2 where id=$1",[app,JSON.stringify(data)])
  version = 2
  await db.exec(`select set_config('test.actor','${actor}',false)`)
}, 20000)
afterAll(async () => { await db?.close() })
it('rejects absent authentication, out-of-scope actors and stale saves without audit rows', async () => {
  await db.exec("select set_config('test.actor','',false)")
  await expect(review('start_review')).rejects.toThrow('Authentication')
  await db.exec("select set_config('test.actor','77777777-7777-4777-8777-777777777777',false)")
  await expect(review('start_review')).rejects.toThrow('scope')
  await db.exec(`select set_config('test.actor','${actor}',false)`)
  await expect(review('start_review',{},1)).rejects.toThrow('changed')
  expect((await db.query('select count(*)::int count from rental_application_events')).rows[0].count).toBe(0)
})
it('locks submitted answers, blocks forged review metadata and incomplete approval atomically', async () => {
  await expect(db.query("update rental_applications set application_data=application_data||'{\"income\":{\"monthlyIncome\":99999}}'::jsonb where id=$1",[app])).rejects.toThrow('answers are locked')
  await expect(db.query("update rental_applications set application_data=application_data||'{\"review\":{\"landlordDecision\":{\"outcome\":\"approved\"}}}'::jsonb where id=$1",[app])).rejects.toThrow('reviewer command')
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('consents')
  expect((await db.query('select count(*)::int count from rental_application_decisions')).rows[0].count).toBe(0)
  await expect(db.query("update rental_applications set submitted_snapshot_json='{\"identity\":{\"firstName\":\"Forged\"}}'::jsonb where id=$1",[app])).rejects.toThrow('snapshot')
  await review('start_review')
})
it('reviews exact evidence and every guarantor check, rejects invalid or expired evidence', async () => {
  await expect(review('screening',{checkType:'identity',subjectId:'outsider',status:'passed',evidenceNote:'Viewed'})).rejects.toThrow('subject')
  await expect(review('screening',{checkType:'identity',subjectId:'primary',status:'passed',evidenceNote:'Viewed',expiresAt:'2000-01-01'})).rejects.toThrow('Expired')
  await expect(review('review_document',{documentId:data.documentLinks[0].documentId,status:'accepted',note:''})).rejects.toThrow('note')
  for (const link of data.documentLinks) await review('review_document',{documentId:link.documentId,status:'accepted',note:'Original evidence reviewed'})
  for (const kind of ['identity','fica','affordability','employment','reference']) for (const subject of ['primary','guarantor-1']) await review('screening',{checkType:kind,subjectId:subject,status:'passed',evidenceNote:'Evidence reviewed',expiresAt:'2099-01-01'})
  await db.query("insert into rental_application_consents(application_id,organisation_id,consent_type,wording_version,evidence_json) select id,organisation_id,kind,'test-current',jsonb_build_object('accepted',true,'submitted_at',submitted_at) from rental_applications cross join unnest(array['privacy','credit_check','identity_verification']) kind where id=$1",[app])
  await db.query("update rental_application_documents set status='uploaded' where id=$1",[data.documentLinks[0].documentId])
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('acceptance')
  await review('review_document',{documentId:data.documentLinks[0].documentId,status:'accepted',note:'Accepted original identity evidence'})
  await db.query("update rental_application_screening_checks set result_json=jsonb_set(result_json,'{subjects,guarantor-1,expiresAt}','\"2000-01-01\"'::jsonb) where application_id=$1 and check_type='identity'",[app])
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('Current screening')
  await review('screening',{checkType:'identity',subjectId:'guarantor-1',status:'passed',evidenceNote:'Renewed identity evidence checked',expiresAt:'2099-01-01'})
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('landlord')
  await review('landlord_response',{name:'Owner',outcome:'approved',channel:'written',note:'Written approval recorded'})
})
it('reopens corrections, keeps audit and invalidates old reviews, then requires a fresh submission', async () => {
  await review('request_changes',{message:'Please correct your occupation date.'})
  const result = (await db.query('select * from rental_applications where id=$1',[app])).rows[0]
  expect(result.status).toBe('draft'); expect(result.application_data.review.requestedChanges).toContain('occupation date')
  expect((await db.query("select count(*)::int count from rental_application_documents where status='accepted'")).rows[0].count).toBe(0)
  expect((await db.query("select count(*)::int count from rental_application_screening_checks where status='passed'")).rows[0].count).toBe(0)
  await expect(review('start_review')).rejects.toThrow('submitted')
  await expect(db.query("select rental_decide_application($1,$2,'declined','Cannot proceed','{}')",[app,version])).rejects.toThrow('submitted')
  await db.exec("select set_config('test.actor','',false)")
  await db.query("update rental_applications set status='submitted',submitted_at=clock_timestamp(),submitted_snapshot_json=application_data,version=version+1 where id=$1",[app]); version++
  await db.exec(`select set_config('test.actor','${actor}',false)`)
  expect((await db.query('select application_data from rental_applications where id=$1',[app])).rows[0].application_data.review).toBeUndefined()
  for (const link of data.documentLinks) await review('review_document',{documentId:link.documentId,status:'accepted',note:'Reviewed corrected submission'})
  for (const kind of ['identity','fica','affordability','employment','reference']) for (const subject of ['primary','guarantor-1']) await review('screening',{checkType:kind,subjectId:subject,status:'passed',evidenceNote:'Checked corrected submission'})
  await review('landlord_response',{name:'Owner',outcome:'approved',channel:'written',note:'Corrected application approved'})
  await expect(db.query("select rental_decide_application($1,$2,'approved','Ready','{}')",[app,version])).rejects.toThrow('Current applicant consent')
  await db.query("insert into rental_application_consents(application_id,organisation_id,consent_type,wording_version,evidence_json) select id,organisation_id,kind,'test-resubmission',jsonb_build_object('accepted',true,'submitted_at',submitted_at) from rental_applications cross join unnest(array['privacy','credit_check','identity_verification']) kind where id=$1",[app])
  await db.query("select rental_decide_application($1,$2,'approved','Reviewed evidence and owner approval','{}')",[app,version]); version++
  await expect(db.query("update rental_applications set status='draft',version=version+1 where id=$1",[app])).rejects.toThrow('locked')
})
it('creates exactly one lease draft with full answers and the correct occupation date on retry', async () => {
  const first = (await db.query('select rental_convert_application_to_tenancy($1,$2) result',[app,version])).rows[0].result
  const retry = (await db.query('select rental_convert_application_to_tenancy($1,$2) result',[app,1])).rows[0].result
  expect(retry.tenancy_id).toBe(first.tenancy_id); expect(retry.idempotent).toBe(true)
  const tenancy = (await db.query('select * from rental_tenancies')).rows[0]
  expect(new Date(tenancy.intended_occupation_date).toISOString().slice(0,10)).toBe('2026-11-01'); expect(tenancy.status).toBe('draft')
  expect(tenancy.tenant_snapshot_json.people).toEqual(data.people); expect(tenancy.tenant_snapshot_json.contacts).toEqual(data.contacts)
  expect(tenancy.tenant_snapshot_json.review).toBeUndefined()
  expect((await db.query('select count(*)::int count from rental_leases')).rows[0].count).toBe(1)
  expect((await db.query('select status from rental_leases')).rows[0].status).toBe('draft')
  expect((await db.query("select count(*)::int count from rental_application_events where event_type='tenancy_prepared'")).rows[0].count).toBe(1)
})
it('restricts direct screening writes and document acceptance to the reviewer command', async () => {
  const permissions = (await db.query("select has_table_privilege('authenticated','rental_application_screening_checks','INSERT') screening,has_table_privilege('authenticated','rental_application_documents','UPDATE') documents,has_table_privilege('authenticated','rental_application_consents','INSERT') consent,has_function_privilege('anon','rental_record_application_review(uuid,integer,text,jsonb)','EXECUTE') anonymous")).rows[0]
  expect(permissions).toEqual({screening:false,documents:false,consent:false,anonymous:false})
})
