import { afterAll, beforeAll, expect, it } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { createRecruitmentIntakeResponse } from '../../../../server/services/recruitmentIntakeApi'
import { createHomeSeekersSignupResponse } from '../../../../server/services/homeSeekersRecruitmentSignupApi'
import { HOME_SEEKERS_ORGANISATION_ID as homeOrg } from '../../../../server/services/homeSeekersWebsiteBridge'
import { createHash } from 'node:crypto'
import { approvalConfirmation } from '../recruitmentApprovalModel'
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
  const approve = (version=reviewing.version, organisation=org, notes=approvalConfirmation) => db.query('select * from recruitment_approve_application($1,$2,$3,$4)',[organisation,reviewing.id,version,notes])
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
  expect(approved.approval_notes).toBe(approvalConfirmation)
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
      if (table === 'recruitment_applicant_sessions') {
        const filters={}
        const query={select:()=>query,eq:(key,value)=>{filters[key]=value;return query},maybeSingle:async()=>({data:(await db.query('select lead_id from recruitment_applicant_sessions where organisation_id=$1 and token_hash=$2',[filters.organisation_id,filters.token_hash])).rows[0]})}
        return query
      }
      if (table === 'recruitment_contact_receipts') {
        const filters = {}
        const query = { select: () => query, eq: (key, value) => { filters[key] = value; return query },order:()=>query,limit:()=>query, maybeSingle: async () => ({ data: (filters.lead_id ? await db.query('select submission_key from recruitment_contact_receipts where organisation_id=$1 and lead_id=$2 order by created_at desc limit 1',[filters.organisation_id,filters.lead_id]) : await db.query('select lead_id from recruitment_contact_receipts where organisation_id=$1 and link_id=$2 and submission_key=$3', [filters.organisation_id,filters.link_id,filters.submission_key])).rows[0], error: null }) }
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
  expect((await createRecruitmentIntakeResponse(request))).toMatchObject({status:201,body:{verificationRequired:true,emailVerification:'pending'}})
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
  const options={client,authClient,codeOnlyVerification:true,env:{RECRUITMENT_INTAKE_FINGERPRINT_SECRET:'x'.repeat(32)},headers:{host:'agency.test',origin:'https://agency.test','x-forwarded-for':'192.0.2.90'},body:{action:'verify_email',token:contactToken,email:'flow@example.test',code:'123456',submissionKey:key,emailVerified:true,userId:otherApplicant}}
  // Even a claimed verified provider result cannot bypass canonical Auth evidence.
  expect((await createRecruitmentIntakeResponse(options)).status).toBe(409)
  await db.exec(`reset role; update auth.users set email_confirmed_at=now() where id='${id}';`)
  await contactServer()
  const verified=await createRecruitmentIntakeResponse(options)
  expect(verified.status).toBe(200)
  expect(verified.body.applicant.contact.email).toBe('flow@example.test')
  expect(verified.body.applicant.contactSubmissionKey).toBe(key)
  const cookie=verified.headers['Set-Cookie'].split(';')[0]
  const resume={...options,headers:{...options.headers,cookie},body:{action:'resume',token:contactToken}}
  expect((await createRecruitmentIntakeResponse(resume)).body).toEqual(verified.body)
  expect((await createRecruitmentIntakeResponse({...resume,body:{action:'sign_out',token:contactToken}})).body.signedOut).toBe(true)
  expect((await createRecruitmentIntakeResponse(resume)).body.applicant).toBeNull()
  const row=(await db.query('select * from recruitment_leads where intake_key=$1',[key])).rows[0]
  expect(JSON.stringify(verified.body)).not.toContain(row.id)
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
    recruitment_prepare_applicant_document:['select recruitment_prepare_applicant_document($1,$2,$3,$4::jsonb) as result',a=>[a.p_organisation_id,a.p_token_hash,a.p_request_id,JSON.stringify(a.p_document)]],
    recruitment_commit_applicant_document:['select recruitment_commit_applicant_document($1,$2,$3) as result',a=>[a.p_organisation_id,a.p_token_hash,a.p_request_id]],
    recruitment_applicant_document_access:['select coalesce(jsonb_agg(l),\'[]\'::jsonb) as result from recruitment_applicant_document_access($1,$2) l',a=>[a.p_organisation_id,a.p_token_hash]],
  }
  client.rpc=async(name,args)=>({data:(await db.query(calls[name][0],calls[name][1](args))).rows[0].result})
  client.storage={from:bucket=>{
    if(bucket!=='recruitment-documents') throw new Error('Unexpected document bucket')
    return {
      createSignedUploadUrl:async(path,options)=>options.upsert===false ? {data:{signedUrl:`https://storage.test/upload/${path}`}} : {error:new Error('Existing uploads must be preserved')},
      createSignedUrl:async(path,seconds)=>({data:{signedUrl:`https://storage.test/download/${path}?expires=${seconds}`}}),
    }
  }}
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

// Shared joining record foundation, applied after the existing journeys.
const joiningBranch='a1111111-1111-4111-8111-111111111111', joiningCommission='a2222222-2222-4222-8222-222222222222'
const joiningPlan=()=>({version:'recruitment-joining-v1',origin:{entryPoint:'branch'},branchId:joiningBranch,role:'agent',businessWorkspaces:['sales','rentals'],commissionStructureId:joiningCommission,startDate:'2026-10-15'})
const joiningDraft=(email='joining@example.test')=>({name:'Joining Candidate',email,phone:'0821234567',source:'Referral',details_json:{notes:'Retain staff notes'},intake_key:crypto.randomUUID(),joining_json:joiningPlan()})
async function createJoining(draft, organisationId=org) { return (await db.query('select recruitment_create_joining_lead($1,$2::jsonb) result',[organisationId,JSON.stringify(draft)])).rows[0].result }
let joiningLead, joiningLegacyInvite, linkedJoiningLead

it('installs joining without changing existing records and keeps its functions invoker-scoped',async()=>{
  await db.exec('reset role;')
  const before=(await db.query('select id,version,activity_json,activation_json from recruitment_leads order by id')).rows
  await db.exec(`alter table invites add column target_branch_id uuid,add column created_at timestamptz default now();
    create table organisation_branches(id uuid primary key,organisation_id uuid,name text,is_active boolean);
    create table organisation_commission_structures(id uuid primary key,organisation_id uuid,name text,is_active boolean);
    grant select on organisation_branches,organisation_commission_structures to authenticated;
    insert into organisation_branches values('${joiningBranch}','${org}','Head Office',true),('a3333333-3333-4333-8333-333333333333','${other}','Other Office',true);
    insert into organisation_commission_structures values('${joiningCommission}','${org}','Standard',true),('a4444444-4444-4444-8444-444444444444','${other}','Other Split',true);`)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261008114647_recruitment_joining_record.sql',import.meta.url),'utf8'))
  expect((await db.query('select id,version,activity_json,activation_json from recruitment_leads order by id')).rows).toEqual(before)
  const functions=(await db.query("select proname,prosecdef,proconfig,has_function_privilege('anon',oid,'execute') as anonymous from pg_proc where proname in ('recruitment_create_joining_lead','recruitment_joining_options','recruitment_joining_connections','recruitment_find_joining_matches')")).rows
  expect(functions).toHaveLength(4)
  expect(functions.every(fn=>!fn.prosecdef && !fn.anonymous && fn.proconfig.includes('search_path=""'))).toBe(true)
  await asUser(manager)
  expect((await db.query('select recruitment_joining_options($1) result',[org])).rows[0].result).toEqual({branches:[{id:joiningBranch,name:'Head Office'}],commissionStructures:[{id:joiningCommission,name:'Standard'}]})
})

it('retains tentative joining choices and immutable origin while rejecting foreign choices and stale saves',async()=>{
  await asUser(manager)
  const result=await createJoining(joiningDraft())
  expect(result.outcome).toBe('created');joiningLead=result.lead
  expect(joiningLead.joining_json).toMatchObject({...joiningPlan(),origin:{entryPoint:'branch',source:'Referral',recordedBy:manager}})
  expect(joiningLead.status).toBe('lead_received');expect(joiningLead.activation_json).toEqual({})
  const changed=(await db.query("update recruitment_leads set joining_json=jsonb_set(joining_json,'{startDate}','\"2026-10-18\"'),source='Manual' where id=$1 and version=$2 returning *",[joiningLead.id,joiningLead.version])).rows[0]
  expect(changed.joining_json.origin).toEqual(joiningLead.joining_json.origin)
  expect(new Date(changed.received_at).toISOString()).toBe(new Date(joiningLead.received_at).toISOString())
  expect(changed.activity_json.at(-1)).toMatchObject({type:'joining_choices_saved',actorId:manager})
  expect((await db.query("update recruitment_leads set name='Stale' where id=$1 and version=$2 returning id",[joiningLead.id,joiningLead.version])).rows).toEqual([])
  await expect(db.query("update recruitment_leads set joining_json=jsonb_set(joining_json,'{origin,entryPoint}','\"agents\"') where id=$1",[joiningLead.id])).rejects.toThrow('origin cannot be changed')
  for(const patch of [{branchId:'a3333333-3333-4333-8333-333333333333'},{commissionStructureId:'a4444444-4444-4444-8444-444444444444'},{role:'principal'},{startDate:'2026-02-31'},{businessWorkspaces:['sales','sales']}]) {
    await expect(createJoining({...joiningDraft(crypto.randomUUID()+'@example.test'),joining_json:{...joiningPlan(),...patch}})).rejects.toThrow()
  }
  await db.query("update recruitment_leads set status='closed_lost' where id=$1",[joiningLead.id])
  expect((await db.query("update recruitment_leads set status='lead_received' where id=$1 returning *",[joiningLead.id])).rows[0].joining_json).toEqual(changed.joining_json)
})

it('reviews possible matches without merging and recovers creates with the same receipt key',async()=>{
  const count=(await db.query('select count(*) from recruitment_leads')).rows[0].count
  const draft=joiningDraft(' JOINING@EXAMPLE.TEST ')
  const review=await createJoining(draft)
  expect(review.outcome).toBe('review_required');expect(review.matches.leads.some(match=>match.id===joiningLead.id)).toBe(true)
  expect((await db.query('select count(*) from recruitment_leads')).rows[0].count).toBe(count)
  draft.joining_json.reviewedMatches=true
  const created=await createJoining(draft)
  expect(created.outcome).toBe('created');expect(created.lead.id).not.toBe(joiningLead.id)
  expect(created.lead.joining_json.matchReview.by).toBe(manager)
  expect((await createJoining(draft))).toEqual({outcome:'reused',lead:created.lead})
  expect((await db.query('select count(*) from recruitment_leads')).rows[0].count).toBe(count+1)
  const email=(await db.query('select email from organisation_users where user_id=$1',[recruitedUser])).rows[0].email
  expect((await createJoining({...joiningDraft(email),joining_json:{...joiningPlan(),reviewedMatches:true}})).outcome).toBe('existing_member')
  await expect(db.query('insert into recruitment_leads(organisation_id,name,email) values($1,$2,$3)',[org,'Existing Agent',email])).rejects.toThrow('already an active agency member')
})

it('links a legacy invitation explicitly without altering its token, expiry, metadata or membership',async()=>{
  joiningLegacyInvite=(await db.query("insert into invites(target_workspace_id,target_branch_id,invite_type,target_workspace_role,email,expires_at,metadata) values($1,$2,'branch_invite','agent','legacy-invite@example.test',now()+interval '14 days','{\"source\":\"original_branch_invite\"}') returning *",[org,joiningBranch])).rows[0]
  const members=(await db.query('select count(*) from organisation_users')).rows[0].count
  const draft=joiningDraft('legacy-invite@example.test')
  expect((await createJoining(draft)).outcome).toBe('review_required')
  draft.joining_json.reviewedMatches=true;draft.joining_invite_id=joiningLegacyInvite.id
  linkedJoiningLead=(await createJoining(draft)).lead
  expect(linkedJoiningLead.joining_invite_id).toBe(joiningLegacyInvite.id)
  expect(linkedJoiningLead.joining_json.inviteLinkedBy).toBe(manager)
  expect((await db.query('select * from invites where id=$1',[joiningLegacyInvite.id])).rows[0]).toEqual(joiningLegacyInvite)
  expect((await db.query('select count(*) from organisation_users')).rows[0].count).toBe(members)
  await expect(db.query("update recruitment_leads set email='changed@example.test' where id=$1",[linkedJoiningLead.id])).rejects.toThrow('email linked to an existing invitation')
  await expect(createJoining({...draft,intake_key:crypto.randomUUID()})).rejects.toThrow('already linked')
  await expect(createJoining({...joiningDraft('wrong@example.test'),joining_invite_id:joiningLegacyInvite.id})).rejects.toThrow('must match')
  const privileged=(await db.query("insert into invites(target_workspace_id,invite_type,target_workspace_role,email,expires_at) values($1,'workspace_invite','principal','privileged@example.test',now()+interval '14 days') returning id",[org])).rows[0].id
  await expect(createJoining({...joiningDraft('privileged@example.test'),joining_json:{...joiningPlan(),reviewedMatches:true},joining_invite_id:privileged})).rejects.toThrow('must match')
})

it('reads retained invitation history without exposing tokens, fingerprints or consent payloads and locks prepared joining choices',async()=>{
  const legacy=(await db.query('select recruitment_joining_connections($1,$2) result',[org,linkedJoiningLead.id])).rows[0].result
  expect(legacy.workspace[0]).toMatchObject({id:joiningLegacyInvite.id,type:'branch_invite',status:'pending'})
  const activated=(await db.query('select recruitment_joining_connections($1,$2) result',[org,activationLead.id])).rows[0].result
  expect(activated.workspace.length).toBeGreaterThanOrEqual(2)
  const application=(await db.query('select recruitment_joining_connections($1,$2) result',[org,finalLead.id])).rows[0].result
  expect(application.applications.length).toBeGreaterThan(0)
  expect(JSON.stringify({legacy,activated,application})).not.toMatch(/token|fingerprint|submission_key|payload_json/)
  await expect(db.query('select fingerprint from recruitment_application_receipts')).rejects.toThrow('permission denied')
  await expect(db.query('select payload_json from recruitment_contact_receipts')).rejects.toThrow('permission denied')
  await expect(db.query('update recruitment_leads set joining_json=$1::jsonb where id=$2',[JSON.stringify(joiningPlan()),activationLead.id])).rejects.toThrow('locked')
})

it('restricts joining records and matching to authorised agency management',async()=>{
  await asUser(agent)
  await expect(db.query('select recruitment_find_joining_matches($1,$2)',[org,'joining@example.test'])).rejects.toThrow('management access')
  expect((await db.query('select link_id,lead_id from recruitment_contact_receipts')).rows).toEqual([])
  await asUser(manager)
  await expect(db.query('select recruitment_joining_connections($1,$2)',[other,linkedJoiningLead.id])).rejects.toThrow('not found')
  await db.exec('reset role; set role anon;')
  await expect(db.query('select recruitment_joining_options($1)',[org])).rejects.toThrow('permission denied')
  await contactServer()
  await expect(db.query('select recruitment_create_joining_lead($1,$2::jsonb)',[org,JSON.stringify(joiningDraft())])).rejects.toThrow('permission denied')
})

it('preserves website signup after joining is installed and keeps staff choices out of server intake',async()=>{
  await contactServer()
  const key=crypto.randomUUID(),values={...contact,email:'phase2.website@example.test'},fingerprint=createHash('sha256').update(key).digest('hex')
  expect(await captureContact(contactLink,key,values,fingerprint)).toMatchObject({accepted:true,duplicate:false})
  const saved=(await db.query('select * from recruitment_leads where intake_key=$1',[key])).rows[0]
  expect(saved.joining_json).toMatchObject({origin:{entryPoint:'website',source:'Website',recordedBy:null},role:'agent',branchId:'',businessWorkspaces:[]})
  expect(saved.joining_invite_id).toBeNull();expect(saved.status).toBe('lead_received')
  expect(await captureContact(contactLink,key,values,fingerprint)).toMatchObject({accepted:true,duplicate:true})
  expect((await db.query('select version,joining_json from recruitment_leads where id=$1',[saved.id])).rows[0]).toEqual({version:saved.version,joining_json:saved.joining_json})
  await expect(db.query('update recruitment_leads set joining_json=$1::jsonb where id=$2',[JSON.stringify({...saved.joining_json,role:'senior_agent'}),saved.id])).rejects.toThrow('Joining choices require')
})

it('rolls back activation when another recruitment record already owns the invitation',async()=>{
  const email='already-linked-access@example.test'
  await db.exec('reset role;')
  activationLead=(await db.query('select * from recruitment_leads where id=$1',[activationLead.id])).rows[0]
  const ready=await activationFixture(email)
  const invite=(await db.query("insert into invites(target_workspace_id,invite_type,target_workspace_role,email,expires_at) values($1,'workspace_invite','agent',$2,now()+interval '7 days') returning *",[org,email])).rows[0]
  const linked=(await createJoining({...joiningDraft(email),joining_invite_id:invite.id,joining_json:{...joiningPlan(),reviewedMatches:true}})).lead
  const count=(await db.query('select count(*) from invites')).rows[0].count
  await expect(activate(ready)).rejects.toThrow('already linked to another recruitment record')
  expect((await db.query('select version,activation_json from recruitment_leads where id=$1',[ready.id])).rows[0]).toEqual({version:ready.version,activation_json:{}})
  expect((await db.query('select count(*) from invites')).rows[0].count).toBe(count)
  expect((await db.query('select * from invites where id=$1',[invite.id])).rows[0]).toEqual(invite)
  expect((await db.query('select joining_invite_id from recruitment_leads where id=$1',[linked.id])).rows[0].joining_invite_id).toBe(invite.id)
})

