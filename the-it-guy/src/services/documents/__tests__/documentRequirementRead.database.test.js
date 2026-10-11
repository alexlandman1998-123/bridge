import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
after(() => db.close())
const sql = name => readFile(new URL(`../../../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const actor = randomUUID(), stranger = randomUUID(), org = randomUUID(), transaction = randomUUID(), lead = randomUUID(), listing = randomUUID()
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth; create schema storage; create schema document_security;
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.role() returns text language sql as $$select current_setting('request.jwt.claim.role',true)$$;
create table profiles(id uuid primary key,role text);
create table transactions(id uuid primary key,organisation_id uuid,originating_buyer_lead_id uuid,private_listing_id uuid);
create table private_listings(id uuid primary key,organisation_id uuid,seller_lead_id text,originating_crm_lead_id text);
create table leads(lead_id uuid primary key,organisation_id uuid,lead_category text);
create table onboarding_form_data(transaction_id uuid,form_data jsonb);
create table transaction_attorney_assignments(transaction_id uuid,attorney_firm_id uuid,firm_id uuid,assignment_status text,status text);
create table attorney_firm_members(firm_id uuid,user_id uuid,status text,professional_role text,role text);
create function bridge_has_transaction_permission(uuid,text) returns boolean language sql as $$select $1='${transaction}'::uuid and auth.uid()='${actor}'::uuid and coalesce(current_setting('test.access',true),'allowed')<>'denied'$$;
create function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select false$$;
create function bridge_can_mutate_attorney_lane(uuid,text,text) returns boolean language sql as $$select auth.uid()='${actor}'::uuid and current_setting('test.attorney',true)='allowed'$$;
create function bridge_can_access_private_listing(uuid) returns boolean language sql as $$select auth.uid()='${actor}'::uuid$$;
create function bridge_can_access_assignment(uuid,uuid,uuid) returns boolean language sql as $$select auth.uid()='${actor}'::uuid$$;
create table documents(id uuid primary key,transaction_id uuid not null,name text not null,file_path text unique not null,file_bucket text,category text,document_type text,canonical_requirement_instance_id uuid,uploaded_by_user_id uuid,visibility_scope text,is_client_visible boolean,client_recipient_role text,source text);
create function document_security.can_read(documents) returns boolean language sql as $$select ($1).uploaded_by_user_id=auth.uid()$$;
create table storage.buckets(id text primary key,public boolean);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb,user_metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage,auth to anon,authenticated;
grant all on storage.objects to authenticated;
create policy legacy_owner_all on storage.objects for all to authenticated using(owner_id=auth.uid()::text) with check(owner_id=auth.uid()::text);
`)
await db.exec((await sql('202605250001_canonical_document_system_phase1')).replace('create extension if not exists "pgcrypto";', ''))
await db.exec(await sql('202605250005_canonical_document_lifecycle_phase6'))
await db.exec(await sql('202605250007_canonical_document_reminders_phase8'))
await db.exec(`
create table document_requests(id uuid primary key default gen_random_uuid(),transaction_id uuid not null,canonical_requirement_instance_id uuid references document_requirement_instances(id),status text not null default 'requested',requested_document_id uuid references documents(id),updated_at timestamptz default now(),requested_from text,assigned_to_role text,requires_review boolean default true,completed_at timestamptz,rejected_reason text);
create table transaction_required_documents(canonical_requirement_instance_id uuid,is_uploaded boolean,uploaded_document_id uuid,status text,uploaded_at timestamptz,updated_at timestamptz);
`)
// Use the real linked-request lifecycle triggers; the remainder patches unrelated legacy RPCs.
await db.exec((await sql('20260927091054_unify_transaction_document_actions_phase4')).split('-- Guard existing browser RPCs:')[0] + '\ncommit;')
await db.exec(await sql('20261011112703_flexible_document_requirement_identity'))
await db.exec(await sql('20261011114048_flexible_document_requirement_commands'))
await db.query('insert into profiles values ($1,$2),($3,$2)', [actor, 'agent', stranger])
await db.query('insert into leads values ($1,$2,$3)', [lead, org, 'buyer'])
await db.query('insert into private_listings values ($1,$2,null,null)', [listing, org])
await db.query('insert into transactions values ($1,$2,$3,$4)', [transaction, org, lead, listing])
await db.exec("insert into storage.buckets values ('documents',false)")
await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [actor])
async function command({ id = randomUUID(), action = 'add', type = 'transaction', context = transaction, requirement = null, revision = null, payload = { party: 'buyer', label: 'Additional SARS correspondence' } } = {}) {
  await db.exec('set role authenticated')
  try {
    return (await db.query('select bridge_document_requirement_command($1,$2,$3,$4,$5,$6,$7) result', [id, action, type, context, requirement, revision, payload])).rows[0].result
  } finally { await db.exec('reset role') }
}
const row = async id => (await db.query('select * from document_requirement_instances where id=$1', [id])).rows[0]
const change = (r, action, payload = { reason: 'Not applicable to this matter' }, extra = {}) => command({ action, requirement: r.id, revision: r.command_revision, payload, ...extra })
async function upload(r, extra = {}) {
  const id = extra.id || randomUUID(), fileName = 'evidence.pdf'
  const payload = { fileName, filePath: `document-requirements/${r.id}/${actor}/${id}/${fileName}`, mimeType: 'application/pdf', sizeBytes: 5, sha256: 'a'.repeat(64), replacesUploadId: r.latest_upload_id, ...extra.payload }
  await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata,user_metadata) values ($1,$2,$3,$4,$5)', ['documents', payload.filePath, extra.owner || actor, { size: payload.sizeBytes, mimetype: payload.mimeType }, { sha256: payload.sha256 }])
  const args = { id, action: 'upload', type: r.context_type, context: r.context_id, requirement: r.id, revision: r.command_revision, payload }
  return { args, result: await command(args) }
}


