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
await db.exec(`create table development_documents(id uuid primary key default gen_random_uuid(),development_id uuid not null,
  title text not null,version integer not null default 1,approval_status text not null default 'approved',
  archived_at timestamptz,supersedes_document_id uuid references development_documents(id));
  alter table development_documents enable row level security;
  create policy development_scope on development_documents to authenticated
    using(development_id='${org}'::uuid) with check(development_id='${org}'::uuid);
  grant select,insert,update on development_documents to authenticated;`)
await db.exec(`create table document_requirement_private.delivery_jobs(requirement_id uuid,status text,last_error text,provider_message_id text);`)
// Apply the production delivery wrapper verbatim: patch its base projection,
// while retaining delivery status and the existing invoker/security boundary.
const delivery = await sql('20261011121724_flexible_document_request_delivery')
await db.exec(delivery.slice(delivery.indexOf('alter function document_requirement_private.read_context(text,uuid) rename'), delivery.indexOf("notify pgrst,'reload schema'")))
await db.exec('alter table transactions add column registration_confirmation_document_id uuid,add column registered_at timestamptz')
await db.exec(`create table private_listing_document_requirements(id uuid primary key default gen_random_uuid(),canonical_requirement_instance_id uuid,
  status text default 'required',assurance_state text,satisfied_by_document_id uuid,satisfaction_verified_at timestamptz,satisfaction_method text,assurance_metadata jsonb);
create table private_listing_documents(id uuid primary key default gen_random_uuid(),requirement_id uuid,canonical_requirement_instance_id uuid,
  promoted_document_id uuid,storage_path text,status text default 'uploaded',uploaded_at timestamptz default now(),created_at timestamptz default now(),updated_at timestamptz default now());`)
const assurance = await sql('20261004121736_seller_document_review_runtime_reconciliation')
await db.exec(assurance.slice(assurance.indexOf('create or replace function public.bridge_sync_private_listing_requirement_assurance_p0_4()'),
  assurance.indexOf('create or replace function public.bridge_prevent_false_requirement_completion_p0_4()')))

await db.exec(await sql('20261109085345_document_evidence_withdrawal_and_replacement'))
await db.exec(await sql('20261109085345_document_evidence_withdrawal_and_replacement'))

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

test('withdrawal is persistent and replayable across lead and transaction; bytes and reviews stay history', async () => {
  let r = (await command()).requirement
  r = (await upload(r)).result.requirement
  await db.query("insert into document_requirement_context_links(requirement_instance_id,context_type,context_id) values ($1,'buyer_lead',$2) on conflict do nothing", [r.id,lead])
  r = await row(r.id)
  const oldId = r.satisfied_by_document_id
  await db.query("update document_requirement_instances set status='approved' where id=$1", [r.id])
  await db.query("insert into document_requirement_reviews(requirement_instance_id,document_id,review_status) values ($1,$2,'approved')", [r.id,oldId])
  await db.query('insert into transaction_required_documents(canonical_requirement_instance_id,is_uploaded,uploaded_document_id,status) values ($1,true,$2,$3)', [r.id,oldId,'approved'])
  r = await row(r.id)
  const args = { id: randomUUID(), action: 'withdraw', requirement: r.id, revision: r.command_revision, payload: { reason: 'Wrong client file', documentId: oldId } }
  const removed = await command(args)
  assert.deepEqual(await command(args), removed)
  assert.equal(removed.requirement.satisfied_by_document_id, null)
  assert.equal(removed.requirement.latest_upload_id, null)
  assert.equal(removed.requirement.status, 'pending')
  for (const [type,id] of [['buyer_lead',lead],['transaction',transaction]]) {
    const data = await snapshot(type,id)
    const current = data.requirements.find(q => q.id===r.id)
    assert.equal(current.satisfied_by_document_id, null)
    assert.equal(data.documents.find(d => d.id===oldId).is_current_evidence, false)
  }
  assert.equal((await db.query('select is_current_evidence from documents where id=$1',[oldId])).rows[0].is_current_evidence,false)
  assert.equal((await db.query('select is_uploaded,uploaded_document_id from transaction_required_documents where canonical_requirement_instance_id=$1',[r.id])).rows[0].uploaded_document_id,null)
  assert.equal((await db.query('select count(*) from document_requirement_reviews where document_id=$1',[oldId])).rows[0].count,1)
  assert.equal((await db.query('select count(*) from storage.objects where name=(select file_path from documents where id=$1)',[oldId])).rows[0].count,1)
  const replacement = (await upload(await row(r.id))).result.requirement
  assert.equal(replacement.status,'under_review')
  assert.notEqual(replacement.satisfied_by_document_id,oldId)
  assert.equal((await snapshot()).documents.find(d => d.id===oldId).is_current_evidence,false)
})

test('withdrawal rejects stale revisions, wrong files and lost access without changing the current file', async () => {
  const r = (await upload((await command()).requirement)).result.requirement
  await assert.rejects(change(r,'withdraw',{ reason:'Incorrect file',documentId:randomUUID() }),/current file changed/)
  await assert.rejects(command({ action:'withdraw',requirement:r.id,revision:r.command_revision-1,payload:{reason:'Incorrect file',documentId:r.satisfied_by_document_id} }),/changed/)
  await db.query("select set_config('test.access','denied',false)")
  try { await assert.rejects(change(r,'withdraw',{ reason:'Incorrect file',documentId:r.satisfied_by_document_id }),/Not authorised/) }
  finally { await db.query("select set_config('test.access','allowed',false)") }
  assert.equal((await row(r.id)).satisfied_by_document_id,r.satisfied_by_document_id)
})