it('preserves a linked live branch invitation when the existing activation flow cannot reuse it',async()=>{
  const ready=await activationFixture('linked-branch-access@example.test')
  const invite=(await db.query("insert into invites(target_workspace_id,target_branch_id,invite_type,target_workspace_role,email,expires_at) values($1,$2,'branch_invite','agent',$3,now()+interval '7 days') returning *",[org,joiningBranch,ready.email])).rows[0]
  const linked=(await db.query('update recruitment_leads set joining_json=$1::jsonb,joining_invite_id=$2 where id=$3 returning *',[JSON.stringify(joiningPlan()),invite.id,ready.id])).rows[0]
  const count=(await db.query('select count(*) from invites')).rows[0].count
  await expect(activate(linked)).rejects.toThrow('Prepare a pending agent invitation')
  expect((await db.query('select joining_invite_id,activation_json,version from recruitment_leads where id=$1',[ready.id])).rows[0]).toEqual({joining_invite_id:invite.id,activation_json:{},version:linked.version})
  expect((await db.query('select count(*) from invites')).rows[0].count).toBe(count)
  expect((await db.query('select * from invites where id=$1',[invite.id])).rows[0]).toEqual(invite)
  const second=(await db.query("insert into invites(target_workspace_id,invite_type,target_workspace_role,email,expires_at) values($1,'workspace_invite','agent',$2,now()+interval '7 days') returning id",[org,ready.email])).rows[0]
  await expect(db.query('update recruitment_leads set activation_json=$1::jsonb where id=$2',[JSON.stringify({state:'awaiting_acceptance',inviteId:second.id,notes:'Confirmed onboarding and intended agent access',confirmed:true}),ready.id])).rejects.toThrow('Resolve the linked existing invitation')
  expect((await db.query('select activation_json,version from recruitment_leads where id=$1',[ready.id])).rows[0]).toEqual({activation_json:{},version:linked.version})
})

// Phase 4 runs the actual canonical invitation create/accept functions locally.
const activateJoining=(row,confirmed=true)=>db.query('select * from recruitment_activate_joining_agent($1,$2,$3,$4,$5)',[org,row.id,row.version,'Joining evidence confirmed and agent access authorised.',confirmed])
let handoverLead, handoverInvite
const handoverUser='b1111111-1111-4111-8111-111111111111'
async function handoverFixture(email,patch={}) {
  const ready=await activationFixture(email)
  return (await db.query('update recruitment_leads set joining_json=$1::jsonb where id=$2 returning *',[JSON.stringify({...joiningPlan(),role:'senior_agent',...patch}),ready.id])).rows[0]
}
async function acceptHandover(row=handoverInvite,user=handoverUser,email=handoverLead.email) {
  await db.exec(`reset role; select set_config('test.actor','${user}',false);`)
  await db.query("select set_config('test.email',$1,false)",[email])
  await db.exec('set role authenticated;')
  return (await db.query('select bridge_accept_invite($1) result',[row.token])).rows[0].result
}
it('installs handover without rewriting legacy history and limits privileged acceptance code to its trigger',async()=>{
  await db.exec(`reset role;
    grant update on organisation_branches,organisation_commission_structures to authenticated;
    alter table organisation_users add column branch_id uuid,add column primary_branch_id uuid,add column module_metadata jsonb default '{}',add column first_name text,add column last_name text,add column app_role text,add column workspace_type text,add column invited_by_user_id uuid,add column invited_at timestamptz,add column accepted_at timestamptz,add column joined_at timestamptz,add column created_by uuid,add column created_at timestamptz default now(),add column updated_at timestamptz default now();
    alter table invites add column inviter_user_id uuid,add column target_transaction_id uuid,add column target_transaction_role text,add column target_team_id uuid,add column invitee_user_id uuid,add column accepted_at timestamptz,add column updated_at timestamptz default now();
    create table profiles(id uuid primary key,email text,first_name text,last_name text,full_name text,phone_number text,onboarding_completed boolean,updated_at timestamptz);
    create table user_workspace_preferences(user_id uuid primary key,active_workspace_id uuid,active_workspace_source text,updated_at timestamptz);
    create table onboarding_events(user_id uuid,workspace_id uuid,onboarding_step text,event_type text,metadata jsonb);
    create table test_invite_events(invite_id uuid,event_type text,actor_id uuid,metadata jsonb);
    create function public.bridge_record_invite_event(uuid,text,uuid,jsonb default '{}') returns void language sql as $$ insert into test_invite_events values($1,$2,$3,$4) $$;
    create function public.bridge_random_token(integer) returns text language sql as $$ select replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','') $$;
    create function auth.jwt() returns jsonb language sql as $$ select jsonb_build_object('email',current_setting('test.email',true)) $$;
    create table organisation_user_commission_profiles(id uuid primary key default gen_random_uuid(),organisation_id uuid,organisation_user_id uuid,user_id uuid,email_address text,commission_structure_id uuid,override_agent_split_percentage numeric,effective_from date not null default current_date,is_active boolean default true,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now());
    alter table organisation_users enable row level security;
    create policy test_membership_read on organisation_users for select to authenticated using(true);
    create policy test_membership_manage on organisation_users for update to authenticated using(organisation_id='${org}' and auth.uid()='${manager}') with check(organisation_id='${org}' and auth.uid()='${manager}');
    alter table organisation_user_commission_profiles enable row level security;
    create policy test_commission_manager on organisation_user_commission_profiles for all to authenticated using(organisation_id='${org}' and auth.uid()='${manager}') with check(organisation_id='${org}' and auth.uid()='${manager}');
    grant select,insert,update on organisation_user_commission_profiles to authenticated;
    insert into profiles(id,email) values('${handoverUser}','phase4@example.test');`)
  for(const file of ['202606090011_harden_branch_invites.sql','202606090012_branch_invite_acceptance_metadata.sql','202606090013_invite_commission_profile_reconciliation.sql']) await db.exec(readFileSync(new URL('../../../../../supabase/migrations/'+file,import.meta.url),'utf8'))
  const before=(await db.query('select id,version,activation_json,joining_json,activity_json from recruitment_leads order by id')).rows
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261008125501_recruitment_activation_handover.sql',import.meta.url),'utf8'))
  expect((await db.query('select id,version,activation_json,joining_json,activity_json from recruitment_leads order by id')).rows).toEqual(before)
  const f=(await db.query("select prosecdef,proconfig,has_function_privilege('authenticated',oid,'execute') as staff,has_function_privilege('anon',oid,'execute') as anon from pg_proc where proname='recruitment_apply_accepted_joining'")).rows[0]
  expect(f).toMatchObject({prosecdef:true,staff:false,anon:false});expect(f.proconfig).toContain('search_path=""')
  await asUser(manager)
})
it('prepares the intended branch and senior-agent role, preserves the plan and creates no membership or commission before acceptance',async()=>{
  handoverLead=await handoverFixture('phase4@example.test')
  const before=(await db.query('select count(*) from organisation_users')).rows[0].count
  handoverLead=(await activateJoining(handoverLead)).rows[0]
  handoverInvite=(await db.query('select * from invites where id=$1',[handoverLead.activation_json.inviteId])).rows[0]
  expect(handoverInvite).toMatchObject({target_workspace_id:org,target_branch_id:joiningBranch,target_workspace_role:'senior_agent',invite_type:'workspace_invite',status:'pending'})
  expect(handoverInvite.metadata).toMatchObject({branch_id:joiningBranch,branch_name:'Head Office',commission_structure_id:joiningCommission,commission_structure_name:'Standard'})
  expect(handoverLead.status).toBe('onboarding_complete');expect(handoverLead.activated_at).toBeNull()
  expect(handoverLead.activation_json.joiningPlan).toMatchObject({...handoverLead.joining_json,role:'senior_agent',branchName:'Head Office',commissionName:'Standard'})
  expect((await db.query('select count(*) from organisation_users')).rows[0].count).toBe(before)
  expect((await db.query('select * from organisation_user_commission_profiles where email_address=$1',[handoverLead.email])).rows).toHaveLength(0)
  expect((await activateJoining(handoverLead)).rows[0]).toEqual(handoverLead)
  await expect(db.query("update recruitment_leads set joining_json=jsonb_set(joining_json,'{role}','\"agent\"') where id=$1",[handoverLead.id])).rejects.toThrow('locked')
})
it('requires the invited identity and atomically applies business access, commission and joining date to an existing account',async()=>{
  expect((await acceptHandover(handoverInvite,agent,'wrong@example.test')).code).toBe('invite_email_mismatch')
  expect((await db.query('select * from recruitment_leads where id=$1',[handoverLead.id])).rows).toHaveLength(0)
  expect((await acceptHandover()).success).toBe(true)
  await asUser(manager)
  const member=(await db.query('select * from organisation_users where user_id=$1',[handoverUser])).rows[0]
  expect(member).toMatchObject({organisation_id:org,branch_id:joiningBranch,primary_branch_id:joiningBranch,workspace_role:'senior_agent',status:'active',module_metadata:{businessWorkspaces:['sales','rentals'],business_workspaces:['sales','rentals'],joiningStartDate:'2026-10-15'}})
  const cp=(await db.query('select * from organisation_user_commission_profiles where user_id=$1',[handoverUser])).rows[0]
  expect(cp).toMatchObject({organisation_user_id:member.id,organisation_id:org,commission_structure_id:joiningCommission,effective_from:new Date('2026-10-15'),is_active:true,created_by:manager})
  await db.exec('reset role;')
  expect((await db.query('select count(*) from profiles where id=$1',[handoverUser])).rows[0].count).toBe(1)
  await asUser(manager)
  expect((await db.query('select status from recruitment_leads where id=$1',[handoverLead.id])).rows[0].status).toBe('onboarding_complete')
})
it('verifies resulting membership before completion and recovers an uncertain successful activation without duplication',async()=>{
  await db.exec('reset role;')
  await db.query("update organisation_users set module_metadata=jsonb_set(module_metadata,'{businessWorkspaces}','[\"sales\"]') where user_id=$1",[handoverUser])
  await asUser(manager)
  await expect(activateJoining(handoverLead)).rejects.toThrow('business access')
  await db.exec('reset role;')
  await db.query("update organisation_users set module_metadata=jsonb_set(module_metadata,'{businessWorkspaces}','[\"sales\",\"rentals\"]') where user_id=$1",[handoverUser])
  await asUser(manager)
  const completed=(await activateJoining(handoverLead)).rows[0]
  expect(completed).toMatchObject({status:'agent_activated',activated_by:manager,activation_json:{state:'active',role:'senior_agent',userId:handoverUser,joiningPlan:{branchId:joiningBranch},commissionProfileId:expect.any(String)}})
  expect(completed.onboarding_snapshot).toEqual(handoverLead.onboarding_snapshot)
  expect(completed.activity_json.at(-1).type).toBe('agent_activated')
  expect((await activateJoining({...completed,version:1})).rows[0]).toEqual(completed)
  expect((await db.query('select count(*) from organisation_users where user_id=$1',[handoverUser])).rows[0].count).toBe(1)
  expect((await db.query('select count(*) from organisation_user_commission_profiles where user_id=$1',[handoverUser])).rows[0].count).toBe(1)
})
it('reuses a linked live branch invitation unchanged rather than creating a second invitation',async()=>{
  const ready=await handoverFixture('phase4-linked@example.test',{role:'agent'})
  const invitation=(await db.query("select bridge_create_invite($1::jsonb) result",[JSON.stringify({target_workspace_id:org,target_branch_id:joiningBranch,target_workspace_role:'agent',invite_type:'branch_invite',email:ready.email,expires_at:'2026-12-31',metadata:{source:'existing_staff'}})])).rows[0].result
  const original=(await db.query('select * from invites where id=$1',[invitation.invite_id])).rows[0]
  const linked=(await db.query('update recruitment_leads set joining_invite_id=$1 where id=$2 returning *',[original.id,ready.id])).rows[0]
  const count=(await db.query('select count(*) from invites')).rows[0].count
  const prepared=(await activateJoining(linked)).rows[0]
  expect(prepared.activation_json.inviteId).toBe(original.id)
  expect((await db.query('select count(*) from invites')).rows[0].count).toBe(count)
  expect((await db.query('select * from invites where id=$1',[original.id])).rows[0]).toEqual(original)
})
it('rejects incomplete, commercial and unavailable choices before preparing any access',async()=>{
  for(const patch of [{branchId:''},{businessWorkspaces:[]},{startDate:''},{role:'commercial_broker'},{businessWorkspaces:['commercial']}]) {
    const ready=await handoverFixture(crypto.randomUUID()+'@example.test',patch)
    const before=(await db.query('select count(*) from invites')).rows[0].count
    await expect(activateJoining(ready)).rejects.toThrow()
    expect((await db.query('select count(*) from invites')).rows[0].count).toBe(before)
  }
  const ready=await handoverFixture('unavailable-branch@example.test')
  await db.exec(`reset role; update organisation_branches set is_active=false where id='${joiningBranch}';`)
  await asUser(manager)
  await expect(activateJoining(ready)).rejects.toThrow('active joining branch')
  await db.exec(`reset role; update organisation_branches set is_active=true where id='${joiningBranch}';`)
  await asUser(manager)
})
it('preserves mismatched existing invitations, roles and branches without making access changes',async()=>{
  const ready=await handoverFixture('phase4-wrong-invite@example.test')
  const bad=(await db.query("insert into invites(target_workspace_id,target_branch_id,invite_type,target_workspace_role,email,expires_at) values($1,$2,'branch_invite','admin',$3,now()+interval '7 days') returning *",[org,joiningBranch,ready.email])).rows[0]
  const before=(await db.query('select count(*) from invites')).rows[0].count
  await expect(activateJoining(ready)).rejects.toThrow('pending agent invitation matching')
  expect((await db.query('select * from invites where id=$1',[bad.id])).rows[0]).toEqual(bad)
  expect((await db.query('select count(*) from invites')).rows[0].count).toBe(before)
})
it('rolls back canonical acceptance when an existing commission conflicts, preserving the pending invite and membership state',async()=>{
  const ready=await handoverFixture('phase4-conflict@example.test')
  const prepared=(await activateJoining(ready)).rows[0]
  const invite=(await db.query('select * from invites where id=$1',[prepared.activation_json.inviteId])).rows[0]
  await db.query("insert into organisation_user_commission_profiles(organisation_id,email_address,commission_structure_id,effective_from) values($1,$2,$3,'2026-11-01')",[org,ready.email,joiningCommission])
  const user=crypto.randomUUID()
  await expect(acceptHandover(invite,user,ready.email)).rejects.toThrow('commission differs')
  await asUser(manager)
  expect((await db.query('select status from invites where id=$1',[invite.id])).rows[0].status).toBe('pending')
  expect((await db.query('select * from organisation_users where user_id=$1',[user])).rows).toHaveLength(0)
  expect((await db.query('select organisation_user_id,effective_from::text from organisation_user_commission_profiles where email_address=$1',[ready.email])).rows[0]).toEqual({organisation_user_id:null,effective_from:'2026-11-01'})
})
it('retains legacy prepared access and restricts activation to current management and organisation',async()=>{
  const ready=await activationFixture('phase4-legacy@example.test')
  // An invitation already prepared before this migration keeps its original contract.
  await db.exec('reset role; alter table recruitment_leads disable trigger user;')
  const invite=(await db.query("insert into invites(target_workspace_id,invite_type,target_workspace_role,email,expires_at) values($1,'workspace_invite','agent',$2,now()+interval '7 days') returning *",[org,ready.email])).rows[0]
  await db.query("update recruitment_leads set activation_json=$1::jsonb where id=$2",[JSON.stringify({state:'awaiting_acceptance',inviteId:invite.id,email:ready.email,role:'agent',preparedAt:'2026-10-05'}),ready.id])
  await db.exec('alter table recruitment_leads enable trigger user;')
  await asUser(manager)
  const retained=(await db.query('select * from recruitment_leads where id=$1',[ready.id])).rows[0]
  expect((await activateJoining(retained)).rows[0]).toEqual(retained)
  await asUser(agent);await expect(activateJoining(retained)).rejects.toThrow('management access')
  await db.exec('reset role; set role anon;');await expect(activateJoining(retained)).rejects.toThrow('permission denied')
  await asUser(manager)
})
it('prepares fresh expired access with the same reviewed plan and retains the old receipt in history',async()=>{
  const ready=await handoverFixture('phase4-expired@example.test')
  const prepared=(await activateJoining(ready)).rows[0]
  await db.exec('reset role;')
  await db.query("update invites set expires_at=now()-interval '1 day' where id=$1",[prepared.activation_json.inviteId])
  await asUser(manager)
  const renewed=(await activateJoining(prepared)).rows[0]
  expect(renewed.activation_json.inviteId).not.toBe(prepared.activation_json.inviteId)
  expect(renewed.activation_json.joiningPlan).toEqual(prepared.activation_json.joiningPlan)
  const {history:_history,...priorReceipt}=prepared.activation_json
  expect(renewed.activation_json.history.at(-1)).toEqual(priorReceipt)
})
it('accepts an explicitly reviewed no-commission setup without creating a commission profile',async()=>{
  const ready=await handoverFixture('phase4-no-commission@example.test',{commissionStructureId:'',businessWorkspaces:['short_term_rentals']})
  const prepared=(await activateJoining(ready)).rows[0]
  const invite=(await db.query('select * from invites where id=$1',[prepared.activation_json.inviteId])).rows[0]
  const user=crypto.randomUUID()
  expect((await acceptHandover(invite,user,ready.email)).success).toBe(true)
  await asUser(manager)
  const complete=(await activateJoining(prepared)).rows[0]
  expect(complete.status).toBe('agent_activated')
  expect(complete.activation_json.commissionProfileId).toBeNull()
  expect((await db.query('select * from organisation_user_commission_profiles where user_id=$1',[user])).rows).toHaveLength(0)
})
it('refuses to transfer or change the role of an existing active member as a side effect of activation',async()=>{
  const ready=await handoverFixture('phase4-existing-staff@example.test')
  await db.exec('reset role;')
  const member=(await db.query("insert into organisation_users(organisation_id,user_id,email,status,role,workspace_role,branch_id,primary_branch_id,module_metadata) values($1,$2,$3,'active','agent','agent',$4,$4,'{\"retain\":true}') returning *",[org,crypto.randomUUID(),ready.email,joiningBranch])).rows[0]
  await asUser(manager)
  const count=(await db.query('select count(*) from invites')).rows[0].count
  await expect(activateJoining(ready)).rejects.toThrow('branch or role differs')
  expect((await db.query('select * from organisation_users where id=$1',[member.id])).rows[0]).toEqual(member)
  expect((await db.query('select count(*) from invites')).rows[0].count).toBe(count)
})

