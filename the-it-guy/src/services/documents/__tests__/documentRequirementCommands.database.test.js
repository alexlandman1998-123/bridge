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

test('add is scoped, audited, refreshable and replayed exactly once; no global definition is created', async () => {
  const before = (await db.query('select count(*) from document_definitions')).rows[0].count
  const args = { id: randomUUID() }
  const first = await command(args), second = await command(args)
  assert.deepEqual(second, first)
  assert.equal(first.requirement.custom_label, 'Additional SARS correspondence')
  assert.equal(first.requirement.requirement_origin, 'manual')
  assert.equal(first.refreshContexts[0].contextId, transaction)
  assert.equal((await db.query('select count(*) from document_requirement_events where requirement_instance_id=$1', [first.requirement.id])).rows[0].count, 1)
  assert.equal((await db.query('select count(*) from document_definitions')).rows[0].count, before)
  await assert.rejects(command({ ...args, payload: { party: 'buyer', label: 'Different' } }), /already used/)
  const sameName = await command()
  assert.notEqual(sameName.requirement.id, first.requirement.id)
})

test('rejects foreign context, actor spoofing, unknown subject and mismatched party', async () => {
  await assert.rejects(command({ context: randomUUID() }), /Not authorised/)
  await assert.rejects(command({ payload: { party: 'buyer', label: 'Papers', actorId: stranger } }), /Unsupported/)
  await assert.rejects(command({ payload: { party: 'buyer', label: 'Papers', subjectKind: 'person', subjectId: randomUUID() } }), /does not belong/)
  await assert.rejects(command({ type: 'buyer_lead', context: lead, payload: { party: 'seller', label: 'Papers' } }), /party belonging/)
  const person = randomUUID()
  await db.query('insert into onboarding_form_data values ($1,$2)', [transaction, { __bridge_transaction_parties: { buyer: { people: [{ id: person }] } } }])
  const saved = await command({ payload: { party: 'buyer', label: 'Divorce papers', subjectKind: 'person', subjectId: person } })
  assert.equal(saved.requirement.requested_from_contact_id, person)
})

test('remove and restore preserve evidence/reviews and cancel active requests/grouped reminders without re-sending', async () => {
  let r = (await command()).requirement
  const request = (await db.query("insert into document_requests(transaction_id,canonical_requirement_instance_id,requested_from) values ($1,$2,'buyer') returning id", [transaction, r.id])).rows[0].id
  r = (await upload(await row(r.id))).result.requirement
  const evidence = r.satisfied_by_document_id
  await db.query("update document_requirement_instances set status='approved' where id=$1", [r.id])
  await db.query("insert into document_requirement_reviews(requirement_instance_id,document_id,review_status) values ($1,$2,'approved')", [r.id, evidence])
  const reminder = (await db.query("insert into document_requirement_reminders(context_type,context_id,reminder_type,status) values ('transaction',$1,'missing_required_documents','scheduled') returning id", [transaction])).rows[0].id
  await db.query('insert into document_requirement_reminder_items(reminder_id,requirement_instance_id) values ($1,$2)', [reminder, r.id])
  // Completed requests remain historical; an active request is cancelled.
  await db.query("update document_requirement_instances set status='requested' where id=$1", [r.id])
  r = await row(r.id)
  await assert.rejects(change(r, 'remove', { reason: ' ' }), /reason/)
  const removed = (await change(r, 'remove')).requirement
  assert.equal(removed.status, 'not_applicable')
  assert.equal(removed.satisfied_by_document_id, evidence)
  assert.equal((await db.query('select status from document_requests where id=$1', [request])).rows[0].status, 'cancelled')
  assert.equal((await db.query('select status from document_requirement_reminders where id=$1', [reminder])).rows[0].status, 'cancelled')
  await assert.rejects(change(r, 'restore'), /changed/)
  const restored = (await change(removed, 'restore', { reason: 'Required after legal review' })).requirement
  assert.equal(restored.status, 'requested')
  assert.equal(restored.satisfied_by_document_id, evidence)
  assert.equal((await db.query('select count(*) from document_requirement_reviews where requirement_instance_id=$1', [r.id])).rows[0].count, 1)
  assert.equal((await db.query('select status from document_requests where id=$1', [request])).rows[0].status, 'cancelled')
})

