import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildStagingLinkProjectionCleanupPlan,
    writeStagingLinkProjectionCleanupPlan,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentStagingLinkCleanupService.js')

  const canonicalInstances = [
    {
      id: 'req-buyer',
      document_definition_key: 'buyer_id_document',
      context_type: 'transaction',
      context_id: 'tx-1',
      transaction_id: 'tx-1',
      pack_key: 'buyer_identity_fica',
      requirement_level: 'required',
      status: 'approved',
      satisfied_by_document_id: 'doc-buyer',
      visible_to_roles: ['buyer', 'agent'],
      uploadable_by_roles: ['buyer'],
      requested_from_role: 'buyer',
    },
    {
      id: 'req-otp',
      document_definition_key: 'signed_otp',
      context_type: 'transaction',
      context_id: 'tx-1',
      transaction_id: 'tx-1',
      pack_key: 'attorney_generated_documents',
      requirement_level: 'blocker',
      status: 'uploaded',
      satisfied_by_document_id: 'doc-otp',
      visible_to_roles: ['buyer', 'seller', 'agent'],
      uploadable_by_roles: ['buyer', 'seller'],
      requested_from_role: 'client',
    },
    {
      id: 'req-transfer',
      document_definition_key: 'signed_transfer_documents',
      context_type: 'transaction',
      context_id: 'tx-1',
      transaction_id: 'tx-1',
      pack_key: 'attorney_generated_documents',
      requirement_level: 'blocker',
      status: 'requested',
      satisfied_by_document_id: null,
      visible_to_roles: ['buyer', 'seller', 'agent'],
      uploadable_by_roles: ['buyer', 'seller'],
      requested_from_role: 'client',
    },
  ]

  const plan = buildStagingLinkProjectionCleanupPlan({
    canonicalInstances,
    transactionRequiredDocuments: [
      { id: 'legacy-otp', transaction_id: 'tx-1', document_key: 'otp', canonical_requirement_instance_id: 'req-otp' },
    ],
    documents: [
      { id: 'doc-buyer', transaction_id: 'tx-1', document_type: 'buyer_fica', status: 'approved', created_at: '2026-05-01T00:00:00Z' },
      { id: 'doc-otp', transaction_id: 'tx-1', document_type: 'signed_otp', status: 'uploaded', created_at: '2026-05-02T00:00:00Z' },
      { id: 'doc-note', transaction_id: 'tx-1', document_type: 'internal_note', status: 'uploaded' },
      { id: 'doc-final', transaction_id: null, document_type: 'final_signed_packet', status: 'uploaded' },
    ],
    documentRequests: [
      { id: 'request-transfer', transaction_id: 'tx-1', document_type: 'signed_transfer_pack', status: 'requested' },
    ],
    reminders: [],
    packetVersions: [],
  })

  assert.equal(plan.summary.documentLinkCount, 2)
  assert.equal(plan.summary.generatedArtifactLinkCount, 1)
  assert.equal(plan.summary.documentRequestLinkCount, 1)
  assert.equal(plan.summary.legacyProjectionCreateCount, 2)
  assert.equal(plan.manualReview.some((item) => item.sourceId === 'doc-note' && item.reason === 'internal_only_document_type'), true)
  assert.equal(plan.manualReview.some((item) => item.sourceId === 'doc-final' && item.reason === 'missing_transaction_context'), true)
  assert.equal(plan.documentLinks.every((item) => item.confidence === 95), true)
  assert.equal(plan.documentRequestLinks[0].reminderType, 'missing_blocker_documents')

  const writeDryRun = await writeStagingLinkProjectionCleanupPlan({ plan, write: false })
  assert.equal(writeDryRun.dryRun, true)
  assert.equal(writeDryRun.documentsLinked, 0)

  console.log('canonical-document-staging-link-cleanup tests passed')
} finally {
  await server.close()
}