// Phase 5 replays the new append-only migration over all prior recruitment phases.
const branchManager='c1111111-1111-4111-8111-111111111111', owner='c2222222-2222-4222-8222-222222222222', brokerUser='c3333333-3333-4333-8333-333333333333'
let branchReceipt, commercialLead, commercialInvite
const captureBranch=(contact,branch=joiningBranch,organisation=org)=>db.query('select recruitment_capture_branch_joining($1,$2,$3::jsonb) result',[organisation,branch,JSON.stringify(contact)])
it('installs Phase 5 without rewriting recruitment and keeps privileged helpers private',async()=>{
 await db.exec(`reset role; alter table organisation_users add column module_context text;
 create table organisation_modules(organisation_id uuid,module_key text,status text);
 grant select on organisation_modules to authenticated;
 insert into organisation_modules values('${org}','commercial','active');
 insert into organisation_users(id,organisation_id,user_id,status,role,workspace_role,branch_id,primary_branch_id,email) values(gen_random_uuid(),'${org}','${branchManager}','active','branch_manager','branch_manager','${joiningBranch}','${joiningBranch}','branchmanager@example.test'),(gen_random_uuid(),'${org}','${owner}','active','owner','owner',null,null,'owner@example.test');`)
 const before=(await db.query('select id,version,joining_json,activation_json from recruitment_leads order by id')).rows
 await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261008131645_recruitment_entry_avenues.sql',import.meta.url),'utf8'))
 expect((await db.query('select id,version,joining_json,activation_json from recruitment_leads order by id')).rows).toEqual(before)
 const helpers=(await db.query("select p.proname,p.prosecdef,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='recruitment_private'")).rows
 expect(helpers).toHaveLength(3); expect(helpers.every((f)=>!f.anon && f.proconfig.includes('search_path=""'))).toBe(true)
 expect(helpers.filter((f)=>f.prosecdef).map((f)=>f.proname).sort()).toEqual(['branch_progress','capture_branch'])
 await asUser(branchManager)
})
it('captures a branch enquiry idempotently with no private fields, approval or access grants',async()=>{
 const contact={name:'Branch Applicant',email:'branch-phase5@example.test',phone:'',intake_key:crypto.randomUUID(),joining_json:{role:'principal'},status:'agent_activated',details_json:{notes:'forged'}}
 branchReceipt=(await captureBranch(contact)).rows[0].result
 expect(Object.keys(branchReceipt).sort()).toEqual(['id','name','status']);expect(branchReceipt.status).toBe('lead_received')
 expect((await captureBranch(contact)).rows[0].result).toEqual(branchReceipt)
 expect((await db.query('select * from recruitment_leads')).rows).toHaveLength(0)
 expect((await db.query("select * from storage.objects where bucket_id like 'recruitment-%'")).rows).toHaveLength(0)
 await expect(db.query("insert into recruitment_leads(organisation_id,name,email) values($1,'Forbidden','forged@example.test')",[org])).rejects.toThrow()
 await expect(db.query("select recruitment_activate_joining_agent_v2($1,$2,1,'Forged approval',true)",[org,branchReceipt.id])).rejects.toThrow('management')
 await asUser(manager)
 const saved=(await db.query('select * from recruitment_leads where id=$1',[branchReceipt.id])).rows[0]
 expect(saved).toMatchObject({captured_by:branchManager,status:'lead_received',details_json:{},joining_json:{origin:{entryPoint:'branch',recordedBy:branchManager},branchId:joiningBranch,role:'agent',businessWorkspaces:[],commissionStructureId:'',startDate:''}})
 expect((await db.query('select * from invites where email=$1',[contact.email])).rows).toHaveLength(0)
 await asUser(branchManager)
})
it('exposes only same-branch name/stage summaries and blocks foreign, inactive and non-manager calls',async()=>{
 const progress=(await db.query('select recruitment_branch_joining_progress($1,$2) result',[org,joiningBranch])).rows[0].result
 expect(progress.find((r)=>r.id===branchReceipt.id)).toMatchObject({name:'Branch Applicant',status:'lead_received',joining_branch_id:joiningBranch})
 expect(progress.every((r)=>Object.keys(r).sort().join(',')==='activation_state,id,joining_branch_id,name,status')).toBe(true)
 await expect(captureBranch({name:'Foreign',email:'foreign@example.test',intake_key:crypto.randomUUID()},'d1111111-1111-4111-8111-111111111111')).rejects.toThrow('management')
 await expect(db.query('select recruitment_branch_joining_progress($1,$2)',[other,joiningBranch])).rejects.toThrow('management')
 await expect(captureBranch({name:'Duplicate',email:'branch-phase5@example.test',intake_key:crypto.randomUUID()})).rejects.toThrow('principal review')
 await expect(captureBranch({name:'Existing',email:'sam@example.test',intake_key:crypto.randomUUID()})).rejects.toThrow('principal review')
 await asUser(agent)
 await expect(db.query('select recruitment_branch_joining_progress($1,$2)',[org,joiningBranch])).rejects.toThrow('management')
 await expect(captureBranch({name:'Forbidden',phone:'0821234567',intake_key:crypto.randomUUID()})).rejects.toThrow('management')
 await db.exec(`reset role; update organisation_users set status='inactive' where user_id='${branchManager}';`)
 await asUser(branchManager)
 await expect(db.query('select recruitment_branch_joining_progress($1,$2)',[org,joiningBranch])).rejects.toThrow('management')
 await db.exec(`reset role; update organisation_users set status='active' where user_id='${branchManager}';`)
 await asUser(manager)
})
it('captures agency setup recruits with stable receipts and preserves duplicate and existing-staff routes',async()=>{
 const capture=(contact)=>db.query('select recruitment_capture_setup_joining($1,$2::jsonb) result',[org,JSON.stringify(contact)])
 const contact={name:'Setup Agent',email:'setup-phase5@example.test',receipt:'setup-draft-1',branchName:'Head Office'}
 const created=(await capture(contact)).rows[0].result
 expect(created.outcome).toBe('created');expect((await capture(contact)).rows[0].result).toEqual({...created,outcome:'reused'})
 const saved=(await db.query('select * from recruitment_leads where id=$1',[created.id])).rows[0]
 expect(saved.joining_json).toMatchObject({origin:{entryPoint:'agency_setup'},branchId:joiningBranch,role:'agent',businessWorkspaces:[]})
 expect((await db.query('select * from invites where email=$1',[contact.email])).rows).toHaveLength(0)
 expect((await capture({...contact,receipt:'another-draft'})).rows[0].result.outcome).toBe('review_required')
 await expect(capture({...contact,receipt:'foreign-branch',branchName:'Missing'})).rejects.toThrow('unique active')
 await asUser(branchManager)
 await expect(capture({...contact,receipt:'forbidden'})).rejects.toThrow('management')
 await asUser(manager)
})
it('prepares and accepts a Commercial broker through the canonical invitation without early membership',async()=>{
 commercialLead=await handoverFixture('broker-phase5@example.test',{role:'commercial_broker',businessWorkspaces:['commercial']})
 commercialLead=(await db.query('select * from recruitment_activate_joining_agent_v2($1,$2,$3,$4,true)',[org,commercialLead.id,commercialLead.version,'Commercial joining plan reviewed and authorised.'])).rows[0]
 commercialInvite=(await db.query('select * from invites where id=$1',[commercialLead.activation_json.inviteId])).rows[0]
 expect(commercialInvite.target_workspace_role).toBe('commercial_broker');expect(commercialLead.activation_json.joiningPlan.businessWorkspaces).toEqual(['commercial'])
 expect((await db.query('select * from organisation_users where email=$1',[commercialLead.email])).rows).toHaveLength(0)
 expect((await acceptHandover(commercialInvite,brokerUser,commercialLead.email)).success).toBe(true)
 await asUser(manager)
 const membership=(await db.query('select * from organisation_users where user_id=$1',[brokerUser])).rows[0]
 expect(membership).toMatchObject({workspace_role:'commercial_broker',module_context:'commercial',branch_id:joiningBranch,module_metadata:{module:'commercial',commercial_role:'commercial_broker',businessWorkspaces:['commercial']}})
 commercialLead=(await db.query('select * from recruitment_activate_joining_agent_v2($1,$2,$3,$4,true)',[org,commercialLead.id,commercialLead.version,'Commercial acceptance and membership verified.'])).rows[0]
 expect(commercialLead.status).toBe('agent_activated')
})
it('fails Commercial preparation for disabled modules or inconsistent role/business choices',async()=>{
 const ready=await handoverFixture('broker-disabled@example.test',{role:'commercial_broker',businessWorkspaces:['commercial']})
 await db.exec("reset role; update organisation_modules set status='inactive';")
 await asUser(manager)
 await expect(activateJoining(ready)).rejects.toThrow('Enable the Commercial module')
 await db.exec("reset role; update organisation_modules set status='active';")
 await asUser(manager)
 const inconsistent=await handoverFixture('broker-wrong-role@example.test',{role:'agent',businessWorkspaces:['commercial']})
 await expect(activateJoining(inconsistent)).rejects.toThrow('broker role')
})
it('gives agency owners principal-level recruitment access without admitting support staff',async()=>{
 await asUser(owner)
 expect((await db.query('select * from recruitment_leads where id=$1',[branchReceipt.id])).rows).toHaveLength(1)
 const options=(await db.query('select recruitment_joining_options($1) result',[org])).rows[0].result
 expect(options.branches.some((b)=>b.id===joiningBranch)).toBe(true)
 await asUser(agent)
 expect((await db.query('select * from recruitment_leads where id=$1',[branchReceipt.id])).rows).toHaveLength(0)
 await expect(db.query('select recruitment_joining_options($1)',[org])).rejects.toThrow('management')
})
it('preserves website and campaign entry origins after Phase 5 without inviting or granting staff access',async()=>{
 await db.exec('reset role;')
 const beforeMembers=(await db.query('select count(*) from organisation_users')).rows[0].count
 const beforeInvites=(await db.query('select count(*) from invites')).rows[0].count
 for(const channel of ['website','public_link']) {
  await asUser(manager)
  const hash=createHash('sha256').update(crypto.randomUUID()).digest('hex')
  const entry=(await db.query("insert into recruitment_intake_links(organisation_id,created_by,channel,token_hash,expires_at) values($1,$2,$3,$4,now()+interval '14 days') returning id",[org,manager,channel,hash])).rows[0]
  const key=crypto.randomUUID(), values={...contact,email:`phase5-${channel}@example.test`}
  await contactServer()
  expect(await captureContact(entry.id,key,values,hash)).toMatchObject({accepted:true,duplicate:false})
  const saved=(await db.query('select * from recruitment_leads where intake_key=$1',[key])).rows[0]
  expect(saved.joining_json.origin.entryPoint).toBe(channel)
  expect(saved).toMatchObject({status:'lead_received',joining_invite_id:null,activation_json:{}})
 }
 await db.exec('reset role;')
 expect((await db.query('select count(*) from organisation_users')).rows[0].count).toBe(beforeMembers)
 expect((await db.query('select count(*) from invites')).rows[0].count).toBe(beforeInvites)
})
it('reactivates returning staff without creating a recruitment record or replacing their role, branch and commission',async()=>{
 const user=crypto.randomUUID(), email='returning-phase5@example.test'
 await db.exec('reset role;')
 const member=(await db.query("insert into organisation_users(organisation_id,user_id,email,status,role,workspace_role,organisation_role,branch_id,primary_branch_id,module_metadata,accepted_at,joined_at) values($1,$2,$3,'inactive','senior_agent','senior_agent','senior_agent',$4,$4,'{\"retained\":true}','2025-01-01','2025-01-01') returning *",[org,user,email,joiningBranch])).rows[0]
 const cp=(await db.query("insert into organisation_user_commission_profiles(organisation_id,organisation_user_id,user_id,email_address,commission_structure_id,effective_from) values($1,$2,$3,$4,$5,'2025-01-01') returning *",[org,member.id,user,email,joiningCommission])).rows[0]
 await asUser(manager)
 const made=(await db.query("select bridge_create_invite(jsonb_build_object('invite_type','workspace_invite','target_workspace_id',$1::uuid,'target_branch_id',$2::uuid,'target_workspace_role','agent','email',$3::text,'metadata',jsonb_build_object('access_purpose','existing_staff'))) result",[org,joiningBranch,email])).rows[0].result
 expect(made.success).toBe(true)
 const invite=(await db.query('select * from invites where id=$1',[made.invite_id])).rows[0]
 expect((await acceptHandover(invite,user,email)).success).toBe(true)
 await asUser(manager)
 const after=(await db.query('select * from organisation_users where id=$1',[member.id])).rows[0]
 expect(after).toMatchObject({user_id:user,status:'active',workspace_role:'senior_agent',role:'senior_agent',branch_id:joiningBranch,primary_branch_id:joiningBranch,module_metadata:{retained:true},joined_at:new Date('2025-01-01')})
 const retained=(await db.query('select * from organisation_user_commission_profiles where id=$1',[cp.id])).rows[0]
 expect({...retained,updated_at:cp.updated_at}).toEqual(cp)
 expect(retained.updated_at.getTime()).toBeGreaterThanOrEqual(cp.updated_at.getTime())
 expect((await db.query('select * from recruitment_leads where email=$1',[email])).rows).toHaveLength(0)
})
it('keeps transfers in the staff workflow by refusing invitation acceptance into a different branch',async()=>{
 const user=crypto.randomUUID(),email='transfer-phase5@example.test', branch='d1111111-1111-4111-8111-111111111111'
 await db.exec('reset role;')
 await db.query("insert into organisation_branches(id,organisation_id,name,is_active) values($1,$2,'Transfer Office',true)",[branch,org])
 const member=(await db.query("insert into organisation_users(organisation_id,user_id,email,status,role,workspace_role,branch_id,primary_branch_id,module_metadata) values($1,$2,$3,'active','agent','agent',$4,$4,'{\"retain\":true}') returning *",[org,user,email,joiningBranch])).rows[0]
 await asUser(manager)
 const made=(await db.query("select bridge_create_invite(jsonb_build_object('invite_type','workspace_invite','target_workspace_id',$1::uuid,'target_branch_id',$2::uuid,'target_workspace_role','agent','email',$3::text,'metadata',jsonb_build_object('access_purpose','existing_staff'))) result",[org,branch,email])).rows[0].result
 const invite=(await db.query('select * from invites where id=$1',[made.invite_id])).rows[0]
 expect((await acceptHandover(invite,user,email)).code).toBe('existing_membership_branch_mismatch')
 await asUser(manager)
 expect((await db.query('select * from organisation_users where id=$1',[member.id])).rows[0]).toEqual(member)
 expect((await db.query('select status from invites where id=$1',[invite.id])).rows[0].status).toBe('pending')
})
it('retains Commercial intent on a bounded branch enquiry without granting broker access',async()=>{
 await asUser(branchManager)
 const contact={name:'Branch Broker',email:'branch-broker-phase5@example.test',intake_key:crypto.randomUUID(),entryPoint:'commercial_brokers'}
 const receipt=(await captureBranch(contact)).rows[0].result
 const progress=(await db.query('select recruitment_branch_joining_progress($1,$2,0,true) result',[org,joiningBranch])).rows[0].result
 expect(progress.some((r)=>r.id===receipt.id)).toBe(true)
 expect(progress.some((r)=>r.id===branchReceipt.id)).toBe(false)
 await asUser(manager)
 const saved=(await db.query('select * from recruitment_leads where id=$1',[receipt.id])).rows[0]
 expect(saved).toMatchObject({status:'lead_received',joining_json:{origin:{entryPoint:'commercial_brokers',recordedBy:branchManager},role:'commercial_broker',businessWorkspaces:['commercial'],branchId:joiningBranch,commissionStructureId:'',startDate:''},activation_json:{}})
 expect((await db.query('select * from invites where email=$1',[contact.email])).rows).toHaveLength(0)
 expect((await db.query('select * from organisation_users where email=$1',[contact.email])).rows).toHaveLength(0)
})

