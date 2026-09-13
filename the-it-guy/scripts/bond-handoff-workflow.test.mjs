import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const db = new PGlite()
const user='00000000-0000-0000-0000-000000000001', app='00000000-0000-0000-0000-000000000002', pkg='00000000-0000-0000-0000-000000000003', transaction='00000000-0000-0000-0000-000000000004', submission='00000000-0000-0000-0000-000000000005'
await db.exec(`
create role anon; create role authenticated; create schema auth;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
create table bond_applications(id uuid primary key,status text,revision integer,active_submission_id uuid);
create table transaction_bond_application_export_packages(id uuid primary key,bond_application_id uuid,transaction_id uuid,destination_key text,status text,created_at timestamptz default now());
create table transaction_bond_originator_workspace_assignments(export_package_id uuid,assigned_to_profile_id uuid,status text);
create table bond_application_document_requirements(bond_application_id uuid,status text,required_before text default 'required_before_signature',metadata jsonb default '{}');
create table bond_application_participants(bond_application_id uuid,status text);
create table transaction_bond_originator_document_requests(export_package_id uuid,status text);
create table transaction_bond_application_submissions(id uuid,transaction_id uuid,bond_application_id uuid,status text,signed_at timestamptz,source_application_revision integer,signer_manifest_json jsonb);
create table bond_application_submission_readiness_assessments(id uuid default gen_random_uuid(),export_package_id uuid,bond_application_id uuid,assessed_by uuid,application_revision integer,status text,blockers jsonb,snapshot jsonb,assessed_at timestamptz default now(),metadata jsonb,unique(export_package_id,application_revision));
create table bond_application_external_submission_records(id uuid default gen_random_uuid(),export_package_id uuid,bond_application_id uuid,readiness_assessment_id uuid,submitted_by uuid,lender_names text[],external_reference text,confirmation_document_id uuid,notes text,metadata jsonb,status text default 'recorded',submitted_at timestamptz default now());
`)
await db.exec(readFileSync(new URL('../../supabase/migrations/20260913122717_bond_application_submission_readiness_hardening.sql',import.meta.url),'utf8'))
await db.exec(`select set_config('test.user','${user}',false);
insert into bond_applications values('${app}','draft',1,'${submission}');
insert into transaction_bond_application_export_packages(id,bond_application_id,transaction_id,destination_key,status) values('${pkg}','${app}','${transaction}','bond_originator_intake','accepted_by_originator');
insert into transaction_bond_originator_workspace_assignments values('${pkg}','${user}','accepted');
insert into bond_application_participants values('${app}','awaiting_signature');
`)
const assess=async()=> (await db.query(`select bridge_assess_bond_application_submission_readiness_phase7('${pkg}') as result`)).rows[0].result
assert.equal((await assess()).status,'blocked')
await db.exec(`update bond_application_participants set status='completed'; insert into transaction_bond_application_submissions values('${submission}','${transaction}','${app}','submitted',now(),1,'[{"participantRole":"primary_applicant"}]');`)
assert.equal((await assess()).status,'ready')
await db.exec(`insert into bond_application_document_requirements(bond_application_id,status,required_before) values('${app}','active','requested_after_originator_review');`)
assert.equal((await assess()).status,'ready')
await db.exec(`update bond_application_document_requirements set required_before='required_before_bank_submission';`)
assert.equal((await assess()).status,'blocked')
await db.exec(`update bond_application_document_requirements set status='satisfied';`)
assert.equal((await assess()).status,'ready')
await db.exec(`update bond_applications set revision=2;`)
const view=(await db.query('select bridge_bond_application_submission_readiness_view_phase7() as result')).rows[0].result
assert.equal(view.items[0].assessment.status,'blocked')
await assert.rejects(db.query(`select bridge_record_bond_application_external_submission_phase8('${pkg}')`), /current ready submission assessment/)
await db.exec(`update transaction_bond_application_submissions set source_application_revision=2;`)
assert.equal((await assess()).status,'ready')
await db.exec(`insert into transaction_bond_originator_document_requests values('${pkg}','awaiting_review');`)
await assert.rejects(db.query(`select bridge_record_bond_application_external_submission_phase8('${pkg}')`), /current ready submission assessment/)
await db.exec(`update transaction_bond_originator_document_requests set status='accepted';`)
const record=(await db.query(`select bridge_record_bond_application_external_submission_phase8('${pkg}') as result`)).rows[0].result
assert.equal(record.status,'recorded')
await db.exec(`select set_config('test.user','00000000-0000-0000-0000-000000000099',false);`)
await assert.rejects(assess(), /Assigned bond application package not found/)

