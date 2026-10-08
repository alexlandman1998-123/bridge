import { runRecoverableDocumentUpload, readSavedUploadByPath, isDefiniteUploadSaveRejection } from '../src/lib/documentUploadRecovery.js'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import vm from 'node:vm'
import { PGlite } from '@electric-sql/pglite'
import { persistAttorneyDocument, requestAttorneyDocuments, reviewAttorneyDocument, reviewAttorneyDocumentRequest, isDefiniteDocumentSaveFailure, refreshAfterDocumentSave } from '../src/services/documents/attorneyDocumentPersistence.js'
import { matterMessageRequest } from '../src/core/transactions/matterMessageRequest.js'
import { mergeSavedAttorneyDocumentVersion } from '../src/services/documents/attorneyDocumentVersionModel.js'
import { getAttorneyRequestUploadAudience } from '../src/services/documents/attorneyDocumentRequestModel.js'

const db = new PGlite()
const actor = '11111111-1111-4111-8111-111111111111'
const matter = '22222222-2222-4222-8222-222222222222'
const otherMatter = '33333333-3333-4333-8333-333333333333'
const requirement = '44444444-4444-4444-8444-444444444444'
const firm = '55555555-5555-4555-8555-555555555555'
const participant = '66666666-6666-4666-8666-666666666666'
const command = () => crypto.randomUUID()
const fixture = `
create role authenticated; create role anon; create role service_role;
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid$$;
create table profiles(id uuid primary key, role text, email text);
create table transactions(id uuid primary key, organisation_id uuid, owner_user_id uuid, development_id uuid, unit_id uuid, buyer_id uuid);
create table test_document_access(actor_id uuid, transaction_id uuid, lane text, writable boolean);
create function bridge_can_access_transaction_spine(t uuid) returns boolean language sql stable security definer as $$
  select exists(select 1 from public.test_document_access where actor_id=auth.uid() and transaction_id=t)$$;
create function bridge_can_mutate_attorney_lane(t uuid, r text, c text) returns boolean language sql stable security definer as $$
  select exists(select 1 from public.test_document_access where actor_id=auth.uid() and transaction_id=t and lane=r and writable)$$;
create function bridge_is_org_admin(o uuid) returns boolean language sql as $$select false$$;
create table attorney_firm_members(firm_id uuid, user_id uuid, status text, role text, professional_role text);
create table organisation_users(user_id uuid, status text, app_role text, role text);
create table transaction_attorney_assignments(transaction_id uuid, status text, assignment_status text,
  primary_attorney_id uuid, attorney_user_id uuid, attorney_firm_id uuid, firm_id uuid, can_manage_documents boolean,
  secretary_id uuid, admin_handler_id uuid);
create table transaction_participants(id uuid primary key, transaction_id uuid, user_id uuid, status text, can_view boolean);
create table storage.buckets(id text primary key, public boolean);
create table storage.objects(bucket_id text, name text, owner_id text);
create table document_definitions(key text primary key, review_required boolean);
create table document_requirement_instances(id uuid primary key, transaction_id uuid, context_type text,
  document_definition_key text, status text, satisfied_by_document_id uuid, rejection_reason text, waiver_reason text,
  reviewer_role text, requested_from_role text, source_system text, uploadable_by_roles text[], updated_at timestamptz);
create table documents(id uuid primary key default gen_random_uuid(), transaction_id uuid, name text not null,
  file_path text unique not null, category text, document_type text, visibility_scope text,
  client_recipient_role text, uploaded_by_user_id uuid, uploaded_by_role text, uploaded_by_email text,
  stage_key text, is_client_visible boolean, uploaded_by_party text, bucket_key text, source text,
  file_bucket text, finance_lane text, related_entity_type text, related_entity_id uuid,
  lane_key text, attorney_role text, canonical_requirement_instance_id uuid,
  upload_idempotency_key text unique, status text, review_status text, created_at timestamptz default now(),
  file_name text, source_requirement_id uuid, uploaded_at timestamptz);
create table document_request_groups(id uuid primary key default gen_random_uuid(), transaction_id uuid, title text,
  description text, created_by uuid, created_by_role text);
create table document_requests(id uuid primary key default gen_random_uuid(), transaction_id uuid,
  request_type text, category text, document_type text, title text, description text, notes text,
  priority text, due_date date, requested_from text, assigned_to_role text, visibility_scope text,
  assigned_to_user_id uuid, request_group_id uuid, canonical_requirement_instance_id uuid,
  status text, requires_review boolean, created_by uuid, created_by_role text, requested_document_id uuid,
  rejected_reason text, completed_at timestamptz, updated_at timestamptz, created_at timestamptz default now());
create table transaction_required_documents(id uuid primary key default gen_random_uuid(), transaction_id uuid,
  canonical_requirement_instance_id uuid, document_key text, is_uploaded boolean, uploaded_document_id uuid,
  status text, uploaded_at timestamptz, updated_at timestamptz, verified_at timestamptz, rejected_at timestamptz, notes text);
create table document_requirement_events(id uuid primary key default gen_random_uuid(), requirement_instance_id uuid,
  event_type text, actor_role text, actor_user_id uuid, message text, metadata_json jsonb);
create table document_requirement_reviews(id uuid primary key default gen_random_uuid(), requirement_instance_id uuid,
  document_id uuid, review_status text, reviewer_role text, reviewer_user_id uuid, review_notes text,
  rejection_reason text, reviewed_at timestamptz);
create table transaction_events(id uuid primary key default gen_random_uuid(), transaction_id uuid,
  event_type text, created_by uuid, created_by_role text, event_data jsonb, visibility_scope text);
create table transaction_refresh_signals(transaction_id uuid primary key, version bigint, changed_at timestamptz,
  command_receipt_id uuid, canonical_event_id uuid);
create table buyers(id uuid primary key, email text);
create table client_portal_links(id uuid primary key, token text, transaction_id uuid, buyer_id uuid,
  development_id uuid, unit_id uuid, is_active boolean);
create function bridge_client_portal_request_token() returns text language sql as $$select current_setting('test.portal_token',true)$$;
-- This unrelated seller function only supplies the guard text required by the
-- existing migration. Canonical upload, review and request projection use their
-- actual repository SQL below.
create function bridge_satisfy_new_transaction_seller_request_p0_6() returns boolean language plpgsql as $$begin /*
and document.source = 'seller_portal'
or public.bridge_normalize_seller_document_key_p0_4(document.document_type) = v_key
or public.bridge_normalize_seller_document_key_p0_4(document.category) = v_key
*/ return true; end; $$;
`
await db.exec(fixture)
const migration = name => readFile(new URL(`../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const uploadSql = await migration('202605250015_canonical_document_browser_upload_link_rpc')
await db.exec(uploadSql.slice(0, uploadSql.indexOf('create or replace function public.bridge_link_document_to_canonical_requirement_by_key')))
await db.exec(await migration('202605250016_canonical_document_browser_review_lifecycle_rpc'))
const reviewScope = await migration('20260926175324_attorney_workbench_permission_contract')
await db.exec('begin;\n' + reviewScope.slice(reviewScope.indexOf('alter function public.bridge_review_canonical_requirement')))
await db.exec(await migration('20260927091054_unify_transaction_document_actions_phase4'))
await db.exec(await migration('20261003173649_attorney_document_persistence'))
await db.exec(await migration('20261003180814_attorney_document_request_review'))
await db.exec(await migration('20261003183115_attorney_document_versions'))
const buyerUploadSql = await migration('20260831205101_canonical_document_identity_and_portal_requests')
await db.exec('begin;\n' + buyerUploadSql.slice(buyerUploadSql.indexOf('create or replace function public.bridge_upload_buyer_portal_requested_document')))
await db.exec(`insert into profiles values ('${actor}','attorney','attorney@example.test');
  insert into transactions(id,organisation_id,owner_user_id) values ('${matter}',null,'${actor}'),('${otherMatter}',null,null);
  insert into test_document_access values ('${actor}','${matter}','transfer_attorney',true),('${actor}','${matter}','bond_attorney',true),('${actor}','${matter}','cancellation_attorney',true);
  insert into attorney_firm_members values ('${firm}','${actor}','active','attorney_conveyancer','attorney_conveyancer');
  insert into transaction_attorney_assignments(transaction_id,status,assignment_status,primary_attorney_id,attorney_user_id,attorney_firm_id,firm_id,can_manage_documents)
    values ('${matter}','active','active','${actor}','${actor}','${firm}','${firm}',true);
  insert into transaction_participants values ('${participant}','${matter}','${actor}','active',true);
  insert into storage.buckets values ('documents',false);
  insert into document_definitions values ('seller_authority',true);
  insert into document_requirement_instances(id,transaction_id,context_type,document_definition_key,status,reviewer_role,requested_from_role)
    values ('${requirement}','${matter}','transaction','seller_authority','pending','transferring_attorney','seller');
  insert into transaction_required_documents(transaction_id,canonical_requirement_instance_id,document_key,status)
    values ('${matter}','${requirement}','seller_authority','missing');`)
// Only reads and RPCs are available to the browser role. Definer functions must
// authenticate and authorize all writes, including private receipt access.
await db.exec(`grant usage on schema auth to authenticated;
  grant select on documents,document_requests,transaction_required_documents,document_requirement_instances,
    transaction_events,document_requirement_reviews,transaction_refresh_signals,document_request_groups to authenticated;
  alter table documents enable row level security;
  create policy document_read on documents for select to authenticated using (bridge_can_access_transaction_spine(transaction_id));
  alter table document_requests enable row level security;
  create policy request_read on document_requests for select to authenticated using (bridge_can_access_transaction_spine(transaction_id));`)
await db.query(`select set_config('request.jwt.claim.sub',$1,false)`, [actor])
await db.exec('set role authenticated')
const names = {
  bridge_save_attorney_document: ['p_document', 'p_document_request_id'],
  bridge_save_attorney_document_version: ['p_document', 'p_document_request_id'],
  bridge_request_attorney_documents: ['p_transaction_id', 'p_requests', 'p_command_id', 'p_group_title', 'p_group_description'],
  bridge_review_attorney_document: ['p_requirement_instance_id', 'p_document_id', 'p_action', 'p_reason', 'p_actor_role', 'p_command_id'],
  bridge_review_attorney_document_request: ['p_request_id', 'p_document_id', 'p_action', 'p_reason', 'p_command_id'],
}
const client = { rpc: async (name, args) => {
  const keys = names[name]
  try {
    const { rows } = await db.query(`select public.${name}(${keys.map((_, i) => `$${i + 1}`).join(',')}) result`, keys.map(key => args[key]))
    return { data: rows[0].result, error: null }
  } catch (error) { return { data: null, error } }
} }
const row = { title: 'Seller resolution', category: 'Additional Requests', document_type: 'seller_authority',
  request_type: 'additional_document_request', description: 'Current signed resolution', notes: 'Include the signatories',
  priority: 'required', requested_from: 'seller', assigned_to_role: 'seller', visibility_scope: 'client_visible',
  requires_review: true, canonical_requirement_instance_id: requirement }
let requestId, saved
async function storageFile(name) {
  await db.exec('reset role')
  await db.query('insert into storage.objects values ($1,$2,$3)', ['documents', `transaction-${matter}/${name}`, actor])
  await db.exec('set role authenticated')
}
const document = (name, key, lane = 'transfer') => ({ transaction_id: matter, name, category: 'Seller Documents',
  document_type: 'seller_authority', file_path: `transaction-${matter}/${name}`, file_bucket: 'documents',
  lane_key: lane, canonical_requirement_instance_id: requirement, upload_idempotency_key: key,
  visibility_scope: 'internal', is_client_visible: false, notes: 'Checked against instruction',
  related_entity_type: 'transaction_participant', related_entity_id: participant })
const count = async table => Number((await db.query(`select count(*)::integer n from ${table}`)).rows[0].n)
const state = async () => (await db.query(`select r.status requirement_status, r.satisfied_by_document_id,
  q.status request_status, q.requested_document_id, l.status checklist_status
  from document_requirement_instances r join document_requests q on q.canonical_requirement_instance_id=r.id
  join transaction_required_documents l on l.canonical_requirement_instance_id=r.id where r.id=$1`, [requirement])).rows[0]

await test('request metadata, activity and canonical state commit together; retry returns the same receipt', async () => {
  const key = command()
  const input = { transactionId: matter, requests: [{ ...row, created_at: '2026-10-03' }], commandId: key }
  const rows = await requestAttorneyDocuments(client, input)
  requestId = rows[0].id
  assert.equal(rows[0].notes, row.notes)
  assert.equal(rows[0].visibility_scope, row.visibility_scope)
  assert.equal(rows[0].created_by, actor)
  assert.equal((await state()).requirement_status, 'requested')
  const retried = await requestAttorneyDocuments(client, { ...input, requests: [{ ...row, created_at: '2026-10-04' }] })
  assert.equal(retried[0].id, requestId)
  assert.equal(await count('document_requests'), 1)
  assert.equal(await count('transaction_events'), 1)
  await assert.rejects(requestAttorneyDocuments(client, { ...input, requests: [{ ...row, notes: 'Different action' }] }), /retry key/)
})

await test('upload completes exact links and retains notes, party and private audience before returning', async () => {
  await storageFile('resolution.pdf')
  saved = await persistAttorneyDocument(client, { document: document('resolution.pdf', 'upload-1'), documentRequestId: requestId })
  assert.equal(saved.saved, true)
  assert.equal(saved.postUploadProcessing, 'complete')
  assert.equal(saved.notes, 'Checked against instruction')
  assert.equal(saved.related_entity_id, participant)
  assert.equal(saved.visibility_scope, 'internal')
  assert.equal(saved.uploaded_by_user_id, actor)
  assert.equal(saved.attorney_persistence_version, 1)
  assert.equal(saved.url, null)
  assert.deepEqual(await state(), { requirement_status: 'under_review', satisfied_by_document_id: saved.id,
    request_status: 'uploaded', requested_document_id: saved.id, checklist_status: 'under_review' })
  const retried = await persistAttorneyDocument(client, { document: document('resolution.pdf', 'upload-1'), documentRequestId: requestId })
  assert.equal(retried.id, saved.id)
  assert.equal(retried.deduplicated, true)
  assert.equal(await count('documents'), 1)
  assert.equal(await count('transaction_events'), 2)
})

await test('review propagates to request and checklist; a lost response can be replayed without duplicate reviews', async () => {
  const input = { requirementInstanceId: requirement, documentId: saved.id, action: 'approve', reason: 'Authority checked',
    actorRole: 'transferring_attorney', commandId: command() }
  const result = await reviewAttorneyDocument(client, input)
  assert.equal(result.saved, true)
  assert.equal(result.newStatus, 'approved')
  assert.equal((await state()).request_status, 'completed')
  assert.equal((await state()).checklist_status, 'approved')
  await reviewAttorneyDocument(client, input)
  assert.equal(await count('document_requirement_reviews'), 1)
  const sameFile = await persistAttorneyDocument(client, { document: document('resolution.pdf', 'upload-1'), documentRequestId: requestId })
  assert.equal(sameFile.id, saved.id)
  assert.equal((await state()).request_status, 'completed', 'retry must not reopen an accepted document')
})

await test('replacement reopens review and an old file cannot approve the new evidence', async () => {
  await storageFile('resolution-v2.pdf')
  const replacement = await persistAttorneyDocument(client, { document: document('resolution-v2.pdf', 'upload-2'), documentRequestId: requestId })
  assert.notEqual(replacement.id, saved.id)
  assert.equal((await state()).requirement_status, 'under_review')
  assert.equal(await count('documents'), 2, 'the earlier file remains available')
  await assert.rejects(reviewAttorneyDocument(client, { requirementInstanceId: requirement, documentId: saved.id,
    action: 'approve', actorRole: 'transferring_attorney', commandId: command() }), /replaced/)
  await reviewAttorneyDocument(client, { requirementInstanceId: requirement, documentId: replacement.id,
    action: 'reject', reason: 'Missing signature', actorRole: 'transferring_attorney', commandId: command() })
  assert.equal((await state()).request_status, 'rejected')
  assert.equal((await state()).checklist_status, 'rejected')
})

await test('all three attorney lanes retain their metadata without implicitly satisfying a requirement', async () => {
  for (const lane of ['transfer', 'bond', 'cancellation']) {
    await storageFile(`${lane}-working.pdf`)
    const result = await persistAttorneyDocument(client, { document: {
      ...document(`${lane}-working.pdf`, `${lane}-working`, lane), canonical_requirement_instance_id: null,
    } })
    assert.equal(result.lane_key, lane)
    assert.equal(result.attorney_role, `${lane}_attorney`)
    assert.equal(result.canonicalRequirementInstanceId, null)
    assert.equal(result.visibility_scope, 'internal')
  }
  assert.equal((await state()).requirement_status, 'rejected')
})

await test('an invalid request in a pack rolls back the group, earlier requests and activity', async () => {
  const before = await count('document_requests')
  const groups = await count('document_request_groups')
  const events = await count('transaction_events')
  await assert.rejects(requestAttorneyDocuments(client, { transactionId: matter, commandId: command(), groupTitle: 'Authority pack',
    requests: [{ ...row, canonical_requirement_instance_id: null }, { ...row, title: '' }] }), /title is required/)
  assert.equal(await count('document_requests'), before)
  assert.equal(await count('document_request_groups'), groups)
  assert.equal(await count('transaction_events'), events)
})

await test('a requested buyer upload commits links and refresh signals through the existing portal RPC', async () => {
  const buyer = command(), buyerRequirement = command()
  await db.exec('reset role')
  await db.query('insert into buyers values ($1,$2)', [buyer, 'buyer@example.test'])
  await db.query('update transactions set buyer_id=$1 where id=$2', [buyer, matter])
  await db.query('insert into client_portal_links values ($1,$2,$3,$4,null,null,true)', [command(), 'buyer-token', matter, buyer])
  await db.query(`insert into document_requirement_instances(id,transaction_id,context_type,document_definition_key,status,reviewer_role,requested_from_role)
    values ($1,$2,'transaction','seller_authority','pending','transferring_attorney','buyer')`, [buyerRequirement, matter])
  await db.exec('set role authenticated')
  const requests = await requestAttorneyDocuments(client, { transactionId: matter, commandId: command(),
    requests: [{ ...row, title: 'Buyer authority', requested_from: 'buyer', assigned_to_role: 'buyer', canonical_requirement_instance_id: buyerRequirement }] })
  const before = (await db.query('select version from transaction_refresh_signals where transaction_id=$1', [matter])).rows[0].version
  await db.query(`select set_config('test.portal_token','buyer-token',false)`)
  await db.exec('set role anon')
  const result = (await db.query(`select bridge_upload_buyer_portal_requested_document($1,$2,$3,'documents','buyer.pdf','Additional Requests','buyer_authority') result`,
    [matter, requests[0].id, `client-portal/${matter}/buyer.pdf`])).rows[0].result
  await assert.rejects(db.query('select bridge_request_attorney_documents($1,$2,$3,null,null)', [matter, [row], command()]), /permission denied/)
  await db.exec('set role authenticated')
  const linked = (await db.query('select status,requested_document_id from document_requests where id=$1', [requests[0].id])).rows[0]
  assert.equal(linked.status, 'uploaded')
  assert.equal(linked.requested_document_id, result.id)
  const canonical = (await db.query('select status,satisfied_by_document_id from document_requirement_instances where id=$1', [buyerRequirement])).rows[0]
  assert.equal(canonical.status, 'under_review')
  assert.equal(canonical.satisfied_by_document_id, result.id)
  assert.ok(Number((await db.query('select version from transaction_refresh_signals where transaction_id=$1', [matter])).rows[0].version) > Number(before))
})

await test('a later failure rolls back all writes, including activity and refresh revisions', async () => {
  const before = await count('documents')
  const events = await count('transaction_events')
  const revision = (await db.query('select version from transaction_refresh_signals where transaction_id=$1', [matter])).rows[0].version
  await storageFile('rollback.pdf')
  await db.exec('reset role')
  await db.exec(`create function test_reject_activity() returns trigger language plpgsql as $$begin
    if new.event_data->>'documentName'='rollback.pdf' then raise exception 'Activity write failed'; end if; return new; end; $$;
    create trigger test_activity_failure before insert on transaction_events for each row execute function test_reject_activity();`)
  await db.exec('set role authenticated')
  await assert.rejects(persistAttorneyDocument(client, { document: document('rollback.pdf', 'upload-rollback'), documentRequestId: requestId }), /Activity write failed/)
  assert.equal(await count('documents'), before)
  assert.equal(await count('transaction_events'), events)
  assert.equal((await db.query('select version from transaction_refresh_signals where transaction_id=$1', [matter])).rows[0].version, revision)
  assert.equal((await state()).requirement_status, 'rejected')
})

await test('cross-matter links, missing storage and read-only access are denied without writes', async () => {
  const before = await count('documents')
  await assert.rejects(persistAttorneyDocument(client, { document: { ...document('missing.pdf', 'missing') } }), /private storage/)
  await assert.rejects(persistAttorneyDocument(client, { document: { ...document('resolution.pdf', 'wrong-matter'), transaction_id: otherMatter } }), /permission/)
  await assert.rejects(requestAttorneyDocuments(client, { transactionId: otherMatter, requests: [row], commandId: command() }), /permission/)
  await db.exec('reset role')
  await db.query('update test_document_access set writable=false where actor_id=$1', [actor])
  await db.exec('set role authenticated')
  await assert.rejects(reviewAttorneyDocument(client, { requirementInstanceId: requirement, documentId: saved.id,
    action: 'approve', actorRole: 'transferring_attorney', commandId: command() }), /permission/)
  await assert.rejects(db.query('select * from journey_private.attorney_document_receipts'), /permission denied/)
  assert.equal(await count('documents'), before)
  await db.exec('reset role')
  await db.query('update test_document_access set writable=true where actor_id=$1', [actor])
  await db.exec('set role authenticated')
})

await test('other roles emit durable refresh signals; failed refresh and transport uncertainty preserve saved outcomes', async () => {
  const before = (await db.query('select version from transaction_refresh_signals where transaction_id=$1', [matter])).rows[0].version
  await db.exec('reset role')
  await db.query('update document_requests set updated_at=now() where id=$1', [requestId])
  assert.equal((await db.query('select version from transaction_refresh_signals where transaction_id=$1', [matter])).rows[0].version, before,
    'timestamp-only reconciliation must not create a refresh loop')
  await db.query('update document_requests set notes=$1 where id=$2', ['Updated by another session', requestId])
  await db.exec('set role authenticated')
  const after = (await db.query('select version from transaction_refresh_signals where transaction_id=$1', [matter])).rows[0].version
  assert.ok(Number(after) > Number(before))
  let pending = 0
  await refreshAfterDocumentSave(() => { throw new Error('Offline') }, () => pending++)
  assert.equal(pending, 1)
  assert.equal(isDefiniteDocumentSaveFailure({ code: '42501' }), true)
  assert.equal(isDefiniteDocumentSaveFailure({ code: '23505' }), true)
  assert.equal(isDefiniteDocumentSaveFailure({ code: '08006' }), false)
  assert.equal(isDefiniteDocumentSaveFailure(new TypeError('Failed to fetch')), false)
  const first = matterMessageRequest(null, { scope: matter, body: 'same request', audience: 'seller' })
  assert.equal(matterMessageRequest(first, { scope: matter, body: 'same request', audience: 'seller' }).commandId, first.commandId)
  assert.notEqual(matterMessageRequest(first, { scope: otherMatter, body: 'same request', audience: 'seller' }).commandId, first.commandId)
})

await test('the actual request handler releases controls during a hung refresh and retains its key on a failed save', async () => {
  const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('  async function handleCreateDocumentRequest(event)')
  const body = source.slice(start, source.indexOf('\n  const handleQuickAddWorkflowNote', start)).trim()
  const busy = [], errors = [], keys = []
  const ref = { current: null }
  let rejectSave = true, closed = false, refreshed = false
  const handler = vm.runInNewContext(`(${body})`, {
    transaction: { id: matter }, workspaceRole: 'attorney', currentMatterAccessKey: matter,
    liveMatterScopeRef: { current: matter }, documentRequestCommandRef: ref,
    documentRequestForm: { title: 'Resolution', requestedFrom: 'seller', visibility: 'client_visible', notes: 'Signed copy' },
    attorneyRequestRequirementOptions: [], setDocumentActionMessage() {}, setData() {},
    matterMessageRequest, refreshAfterDocumentSave,
    setDocumentRequestSaving: value => busy.push(value), setError: value => errors.push(value),
    setDocumentRequestForm() {}, setRequestDocumentModalOpen: open => { closed = !open },
    window: { dispatchEvent() {} }, Event,
    createTransactionDocumentRequests: async input => { keys.push(input.commandId); if (rejectSave) throw new Error('Save failed'); return [{ id: requestId }] },
    refreshTransactionDatasets: () => { refreshed = true; return new Promise(() => {}) },
  })
  await handler({ preventDefault() {} })
  assert.equal(closed, false)
  assert.equal(busy.at(-1), false)
  assert.equal(errors.at(-1), 'Save failed')
  rejectSave = false
  await handler({ preventDefault() {} })
  assert.equal(keys[0], keys[1])
  assert.equal(ref.current, null)
  assert.equal(closed, true)
  assert.equal(busy.at(-1), false)
  assert.equal(refreshed, true)
})

await test('the actual review handler preserves successful review when refresh fails', async () => {
  const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('  async function handleSubmitReviewAction()')
  const body = source.slice(start, source.indexOf('\n  async function handleAddDiscussion', start)).trim()
  const busy = [], errors = []
  let closed = false
  const handler = vm.runInNewContext(`(${body})`, {
    reviewActionDraft: { requirement: {}, document: { id: saved.id }, action: 'approve', reason: 'Checked' },
    getRequirementCanonicalId: () => requirement, getDocumentCanonicalId: () => requirement,
    getRequirementDocumentId: () => saved.id, currentMatterAccessKey: matter,
    liveMatterScopeRef: { current: matter }, documentReviewCommandRef: { current: null },
    matterMessageRequest, refreshAfterDocumentSave,
    setSaving: value => busy.push(value), setError: value => errors.push(value),
    reviewCanonicalDocumentRequirement: async () => ({ saved: true }),
    setReviewActionDraft: value => { closed = !value.open },
    setDocumentActionMessage() {},
    refreshTransactionDatasets: async () => { throw new Error('Refresh failed') },
    refreshCanonicalTransactionSnapshot: async () => {},
  })
  await handler()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(closed, true)
  assert.equal(busy.at(-1), false)
  assert.match(errors.at(-1), /review saved/i)
  assert.doesNotMatch(errors.at(-1), /Unable to update/)
})

await test('the actual upload API retains a committed file after a lost response and recovers it without uploading again', async () => {
  const source = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
  const start = source.indexOf('export async function uploadDocument(')
  const body = source.slice(start, source.indexOf('\nexport async function listOrphanedTransactionDocumentObjects', start)).replace(/^export /, '').trim()
  let loseResponse = true, uploads = 0, deletes = 0
  const key = 'runtime-lost-response'
  const upload = vm.runInNewContext(`(${body})`, {
    runRecoverableDocumentUpload, readSavedUploadByPath, isDefiniteUploadSaveRejection, DOCUMENTS_BUCKET_CANDIDATES: ['documents'],
    requireClient: () => client,
    assertActiveTransactionForDocumentUpload: async () => matter,
    resolveActiveProfileContext: async () => ({ userId: actor, role: 'attorney', email: 'attorney@example.test' }),
    validateDocumentUploadFile: file => ({ safeName: file.name }),
    resolveAttorneyDocumentLaneMetadata: () => ({ laneKey: 'transfer', attorneyRole: 'transfer_attorney' }),
    createDocumentUploadProgressReporter: () => () => {},
    resolveCanonicalRequirementTargetForUpload: async () => ({ canonicalRequirementInstanceId: requirement, requiredDocumentKey: 'seller_authority' }),
    getCanonicalUploadKeyCandidates: () => ['seller_authority'],
    normalizePortalDocumentType: value => value,
    createDocumentUploadIdempotencyKey: async () => key,
    findDocumentByUploadIdempotencyKey: async () => (await db.query('select * from documents where upload_idempotency_key=$1', [key])).rows[0] || null,
    uploadToDocumentsBucket: async (_client, filePath) => {
      uploads++
      await db.exec('reset role')
      await db.query('insert into storage.objects values ($1,$2,$3)', ['documents', filePath, actor])
      await db.exec('set role authenticated')
      return 'documents'
    },
    normalizeNullableText: value => value || null, normalizeNullableUuid: value => value || null,
    persistAttorneyDocument: async (_client, input) => {
      const result = await persistAttorneyDocument(client, input)
      if (loseResponse) throw new TypeError('Response lost after commit')
      return result
    },
    isDefiniteDocumentSaveFailure,
    removeDocumentUploadObjectAfterFailedPersistence: async () => { deletes++ },
    reportDocumentUploadTelemetry() {}, reconcileAttorneyDocumentEvidence: async () => {},
    getSignedUrl: () => { throw new Error('A saved upload must not wait for a download URL') },
    console,
  })
  const input = { transactionId: matter, file: { name: 'runtime.pdf' }, category: 'Seller Documents',
    attorneyLaneKey: 'transfer', canonicalRequirementInstanceId: requirement, documentRequestId: requestId,
    notes: 'Persist this note', relatedEntityType: 'transaction_participant', relatedEntityId: participant }
  await assert.rejects(upload(input), /Response lost/)
  assert.equal(deletes, 0, 'a possibly committed object must never be deleted')
  const committed = (await db.query('select * from documents where upload_idempotency_key=$1', [key])).rows[0]
  assert.ok(committed.id)
  assert.equal(committed.notes, input.notes)
  assert.equal((await state()).requested_document_id, committed.id)
  loseResponse = false
  const recovered = await upload(input)
  assert.equal(recovered.id, committed.id)
  assert.equal(recovered.saved, true)
  assert.equal(uploads, 1)
  assert.equal(deletes, 0)
})

await test('an additional request can be approved, corrected and replaced without completing a checklist', async () => {
  const additional = (await requestAttorneyDocuments(client, { transactionId: matter, requests: [{ ...row, title: 'Supporting letter', canonical_requirement_instance_id: null }], commandId: command() }))[0]
  await storageFile('supporting-letter.pdf')
  const file = await persistAttorneyDocument(client, { document: { ...document('supporting-letter.pdf', 'additional-file'), canonical_requirement_instance_id: null }, documentRequestId: additional.id })
  const canonicalBefore = await state()
  const key = command()
  const input = { requestId: additional.id, documentId: file.id, action: 'approve', reason: 'Clear copy', commandId: key }
  const first = await reviewAttorneyDocumentRequest(client, input)
  assert.equal(first.request.status, 'completed')
  assert.ok(first.request.completed_at)
  assert.equal((await db.query('select review_status from documents where id=$1', [file.id])).rows[0].review_status, 'approved')
  const eventCount = await count('transaction_events')
  assert.deepEqual(await reviewAttorneyDocumentRequest(client, input), first)
  assert.equal(await count('transaction_events'), eventCount)
  await assert.rejects(reviewAttorneyDocumentRequest(client, { ...input, reason: 'Changed' }), /different document action/)
  const correction = await reviewAttorneyDocumentRequest(client, { ...input, action: 'reject', reason: 'Please include page two', commandId: command() })
  assert.equal(correction.request.status, 'rejected')
  assert.equal(correction.request.rejected_reason, 'Please include page two')
  assert.equal((await db.query('select review_status from documents where id=$1', [file.id])).rows[0].review_status, 'rejected')
  await assert.rejects(reviewAttorneyDocumentRequest(client, { ...input, commandId: command() }), /corrected document/)
  await storageFile('supporting-letter-corrected.pdf')
  const replacement = await persistAttorneyDocument(client, { document: { ...document('supporting-letter-corrected.pdf', 'additional-replacement'), canonical_requirement_instance_id: null }, documentRequestId: additional.id })
  assert.equal((await db.query('select status,rejected_reason from document_requests where id=$1', [additional.id])).rows[0].status, 'uploaded')
  await assert.rejects(reviewAttorneyDocumentRequest(client, { ...input, commandId: command() }), /no longer the received/)
  const completed = await reviewAttorneyDocumentRequest(client, { ...input, documentId: replacement.id, commandId: command() })
  assert.equal(completed.request.requested_document_id, replacement.id)
  assert.deepEqual(await state(), canonicalBefore)
})

await test('request review uses canonical permission and projects correction and approval to its checklist', async () => {
  const current = (await state()).satisfied_by_document_id
  const correction = await reviewAttorneyDocumentRequest(client, { requestId, documentId: current, action: 'reject', reason: 'Unreadable signature', commandId: command() })
  assert.equal(correction.request.status, 'rejected')
  assert.equal((await state()).checklist_status, 'rejected')
  await storageFile('request-review-replacement.pdf')
  const replacement = await persistAttorneyDocument(client, { document: document('request-review-replacement.pdf', 'request-review-replacement'), documentRequestId: requestId })
  await reviewAttorneyDocumentRequest(client, { requestId, documentId: replacement.id, action: 'approve', commandId: command() })
  assert.equal((await state()).requirement_status, 'approved')
  assert.equal((await state()).request_status, 'completed')
  assert.equal((await state()).checklist_status, 'approved')
})

await test('additional request review denies wrong files, missing correction reasons and unauthorised reviewers', async () => {
  const extra = (await requestAttorneyDocuments(client, { transactionId: matter, requests: [{ ...row, title: 'Extra evidence', canonical_requirement_instance_id: null }], commandId: command() }))[0]
  await storageFile('extra-evidence.pdf')
  const file = await persistAttorneyDocument(client, { document: { ...document('extra-evidence.pdf', 'extra-evidence'), canonical_requirement_instance_id: null }, documentRequestId: extra.id })
  const input = { requestId: extra.id, documentId: file.id, action: 'reject', commandId: command() }
  await assert.rejects(reviewAttorneyDocumentRequest(client, input), /Explain the correction/)
  await assert.rejects(reviewAttorneyDocumentRequest(client, { ...input, documentId: saved.id, reason: 'Wrong file' }), /no longer the received/)
  const changePermission = async writable => {
    await db.exec('reset role')
    await db.query('update test_document_access set writable=$1 where lane=$2', [writable, 'transfer_attorney'])
    await db.exec('set role authenticated')
  }
  await changePermission(false)
  await assert.rejects(reviewAttorneyDocumentRequest(client, { ...input, reason: 'Needs correction' }), /permission/)
  await changePermission(true)
  await db.exec('reset role')
  await db.query('update attorney_firm_members set professional_role=$1', ['secretary'])
  await db.exec('set role authenticated')
  await assert.rejects(reviewAttorneyDocumentRequest(client, { ...input, reason: 'Needs correction' }), /authorised attorney/)
  await db.exec('reset role')
  await db.query('update attorney_firm_members set professional_role=$1', ['attorney_conveyancer'])
  await db.exec(`create function fail_request_review_activity() returns trigger language plpgsql as $$begin
    if new.event_data->>'source' = 'attorney_document_request_review' then raise exception 'Activity unavailable'; end if;
    return new; end;$$;
    create trigger fail_request_review_activity before insert on transaction_events for each row execute function fail_request_review_activity();`)
  await db.exec('set role authenticated')
  await assert.rejects(reviewAttorneyDocumentRequest(client, { ...input, reason: 'Needs correction' }), /Activity unavailable/)
  assert.equal((await db.query('select status from document_requests where id=$1', [extra.id])).rows[0].status, 'uploaded')
  await db.exec('reset role; drop trigger fail_request_review_activity on transaction_events; set role authenticated')
})

await test('a second open request cannot duplicate an exact checklist instance', async () => {
  const id = command()
  await db.exec('reset role')
  await db.query(`insert into document_requirement_instances(id,transaction_id,context_type,document_definition_key,status,reviewer_role,requested_from_role)
    values ($1,$2,'transaction','seller_authority','pending','transferring_attorney','seller')`, [id, matter])
  await db.exec('set role authenticated')
  const input = { transactionId: matter, requests: [{ ...row, canonical_requirement_instance_id: id }], commandId: command() }
  await requestAttorneyDocuments(client, input)
  const requestCount = await count('document_requests')
  await assert.rejects(requestAttorneyDocuments(client, { ...input, commandId: command() }), /already has an open/)
  assert.equal(await count('document_requests'), requestCount)
})

await test('the request review handler retries its exact action and updates the queue before a failed refresh', async () => {
  const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
  const start = source.indexOf('  async function handleSubmitReviewAction()')
  const body = source.slice(start, source.indexOf('\n  async function handleAddDiscussion', start)).trim()
  let state = { transaction: { id: matter }, documentRequests: [{ id: 'extra', status: 'uploaded' }] }
  const keys = [], busy = [], errors = []
  let failSave = true
  const handler = vm.runInNewContext(`(${body})`, {
    reviewActionDraft: { requestId: 'extra', document: { id: 'file' }, action: 'reject', reason: 'Missing final page' },
    getRequirementCanonicalId: () => null, getDocumentCanonicalId: () => null, getRequirementDocumentId: () => null,
    currentMatterAccessKey: matter, liveMatterScopeRef: { current: matter }, documentReviewCommandRef: { current: null },
    matterMessageRequest, refreshAfterDocumentSave,
    setSaving: value => busy.push(value), setError: value => errors.push(value),
    setData: update => { state = update(state) }, setDocumentActionMessage() {}, setReviewActionDraft() {},
    reviewCanonicalDocumentRequirement: async () => assert.fail('Additional requests do not use the canonical review endpoint'),
    reviewAttorneyMatterDocumentRequest: async input => {
      keys.push(input.commandId)
      assert.equal(input.requestId, 'extra'); assert.equal(input.documentId, 'file')
      if (failSave) throw new Error('Save not confirmed')
      return { id: 'extra', status: 'rejected', rejectedReason: input.reason, saved: true }
    },
    refreshTransactionDatasets: async () => { throw new Error('Refresh failed') }, refreshCanonicalTransactionSnapshot: async () => {},
  })
  await handler()
  assert.equal(state.documentRequests[0].status, 'uploaded')
  failSave = false
  await handler()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(keys[0], keys[1])
  assert.equal(state.documentRequests[0].status, 'rejected')
  assert.equal(state.documentRequests[0].rejectedReason, 'Missing final page')
  assert.equal(busy.at(-1), false)
  assert.match(errors.at(-1), /review saved/i)
})

await test('the request review endpoint is unavailable to anonymous callers', async () => {
  await db.exec('reset role; set role anon')
  await assert.rejects(db.query('select bridge_review_attorney_document_request($1,$2,$3,$4,$5)', [requestId, saved.id, 'approve', null, command()]), /permission denied/)
  await db.exec('reset role; set role authenticated')
})

await test('the existing Storage policy keeps requested files with their client or professional audience', async () => {
  await db.exec(`reset role;
    create schema document_security;
    grant usage on schema document_security,auth to anon,authenticated;
    alter table transactions add column listing_id uuid;
    update transactions set listing_id=id;
    create function journey_private.can_read_professional_journey(t uuid) returns boolean language sql stable as $$
      select exists(select 1 from public.test_document_access where actor_id=auth.uid() and transaction_id=t)$$;
    create function bridge_has_external_workspace_transaction_access(t uuid) returns boolean language sql as $$select false$$;
    create function bridge_external_workspace_role() returns text language sql as $$select null::text$$;
    create function bridge_developer_document_portal_active_link() returns table(transaction_id uuid,id uuid) language sql as $$select null::uuid,null::uuid where false$$;
    create function bridge_has_client_portal_token_transaction_access(t uuid) returns boolean language sql as $$select current_setting('test.portal_actor',true)='buyer'$$;
    create function bridge_has_onboarding_token_transaction_access(t uuid) returns boolean language sql as $$select false$$;
    create function bridge_storage_seller_portal_listing_id() returns uuid language sql as $$select case when current_setting('test.portal_actor',true)='seller' then '${matter}'::uuid else null::uuid end$$;`)
  const policySql = await migration('20260911081342_document_storage_audience_boundary')
  const start = policySql.indexOf('create or replace function document_security.can_read(d public.documents)')
  const end = policySql.indexOf('\n$$;', start) + 4
  assert.ok(start >= 0 && end > start)
  await db.exec(policySql.slice(start, end))
  const readAudience = async (scope, recipient) => (await db.query(`select document_security.can_read(jsonb_populate_record(null::public.documents,$1::jsonb)) allowed`, [{ transaction_id: matter, visibility_scope: scope, client_recipient_role: recipient }])).rows[0].allowed
  await db.exec('set role authenticated')
  assert.equal(await readAudience('professional_shared', null), true)
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub','',false)")
  await db.exec('set role anon')
  for (const role of ['buyer', 'seller']) {
    await db.query("select set_config('test.portal_actor',$1,false)", [role])
    assert.equal(await readAudience('professional_shared', null), false)
    assert.equal(await readAudience('client', role), true)
    assert.equal(await readAudience('client', role === 'buyer' ? 'seller' : 'buyer'), false)
    assert.equal(await readAudience('internal', role), false)
  }
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [actor])
  await db.exec('set role authenticated')
})


const versionRequirement = command()
let versionRequest, firstDraft, readyCopy, signedCopy, revisedDraft, newSignedCopy
const versionPayload = (name, key, kind, previous = null) => ({ ...document(name, key),
  canonical_requirement_instance_id: versionRequirement,
  attorney_version_kind: kind, attorney_version_previous_id: previous?.id || null,
  visibility_scope: 'client', is_client_visible: true, client_recipient_role: 'seller',
})
const versionSave = payload => persistAttorneyDocument(client, { document: payload, documentRequestId: versionRequest.id })
const versionState = async () => (await db.query(`select r.status requirement_status,r.satisfied_by_document_id,
  q.status request_status,q.requested_document_id from document_requirement_instances r
  join document_requests q on q.canonical_requirement_instance_id=r.id where r.id=$1`, [versionRequirement])).rows[0]
await test('external drafts and ready-to-sign revisions persist without supplying requested or canonical evidence', async () => {
  await db.exec('reset role')
  await db.query(`insert into document_requirement_instances(id,transaction_id,context_type,document_definition_key,status,reviewer_role,requested_from_role)
    values ($1,$2,'transaction','seller_authority','pending','transferring_attorney','seller')`, [versionRequirement,matter])
  await db.query(`insert into transaction_required_documents(transaction_id,canonical_requirement_instance_id,document_key,status)
    values ($1,$2,'seller_authority','missing')`, [matter, versionRequirement])
  await db.exec('set role authenticated')
  versionRequest = (await requestAttorneyDocuments(client, { transactionId: matter, requests: [{ ...row, canonical_requirement_instance_id: versionRequirement }], commandId: command() }))[0]
  const before = await versionState()
  await storageFile('draft-resolution.docx')
  firstDraft = await versionSave(versionPayload('draft-resolution.docx','version-draft-1','draft'))
  assert.equal(firstDraft.attorney_version_number,1)
  assert.equal(firstDraft.attorney_version_root_id,firstDraft.id)
  assert.equal(firstDraft.attorney_target_requirement_id,versionRequirement)
  assert.equal(firstDraft.attorney_target_request_id,versionRequest.id)
  assert.equal(firstDraft.canonical_requirement_instance_id,null)
  assert.equal(firstDraft.document_type,'attorney_working_copy')
  assert.equal(firstDraft.attorney_version_document_type,'seller_authority')
  assert.equal(firstDraft.visibility_scope,'internal')
  assert.equal(firstDraft.is_client_visible,false)
  assert.equal(firstDraft.client_recipient_role,null)
  assert.deepEqual(await versionState(),before)
  const retry = await versionSave(versionPayload('draft-resolution.docx','version-draft-1','draft'))
  assert.equal(retry.id,firstDraft.id)
  assert.equal(retry.deduplicated,true)
  await storageFile('ready-resolution.docx')
  readyCopy = await versionSave(versionPayload('ready-resolution.docx','version-final-2','final',firstDraft))
  assert.equal(readyCopy.attorney_version_root_id,firstDraft.id)
  assert.equal(readyCopy.attorney_version_number,2)
  assert.equal(readyCopy.attorney_version_previous_id,firstDraft.id)
  assert.deepEqual(await versionState(),before)
})
await test('a signed copy joins its exact request and requirement; new drafts keep accepted evidence in place', async () => {
  await storageFile('signed-resolution.pdf')
  signedCopy = await versionSave(versionPayload('signed-resolution.pdf','version-signed-3','signed',readyCopy))
  assert.equal(signedCopy.attorney_version_number,3)
  assert.equal(signedCopy.attorney_version_root_id,firstDraft.id)
  assert.equal(signedCopy.visibility_scope,'client')
  assert.equal(signedCopy.client_recipient_role,'seller')
  assert.deepEqual(await versionState(), { requirement_status:'under_review',satisfied_by_document_id:signedCopy.id,
    request_status:'uploaded',requested_document_id:signedCopy.id })
  await reviewAttorneyDocumentRequest(client,{requestId:versionRequest.id,documentId:signedCopy.id,action:'approve',commandId:command()})
  const approved = await versionState()
  assert.equal(approved.requirement_status,'approved')
  await storageFile('revised-resolution.docx')
  revisedDraft = await versionSave(versionPayload('revised-resolution.docx','version-draft-4','draft',signedCopy))
  assert.equal(revisedDraft.attorney_version_number,4)
  assert.deepEqual(await versionState(),approved)
})
await test('replacement signed evidence requires a fresh review and old approval survives only in history', async () => {
  await storageFile('signed-revised-resolution.pdf')
  newSignedCopy = await versionSave(versionPayload('signed-revised-resolution.pdf','version-signed-5','signed',revisedDraft))
  assert.equal(newSignedCopy.attorney_version_number,5)
  assert.deepEqual(await versionState(), { requirement_status:'under_review',satisfied_by_document_id:newSignedCopy.id,
    request_status:'uploaded',requested_document_id:newSignedCopy.id })
  const legacy = (await db.query('select status,uploaded_document_id from transaction_required_documents where canonical_requirement_instance_id=$1',[versionRequirement])).rows[0]
  assert.equal(legacy.status,'under_review')
  assert.equal(legacy.uploaded_document_id,newSignedCopy.id)
  assert.equal((await db.query('select review_status from documents where id=$1',[signedCopy.id])).rows[0].review_status,'approved')
  assert.equal((await db.query('select count(*)::integer n from document_requirement_reviews where document_id=$1',[signedCopy.id])).rows[0].n,1)
  await assert.rejects(reviewAttorneyDocumentRequest(client,{requestId:versionRequest.id,documentId:signedCopy.id,action:'approve',commandId:command()}),/changed|replaced|no longer/i)
  const retry = await versionSave(versionPayload('signed-resolution.pdf','version-signed-3','signed',readyCopy))
  assert.equal(retry.id,signedCopy.id)
  assert.equal((await versionState()).satisfied_by_document_id,newSignedCopy.id)
  assert.equal((await db.query('select count(*)::integer n from documents where attorney_version_root_id=$1',[firstDraft.id])).rows[0].n,5)
})
await test('stale branches, changed identity, foreign matters and read-only lanes cannot create document versions', async () => {
  await storageFile('version-denied.pdf')
  const payload = versionPayload('version-denied.pdf','version-denied','signed',newSignedCopy)
  await assert.rejects(versionSave({...payload,attorney_version_previous_id:readyCopy.id}),/newer version/i)
  await assert.rejects(versionSave({...payload,lane_key:'bond'}),/previous version/i)
  await assert.rejects(versionSave({...payload,related_entity_id:null,related_entity_type:null}),/retain/i)
  await assert.rejects(versionSave({...payload,document_type:'other_type'}),/retain/i)
  await assert.rejects(versionSave({...payload,canonical_requirement_instance_id:requirement}),/does not match/i)
  await assert.rejects(persistAttorneyDocument(client,{document:{...payload,transaction_id:otherMatter},documentRequestId:null}),/permission/i)
  await db.exec('reset role')
  await db.query('update test_document_access set writable=false where lane=$1',['transfer_attorney'])
  await db.exec('set role authenticated')
  await assert.rejects(versionSave(payload),/permission/i)
  await db.exec('reset role')
  await db.query('update test_document_access set writable=true where lane=$1',['transfer_attorney'])
  await db.exec('set role authenticated')
  assert.equal((await db.query('select count(*)::integer n from documents where attorney_version_root_id=$1',[firstDraft.id])).rows[0].n,5)
})
await test('late activity failure rolls back evidence changes and version numbering together', async () => {
  await storageFile('version-rollback.pdf')
  const before = await versionState()
  await db.exec(`reset role; create function test_version_event_failure() returns trigger language plpgsql as $$begin
    if new.event_data->>'documentName'='version-rollback.pdf' then raise exception 'Version activity failed'; end if; return new; end;$$;
    create trigger test_version_event_failure before insert on transaction_events for each row execute function test_version_event_failure();
    set role authenticated;`)
  await assert.rejects(versionSave(versionPayload('version-rollback.pdf','version-rollback','signed',newSignedCopy)),/Version activity failed/)
  assert.deepEqual(await versionState(),before)
  assert.equal((await db.query('select count(*)::integer n from documents where upload_idempotency_key=$1',['version-rollback'])).rows[0].n,0)
  await db.exec('reset role; drop trigger test_version_event_failure on transaction_events; set role authenticated')
})
await test('saved versions cannot be overwritten or deleted and drafts cannot be linked through older endpoints', async () => {
  await db.exec(`reset role; grant update,delete,insert on documents to authenticated; grant update on document_requests to authenticated;
    create policy test_version_write on documents for all to authenticated using (true) with check (true);
    create policy test_request_write on document_requests for update to authenticated using (true) with check (true);
    set role authenticated`)
  await assert.rejects(db.query('update documents set file_path=$1 where id=$2',['replacement-path',firstDraft.id]),/cannot be overwritten/i)
  await assert.rejects(db.query('update documents set notes=$1 where id=$2',['Changed saved history',firstDraft.id]),/cannot be overwritten/i)
  await assert.rejects(db.query('delete from documents where id=$1',[firstDraft.id]),/must be retained/i)
  await assert.rejects(db.query('select bridge_link_document_to_canonical_requirement($1,$2,$3,$4)',[firstDraft.id,versionRequirement,'transferring_attorney',actor]),/documents_attorney_working_copy|cannot be overwritten/)
  await assert.rejects(db.query('update document_requests set requested_document_id=$1 where id=$2',[firstDraft.id,versionRequest.id]),/working copy/i)
  await assert.rejects(db.query('update documents set visibility_scope=$1,is_client_visible=true where id=$2',['client',firstDraft.id]),/cannot be overwritten/i)
  await db.exec('reset role')
  await assert.rejects(db.query('update document_requirement_instances set satisfied_by_document_id=$1 where id=$2',[firstDraft.id,versionRequirement]),/working copy cannot supply/i)
  await db.exec('reset role; set role anon')
  await assert.rejects(db.query('select bridge_save_attorney_document_version($1,$2)',[versionPayload('missing.pdf','anon-version','draft'),versionRequest.id]),/permission denied/i)
  await db.exec('reset role; set role authenticated')
})
await test('each attorney lane can save private drafting and a stale refresh does not change its saved result', async () => {
  for (const lane of ['transfer','bond','cancellation']) {
    const name = `working-${lane}.docx`
    await storageFile(name)
    const file = await persistAttorneyDocument(client,{document:{...document(name,`working-${lane}`,lane),canonical_requirement_instance_id:null,
      attorney_version_kind:'draft',related_entity_type:null,related_entity_id:null}})
    assert.equal(file.attorney_version_number,1)
    assert.equal(file.lane_key,lane)
    assert.equal(file.attorney_version_kind,'draft')
  }
})


await test('the actual drafting handler updates saved versions immediately and returns during a hung refresh', async () => {
  const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx',import.meta.url),'utf8')
  const start = source.indexOf('  async function handleSaveAttorneyDocumentVersion(form)')
  const body = source.slice(start,source.indexOf('\n  function canUseAttorneyRequestAction',start)).trim()
  let state = {transaction:{id:matter},documents:[]}
  let input
  const scope = {current:matter}
  const handler = vm.runInNewContext(`(${body})`,{
    transaction:{id:matter},currentMatterAccessKey:matter,workspaceRole:'attorney',liveMatterScopeRef:scope,
    workflowLanes:[{laneKey:'transfer',attorneyRole:'transfer_attorney',permissions:{canUploadDocuments:true}}],
    requiredDocumentRows:[{canonicalRequirementInstanceId:versionRequirement}],
    matterDocumentWorkspaceModel:{documentRequests:[{id:versionRequest.id,requestedFrom:'seller',visibility:'client_visible'}]},
    getAttorneyRequestUploadAudience, mergeSavedAttorneyDocumentVersion, refreshAfterDocumentSave,
    uploadDocument:async payload=>{ input=payload; return firstDraft },
    setData:update=>{state=update(state)},setDocumentActionMessage(){},setError(){},
    window:{dispatchEvent(){}},Event:class {},
    refreshTransactionDatasets:()=>new Promise(()=>{}),refreshCanonicalTransactionSnapshot:async()=>{},
  })
  const form={file:{name:'draft.docx'},attorneyLaneKey:'transfer',attorneyVersionKind:'draft',canonicalRequirementInstanceId:versionRequirement,documentType:'seller_authority',documentRequestId:versionRequest.id,visibilityScope:'client'}
  await handler(form)
  assert.equal(state.documents[0].id,firstDraft.id)
  assert.equal(input.visibilityScope,'internal')
  assert.equal(input.isClientVisible,false)
  assert.equal(input.clientRecipientRole,null)
  assert.equal(input.documentRequestId,versionRequest.id)
  scope.current=otherMatter
  state={transaction:{id:otherMatter},documents:[]}
  await handler(form)
  assert.equal(state.documents.length,0,'a completed save in a previous matter must not enter the new matter')
})
await test('the actual drafting handler preserves requested audiences and denies uneditable lanes before upload', async () => {
  const source = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx',import.meta.url),'utf8')
  const start = source.indexOf('  async function handleSaveAttorneyDocumentVersion(form)')
  const body = source.slice(start,source.indexOf('\n  function canUseAttorneyRequestAction',start)).trim()
  let input, uploads=0
  const handler = vm.runInNewContext(`(${body})`,{
    transaction:{id:matter},currentMatterAccessKey:matter,workspaceRole:'attorney',liveMatterScopeRef:{current:matter},
    workflowLanes:[{laneKey:'transfer',attorneyRole:'transfer_attorney',permissions:{canUploadDocuments:true}}],requiredDocumentRows:[{canonicalRequirementInstanceId:versionRequirement}],
    matterDocumentWorkspaceModel:{documentRequests:[{id:versionRequest.id,requestedFrom:'seller',visibility:'client_visible'}]},
    getAttorneyRequestUploadAudience,mergeSavedAttorneyDocumentVersion,refreshAfterDocumentSave,
    uploadDocument:async payload=>{uploads++;input=payload;return signedCopy},setData(){},setDocumentActionMessage(){},setError(){},
    window:{dispatchEvent(){}},Event:class {},refreshTransactionDatasets:async()=>{throw new Error('Offline refresh')},refreshCanonicalTransactionSnapshot:async()=>{},
  })
  const form={file:{name:'signed.pdf'},attorneyLaneKey:'transfer',attorneyVersionKind:'signed',canonicalRequirementInstanceId:versionRequirement,documentType:'seller_authority',documentRequestId:versionRequest.id,visibilityScope:'client',clientRecipientRole:'buyer'}
  await handler(form)
  assert.equal(input.visibilityScope,'client')
  assert.equal(input.clientRecipientRole,'seller','request recipient must win over a changed drafting form audience')
  assert.equal(input.isClientVisible,true)
  await assert.rejects(handler({...form,attorneyLaneKey:'bond'}),/does not allow/i)
  assert.equal(uploads,1)
  await assert.rejects(handler({...form,canonicalRequirementInstanceId:otherMatter}),/available checklist/i)
  assert.equal(uploads,1)
})


await test('signed versions without a request require review even for an otherwise upload-only definition', async () => {
  const id=command()
  await db.exec('reset role')
  await db.exec("insert into document_definitions values ('external_signed_document',false)")
  await db.query(`insert into document_requirement_instances(id,transaction_id,context_type,document_definition_key,status,reviewer_role,requested_from_role)
    values ($1,$2,'transaction','external_signed_document','pending','transferring_attorney','seller')`,[id,matter])
  await db.query(`insert into transaction_required_documents(transaction_id,canonical_requirement_instance_id,document_key,status)
    values ($1,$2,'external_signed_document','missing')`,[matter,id])
  await db.exec('set role authenticated')
  await storageFile('external-signed-no-request.pdf')
  const payload={...document('external-signed-no-request.pdf','signed-no-request'),canonical_requirement_instance_id:id,
    document_type:'external_signed_document',attorney_version_kind:'signed'}
  const first=await persistAttorneyDocument(client,{document:payload})
  assert.equal(first.review_status,'under_review')
  assert.equal((await db.query('select status from document_requirement_instances where id=$1',[id])).rows[0].status,'under_review')
  await reviewAttorneyDocument(client,{requirementInstanceId:id,documentId:first.id,action:'approve',actorRole:'transferring_attorney',commandId:command()})
  await storageFile('external-signed-no-request-revised.pdf')
  const next=await persistAttorneyDocument(client,{document:{...payload,name:'external-signed-no-request-revised.pdf',file_path:`transaction-${matter}/external-signed-no-request-revised.pdf`,
    upload_idempotency_key:'signed-no-request-revised',attorney_version_previous_id:first.id}})
  assert.equal(next.review_status,'under_review')
  const legacy=(await db.query('select status,verified_at from transaction_required_documents where canonical_requirement_instance_id=$1',[id])).rows[0]
  assert.equal(legacy.status,'under_review')
  assert.equal(legacy.verified_at,null)
  assert.equal((await db.query('select review_status from documents where id=$1',[first.id])).rows[0].review_status,'approved')
})
await test('additional requested drafting keeps the request open until evidence arrives, then preserves review and replacement history', async () => {
  const request=(await requestAttorneyDocuments(client,{transactionId:matter,requests:[{...row,title:'Additional undertaking',document_type:'undertaking',canonical_requirement_instance_id:null}],commandId:command()}))[0]
  const payload=(name,key,kind,previous=null)=>({...document(name,key),document_type:'undertaking',canonical_requirement_instance_id:null,
    attorney_version_kind:kind,attorney_version_previous_id:previous?.id || null})
  const save=input=>persistAttorneyDocument(client,{document:input,documentRequestId:request.id})
  await storageFile('undertaking.docx')
  const draft=await save(payload('undertaking.docx','undertaking-draft','draft'))
  assert.equal((await db.query('select status from document_requests where id=$1',[request.id])).rows[0].status,'requested')
  await storageFile('undertaking-signed.pdf')
  const signed=await save(payload('undertaking-signed.pdf','undertaking-signed','signed',draft))
  assert.equal((await db.query('select requested_document_id from document_requests where id=$1',[request.id])).rows[0].requested_document_id,signed.id)
  await reviewAttorneyDocumentRequest(client,{requestId:request.id,documentId:signed.id,action:'approve',commandId:command()})
  await storageFile('undertaking-revision.docx')
  const revision=await save(payload('undertaking-revision.docx','undertaking-revision','draft',signed))
  assert.equal((await db.query('select status from document_requests where id=$1',[request.id])).rows[0].status,'completed')
  await storageFile('undertaking-final.pdf')
  const revisedSigned=await save(payload('undertaking-final.pdf','undertaking-final','signed',revision))
  assert.equal(revisedSigned.attorney_version_number,4)
  assert.equal((await db.query('select status from document_requests where id=$1',[request.id])).rows[0].status,'uploaded')
  await assert.rejects(reviewAttorneyDocumentRequest(client,{requestId:request.id,documentId:signed.id,action:'approve',commandId:command()}),/no longer/i)
  assert.equal((await db.query('select review_status from documents where id=$1',[signed.id])).rows[0].review_status,'approved')
})

await test('private document retries and predecessors cannot bypass a revoked source read', async () => {
  await db.exec('reset role')
  const boundaries = await migration('20261004102741_attorney_internal_workspace_boundaries')
  const start = boundaries.indexOf('do $private_document_actions$')
  const end = boundaries.indexOf('$private_document_actions$;', start) + '$private_document_actions$;'.length
  await db.exec(boundaries.slice(start, end))
  // Simulate a source record becoming unavailable after team/firm changes.
  // The permission suite exercises the real source RLS with distinct firms.
  await db.exec(`alter function document_security.can_read(public.documents) rename to can_read_before_revocation_probe;
    create function document_security.can_read(d public.documents) returns boolean language sql stable security definer set search_path='' as $$
      select d.id::text is distinct from current_setting('test.denied_private_document',true)
        and document_security.can_read_before_revocation_probe(d)$$;`)
  const before = (await db.query('select count(*)::int n from documents')).rows[0].n
  await db.query("select set_config('test.denied_private_document',$1,false)",[firstDraft.id])
  await db.exec('set role authenticated')
  await assert.rejects(versionSave(versionPayload('draft-resolution.docx','version-draft-1','draft')), /no longer available/)
  await storageFile('denied-private-predecessor.docx')
  await assert.rejects(versionSave(versionPayload('denied-private-predecessor.docx','private-predecessor-probe','draft',firstDraft)), /previous version is not available/)
  await db.exec('reset role')
  const ordinary = (await db.query("select * from documents where upload_idempotency_key=$1",['upload-1'])).rows[0]
  assert.ok(ordinary)
  await db.query("select set_config('test.denied_private_document',$1,false)",[ordinary.id])
  await db.exec('set role authenticated')
  await assert.rejects(persistAttorneyDocument(client,{document:{...ordinary,attorney_version_kind:null}}), /no longer available/)
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from documents')).rows[0].n,before,'denied actions write no document metadata')
  await db.query("select set_config('test.denied_private_document','',false)")
})

await db.close()