let emailLead,emailLink,emailAttempt,workspaceEmailLead,workspaceEmailInvite
const mailHash=createHash('sha256').update('phase6-private-email-link').digest('hex')
async function emailServer() {await db.exec("reset role; select set_config('test.actor','',false); set role service_role;")}
async function beginEmail({actor=manager,candidate=emailLead,kind='application',reference=emailLink,id=crypto.randomUUID(),hash=mailHash,message={to:candidate.email,html:'private-link'},allow=false}={}) {
 return (await db.query('select recruitment_begin_invitation_email($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) result',[actor,org,candidate.id,kind,reference,id,hash,JSON.stringify(message),allow])).rows[0].result
}
async function finishEmail(attempt,status,provider=null) {return (await db.query('select recruitment_finish_invitation_email($1,$2,$3,$4,$5) result',[attempt.id,attempt.lease_id,status,provider,status==='unknown'?'provider_result_uncertain':null])).rows[0].result}
it('installs private server-authored email receipts and distinguishes prepared application links',async()=>{
 await db.exec('reset role;')
 await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261008135223_recruitment_invitation_delivery.sql',import.meta.url),'utf8'))
 await asUser(manager)
 emailLead=(await createJoining({name:'Delivery Applicant',email:'phase6-delivery@example.test',intake_key:crypto.randomUUID()})).lead
 emailLink=(await db.query("insert into recruitment_intake_links(organisation_id,lead_id,channel,token_hash,expires_at) values($1,$2,'private_link',$3,now()+interval '14 days') returning id",[org,emailLead.id,mailHash])).rows[0].id
 const result=(await db.query('select recruitment_invitation_status($1,$2,$3,$4) result',[org,emailLead.id,'application',emailLink])).rows[0].result
 expect(result).toMatchObject({referenceStatus:'prepared',attempt:null,recipient:emailLead.email})
 await expect(beginEmail()).rejects.toThrow('permission denied')
 await expect(db.query('select message_json from recruitment_invitation_deliveries')).rejects.toThrow('permission denied')
 await emailServer()
 emailAttempt=(await beginEmail()).attempt
 expect(emailAttempt.status).toBe('sending')
 await asUser(manager)
 expect((await db.query('select recruitment_invitation_status($1,$2,$3,$4) result',[org,emailLead.id,'application',emailLink])).rows[0].result.attempt).not.toHaveProperty('message_json')
 await asUser(branchManager)
 expect((await db.query('select id,status from recruitment_invitation_deliveries')).rows).toHaveLength(0)
 await expect(db.query('select recruitment_invitation_status($1,$2,$3,$4)',[org,emailLead.id,'application',emailLink])).rejects.toThrow('management')
 await emailServer()
 await expect(beginEmail({actor:branchManager})).rejects.toThrow('management')
 await expect(beginEmail({hash:'wrong'})).rejects.toThrow('does not match')
})
it('reuses an uncertain provider request and prevents concurrent or duplicate retries',async()=>{
 await emailServer()
 const busy=await beginEmail()
 expect(busy).toMatchObject({send:false,busy:true,attempt:{id:emailAttempt.id}})
 expect(await finishEmail(emailAttempt,'unknown')).toBe(true)
 const recovered=await beginEmail({message:{to:emailLead.email,html:'changed-but-not-sent'}})
 expect(recovered.send).toBe(true)
 expect(recovered.attempt.id).toBe(emailAttempt.id)
 expect(recovered.attempt.message_json.html).toBe('private-link')
 expect(await finishEmail(emailAttempt,'failed')).toBe(false) // stale worker cannot overwrite this lease
 emailAttempt=recovered.attempt
 expect(await finishEmail(emailAttempt,'provider_accepted','provider-message')).toBe(true)
 expect((await beginEmail({id:emailAttempt.id})).send).toBe(false)
 await asUser(manager)
 expect((await db.query('select status from recruitment_leads where id=$1',[emailLead.id])).rows[0].status).toBe('lead_received')
 expect((await db.query('select count(*) from invites where email=$1',[emailLead.email])).rows[0].count).toBe(0)
 expect((await db.query('select count(*) from organisation_users where email=$1',[emailLead.email])).rows[0].count).toBe(0)
})
it('permits explicit resends after acceptance while preserving history and requiring review outside the retry window',async()=>{
 await db.exec('reset role;')
 await db.query("update recruitment_invitation_deliveries set created_at=now()-interval '2 minutes' where id=$1",[emailAttempt.id])
 await emailServer()
 const fresh=(await beginEmail()).attempt
 expect(fresh.id).not.toBe(emailAttempt.id)
 expect(await finishEmail(fresh,'unknown')).toBe(true)
 await db.exec('reset role;')
 await db.query("update recruitment_invitation_deliveries set created_at=now()-interval '24 hours' where id=$1",[fresh.id])
 // Ensure this is the latest attempt even though the clock was moved for the fixture.
 await db.query("update recruitment_invitation_deliveries set created_at=now()-interval '25 hours' where id=$1",[emailAttempt.id])
 await emailServer()
 await expect(beginEmail()).rejects.toThrow('uncertain')
 await expect(beginEmail({id:fresh.id,allow:true})).rejects.toThrow('Retry window ended')
 const reviewed=(await beginEmail({allow:true})).attempt
 expect(reviewed.id).not.toBe(fresh.id)
 await finishEmail(reviewed,'failed')
 const retry=await beginEmail({id:reviewed.id})
 expect(retry.attempt.id).toBe(reviewed.id)
 await finishEmail(retry.attempt,'provider_accepted','reviewed-provider-id')
})
it('blocks expired/revoked/mismatched application sends and protects receipts from forged client writes',async()=>{
 await asUser(manager)
 await expect(db.query('insert into recruitment_invitation_deliveries(id,organisation_id,lead_id) values(gen_random_uuid(),$1,$2)',[org,emailLead.id])).rejects.toThrow('permission denied')
 await expect(db.query("update recruitment_invitation_deliveries set status='provider_accepted' where lead_id=$1",[emailLead.id])).rejects.toThrow('permission denied')
 await db.exec('reset role;')
 await db.query("update recruitment_intake_links set created_at=now()-interval '1 day',expires_at=now()-interval '1 second' where id=$1",[emailLink])
 await emailServer()
 await expect(beginEmail()).rejects.toThrow('expired')
 await asUser(manager)
 expect((await db.query('select recruitment_invitation_status($1,$2,$3,$4) result',[org,emailLead.id,'application',emailLink])).rows[0].result.referenceStatus).toBe('expired')
 await db.exec('reset role;')
 await db.query("update recruitment_intake_links set expires_at=now()+interval '1 day',revoked_at=now() where id=$1",[emailLink])
 await emailServer()
 await expect(beginEmail()).rejects.toThrow('unavailable')
})
it('sends only the reviewed workspace invitation and verifies actual acceptance before recruitment completes',async()=>{
 workspaceEmailLead=await handoverFixture('phase6-access@example.test')
 workspaceEmailLead=(await activateJoining(workspaceEmailLead)).rows[0]
 workspaceEmailInvite=(await db.query('select * from invites where id=$1',[workspaceEmailLead.activation_json.inviteId])).rows[0]
 await emailServer()
 const delivery=await beginEmail({candidate:workspaceEmailLead,kind:'workspace',reference:workspaceEmailInvite.id,hash:null})
 expect(delivery.send).toBe(true)
 await finishEmail(delivery.attempt,'provider_accepted','workspace-email-provider-id')
 await asUser(manager)
 expect((await db.query('select recruitment_invitation_status($1,$2,$3,$4) result',[org,workspaceEmailLead.id,'workspace',workspaceEmailInvite.id])).rows[0].result).toMatchObject({referenceStatus:'prepared',attempt:{status:'provider_accepted'}})
 expect((await db.query('select count(*) from organisation_users where email=$1',[workspaceEmailLead.email])).rows[0].count).toBe(0)
 const user=crypto.randomUUID()
 expect((await acceptHandover(workspaceEmailInvite,user,workspaceEmailLead.email)).success).toBe(true)
 await asUser(manager)
 expect((await db.query('select recruitment_invitation_status($1,$2,$3,$4) result',[org,workspaceEmailLead.id,'workspace',workspaceEmailInvite.id])).rows[0].result.referenceStatus).toBe('accepted')
 const completed=(await activateJoining(workspaceEmailLead)).rows[0]
 expect(completed).toMatchObject({status:'agent_activated',activation_json:{userId:user,state:'active',joiningPlan:{branchId:joiningBranch}}})
 await emailServer()
 await expect(beginEmail({candidate:workspaceEmailLead,kind:'workspace',reference:workspaceEmailInvite.id})).rejects.toThrow('unavailable')
})
it('shows accurate directory progress while restricting branch managers to their branch and safe fields',async()=>{
 await asUser(manager)
 const rows=(await db.query('select recruitment_joining_progress($1) result',[org])).rows[0].result
 expect(rows.find(row=>row.id===emailLead.id)).toMatchObject({invitation_state:'application_revoked',email:emailLead.email})
 expect(rows.some(row=>row.id===workspaceEmailLead.id)).toBe(false) // now active, outside Joining totals
 await asUser(branchManager)
 await expect(db.query('select recruitment_joining_progress($1)',[org])).rejects.toThrow('management')
 const limited=(await db.query('select recruitment_joining_progress($1,$2,0,false,true) result',[org,joiningBranch])).rows[0].result
 expect(limited.length).toBeGreaterThan(0)
 for(const row of limited){expect(row.joining_branch_id).toBe(joiningBranch);expect(Object.keys(row).sort()).toEqual(['activation_state','id','invitation_state','joining_branch_id','name','status'])}
 await expect(db.query('select recruitment_joining_progress($1,$2,0,false,true)',[other,joiningBranch])).rejects.toThrow('joining branch')
 await asUser(agent)
 await expect(db.query('select recruitment_joining_progress($1)',[org])).rejects.toThrow('management')
})
it('blocks workspace sending after changed role, expiration or Commercial module suspension',async()=>{
 const ready=await handoverFixture('phase6-expired-access@example.test',{role:'commercial_broker',businessWorkspaces:['commercial']})
 const prepared=(await activateJoining(ready)).rows[0]
 const reference=prepared.activation_json.inviteId
 await db.exec('reset role;')
 await db.query("update invites set target_workspace_role='admin' where id=$1",[reference])
 await emailServer()
 await expect(beginEmail({candidate:prepared,kind:'workspace',reference})).rejects.toThrow('reviewed access')
 await db.exec('reset role;')
 await db.query("update invites set target_workspace_role='commercial_broker',expires_at=now()-interval '1 second' where id=$1",[reference])
 await emailServer()
 await expect(beginEmail({candidate:prepared,kind:'workspace',reference})).rejects.toThrow('expired')
 await db.exec('reset role;')
 await db.query("update invites set expires_at=now()+interval '1 day' where id=$1",[reference])
 await db.query("update organisation_modules set status='inactive' where organisation_id=$1 and module_key='commercial'",[org])
 await emailServer()
 await expect(beginEmail({candidate:prepared,kind:'workspace',reference})).rejects.toThrow('Commercial')
 await db.exec('reset role;')
 await db.query("update organisation_modules set status='active' where organisation_id=$1 and module_key='commercial'",[org])
})
it('keeps email mutation commands server-only and uses explicit definer search paths',async()=>{
 await db.exec('reset role;')
 const commands=(await db.query("select proname,prosecdef,proconfig,has_function_privilege('anon',p.oid,'EXECUTE') anon,has_function_privilege('authenticated',p.oid,'EXECUTE') client,has_function_privilege('service_role',p.oid,'EXECUTE') server from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('recruitment_begin_invitation_email','recruitment_finish_invitation_email','recruitment_invitation_status','recruitment_joining_progress')")).rows
 expect(commands).toHaveLength(4)
 for(const command of commands){expect(command.prosecdef).toBe(true);expect(command.proconfig.join(',')).toContain('search_path=');expect(command.anon).toBe(false);const mutation=['recruitment_begin_invitation_email','recruitment_finish_invitation_email'].includes(command.proname);expect(command.server).toBe(mutation);expect(command.client).toBe(!mutation)}
 await db.exec('set role anon;')
 await expect(db.query('select id from recruitment_invitation_deliveries')).rejects.toThrow('permission denied')
 await expect(db.query('select recruitment_invitation_status($1,$2,$3,$4)',[org,emailLead.id,'application',emailLink])).rejects.toThrow('permission denied')
})
it('redirects a stale failed-send retry to the latest uncertain attempt instead of sending a second request',async()=>{
 await asUser(manager)
 const candidate=(await createJoining({name:'Retry Recovery',email:'phase6-stale-retry@example.test',intake_key:crypto.randomUUID()})).lead
 const hash=createHash('sha256').update(crypto.randomUUID()).digest('hex')
 const reference=(await db.query("insert into recruitment_intake_links(organisation_id,lead_id,channel,token_hash,expires_at) values($1,$2,'private_link',$3,now()+interval '14 days') returning id",[org,candidate.id,hash])).rows[0].id
 await emailServer()
 const old=(await beginEmail({candidate,reference,hash})).attempt
 await finishEmail(old,'failed')
 await db.exec('reset role;')
 await db.query("update recruitment_invitation_deliveries set created_at=now()-interval '24 hours' where id=$1",[old.id])
 await emailServer()
 const latest=(await beginEmail({candidate,reference,hash})).attempt
 await finishEmail(latest,'unknown')
 const recovered=await beginEmail({candidate,reference,hash,id:old.id})
 expect(recovered.attempt.id).toBe(latest.id)
 await asUser(manager)
 expect((await db.query('select id from recruitment_invitation_deliveries where lead_id=$1',[candidate.id])).rows).toHaveLength(2)
})

const homeToken='9'.repeat(64),homeOpaque='8'.repeat(64),homeHash=createHash('sha256').update(homeOpaque).digest('hex')
const homeUser='abcd1234-abcd-4abc-8def-abcdefabcdef',homeEmail='packages@example.test'
let homeDraft,homeRevision,oldHomeSubmission
function homeProfileApi(body) {
  return createHomeSeekersSignupResponse({client:profileDbClient(),env:{HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN:homeToken,RECRUITMENT_INTAKE_FINGERPRINT_SECRET:'x'.repeat(32)},headers:{host:'homeseekers.test',origin:'https://homeseekers.test',cookie:`a9_recruitment_${homeOrg.replaceAll('-','')}=${homeOpaque}`},body})
}
it('adds Home Seekers preference validation without changing older drafts or submitted applications',async()=>{
  await db.exec('reset role;')
  await db.query('insert into organisations values($1)',[homeOrg])
  await db.query("insert into organisation_users values($1,$2,'active','principal')",[homeOrg,manager])
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[homeUser,homeEmail])
  await asUser(manager)
  const link=(await db.query("insert into recruitment_intake_links(organisation_id,channel,token_hash,expires_at) values($1,'website',$2,now()+interval '1 year') returning id",[homeOrg,createHash('sha256').update(homeToken).digest('hex')])).rows[0].id
  const keys=[crypto.randomUUID(),crypto.randomUUID()]
  await contactServer()
  for(const key of keys) expect(await captureContact(link,key,{...contact,email:homeEmail},'7'.repeat(64))).toEqual({accepted:true,duplicate:false})
  const saveOld=async(key,hash)=>{
    expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[homeOrg,homeUser,hash,key])).rows[0].result).toBe(true)
    return (await db.query("select recruitment_save_profile($1,$2,$3::jsonb,0,3,'complete') as result",[homeOrg,hash,JSON.stringify({...profileAnswers,email:homeEmail})])).rows[0].result
  }
  expect((await saveOld(keys[0],homeHash)).saved).toBe(true)
  const oldHash='0'.repeat(64)
  expect((await saveOld(keys[1],oldHash)).saved).toBe(true)
  expect((await db.query('select recruitment_submit_verified_profile($1,$2,1,$3,true,true) as result',[homeOrg,oldHash,crypto.randomUUID()])).rows[0].result.accepted).toBe(true)
  const before=(await db.query('select id,applicant_draft_json,applicant_draft_revision,application_json from recruitment_leads where organisation_id=$1 order by id',[homeOrg])).rows
  homeDraft=before.find(row=>!row.application_json.answers)
  oldHomeSubmission=before.find(row=>row.application_json.answers)
  homeRevision=1
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261010131128_home_seekers_recruitment_package_preference.sql',import.meta.url),'utf8'))
  await contactServer()
  expect((await db.query('select id,applicant_draft_json,applicant_draft_revision,application_json from recruitment_leads where organisation_id=$1 order by id',[homeOrg])).rows).toEqual(before)
  const missing=await homeProfileApi({action:'save_profile',answers:{...profileAnswers,email:homeEmail},revision:homeRevision,page:3,intent:'complete'})
  expect(missing).toMatchObject({status:422,body:{errors:{packagePreference:expect.any(String)}}})
  const submitMissing=await homeProfileApi({action:'submit_profile',revision:homeRevision,submissionKey:crypto.randomUUID(),privacyAccepted:true,declarationAccepted:true})
  expect(submitMissing).toMatchObject({status:422,body:{errors:{packagePreference:expect.any(String)}}})
  expect((await db.query('select recruitment_submit_verified_profile($1,$2,1,$3,true,true) as result',[homeOrg,oldHash,crypto.randomUUID()])).rows[0].result).toMatchObject({accepted:true,duplicate:true})
})
it('saves every Home Seekers choice on the original lead, supports partial drafts and protects revision retries',async()=>{
  await contactServer()
  for(const packagePreference of ['deals','monthly','upfront','decide_later']) {
    const request={action:'save_profile',answers:{...profileAnswers,email:homeEmail,packagePreference},revision:homeRevision,page:3,intent:'complete'}
    const saved=await homeProfileApi(request)
    expect(saved.status).toBe(200)
    homeRevision=saved.body.applicant.profileRevision
    expect(saved.body.applicant.profile.answers.packagePreference).toBe(packagePreference)
    expect(saved.body.applicant.applicationSubmitted).toBe(false)
    expect((await homeProfileApi(request)).body).toMatchObject({duplicate:true,applicant:{profileRevision:homeRevision}})
    const restored=await homeProfileApi({action:'resume'})
    expect(restored.body.applicant.profile.answers.packagePreference).toBe(packagePreference)
    expect(restored.body.applicant.contactSubmissionKey).toBeTruthy()
  }
  for(const packagePreference of ['forged',{},true]) {
    const bad=await homeProfileApi({action:'save_profile',answers:{...profileAnswers,email:homeEmail,packagePreference},revision:homeRevision,page:3,intent:'save'})
    expect(bad).toMatchObject({status:422,body:{errors:{packagePreference:expect.any(String)}}})
  }
  const rawBad=(await db.query("select recruitment_save_profile($1,$2,$3::jsonb,$4,3,'save') as result",[homeOrg,homeHash,JSON.stringify({...profileAnswers,email:homeEmail,packagePreference:'forged'}),homeRevision])).rows[0].result
  expect(rawBad).toMatchObject({invalid:true,errors:{packagePreference:expect.any(String)}})
  const stale=await homeProfileApi({action:'save_profile',answers:{...profileAnswers,email:homeEmail,packagePreference:'monthly'},revision:0,page:3,intent:'complete'})
  expect(stale).toMatchObject({status:409,body:{conflict:true}})
  const partial=await homeProfileApi({action:'save_profile',answers:{...profileAnswers,email:homeEmail},revision:homeRevision,page:3,intent:'save'})
  expect(partial.status).toBe(200);homeRevision=partial.body.applicant.profileRevision
  expect(partial.body.applicant.profile.complete).toBe(false)
  expect(partial.body.applicant.profile.answers).not.toHaveProperty('packagePreference')
  const saved=await homeProfileApi({action:'save_profile',answers:{...profileAnswers,email:homeEmail,packagePreference:'decide_later'},revision:homeRevision,page:3,intent:'complete'})
  homeRevision=saved.body.applicant.profileRevision
  const row=(await db.query('select * from recruitment_leads where id=$1',[homeDraft.id])).rows[0]
  expect(row.status).toBe('lead_received');expect(row.application_json).toEqual({})
  expect(row.contact_capture_json.email).toBe(homeEmail)
  expect((await db.query('select count(*) from recruitment_leads where organisation_id=$1',[homeOrg])).rows[0].count).toBe(2)
})
it('submits the reviewed Home Seekers preference and enforces agency and staff boundaries in SQL',async()=>{
  await contactServer()
  const submission={action:'submit_profile',revision:homeRevision,submissionKey:crypto.randomUUID(),privacyAccepted:true,declarationAccepted:true,answers:{packagePreference:'monthly'},organisationId:other}
  const accepted=await homeProfileApi(submission)
  expect(accepted.status).toBe(200)
  expect(accepted.body.applicant.submittedApplication.answers.packagePreference).toBe('decide_later')
  expect(accepted.body.applicant.stage).toBe('application_submitted')
  expect((await homeProfileApi(submission)).body.duplicate).toBe(true)
  const row=(await db.query('select * from recruitment_leads where id=$1',[homeDraft.id])).rows[0]
  expect(row.application_json.answers.packagePreference).toBe('decide_later')
  expect(row.activation_json).toEqual({})
  await db.exec('reset role;')
  expect((await db.query('select count(*) from organisation_users where user_id=$1',[homeUser])).rows[0].count).toBe(0)
  expect((await db.query('select application_json from recruitment_leads where id=$1',[oldHomeSubmission.id])).rows[0].application_json).toEqual(oldHomeSubmission.application_json)
  await contactServer()
  expect((await db.query('select recruitment_home_seekers_package_errors($1,$2::jsonb,null,false) as result',[org,JSON.stringify({packagePreference:'decide_later'})])).rows[0].result).toHaveProperty('packagePreference')
  expect((await db.query('select recruitment_home_seekers_package_errors($1,$2::jsonb,null,true) as result',[org,JSON.stringify(profileAnswers)])).rows[0].result).toEqual({})
  expect((await db.query('select recruitment_resume_applicant($1,$2) as result',[other,homeHash])).rows[0].result).toBeNull()
  await asUser(manager)
  expect((await db.query('select application_json from recruitment_leads where id=$1',[homeDraft.id])).rows[0].application_json.answers.packagePreference).toBe('decide_later')
  await expect(db.query("update recruitment_leads set applicant_draft_json=jsonb_set(applicant_draft_json,'{answers,packagePreference}','\"monthly\"') where id=$1",[homeDraft.id])).rejects.toThrow('Applicant drafts require verified access')
  await db.exec('reset role; set role anon;')
  await expect(db.query('select recruitment_home_seekers_package_errors($1,$2::jsonb,null,true)',[homeOrg,'{}'])).rejects.toThrow('permission denied')
})

