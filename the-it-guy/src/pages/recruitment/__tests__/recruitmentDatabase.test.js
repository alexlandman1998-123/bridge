import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { createRecruitmentIntakeResponse } from '../../../../server/services/recruitmentIntakeApi'
import { createHash } from 'node:crypto'
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

const contactToken = '1'.repeat(64), otherContactToken = '2'.repeat(64)
const contactKey = '12345678-1234-4234-8234-123456789abc'
const contactManager = '99999999-9999-4999-8999-999999999999'
const contact = { firstName: 'Website', lastName: 'Applicant', email: 'WEBSITE@EXAMPLE.TEST', phone: '+27821234567', privacyAccepted: true, consentVersion: 'recruitment-contact-v1' }
let contactLink, secondContactLink, capturedContact
async function contactServer() { await db.exec("reset role; select set_config('test.actor','',false); set role service_role;") }
function contactClient() {
  return {
    from(table) {
      if (table === 'recruitment_contact_receipts') {
        const filters = {}
        const query = { select: () => query, eq: (key, value) => { filters[key] = value; return query }, maybeSingle: async () => ({ data: (await db.query('select lead_id from recruitment_contact_receipts where organisation_id=$1 and link_id=$2 and submission_key=$3', [filters.organisation_id,filters.link_id,filters.submission_key])).rows[0], error: null }) }
        return query
      }
      if (table !== 'recruitment_intake_links') throw new Error('Unexpected intake lookup')
      let hash
      const query = { select: () => query, eq: (_key, value) => { hash = value; return query }, maybeSingle: async () => ({ data: (await db.query('select * from recruitment_intake_links where token_hash=$1', [hash])).rows[0], error: null }) }
      return query
    },
    async rpc(name, args) {
      if (name !== 'recruitment_capture_contact') throw new Error('Unexpected capture call')
      const result = await db.query('select recruitment_capture_contact($1,$2,$3::jsonb,$4) as result', [args.p_link_id,args.p_submission_key,JSON.stringify(args.p_contact),args.p_fingerprint])
      return { data: result.rows[0].result, error: null }
    },
  }
}
async function captureContact(link = contactLink, key = contactKey, values = contact, fingerprint = 'a'.repeat(64)) {
  return (await db.query('select recruitment_capture_contact($1,$2,$3::jsonb,$4) as result', [link,key,JSON.stringify(values),fingerprint])).rows[0].result
}
it('extends the latest eight-stage schema and captures contact through the actual public API into the receiving CRM', async () => {
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261007082653_recruitment_contact_capture.sql',import.meta.url),'utf8'))
  await db.query("insert into organisation_users(organisation_id,user_id,status,role) values($1,$2,'active','principal')",[org,contactManager])
  await asUser(manager)
  contactLink = (await db.query("insert into recruitment_intake_links(organisation_id,channel,token_hash,expires_at) values($1,'website',$2,now()+interval '1 year') returning id", [org,createHash('sha256').update(contactToken).digest('hex')])).rows[0].id
  await db.exec('reset role;')
  secondContactLink = (await db.query("insert into recruitment_intake_links(organisation_id,channel,created_by,token_hash,expires_at) values($1,'website',$2,$3,now()+interval '1 year') returning id", [other,manager,createHash('sha256').update(otherContactToken).digest('hex')])).rows[0].id
  await contactServer()
  const request = { client: contactClient(), headers: { host: 'agency.test', origin: 'https://agency.test' }, env: { RECRUITMENT_INTAKE_FINGERPRINT_SECRET: 'x'.repeat(32) }, body: { action: 'capture_contact', token: contactToken, submissionKey: contactKey, organisationId: other, emailVerified: true, contact: { ...contact, password: 'must-not-be-stored' } } }
  expect((await createRecruitmentIntakeResponse(request)).body).toEqual({ accepted: true, duplicate: false, stage: 'lead_received', emailVerification: 'pending' })
  expect((await createRecruitmentIntakeResponse(request)).body.duplicate).toBe(true)
  capturedContact = (await db.query('select * from recruitment_leads where organisation_id=$1 and intake_key=$2',[org,contactKey])).rows[0]
  expect(capturedContact).toMatchObject({ name: 'Website Applicant', email: 'website@example.test', phone: '+27821234567', organisation_id: org, status: 'lead_received', source: 'Website', intake_channel: 'website', captured_by: null, version: 1, email_verification_status: 'pending', email_verified_at: null, application_json: {}, application_submitted_at: null, activation_json: {} })
  expect(capturedContact.contact_capture_json).toMatchObject({ firstName: 'Website', lastName: 'Applicant', privacyAccepted: true, consentVersion: 'recruitment-contact-v1', version: 'recruitment-contact-v1', capturedAt: expect.any(String) })
  expect(capturedContact.activity_json.map(event => event.type)).toEqual(['lead_received'])
  expect(capturedContact.details_json.onboardingCaptured).toBe(false)
  expect(JSON.stringify(capturedContact)).not.toContain('must-not-be-stored')
  expect((await db.query('select count(*) from recruitment_contact_receipts where organisation_id=$1 and submission_key=$2',[org,contactKey])).rows[0].count).toBe(1)
  const activated = (await db.query('select status,email_verification_status from recruitment_leads where id=$1',[activationLead.id])).rows[0]
  expect(activated).toEqual({status:'agent_activated',email_verification_status:'not_requested'})
})
it('keeps agencies separate and never merges contact-only applicants by email', async () => {
  await contactServer()
  expect(await captureContact(secondContactLink)).toEqual({ accepted: true, duplicate: false })
  expect((await db.query('select count(*) from recruitment_leads where intake_key=$1',[contactKey])).rows[0].count).toBe(2)
  expect(await captureContact(contactLink,contactKey,{...contact,lastName:'Changed'})).toEqual({conflict:true})
  expect(await captureContact(contactLink,crypto.randomUUID())).toEqual({accepted:true,duplicate:false})
  await asUser(contactManager)
  const visible = (await db.query("select * from recruitment_leads where contact_capture_json <> '{}'::jsonb")).rows
  expect(visible).toHaveLength(2)
  expect(visible.every(row => row.organisation_id === org)).toBe(true)
  await db.exec('reset role;')
  await db.query("update organisation_users set status='suspended' where user_id=$1",[contactManager])
  await asUser(contactManager)
  expect((await db.query("select * from recruitment_leads where contact_capture_json <> '{}'::jsonb")).rows).toHaveLength(0)
  await db.exec('reset role;')
  await db.query("update organisation_users set status='active' where user_id=$1",[contactManager])
})
it('preserves authoritative consent and pending verification while allowing normal staff follow-up', async () => {
  await asUser(manager)
  await expect(db.query("update recruitment_leads set email_verification_status='verified',email_verified_at=now() where id=$1",[capturedContact.id])).rejects.toThrow('evidence cannot be changed')
  await expect(db.query("update recruitment_leads set contact_capture_json='{}' where id=$1",[capturedContact.id])).rejects.toThrow('evidence cannot be changed')
  await expect(db.query("update recruitment_leads set status='application_submitted' where id=$1",[capturedContact.id])).rejects.toThrow('Later recruitment phases')
  const edited = (await db.query("update recruitment_leads set details_json=details_json || '{\"notes\":\"Follow up next week\"}'::jsonb where id=$1 returning *",[capturedContact.id])).rows[0]
  expect(edited.email_verification_status).toBe('pending')
  expect(edited.contact_capture_json).toEqual(capturedContact.contact_capture_json)
  expect(edited.version).toBe(2)
  const manual = (await db.query("insert into recruitment_leads(organisation_id,name,email) values($1,'Manual Enquiry','manual@example.test') returning *",[org])).rows[0]
  expect(manual.email_verification_status).toBe('not_requested')
  await expect(db.query("insert into recruitment_leads(organisation_id,name,email,email_verification_status) values($1,'Forged Pending','forged@example.test','pending')",[org])).rejects.toThrow('trusted applicant evidence')
  await contactServer()
  expect(await captureContact(contactLink,contactKey)).toEqual({accepted:true,duplicate:true})
  expect((await db.query('select version,details_json from recruitment_leads where id=$1',[capturedContact.id])).rows[0]).toMatchObject({version:2,details_json:{notes:'Follow up next week'}})
})
it('locks down capture functions and receipts against anonymous users, applicants and managers', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`reset role; set role ${role};`)
    await expect(captureContact()).rejects.toThrow('permission denied')
    await expect(db.query('select * from recruitment_contact_receipts')).rejects.toThrow('permission denied')
  }
  await asUser(agent)
  expect((await db.query('select * from recruitment_leads where id=$1',[capturedContact.id])).rows).toHaveLength(0)
  await contactServer()
  await expect(db.exec("update recruitment_contact_receipts set payload_json='{}'")).rejects.toThrow('permission denied')
  await expect(db.exec('delete from recruitment_contact_receipts')).rejects.toThrow('permission denied')
  expect((await db.query("select relrowsecurity from pg_class where relname='recruitment_contact_receipts'")).rows[0].relrowsecurity).toBe(true)
  expect((await db.query("select prosecdef from pg_proc where proname in ('recruitment_capture_contact','recruitment_contact_guard','recruitment_lead_stamp')")).rows.every(row => !row.prosecdef)).toBe(true)
})
it('validates direct server capture and atomically rate-limits across public links without counting retries', async () => {
  await contactServer()
  for (const invalid of [{...contact,privacyAccepted:false},{...contact,consentVersion:'forged'},{...contact,firstName:''},{...contact,lastName:'a'.repeat(61)},{...contact,email:'invalid'},{...contact,phone:'1'.repeat(16)}]) {
    await expect(captureContact(contactLink,crypto.randomUUID(),invalid)).rejects.toThrow('Invalid recruitment contact')
  }
  const fingerprint = 'b'.repeat(64), keys = Array.from({length:5},()=>crypto.randomUUID())
  for (const [index,key] of keys.entries()) expect(await captureContact(index % 2 ? secondContactLink : contactLink,key,contact,fingerprint)).toEqual({accepted:true,duplicate:false})
  expect(await captureContact(contactLink,keys[0],contact,fingerprint)).toEqual({accepted:true,duplicate:true})
  expect(await captureContact(secondContactLink,crypto.randomUUID(),contact,fingerprint)).toEqual({rateLimited:true})
  expect((await db.query('select count(*) from recruitment_contact_receipts where fingerprint=$1',[fingerprint])).rows[0].count).toBe(5)
})
it('rejects expired, revoked and private entry points, and rolls back the lead if its receipt cannot be recorded', async () => {
  await db.exec('reset role;')
  const expired = (await db.query("insert into recruitment_intake_links(organisation_id,created_by,channel,token_hash,created_at,expires_at) values($1,$2,'public_link',$3,now()-interval '2 days',now()-interval '1 day') returning id",[org,manager,'3'.repeat(64)])).rows[0].id
  const revoked = (await db.query("insert into recruitment_intake_links(organisation_id,created_by,channel,token_hash,expires_at,revoked_at) values($1,$2,'website',$3,now()+interval '1 year',now()) returning id",[org,manager,'4'.repeat(64)])).rows[0].id
  const privateLink = (await db.query("insert into recruitment_intake_links(organisation_id,created_by,lead_id,channel,token_hash,expires_at) values($1,$2,$3,'private_link',$4,now()+interval '14 days') returning id",[org,manager,capturedContact.id,'5'.repeat(64)])).rows[0].id
  await contactServer()
  for (const id of [expired,revoked,privateLink]) expect(await captureContact(id,crypto.randomUUID())).toEqual({unavailable:true})
  await db.exec('reset role;')
  await db.exec("create function test_contact_receipt_failure() returns trigger language plpgsql as $$ begin raise exception 'Fixture receipt failure'; end $$; create trigger test_contact_receipt_failure before insert on recruitment_contact_receipts for each row execute function test_contact_receipt_failure();")
  const key = crypto.randomUUID()
  await contactServer()
  await expect(captureContact(contactLink,key)).rejects.toThrow('Fixture receipt failure')
  expect((await db.query('select id from recruitment_leads where intake_key=$1',[key])).rows).toHaveLength(0)
  await db.exec('reset role; drop trigger test_contact_receipt_failure on recruitment_contact_receipts; drop function test_contact_receipt_failure();')
})