test('uploads link request and evidence atomically; replacement reopens review and preserves previous bytes', async () => {
  let r = (await command()).requirement
  await db.query("insert into document_requests(transaction_id,canonical_requirement_instance_id,requested_from,requires_review) values ($1,$2,'buyer',false)", [transaction, r.id])
  const first = await upload(await row(r.id))
  assert.deepEqual(await command(first.args), first.result)
  r = first.result.requirement
  assert.equal(r.status, 'under_review')
  assert.equal(r.latest_upload_id, r.satisfied_by_document_id)
  await db.query("update document_requirement_instances set status='approved' where id=$1", [r.id])
  const second = await upload(await row(r.id))
  assert.equal(second.result.requirement.status, 'under_review')
  assert.notEqual(second.result.requirement.latest_upload_id, r.latest_upload_id)
  assert.equal((await db.query('select count(*) from documents where canonical_requirement_instance_id=$1', [r.id])).rows[0].count, 2)
  const requests = (await db.query('select * from document_requests where canonical_requirement_instance_id=$1', [r.id])).rows
  assert.equal(requests[0].status, 'uploaded')
  assert.equal(requests[0].requested_document_id, second.result.uploadId)
  await assert.rejects(upload(second.result.requirement, { owner: stranger }), /could not be verified/)
})

test('storage owner policies cannot overwrite or delete a saved upload', async () => {
  const r = (await command()).requirement
  const { args } = await upload(r)
  await db.exec('set role authenticated')
  try {
    assert.equal((await db.query('select * from storage.objects where name=$1', [args.payload.filePath])).rows.length, 1)
    assert.equal((await db.query('delete from storage.objects where name=$1 returning id', [args.payload.filePath])).rows.length, 0)
    assert.equal((await db.query("update storage.objects set metadata='{}' where name=$1 returning id", [args.payload.filePath])).rows.length, 0)
    await assert.rejects(db.query('select * from document_requirement_private.uploads'), /permission denied/)
  } finally { await db.exec('reset role') }
})

test('pre-transaction upload is promoted on handover with the same file ID and both context refresh signals', async () => {
  let r = (await command({ type: 'buyer_lead', context: lead })).requirement
  const saved = await upload(r)
  r = saved.result.requirement
  assert.equal(r.satisfied_by_document_id, null)
  assert.equal((await db.query('select count(*) from documents where id=$1', [r.latest_upload_id])).rows[0].count, 0)
  await db.query('select bridge_handoff_manual_document_requirements($1)', [transaction])
  r = await row(r.id)
  assert.equal(r.satisfied_by_document_id, r.latest_upload_id)
  const doc = (await db.query('select * from documents where id=$1', [r.latest_upload_id])).rows[0]
  assert.equal(doc.file_path, saved.args.payload.filePath)
  const result = await change(r, 'remove', { reason: 'Duplicate evidence' }, { type: 'buyer_lead', context: lead })
  assert.equal(result.refreshContexts.length, 2)
  await assert.rejects(command({ type: 'buyer_lead', context: lead }), /moved to a transaction/)
})

test('removing an attorney-owned requirement requires principal authority', async () => {
  let r = (await command()).requirement
  await db.query("update document_requirement_instances set reviewer_role='transferring_attorney' where id=$1", [r.id])
  r = await row(r.id)
  await assert.rejects(change(r, 'remove'), /principal or conveyancer/)
  const firm = randomUUID()
  await db.query("insert into transaction_attorney_assignments values ($1,$2,$2,'active','active')", [transaction, firm])
  await db.query("insert into attorney_firm_members values ($1,$2,'active','conveyancing_secretary','attorney')", [firm, actor])
  await db.exec("select set_config('test.attorney','allowed',false)")
  await assert.rejects(change(r, 'remove'), /principal or conveyancer/)
  await db.query("update attorney_firm_members set professional_role='director_partner' where user_id=$1", [actor])
  assert.equal((await change(r, 'remove')).requirement.status, 'not_applicable')
  await db.exec("select set_config('test.attorney','denied',false)")
})