let journeyLead, journeyUpload, journeyApproval;
it('installs the journey without rewriting history and keeps applicant uploads and email jobs server-only', async () => {
  await db.exec('reset role; alter table storage.objects add column metadata jsonb; grant usage on schema storage to service_role; grant select on storage.objects to service_role;')
  const before = (await db.query('select id,status,version,activity_json from recruitment_leads order by id')).rows
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261010142843_home_seekers_recruitment_journey.sql', import.meta.url), 'utf8'))
  expect((await db.query('select id,status,version,activity_json from recruitment_leads order by id')).rows).toEqual(before)
  await db.exec('set role authenticated;')
  for (const name of ['recruitment_applicant_uploads','recruitment_approval_email_queue']) await expect(db.query('select * from '+name)).rejects.toThrow('permission denied')
  await expect(db.query('select recruitment_claim_approval_emails(3)')).rejects.toThrow('permission denied')
  await expect(db.query('select recruitment_applicant_document_access($1,$2)', [homeOrg,homeHash])).rejects.toThrow('permission denied')
})
it('records staff contact once without advancing or forging verified form submission', async () => {
  await asUser(manager)
  journeyLead=(await db.query("insert into recruitment_leads(organisation_id,name,email) values($1,'Journey Contact','journey@agency.test') returning *",[homeOrg])).rows[0]
  const contacted=(await db.query('select * from recruitment_record_contact($1,$2,$3)',[homeOrg,journeyLead.id,journeyLead.version])).rows[0]
  expect(contacted).toMatchObject({status:'lead_received',contacted_by:manager,application_submitted_at:null})
  expect(contacted.contacted_at).toBeTruthy()
  expect(contacted.activity_json.at(-1).type).toBe('lead_contacted')
  await expect(db.query('select * from recruitment_record_contact($1,$2,$3)',[homeOrg,journeyLead.id,journeyLead.version])).rejects.toThrow('changed')
  await expect(db.query("update recruitment_leads set status='application_submitted' where id=$1",[journeyLead.id])).rejects.toThrow('Later recruitment phases')
  await expect(db.query("update recruitment_leads set contacted_at=now() where id=$1",[journeyLead.id])).rejects.toThrow('does not submit')
  await asUser(agent)
  await expect(db.query('select * from recruitment_record_contact($1,$2,$3)',[homeOrg,journeyLead.id,contacted.version])).rejects.toThrow('management')
})
it('prepares only the verified submitted applicant’s document and protects fixed retry details', async () => {
  await contactServer()
  journeyUpload=crypto.randomUUID()
  const prepare=(org=homeOrg,hash=homeHash,document={name:'identity.pdf',type:'Identity document',mimeType:'application/pdf',size:128})=>db.query('select recruitment_prepare_applicant_document($1,$2,$3,$4::jsonb) as result',[org,hash,journeyUpload,JSON.stringify(document)])
  expect((await prepare(other)).rows[0].result).toEqual({unavailable:true})
  expect((await prepare(homeOrg,'e'.repeat(64))).rows[0].result).toEqual({unavailable:true})
  const first=(await prepare()).rows[0].result
  expect(first).toEqual({path:`${homeOrg}/${homeDraft.id}/${journeyUpload}`,committed:false})
  expect((await prepare()).rows[0].result).toEqual(first)
  const apiPrepared=await homeProfileApi({action:'prepare_document',requestId:journeyUpload,document:{name:'identity.pdf',type:'Identity document',mimeType:'application/pdf',size:128,path:'foreign/file'},organisationId:other,leadId:otherLead,role:'admin'})
  expect(apiPrepared).toMatchObject({status:200,body:{uploadUrl:`https://storage.test/upload/${homeOrg}/${homeDraft.id}/${journeyUpload}`}})
  expect(JSON.stringify(apiPrepared.body)).not.toContain('foreign')
  await expect(prepare(homeOrg,homeHash,{name:'different.pdf',type:'Identity document',mimeType:'application/pdf',size:128})).rejects.toThrow('different document')
  await expect(prepare(homeOrg,homeHash,{name:'malware.exe',type:'Identity document',mimeType:'application/exe',size:128})).rejects.toThrow('PDF')
  await db.exec('reset role;')
  expect((await db.query('select count(*)::int as count from organisation_users where user_id=$1',[homeUser])).rows[0].count).toBe(0)
  await contactServer()
  await expect(db.query('select recruitment_commit_applicant_document($1,$2,$3)',[homeOrg,homeHash,journeyUpload])).rejects.toThrow('could not be verified')
})
it('records the real private upload as Documents Uploaded and recovers the same commit without duplication', async () => {
  await db.exec('reset role;')
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('recruitment-documents',$1,'{\"size\":128,\"mimetype\":\"application/pdf\"}')",[`${homeOrg}/${homeDraft.id}/${journeyUpload}`])
  await contactServer()
  const commit=()=>db.query('select recruitment_commit_applicant_document($1,$2,$3) as result',[homeOrg,homeHash,journeyUpload])
  const throughApi=await homeProfileApi({action:'commit_document',requestId:journeyUpload,leadId:otherLead,path:'foreign/file'})
  expect(throughApi).toMatchObject({status:200,body:{saved:true,applicant:{stage:'documents_uploaded',documents:[{name:'identity.pdf',type:'Identity document',path:`${homeOrg}/${homeDraft.id}/${journeyUpload}`}]}}})
  const saved=(await db.query('select * from recruitment_leads where id=$1',[homeDraft.id])).rows[0]
  expect(saved.status).toBe('documents_uploaded');expect(saved.documents_uploaded_at).toBeTruthy()
  expect(saved.documents_json).toHaveLength(1)
  expect(saved.documents_json[0]).toMatchObject({type:'Identity document',uploadedBy:'applicant'})
  expect((await commit()).rows[0].result).toEqual({saved:true,duplicate:true})
  expect((await db.query('select version from recruitment_leads where id=$1',[homeDraft.id])).rows[0].version).toBe(saved.version)
  expect((await homeProfileApi({action:'commit_document',requestId:journeyUpload})).body.applicant.documents).toHaveLength(1)
  expect((await homeProfileApi({action:'download_document',documentPath:`${homeOrg}/${homeDraft.id}/${journeyUpload}`}))).toMatchObject({status:200,body:{downloadUrl:`https://storage.test/download/${homeOrg}/${homeDraft.id}/${journeyUpload}?expires=300`}})
  expect((await homeProfileApi({action:'download_document',documentPath:`${other}/${homeDraft.id}/${journeyUpload}`})).status).toBe(404)
  const resumed=(await db.query('select recruitment_resume_applicant($1,$2) as result',[homeOrg,homeHash])).rows[0].result
  expect(resumed).toMatchObject({documentsEditable:true,documentsComplete:false,stage:'documents_uploaded',documents:[{type:'Identity document'}]})
  await asUser(manager)
  await expect(db.query('select * from recruitment_start_review($1,$2,$3)',[homeOrg,homeDraft.id,saved.version])).rejects.toThrow('required document pack')
  await expect(db.query("update recruitment_leads set documents_uploaded_at=now() where id=$1",[homeDraft.id])).rejects.toThrow('authored')
  await expect(db.query("update recruitment_leads set documents_json='[{\"name\":\"forged.pdf\",\"type\":\"CV\",\"path\":\"foreign/file\"}]' where id=$1",[homeDraft.id])).rejects.toThrow('belonging')
})
it('requires saved document exceptions, starts review and supports a reasoned rejection with preserved submission', async () => {
  await asUser(manager)
  await expect(db.query("update recruitment_leads set document_waivers_json='{\"CV\":\"no\"}' where id=$1",[homeDraft.id])).rejects.toThrow('exception reason')
  const saved=(await db.query("update recruitment_leads set document_waivers_json='{\"CV\":\"Experience recorded in application\",\"Qualifications\":\"Candidate with no completed qualification yet\",\"Registration evidence\":\"Registration pending; agency will follow up\"}' where id=$1 returning *",[homeDraft.id])).rows[0]
  const reviewed=(await db.query('select * from recruitment_start_review($1,$2,$3)',[homeOrg,homeDraft.id,saved.version])).rows[0]
  expect(reviewed).toMatchObject({status:'under_review',review_started_by:manager})
  const rejected=(await db.query('select * from recruitment_reject_application($1,$2,$3,$4)',[homeOrg,homeDraft.id,reviewed.version,'Required experience does not meet this opening'])).rows[0]
  expect(rejected.status).toBe('closed_lost');expect(rejected.application_json).toEqual(reviewed.application_json)
  expect(rejected.rejection_json).toMatchObject({rejectedBy:manager,reason:'Required experience does not meet this opening'})
  expect(rejected.activity_json.at(-1).type).toBe('application_rejected')
  await contactServer()
  expect((await db.query('select recruitment_resume_applicant($1,$2) as result',[homeOrg,homeHash])).rows[0].result).toBeNull()
  await asUser(manager)
  expect((await db.query("update recruitment_leads set status='under_review' where id=$1 returning status",[homeDraft.id])).rows[0].status).toBe('under_review')
})
it('queues approval email atomically and never grants agency membership when an application is approved', async () => {
  await asUser(manager)
  const candidate=(await db.query('select * from recruitment_leads where id=$1',[homeDraft.id])).rows[0]
  const checks=Object.fromEntries(['registration','qualifications','training','handover'].map(key=>[key,{status:'not_applicable',notes:'Reasoned fixture finding for this candidate',evidence:[]}]))
  const review={version:'recruitment-review-v1',checks,documents:candidate.documents_json.map(doc=>({path:doc.path,status:'reviewed',notes:'Identity file opened and checked'})),notes:'Interview completed',followUpOn:''}
  const ready=(await db.query('update recruitment_leads set review_json=$1::jsonb where id=$2 returning *',[JSON.stringify(review),homeDraft.id])).rows[0]
  journeyApproval=(await db.query('select * from recruitment_approve_application($1,$2,$3,$4)',[homeOrg,homeDraft.id,ready.version,approvalConfirmation])).rows[0]
  expect(journeyApproval.status).toBe('application_approved')
  expect(journeyApproval.approval_notes).toBe(approvalConfirmation)
  await db.exec('reset role;')
  const queue=(await db.query('select * from recruitment_approval_email_queue where lead_id=$1',[homeDraft.id])).rows
  expect(queue).toHaveLength(1);expect(queue[0]).toMatchObject({status:'pending',actor_id:manager})
  expect((await db.query('select count(*)::int as count from organisation_users where user_id=$1',[homeUser])).rows[0].count).toBe(0)
  await contactServer()
  expect((await db.query('select recruitment_resume_applicant($1,$2) as result',[homeOrg,homeHash])).rows[0].result.documentsEditable).toBe(false)
  expect((await db.query('select recruitment_prepare_applicant_document($1,$2,$3,$4::jsonb) as result',[homeOrg,homeHash,crypto.randomUUID(),'{"name":"later.pdf","type":"CV","size":128,"mimeType":"application/pdf"}'])).rows[0].result).toEqual({unavailable:true})
})
it('leases automatic approval jobs and makes a repeated email claim use the same provider attempt', async () => {
  await contactServer()
  const jobs=(await db.query('select recruitment_claim_approval_emails(3) as result')).rows[0].result
  expect(jobs).toHaveLength(1)
  expect((await db.query('select recruitment_claim_approval_emails(3) as result')).rows[0].result).toEqual([])
  const claim=id=>db.query('select recruitment_begin_invitation_email($1,$2,$3,$4,$3,$5,null,$6::jsonb,false) as result',[manager,homeOrg,homeDraft.id,'approval',id,JSON.stringify({to:homeEmail,subject:'Approved',text:'We will send the contract shortly'})])
  const first=(await claim(jobs[0].id)).rows[0].result
  expect(first.send).toBe(true)
  expect((await claim(jobs[0].id)).rows[0].result.busy).toBe(true)
  expect((await db.query("select recruitment_finish_invitation_email($1,$2,'provider_accepted','provider-approval',null) as result",[first.attempt.id,first.attempt.lease_id])).rows[0].result).toBe(true)
  expect((await claim(crypto.randomUUID())).rows[0].result).toMatchObject({send:false,attempt:{status:'provider_accepted',id:first.attempt.id}})
  expect((await db.query('select recruitment_complete_approval_email($1,true,null) as result',[jobs[0].id])).rows[0].result).toBe(true)
  await asUser(manager)
  const status=(await db.query('select recruitment_invitation_status($1,$2,$3,$2) as result',[homeOrg,homeDraft.id,'approval'])).rows[0].result
  expect(status).toMatchObject({queueStatus:'provider_accepted',attempt:{status:'provider_accepted'}})
})

