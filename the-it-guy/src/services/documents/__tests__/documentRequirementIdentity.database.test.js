import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { documentRequirementIdentity, documentRequirementLabel, effectiveDocumentRequirements } from '../../../core/documents/documentRequirementIdentity.js'

// Isolated PostgreSQL; no credentials, hosted database, storage or mail calls.
const db = new PGlite()
after(() => db.close())
const sql = async (name) => readFile(new URL(`../../../../../supabase/migrations/${name}.sql`, import.meta.url), 'utf8')
const actor = randomUUID(), org = randomUUID(), buyerLead = randomUUID(), sellerLead = randomUUID(), listing = randomUUID()
const transaction = randomUUID(), otherTransaction = randomUUID(), foreignTransaction = randomUUID()
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role', true) $$;
  create table transactions(id uuid primary key, organisation_id uuid, originating_buyer_lead_id uuid, originating_lead_id uuid, private_listing_id uuid);
  create table private_listings(id uuid primary key, organisation_id uuid, seller_lead_id text, originating_crm_lead_id text);
  create table leads(lead_id uuid primary key, organisation_id uuid, lead_category text);
  create function bridge_has_transaction_permission(uuid,text) returns boolean language sql as $$ select $1 = '${transaction}'::uuid and auth.uid() = '${actor}'::uuid and coalesce(current_setting('test.transaction_access', true), 'allowed') <> 'denied' $$;
  create function bridge_can_access_transaction_spine(uuid) returns boolean language sql as $$ select false $$;
  create function bridge_can_access_private_listing(uuid) returns boolean language sql as $$ select auth.uid() = '${actor}'::uuid and coalesce(current_setting('test.source_access', true), 'allowed') <> 'denied' $$;
  create function bridge_can_access_assignment(uuid,uuid,uuid) returns boolean language sql as $$ select auth.uid() = '${actor}'::uuid and coalesce(current_setting('test.source_access', true), 'allowed') <> 'denied' $$;