test('failure in audit rolls back requirement, cancellation, refresh and receipt; same command can retry', async () => {
  const r = (await command()).requirement
  await db.query("insert into document_requests(transaction_id,canonical_requirement_instance_id,requested_from) values ($1,$2,'buyer')", [transaction, r.id])
  const current = await row(r.id), id = randomUUID()
  const args = { id, action: 'remove', requirement: r.id, revision: current.command_revision, payload: { reason: 'Not needed' } }
  await db.exec(`create function test_fail_audit() returns trigger language plpgsql as $$begin if new.metadata_json ? 'commandId' then raise exception 'audit unavailable'; end if; return new; end;$$;
    create trigger test_fail before insert on document_requirement_events for each row execute function test_fail_audit();`)
  const version = (await db.query('select version from document_requirement_private.context_versions where context_id=$1', [transaction])).rows[0].version
  await assert.rejects(command(args), /audit unavailable/)
  assert.equal((await row(r.id)).applicability_override, null)
  assert.equal((await db.query('select version from document_requirement_private.context_versions where context_id=$1', [transaction])).rows[0].version, version)
  assert.equal((await db.query('select count(*) from document_requirement_private.command_receipts where command_id=$1', [id])).rows[0].count, 0)
  await db.exec('drop trigger test_fail on document_requirement_events')
  assert.equal((await command(args)).requirement.applicability_override, 'removed')
})

test('revoked permission denies receipt replay; anonymous callers cannot run commands', async () => {
  const args = { id: randomUUID() }
  await command(args)
  await db.exec("select set_config('test.access','denied',false)")
  await assert.rejects(command(args), /Not authorised/)
  await db.exec('set role authenticated')
  try { await assert.rejects(db.query('select bridge_document_requirement_command_receipt($1)', [args.id]), /access has changed/) }
  finally { await db.exec('reset role') }
  await db.exec("select set_config('test.access','allowed',false); set role anon")
  try { await assert.rejects(db.query("select bridge_document_requirement_command($1,'add','transaction',$2)", [randomUUID(), transaction]), /permission denied/) }
  finally { await db.exec('reset role') }
})

test('standard type retains catalogue and reviewer rules; removed items reject uploads', async () => {
  const standard = (await command({ payload: { party: 'seller', definitionKey: 'seller_id_document' } })).requirement
  assert.equal(standard.custom_label, null)
  assert.equal(standard.document_definition_key, 'seller_id_document')
  await assert.rejects(command({ payload: { party: 'buyer', definitionKey: 'seller_id_document' } }), /not requested from that party/)
  const custom = (await command()).requirement
  const removed = (await change(custom, 'remove')).requirement
  await assert.rejects(upload(removed), /Restore this requirement/)
})

test('upload validation rejects changed digest and stale replacement, with no partial evidence link', async () => {
  const r = (await command()).requirement
  const first = await upload(r)
  const current = first.result.requirement
  await assert.rejects(upload(current, { payload: { replacesUploadId: null } }), /current upload changed/)
  const id = randomUUID(), filePath = `document-requirements/${r.id}/${actor}/${id}/file.pdf`
  await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata,user_metadata) values ('documents',$1,$2,$3,$4)", [filePath, actor, { size: 5, mimetype: 'application/pdf' }, { sha256: 'a'.repeat(64) }])
  await assert.rejects(command({ id, action: 'upload', requirement: r.id, revision: current.command_revision, payload: {
    filePath, fileName: 'file.pdf', mimeType: 'application/pdf', sizeBytes: 5, sha256: 'b'.repeat(64), replacesUploadId: current.latest_upload_id,
  } }), /could not be verified/)
  assert.equal((await row(r.id)).latest_upload_id, current.latest_upload_id)
  assert.equal((await db.query('select count(*) from documents where canonical_requirement_instance_id=$1', [r.id])).rows[0].count, 1)
})