it('installs Arch9 setup without emailing historical applications or exposing private photos and queues', async () => {
  await db.exec('reset role;')
  const before=(await db.query('select id,version,application_json from recruitment_leads order by id')).rows
  for (const file of ['20261010145840_recruitment_applicant_arch9_setup.sql','20261010150417_recruitment_applicant_login_gate.sql','20261010151044_recruitment_activation_access_gate.sql']) await db.exec(readFileSync(new URL('../../../../../supabase/migrations/'+file,import.meta.url),'utf8'))
  expect((await db.query('select id,version,application_json from recruitment_leads order by id')).rows).toEqual(before)
  expect((await db.query('select * from recruitment_submission_email_queue')).rows).toEqual([])
  expect((await db.query("select public from storage.buckets where id='recruitment-profile-photos'")).rows[0].public).toBe(false)
  await asUser(homeUser)
  expect((await db.query('select recruitment_applicant_portal_required() as required')).rows[0].required).toBe(true)
  for (const table of ['recruitment_applicant_photo_uploads','recruitment_submission_email_queue']) await expect(db.query('select * from '+table)).rejects.toThrow('permission denied')
  await expect(db.query('select recruitment_claim_submission_emails(3)')).rejects.toThrow('permission denied')
  await asUser(manager)
  expect((await db.query('select recruitment_applicant_portal_required() as required')).rows[0].required).toBe(false)
  await db.query("update recruitment_leads set name='Contact still editable' where id=$1",[journeyLead.id])
})
it('retains immutable private photos only after actual storage receipt, independently of document milestones', async () => {
  await contactServer()
  const oldHash='0'.repeat(64),id=crypto.randomUUID(),photo={name:'profile.png',mimeType:'image/png',size:128}
  const prepare=(organisation=homeOrg,hash=oldHash,details=photo)=>db.query('select recruitment_prepare_applicant_photo($1,$2,$3,$4::jsonb) as result',[organisation,hash,id,JSON.stringify(details)])
  expect((await prepare(other)).rows[0].result).toEqual({unavailable:true})
  expect((await prepare(homeOrg,'f'.repeat(64))).rows[0].result).toEqual({unavailable:true})
  const before=(await db.query('select status,documents_json,documents_uploaded_at from recruitment_leads where id=$1',[oldHomeSubmission.id])).rows[0]
  const first=(await prepare()).rows[0].result
  expect(first.path).toBe(`${homeOrg}/${oldHomeSubmission.id}/${id}`)
  expect((await prepare()).rows[0].result).toEqual(first)
  await expect(prepare(homeOrg,oldHash,{...photo,name:'other.png'})).rejects.toThrow('different photo')
  await expect(prepare(homeOrg,oldHash,{...photo,mimeType:'image/svg+xml'})).rejects.toThrow('JPG')
  await expect(db.query('select recruitment_commit_applicant_photo($1,$2,$3)',[homeOrg,oldHash,id])).rejects.toThrow('could not be verified')
  await db.exec('reset role;')
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('recruitment-profile-photos',$1,'{\"size\":128,\"mimetype\":\"image/png\"}')",[first.path])
  await contactServer()
  expect((await db.query('select recruitment_commit_applicant_photo($1,$2,$3) as result',[homeOrg,oldHash,id])).rows[0].result).toEqual({saved:true,duplicate:false})
  expect((await db.query('select recruitment_commit_applicant_photo($1,$2,$3) as result',[homeOrg,oldHash,id])).rows[0].result).toEqual({saved:true,duplicate:true})
  expect((await db.query('select status,documents_json,documents_uploaded_at from recruitment_leads where id=$1',[oldHomeSubmission.id])).rows[0]).toEqual(before)
  expect((await db.query('select recruitment_applicant_setup_photo($1,$2) as result',[homeOrg,oldHash])).rows[0].result.path).toBe(first.path)
  expect((await prepare(homeOrg,homeHash)).rows[0].result).toEqual({unavailable:true})
  await asUser(manager)
  await expect(db.query('update recruitment_leads set applicant_photo_json=$1::jsonb where id=$2',[JSON.stringify({path:'foreign'}),oldHomeSubmission.id])).rejects.toThrow('verified applicant photo')
})
let setupLead,setupHash,setupJob
it('queues one login email atomically with a newly completed, verified form and retains no membership', async () => {
  await contactServer()
  const link=(await db.query("select id from recruitment_intake_links where organisation_id=$1 and channel='website'",[homeOrg])).rows[0].id
  const receipt=crypto.randomUUID();setupHash='f'.repeat(64)
  expect((await captureContact(link,receipt,{...contact,email:homeEmail},'6'.repeat(64))).accepted).toBe(true)
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as result',[homeOrg,homeUser,setupHash,receipt])).rows[0].result).toBe(true)
  const profile=(await db.query("select recruitment_save_profile($1,$2,$3::jsonb,0,3,'complete') as result",[homeOrg,setupHash,JSON.stringify({...profileAnswers,email:homeEmail,packagePreference:'decide_later'})])).rows[0].result
  expect(profile.saved).toBe(true)
  expect((await db.query('select * from recruitment_submission_email_queue')).rows).toEqual([])
  const key=crypto.randomUUID()
  const submit=()=>db.query('select recruitment_submit_verified_profile($1,$2,$3,$4,true,true) as result',[homeOrg,setupHash,profile.applicant.profileRevision,key])
  expect((await submit()).rows[0].result.accepted).toBe(true)
  expect((await submit()).rows[0].result.duplicate).toBe(true)
  const jobs=(await db.query('select * from recruitment_submission_email_queue')).rows
  expect(jobs).toHaveLength(1);setupJob=jobs[0];setupLead=jobs[0].lead_id
  expect(setupJob).toMatchObject({actor_id:homeUser,status:'pending',organisation_id:homeOrg})
  await db.exec('reset role;')
  expect((await db.query('select count(*)::int as n from organisation_users where user_id=$1',[homeUser])).rows[0].n).toBe(0)
  await contactServer()
  expect((await db.query('select recruitment_applicant_account_receipt($1) as receipt',[homeUser])).rows[0].receipt).toBe(receipt)
})
it('claims submission jobs with immutable recipient and provider retry evidence, denying forged actors', async () => {
  await contactServer()
  const begin=(actor=homeUser,id=setupJob.id,email=homeEmail)=>db.query('select recruitment_begin_submission_email($1,$2,$3,\'documents_reminder\',$3,$4,null,$5::jsonb,false) as result',[actor,homeOrg,setupLead,id,JSON.stringify({to:email,text:'Log in to Arch9'})])
  await expect(begin()).rejects.toThrow('Claim the saved')
  const claimed=(await db.query('select recruitment_claim_submission_emails(3) as result')).rows[0].result
  expect(claimed).toHaveLength(1)
  expect((await db.query('select recruitment_claim_submission_emails(3) as result')).rows[0].result).toEqual([])
  await expect(begin(manager)).rejects.toThrow('Claim the saved')
  await expect(begin(homeUser,crypto.randomUUID())).rejects.toThrow('Claim the saved')
  await expect(begin(homeUser,setupJob.id,'attacker@agency.test')).rejects.toThrow('saved applicant')
  const first=(await begin()).rows[0].result
  expect(first.send).toBe(true)
  expect((await begin()).rows[0].result.busy).toBe(true)
  expect((await db.query("select recruitment_finish_invitation_email($1,$2,'unknown',null,'uncertain') as result",[first.attempt.id,first.attempt.lease_id])).rows[0].result).toBe(true)
  const retry=(await begin()).rows[0].result
  expect(retry.attempt.id).toBe(first.attempt.id);expect(retry.attempt.message_json).toEqual(first.attempt.message_json)
  expect((await db.query("select recruitment_finish_invitation_email($1,$2,'provider_accepted','provider-submission',null) as result",[retry.attempt.id,retry.attempt.lease_id])).rows[0].result).toBe(true)
  expect((await begin()).rows[0].result).toMatchObject({send:false,attempt:{status:'provider_accepted'}})
  expect((await db.query('select recruitment_complete_submission_email($1,true,null) as result',[setupJob.id])).rows[0].result).toBe(true)
  expect((await db.query('select recruitment_claim_submission_emails(3) as result')).rows[0].result).toEqual([])
  await db.exec('reset role;')
  await db.query("insert into organisation_users values($1,$2,'active','agent')",[homeOrg,homeUser])
  await asUser(homeUser)
  expect((await db.query('select recruitment_applicant_portal_required() as required')).rows[0].required).toBe(true)
  await db.exec('reset role;')
  await db.query('delete from organisation_users where organisation_id=$1 and user_id=$2',[homeOrg,homeUser])
})

let notificationLead, notificationJobs, claimedNotifications
const notificationKey=crypto.randomUUID()
const notificationContact={...contact,firstName:'New',lastName:'Recruit',email:'new.recruit@homeseekers.co.za'}
it('installs first-screen staff notifications without notifying any historical contacts',async()=>{
  await db.exec('reset role;')
  await db.exec(`create schema cron; create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text);
    create function cron.schedule(text,text,text) returns bigint language sql as $$ insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid $$;`)
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261010153201_home_seekers_recruitment_contact_notifications.sql',import.meta.url),'utf8'))
  expect((await db.query('select count(*) from recruitment_contact_notifications')).rows[0].count).toBe(0)
  expect((await db.query('select jobname,schedule,command from cron.job')).rows).toEqual([{jobname:'arch9-recruitment-contact-dispatcher-1m',schedule:'* * * * *',command:'select public.recruitment_run_contact_dispatcher();'}])
})
const notificationSignup=()=>createHomeSeekersSignupResponse({client:contactClient(),env:{HOME_SEEKERS_RECRUITMENT_INTAKE_TOKEN:homeToken,RECRUITMENT_INTAKE_FINGERPRINT_SECRET:'x'.repeat(32)},headers:{host:'homeseekers.test',origin:'https://homeseekers.test','x-forwarded-for':'192.0.2.115'},body:{action:'signup',submissionKey:notificationKey,contact:notificationContact,password:'NotificationFixture23',organisationId:other,to:['attacker@other.test']}})
it('queues exactly the requested three recipients through real Home Seekers signup, even when account preparation fails after the contact save',async()=>{
  await contactServer()
  const response=await notificationSignup()
  expect(response).toMatchObject({status:503,body:{contactAccepted:true}})
  notificationLead=(await db.query('select * from recruitment_leads where organisation_id=$1 and intake_key=$2',[homeOrg,notificationKey])).rows[0]
  expect(notificationLead).toMatchObject({status:'lead_received',email_verification_status:'pending',application_submitted_at:null,application_json:{}})
  expect((await db.query('select * from recruitment_applicant_links where lead_id=$1',[notificationLead.id])).rows).toEqual([])
  notificationJobs=(await db.query('select * from recruitment_contact_notifications where lead_id=$1 order by recipient',[notificationLead.id])).rows
  expect(notificationJobs.map(job=>job.recipient)).toEqual(['admin@homeseekers.co.za','alex@arch9.co.za','thomas@homeseekers.co.za'])
  expect(notificationJobs.every(job=>job.status==='pending'&&job.organisation_id===homeOrg&&job.contact_json.email===notificationContact.email)).toBe(true)
})
it('recovers repeated first-screen saves without duplicate jobs or changing the saved recipient list',async()=>{
  await contactServer()
  expect((await notificationSignup()).body.contactAccepted).toBe(true)
  expect((await db.query('select id from recruitment_contact_notifications where lead_id=$1',[notificationLead.id])).rows.map(job=>job.id).sort()).toEqual(notificationJobs.map(job=>job.id).sort())
  expect((await db.query('select count(*) from recruitment_contact_receipts where lead_id=$1',[notificationLead.id])).rows[0].count).toBe(1)
})
it('keeps invalid contacts, other agencies, manual leads and rolled-back contact transactions out of the notification queue',async()=>{
  await contactServer()
  const homeLink=(await db.query("select id from recruitment_intake_links where organisation_id=$1 and channel='website'",[homeOrg])).rows[0].id
  await expect(captureContact(homeLink,crypto.randomUUID(),{...notificationContact,privacyAccepted:false},'4'.repeat(64))).rejects.toThrow('Invalid recruitment contact')
  await asUser(manager)
  const otherNotificationLink=(await db.query("insert into recruitment_intake_links(organisation_id,channel,created_by,token_hash,expires_at) values($1,'website',$2,$3,now()+interval '1 day') returning id",[org,manager,createHash('sha256').update(crypto.randomUUID()).digest('hex')])).rows[0].id
  await contactServer()
  expect((await captureContact(otherNotificationLink,crypto.randomUUID(),{...notificationContact,email:'other@homeseekers.co.za'},createHash('sha256').update(crypto.randomUUID()).digest('hex'))).accepted).toBe(true)
  await asUser(manager)
  await db.query("insert into recruitment_leads(organisation_id,name,email) values($1,'Manual notification check','manual@homeseekers.co.za')",[homeOrg])
  await contactServer()
  await db.exec('begin;')
  expect((await captureContact(homeLink,crypto.randomUUID(),{...notificationContact,email:'rollback@homeseekers.co.za'},createHash('sha256').update(crypto.randomUUID()).digest('hex'))).accepted).toBe(true)
  expect((await db.query('select count(*) from recruitment_contact_notifications')).rows[0].count).toBe(6)
  await db.exec('rollback;')
  expect((await db.query('select count(*) from recruitment_contact_notifications')).rows[0].count).toBe(3)
})
it('claims each recipient once, rejects forged recipient payloads and freezes the exact message before sending',async()=>{
  await contactServer()
  claimedNotifications=(await db.query('select recruitment_claim_contact_notifications(3) as result')).rows[0].result
  expect(claimedNotifications).toHaveLength(3)
  expect((await db.query('select recruitment_claim_contact_notifications(3) as result')).rows[0].result).toEqual([])
  const job=claimedNotifications[0]
  const prepare=(lease=job.lease_id,to=job.recipient,text='Original saved content')=>db.query('select recruitment_prepare_contact_notification($1,$2,$3::jsonb) as result',[job.id,lease,JSON.stringify({to,from:'Arch9 <no-reply@arch9.co.za>',subject:'Saved contact',html:'<p>Original</p>',text,extra:'discard'})])
  await expect(prepare(crypto.randomUUID())).rejects.toThrow('Claim the saved')
  await expect(prepare(job.lease_id,'attacker@other.co.za')).rejects.toThrow('Saved notification recipient')
  const first=(await prepare()).rows[0].result
  expect(first.extra).toBeUndefined()
  expect((await prepare(job.lease_id,job.recipient,'Changed retry content')).rows[0].result).toEqual(first)
})
it('records provider acceptance only with a receipt, retries failed recipients independently and refuses stale completions',async()=>{
  await contactServer()
  const accepted=claimedNotifications[0],failed=claimedNotifications[1],unknown=claimedNotifications[2]
  const finish=(job,provider,error=null,lease=job.lease_id)=>db.query('select recruitment_complete_contact_notification($1,$2,$3,$4) as result',[job.id,lease,provider,error])
  expect((await finish(unknown,'forged-before-prepare')).rows[0].result).toBe(false)
  expect((await finish(accepted,'synthetic-provider-receipt')).rows[0].result).toBe(true)
  expect((await finish(accepted,'duplicate')).rows[0].result).toBe(false)
  expect((await finish(failed,null,'dispatch_unconfirmed')).rows[0].result).toBe(true)
  expect((await finish(unknown,null,'dispatch_unconfirmed')).rows[0].result).toBe(true)
  await db.query("update recruitment_contact_notifications set next_attempt_at=now()-interval '1 second' where status='pending'")
  const retries=(await db.query('select recruitment_claim_contact_notifications(3) as result')).rows[0].result
  expect(retries.map(row=>row.id).sort()).toEqual([failed.id,unknown.id].sort())
  expect(retries.every(row=>row.lease_id!==claimedNotifications.find(old=>old.id===row.id).lease_id&&row.attempts===2)).toBe(true)
  expect((await finish(failed,null,'dispatch_unconfirmed')).rows[0].result).toBe(false)
  for(const job of retries) expect((await finish(job,null,'dispatch_unconfirmed')).rows[0].result).toBe(true)
})
it('recovers expired worker leases with the same payload, then stops uncertain retries before provider idempotency expires',async()=>{
  await contactServer()
  const job=claimedNotifications[1]
  await db.query("update recruitment_contact_notifications set next_attempt_at=now()-interval '1 second' where id=$1",[job.id])
  const current=(await db.query('select recruitment_claim_contact_notifications(1) as result')).rows[0].result[0]
  const payload={from:'Arch9 <no-reply@arch9.co.za>',to:current.recipient,subject:'Retry',html:'<p>Retry</p>',text:'Retry'}
  const first=(await db.query('select recruitment_prepare_contact_notification($1,$2,$3::jsonb) as result',[current.id,current.lease_id,JSON.stringify(payload)])).rows[0].result
  await db.query("update recruitment_contact_notifications set leased_until=now()-interval '1 second' where id=$1",[current.id])
  const recovered=(await db.query('select recruitment_claim_contact_notifications(1) as result')).rows[0].result[0]
  expect(recovered.message_json).toEqual(first)
  expect(recovered.lease_id).not.toBe(current.lease_id)
  await expect(db.query('select recruitment_prepare_contact_notification($1,$2,$3::jsonb)',[current.id,current.lease_id,JSON.stringify(payload)])).rejects.toThrow('Claim the saved')
  await db.query("update recruitment_contact_notifications set first_attempt_at=now()-interval '23 hours 1 minute',leased_until=now()-interval '1 second' where id=$1",[current.id])
  expect((await db.query('select recruitment_claim_contact_notifications(3) as result')).rows[0].result).toEqual([])
  expect((await db.query('select status,last_error from recruitment_contact_notifications where id=$1',[current.id])).rows[0]).toEqual({status:'needs_attention',last_error:'retry_window_ended'})
})
it('blocks anonymous and logged-in users from notification routing, queue access and all service-only dispatch RPCs',async()=>{
  for(const role of ['anon','authenticated']){
    await db.exec(`reset role; set role ${role};`)
    await expect(db.query('select * from recruitment_contact_notifications')).rejects.toThrow('permission denied')
    await expect(db.query('select recruitment_claim_contact_notifications(3)')).rejects.toThrow('permission denied')
    await expect(db.query("select recruitment_prepare_contact_notification($1,$2,'{}')",[notificationJobs[0].id,crypto.randomUUID()])).rejects.toThrow('permission denied')
    await expect(db.query('select recruitment_complete_contact_notification($1,$2,null,null)',[notificationJobs[0].id,crypto.randomUUID()])).rejects.toThrow('permission denied')
    await expect(db.query('select recruitment_run_contact_dispatcher()')).rejects.toThrow('permission denied')
  }
  await db.exec('reset role;')
  expect((await db.query("select relrowsecurity from pg_class where relname='recruitment_contact_notifications'")).rows[0].relrowsecurity).toBe(true)
})
it('schedules only pending work through the configured Vault server identity without exposing the credential',async()=>{
  await db.exec('reset role;')
  await db.exec(`create schema vault; create table vault.decrypted_secrets(name text,decrypted_secret text);
    create schema net; create table net.test_requests(id bigint generated always as identity primary key,url text,headers jsonb,body jsonb,timeout_milliseconds integer);
    create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$
      insert into net.test_requests(url,headers,body,timeout_milliseconds) values($1,$2,$3,$4) returning id $$;`)
  await contactServer()
  expect((await db.query('select recruitment_run_contact_dispatcher() as result')).rows[0].result).toEqual({scheduled:false,reason:'no_pending_notifications'})
  await db.query("update recruitment_contact_notifications set next_attempt_at=now()-interval '1 second' where status='pending'")
  expect((await db.query('select recruitment_run_contact_dispatcher() as result')).rows[0].result).toEqual({scheduled:false,reason:'vault_configuration_missing'})
  await db.exec("reset role; insert into vault.decrypted_secrets values('arch9_project_url','https://supabase.fixture.test'),('arch9_service_role_key','synthetic-server-only-key');")
  await contactServer()
  expect((await db.query('select recruitment_run_contact_dispatcher() as result')).rows[0].result).toEqual({scheduled:true,requestId:1})
  await db.exec('reset role;')
  const dispatched=(await db.query('select * from net.test_requests')).rows[0]
  expect(dispatched).toMatchObject({url:'https://supabase.fixture.test/functions/v1/recruitment-contact-dispatcher',headers:{Authorization:'Bearer synthetic-server-only-key',apikey:'synthetic-server-only-key'},body:{},timeout_milliseconds:120000})
})