`)
// gen_random_uuid is built into PostgreSQL; PGlite does not need pgcrypto.
await db.exec((await sql('202605250001_canonical_document_system_phase1')).replace('create extension if not exists "pgcrypto";', ''))
await db.exec(await sql('202605250005_canonical_document_lifecycle_phase6'))
const migration = await sql('20261011112703_flexible_document_requirement_identity')
await db.exec(migration)
await db.query('insert into leads values ($1,$2,$3),($4,$2,$5)', [buyerLead, org, 'buyer', sellerLead, 'seller'])
await db.query('insert into private_listings values ($1,$2,$3,null)', [listing, org, sellerLead])
await db.query('insert into transactions values ($1,$2,$3,null,$4),($5,$2,$3,null,$4),($6,$7,$3,null,$4)', [transaction, org, buyerLead, listing, otherTransaction, foreignTransaction, randomUUID()])
await db.query(`select set_config('request.jwt.claim.sub',$1,false), set_config('request.jwt.claim.role','authenticated',false)`, [actor])

async function add({ contextType = 'transaction', contextId = transaction, definition = null, label = 'Additional SARS correspondence', origin = 'manual', contact = null, subjectKind = 'party', subjectId = null, role = 'buyer', status = 'pending', fileId = null } = {}) {
  const result = await db.query(`insert into document_requirement_instances
    (context_type,context_id,transaction_id,document_definition_key,custom_label,requirement_origin,
     subject_kind,subject_id,requested_from_contact_id,requested_from_role,pack_key,requirement_level,status,source_system,satisfied_by_document_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'buyer_identity_fica','required',$11,$12,$13) returning *`,
  [contextType, contextId, contextType === 'transaction' ? contextId : null, definition, definition ? null : label, origin, subjectKind, subjectId, contact, role, status, origin === 'manual' ? 'manual' : 'transaction_canonical_document_requirement_engine', fileId])
  return result.rows[0]
}
const read = async (id) => (await db.query('select * from document_requirement_instances where id=$1', [id])).rows[0]
const remove = (id, reason = 'Not relevant to this matter') => db.query(`update document_requirement_instances set applicability_override='removed', override_reason=$2, override_actor_id=$3 where id=$1`, [id, reason, actor])
const generated = (contact = null) => ({ document_definition_key: 'buyer_id_document', requested_from_role: 'buyer', requested_from_contact_id: contact })
const sync = async (rows, id = transaction) => (await db.query('select bridge_sync_transaction_document_requirement_instances($1,$2::jsonb) result', [id, JSON.stringify(rows)])).rows[0].result

test('custom names have distinct stable identities for each person, entity and property without changing the catalogue', async () => {
  const before = (await db.query('select count(*) n from document_definitions')).rows[0].n
  const person1 = randomUUID(), person2 = randomUUID()
  const first = await add({ label: 'Divorce papers', contact: person1, subjectKind: 'person', subjectId: person1 })
  const second = await add({ label: 'Divorce papers', contact: person2, subjectKind: 'person', subjectId: person2 })
  const entity = await add({ subjectKind: 'entity', subjectId: randomUUID() })
  const property = await add({ subjectKind: 'property', subjectId: listing, role: 'seller' })
  assert.notEqual(documentRequirementIdentity(first), documentRequirementIdentity(second))
  assert.equal(documentRequirementLabel(await read(first.id)), 'Divorce papers')
  assert.equal((await read(entity.id)).subject_id, entity.subject_id)
  assert.equal((await read(property.id)).subject_id, listing)
  assert.equal((await db.query('select count(*) n from document_definitions')).rows[0].n, before)
  await assert.rejects(add({ label: '   ' }), /custom_label_check/)
  await assert.rejects(add({ subjectKind: 'person', subjectId: person1, contact: person2 }), /exact contact/)
  await assert.rejects(add({ subjectKind: 'entity' }), /subject_check/)
  await assert.rejects(db.query('update document_requirement_instances set id=$2 where id=$1', [first.id, randomUUID()]), /immutable/)
})

test('removal survives database regeneration and reload, reserves identity and retains exact file/review history', async () => {
  const contact = randomUUID(), file = randomUUID()
  const requirement = await add({ definition: 'buyer_id_document', origin: 'matrix', contact, status: 'approved', fileId: file })
  await db.query(`insert into document_requirement_reviews(requirement_instance_id,document_id,review_status) values ($1,$2,'approved')`, [requirement.id, file])
  await assert.rejects(remove(requirement.id, ''), /override_check/)
  await remove(requirement.id)
  const result = await sync([generated(contact)])
  const saved = await read(requirement.id)
  assert.equal(saved.status, 'not_applicable')
  assert.equal(saved.status_before_removal, 'approved')
  assert.equal(saved.satisfied_by_document_id, file)
  assert.equal(saved.override_reason, 'Not relevant to this matter')
  assert(!result.instances.some((row) => row.id === requirement.id))
  assert(result.allInstances.some((row) => row.id === requirement.id))
  await assert.rejects(add({ definition: 'buyer_id_document', origin: 'matrix', contact }), /unique/)
  await db.query("update document_requirement_instances set status='pending' where id=$1", [requirement.id])
  assert.equal((await read(requirement.id)).status, 'not_applicable')
  await db.query('update document_requirement_instances set applicability_override=null where id=$1', [requirement.id])
  assert.equal((await read(requirement.id)).status, 'approved')
  assert.equal((await db.query('select count(*) n from document_requirement_reviews where requirement_instance_id=$1', [requirement.id])).rows[0].n, 1)
  const events = (await db.query('select metadata_json from document_requirement_events where requirement_instance_id=$1 order by created_at', [requirement.id])).rows
  assert.equal(events.length, 2)
  assert.equal(events[0].metadata_json.source, 'manual_applicability')
})

test('manual additions survive unmatched rules, while ordinary unmatched matrix requirements still deactivate', async () => {
  const manual = await add({ definition: 'proof_of_funds' })
  const matrix = await add({ definition: 'bond_approval', origin: 'matrix' })
  const custom = await add()
  await sync([generated(randomUUID())])
  assert.equal((await read(manual.id)).status, 'pending')
  assert.equal((await read(custom.id)).status, 'pending')
  assert.equal((await read(matrix.id)).status, 'not_applicable')
  const old = await add({ definition: 'buyer_id_document', origin: 'matrix', contact: randomUUID(), status: 'not_applicable' })
  await sync([generated(old.requested_from_contact_id)])
  assert.equal((await read(old.id)).status, 'pending')
})

test('buyer lead, seller lead and listing handover retain IDs, ownership, removed decisions and links; retries are harmless', async () => {
  const buyer = await add({ contextType: 'buyer_lead', contextId: buyerLead })
  const seller = await add({ contextType: 'seller_lead', contextId: sellerLead, role: 'seller' })
  const source = await add({ contextType: 'private_listing', contextId: listing, role: 'seller' })
  const removedStandard = await add({ contextType: 'buyer_lead', contextId: buyerLead, definition: 'buyer_id_document', origin: 'matrix', contact: randomUUID() })
  await remove(removedStandard.id)
  await remove(source.id)
  await db.exec("select set_config('test.source_access','denied',false)")
  await assert.rejects(sync([generated(randomUUID())]), /Not authorised to hand over/)
  assert.equal((await read(buyer.id)).context_type, 'buyer_lead')
  await db.exec("select set_config('test.source_access','allowed',false)")
  await db.exec('set role authenticated')
  try { await sync([generated(randomUUID())]) } finally { await db.exec('reset role') }
  for (const requirement of [buyer, seller, source]) {
    const saved = await read(requirement.id)
    assert.equal(saved.context_id, transaction)
    assert.equal(saved.transaction_id, transaction)
    assert.equal(saved.custom_label, requirement.custom_label)
    assert.equal(saved.requested_from_role, requirement.requested_from_role)
    const contexts = (await db.query('select context_type,context_id from document_requirement_context_links where requirement_instance_id=$1', [requirement.id])).rows
    assert.equal(contexts.length, 2)
    assert(contexts.some((row) => row.context_type === requirement.context_type && row.context_id === requirement.context_id))
  }
  assert.equal((await read(source.id)).applicability_override, 'removed')
  await db.exec('set role authenticated')
  try {
    const originRows = (await db.query('select bridge_read_document_requirements_for_reconciliation($1,$2) result', ['buyer_lead', buyerLead])).rows[0].result
    assert(originRows.some(row => row.id === buyer.id && row.context_id === transaction))
    assert(originRows.some(row => row.id === removedStandard.id && row.applicability_override === 'removed'))
    await assert.rejects(db.query('select bridge_read_document_requirements_for_reconciliation($1,$2)', ['transaction', otherTransaction]), /Not authorised/)
  } finally { await db.exec('reset role') }
  assert.equal((await db.query('select bridge_handoff_manual_document_requirements($1) n', [transaction])).rows[0].n, 0)
  assert.equal((await db.query('select bridge_handoff_manual_document_requirements($1) n', [otherTransaction])).rows[0].n, 0)
  assert.equal(effectiveDocumentRequirements([await read(source.id)]).length, 0)
  await db.exec("select set_config('test.transaction_access','denied',false); set role authenticated")
  try {
    await assert.rejects(db.query('select bridge_read_document_requirements_for_reconciliation($1,$2)', ['buyer_lead', buyerLead]), /Not authorised to reconcile the linked/)
  } finally {
    await db.exec("reset role; select set_config('test.transaction_access','allowed',false)")
  }
})

test('handover checks source organisation and roles and rolls back instead of merging conflicting identities', async () => {
  const buyer = await add({ contextType: 'buyer_lead', contextId: buyerLead })
  const wrongParty = await add({ contextType: 'buyer_lead', contextId: buyerLead, role: 'seller' })
  assert.equal((await db.query('select bridge_handoff_manual_document_requirements($1) n', [foreignTransaction])).rows[0].n, 0)
  assert.equal((await read(buyer.id)).context_type, 'buyer_lead')
  const contact = randomUUID()
  const existing = await add({ definition: 'buyer_id_document', origin: 'matrix', contact })
  const duplicate = await add({ contextType: 'buyer_lead', contextId: buyerLead, definition: 'buyer_id_document', contact, subjectKind: 'person', subjectId: contact })
  await assert.rejects(sync([generated(contact)]), /identity reconciliation/)
  assert.equal((await read(duplicate.id)).context_type, 'buyer_lead')
  assert.equal((await read(buyer.id)).context_type, 'buyer_lead')
  assert.equal((await read(wrongParty.id)).context_type, 'buyer_lead')
  assert.equal((await read(existing.id)).context_type, 'transaction')
})

test('browser roles cannot mutate the foundation, read context links or invoke internal handover', async () => {
  await db.exec('grant usage on schema auth to authenticated; set role authenticated')
  try {
    await assert.rejects(db.query('select * from document_requirement_context_links'), /permission denied/)
    await assert.rejects(db.query('select bridge_handoff_manual_document_requirements($1)', [transaction]), /permission denied/)
    await assert.rejects(add(), /permission denied/)
    await assert.rejects(sync([generated()], otherTransaction), /not authorised/)
  } finally { await db.exec('reset role') }
  await db.exec('set role anon')
  try {
    await assert.rejects(sync([generated()]), /permission denied/)
    await assert.rejects(db.query('select * from document_requirement_context_links'), /permission denied/)
    await assert.rejects(db.query('select bridge_read_document_requirements_for_reconciliation($1,$2)', ['buyer_lead', buyerLead]), /permission denied/)
  } finally { await db.exec('reset role') }
  const security = (await db.query("select relrowsecurity from pg_class where oid='public.document_requirement_context_links'::regclass")).rows[0]
  assert.equal(security.relrowsecurity, true)
})
