import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
await db.exec(`
  create role anon; create role authenticated;
  create schema handoff_private;
  create table transactions(id uuid primary key,onboarding_status text,next_action text,updated_at timestamptz,stage text);
  create table documents(id uuid primary key,transaction_id uuid,document_type text,category text,status text);
  create table document_requirement_instances(id uuid primary key,transaction_id uuid,context_type text,context_id uuid,document_definition_key text,status text,satisfied_by_document_id uuid);
`)
const helper = readFileSync(new URL('../../supabase/migrations/20261101070855_repair_transaction_handoff_billing_closeout.sql', import.meta.url), 'utf8')
await db.exec(helper.slice(helper.indexOf('create or replace function public.bridge_transaction_fee_has_current_otp'), helper.indexOf('revoke all on function public.bridge_transaction_fee_has_current_otp')))
const migration = readFileSync(new URL('../../supabase/migrations/20261101143914_complete_existing_uploaded_otp_continuation.sql', import.meta.url), 'utf8')
await db.exec(migration.slice(migration.indexOf('create or replace function handoff_private.release_reviewed_uploaded_otp'), migration.lastIndexOf('commit;')))
const tx = '10000000-0000-4000-8000-000000000001', other = '10000000-0000-4000-8000-000000000002'
const requirement = '20000000-0000-4000-8000-000000000001', document = '30000000-0000-4000-8000-000000000001'
const idRequirement = '20000000-0000-4000-8000-000000000002', idDocument = '30000000-0000-4000-8000-000000000002'
await db.query("insert into transactions values ($1,'signed_otp_uploaded_for_review','Review',now(),'OTP Signed'),($2,'signed_otp_uploaded_for_review','Other',now(),'OTP Signed')", [tx, other])
await db.query("insert into documents values ($1,$2,'signed_otp','General','uploaded'),($3,$2,'buyer_id_document','General','uploaded')", [document, tx, idDocument])
await db.query("insert into document_requirement_instances values ($1,$2,'transaction',$2,'signed_otp','under_review',$3),($4,$2,'transaction',$2,'buyer_id_document','under_review',$5)", [requirement,tx,document,idRequirement,idDocument])
const status = async () => (await db.query('select * from transactions where id=$1',[tx])).rows[0]
await db.query("update document_requirement_instances set status='approved' where id=$1", [idRequirement])
assert.equal((await status()).onboarding_status,'signed_otp_uploaded_for_review','An ID review must not release the OTP')
await db.query("update document_requirement_instances set status='rejected' where id=$1", [requirement])
assert.equal((await status()).onboarding_status,'signed_otp_uploaded_for_review','Rejection must not release the OTP')
await db.query("update document_requirement_instances set satisfied_by_document_id=$2,status='approved' where id=$1", [requirement,idDocument])
assert.equal((await status()).onboarding_status,'signed_otp_uploaded_for_review','An ID cannot stand in for signed OTP evidence')
await db.query("update documents set status='rejected' where id=$1", [document])
await db.query("update document_requirement_instances set satisfied_by_document_id=$2,status='approved' where id=$1", [requirement,document])
assert.equal((await status()).onboarding_status,'signed_otp_received','Approval of the saved OTP must release its review state')
assert.equal((await status()).stage,'OTP Signed','Document review must not complete the transaction')
assert.equal((await db.query('select onboarding_status from transactions where id=$1',[other])).rows[0].onboarding_status,'signed_otp_uploaded_for_review','Other matters must be unchanged')
await db.query("update transactions set onboarding_status='completed',next_action='Keep later work' where id=$1", [tx])
await db.query("update document_requirement_instances set status='approved' where id=$1", [requirement])
assert.equal((await status()).onboarding_status,'completed','A repeated review must not rewind a later lifecycle state')
assert.equal((await status()).next_action,'Keep later work')
assert.equal((await db.query('select count(*)::int n from documents')).rows[0].n,2,'No upload must be created')
await db.close()
console.log('Uploaded OTP continuation: review authority, evidence identity, release, isolation and later-state preservation passed')