it('saves the enquiry before account creation and recovers a failed Auth attempt against the same CRM lead', async () => {
  await contactServer()
  const client = contactClient(), users = new Map(), creations = []
  let fail = true
  client.auth = { admin: {
    getUserById: async id => ({ data: { user: users.get(id) }, error: users.has(id) ? null : { status: 404 } }),
    createUser: async values => {
      const row = (await db.query('select * from recruitment_leads where id=$1',[values.app_metadata.recruitment_contact_lead_id])).rows[0]
      expect(row.status).toBe('lead_received')
      expect(row.email_verification_status).toBe('pending')
      expect(JSON.stringify(row)).not.toContain('SignupFixture123')
      if (fail) return { error: { code: 'fixture_auth_unavailable' } }
      creations.push(values); users.set(values.id, values)
      return { data: { user: values }, error: null }
    },
  } }
  const key = crypto.randomUUID()
  const request = { client, env: { RECRUITMENT_INTAKE_FINGERPRINT_SECRET: 'x'.repeat(32) }, headers: { 'x-forwarded-for': '192.0.2.24' }, body: { action: 'signup', token: contactToken, submissionKey: key, contact: {...contact,email:'signup@example.test'}, password: 'SignupFixture123' } }
  expect((await createRecruitmentIntakeResponse(request))).toMatchObject({status:503,body:{contactAccepted:true}})
  expect((await db.query('select count(*) from recruitment_leads where intake_key=$1',[key])).rows[0].count).toBe(1)
  fail = false
  expect((await createRecruitmentIntakeResponse(request))).toMatchObject({status:201,body:{accountCreated:true,emailVerification:'pending'}})
  expect((await createRecruitmentIntakeResponse(request))).toMatchObject({status:202,body:{duplicate:true}})
  expect(creations).toHaveLength(1)
  expect((await db.query('select count(*) from recruitment_leads where intake_key=$1',[key])).rows[0].count).toBe(1)
  const row = (await db.query('select * from recruitment_leads where intake_key=$1',[key])).rows[0]
  expect(row.application_json).toEqual({})
  expect(row.application_submitted_at).toBeNull()
  expect(row.email_verified_at).toBeNull()
  await db.exec('reset role;')
  expect((await db.query('select * from organisation_users where user_id=$1',[creations[0].id])).rows).toHaveLength(0)
})