await db.exec(`
alter table documents add column file_name text, add column status text, add column review_status text, add column uploaded_at timestamptz, add column created_at timestamptz default now();
alter table transactions add column buyer_id uuid, add column development_id uuid, add column unit_id uuid;
alter table transaction_attorney_assignments add column assigned_user_id uuid, add column attorney_user_id uuid, add column primary_attorney_id uuid, add column secretary_id uuid, add column admin_handler_id uuid;
create table client_portal_links(transaction_id uuid,token text,is_active boolean,buyer_id uuid,development_id uuid,unit_id uuid,updated_at timestamptz,created_at timestamptz);
create function bridge_client_portal_request_token() returns text language sql as $$select current_setting('test.portal_token',true)$$;
create schema journey_private;
create function journey_private.can_read_professional_journey(uuid) returns boolean language sql as $$select public.bridge_has_transaction_permission($1,'edit_core_transaction')$$;
create function journey_private.conversation_actor(uuid,text,text) returns jsonb language plpgsql as $$begin raise exception 'Invalid seller session' using errcode='42501'; end;$$;
create function bridge_attorney_matter_team_access(uuid,uuid,text) returns boolean language sql as $$select false$$;
create function bridge_transaction_scope_is_internal_user() returns boolean language sql as $$select false$$;
`)
await db.exec(await sql('20260905091122_document_trust_phase3_role_scoped_projections'))
await db.exec(await sql('20260927092559_transaction_document_role_projections_phase5'))
await db.exec(await sql('20261011115118_flexible_document_requirement_read_model'))
async function snapshot(type = 'transaction', context = transaction) {
  await db.exec('set role authenticated')
  try { return (await db.query('select bridge_document_requirement_context($1,$2) result', [type, context])).rows[0].result }
  finally { await db.exec('reset role') }
}

test('custom requirements, removal and restoration read identically from original lead and transaction after handover', async () => {
  let r = (await command({ type: 'buyer_lead', context: lead })).requirement
  r = (await upload(r)).result.requirement
  const before = await snapshot('buyer_lead', lead)
  assert.equal(before.documents.find(d => d.id === r.latest_upload_id).is_current_evidence, true)
  assert((await snapshot()).requirements.some(q => q.id === r.id))
  await db.query('select bridge_handoff_manual_document_requirements($1)', [transaction])
  r = await row(r.id)
  const leadSnapshot = await snapshot('buyer_lead', lead), matterSnapshot = await snapshot()
  assert.deepEqual(leadSnapshot.requirements.find(q => q.id === r.id), matterSnapshot.requirements.find(q => q.id === r.id))
  assert.equal(leadSnapshot.documents.find(d => d.id === r.latest_upload_id).file_path, before.documents[0].file_path)
  const removed = (await change(r, 'remove')).requirement
  assert.equal((await snapshot('buyer_lead', lead)).requirements.find(q => q.id === r.id).applicability_override, 'removed')
  assert((await snapshot()).documents.some(d => d.id === r.latest_upload_id))
  await change(removed, 'restore', { reason: 'Needed again' })
  assert.equal((await snapshot('buyer_lead', lead)).requirements.find(q => q.id === r.id).status, 'under_review')
})

test('read model distinguishes latest upload from retained versions and filters unreadable files', async () => {
  let r = (await command()).requirement
  const first = await upload(r)
  r = first.result.requirement
  const second = await upload(r)
  const data = await snapshot()
  assert.equal(data.documents.find(d => d.id === first.result.uploadId).is_current_evidence, false)
  assert.equal(data.documents.find(d => d.id === second.result.uploadId).is_current_evidence, true)
  await db.query('update documents set uploaded_by_user_id=$2 where id=$1', [second.result.uploadId, stranger])
  assert(!(await snapshot()).documents.some(d => d.id === second.result.uploadId))
})