await db.exec(`select set_config('test.user','${user}',false);
create table onboarding_form_data(transaction_id uuid,form_data jsonb,updated_at timestamptz);
create table documents(id uuid primary key,transaction_id uuid,status text,review_status text,archived_at timestamptz);
alter table bond_applications add submitted_at timestamptz, add locked_at timestamptz, add metadata jsonb default '{}', add updated_at timestamptz, add active_change_request_id uuid, add revision_base_submission_id uuid, add revision_status text, add revision_opened_at timestamptz, add revision_opened_by uuid;
alter table transaction_bond_application_submissions add submission_version integer default 1, add snapshot_hash text default 'original-hash', add signed_document_id uuid;
alter table transaction_bond_originator_document_requests add id uuid default gen_random_uuid(), add transaction_id uuid, add bond_application_id uuid, add linked_document_id uuid, add reviewed_at timestamptz, add reviewed_by uuid, add withdrawn_at timestamptz, add resolved_at timestamptz, add last_originator_action_at timestamptz, add updated_at timestamptz, add created_at timestamptz default now(), add buyer_safe_feedback text, add buyer_instruction text, add internal_note text, add title text, add due_at timestamptz, add metadata jsonb default '{}';
create table bond_application_change_requests(id uuid primary key default gen_random_uuid(),bond_application_id uuid,base_submission_id uuid,request_type text,status text,requires_new_submission boolean,target_application_revision integer,requested_by uuid,requested_by_role text,buyer_visible_summary text,sent_at timestamptz,metadata jsonb default '{}',resolved_at timestamptz,updated_at timestamptz,created_at timestamptz default now());
create table bond_application_change_request_items(change_request_id uuid,target_scope text,target_type text,title text,buyer_instruction text,requires_new_submission boolean,status text default 'open',reviewed_at timestamptz,reviewed_by uuid);
`)
await db.exec(readFileSync(new URL('../../supabase/migrations/20260913124839_bond_originator_handoff_workflow.sql',import.meta.url),'utf8'))
const doc='00000000-0000-0000-0000-000000000006', replacement='00000000-0000-0000-0000-000000000007', request='00000000-0000-0000-0000-000000000008'
await db.exec(`delete from transaction_bond_originator_document_requests;
insert into documents values('${doc}','${transaction}','uploaded',null,null),('${replacement}','${transaction}','uploaded',null,null);
insert into transaction_bond_originator_document_requests(id,export_package_id,transaction_id,bond_application_id,linked_document_id,status) values('${request}','${pkg}','${transaction}','${app}','${doc}','awaiting_review');`)
const review=(action,id=doc,feedback='')=>db.query(`select bridge_review_bond_handoff_document($1,$2,$3,$4)`,[request,id,action,feedback])
await assert.rejects(review('reject'),/Explain/)
await assert.rejects(review('accept',replacement),/document changed/)
assert.equal((await db.query(`select status from transaction_bond_originator_document_requests`)).rows[0].status,'awaiting_review')
await review('reject',doc,'Upload all pages')
assert.equal((await assess()).status,'blocked')
await assert.rejects(review('accept'),/Wait for a new upload/)
await db.exec(`update transaction_bond_originator_document_requests set linked_document_id='${replacement}';`)
await review('accept',replacement)
assert.equal((await assess()).status,'ready')
await assert.rejects(review('withdraw',replacement,'No longer needed'),/already closed/)
await db.exec(`update transaction_bond_originator_document_requests set linked_document_id='${doc}';`)
assert.equal((await assess()).status,'blocked')
await review('withdraw',doc,'No longer needed')
assert.equal((await assess()).status,'ready')
const history=(await db.query(`select metadata->'reviewHistory' history from transaction_bond_originator_document_requests`)).rows[0].history
assert.equal(history.length,5)
await assert.rejects(db.query(`select bridge_record_bond_application_external_submission_phase8('${pkg}')`),/lender/)
await db.query(`select bridge_record_bond_application_external_submission_phase8($1,ARRAY['Test Bank'],'REF-42')`,[pkg])
const version=(await db.query(`select metadata->'submittedVersion' version from bond_application_external_submission_records where external_reference='REF-42'`)).rows[0].version
assert.equal(version.snapshotHash,'original-hash')
assert.equal(version.applicationRevision,2)
const correction=(await db.query(`select bridge_bond_handoff_correction($1,'request','Correct the purchase price') id`,[pkg])).rows[0].id
assert.equal((await assess()).status,'blocked')
await assert.rejects(db.query(`select bridge_bond_handoff_correction($1,'resolve',null,$2)`,[pkg,correction]),/newly signed/)
await assert.rejects(db.query(`select bridge_bond_handoff_correction($1,'request','Duplicate')`,[pkg]),/existing correction/)
const newSubmission='00000000-0000-0000-0000-000000000009'
await db.exec(`insert into transaction_bond_application_submissions(id,transaction_id,bond_application_id,status,signed_at,source_application_revision,signer_manifest_json,submission_version,snapshot_hash)
values('${newSubmission}','${transaction}','${app}','submitted',now(),3,'[{}]',2,'new-hash');update bond_applications set active_submission_id='${newSubmission}';`)
assert.equal((await assess()).status,'blocked')
await db.query(`select bridge_bond_handoff_correction($1,'resolve',null,$2)`,[pkg,correction])
assert.equal((await assess()).status,'ready')
assert.deepEqual((await db.query(`select metadata->'submittedVersion' version from bond_application_external_submission_records where external_reference='REF-42'`)).rows[0].version,version)
const handoff=(await db.query(`select bridge_bond_handoff_view($1) result`,[pkg])).rows[0].result
assert.equal(handoff.corrections[0].status,'resolved')
await db.exec(`select set_config('test.user','00000000-0000-0000-0000-000000000099',false);`)
await assert.rejects(db.query(`select bridge_bond_handoff_view($1)`,[pkg]),/not assigned/)
await assert.rejects(review('accept',doc),/not assigned/)
await assert.rejects(db.query(`select bridge_bond_handoff_correction($1,'request','Wrong user')`,[pkg]),/not assigned/)