const applicantUser = 'abcdefab-cdef-4abc-8def-abcdefabcdef'
const otherApplicant = 'abcdefab-cdef-4abc-8def-abcdefabcdea'
const resumeHash = 'e'.repeat(64)
it('binds verified ownership to the original enquiry without submitting an application or adding membership', async () => {
  await db.exec(`reset role; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz);
    insert into auth.users(id,email) values('${applicantUser}','website@example.test'),('${otherApplicant}','foreign@example.test');`)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261007085627_recruitment_applicant_resume.sql',import.meta.url),'utf8'))
  await contactServer()
  const open = () => db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[org,applicantUser,resumeHash,contactKey])
  expect((await open()).rows[0].result).toBe(false)
  await db.exec(`reset role; update auth.users set email_confirmed_at=now() where id='${applicantUser}';`)
  await contactServer()
  expect((await open()).rows[0].result).toBe(true)
  const saved = (await db.query('select * from recruitment_leads where id=$1',[capturedContact.id])).rows[0]
  expect(saved.email_verification_status).toBe('verified')
  expect(saved.email_verified_at).toBeTruthy()
  expect(saved.status).toBe('lead_received')
  expect(saved.contact_capture_json).toEqual(capturedContact.contact_capture_json)
  expect(saved.application_json).toEqual({})
  expect(saved.application_submitted_at).toBeNull()
  const resumed = (await db.query('select recruitment_resume_applicant($1,$2) as result',[org,resumeHash])).rows[0].result
  expect(resumed).toEqual({emailVerification:'verified',stage:'lead_received',applicationSubmitted:false,contact:{firstName:'Website',lastName:'Applicant',email:'website@example.test',phone:'+27821234567'}})
  expect(JSON.stringify(resumed)).not.toContain(capturedContact.id)
  expect(resumed).not.toHaveProperty('details_json')
  await db.exec('reset role;')
  expect((await db.query('select * from organisation_users where user_id=$1',[applicantUser])).rows).toHaveLength(0)
})
it('rejects another agency, identity, receipt, expired session, changed email and banned or deleted accounts', async () => {
  await contactServer()
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[other,applicantUser,'f'.repeat(64),crypto.randomUUID()])).rows[0].result).toBe(false)
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[org,otherApplicant,'f'.repeat(64),contactKey])).rows[0].result).toBe(false)
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[org,applicantUser,'f'.repeat(64),crypto.randomUUID()])).rows[0].result).toBe(false)
  expect((await db.query('select recruitment_resume_applicant($1,$2) as result',[other,resumeHash])).rows[0].result).toBeNull()
  const resume = async () => (await db.query('select recruitment_resume_applicant($1,$2) as result',[org,resumeHash])).rows[0].result
  for (const update of ["banned_until=now()+interval '1 day'",'deleted_at=now()',"email='changed@example.test'"]) {
    await db.exec(`reset role; update auth.users set ${update} where id='${applicantUser}';`)
    await contactServer(); expect(await resume()).toBeNull()
    await db.exec(`reset role; update auth.users set banned_until=null,deleted_at=null,email='website@example.test' where id='${applicantUser}';`)
  }
  await db.exec(`reset role; update recruitment_applicant_sessions set expires_at=now()-interval '1 second' where token_hash='${resumeHash}';`)
  await contactServer(); expect(await resume()).toBeNull()
  // The same verified account may own a separately captured enquiry at another agency.
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[other,applicantUser,'6'.repeat(64),contactKey])).rows[0].result).toBe(true)
  const foreign = (await db.query('select recruitment_resume_applicant($1,$2) as result',[other,'6'.repeat(64)])).rows[0].result
  expect(foreign.contact.email).toBe('website@example.test')
  expect((await db.query('select recruitment_resume_applicant($1,$2) as result',[org,'6'.repeat(64)])).rows[0].result).toBeNull()
  const fresh = '7'.repeat(64)
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,null) as result',[org,applicantUser,fresh])).rows[0].result).toBe(true)
  expect((await db.query('select lead_id from recruitment_applicant_sessions where token_hash=$1',[fresh])).rows[0].lead_id).toBe(capturedContact.id)
  await db.query('select recruitment_end_applicant_session($1,$2)',[org,fresh])
  expect((await db.query('select recruitment_resume_applicant($1,$2) as result',[org,fresh])).rows[0].result).toBeNull()
})
it('keeps applicant session tables and canonical verification evidence private from anonymous users and staff', async () => {
  for (const role of ['anon','authenticated']) {
    await db.exec(`reset role; set role ${role};`)
    for (const table of ['recruitment_applicant_links','recruitment_applicant_sessions','recruitment_auth_attempts']) await expect(db.query(`select * from ${table}`)).rejects.toThrow('permission denied')
    await expect(db.query('select recruitment_open_applicant_session($1,$2,$3,null)',[org,applicantUser,'f'.repeat(64)])).rejects.toThrow('permission denied')
    await expect(db.query('select recruitment_resume_applicant($1,$2)',[org,resumeHash])).rejects.toThrow('permission denied')
    await expect(db.query('select recruitment_auth_budget($1,$2,$3)',['send','a'.repeat(64),'b'.repeat(64)])).rejects.toThrow('permission denied')
  }
  await asUser(contactManager)
  await expect(db.query("update recruitment_leads set email_verification_status='pending',email_verified_at=null where id=$1",[capturedContact.id])).rejects.toThrow('trusted applicant evidence')
  await contactServer()
  await expect(db.query("update recruitment_leads set email_verification_status='verified',email_verified_at=now() where contact_capture_json->>'email'='signup@example.test'")).rejects.toThrow('trusted applicant evidence')
  expect((await db.query("select relrowsecurity from pg_class where relname in ('recruitment_applicant_links','recruitment_applicant_sessions','recruitment_auth_attempts')")).rows.every(row=>row.relrowsecurity)).toBe(true)
})
it('reserves persistent email and authentication budgets, counts failures and rejects rapid resend across senders', async () => {
  await contactServer()
  const budget = async (kind,fp,email) => (await db.query('select recruitment_auth_budget($1,$2,$3) as result',[kind,fp.repeat(64),email.repeat(64)])).rows[0].result
  expect(await budget('send','a','b')).toBe(true)
  expect(await budget('send','c','b')).toBe(false)
  for (let index=0;index<10;index++) expect(await budget('authenticate','a','d')).toBe(true)
  expect(await budget('authenticate','c','d')).toBe(false)
  await expect(db.query('select recruitment_auth_budget(null,$1,$2)',['a'.repeat(64),'b'.repeat(64)])).rejects.toThrow('Invalid request')
})