test('seller lead and listing share only explicit same-organisation links, including after handover', async () => {
  const sellerLead = randomUUID()
  await db.query("insert into leads values ($1,$2,'seller')", [sellerLead, org])
  await db.query('update private_listings set seller_lead_id=$2 where id=$1', [listing, sellerLead])
  const r = (await command({ type: 'seller_lead', context: sellerLead, payload: { party: 'seller', label: 'SARS letters' } })).requirement
  assert((await snapshot('private_listing', listing)).requirements.some(q => q.id === r.id))
  await db.query('select bridge_handoff_manual_document_requirements($1)', [transaction])
  assert((await snapshot('private_listing', listing)).requirements.some(q => q.id === r.id))
  const otherListing = randomUUID()
  await db.query('insert into private_listings values ($1,$2,$3,null)', [otherListing, randomUUID(), sellerLead])
  assert(!(await snapshot('private_listing', otherListing)).requirements.some(q => q.id === r.id))
})

test('source access cannot bypass revoked matter authority; anonymous and foreign users are denied', async () => {
  await db.exec("select set_config('test.access','denied',false)")
  await assert.rejects(snapshot('buyer_lead', lead), /linked transaction/)
  await db.exec("select set_config('test.access','allowed',false)")
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [stranger])
  await assert.rejects(snapshot(), /Not authorised/)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
  await db.exec('set role anon')
  try { await assert.rejects(db.query("select bridge_document_requirement_context('transaction',$1)", [transaction]), /permission denied/) }
  finally { await db.exec('reset role') }
})

test('real professional and buyer portal projections include custom labels and exclude removed rows', async () => {
  const custom = (await command({ payload: { party: 'buyer', label: 'Additional divorce order' } })).requirement
  const removed = (await command({ payload: { party: 'buyer', label: 'Not needed' } })).requirement
  await change(removed, 'remove')
  const professional = (await db.query('select bridge_transaction_document_projection($1) result', [transaction])).rows[0].result
  assert.equal(professional.requirements.find(q => q.id === custom.id).document_definitions.display_label, custom.custom_label)
  assert(!professional.requirements.some(q => q.id === removed.id))
  const buyer = randomUUID()
  await db.query('update transactions set buyer_id=$2 where id=$1', [transaction, buyer])
  await db.query("insert into client_portal_links values ($1,'valid-token',true,$2,null,null,now(),now())", [transaction, buyer])
  await db.exec("select set_config('test.portal_token','valid-token',false); set role anon")
  try {
    const portal = (await db.query('select bridge_client_portal_canonical_document_projection() result')).rows[0].result
    assert.equal(portal.requirements.find(q => q.id === custom.id).custom_label, custom.custom_label)
    assert(!portal.requirements.some(q => q.id === removed.id))
    assert(portal.requirements.every(q => q.requested_from_role === 'buyer'))
  } finally { await db.exec('reset role') }
  await db.exec("select set_config('test.portal_token','invalid-token',false)")
  await assert.rejects(db.query('select bridge_client_portal_canonical_document_projection()'), /invalid or inactive/)
  await db.exec("select set_config('test.portal_token','',false)")
})

test('requirement audiences also protect metadata, including for read-only professional accounts', async () => {
  const r = (await command({ payload: { party: 'seller', label: 'Legal team evidence' } })).requirement
  await db.query("update document_requirement_instances set visible_to_roles=array['transferring_attorney'] where id=$1", [r.id])
  assert(!(await snapshot()).requirements.some(q => q.id === r.id))
  await db.exec(`create or replace function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select $1='${transaction}'::uuid and auth.uid()='${actor}'::uuid$$;`)
  await db.query("update profiles set role='conveyancing_secretary' where id=$1", [actor])
  try { assert((await snapshot()).requirements.some(q => q.id === r.id)) }
  finally {
    await db.query("update profiles set role='agent' where id=$1", [actor])
    await db.exec('create or replace function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$select false$$')
  }
})

test('a second transaction linked to the same lead/listing does not inherit the first matter decisions', async () => {
  const other = randomUUID()
  await db.query('insert into transactions(id,organisation_id,originating_buyer_lead_id,private_listing_id) values ($1,$2,$3,$4)', [other, org, lead, listing])
  await db.exec(`create or replace function bridge_has_transaction_permission(uuid,text) returns boolean language sql as $$select $1 in ('${transaction}'::uuid,'${other}'::uuid) and auth.uid()='${actor}'::uuid$$;`)
  try {
    const data = await snapshot('transaction', other)
    assert(!data.requirements.some(q => q.transaction_id === transaction))
    assert.equal(data.documents.length, 0)
  } finally {
    await db.exec(`create or replace function bridge_has_transaction_permission(uuid,text) returns boolean language sql as $$select $1='${transaction}'::uuid and auth.uid()='${actor}'::uuid and coalesce(current_setting('test.access',true),'allowed')<>'denied'$$;`)
  }
})