await db.exec(`select set_config('test.user','${user}',false);
alter table bond_applications add transaction_id uuid, add created_at timestamptz default now();
update bond_applications set transaction_id='${transaction}';
alter table transaction_bond_originator_document_requests add target_scope text default 'application_documents',add participant_role text;
create table client_portal_links(token text,transaction_id uuid,is_active boolean);
create function bridge_client_portal_request_token() returns text language sql as $$select current_setting('test.buyer_token',true)$$;
create function bridge_bond_application_portal_active_link() returns table(bond_application_id uuid) language sql as $$select nullif(current_setting('test.access_app',true),'')::uuid$$;
insert into client_portal_links values('valid-buyer','${transaction}',true);
update transaction_bond_originator_document_requests set status='rejected',buyer_instruction='Replacement needed',buyer_safe_feedback='All pages please',internal_note='NEVER EXPOSE INTERNAL';`)
await assert.rejects(db.query('select bridge_bond_handoff_buyer_notices()'),/Valid buyer/)
await db.exec(`select set_config('test.buyer_token','valid-buyer',false);`)
let notices=(await db.query('select bridge_bond_handoff_buyer_notices() result')).rows[0].result
assert.equal(notices.documents[0].feedback,'All pages please')
assert.ok(!JSON.stringify(notices).includes('NEVER EXPOSE INTERNAL'))
await db.exec(`update transaction_bond_originator_document_requests set target_scope='participant_documents',participant_role='surety';`)
notices=(await db.query('select bridge_bond_handoff_buyer_notices() result')).rows[0].result
assert.equal(notices.documents.length,0)
await db.exec(`select set_config('test.buyer_token','',false);select set_config('test.access_app','${app}',false);`)
assert.equal((await db.query('select bridge_bond_handoff_buyer_notices() result')).rows[0].result.documents.length,0)