it('runs verification, cookie resume and sign-out through the shared API against the migrated database', async () => {
  const id='abcdefab-cdef-4abc-8def-abcdefabcde9', key=crypto.randomUUID(), values={...contact,email:'flow@example.test'}
  await db.exec(`reset role; insert into auth.users(id,email) values('${id}','flow@example.test');`)
  await contactServer(); expect(await captureContact(contactLink,key,values,'8'.repeat(64))).toEqual({accepted:true,duplicate:false})
  const client=contactClient()
  const calls={
    recruitment_auth_budget: ['select recruitment_auth_budget($1,$2,$3) as result',a=>[a.p_kind,a.p_fingerprint,a.p_email_hash]],
    recruitment_open_applicant_session: ['select recruitment_open_applicant_session($1,$2,$3,$4) as result',a=>[a.p_organisation_id,a.p_user_id,a.p_token_hash,a.p_submission_key]],
    recruitment_resume_applicant: ['select recruitment_resume_applicant($1,$2) as result',a=>[a.p_organisation_id,a.p_token_hash]],
    recruitment_end_applicant_session: ['select recruitment_end_applicant_session($1,$2) as result',a=>[a.p_organisation_id,a.p_token_hash]],
  }
  client.rpc=async(name,args)=>({data:(await db.query(calls[name][0],calls[name][1](args))).rows[0].result})
  const authClient={verifyOtp:async()=>({data:{session:{access_token:'fixture-only'}}}),getUser:async()=>({data:{user:{id,email:'flow@example.test',email_confirmed_at:'2026-10-07'}}})}
  const options={client,authClient,env:{RECRUITMENT_INTAKE_FINGERPRINT_SECRET:'x'.repeat(32)},headers:{host:'agency.test',origin:'https://agency.test','x-forwarded-for':'192.0.2.90'},body:{action:'verify_email',token:contactToken,email:'flow@example.test',code:'123456',submissionKey:key,emailVerified:true,userId:otherApplicant}}
  // Even a claimed verified provider result cannot bypass canonical Auth evidence.
  expect((await createRecruitmentIntakeResponse(options)).status).toBe(409)
  await db.exec(`reset role; update auth.users set email_confirmed_at=now() where id='${id}';`)
  await contactServer()
  const verified=await createRecruitmentIntakeResponse(options)
  expect(verified.status).toBe(200)
  expect(verified.body.applicant.contact.email).toBe('flow@example.test')
  const cookie=verified.headers['Set-Cookie'].split(';')[0]
  const resume={...options,headers:{...options.headers,cookie},body:{action:'resume',token:contactToken}}
  expect((await createRecruitmentIntakeResponse(resume)).body).toEqual(verified.body)
  expect((await createRecruitmentIntakeResponse({...resume,body:{action:'sign_out',token:contactToken}})).body.signedOut).toBe(true)
  expect((await createRecruitmentIntakeResponse(resume)).body.applicant).toBeNull()
  const row=(await db.query('select * from recruitment_leads where intake_key=$1',[key])).rows[0]
  expect(row.status).toBe('lead_received'); expect(row.email_verification_status).toBe('verified')
  expect(row.application_submitted_at).toBeNull()
  expect((await db.query('select count(*) from recruitment_contact_receipts where organisation_id=$1 and submission_key=$2',[org,key])).rows[0].count).toBe(1)
})

