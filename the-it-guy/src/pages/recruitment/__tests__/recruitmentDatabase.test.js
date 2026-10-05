import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
const org = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222'
const manager = '33333333-3333-4333-8333-333333333333', agent = '44444444-4444-4444-8444-444444444444'
const lead = '55555555-5555-4555-8555-555555555555', otherLead = '66666666-6666-4666-8666-666666666666'
let db
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`create role authenticated; create role anon; create role service_role;
    create schema auth; create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.actor',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create table organisations(id uuid primary key);
    create table organisation_users(organisation_id uuid,user_id uuid,status text,role text);
    grant select on organisation_users to authenticated;
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;
    create function storage.foldername(text) returns text[] language sql as $$ select string_to_array($1,'/') $$;
    insert into organisations values ('${org}'),('${other}');
    insert into organisation_users values ('${org}','${manager}','active','principal'),('${org}','${agent}','active','agent');`)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261005124526_recruitment_workspace.sql', import.meta.url), 'utf8'))
  await db.exec(`insert into recruitment_leads(id,organisation_id,name,email) values ('${lead}','${org}','Sam Agent','sam@example.test'),('${otherLead}','${other}','Other Candidate','other@example.test');
    insert into storage.objects(bucket_id,name,owner_id) values ('recruitment-documents','${org}/${lead}/cv','${manager}'),('recruitment-documents','${other}/${otherLead}/cv','${manager}');`)
}, 20000)
afterAll(async () => { await db?.close() })
async function asUser(id) { await db.exec(`reset role; select set_config('test.actor','${id}',false); set role authenticated;`) }
it('isolates recruitment and documents by organisation and management role', async () => {
  await asUser(manager)
  expect((await db.query('select name from recruitment_leads')).rows.map((row) => row.name)).toEqual(['Sam Agent'])
  expect((await db.query('select name from storage.objects')).rows).toHaveLength(1)
  await expect(db.exec(`insert into storage.objects(bucket_id,name) values ('recruitment-documents','${other}/${otherLead}/forged')`)).rejects.toThrow()
  await expect(db.exec(`insert into recruitment_leads(organisation_id,name) values ('${other}','Forbidden Candidate')`)).rejects.toThrow()
  await asUser(agent)
  expect((await db.query('select * from recruitment_leads')).rows).toHaveLength(0)
  expect((await db.query('select * from storage.objects')).rows).toHaveLength(0)
  await expect(db.exec(`insert into recruitment_leads(organisation_id,name) values ('${org}','Agent Cannot Add')`)).rejects.toThrow()
})
it('blocks anonymous access and suspended membership', async () => {
  await db.exec('reset role; set role anon;')
  await expect(db.query('select * from recruitment_leads')).rejects.toThrow()
  await db.exec(`reset role; update organisation_users set status='suspended' where user_id='${manager}';`)
  await asUser(manager)
  expect((await db.query('select * from recruitment_leads')).rows).toHaveLength(0)
  await db.exec(`reset role; update organisation_users set status='active' where user_id='${manager}';`)
})
it('advances the record version and rejects stale updates without overwriting data', async () => {
  await asUser(manager)
  expect((await db.query(`update recruitment_leads set status='joined' where id='${lead}' and version=1 returning version`)).rows[0].version).toBe(2)
  expect((await db.query(`update recruitment_leads set status='closed_lost' where id='${lead}' and version=1 returning id`)).rows).toHaveLength(0)
  expect((await db.query(`select status from recruitment_leads where id='${lead}'`)).rows[0].status).toBe('joined')
  await db.exec(`reset role; insert into organisation_users values ('${other}','${manager}','active','admin');`)
  await asUser(manager)
  await expect(db.exec(`update recruitment_leads set organisation_id='${other}' where id='${lead}'`)).rejects.toThrow('cannot move organisations')
  await expect(db.exec(`update recruitment_leads set status='made_up' where id='${lead}'`)).rejects.toThrow()
})