await assert.rejects(db.query(`select bridge_record_bond_handoff_submission($1,$2,ARRAY['Test Bank'],now())`,[pkg,submission]),/signed application changed/)
await assert.rejects(db.query(`select bridge_record_bond_handoff_submission($1,$2,ARRAY['Test Bank'],now()+interval '1 day')`,[pkg,newSubmission]),/cannot be in the future/)
// Close the privacy fixture request before recording the new version.
await db.exec(`update transaction_bond_originator_document_requests set status='withdrawn';`)
const secondRecord=(await db.query(`select bridge_record_bond_handoff_submission($1,$2,ARRAY['Second Bank'],now(),'REF-43') result`,[pkg,newSubmission])).rows[0].result
assert.equal(secondRecord.submissionId,newSubmission)

// Exercise the actual transaction-document continuity trigger, including an accepted file being replaced.
await db.exec(`
alter table bond_application_document_requirements add id uuid default gen_random_uuid(), add participant_id uuid, add transaction_required_document_id uuid, add requirement_key text, add canonical_document_type text, add linked_document_id uuid, add linked_at timestamptz, add linked_by uuid, add continuity_version text, add updated_at timestamptz;
alter table transaction_bond_originator_document_requests add participant_id uuid, add transaction_required_document_id uuid, add requirement_key text, add canonical_document_type text, add uploaded_at timestamptz, add submitted_for_review_at timestamptz;
create table transaction_required_documents(id uuid,transaction_id uuid,document_key text,is_uploaded boolean,uploaded_document_id uuid,status text);
create table bond_application_document_continuity_events(bond_application_id uuid,transaction_id uuid,bond_application_document_requirement_id uuid,transaction_required_document_id uuid,document_id uuid,event_type text,metadata jsonb);
create trigger continuity after insert or update on transaction_required_documents for each row execute function bridge_sync_bond_application_document_continuity_phase6();
update bond_application_document_requirements set transaction_required_document_id='${request}', requirement_key='primary-bank',canonical_document_type='bank_statements',linked_document_id='${doc}';
update transaction_bond_originator_document_requests set status='accepted',target_scope='application_documents',transaction_required_document_id='${request}',requirement_key='primary-bank',canonical_document_type='bank_statements',linked_document_id='${doc}';
insert into transaction_bond_originator_document_requests(export_package_id,transaction_id,bond_application_id,status,canonical_document_type,participant_id) values('${pkg}','${transaction}','${app}','sent','bank_statements','00000000-0000-0000-0000-000000000055');
insert into transaction_required_documents values('${request}','${transaction}','primary-bank',true,'${replacement}','uploaded');
`)
assert.equal((await db.query(`select status from transaction_bond_originator_document_requests where id='${request}'`)).rows[0].status,'awaiting_review')
assert.equal((await db.query(`select status from transaction_bond_originator_document_requests where participant_id is not null`)).rows[0].status,'sent')
for (const signature of ['bridge_bond_handoff_view(uuid)','bridge_bond_handoff_correction(uuid,text,text,uuid)','bridge_review_bond_handoff_document(uuid,uuid,text,text)','bridge_record_bond_handoff_submission(uuid,uuid,text[],timestamp with time zone,text,text)']) {
  assert.equal((await db.query(`select has_function_privilege('anon',$1,'EXECUTE') allowed`,[signature])).rows[0].allowed,false)
  assert.equal((await db.query(`select has_function_privilege('authenticated',$1,'EXECUTE') allowed`,[signature])).rows[0].allowed,true)
}
await db.close()
console.log('Bond handoff SQL: stale file rollback, review history, replacement review, withdrawal, immutable submitted version, correction re-signing and assignment isolation passed')