test('legacy client-owned uploads respect the real buyer/seller audience constraint, including later handoff', async () => {
  // Include the production constraint that the original fixture omitted.
  await db.exec("alter table documents add constraint documents_client_recipient_role_check check(client_recipient_role is null or client_recipient_role in ('buyer','seller'))")
  const source = (await command({ payload: { party: 'buyer', label: 'Legacy buyer address' } })).requirement
  const legacy = { ...source, id: randomUUID(), requested_from_role: 'client', custom_label: null, requirement_origin: 'matrix', document_definition_key: 'buyer_proof_of_address' }
  await db.query('insert into document_requirement_instances select * from jsonb_populate_record(null::document_requirement_instances,$1)', [legacy])
  await assert.rejects(upload(await row(legacy.id)), /documents_client_recipient_role_check/)
  assert.equal((await row(legacy.id)).latest_upload_id, null)
  await db.exec(await sql('20261019212951_buyer_document_requirement_audience'))
  const saved = await upload(await row(legacy.id))
  const doc = (await db.query('select * from documents where id=$1', [saved.result.uploadId])).rows[0]
  assert.equal(doc.client_recipient_role, 'buyer')
  assert.equal(saved.result.requirement.status, 'under_review')
  assert.deepEqual(await command(saved.args), saved.result, 'retry reuses the exact saved receipt')
  await db.query("update document_requirement_instances set visible_to_roles=array['buyer','seller'] where id=$1", [legacy.id])
  const shared = await upload(await row(legacy.id))
  assert.equal((await db.query('select client_recipient_role from documents where id=$1', [shared.result.uploadId])).rows[0].client_recipient_role, null, 'shared buyer/seller evidence keeps its shared audience')


  const staged = { ...source, id: randomUUID(), requested_from_role: 'client', context_type: 'buyer_lead', context_id: lead,
    transaction_id: null, custom_label: null, requirement_origin: 'matrix', document_definition_key: 'buyer_id_document' }
  await db.query('insert into document_requirement_instances select * from jsonb_populate_record(null::document_requirement_instances,$1)', [staged])
  const pre = await upload(await row(staged.id))
  assert.equal((await db.query('select count(*)::int n from documents where id=$1', [pre.result.uploadId])).rows[0].n, 0)
  await db.query("update document_requirement_instances set context_type='transaction',context_id=$1,transaction_id=$1 where id=$2", [transaction, staged.id])
  const promoted = (await db.query('select * from documents where id=$1', [pre.result.uploadId])).rows[0]
  assert.equal(promoted.client_recipient_role, 'buyer')
  assert.equal(promoted.file_path, pre.args.payload.filePath)
  assert.equal(promoted.transaction_id, transaction)
  await db.exec(await sql('20261019212951_buyer_document_requirement_audience'))
})

test('seller lead upload hands off the same file to the listing transaction and replacements retain history', async () => {
  const sellerLead = randomUUID()
  await db.query("insert into leads values($1,$2,'seller')", [sellerLead, org])
  await db.query('update private_listings set seller_lead_id=$1 where id=$2', [sellerLead, listing])
  const initial = (await command({ type: 'seller_lead', context: sellerLead, payload: { party: 'seller', label: 'QA seller address' } })).requirement
  const before = await upload(initial)
  assert.equal(before.result.requirement.transaction_id, null)
  await db.query('select bridge_handoff_manual_document_requirements($1)', [transaction])
  const linked = await row(initial.id)
  const first = (await db.query('select * from documents where id=$1', [before.result.uploadId])).rows[0]
  assert.equal(first.transaction_id, transaction)
  assert.equal(first.file_path, before.args.payload.filePath)
  assert.equal(first.client_recipient_role, 'seller')
  assert.equal(linked.satisfied_by_document_id, first.id)
  await db.query("update document_requirement_instances set status='approved' where id=$1", [initial.id])
  const replacement = await upload(await row(initial.id))
  assert.equal(replacement.result.requirement.status, 'under_review')
  assert.equal((await db.query('select count(*)::int n from documents where canonical_requirement_instance_id=$1', [initial.id])).rows[0].n, 2)
  assert.equal((await db.query('select file_path from documents where id=$1', [first.id])).rows[0].file_path, first.file_path)
})
