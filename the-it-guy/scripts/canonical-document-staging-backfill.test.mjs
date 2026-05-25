import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildCanonicalInstanceGenerationPlan,
  } = await server.ssrLoadModule('/src/services/documents/canonicalDocumentStagingBackfillService.js')

  const definitions = [
    {
      key: 'signed_otp',
      pack_key: 'attorney_transfer_readiness',
      default_requirement_level: 'blocker',
      default_visibility: ['buyer', 'seller', 'agent'],
      default_upload_roles: ['buyer', 'agent'],
      review_required: true,
    },
    {
      key: 'information_sheet',
      pack_key: 'attorney_transfer_readiness',
      default_requirement_level: 'required',
      default_visibility: ['buyer', 'agent'],
      default_upload_roles: ['buyer'],
      review_required: true,
    },
    {
      key: 'proof_of_income',
      pack_key: 'buyer_finance',
      default_requirement_level: 'required',
      default_visibility: ['buyer', 'agent', 'bond_originator'],
      default_upload_roles: ['buyer'],
      review_required: true,
    },
    {
      key: 'reservation_deposit_proof',
      pack_key: 'buyer_finance',
      default_requirement_level: 'required',
      default_visibility: ['buyer', 'agent'],
      default_upload_roles: ['buyer'],
      review_required: true,
    },
    {
      key: 'grant_letter',
      pack_key: 'buyer_finance',
      default_requirement_level: 'required',
      default_visibility: ['buyer', 'agent', 'bond_originator'],
      default_upload_roles: ['buyer', 'bond_originator'],
      review_required: true,
    },
    {
      key: 'settlement_figure',
      pack_key: 'property_finance_existing_bond',
      default_requirement_level: 'required',
      default_visibility: ['seller', 'agent', 'cancellation_attorney'],
      default_upload_roles: ['cancellation_attorney'],
      review_required: true,
    },
    {
      key: 'signed_transfer_documents',
      pack_key: 'attorney_transfer_readiness',
      default_requirement_level: 'blocker',
      default_visibility: ['buyer', 'seller', 'agent', 'transferring_attorney'],
      default_upload_roles: ['buyer', 'seller', 'transferring_attorney'],
      review_required: true,
    },
    {
      key: 'guarantees',
      pack_key: 'attorney_transfer_readiness',
      default_requirement_level: 'blocker',
      default_visibility: ['agent', 'agency_admin', 'transferring_attorney', 'bond_attorney', 'bond_originator'],
      default_upload_roles: ['bond_attorney', 'bond_originator', 'transferring_attorney'],
      review_required: true,
    },
  ]

  const transactionId = '00000000-0000-4000-8000-000000000123'
  const plan = buildCanonicalInstanceGenerationPlan({
    canonicalDefinitions: definitions,
    canonicalInstances: [],
    transactionRequiredDocuments: [
      { id: 'legacy-otp', transaction_id: transactionId, document_key: 'otp', status: 'missing', is_required: true, required_from_role: 'client' },
      { id: 'legacy-info', transaction_id: transactionId, document_key: 'information_sheet', status: 'missing', is_required: true, required_from_role: 'client' },
      { id: 'legacy-income', transaction_id: transactionId, document_key: 'proof_of_income', status: 'uploaded', is_required: true, required_from_role: 'client', uploaded_document_id: 'doc-income' },
      { id: 'legacy-reservation', transaction_id: transactionId, document_key: 'reservation_deposit_proof', status: 'missing', is_required: true, required_from_role: 'client' },
      { id: 'legacy-grant', transaction_id: transactionId, document_key: 'grant_signed', status: 'accepted', is_required: true, required_from_role: 'bond_originator' },
      { id: 'legacy-settlement', transaction_id: transactionId, document_key: 'settlement_figures', status: 'missing', is_required: true, required_from_role: 'attorney' },
      { id: 'legacy-transfer', transaction_id: transactionId, document_key: 'signed_transfer_pack', status: 'missing', is_required: true, required_from_role: 'attorney' },
      { id: 'legacy-bank', transaction_id: transactionId, document_key: 'guarantees', status: 'missing', is_required: true, required_from_role: 'bank' },
      { id: 'legacy-dupe', transaction_id: transactionId, document_key: 'otp', status: 'missing', is_required: true, required_from_role: 'client' },
      { id: 'legacy-missing-def', transaction_id: transactionId, document_key: 'mystery_key', status: 'missing', is_required: true },
      { id: 'legacy-missing-context', document_key: 'otp', status: 'missing', is_required: true },
    ],
    documentRequests: [
      { id: 'request-transfer', transaction_id: transactionId, document_type: 'signed_transfer_pack', status: 'requested', assigned_to_role: 'attorney' },
    ],
    documents: [
      { id: 'doc-transfer-pack', transaction_id: transactionId, document_type: 'transfer_document_pack', status: 'uploaded' },
    ],
  })

  assert.equal(plan.candidateContextCount, 1)
  assert.equal(plan.candidateInstanceCount, 8)
  assert.equal(plan.manualReviewRequired, 2)
  assert.deepEqual(
    plan.impossibleOrMissingFacts.map((item) => item.reason).sort(),
    ['missing_canonical_definition', 'missing_transaction_context'],
  )
  assert.deepEqual(
    plan.definitionsUsed.map((item) => item.key).sort(),
    [
      'grant_letter',
      'guarantees',
      'information_sheet',
      'proof_of_income',
      'reservation_deposit_proof',
      'settlement_figure',
      'signed_otp',
      'signed_transfer_documents',
    ],
  )
  const signedOtp = plan.candidates.find((candidate) => candidate.document_definition_key === 'signed_otp')
  assert.equal(signedOtp.context_id, transactionId)
  assert.equal(signedOtp.requested_from_role, 'buyer')
  assert.deepEqual(signedOtp.stage_gates, ['otp_ready', 'attorney_instruction_ready'])
  const guarantees = plan.candidates.find((candidate) => candidate.document_definition_key === 'guarantees')
  assert.equal(guarantees.requested_from_role, 'bond_originator')

  const existingPlan = buildCanonicalInstanceGenerationPlan({
    canonicalDefinitions: definitions,
    canonicalInstances: plan.candidates,
    transactionRequiredDocuments: [
      { id: 'legacy-otp', transaction_id: transactionId, document_key: 'otp', status: 'missing', is_required: true, required_from_role: 'client' },
    ],
  })
  assert.equal(existingPlan.candidateInstanceCount, 0)
  assert.equal(existingPlan.skippedExistingCount, 1)

  console.log('canonical-document-staging-backfill tests passed')
} finally {
  await server.close()
}