const profileOpaque = 'c'.repeat(64), profileHash=createHash('sha256').update(profileOpaque).digest('hex')
let profileAnswers
function profileDbClient() {
  const client=contactClient()
  const calls={
    recruitment_submit_verified_profile:['select recruitment_submit_verified_profile($1,$2,$3,$4,$5,$6) as result',a=>[a.p_organisation_id,a.p_token_hash,a.p_revision,a.p_submission_key,a.p_privacy_accepted,a.p_declaration_accepted]],
    recruitment_save_profile:['select recruitment_save_profile($1,$2,$3::jsonb,$4,$5,$6) as result',a=>[a.p_organisation_id,a.p_token_hash,JSON.stringify(a.p_answers),a.p_revision,a.p_page,a.p_intent]],
    recruitment_resume_applicant:['select recruitment_resume_applicant($1,$2) as result',a=>[a.p_organisation_id,a.p_token_hash]],
  }
  client.rpc=async(name,args)=>({data:(await db.query(calls[name][0],calls[name][1](args))).rows[0].result})
  return client
}
function profileApi(body, headers = {}) {
  return createRecruitmentIntakeResponse({client:profileDbClient(),env:{RECRUITMENT_INTAKE_FINGERPRINT_SECRET:'x'.repeat(32)},headers:{host:'agency.test',origin:'https://agency.test',cookie:`a9_recruitment_${org.replaceAll('-','')}=${profileOpaque}`,...headers},body:{token:contactToken,...body}})
}
it('installs the questionnaire after verified access and saves incomplete answers against the same lead through the API',async()=>{
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261007091149_recruitment_applicant_questionnaire.sql',import.meta.url),'utf8'))
  profileAnswers=(await import('./helpers/recruitmentProfileFixture')).validProfile()
  await contactServer()
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[org,applicantUser,profileHash,contactKey])).rows[0].result).toBe(true)
  const response=await profileApi({action:'save_profile',answers:{email:'website@example.test',firstName:'Website',lastName:'Applicant',password:'must-never-be-stored'},page:0,revision:0,intent:'save',leadId:otherLead,organisationId:other})
  expect(response.status).toBe(200)
  expect(response.body.applicant.profile).toMatchObject({version:'recruitment-profile-v1',country:'ZA',complete:false,page:0,answers:{firstName:'Website',dateOfBirth:''}})
  expect(response.body.applicant.profileRevision).toBe(1)
  const row=(await db.query('select * from recruitment_leads where id=$1',[capturedContact.id])).rows[0]
  expect(row.status).toBe('lead_received');expect(row.application_json).toEqual({});expect(row.application_submitted_at).toBeNull()
  expect(row.contact_capture_json).toEqual(capturedContact.contact_capture_json)
  expect(JSON.stringify(row)).not.toContain('must-never-be-stored')
  expect(row.activity_json.at(-1).type).toBe('application_draft_saved')
  expect((await profileApi({action:'resume'})).body).toEqual({applicant:response.body.applicant})
})
it('recovers duplicate saves, rejects stale writes and saves a complete questionnaire without submission',async()=>{
  await contactServer()
  const request={action:'save_profile',answers:profileAnswers,page:0,revision:1,intent:'continue'}
  const saved=await profileApi(request)
  expect(saved.status).toBe(200);expect(saved.body.applicant.profileRevision).toBe(2);expect(saved.body.applicant.profile.page).toBe(1)
  expect((await profileApi(request)).body).toMatchObject({saved:true,duplicate:true,applicant:{profileRevision:2}})
  const stale=await profileApi({...request,answers:{...profileAnswers,preferredName:'Stale draft'}})
  expect(stale.status).toBe(409);expect(stale.body.conflict).toBe(true)
  const complete=await profileApi({...request,revision:2,page:3,intent:'complete'})
  expect(complete.status).toBe(200);expect(complete.body.applicant.profile.complete).toBe(true)
  expect(complete.body.applicant.stage).toBe('lead_received');expect(complete.body.applicant.applicationSubmitted).toBe(false)
  const row=(await db.query('select * from recruitment_leads where id=$1',[capturedContact.id])).rows[0]
  expect(row.application_json).toEqual({});expect(row.applicant_draft_revision).toBe(3)
  expect(row.applicant_draft_json.answers.propertiesListed).toBe('0')
  expect(row.applicant_draft_json.answers.propertiesSold).toBe('999')
})
it('validates supplied answers in SQL and prevents changing verified email or authoring draft evidence through staff access',async()=>{
  await contactServer()
  const save=answers=>db.query('select recruitment_save_profile($1,$2,$3::jsonb,3,3,$4) as result',[org,profileHash,JSON.stringify(answers),'complete'])
  for (const [key,value] of [['dateOfBirth','2099-01-01'],['dateOfBirth','2026-02-30'],['propertiesListed','1000'],['propertiesSold','1.5'],['postalCode','123'],['expectedStartDate','2000-01-01'],['ffcNumber',''],['ffcType','forged'],['currentEmployer','a'.repeat(101)],['southAfricanCitizen','maybe'],['email','foreign@example.test'],['whatsappNumber','123']]) {
    const result=(await save({...profileAnswers,[key]:value})).rows[0].result
    expect(result.invalid).toBe(true);expect(result.errors).toHaveProperty(key==='whatsappNumber'?'whatsappNumber':key)
  }
  expect((await save({...profileAnswers,licenseStatus:'pending'})).rows[0].result.saved).toBe(true)
  const row=(await db.query('select applicant_draft_json from recruitment_leads where id=$1',[capturedContact.id])).rows[0]
  expect(row.applicant_draft_json.answers.ffcNumber).toBe('');expect(row.applicant_draft_json.answers.ffcType).toBe('')
  await asUser(contactManager)
  // Managers can read self-declared drafts, but cannot fabricate or edit applicant answers.
  expect((await db.query('select applicant_draft_json from recruitment_leads where id=$1',[capturedContact.id])).rows).toHaveLength(1)
  await expect(db.query("update recruitment_leads set applicant_draft_json='{}' where id=$1",[capturedContact.id])).rejects.toThrow('verified access')
  await expect(db.query('update recruitment_leads set applicant_draft_revision=99 where id=$1',[capturedContact.id])).rejects.toThrow('Draft evidence')
})
it('denies anonymous, staff, other-agency, expired, revoked and banned sessions and locks submitted/closed drafts',async()=>{
  for (const role of ['anon','authenticated']) {
    await db.exec(`reset role; set role ${role};`)
    await expect(db.query("select recruitment_save_profile($1,$2,'{}',0,0,'save')",[org,profileHash])).rejects.toThrow('permission denied')
  }
  await contactServer()
  const request={action:'save_profile',answers:profileAnswers,page:3,revision:4,intent:'complete'}
  expect((await profileApi(request,{cookie:''})).status).toBe(401)
  expect((await profileApi(request,{origin:'https://foreign.test'})).status).toBe(403)
  expect((await db.query("select recruitment_save_profile($1,$2,$3::jsonb,0,0,'save') as result",[other,profileHash,JSON.stringify(profileAnswers)])).rows[0].result.unavailable).toBe(true)
  for (const update of ["banned_until=now()+interval '1 day'",'deleted_at=now()',"email='changed@example.test'"]) {
    await db.exec(`reset role; update auth.users set ${update} where id='${applicantUser}';`)
    await contactServer();expect((await profileApi(request)).status).toBe(401)
    await db.exec(`reset role; update auth.users set banned_until=null,deleted_at=null,email='website@example.test' where id='${applicantUser}';`)
  }
  await db.exec(`reset role; update recruitment_applicant_sessions set expires_at=now()-interval '1 second' where token_hash='${profileHash}';`)
  await contactServer();expect((await profileApi(request)).status).toBe(401)
  // Re-authentication restores access to the same saved revision.
  await db.query('select recruitment_open_applicant_session($1,$2,$3,$4)',[org,applicantUser,'d'.repeat(64),contactKey])
  await db.exec(`reset role; update recruitment_applicant_sessions set expires_at=now()+interval '7 days' where token_hash='${profileHash}';`)
  await asUser(contactManager)
  await db.query("update recruitment_leads set status='closed_lost' where id=$1",[capturedContact.id])
  await contactServer();expect((await profileApi(request)).status).toBe(401)
  await asUser(contactManager);await db.query("update recruitment_leads set status='lead_received' where id=$1",[capturedContact.id])
  await contactServer()
  await db.query('select recruitment_end_applicant_session($1,$2)',[org,profileHash])
  expect((await profileApi(request)).status).toBe(401)
})