let mailApplication, mailJobs, thanksClaim, requestClaim
const emailFlowMigration='20261010154503_home_seekers_recruitment_email_flow.sql'
const staffRecipients=['admin@homeseekers.co.za','alex@arch9.co.za','thomas@homeseekers.co.za']
async function newMailApplication(submit=true) {
  await contactServer()
  const link=(await db.query("select id from recruitment_intake_links where organisation_id=$1 and channel='website'",[homeOrg])).rows[0].id
  const receipt=crypto.randomUUID(),hash=createHash('sha256').update(crypto.randomUUID()).digest('hex')
  await captureContact(link,receipt,{...contact,email:homeEmail},createHash('sha256').update(crypto.randomUUID()).digest('hex'))
  await db.query('select recruitment_open_applicant_session($1,$2,$3,$4)',[homeOrg,homeUser,hash,receipt])
  const profile=(await db.query("select recruitment_save_profile($1,$2,$3::jsonb,0,3,'complete') as result",[homeOrg,hash,JSON.stringify({...profileAnswers,email:homeEmail,packagePreference:'decide_later'})])).rows[0].result
  const id=(await db.query('select lead_id from recruitment_contact_receipts where submission_key=$1',[receipt])).rows[0].lead_id
  const key=crypto.randomUUID()
  const apply=()=>db.query('select recruitment_submit_verified_profile($1,$2,$3,$4,true,true) as result',[homeOrg,hash,profile.applicant.profileRevision,key])
  if(submit) expect((await apply()).rows[0].result.accepted).toBe(true)
  return {id,hash,apply}
}
async function claimMail() { await contactServer(); return (await db.query('select recruitment_claim_submission_emails(3) as result')).rows[0].result }
async function beginMail(job,kind=job.email_kind,message={to:homeEmail,subject:'Fixture',html:'<p>Fixture</p>',text:'Fixture'}) {
  return (await db.query('select recruitment_begin_submission_email($1,$2,$3,$4,$3,$5,null,$6::jsonb,false) as result',[homeUser,homeOrg,job.lead_id,kind,job.id,JSON.stringify(message)])).rows[0].result
}
async function acceptMail(job) {
  const begun=await beginMail(job)
  if(begun.send) await db.query("select recruitment_finish_invitation_email($1,$2,'provider_accepted',$3,null)",[job.id,begun.attempt.lease_id,'local-provider-'+job.id])
  return (await db.query('select recruitment_complete_submission_email($1,true,null,$2) as result',[job.id,job.lease_id])).rows[0].result
}
async function uploadMailDocument(application,type) {
  await contactServer()
  const id=crypto.randomUUID(),document={name:type+'.pdf',type,mimeType:'application/pdf',size:128}
  const prepared=(await db.query('select recruitment_prepare_applicant_document($1,$2,$3,$4::jsonb) as result',[homeOrg,application.hash,id,JSON.stringify(document)])).rows[0].result
  await db.exec('reset role;')
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('recruitment-documents',$1,'{\"size\":128,\"mimetype\":\"application/pdf\"}')",[prepared.path])
  await contactServer()
  expect((await db.query('select recruitment_commit_applicant_document($1,$2,$3) as result',[homeOrg,application.hash,id])).rows[0].result.saved).toBe(true)
  return id
}
async function ageMailApplication(application,hours=25) {
  // This isolated PGlite fixture advances its saved timestamps; no remote database is used.
  await db.exec('reset role; alter table recruitment_leads disable trigger user;')
  await db.query("update recruitment_leads set application_submitted_at=now()-make_interval(hours=>$2) where id=$1",[application.id,hours])
  await db.exec('alter table recruitment_leads enable trigger user;')
  await contactServer()
  await db.query("update recruitment_submission_email_queue set next_attempt_at=now()-interval '1 second',created_at=now()-interval '25 hours' where lead_id=$1 and email_kind='documents_followup'",[application.id])
}
it('extends both existing email workers without queuing any historical application or document notifications',async()=>{
  await db.exec('reset role;')
  const queues=(await db.query('select id,status from recruitment_submission_email_queue order by id')).rows
  const leads=(await db.query('select id,version,documents_json from recruitment_leads order by id')).rows
  const staff=(await db.query('select count(*) from recruitment_contact_notifications')).rows[0].count
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/'+emailFlowMigration,import.meta.url),'utf8'))
  expect((await db.query('select id,status from recruitment_submission_email_queue order by id')).rows).toEqual(queues)
  expect((await db.query('select id,version,documents_json from recruitment_leads order by id')).rows).toEqual(leads)
  expect((await db.query('select count(*) from recruitment_contact_notifications')).rows[0].count).toBe(staff)
})
it('preserves all three first-form recipients and sends no full-application emails for a saved draft',async()=>{
  mailApplication=await newMailApplication(false)
  expect((await db.query('select recipient,event_kind from recruitment_contact_notifications where lead_id=$1 order by recipient',[mailApplication.id])).rows).toEqual(staffRecipients.map(recipient=>({recipient,event_kind:'lead_received'})))
  expect((await db.query('select * from recruitment_submission_email_queue where lead_id=$1',[mailApplication.id])).rows).toEqual([])
})
it('rolls back application emails with a failed transaction and queues all six once when the verified full form commits',async()=>{
  await db.exec('begin;')
  await mailApplication.apply()
  expect((await db.query('select id from recruitment_submission_email_queue where lead_id=$1',[mailApplication.id])).rows).toHaveLength(3)
  await db.exec('rollback;')
  expect((await db.query('select id from recruitment_submission_email_queue where lead_id=$1',[mailApplication.id])).rows).toHaveLength(0)
  expect((await mailApplication.apply()).rows[0].result.accepted).toBe(true)
  mailJobs=(await db.query('select * from recruitment_submission_email_queue where lead_id=$1 order by email_kind',[mailApplication.id])).rows
  expect(mailJobs.map(job=>job.email_kind)).toEqual(['application_thanks','documents_followup','documents_reminder'])
  const followup=mailJobs.find(job=>job.email_kind==='documents_followup')
  const submitted=(await db.query('select application_submitted_at from recruitment_leads where id=$1',[mailApplication.id])).rows[0].application_submitted_at
  expect(new Date(followup.next_attempt_at)-new Date(submitted)).toBe(24*60*60*1000)
  expect((await db.query("select recipient from recruitment_contact_notifications where lead_id=$1 and event_kind='application_received' order by recipient",[mailApplication.id])).rows.map(row=>row.recipient)).toEqual(staffRecipients)
  expect((await mailApplication.apply()).rows[0].result.duplicate).toBe(true)
  expect((await db.query('select id from recruitment_submission_email_queue where lead_id=$1 order by email_kind',[mailApplication.id])).rows.map(row=>row.id)).toEqual(mailJobs.map(job=>job.id))
})
it('sends the thank-you before document instructions, keeps the one-day reminder deferred and rejects forged email kinds',async()=>{
  const claims=await claimMail();expect(claims).toHaveLength(1);thanksClaim=claims[0]
  expect(thanksClaim.email_kind).toBe('application_thanks')
  expect(await claimMail()).toEqual([])
  await expect(beginMail(thanksClaim,'documents_reminder')).rejects.toThrow('Claim the saved')
  expect((await db.query('select recruitment_complete_submission_email($1,true,null,$2) as result',[thanksClaim.id,thanksClaim.lease_id])).rows[0].result).toBe(false)
  expect(await acceptMail(thanksClaim)).toBe(true)
  const next=await claimMail();expect(next).toHaveLength(1);requestClaim=next[0]
  expect(requestClaim.email_kind).toBe('documents_reminder')
})
it('retains the document email payload through uncertain retries and requires the current queue lease and provider receipt',async()=>{
  const first=await beginMail(requestClaim)
  expect(first.send).toBe(true)
  expect((await beginMail(requestClaim)).busy).toBe(true)
  await db.query("select recruitment_finish_invitation_email($1,$2,'unknown',null,'dispatch_unconfirmed')",[requestClaim.id,first.attempt.lease_id])
  const retry=await beginMail(requestClaim,requestClaim.email_kind,{to:homeEmail,subject:'Changed',text:'Changed'})
  expect(retry.attempt.message_json).toEqual(first.attempt.message_json)
  await db.query("select recruitment_finish_invitation_email($1,$2,'provider_accepted','local-documents-provider',null)",[requestClaim.id,retry.attempt.lease_id])
  expect((await db.query('select recruitment_complete_submission_email($1,true,null,$2) as result',[requestClaim.id,crypto.randomUUID()])).rows[0].result).toBe(false)
  expect((await db.query('select recruitment_complete_submission_email($1,true,null,$2) as result',[requestClaim.id,requestClaim.lease_id])).rows[0].result).toBe(true)
  expect(await claimMail()).toEqual([])
})
it('starts the deferred reminder after 24 hours even though its queue row was created more than 23 hours ago',async()=>{
  await ageMailApplication(mailApplication)
  const claims=await claimMail();expect(claims).toHaveLength(1)
  expect(claims[0]).toMatchObject({email_kind:'documents_followup',first_attempt_at:null,status:'sending'})
  expect(await acceptMail(claims[0])).toBe(true)
  expect(await claimMail()).toEqual([])
})
it('does not notify staff or mark the applicant pack complete after only the original four requested files',async()=>{
  for(const type of ['CV','Identity document','Qualifications','Registration evidence']) await uploadMailDocument(mailApplication,type)
  expect((await db.query("select id from recruitment_contact_notifications where lead_id=$1 and event_kind='documents_received'",[mailApplication.id])).rows).toHaveLength(0)
  expect((await db.query('select recruitment_resume_applicant($1,$2) as result',[homeOrg,mailApplication.hash])).rows[0].result.documentsComplete).toBe(false)
  await asUser(manager)
  await expect(db.query("update recruitment_leads set status='under_review' where id=$1",[mailApplication.id])).rejects.toThrow('proof of address')
})
it('queues the completed-pack notice for all three recipients only after the fifth retained file and never repeats it on a retry or replacement',async()=>{
  const id=await uploadMailDocument(mailApplication,'Other')
  const notices=(await db.query("select id,recipient from recruitment_contact_notifications where lead_id=$1 and event_kind='documents_received' order by recipient",[mailApplication.id])).rows
  expect(notices.map(row=>row.recipient)).toEqual(staffRecipients)
  expect((await db.query('select recruitment_resume_applicant($1,$2) as result',[homeOrg,mailApplication.hash])).rows[0].result.documentsComplete).toBe(true)
  expect((await db.query('select recruitment_commit_applicant_document($1,$2,$3) as result',[homeOrg,mailApplication.hash,id])).rows[0].result.duplicate).toBe(true)
  await uploadMailDocument(mailApplication,'Other')
  expect((await db.query("select id,recipient from recruitment_contact_notifications where lead_id=$1 and event_kind='documents_received' order by recipient",[mailApplication.id])).rows).toEqual(notices)
})
it('cancels a due reminder if the pack completes after claim, preventing a late provider call or stale completion',async()=>{
  const application=await newMailApplication()
  expect(await acceptMail((await claimMail())[0])).toBe(true)
  expect(await acceptMail((await claimMail())[0])).toBe(true)
  await ageMailApplication(application)
  const followup=(await claimMail())[0]
  expect(followup.email_kind).toBe('documents_followup')
  for(const type of ['CV','Identity document','Qualifications','Registration evidence','Other']) await uploadMailDocument(application,type)
  expect((await db.query('select status,last_error from recruitment_submission_email_queue where id=$1',[followup.id])).rows[0]).toEqual({status:'cancelled',last_error:'documents_complete'})
  await expect(beginMail(followup)).rejects.toThrow('Claim the saved')
  expect((await db.query('select recruitment_complete_submission_email($1,false,null,$2) as result',[followup.id,followup.lease_id])).rows[0].result).toBe(false)
  expect(await claimMail()).toEqual([])
})
it('cancels unsent applicant messages and the reminder after application closure',async()=>{
  const application=await newMailApplication()
  await asUser(manager)
  await db.query("update recruitment_leads set status='closed_lost' where id=$1",[application.id])
  expect(await claimMail()).toEqual([])
  expect((await db.query('select status from recruitment_submission_email_queue where lead_id=$1',[application.id])).rows.map(row=>row.status)).toEqual(['cancelled','cancelled','cancelled'])
})
it('keeps the extended queues and mail controls inaccessible to applicants, managers and anonymous callers',async()=>{
  for(const actor of [homeUser,manager,null]) {
    if(actor) await asUser(actor);else await db.exec('reset role; set role anon;')
    await expect(db.query('select * from recruitment_submission_email_queue')).rejects.toThrow('permission denied')
    await expect(db.query('select * from recruitment_contact_notifications')).rejects.toThrow('permission denied')
    await expect(db.query('select recruitment_claim_submission_emails(3)')).rejects.toThrow('permission denied')
    await expect(db.query('select recruitment_complete_submission_email($1,true,null,$2)',[thanksClaim.id,thanksClaim.lease_id])).rejects.toThrow('permission denied')
    await expect(db.query('select recruitment_queue_application_notifications()')).rejects.toThrow('permission denied')
  }
  await db.exec('reset role;')
  expect((await db.query("select count(*) from pg_class where relname in ('recruitment_submission_email_queue','recruitment_contact_notifications') and relrowsecurity")).rows[0].count).toBe(2)
})
it('recovers an expired queue lease with the same provider payload and blocks the old worker from completing it',async()=>{
  const application=await newMailApplication()
  const first=(await claimMail())[0],attempt=await beginMail(first)
  await db.query("select recruitment_finish_invitation_email($1,$2,'unknown',null,'dispatch_unconfirmed')",[first.id,attempt.attempt.lease_id])
  await db.query("update recruitment_submission_email_queue set next_attempt_at=now()-interval '1 second',leased_until=now()-interval '1 second' where id=$1",[first.id])
  const recovered=(await claimMail())[0]
  expect(recovered.id).toBe(first.id);expect(recovered.lease_id).not.toBe(first.lease_id)
  expect((await db.query('select recruitment_complete_submission_email($1,false,null,$2) as result',[first.id,first.lease_id])).rows[0].result).toBe(false)
  expect((await beginMail(recovered,recovered.email_kind,{to:homeEmail,text:'Changed'})).attempt.message_json).toEqual(attempt.attempt.message_json)
  await db.query("update recruitment_invitation_deliveries set leased_at=now()-interval '61 seconds' where id=$1",[first.id])
  expect(await acceptMail(recovered)).toBe(true)
  expect(await acceptMail((await claimMail())[0])).toBe(true)
  await asUser(manager);await db.query("update recruitment_leads set status='closed_lost' where id=$1",[application.id])
  expect(await claimMail()).toEqual([])
})
it('stops uncertain retries 23 hours after the first provider attempt, preserving the saved receipt for staff review',async()=>{
  const application=await newMailApplication(),job=(await claimMail())[0]
  const first=await beginMail(job)
  await db.query("select recruitment_finish_invitation_email($1,$2,'unknown',null,'dispatch_unconfirmed')",[job.id,first.attempt.lease_id])
  await db.query("update recruitment_submission_email_queue set first_attempt_at=now()-interval '23 hours 1 minute',next_attempt_at=now()-interval '1 second',leased_until=now()-interval '1 second' where id=$1",[job.id])
  await claimMail()
  expect((await db.query('select status,last_error from recruitment_submission_email_queue where id=$1',[job.id])).rows[0]).toEqual({status:'needs_attention',last_error:'retry_window_ended'})
  expect((await db.query('select message_json,status from recruitment_invitation_deliveries where id=$1',[job.id])).rows[0]).toEqual({message_json:first.attempt.message_json,status:'unknown'})
  await asUser(manager);await db.query("update recruitment_leads set status='closed_lost' where id=$1",[application.id])
  await claimMail()
})
it('requires the extra FICA proof only for Home Seekers, preserving other agencies document rules',async()=>{
  await contactServer()
  const files=JSON.stringify(['CV','Identity document','Qualifications','Registration evidence'].map(type=>({type,path:'own/'+type})))
  expect((await db.query("select recruitment_requested_documents_complete($1,$2::jsonb,'{}') as result",[org,files])).rows[0].result).toBe(true)
  expect((await db.query("select recruitment_requested_documents_complete($1,$2::jsonb,'{}') as result",[homeOrg,files])).rows[0].result).toBe(false)
})
it('denies forged applicants, agencies, references, recipients and force-send flags in the expanded automation claim',async()=>{
  const application=await newMailApplication(),job=(await claimMail())[0]
  const args=[homeUser,homeOrg,application.id,job.email_kind,application.id,job.id,null,JSON.stringify({to:homeEmail,text:'Fixture'}),false]
  const invoke=values=>db.query('select recruitment_begin_submission_email($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) as result',values)
  for(const [index,value] of [[0,manager],[1,other],[2,otherLead],[4,otherLead],[6,'a'.repeat(64)],[8,true]]) {
    const forged=[...args];forged[index]=value
    await expect(invoke(forged)).rejects.toThrow('Claim the saved')
  }
  const recipient=[...args];recipient[7]=JSON.stringify({to:'attacker@agency.test',text:'Fixture'})
  await expect(invoke(recipient)).rejects.toThrow('saved applicant')
  expect(await acceptMail(job)).toBe(true)
  await asUser(manager);await db.query("update recruitment_leads set status='closed_lost' where id=$1",[application.id])
  expect(await claimMail()).toEqual([])
})

