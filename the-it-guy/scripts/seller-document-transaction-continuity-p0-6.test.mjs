import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { randomUUID } from 'node:crypto'
import { buildSellerDocumentTransactionContinuityReport } from '../src/lib/sellerDocumentTransactionContinuity.js'

const healthy = {
  private_listing_document_id: 'source-1',
  private_listing_id: 'listing-1',
  transaction_id: 'transaction-1',
  promoted_transaction_id: 'transaction-1',
  promoted_document_id: 'shared-1',
  source_status: 'approved',
  promoted_status: 'approved',
  continuity_health: 'healthy',
}
const pending = {
  ...healthy,
  private_listing_document_id: 'source-2',
  transaction_id: null,
  promoted_transaction_id: null,
  promoted_document_id: null,
  source_status: 'uploaded',
  continuity_health: 'pending',
  continuity_issue: 'transaction_not_created',
  required_action: 'wait_for_transaction_creation',
}
const blocked = {
  ...healthy,
  private_listing_document_id: 'source-3',
  promoted_document_id: null,
  continuity_health: 'blocked',
  continuity_issue: 'promotion_missing',
  required_action: 'promote_seller_document',
}

const pass = buildSellerDocumentTransactionContinuityReport([healthy], { generatedAt: '2026-07-17T12:00:00Z' })
assert.equal(pass.version, 'seller_document_transaction_continuity_p0_6_v1')
assert.equal(pass.gate.status, 'pass')
assert.equal(pass.gate.attorneyHandoffReady, true)
assert.equal(pass.summary.approvedSourceCount, 1)

const warning = buildSellerDocumentTransactionContinuityReport([healthy, pending])
assert.equal(warning.gate.status, 'warning')
assert.deepEqual(warning.pendingDocumentIds, ['source-2'])

const failure = buildSellerDocumentTransactionContinuityReport([healthy, blocked])
assert.equal(failure.gate.status, 'blocked')
assert.equal(failure.gate.attorneyHandoffReady, false)
assert.deepEqual(failure.blockingDocumentIds, ['source-3'])
assert.deepEqual(failure.affectedTransactionIds, ['transaction-1'])

const migration = await readFile(
  new URL('../../supabase/migrations/202607170012_seller_document_transaction_continuity_p0_6.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  'source_canonical_requirement_instance_id',
  'seller_document_transaction_continuity_v2',
  'bridge_sync_seller_document_transaction_continuity_p0_6',
  'bridge_promote_listing_documents_from_transaction_p0_6',
  'bridge_satisfy_new_transaction_seller_request_p0_6',
  'bridge_satisfy_new_transaction_required_document_p0_6',
  'bridge_upload_private_listing_seller_document_p0_4',
  "'promotion', v_promotion",
  "array['attorney_instruction_ready']",
  'transaction_requirement_instance_id',
  'source_approval_status',
  'promoted_status_mismatch',
  'approved_requirement_not_satisfied_in_transaction',
  'approved_document_re_requested',
  'on conflict (transaction_id, source, source_document_id) do update',
]) {
  assert.ok(migration.toLowerCase().includes(marker.toLowerCase()), `P0-6 migration must include ${marker}`)
}

const cli = await readFile(new URL('./audit-seller-document-transaction-continuity.mjs', import.meta.url), 'utf8')
assert.match(cli, /--confirm-repair/)
assert.match(cli, /--listing-id=<uuid>/)
assert.match(cli, /--strict/)
assert.match(cli, /SUPABASE_STAGING_URL/)
assert.match(cli, /Refusing seller-document staging audit/)

const runbook = await readFile(new URL('../docs/seller-document-transaction-continuity-p0-6.md', import.meta.url), 'utf8')
assert.match(runbook, /does not satisfy attorney readiness/)
assert.match(runbook, /cannot be requested again/)
assert.match(runbook, /never duplicates the underlying uploaded file/)

const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageSource, /test:seller-document-continuity-p0-6/)
assert.match(packageSource, /audit:seller-document-continuity/)

// Execute the already-deployed audience guard against an older hidden upload.
// The repair must preserve its exact listing, object and seller-only recipient.
const db = new PGlite()
try {
  await db.exec(`
    create role anon; create role authenticated; create schema document_security;
    create table transactions(id uuid primary key, listing_id uuid);
    create table private_listing_documents(id uuid primary key, private_listing_id uuid, storage_path text, visibility text);
    create table documents(id uuid primary key, transaction_id uuid, source text, uploaded_by_party text, source_document_id uuid, file_path text, file_bucket text, visibility_scope text, client_recipient_role text, is_client_visible boolean);
  `)
  const listing = randomUUID(), transaction = randomUUID(), source = randomUUID(), document = randomUUID()
  await db.query('insert into transactions values ($1,$2)', [transaction,listing])
  await db.query("insert into private_listing_documents values ($1,$2,'fixture/mandate.pdf','seller_visible')", [source,listing])
  await db.query("insert into documents values ($1,$2,'seller_portal','seller',$3,'fixture/mandate.pdf','documents','internal',null,false)",[document,transaction,source])
  const audience = await readFile(new URL('../../supabase/migrations/20261104084343_seller_upload_document_audience.sql', import.meta.url), 'utf8')
  await db.exec(audience)
  // Installation deliberately does not rewrite historical files.
  assert.equal((await db.query('select visibility_scope from documents')).rows[0].visibility_scope,'internal')
  for (let attempt=0;attempt<2;attempt++) {
    await db.query("update documents set visibility_scope='shared',client_recipient_role='seller',is_client_visible=true where id=$1",[document])
    const row=(await db.query('select * from documents where id=$1',[document])).rows[0]
    assert.equal(row.visibility_scope,'shared')
    assert.equal(row.client_recipient_role,'seller')
    assert.equal(row.is_client_visible,true)
    assert.equal(row.file_path,'fixture/mandate.pdf')
    assert.equal(row.source_document_id,source)
  }
  // Subsequent promotion's legacy internal default cannot hide the source again.
  await db.query("update documents set visibility_scope='internal',client_recipient_role=null,is_client_visible=false where id=$1",[document])
  assert.equal((await db.query('select visibility_scope from documents where id=$1',[document])).rows[0].visibility_scope,'shared')
  // A wrong file, another listing, private source or wrong bucket cannot gain access.
  for (const mismatch of ['object','listing','private','bucket','source']) {
    await db.query("update private_listing_documents set private_listing_id=$1,visibility=$2 where id=$3",[mismatch==='listing'?randomUUID():listing,mismatch==='private'?'internal':'seller_visible',source])
    const id=randomUUID()
    await db.query("insert into documents values($1,$2,$3,'seller',$4,$5,$6,'internal',null,false)",[id,transaction,mismatch==='source'?'unrelated':'seller_portal',source,mismatch==='object'?'fixture/other.pdf':'fixture/mandate.pdf',mismatch==='bucket'?'another-bucket':'documents'])
    const row=(await db.query('select * from documents where id=$1',[id])).rows[0]
    assert.equal(row.visibility_scope,'internal')
    assert.equal(row.is_client_visible,false)
  }
  console.log('seller document transaction continuity and audience repair tests passed')
} finally { await db.close() }