it('preserves the saved draft through the existing submission workflow and prevents later applicant edits',async()=>{
  await contactServer()
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[org,applicantUser,profileHash,contactKey])).rows[0].result).toBe(true)
  const before=(await db.query('select * from recruitment_leads where id=$1',[capturedContact.id])).rows[0]
  await asUser(contactManager)
  const link=(await db.query("insert into recruitment_intake_links(organisation_id,lead_id,token_hash,channel,expires_at) values($1,$2,$3,'private_link',now()+interval '14 days') returning id",[org,capturedContact.id,'1234'.repeat(16)])).rows[0].id
  await contactServer()
  const legacyAnswers={name:'Website Applicant',email:'website@example.test',phone:'0821234567',area:'Pretoria',privacyAccepted:true,declarationAccepted:true}
  expect((await db.query('select recruitment_submit_application($1,$2,$3::jsonb,$4) as result',[link,crypto.randomUUID(),JSON.stringify(legacyAnswers),'4321'.repeat(16)])).rows[0].result.accepted).toBe(true)
  const after=(await db.query('select * from recruitment_leads where id=$1',[capturedContact.id])).rows[0]
  expect(after.status).toBe('application_submitted')
  expect(after.applicant_draft_json).toEqual(before.applicant_draft_json)
  expect(after.contact_capture_json).toEqual(before.contact_capture_json)
  expect((await profileApi({action:'resume'})).body.applicant.applicationSubmitted).toBe(true)
  expect((await profileApi({action:'save_profile',answers:profileAnswers,page:3,revision:after.applicant_draft_revision,intent:'complete'})).status).toBe(401)
})

