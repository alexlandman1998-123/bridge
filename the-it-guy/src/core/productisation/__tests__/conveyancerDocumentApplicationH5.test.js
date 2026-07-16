import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  buildConveyancerDocumentReviewRequest,
  loadConveyancerDocumentApplicationSummary,
  reviewConveyancerDocumentArtifact,
  runConveyancerDocumentApplicationCommand,
} from '../conveyancerDocumentApplicationH5.js'

const migration = readFileSync(new URL('../../../../../supabase/migrations/20260716180001_conveyancer_h5_document_application.sql', import.meta.url), 'utf8')
const ids = { organisationId: '10000000-0000-4000-8000-000000000001', attorneyFirmId: '20000000-0000-4000-8000-000000000001', transactionId: '30000000-0000-4000-8000-000000000001', artifactId: '40000000-0000-4000-8000-000000000001' }
const review = { ...ids, idempotencyKey: 'review:artifact:1', expectedFingerprint: 'fingerprint:source', reviewFingerprint: 'fingerprint:review', decision: 'approve', reason: 'Checked against the signed originals.', reviewedAt: '2026-07-16T12:00:00.000Z' }

assert.equal(buildConveyancerDocumentReviewRequest(review).ok, true)
assert.deepEqual(buildConveyancerDocumentReviewRequest({ ...review, decision: 'approve', reason: '' }).errors, ['document_review_decision_invalid'])

const reviewCalls = []
const reviewed = await reviewConveyancerDocumentArtifact({ rpc: async (name, args) => { reviewCalls.push({ name, args }); return { data: { decision: 'approved', artifactId: 'artifact:revision:2' }, error: null } } }, review)
assert.equal(reviewed.ok, true)
assert.deepEqual(reviewCalls.map((call) => call.name), ['bridge_review_conveyancer_document_artifact_h5'])

const control = { organisationId: ids.organisationId, attorneyFirmId: ids.attorneyFirmId, mode: 'pilot', allowedOperations: ['manual_upload'], allowedAdapters: ['manual'], pilotTransactionIds: [ids.transactionId], killSwitchEnabled: false, reason: 'H5 pilot' }
const command = { commandId: 'manual:1', operation: 'manual_upload', adapter: 'manual', ...ids, documentType: 'authority_document', requestedAt: '2026-07-16T12:00:00.000Z', source: { capturedByUserId: 'user:1' }, artifact: { bucket: 'matter-documents', path: 'matter/authority.pdf', mimeType: 'application/pdf', contentHash: `sha256:${'a'.repeat(64)}` }, humanReleaseApproved: false }
const rpcCalls = []
const executed = await runConveyancerDocumentApplicationCommand({ rpc: async (name) => { rpcCalls.push(name); if (name.includes('enqueue')) return { data: { jobId: 'job:1' }, error: null }; if (name.includes('claim')) return { data: { ok: true }, error: null }; return { data: { ok: true, artifactId: 'artifact:1' }, error: null } } }, { control, command, adapters: { manual: { execute: async (value) => ({ ok: true, completedAt: value.requestedAt, artifact: value.artifact }) } } })
assert.equal(executed.reviewRequired, true)
assert.equal(executed.nextStep, 'review_document')
assert.deepEqual(rpcCalls, ['bridge_enqueue_conveyancer_document_job', 'bridge_claim_conveyancer_document_job', 'bridge_complete_conveyancer_document_job'])

function query(rows) {
  const chain = { select: () => chain, eq: () => chain, order: () => chain, limit: async () => ({ data: rows, error: null }) }
  return chain
}
const tableRows = {
  conveyancer_document_pipeline_controls: [{ organisation_id: ids.organisationId, attorney_firm_id: ids.attorneyFirmId, mode: 'pilot', allowed_operations: ['manual_upload'], allowed_adapters: ['manual'], pilot_transaction_ids: [ids.transactionId], kill_switch_enabled: false, reason: 'pilot' }],
  conveyancer_document_jobs: [{ id: 'job:1', operation: 'manual_upload', status: 'succeeded', created_at: '2026-07-16T12:00:00Z' }],
  conveyancer_document_artifacts: [{ id: ids.artifactId, record_id: 'record:1', revision: 1, lifecycle_status: 'under_review', fingerprint: 'fingerprint:1' }],
  conveyancer_signing_records: [], conveyancer_document_review_events: [],
}
const summary = await loadConveyancerDocumentApplicationSummary({ from: (table) => query(tableRows[table] || []) }, ids)
assert.equal(summary.counts.awaiting_review, 1)
assert.equal(summary.manualFallbackAvailable, true)

for (const fragment of ['conveyancer_document_review_events', 'bridge_review_conveyancer_document_artifact_h5', 'H5 signed-pack object binding is invalid', "'accepted'", "'rejected'", 'bridge_conveyancer_reject_mutation']) assert.match(migration, new RegExp(fragment))
assert.doesNotMatch(migration, /grant (insert|update|delete).*conveyancer_document_review_events.*authenticated/i)

console.log('H5 conveyancer document application tests passed.')