let unifiedLoginUser, unifiedLoginLead, unifiedLoginReceipt
it('extends the common login to verified saved drafts without changing existing records or sending mail', async () => {
  await db.exec('reset role;')
  const before=(await db.query('select id,status,application_submitted_at from recruitment_leads order by id')).rows
  const queues=(await db.query('select count(*)::int as n from recruitment_submission_email_queue')).rows[0].n
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261010162130_home_seekers_unified_login.sql',import.meta.url),'utf8'))
  expect((await db.query('select id,status,application_submitted_at from recruitment_leads order by id')).rows).toEqual(before)
  expect((await db.query('select count(*)::int as n from recruitment_submission_email_queue')).rows[0].n).toBe(queues)
  unifiedLoginUser=crypto.randomUUID();unifiedLoginReceipt=crypto.randomUUID()
  const email='unified.login@example.test',hash=createHash('sha256').update(crypto.randomUUID()).digest('hex')
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[unifiedLoginUser,email])
  await contactServer()
  const link=(await db.query("select id from recruitment_intake_links where organisation_id=$1 and channel='website'",[homeOrg])).rows[0].id
  expect((await captureContact(link,unifiedLoginReceipt,{...contact,email},hash)).accepted).toBe(true)
  expect((await db.query('select recruitment_open_applicant_session($1,$2,$3,$4) as opened',[homeOrg,unifiedLoginUser,hash,unifiedLoginReceipt])).rows[0].opened).toBe(true)
  unifiedLoginLead=(await db.query('select lead_id from recruitment_contact_receipts where submission_key=$1',[unifiedLoginReceipt])).rows[0].lead_id
  expect((await db.query('select recruitment_applicant_account_receipt($1) as receipt',[unifiedLoginUser])).rows[0].receipt).toBe(unifiedLoginReceipt)
  await asUser(unifiedLoginUser)
  expect((await db.query('select recruitment_applicant_portal_required() as required')).rows[0].required).toBe(true)
  await expect(db.query('select recruitment_applicant_account_receipt($1)',[unifiedLoginUser])).rejects.toThrow('permission denied')
  await asUser(manager)
  expect((await db.query('select recruitment_applicant_portal_required() as required')).rows[0].required).toBe(false)
})
it('keeps approved and onboarding applicants in My Profile until activation, even with an accepted membership',async()=>{
  await db.exec('reset role;')
  await db.query("insert into organisation_users values($1,$2,'active','agent')",[homeOrg,unifiedLoginUser])
  // Isolated stage fixtures exercise the login gate; the existing activation
  // journey above separately proves the transitions and membership checks.
  for(const stage of ['application_submitted','application_approved','contract_signed','onboarding_complete','agent_activated']) {
    await db.exec("reset role; set session_replication_role='replica';")
    try { await db.query('update recruitment_leads set status=$1 where id=$2',[stage,unifiedLoginLead]) }
    finally { await db.exec("set session_replication_role='origin';") }
    await asUser(unifiedLoginUser)
    expect((await db.query('select recruitment_applicant_portal_required() as required')).rows[0].required).toBe(stage!=='agent_activated')
  }
  await contactServer()
  expect((await db.query('select recruitment_applicant_account_receipt($1) as receipt',[unifiedLoginUser])).rows[0].receipt).toBeNull()
})
it('does not route a foreign, banned or changed-email identity into another person’s application',async()=>{
  await db.exec("reset role; set session_replication_role='replica';")
  try { await db.query("update recruitment_leads set status='lead_received' where id=$1",[unifiedLoginLead]) }
  finally { await db.exec("set session_replication_role='origin';") }
  for(const update of ["banned_until=now()+interval '1 day'", "banned_until=null,email='changed.unified@example.test'"]) {
    await db.exec('reset role;')
    await db.query(`update auth.users set ${update} where id=$1`,[unifiedLoginUser])
    await asUser(unifiedLoginUser)
    expect((await db.query('select recruitment_applicant_portal_required() as required')).rows[0].required).toBe(false)
    await contactServer()
    expect((await db.query('select recruitment_applicant_account_receipt($1) as receipt',[unifiedLoginUser])).rows[0].receipt).toBeNull()
  }
  await asUser(agent)
  expect((await db.query('select recruitment_applicant_portal_required() as required')).rows[0].required).toBe(false)
  await db.exec('reset role; set role anon;')
  await expect(db.query('select recruitment_applicant_portal_required()')).rejects.toThrow('permission denied')
})

let optionalFindingsLead, optionalFindingsReview
const saveOptionalFindings = review => db.query('update recruitment_leads set review_json=$1::jsonb where id=$2 returning *',[JSON.stringify(review),optionalFindingsLead.id])
it('allows approved items to save without findings while preserving existing reviews and server audit stamps',async()=>{
  const application = await newMailApplication()
  for (const type of ['CV','Identity document','Qualifications','Registration evidence','Other']) await uploadMailDocument(application,type)
  await asUser(manager)
  const submitted = (await db.query('select * from recruitment_leads where id=$1',[application.id])).rows[0]
  optionalFindingsLead = (await db.query('select * from recruitment_start_review($1,$2,$3)',[homeOrg,application.id,submitted.version])).rows[0]
  optionalFindingsReview = {...optionalFindingsLead.review_json,checks:Object.fromEntries(Object.entries(optionalFindingsLead.review_json.checks).map(([key,value])=>[key,{...value,status:'verified',notes:''}])),documents:optionalFindingsLead.documents_json.map(document=>({path:document.path,status:'reviewed',notes:''}))}
  await expect(saveOptionalFindings(optionalFindingsReview)).rejects.toThrow('finding or reason')
  await db.exec('reset role;')
  const before = (await db.query('select id,status,review_json,review_updated_at from recruitment_leads order by id')).rows
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261010202255_recruitment_optional_review_findings.sql',import.meta.url),'utf8'))
  expect((await db.query('select id,status,review_json,review_updated_at from recruitment_leads order by id')).rows).toEqual(before)
  const guard = (await db.query("select prosecdef,proconfig from pg_proc where oid='public.recruitment_review_guard()'::regprocedure")).rows[0]
  expect(guard.prosecdef).toBe(false)
  expect(guard.proconfig).toContain('search_path=""')
  await asUser(manager)
  optionalFindingsLead = (await saveOptionalFindings(optionalFindingsReview)).rows[0]
  expect(optionalFindingsLead.status).toBe('under_review')
  expect(optionalFindingsLead.review_status).toBe('ready_for_approval')
  expect(optionalFindingsLead.review_updated_by).toBe(manager)
  expect([...Object.values(optionalFindingsLead.review_json.checks),...optionalFindingsLead.review_json.documents].every(item=>item.notes===''&&item.updatedBy===manager)).toBe(true)
  optionalFindingsReview.checks.qualifications.notes = 'OK'
  optionalFindingsReview.documents[0].notes = 'OK'
  expect((await saveOptionalFindings(optionalFindingsReview)).rows[0].review_status).toBe('ready_for_approval')
})
it('still requires a meaningful rejection reason for both checks and files',async()=>{
  await asUser(manager)
  for (const notes of ['', '   ', 'No']) {
    const checkReview = structuredClone(optionalFindingsReview)
    checkReview.checks.registration = {...checkReview.checks.registration,status:'needs_information',notes}
    await expect(saveOptionalFindings(checkReview)).rejects.toThrow('reason for rejected items')
    const documentReview = structuredClone(optionalFindingsReview)
    documentReview.documents[0] = {...documentReview.documents[0],status:'needs_information',notes}
    await expect(saveOptionalFindings(documentReview)).rejects.toThrow('reason for rejected items')
  }
  const rejected = structuredClone(optionalFindingsReview)
  rejected.checks.registration = {...rejected.checks.registration,status:'needs_information',notes:'The FFC certificate has expired.'}
  rejected.documents[0] = {...rejected.documents[0],status:'needs_information',notes:'Please upload a legible copy.'}
  expect((await saveOptionalFindings(rejected)).rows[0].review_status).toBe('needs_information')
})
it('retains note limits, evidence ownership, management access and the document-pack gate with optional findings',async()=>{
  await asUser(manager)
  for (const notes of [null,'x'.repeat(2001)]) {
    const review = structuredClone(optionalFindingsReview)
    review.checks.registration.notes = notes
    await expect(saveOptionalFindings(review)).rejects.toThrow('notes up to 2000')
    review.checks.registration.notes = ''
    review.documents[0].notes = notes
    await expect(saveOptionalFindings(review)).rejects.toThrow('notes up to 2000')
  }
  const foreign = structuredClone(optionalFindingsReview)
  foreign.checks.registration.evidence = [`${other}/${otherLead}/cv`]
  await expect(saveOptionalFindings(foreign)).rejects.toThrow('belonging to this lead')
  await asUser(agent)
  expect((await saveOptionalFindings(optionalFindingsReview)).rows).toEqual([])
  const incomplete = await newMailApplication()
  await asUser(manager)
  const lead = (await db.query('select * from recruitment_leads where id=$1',[incomplete.id])).rows[0]
  await expect(db.query('select * from recruitment_start_review($1,$2,$3)',[homeOrg,lead.id,lead.version])).rejects.toThrow('document pack')
})

let portalContractLead, portalContractApplication, portalReturnId
it('publishes a private version in My Profile atomically and queues one applicant email without granting workspace access', async () => {
  await db.exec('reset role;')
  await db.exec(readFileSync(new URL('../../../../../supabase/migrations/20261010205014_recruitment_contract_portal.sql',import.meta.url),'utf8'))
  expect((await db.query("select prosecdef from pg_proc where oid='public.recruitment_queue_application_notifications()'::regprocedure")).rows[0].prosecdef).toBe(true)
  portalContractApplication = await newMailApplication()
  for (const type of ['CV','Identity document','Qualifications','Registration evidence','Other']) await uploadMailDocument(portalContractApplication,type)
  await asUser(manager)
  let current = (await db.query('select * from recruitment_leads where id=$1',[portalContractApplication.id])).rows[0]
  current = (await db.query('select * from recruitment_start_review($1,$2,$3)',[homeOrg,current.id,current.version])).rows[0]
  const review = {...current.review_json,checks:Object.fromEntries(Object.entries(current.review_json.checks).map(([key,value])=>[key,{...value,status:'verified',notes:''}])),documents:current.documents_json.map(d=>({path:d.path,status:'reviewed',notes:''}))}
  current = (await db.query('update recruitment_leads set review_json=$1::jsonb where id=$2 returning *',[JSON.stringify(review),current.id])).rows[0]
  current = (await db.query('select * from recruitment_approve_application($1,$2,$3,$4)',[homeOrg,current.id,current.version,approvalConfirmation])).rows[0]
  const document = {path:`${homeOrg}/${current.id}/${crypto.randomUUID()}`,name:'Agency contract.pdf',size:128}
  await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('recruitment-contracts',$1,$2,'{\"size\":128,\"mimetype\":\"application/pdf\"}')",[document.path,manager])
  await expect(db.query('select * from recruitment_publish_contract($1,$2,$3,$4::jsonb)',[homeOrg,current.id,current.version-1,JSON.stringify(document)])).rejects.toThrow('changed')
  portalContractLead = (await db.query('select * from recruitment_publish_contract($1,$2,$3,$4::jsonb)',[homeOrg,current.id,current.version,JSON.stringify(document)])).rows[0]
  expect(portalContractLead.status).toBe('contract_sent')
  expect(portalContractLead.contract_delivery_json).toMatchObject({source:'applicant_portal',contractVersion:1,contractPath:document.path,recipientContact:homeEmail,recordedBy:manager})
  expect((await db.query('select * from recruitment_publish_contract($1,$2,$3,$4::jsonb)',[homeOrg,current.id,current.version,JSON.stringify(document)])).rows[0].version).toBe(portalContractLead.version)
  await contactServer()
  expect((await db.query("select count(*)::int as n from recruitment_submission_email_queue where lead_id=$1 and email_kind='contract_available'",[current.id])).rows[0].n).toBe(1)
  const contract = (await db.query('select recruitment_applicant_contract($1,$2) as c',[homeOrg,portalContractApplication.hash])).rows[0].c
  expect(contract).toMatchObject({path:document.path,bucket:'recruitment-contracts',canUpload:true,verified:false,returns:[]})
  expect((await db.query('select recruitment_applicant_contract($1,$2) as c',[homeOrg,createHash('sha256').update(crypto.randomUUID()).digest('hex')])).rows[0].c.unavailable).toBe(true)
  await asUser(homeUser)
  expect((await db.query('select * from recruitment_leads where id=$1',[current.id])).rows).toEqual([])
  await expect(db.query('select recruitment_applicant_contract($1,$2)',[homeOrg,portalContractApplication.hash])).rejects.toThrow('permission denied')
})
it('confirms only a saved PDF for the verified applicant, retains returns and notifies the agency once per upload', async () => {
  await contactServer()
  portalReturnId=crypto.randomUUID()
  const document={name:'Signed contract.pdf',size:128,mimeType:'application/pdf'}
  const prepare=()=>db.query('select recruitment_prepare_contract_return($1,$2,$3,$4::jsonb) as r',[homeOrg,portalContractApplication.hash,portalReturnId,JSON.stringify(document)])
  const prepared=(await prepare()).rows[0].r
  await expect(db.query('select recruitment_commit_contract_return($1,$2,$3)',[homeOrg,portalContractApplication.hash,portalReturnId])).rejects.toThrow('verified')
  await db.exec('reset role;')
  await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('recruitment-signed-contracts',$1,$2,'{\"size\":128,\"mimetype\":\"application/pdf\"}')",[prepared.path,manager])
  await contactServer()
  const commit=()=>db.query('select recruitment_commit_contract_return($1,$2,$3) as r',[homeOrg,portalContractApplication.hash,portalReturnId])
  expect((await commit()).rows[0].r).toEqual({saved:true,duplicate:false})
  expect((await commit()).rows[0].r).toEqual({saved:true,duplicate:true})
  expect((await prepare()).rows[0].r.committed).toBe(true)
  expect((await db.query("select recipient,event_key from recruitment_contact_notifications where lead_id=$1 and event_kind='contract_returned' order by recipient",[portalContractLead.id])).rows).toEqual(staffRecipients.map(recipient=>({recipient,event_key:portalReturnId})))
  const contract=(await db.query('select recruitment_applicant_contract($1,$2,$3) as c',[homeOrg,portalContractApplication.hash,portalReturnId])).rows[0].c
  expect(contract).toMatchObject({path:prepared.path,bucket:'recruitment-signed-contracts',returns:[{id:portalReturnId,name:document.name,contractVersion:1}]})
  expect(contract.returns[0].path).toBeUndefined()
  await expect(db.query('select recruitment_prepare_contract_return($1,$2,$3,$4::jsonb)',[homeOrg,portalContractApplication.hash,portalReturnId,JSON.stringify({...document,name:'Other.pdf'})])).rejects.toThrow('another contract')
  await asUser(manager)
  portalContractLead=(await db.query('select * from recruitment_leads where id=$1',[portalContractLead.id])).rows[0]
  expect(portalContractLead.status).toBe('contract_sent')
  expect(portalContractLead.contract_signature_json).toEqual({})
  expect(portalContractLead.contract_returns_json).toHaveLength(1)
  await expect(db.query("update recruitment_leads set contract_returns_json='[]' where id=$1",[portalContractLead.id])).rejects.toThrow('immutable')
  expect((await db.query("delete from storage.objects where bucket_id='recruitment-signed-contracts' and name=$1 returning name",[prepared.path])).rows).toEqual([])
})
it('retains corrected signed uploads and deduplicates each notification independently', async () => {
  await contactServer()
  const id=crypto.randomUUID(), document={name:'Corrected signed.pdf',size:128,mimeType:'application/pdf'}
  const prepared=(await db.query('select recruitment_prepare_contract_return($1,$2,$3,$4::jsonb) as r',[homeOrg,portalContractApplication.hash,id,JSON.stringify(document)])).rows[0].r
  await db.exec('reset role;')
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('recruitment-signed-contracts',$1,'{\"size\":128,\"mimetype\":\"application/pdf\"}')",[prepared.path])
  await contactServer()
  await db.query('select recruitment_commit_contract_return($1,$2,$3)',[homeOrg,portalContractApplication.hash,id])
  await db.query('select recruitment_commit_contract_return($1,$2,$3)',[homeOrg,portalContractApplication.hash,id])
  expect((await db.query("select count(*)::int as n from recruitment_contact_notifications where lead_id=$1 and event_kind='contract_returned'",[portalContractLead.id])).rows[0].n).toBe(6)
  await asUser(manager)
  portalContractLead=(await db.query('select * from recruitment_leads where id=$1',[portalContractLead.id])).rows[0]
  expect(portalContractLead.contract_returns_json).toHaveLength(2)
})
it('requires agency signature verification before advancing a returned contract and then locks applicant uploads', async () => {
  await asUser(manager)
  const returned=portalContractLead.contract_returns_json.at(-1)
  const signature={...returned,agentSigner:'Applicant Agent',organisationSigner:'Agency Principal',signedOn:portalContractLead.contract_delivery_json.sentOn,method:'wet_ink',reference:'',notes:'Both signatures and all pages checked.',checks:{sameVersion:true,allPages:true,agentSignature:true,organisationSignature:false}}
  await expect(db.query('select * from recruitment_record_contract_signature($1,$2,$3,$4::jsonb)',[homeOrg,portalContractLead.id,portalContractLead.version,JSON.stringify(signature)])).rejects.toThrow('both signatures')
  signature.checks.organisationSignature=true
  const signed=(await db.query('select * from recruitment_record_contract_signature($1,$2,$3,$4::jsonb)',[homeOrg,portalContractLead.id,portalContractLead.version,JSON.stringify(signature)])).rows[0]
  expect(signed.status).toBe('contract_signed')
  expect(signed.contract_signature_json).toMatchObject({path:returned.path,source:'staff_verified',recordedBy:manager})
  await contactServer()
  expect((await db.query('select recruitment_applicant_contract($1,$2) as c',[homeOrg,portalContractApplication.hash])).rows[0].c).toMatchObject({canUpload:false,verified:true})
  expect((await db.query('select recruitment_prepare_contract_return($1,$2,$3,$4::jsonb) as r',[homeOrg,portalContractApplication.hash,crypto.randomUUID(),JSON.stringify({name:'Late.pdf',size:128,mimeType:'application/pdf'})])).rows[0].r.unavailable).toBe(true)
})

it('preserves staff document notifications after extending the queue deduplication key', async () => {
  const application=await newMailApplication()
  for (const type of ['CV','Identity document','Qualifications','Registration evidence']) await uploadMailDocument(application,type)
  await asUser(manager)
  const lead=(await db.query('select * from recruitment_leads where id=$1',[application.id])).rows[0]
  const path=`${homeOrg}/${lead.id}/${crypto.randomUUID()}`
  await db.query("insert into storage.objects(bucket_id,name,owner_id) values('recruitment-documents',$1,$2)",[path,manager])
  const document={path,name:'Address.pdf',type:'Other'}
  await db.query('update recruitment_leads set documents_json=$1::jsonb where id=$2',[JSON.stringify([...lead.documents_json,document]),lead.id])
  await contactServer()
  expect((await db.query("select count(*)::int as n from recruitment_contact_notifications where lead_id=$1 and event_kind='documents_received'",[lead.id])).rows[0].n).toBe(3)
})