let finalLead, finalKey, finalSubmissionKey
const finalOpaque='b'.repeat(64), finalHash=createHash('sha256').update(finalOpaque).digest('hex')
const finalApi=(body,headers={})=>profileApi(body,{cookie:`a9_recruitment_${org.replaceAll('-','')}=${finalOpaque}`,...headers})
const finalRequest = (extra={}) => ({action:'submit_profile',revision:1,submissionKey:finalSubmissionKey,privacyAccepted:true,declarationAccepted:true,...extra})
it('installs verified submission and requires a complete saved profile, current revision and both declarations',async()=>{
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261007092532_recruitment_verified_application_submission.sql',import.meta.url),'utf8'))
  await contactServer()
  finalKey=crypto.randomUUID();finalSubmissionKey=crypto.randomUUID()
  expect((await captureContact(contactLink,finalKey,contact,'7654'.repeat(16))).accepted).toBe(true)
  finalLead=(await db.query('select * from recruitment_leads where intake_key=$1',[finalKey])).rows[0]
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[org,applicantUser,finalHash,finalKey])).rows[0].result).toBe(true)
  expect((await finalApi(finalRequest({revision:0}))).status).toBe(422)
  expect((await finalApi(finalRequest({submissionKey:'forged'}))).status).toBe(400)
  expect((await finalApi(finalRequest({privacyAccepted:false}))).status).toBe(422)
  expect((await finalApi(finalRequest({declarationAccepted:'true'}))).status).toBe(422)
  expect((await db.query('select recruitment_submit_verified_profile($1,$2,0,$3,false,true) as result',[org,finalHash,finalSubmissionKey])).rows[0].result.invalid).toBe(true)
  const saved=await finalApi({action:'save_profile',answers:{...profileAnswers,firstName:'Corrected'},page:3,revision:0,intent:'complete'})
  expect(saved.status).toBe(200)
  expect((await finalApi(finalRequest({revision:0}))).status).toBe(409)
  expect((await db.query('select status from recruitment_leads where id=$1',[finalLead.id])).rows[0].status).toBe('lead_received')
  // The guard also rejects forged server snapshots without altering the saved enquiry.
  const forged={version:'recruitment-application-v1',questionnaireVersion:'recruitment-profile-v1',country:'ZA',profileRevision:1,submissionKey:finalSubmissionKey,consentVersion:'recruitment-submission-v1',answers:{privacyAccepted:true,declarationAccepted:true,firstName:'Forged'}}
  await expect(db.query("update recruitment_leads set status='application_submitted',application_json=$1::jsonb where id=$2",[JSON.stringify(forged),finalLead.id])).rejects.toThrow('saved questionnaire')

})
it('rejects submission through another agency, missing/expired sessions, unverified, banned, deleted or changed canonical accounts',async()=>{
  await contactServer()
  expect((await finalApi(finalRequest(),{cookie:''})).status).toBe(401)
  expect((await finalApi(finalRequest(),{origin:'https://foreign.test'})).status).toBe(403)
  expect((await db.query('select recruitment_submit_verified_profile($1,$2,1,$3,true,true) as result',[other,finalHash,finalSubmissionKey])).rows[0].result.unavailable).toBe(true)
  for(const update of ['email_confirmed_at=null',"banned_until=now()+interval '1 day'",'deleted_at=now()',"email='changed@example.test'"]) {
    await db.exec(`reset role; update auth.users set ${update} where id='${applicantUser}';`)
    await contactServer();expect((await finalApi(finalRequest())).status).toBe(401)
    await db.exec(`reset role; update auth.users set email_confirmed_at=now(),banned_until=null,deleted_at=null,email='website@example.test' where id='${applicantUser}';`)
  }
  await db.exec(`reset role; update recruitment_applicant_sessions set expires_at=now()-interval '1 second' where token_hash='${finalHash}';`)
  await contactServer();expect((await finalApi(finalRequest())).status).toBe(401)
  await db.exec(`reset role; update recruitment_applicant_sessions set expires_at=now()+interval '7 days' where token_hash='${finalHash}';`)
  for(const role of ['anon','authenticated']) {
    await db.exec(`reset role; set role ${role};`)
    await expect(db.query('select recruitment_submit_verified_profile($1,$2,1,$3,true,true)',[org,finalHash,finalSubmissionKey])).rejects.toThrow('permission denied')
  }
})
it('submits the exact reviewed snapshot on the same lead, stamps declarations and recovers retries without new leads or activity',async()=>{
  await contactServer()
  const count=(await db.query('select count(*) from recruitment_leads')).rows[0].count
  const request=finalRequest({answers:{firstName:'Forged'},leadId:otherLead,organisationId:other,submittedAt:'2000-01-01',consentVersion:'forged'})
  const response=await finalApi(request)
  expect(response.status).toBe(200);expect(response.body).toMatchObject({accepted:true,duplicate:false,applicant:{stage:'application_submitted',applicationSubmitted:true}})
  const row=(await db.query('select * from recruitment_leads where id=$1',[finalLead.id])).rows[0]
  expect(row.name).toBe('Corrected Applicant');expect(row.phone).toBe('+27821234567')
  expect(row.contact_capture_json).toEqual(finalLead.contact_capture_json)
  expect(row.received_at).toEqual(finalLead.received_at);expect(row.source).toBe(finalLead.source)
  expect(row.application_json).toMatchObject({version:'recruitment-application-v1',questionnaireVersion:'recruitment-profile-v1',country:'ZA',submissionKey:finalSubmissionKey,profileRevision:1,consentVersion:'recruitment-submission-v1',answers:{firstName:'Corrected',propertiesListed:'0',propertiesSold:'999',privacyAccepted:true,declarationAccepted:true},consent:{privacyAccepted:true,declarationAccepted:true,applicantUserId:applicantUser}})
  expect(row.application_json.consent.acceptedAt).toBe(row.application_json.submittedAt)
  expect(new Date(row.application_submitted_at).getTime()).toBe(new Date(row.application_json.submittedAt).getTime())
  expect(row.activity_json.filter(item=>item.type==='application_submitted')).toHaveLength(1)
  expect((await db.query('select count(*) from recruitment_leads')).rows[0].count).toBe(count)
  expect((await finalApi(request)).body.duplicate).toBe(true)
  expect((await finalApi(finalRequest({submissionKey:crypto.randomUUID()}))).body.duplicate).toBe(true)
  const retained=(await db.query('select * from recruitment_leads where id=$1',[finalLead.id])).rows[0]
  expect(retained.application_json).toEqual(row.application_json);expect(retained.version).toBe(row.version);expect(retained.activity_json).toEqual(row.activity_json)
  const resumed=(await finalApi({action:'resume'})).body.applicant
  expect(resumed.submittedApplication.answers.firstName).toBe('Corrected')
  expect(JSON.stringify(resumed)).not.toContain(applicantUser)
  expect(resumed).not.toHaveProperty('review_json');expect(resumed).not.toHaveProperty('leadId')
  expect((await finalApi({action:'save_profile',answers:profileAnswers,page:3,revision:1,intent:'complete'})).status).toBe(401)
  await db.exec('reset role;')
  expect((await db.query('select * from organisation_users where user_id=$1',[applicantUser])).rows).toHaveLength(0)
})
it('preserves immutable submission while enabling the existing staff review and keeping applicant sessions private',async()=>{
  await asUser(contactManager)
  const before=(await db.query('select * from recruitment_leads where id=$1',[finalLead.id])).rows[0]
  await expect(db.query("update recruitment_leads set application_json=jsonb_set(application_json,'{answers,firstName}','\"Forged\"') where id=$1",[finalLead.id])).rejects.toThrow()
  const review=(await db.query("update recruitment_leads set status='under_review' where id=$1 returning *",[finalLead.id])).rows[0]
  expect(review.application_json).toEqual(before.application_json)
  expect(Object.keys(review.review_json.checks)).toHaveLength(4)
  await contactServer()
  expect((await finalApi(finalRequest())).body.duplicate).toBe(true)
  await db.query('select recruitment_end_applicant_session($1,$2)',[org,finalHash])
  expect((await finalApi(finalRequest())).status).toBe(401)
})