it('upgrades legacy records and enforces the Lead Received receipt and stage boundary', async () => {
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261005131321_recruitment_lead_received.sql', import.meta.url), 'utf8'))
  await asUser(manager)
  const legacy = (await db.query(`select * from recruitment_leads where id='${lead}'`)).rows[0]
  expect(legacy.status).toBe('legacy_joined')
  expect(legacy.details_json.legacyStage).toBe('joined')
  const captured = (await db.query(`insert into recruitment_leads(organisation_id,name,phone,source,activity_json,captured_by) values ('${org}','Referral Agent','0821234567','Referral','[{"type":"forged"}]','${agent}') returning *`)).rows[0]
  expect(captured.status).toBe('lead_received')
  expect(captured.captured_by).toBe(manager)
  expect(captured.activity_json).toMatchObject([{ type: 'lead_received', actorId: manager, source: 'Referral' }])
  expect(captured.received_at).toEqual(captured.created_at)
  await expect(db.exec(`update recruitment_leads set captured_by='${agent}' where id='${captured.id}'`)).rejects.toThrow('receipt details')
  await expect(db.exec(`update recruitment_leads set status='application_submitted' where id='${captured.id}'`)).rejects.toThrow('Later recruitment phases')
  await expect(db.exec(`insert into recruitment_leads(organisation_id,name,email,status) values ('${org}','Forged Approval','x@example.test','application_approved')`)).rejects.toThrow('must start')
  await expect(db.exec(`insert into recruitment_leads(organisation_id,name,email,intake_channel) values ('${org}','Website','x@example.test','website')`)).rejects.toThrow('Public intake')
  await expect(db.exec(`insert into recruitment_leads(organisation_id,name) values ('${org}','Missing Contact')`)).rejects.toThrow()
  await expect(db.exec(`insert into recruitment_leads(organisation_id,name,email,intake_key) values ('${org}','Duplicate','x@example.test','${captured.intake_key}')`)).rejects.toThrow()
  const closed = (await db.query(`update recruitment_leads set status='closed_lost', activity_json='[]' where id='${captured.id}' and version=1 returning *`)).rows[0]
  expect(closed.activity_json.map((event) => event.type)).toEqual(['lead_received','lead_closed'])
  expect(closed.version).toBe(2)
  expect((await db.query(`update recruitment_leads set name='Stale' where id='${captured.id}' and version=1 returning id`)).rows).toHaveLength(0)
  const reopened = (await db.query(`update recruitment_leads set status='lead_received' where id='${captured.id}' returning *`)).rows[0]
  expect(reopened.activity_json.map((event) => event.type)).toEqual(['lead_received','lead_closed','lead_reopened'])
  expect(reopened.received_at).toEqual(captured.received_at)
  await expect(db.exec(`update recruitment_leads set status='lead_received' where id='${lead}'`)).rejects.toThrow('Later recruitment phases')
})
it('accepts public and private applications atomically without widening anonymous access', async () => {
  await db.exec('reset role; alter role service_role bypassrls; grant usage on schema auth to service_role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261005132145_recruitment_application_submitted.sql', import.meta.url), 'utf8'))
  await asUser(manager)
  const seed = (await db.query(`insert into recruitment_leads(organisation_id,name,email,source,details_json) values('${org}','Manual Enquiry','old@example.test','Referral','{"notes":"Keep staff notes"}') returning *`)).rows[0]
  const privateLink = (await db.query(`insert into recruitment_intake_links(organisation_id,lead_id,token_hash,channel,expires_at) values('${org}','${seed.id}','${'a'.repeat(64)}','private_link',now()+interval '14 days') returning id`)).rows[0].id
  const publicLink = (await db.query(`insert into recruitment_intake_links(organisation_id,token_hash,channel,expires_at) values('${org}','${'b'.repeat(64)}','website',now()+interval '365 days') returning id`)).rows[0].id
  await expect(db.exec(`insert into recruitment_intake_links(organisation_id,lead_id,token_hash,channel,expires_at) values('${other}','${seed.id}','${'c'.repeat(64)}','private_link',now()+interval '14 days')`)).rejects.toThrow()
  await expect(db.query(`select recruitment_submit_application('${privateLink}',gen_random_uuid(),'{}','${'d'.repeat(64)}')`)).rejects.toThrow()
  await db.exec('reset role; set role anon;')
  await expect(db.query('select * from recruitment_intake_links')).rejects.toThrow()
  await expect(db.query('select * from recruitment_application_receipts')).rejects.toThrow()
  await db.exec(`reset role; select set_config('test.actor','',false); set role service_role;`)
  const answers = { name: 'Applicant Agent', email: 'applicant@example.test', phone: '0821234567', area: 'Pretoria', privacyAccepted: true, declarationAccepted: true }
  const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const submit = (id, submissionKey = key, payload = answers, fingerprint = 'd'.repeat(64)) => db.query('select recruitment_submit_application($1,$2,$3::jsonb,$4) as result', [id,submissionKey,JSON.stringify(payload),fingerprint])
  expect((await submit(privateLink)).rows[0].result).toEqual({ accepted: true, duplicate: false })
  expect((await submit(privateLink)).rows[0].result).toEqual({ accepted: true, duplicate: true })
  expect((await submit(privateLink,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).rows[0].result.alreadySubmitted).toBe(true)
  const submitted = (await db.query('select * from recruitment_leads where id=$1',[seed.id])).rows[0]
  expect(submitted.status).toBe('application_submitted')
  expect(submitted.intake_channel).toBe('manual')
  expect(submitted.received_at).toEqual(seed.received_at)
  expect(submitted.source).toBe('Referral')
  expect(submitted.details_json).toMatchObject({ notes: 'Keep staff notes', onboardingCaptured: true })
  expect(submitted.application_json.channel).toBe('private_link')
  expect(submitted.application_json.answers).toEqual(answers)
  expect(submitted.activity_json.map((event) => event.type)).toEqual(['lead_received','application_submitted'])
  expect((await submit(publicLink,'cccccccc-cccc-4ccc-8ccc-cccccccccccc')).rows[0].result.accepted).toBe(true)
  const website = (await db.query("select * from recruitment_leads where intake_channel='website'")).rows[0]
  expect(website.status).toBe('application_submitted')
  expect(website.captured_by).toBeNull()
  await asUser(manager)
  await expect(db.exec(`update recruitment_leads set application_json='{}' where id='${seed.id}'`)).rejects.toThrow('Join Us form')
  await expect(db.exec(`update recruitment_leads set status='application_approved' where id='${seed.id}'`)).rejects.toThrow('Later recruitment phases')
  await db.exec(`update recruitment_leads set status='closed_lost' where id='${seed.id}'; update recruitment_leads set status='application_submitted' where id='${seed.id}';`)
  expect((await db.query(`select status from recruitment_leads where id='${seed.id}'`)).rows[0].status).toBe('application_submitted')
  await expect(db.exec(`update recruitment_intake_links set token_hash='${'e'.repeat(64)}' where id='${privateLink}'`)).rejects.toThrow()
  await db.exec(`update recruitment_intake_links set revoked_at=now() where id='${publicLink}'; reset role; set role service_role;`)
  expect((await submit(publicLink)).rows[0].result.unavailable).toBe(true)
})
it('limits repeated application intake across links without counting successful retries twice', async () => {
  await asUser(manager)
  const id = (await db.query(`insert into recruitment_intake_links(organisation_id,token_hash,channel,expires_at) values('${org}','${'f'.repeat(64)}','public_link',now()+interval '365 days') returning id`)).rows[0].id
  await db.exec("reset role; set role service_role;")
  const answers = JSON.stringify({ name: 'Rate Agent', email: 'rate@example.test', phone: '0821234567', area: 'Cape Town', privacyAccepted: true, declarationAccepted: true })
  for (let i=0; i<5; i++) expect((await db.query('select recruitment_submit_application($1,gen_random_uuid(),$2::jsonb,$3) as result',[id,answers,'9'.repeat(64)])).rows[0].result.accepted).toBe(true)
  expect((await db.query('select recruitment_submit_application($1,gen_random_uuid(),$2::jsonb,$3) as result',[id,answers,'9'.repeat(64)])).rows[0].result.rateLimited).toBe(true)
})
let reviewing
it('starts review only for submitted applications with management access and a current version', async () => {
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261005133548_recruitment_under_review.sql', import.meta.url), 'utf8'))
  await asUser(manager)
  const application = (await db.query("select * from recruitment_leads where intake_channel='website' limit 1")).rows[0]
  await asUser(agent)
  await expect(db.query('select * from recruitment_start_review($1,$2,$3)',[org,application.id,application.version])).rejects.toThrow('changed or access')
  await db.exec('reset role; set role anon;')
  await expect(db.query('select * from recruitment_start_review($1,$2,$3)',[org,application.id,application.version])).rejects.toThrow()
  await asUser(manager)
  const enquiry = (await db.query(`insert into recruitment_leads(organisation_id,name,email) values('${org}','Not Submitted','waiting@example.test') returning *`)).rows[0]
  await expect(db.query('select * from recruitment_start_review($1,$2,$3)',[org,enquiry.id,enquiry.version])).rejects.toThrow('changed or access')
  await expect(db.exec(`update recruitment_leads set status='under_review' where id='${enquiry.id}'`)).rejects.toThrow('Later recruitment phases')
  reviewing = (await db.query('select * from recruitment_start_review($1,$2,$3)',[org,application.id,application.version])).rows[0]
  expect(reviewing.status).toBe('under_review')
  expect(reviewing.review_started_by).toBe(manager)
  expect(reviewing.review_status).toBe('in_progress')
  expect(Object.keys(reviewing.review_json.checks)).toHaveLength(4)
  expect(reviewing.application_json).toEqual(application.application_json)
  expect(reviewing.activity_json.at(-1)).toMatchObject({type:'review_started',actorId:manager,toStage:'under_review'})
  await expect(db.query('select * from recruitment_start_review($1,$2,$3)',[org,application.id,application.version])).rejects.toThrow('changed or access')
})
it('validates findings and document evidence and stamps each change without allowing forged audit details', async () => {
  await asUser(manager)
  const path = `${org}/${reviewing.id}/evidence`
  await db.exec(`insert into storage.objects(bucket_id,name,owner_id) values('recruitment-documents','${path}','${manager}');`)
  reviewing = (await db.query('update recruitment_leads set documents_json=$1::jsonb where id=$2 returning *',[JSON.stringify([{path,name:'ffc.pdf',type:'Registration evidence'}]),reviewing.id])).rows[0]
  let review = structuredClone(reviewing.review_json)
  review.documents = [{path,status:'pending',notes:''}]
  review.checks.registration = {status:'verified',notes:'',evidence:[path]}
  await expect(db.query('update recruitment_leads set review_json=$1::jsonb where id=$2',[JSON.stringify(review),reviewing.id])).rejects.toThrow('finding or reason')
  review.checks.registration = {status:'needs_information',notes:'Request the current FFC and renewal details',evidence:[`${other}/${otherLead}/cv`]}
  await expect(db.query('update recruitment_leads set review_json=$1::jsonb where id=$2',[JSON.stringify(review),reviewing.id])).rejects.toThrow('belonging to this lead')
  review.checks.registration.evidence = [path]
  review.checks.registration.updatedBy = agent; review.checks.registration.updatedAt = '1999-01-01'
  review.followUpOn = '2026-10-12'; review.notes = 'Awaiting registration clarification'
  const before = reviewing
  reviewing = (await db.query('update recruitment_leads set review_json=$1::jsonb,review_updated_by=$2,review_status=$3 where id=$4 and version=$5 returning *',[JSON.stringify(review),agent,'ready_for_approval',reviewing.id,reviewing.version])).rows[0]
  expect(reviewing.review_status).toBe('needs_information')
  expect(reviewing.review_updated_by).toBe(manager)
  expect(reviewing.review_json.checks.registration.updatedBy).toBe(manager)
  expect(reviewing.review_json.checks.registration.updatedAt).not.toContain('1999')
  expect(reviewing.review_json.checks.qualifications.updatedAt).toBe(before.review_json.checks.qualifications.updatedAt)
  expect(reviewing.activity_json.at(-1)).toMatchObject({type:'review_updated',reviewStatus:'needs_information'})
  expect((await db.query('update recruitment_leads set review_json=$1::jsonb where id=$2 and version=$3 returning id',[JSON.stringify(review),reviewing.id,before.version])).rows).toHaveLength(0)
  await expect(db.exec(`update recruitment_leads set review_started_by='${agent}' where id='${reviewing.id}'`)).rejects.toThrow('start details')
  await expect(db.exec(`update recruitment_leads set application_json='{}' where id='${reviewing.id}'`)).rejects.toThrow('Join Us form')
})
it('derives readiness from checks and documents, and preserves review on closure and reopening', async () => {
  await asUser(manager)
  const review = structuredClone(reviewing.review_json)
  for (const key of Object.keys(review.checks)) review.checks[key] = {status:'verified',notes:'Evidence and declarations reviewed by staff',evidence:[]}
  reviewing = (await db.query('update recruitment_leads set review_json=$1::jsonb where id=$2 returning *',[JSON.stringify(review),reviewing.id])).rows[0]
  expect(reviewing.review_status).toBe('in_progress')
  review.documents[0] = {...review.documents[0],status:'reviewed',notes:'File opened and checked against the declaration'}
  reviewing = (await db.query('update recruitment_leads set review_json=$1::jsonb where id=$2 returning *',[JSON.stringify(review),reviewing.id])).rows[0]
  expect(reviewing.review_status).toBe('ready_for_approval')
  expect(reviewing.status).toBe('under_review')
  await expect(db.exec(`update recruitment_leads set status='application_approved' where id='${reviewing.id}'`)).rejects.toThrow('Later recruitment phases')
  const startedAt = reviewing.review_started_at, saved = reviewing.review_json
  await db.exec(`update recruitment_leads set status='closed_lost' where id='${reviewing.id}';`)
  await expect(db.query('update recruitment_leads set review_json=$1::jsonb where id=$2',[JSON.stringify({...review,notes:'Changed while closed'}),reviewing.id])).rejects.toThrow('Under Review')
  reviewing = (await db.query(`update recruitment_leads set status='under_review' where id='${reviewing.id}' returning *`)).rows[0]
  expect(reviewing.review_started_at).toEqual(startedAt)
  expect(reviewing.review_json).toEqual(saved)
  expect(reviewing.activity_json.at(-1).type).toBe('lead_reopened')
  const path = `${org}/${reviewing.id}/new-evidence`
  await db.exec(`insert into storage.objects(bucket_id,name,owner_id) values('recruitment-documents','${path}','${manager}');`)
  reviewing = (await db.query('update recruitment_leads set documents_json=$1::jsonb where id=$2 returning *',[JSON.stringify([...reviewing.documents_json,{path,name:'qualification.pdf',type:'Qualifications'}]),reviewing.id])).rows[0]
  expect(reviewing.review_status).toBe('in_progress')
  expect(reviewing.review_json).toEqual(saved)
  await asUser(agent)
  expect((await db.query('update recruitment_leads set review_status=$1 where id=$2 returning id',['ready_for_approval',reviewing.id])).rows).toHaveLength(0)
  await db.exec("reset role; select set_config('test.actor','',false); set role service_role;")
  await expect(db.query('update recruitment_leads set review_json=$1::jsonb where id=$2',[JSON.stringify({...review,notes:'Server cannot impersonate a reviewer'}),reviewing.id])).rejects.toThrow('Under Review')
})