test('replacement archives the previous current file without carrying approval to new bytes', async () => {
  let r = (await upload((await command()).requirement)).result.requirement
  const oldId=r.satisfied_by_document_id
  await db.query("update document_requirement_instances set status='approved' where id=$1",[r.id])
  r=(await upload(await row(r.id))).result.requirement
  const rows=(await db.query('select id,is_current_evidence from documents where id=any($1)',[[oldId,r.satisfied_by_document_id]])).rows
  assert.equal(rows.find(d=>d.id===oldId).is_current_evidence,false)
  assert.equal(rows.find(d=>d.id===r.satisfied_by_document_id).is_current_evidence,true)
  assert.equal(r.status,'under_review')
})

test('development replacements archive atomically, preserve history and reject stale or cross-development replacements', async () => {
  const old=randomUUID(),next=randomUUID()
  await db.query("insert into development_documents(id,development_id,title) values ($1,$2,'Old approved document')",[old,org])
  await db.exec('set role authenticated')
  try {
    await assert.rejects(db.query('insert into development_documents(development_id,title,supersedes_document_id) values ($1,null,$2)',[org,old]),/null value/)
    assert.equal((await db.query('select archived_at from development_documents where id=$1',[old])).rows[0].archived_at,null)
    await db.query("insert into development_documents(id,development_id,title,supersedes_document_id) values ($1,$2,'New file',$3)",[next,org,old])
    const versions=(await db.query('select * from development_documents where id=any($1)',[[old,next]])).rows
    assert(versions.find(d=>d.id===old).archived_at)
    assert.equal(versions.find(d=>d.id===next).version,2)
    assert.equal(versions.find(d=>d.id===next).approval_status,'pending_approval')
    await assert.rejects(db.query("insert into development_documents(development_id,title,supersedes_document_id) values ($1,'Stale',$2)",[org,old]),/changed or access/)
    await assert.rejects(db.query("insert into development_documents(development_id,title,supersedes_document_id) values ($1,'Foreign',$2)",[randomUUID(),next]),/changed or access/)
  } finally { await db.exec('reset role') }
})

test('a selected registration proof cannot be withdrawn until its authoritative reference is replaced', async () => {
  const r=(await upload((await command()).requirement)).result.requirement
  await db.query('update transactions set registration_confirmation_document_id=$1,registered_at=now() where id=$2',[r.satisfied_by_document_id,transaction])
  try {
    await assert.rejects(change(r,'withdraw',{reason:'Correction',documentId:r.satisfied_by_document_id}),/Replace the transaction registration proof/)
    assert.equal((await row(r.id)).satisfied_by_document_id,r.satisfied_by_document_id)
    const replacement=(await upload(await row(r.id))).result.requirement
    assert.notEqual(replacement.satisfied_by_document_id,r.satisfied_by_document_id)
    assert.equal((await db.query('select is_current_evidence from documents where id=$1',[r.satisfied_by_document_id])).rows[0].is_current_evidence,true)
  } finally { await db.query('update transactions set registration_confirmation_document_id=null,registered_at=null where id=$1',[transaction]) }
})

test('withdrawal clears the seller listing mirror and its legacy assurance trigger cannot resurrect retained bytes', async () => {
  let r=(await upload((await command({payload:{party:'seller',label:'Seller supporting evidence'}})).requirement)).result.requirement
  const mirror=randomUUID(),source=randomUUID(),file=r.satisfied_by_document_id
  await db.query('insert into private_listing_document_requirements(id,canonical_requirement_instance_id) values ($1,$2)',[mirror,r.id])
  await db.query("insert into private_listing_documents(id,requirement_id,canonical_requirement_instance_id,promoted_document_id,status) values ($1,$2,$3,$4,'approved')",[source,mirror,r.id,file])
  assert.equal((await db.query('select status from private_listing_document_requirements where id=$1',[mirror])).rows[0].status,'approved')
  r=await row(r.id)
  await change(r,'withdraw',{reason:'Incorrect seller evidence',documentId:file})
  const retained=(await db.query('select * from private_listing_documents where id=$1',[source])).rows[0]
  assert.equal(retained.is_current_evidence,false)
  assert.equal(retained.status,'approved','historic review is unchanged')
  await db.query('update private_listing_documents set status=status where id=$1',[source])
  const checklist=(await db.query('select * from private_listing_document_requirements where id=$1',[mirror])).rows[0]
  assert.equal(checklist.status,'required')
  assert.equal(checklist.satisfied_by_document_id,null)
  assert.equal(checklist.assurance_state,'missing')
})

test('unchanged current-file identity does not rewrite document rows or fan out background refreshes', async () => {
  const r=(await upload((await command()).requirement)).result.requirement
  await db.exec(`create table test_document_update_counter(id uuid);
    create function count_document_update() returns trigger language plpgsql as $$begin insert into test_document_update_counter values(new.id);return new;end;$$;
    create trigger count_document_update after update on documents for each row execute function count_document_update();`)
  await db.query('update document_requirement_instances set status=status where id=$1',[r.id])
  assert.equal((await db.query('select count(*) from test_document_update_counter')).rows[0].count,0)
})
