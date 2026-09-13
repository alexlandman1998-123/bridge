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
await db.close()
console.log('Bond submission SQL readiness: signatures, revision changes, fresh document checks, successful recording and assignment isolation passed')