let approved
it('allows approval only from a resolved saved review with current version and organisation management access', async () => {
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261005134622_recruitment_application_approved.sql', import.meta.url), 'utf8'))
  await asUser(manager)
  const approve = (version=reviewing.version, organisation=org, notes='Reviewed evidence and agreed joining conditions') => db.query('select * from recruitment_approve_application($1,$2,$3,$4)',[organisation,reviewing.id,version,notes])
  await expect(approve()).rejects.toThrow('completed saved review')
  const review = structuredClone(reviewing.review_json)
  review.documents.push({path:`${org}/${reviewing.id}/new-evidence`,status:'reviewed',notes:'Qualification evidence checked by staff'})
  reviewing=(await db.query('update recruitment_leads set review_json=$1::jsonb where id=$2 returning *',[JSON.stringify(review),reviewing.id])).rows[0]
  expect(reviewing.review_status).toBe('ready_for_approval')
  await expect(approve(reviewing.version,other)).rejects.toThrow('changed or access')
  await expect(approve(reviewing.version,org,'')).rejects.toThrow('decision reason')
  await expect(approve(reviewing.version-1)).rejects.toThrow('changed or access')
  await asUser(agent)
  await expect(approve()).rejects.toThrow('changed or access')
  await db.exec('reset role; set role anon;')
  await expect(approve()).rejects.toThrow()
  await db.exec("reset role; select set_config('test.actor','',false); set role service_role;")
  await expect(approve()).rejects.toThrow('permission denied')
  await asUser(manager)
  // A removed file cannot be approved even if the saved finding says reviewed.
  const path=reviewing.documents_json[0].path
  await db.query('delete from storage.objects where name=$1',[path])
  await expect(approve()).rejects.toThrow('evidence is missing')
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-documents',$1,$2)",[path,manager])
  // Simultaneous review/decision updates cannot approve unsaved findings.
  await expect(db.query("update recruitment_leads set status='application_approved',approval_notes='Approve this candidate',review_json=$1::jsonb where id=$2",[JSON.stringify({...review,notes:'New unsaved notes'}),reviewing.id])).rejects.toThrow()
  approved=(await approve()).rows[0]
  expect(approved.status).toBe('application_approved')
  expect(approved.approved_by).toBe(manager)
  expect(approved.approved_at).toBeTruthy()
  expect(approved.approval_snapshot).toMatchObject({version:'recruitment-approval-v1',leadVersion:reviewing.version,application:reviewing.application_json,review:reviewing.review_json,documents:reviewing.documents_json})
  expect(approved.activity_json.at(-1)).toMatchObject({type:'application_approved',actorId:manager,fromStage:'under_review',toStage:'application_approved'})
  await expect(approve()).rejects.toThrow('changed or access')
})
it('preserves approval and evidence on edits and closure; keeps contracts and activation locked', async () => {
  await asUser(manager)
  for (const change of ["approved_by='"+agent+"'", "approved_at=now()+interval '1 day'", "approval_notes='Changed decision'", "approval_snapshot='{}'", "documents_json='[]'"]) await expect(db.exec(`update recruitment_leads set ${change} where id='${approved.id}'`)).rejects.toThrow()
  await expect(db.query('delete from recruitment_leads where id=$1 returning id',[approved.id])).rejects.toThrow('permission denied')
  expect((await db.query('delete from storage.objects where name=$1 returning name',[approved.documents_json[0].path])).rows).toHaveLength(0)
  await db.exec("reset role; grant update on storage.objects to authenticated; create policy test_storage_update on storage.objects for update to authenticated using (true) with check (true);")
  await asUser(manager)
  expect((await db.query('update storage.objects set name=$1 where name=$2 returning name',['renamed-file',approved.documents_json[0].path])).rows).toHaveLength(0)
  await expect(db.query('update recruitment_leads set review_json=$1::jsonb where id=$2',[JSON.stringify({...approved.review_json,notes:'Changed after approval'}),approved.id])).rejects.toThrow('Under Review')
  for (const stage of ['under_review','contract_sent','contract_signed','onboarding_complete','agent_activated']) await expect(db.query('update recruitment_leads set status=$1 where id=$2',[stage,approved.id])).rejects.toThrow('Later recruitment phases')
  const edited=(await db.query('update recruitment_leads set name=$1 where id=$2 returning *',['Corrected Agent Name',approved.id])).rows[0]
  expect(edited.approval_snapshot).toEqual(approved.approval_snapshot)
  expect(edited.approval_snapshot.agent.name).toBe(approved.name)
  await db.query("update recruitment_leads set status='closed_lost' where id=$1",[approved.id])
  await expect(db.query("update recruitment_leads set status='under_review' where id=$1",[approved.id])).rejects.toThrow('Later recruitment phases')
  const reopened=(await db.query("update recruitment_leads set status='application_approved' where id=$1 returning *",[approved.id])).rows[0]
  expect(reopened.approved_at).toEqual(approved.approved_at)
  expect(reopened.approval_snapshot).toEqual(approved.approval_snapshot)
  expect(reopened.activity_json.at(-1).type).toBe('lead_reopened')
  await expect(db.exec(`insert into recruitment_leads(organisation_id,name,email,approved_by) values('${org}','Forged','forge@example.test','${manager}')`)).rejects.toThrow('completed saved review')
})
it('authors approval stamps and snapshot itself and rejects approval from suspended management', async () => {
  await db.exec("reset role; select set_config('test.actor','',false); set role service_role;")
  const application=(await db.query(`insert into recruitment_leads(organisation_id,name,email,status,application_json) values($1,'Another Applicant','another@example.test','application_submitted',$2::jsonb) returning *`,[org,JSON.stringify({version:'recruitment-application-v1',answers:{privacyAccepted:true,declarationAccepted:true}})])).rows[0]
  await asUser(manager)
  let ready=(await db.query('select * from recruitment_start_review($1,$2,$3)',[org,application.id,application.version])).rows[0]
  const review=structuredClone(ready.review_json)
  for(const check of Object.values(review.checks)){check.status='not_applicable';check.notes='New entrant joining through the applicable training route'}
  ready=(await db.query('update recruitment_leads set review_json=$1::jsonb where id=$2 returning *',[JSON.stringify(review),ready.id])).rows[0]
  await db.exec(`reset role; update organisation_users set status='suspended' where user_id='${manager}';`)
  await asUser(manager)
  await expect(db.query('select * from recruitment_approve_application($1,$2,$3,$4)',[org,ready.id,ready.version,'Approved new entrant training route'])).rejects.toThrow('changed or access')
  await db.exec(`reset role; update organisation_users set status='active' where user_id='${manager}';`)
  await asUser(manager)
  const result=(await db.query("update recruitment_leads set status='application_approved',approval_notes=' Approved new entrant training route ',approved_by=$1,approved_at='1999-01-01',approval_snapshot='{\"forged\":true}' where id=$2 and version=$3 returning *",[agent,ready.id,ready.version])).rows[0]
  expect(result.approved_by).toBe(manager)
  expect(result.approved_at.getFullYear()).not.toBe(1999)
  expect(result.approval_notes).toBe('Approved new entrant training route')
  expect(result.approval_snapshot.forged).toBeUndefined()
  expect(result.approval_snapshot.review).toEqual(ready.review_json)
})
let contractLead
it('prepares immutable private contract versions only after approval with current management access', async () => {
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261005135634_recruitment_contract_sent.sql',import.meta.url),'utf8'))
  await asUser(manager)
  contractLead=(await db.query('select * from recruitment_leads where id=$1',[approved.id])).rows[0]
  const path=`${org}/${contractLead.id}/contract-v1`
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-contracts',$1,$2)",[path,manager])
  const doc={path,name:'Agent agreement.pdf',size:512,preparedBy:agent,preparedAt:'1999-01-01'}
  const prepare=(version=contractLead.version,organisation=org)=>db.query('select * from recruitment_prepare_contract($1,$2,$3,$4::jsonb)',[organisation,contractLead.id,version,JSON.stringify(doc)])
  await expect(prepare(contractLead.version,other)).rejects.toThrow('changed or access')
  await asUser(agent)
  expect((await db.query("select * from storage.objects where bucket_id='recruitment-contracts'")).rows).toHaveLength(0)
  await expect(prepare()).rejects.toThrow('changed or access')
  await db.exec('reset role; set role anon;')
  await expect(prepare()).rejects.toThrow()
  await asUser(manager)
  await expect(prepare(contractLead.version-1)).rejects.toThrow('changed or access')
  const before=contractLead
  contractLead=(await prepare()).rows[0]
  expect(contractLead.status).toBe('application_approved')
  expect(contractLead.activity_json.at(-1)).toMatchObject({type:'contract_prepared',actorId:manager})
  expect(contractLead.approval_snapshot).toEqual(before.approval_snapshot)
  expect(contractLead.contracts_json[0]).toMatchObject({version:1,path,preparedBy:manager})
  expect(new Date(contractLead.contracts_json[0].approvedAt)).toEqual(before.approved_at)
  expect(contractLead.contracts_json[0].preparedAt).not.toContain('1999')
  await expect(db.query("update recruitment_leads set contracts_json='[]' where id=$1",[contractLead.id])).rejects.toThrow('appended')
  expect((await db.query('delete from storage.objects where name=$1 returning name',[path])).rows).toHaveLength(0)
  expect((await db.query('update storage.objects set name=$1 where name=$2 returning name',['replacement',path])).rows).toHaveLength(0)
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-contracts',$1,$2)",[`${path}-v2`,manager])
  contractLead=(await db.query('select * from recruitment_prepare_contract($1,$2,$3,$4::jsonb)',[org,contractLead.id,contractLead.version,JSON.stringify({...doc,path:`${path}-v2`})])).rows[0]
  expect(contractLead.contracts_json.map(item=>item.version)).toEqual([1,2])
  await expect(db.query('select * from recruitment_prepare_contract($1,$2,$3,$4::jsonb)',[org,contractLead.id,contractLead.version,JSON.stringify({...doc,path:`${other}/${otherLead}/foreign`})])).rejects.toThrow('Invalid contract')
})
let sentContractLead, signedContractLead
it('records prior delivery for the latest prepared version without forging an automated send', async () => {
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261005140352_recruitment_contract_signed.sql',import.meta.url),'utf8'))
  await asUser(manager)
  const today=(await db.query("select to_char(now() at time zone 'Africa/Johannesburg','YYYY-MM-DD') as today")).rows[0].today
  const draft={contractVersion:2,recipientName:'Agent Applicant',recipientContact:'agent@example.test',channel:'email',sentOn:today,notes:'Provided by staff; email message reference 1234',confirmed:true,recordedBy:agent,recordedAt:'1999-01-01',source:'automated'}
  const record=(details=draft,version=contractLead.version,organisation=org)=>db.query('select * from recruitment_record_contract_delivery($1,$2,$3,$4::jsonb)',[organisation,contractLead.id,version,JSON.stringify(details)])
  await expect(db.query("update recruitment_leads set status='contract_sent' where id=$1",[contractLead.id])).rejects.toThrow('Later recruitment phases')
  await expect(record({...draft,contractVersion:1})).rejects.toThrow('Confirm the contract version')
  await expect(record({...draft,confirmed:false})).rejects.toThrow('Confirm the contract version')
  await expect(record({...draft,sentOn:'2099-12-31'})).rejects.toThrow('delivery date')
  await expect(record(draft,contractLead.version-1)).rejects.toThrow('changed or access')
  await expect(record(draft,contractLead.version,other)).rejects.toThrow('changed or access')
  await expect(db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-signed-contracts',$1,$2)",[`${org}/${contractLead.id}/premature`,manager])).rejects.toThrow()
  await asUser(agent)
  await expect(record()).rejects.toThrow('changed or access')
  await db.exec('reset role; set role anon;')
  await expect(record()).rejects.toThrow()
  await asUser(manager)
  sentContractLead=(await record()).rows[0]
  expect(sentContractLead.status).toBe('contract_sent')
  expect(sentContractLead.contract_delivery_json).toMatchObject({contractVersion:2,source:'staff_recorded',recordedBy:manager})
  expect(sentContractLead.contract_delivery_json.recordedAt).not.toContain('1999')
  expect(sentContractLead.activity_json.at(-1).type).toBe('contract_delivery_recorded')
  expect(sentContractLead.contracts_json).toEqual(contractLead.contracts_json)
  await expect(record()).rejects.toThrow('changed or access')
  await expect(db.query("update recruitment_leads set contract_delivery_json='{}' where id=$1",[contractLead.id])).rejects.toThrow('cannot be changed')
})
it('requires the delivered version, complete verification and a private signed PDF before recording signatures', async () => {
  await asUser(manager)
  const path=`${org}/${sentContractLead.id}/signed-v2`, sentOn=sentContractLead.contract_delivery_json.sentOn
  const draft={contractVersion:2,path,name:'Signed agreement.pdf',size:512,agentSigner:'Agent Applicant',organisationSigner:'Principal Representative',signedOn:sentOn,method:'wet_ink',reference:'',notes:'All pages compared against version 2; both signatures checked',checks:{sameVersion:true,allPages:true,agentSignature:true,organisationSignature:true},recordedAt:'1999-01-01',recordedBy:agent}
  const record=(details=draft,version=sentContractLead.version,organisation=org)=>db.query('select * from recruitment_record_contract_signature($1,$2,$3,$4::jsonb)',[organisation,sentContractLead.id,version,JSON.stringify(details)])
  await expect(record()).rejects.toThrow('Upload the signed contract PDF')
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-signed-contracts',$1,$2)",[path,manager])
  await expect(record({...draft,checks:{...draft.checks,agentSignature:false}})).rejects.toThrow('both signatures')
  await expect(record({...draft,contractVersion:1})).rejects.toThrow('Invalid signed contract')
  await expect(record({...draft,path:`${other}/${otherLead}/signed`})).rejects.toThrow('Upload the signed contract')
  await expect(record({...draft,signedOn:'2000-01-01'})).rejects.toThrow('signature date')
  await expect(record({...draft,method:'external_electronic'})).rejects.toThrow('Invalid signed contract')
  await expect(record(draft,sentContractLead.version-1)).rejects.toThrow('changed or access')
  await expect(record(draft,sentContractLead.version,other)).rejects.toThrow('changed or access')
  await asUser(agent)
  expect((await db.query("select * from storage.objects where bucket_id='recruitment-signed-contracts'")).rows).toHaveLength(0)
  await expect(record()).rejects.toThrow('changed or access')
  await db.exec('reset role; set role anon;')
  await expect(record()).rejects.toThrow()
  await asUser(manager)
  signedContractLead=(await record()).rows[0]
  expect(signedContractLead.status).toBe('contract_signed')
  expect(signedContractLead.contract_signature_json).toMatchObject({contractVersion:2,path,recordedBy:manager,source:'staff_verified',agentSigner:'Agent Applicant'})
  expect(signedContractLead.contract_signature_json.recordedAt).not.toContain('1999')
  expect(signedContractLead.activity_json.at(-1)).toMatchObject({type:'contract_signed',actorId:manager,fromStage:'contract_sent',toStage:'contract_signed'})
  expect(signedContractLead.approval_snapshot).toEqual(sentContractLead.approval_snapshot)
  await expect(record()).rejects.toThrow('changed or access')
})
it('retains signature evidence and its stage through closure and rejects edits and later phases', async () => {
  await asUser(manager)
  await expect(db.query("update recruitment_leads set contract_signature_json='{}' where id=$1",[signedContractLead.id])).rejects.toThrow('cannot be changed')
  expect((await db.query('delete from storage.objects where name=$1 returning name',[signedContractLead.contract_signature_json.path])).rows).toHaveLength(0)
  expect((await db.query('update storage.objects set name=$1 where name=$2 returning name',['renamed-signed',signedContractLead.contract_signature_json.path])).rows).toHaveLength(0)
  for(const stage of ['application_approved','contract_sent','onboarding_complete','agent_activated']) await expect(db.query('update recruitment_leads set status=$1 where id=$2',[stage,signedContractLead.id])).rejects.toThrow('Later recruitment phases')
  await db.query("update recruitment_leads set status='closed_lost' where id=$1",[signedContractLead.id])
  const reopened=(await db.query("update recruitment_leads set status='contract_signed' where id=$1 returning *",[signedContractLead.id])).rows[0]
  expect(reopened.contract_signature_json).toEqual(signedContractLead.contract_signature_json)
  expect(reopened.contract_delivery_json).toEqual(signedContractLead.contract_delivery_json)
  expect(reopened.activity_json.at(-1).type).toBe('lead_reopened')
  await db.exec("reset role; select set_config('test.actor','',false); set role service_role;")
  await expect(db.query('select * from recruitment_record_contract_signature($1,$2,$3,$4::jsonb)',[org,signedContractLead.id,reopened.version,'{}'])).rejects.toThrow('permission denied')
})

let onboardingLead, onboardingDraft
const onboardingKeys=['identity','registration','qualifications','training','handover','induction']
const saveOnboarding=(draft,complete=false,row=onboardingLead)=>db.query('select * from recruitment_save_onboarding($1,$2,$3,$4::jsonb,$5)',[org,row.id,row.version,JSON.stringify(draft),complete])
it('adds a private retained onboarding pack after signatures and stamps the actual actor', async () => {
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261005141618_recruitment_onboarding_complete.sql',import.meta.url),'utf8'))
  await asUser(manager)
  onboardingLead=(await db.query('select * from recruitment_leads where id=$1',[signedContractLead.id])).rows[0]
  const path=`${org}/${onboardingLead.id}/final-identity`
  await expect(db.query("insert into storage.objects(bucket_id,name) values('recruitment-onboarding-documents',$1)",[`${other}/${otherLead}/forged-onboarding`])).rejects.toThrow()
  await expect(db.query("insert into storage.objects(bucket_id,name) values('recruitment-onboarding-documents',$1)",[`${org}/${lead}/premature-onboarding`])).rejects.toThrow()
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-onboarding-documents',$1,$2)",[path,manager])
  const document={path,name:'Identity.pdf',type:'Identity document',mimeType:'application/pdf',size:512,uploadedBy:agent,uploadedAt:'1900-01-01'}
  const add=(row,doc)=>db.query('select * from recruitment_add_onboarding_document($1,$2,$3,$4::jsonb)',[org,row.id,row.version,JSON.stringify(doc)])
  onboardingLead=(await add(onboardingLead,document)).rows[0]
  expect(onboardingLead.onboarding_documents_json[0]).toMatchObject({path,uploadedBy:manager})
  expect(onboardingLead.onboarding_documents_json[0].uploadedAt).not.toContain('1900')
  expect(onboardingLead.activity_json.at(-1).type).toBe('onboarding_document_uploaded')
  await expect(add({...onboardingLead,version:onboardingLead.version-1},document)).rejects.toThrow('changed or access')
  await expect(add(onboardingLead,document)).rejects.toThrow('Upload the onboarding document')
  await expect(db.query("update recruitment_leads set onboarding_documents_json='[]' where id=$1",[onboardingLead.id])).rejects.toThrow('Append one')
  expect((await db.query('delete from storage.objects where name=$1 returning name',[path])).rows).toHaveLength(0)
  expect((await db.query('update storage.objects set name=$1 where name=$2 returning name',['replace-onboarding',path])).rows).toHaveLength(0)
  const unused=`${org}/${onboardingLead.id}/unused-onboarding`
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-onboarding-documents',$1,$2)",[unused,manager])
  expect((await db.query('delete from storage.objects where name=$1 returning name',[unused])).rows).toHaveLength(1)
})
it('saves partial onboarding and rejects unresolved checks, foreign evidence, missing documents, invalid dates and stale saves', async () => {
  const path=onboardingLead.onboarding_documents_json[0].path
  onboardingDraft={version:'recruitment-onboarding-v1',checks:Object.fromEntries(onboardingKeys.map(key=>[key,{status:'pending',notes:'',evidence:[]}])),documents:[{path,status:'pending',notes:''}],notes:'Joining arrangements in progress',startDate:'',confirmed:false,updatedBy:agent}
  onboardingLead=(await saveOnboarding(onboardingDraft)).rows[0]
  expect(onboardingLead.status).toBe('contract_signed')
  expect(onboardingLead.onboarding_json.updatedBy).toBe(manager)
  expect(onboardingLead.onboarding_completed_at).toBeNull()
  const extraPath=`${org}/${onboardingLead.id}/final-training`
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-onboarding-documents',$1,$2)",[extraPath,manager])
  onboardingLead=(await db.query('select * from recruitment_add_onboarding_document($1,$2,$3,$4::jsonb)',[org,onboardingLead.id,onboardingLead.version,JSON.stringify({path:extraPath,name:'Training.pdf',type:'Training / CPD',mimeType:'application/pdf',size:128})])).rows[0]
  expect(onboardingLead.onboarding_json.notes).toBe(onboardingDraft.notes)
  expect(onboardingLead.onboarding_json.documents.at(-1)).toEqual({path:extraPath,status:'pending',notes:''})
  onboardingDraft.documents.push({path:extraPath,status:'pending',notes:''})
  await db.query("update recruitment_leads set status='closed_lost' where id=$1",[onboardingLead.id])
  onboardingLead=(await db.query("update recruitment_leads set status='contract_signed' where id=$1 returning *",[onboardingLead.id])).rows[0]
  expect(onboardingLead.onboarding_json.notes).toBe(onboardingDraft.notes)
  await expect(saveOnboarding(onboardingDraft,true)).rejects.toThrow('Resolve onboarding')
  onboardingDraft={...onboardingDraft,checks:Object.fromEntries(onboardingKeys.map(key=>[key,{status:'complete',notes:'Joining requirement checked and arrangements recorded.',evidence:[path]}])),documents:onboardingLead.onboarding_documents_json.map(doc=>({path:doc.path,status:'reviewed',notes:'File opened and confirmed against the joining record.'})),startDate:'2026-10-12',notes:'All agreed joining requirements and final documents completed.',confirmed:true}
  await expect(saveOnboarding({...onboardingDraft,confirmed:false},true)).rejects.toThrow('confirm completion')
  await expect(saveOnboarding({...onboardingDraft,startDate:'2026-02-31'},true)).rejects.toThrow()
  await expect(saveOnboarding({...onboardingDraft,documents:[]},true)).rejects.toThrow('current onboarding document pack')
  await expect(saveOnboarding({...onboardingDraft,checks:{...onboardingDraft.checks,identity:{status:'complete',notes:'Recorded identity findings',evidence:['other/lead/identity']}}},true)).rejects.toThrow('must belong')
  await expect(saveOnboarding({...onboardingDraft,checks:{...onboardingDraft.checks,training:{status:'needs_information',notes:'Training plan still needs agreement',evidence:[]}}},true)).rejects.toThrow('Resolve onboarding')
  await expect(saveOnboarding(onboardingDraft,true,{...onboardingLead,version:onboardingLead.version-1})).rejects.toThrow('changed or access')
  await expect(db.query("update recruitment_leads set onboarding_completed_at=now() where id=$1",[onboardingLead.id])).rejects.toThrow('authored by the database')
  await db.exec('reset role;')
  await db.query('delete from storage.objects where name=$1',[path])
  await asUser(manager)
  await expect(saveOnboarding(onboardingDraft,true)).rejects.toThrow('document is missing')
  await db.exec('reset role;')
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-onboarding-documents',$1,$2)",[path,manager])
  await asUser(manager)
  onboardingDraft.checks.handover={status:'not_applicable',notes:'No agency notice or mandates to hand over.',evidence:[]}
  onboardingLead=(await saveOnboarding(onboardingDraft,true)).rows[0]
  expect(onboardingLead.status).toBe('onboarding_complete')
  expect(onboardingLead.onboarding_completed_by).toBe(manager)
  expect(onboardingLead.onboarding_snapshot).toMatchObject({version:'recruitment-onboarding-completion-v1',completedBy:manager,contractSignature:onboardingLead.contract_signature_json,documents:onboardingLead.onboarding_documents_json})
  expect(onboardingLead.activity_json.at(-1).type).toBe('onboarding_completed')
})
it('locks completed onboarding, restores its stage after reopening and restricts management access', async () => {
  await expect(db.query("update recruitment_leads set onboarding_json='{}' where id=$1",[onboardingLead.id])).rejects.toThrow('cannot be changed')
  await expect(db.query("update recruitment_leads set onboarding_snapshot='{}' where id=$1",[onboardingLead.id])).rejects.toThrow('cannot be changed')
  await expect(db.query("update recruitment_leads set status='agent_activated' where id=$1",[onboardingLead.id])).rejects.toThrow('Later recruitment phases')
  await expect(db.query("insert into storage.objects(bucket_id,name) values('recruitment-onboarding-documents',$1)",[`${org}/${onboardingLead.id}/after-complete`])).rejects.toThrow()
  await db.query("update recruitment_leads set status='closed_lost' where id=$1",[onboardingLead.id])
  const reopened=(await db.query("update recruitment_leads set status='onboarding_complete' where id=$1 returning *",[onboardingLead.id])).rows[0]
  expect(reopened.onboarding_snapshot).toEqual(onboardingLead.onboarding_snapshot)
  await asUser(agent)
  expect((await db.query("select * from storage.objects where bucket_id='recruitment-onboarding-documents'")).rows).toHaveLength(0)
  await expect(saveOnboarding(onboardingDraft,true,reopened)).rejects.toThrow('changed or access')
  await db.exec('reset role; set role anon;')
  await expect(saveOnboarding(onboardingDraft,true,reopened)).rejects.toThrow('permission denied')
  await db.exec("reset role; select set_config('test.actor','',false); set role service_role;")
  await expect(saveOnboarding(onboardingDraft,true,reopened)).rejects.toThrow('permission denied')
})

let activationLead, activationInvite
const recruitedUser='77777777-7777-4777-8777-777777777777'
const activate=(row=activationLead,confirmed=true)=>db.query('select * from recruitment_activate_agent($1,$2,$3,$4,$5)',[org,row.id,row.version,'Joining evidence confirmed and agent access authorised.',confirmed])
it('prepares the canonical agent invitation atomically without prematurely activating membership',async()=>{
  await db.exec(`reset role;
    alter table organisations add column type text default 'agency';
    grant select on organisations to authenticated;
    grant update on organisation_users to authenticated;
    alter table organisation_users add column id uuid default gen_random_uuid() primary key, add column email text, add column workspace_role text, add column organisation_role text;
    create table invites(id uuid primary key default gen_random_uuid(),target_workspace_id uuid,invite_type text,target_workspace_role text,email text,phone text,token text default gen_random_uuid()::text,status text default 'pending',expires_at timestamptz,accepted_by_user_id uuid,metadata jsonb);
    alter table invites enable row level security;
    grant select,insert,update on invites to authenticated;
    create policy test_invite_manager on invites for all to authenticated using(exists(select 1 from organisation_users m where m.organisation_id=invites.target_workspace_id and m.user_id=auth.uid() and m.status='active' and m.role in ('principal','admin','super_admin'))) with check(exists(select 1 from organisation_users m where m.organisation_id=invites.target_workspace_id and m.user_id=auth.uid() and m.status='active' and m.role in ('principal','admin','super_admin')));
    -- Isolated adapter for the existing invite workflow; recruitment calls its real payload contract.
    create function public.bridge_create_invite(payload jsonb) returns jsonb language plpgsql security invoker set search_path=public as $$ declare result uuid; begin
      select id into result from invites where target_workspace_id=(payload->>'target_workspace_id')::uuid and email=payload->>'email' and status='pending' and expires_at>now();
      if result is not null then return jsonb_build_object('success',false,'code','duplicate_pending_invite','invite_id',result); end if;
      insert into invites(target_workspace_id,invite_type,target_workspace_role,email,phone,expires_at,metadata) values((payload->>'target_workspace_id')::uuid,payload->>'invite_type',payload->>'target_workspace_role',payload->>'email',payload->>'phone',(payload->>'expires_at')::timestamptz,payload->'metadata') returning id into result;
      return jsonb_build_object('success',true,'invite_id',result);
    end $$;
    grant execute on function public.bridge_create_invite(jsonb) to authenticated;`)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261005142636_recruitment_agent_activated.sql',import.meta.url),'utf8'))
  await asUser(manager)
  activationLead=(await db.query('select * from recruitment_leads where id=$1',[onboardingLead.id])).rows[0]
  await expect(activate({...activationLead,version:activationLead.version-1})).rejects.toThrow('changed')
  await expect(activate({...activationLead,version:null})).rejects.toThrow('changed')
  await expect(activate(activationLead,false)).rejects.toThrow('Confirm agent identity')
  const original=activationLead
  activationLead=(await activate()).rows[0]
  expect(activationLead.status).toBe('onboarding_complete')
  expect(activationLead.activated_at).toBeNull()
  expect(activationLead.activation_json).toMatchObject({state:'awaiting_acceptance',email:original.email.trim().toLowerCase(),role:'agent',preparedBy:manager})
  expect(activationLead.activity_json.at(-1).type).toBe('agent_access_prepared')
  activationInvite=(await db.query('select * from invites where id=$1',[activationLead.activation_json.inviteId])).rows[0]
  expect(activationInvite).toMatchObject({target_workspace_id:org,invite_type:'workspace_invite',target_workspace_role:'agent',status:'pending',metadata:{source:'recruitment_activation',recruitment_lead_id:activationLead.id}})
  expect((await db.query('select * from organisation_users where user_id=$1',[recruitedUser])).rows).toHaveLength(0)
  const retry=(await activate()).rows[0]
  expect(retry.version).toBe(activationLead.version)
  expect((await db.query('select * from invites')).rows).toHaveLength(1)
  await expect(db.query('update recruitment_leads set email=$1 where id=$2',['changed@example.test',activationLead.id])).rejects.toThrow('email cannot be changed')
  await expect(db.query("update recruitment_leads set status='agent_activated' where id=$1",[activationLead.id])).rejects.toThrow('Later recruitment phases')
})
it('replaces expired access while retaining preparation history and requires accepted identity and active agent membership',async()=>{
  await db.exec('reset role;')
  await db.query("update invites set expires_at=now()-interval '1 day' where id=$1",[activationInvite.id])
  await asUser(manager)
  activationLead=(await activate()).rows[0]
  expect(activationLead.activation_json.inviteId).not.toBe(activationInvite.id)
  expect(activationLead.activation_json.history[0].inviteId).toBe(activationInvite.id)
  activationInvite=(await db.query('select * from invites where id=$1',[activationLead.activation_json.inviteId])).rows[0]
  await db.exec('reset role;')
  await db.query("insert into organisation_users(organisation_id,user_id,status,role,email,workspace_role) values($1,$2,'active','admin',$3,'admin')",[org,recruitedUser,activationLead.email])
  await asUser(manager)
  await expect(activate()).rejects.toThrow('non-agent')
  await db.exec('reset role;')
  await db.query("update organisation_users set role='agent',workspace_role='agent' where user_id=$1",[recruitedUser])
  await asUser(manager)
  await expect(activate()).rejects.toThrow('accepted by the matching account')
  await db.exec('reset role;')
  await db.query("update invites set status='accepted',accepted_by_user_id=$1 where id=$2",[agent,activationInvite.id])
  await asUser(manager)
  await expect(activate()).rejects.toThrow('accepted by the matching account')
  await db.exec('reset role;')
  await db.query('update invites set accepted_by_user_id=$1 where id=$2',[recruitedUser,activationInvite.id])
  await db.query("update organisation_users set status='suspended' where user_id=$1",[recruitedUser])
  await asUser(manager)
  await expect(activate()).rejects.toThrow('no active agent membership')
  await db.exec('reset role;')
  await db.query("update organisation_users set status='active' where user_id=$1",[recruitedUser])
  await asUser(manager)
  activationLead=(await activate()).rows[0]
  expect(activationLead.status).toBe('agent_activated')
  expect(activationLead.activated_by).toBe(manager)
  expect(activationLead.activation_json).toMatchObject({state:'active',userId:recruitedUser,source:'accepted_agent_invite',inviteId:activationInvite.id})
  expect(activationLead.onboarding_snapshot).toEqual(onboardingLead.onboarding_snapshot)
  expect(activationLead.activity_json.at(-1)).toMatchObject({type:'agent_activated',actorId:manager,fromStage:'onboarding_complete',toStage:'agent_activated'})
  const retry=(await activate({...activationLead,version:1})).rows[0]
  expect(retry.version).toBe(activationLead.version)
  expect(retry.activity_json).toEqual(activationLead.activity_json)
})
it('preserves final activation and restricts staff, tenant and anonymous access',async()=>{
  await expect(db.query("update recruitment_leads set activation_json='{}' where id=$1",[activationLead.id])).rejects.toThrow('cannot be changed')
  await expect(db.query("update recruitment_leads set activated_at=null where id=$1",[activationLead.id])).rejects.toThrow('cannot be changed')
  await expect(db.query("update recruitment_leads set status='closed_lost' where id=$1",[activationLead.id])).rejects.toThrow('Later recruitment phases')
  await expect(db.query('select * from recruitment_activate_agent($1,$2,$3,$4,true)',[other,activationLead.id,activationLead.version,'Wrong organisation activation'])).rejects.toThrow('access was removed')
  await asUser(agent)
  await expect(activate()).rejects.toThrow('management access')
  await db.exec('reset role; set role anon;')
  await expect(activate()).rejects.toThrow('permission denied')
  await db.exec("reset role; select set_config('test.actor','',false); set role service_role;")
  await expect(activate()).rejects.toThrow('permission denied')
})

async function activationFixture(email,name='Existing agent') {
  // Trusted migrated completion fixture in this isolated database; all runtime
  // activation is exercised with authenticated management and guards enabled.
  await db.exec('reset role; alter table recruitment_leads disable trigger user;')
  const copy={...activationLead,id:crypto.randomUUID(),intake_key:crypto.randomUUID(),name,email,status:'onboarding_complete',version:1,activation_json:{},activated_at:null,activated_by:null}
  await db.query('insert into recruitment_leads select (jsonb_populate_record(null::recruitment_leads,$1::jsonb)).*',[JSON.stringify(copy)])
  await db.exec('alter table recruitment_leads enable trigger user;')
  await asUser(manager)
  return copy
}
it('links an existing active agent without a second membership or invite, and prevents duplicate recruitment activation',async()=>{
  const duplicate=await activationFixture(activationLead.email)
  await expect(activate(duplicate)).rejects.toThrow('duplicate key')
  expect((await db.query('select activation_json from recruitment_leads where id=$1',[duplicate.id])).rows[0].activation_json).toEqual({})
  const existing=await activationFixture('existing.agent@example.test')
  const existingUser='88888888-8888-4888-8888-888888888888'
  await db.exec('reset role;')
  await db.query("insert into organisation_users(organisation_id,user_id,email,status,role,workspace_role) values($1,$2,$3,'active','agent','senior_agent')",[org,existingUser,existing.email])
  await asUser(manager)
  const countBefore=(await db.query('select count(*) from invites')).rows[0].count
  const activated=(await activate(existing)).rows[0]
  expect(activated.activation_json).toMatchObject({source:'existing_active_member',role:'senior_agent',userId:existingUser})
  expect((await db.query('select count(*) from invites')).rows[0].count).toBe(countBefore)
  expect((await db.query('select count(*) from organisation_users where user_id=$1',[existingUser])).rows[0].count).toBe(1)
})
it('rejects adoption of a pending privileged invitation and rolls back the recruitment preparation',async()=>{
  const ready=await activationFixture('pending.admin@example.test')
  await db.exec('reset role;')
  await db.query("insert into invites(target_workspace_id,invite_type,target_workspace_role,email,status,expires_at) values($1,'workspace_invite','admin',$2,'pending',now()+interval '1 day')",[org,ready.email])
  await asUser(manager)
  await expect(activate(ready)).rejects.toThrow('pending agent invitation')
  const retained=(await db.query('select * from recruitment_leads where id=$1',[ready.id])).rows[0]
  expect(retained.version).toBe(1)
  expect(retained.activation_json).toEqual({})
  expect(retained.status).toBe('onboarding_complete')
  expect((await db.query('select target_workspace_role from invites where email=$1',[ready.email])).rows[0].target_workspace_role).toBe('admin')
})
