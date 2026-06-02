import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function buildBaseContext(overrides = {}) {
  return {
    transaction: {
      id: 'tx-1',
      finance_type: 'bond',
      onboarding_status: 'approved',
      seller_onboarding_status: 'approved',
      current_main_stage: 'OTP',
      stage: 'OTP Signed',
      lifecycle_state: 'active',
      updated_at: '2026-06-01T10:00:00.000Z',
      created_at: '2026-05-27T09:00:00.000Z',
      seller_has_existing_bond: false,
      ...overrides.transaction,
    },
    lanes: overrides.lanes || [],
    checklistItems: overrides.checklistItems || [],
    documentRequests: overrides.documentRequests || [],
    documents: overrides.documents || [],
    requiredDocuments: overrides.requiredDocuments || [],
    events: overrides.events || [],
    warnings: overrides.warnings || [],
  }
}

try {
  const { resolveTransactionRollup, buildLegacyRollupComparison } = await server.ssrLoadModule('/server/services/transactionWorkflowRollup.js')

  const financeRollup = await resolveTransactionRollup(
    'tx-1',
    {
      context: buildBaseContext({
        documents: [
          { id: 'doc-generated-otp', document_type: 'generated_otp', status: 'completed' },
          { id: 'doc-signed-otp', document_type: 'signed_otp', status: 'completed' },
          { id: 'doc-buyer-fica', document_type: 'buyer_id_document', status: 'completed' },
          { id: 'doc-seller-fica', document_type: 'seller_id_document', status: 'completed' },
          { id: 'doc-bond-app', document_type: 'bond_application_form', status: 'completed' },
        ],
      }),
    },
  )

  assert.equal(financeRollup.parentStage, 'FINANCE')
  assert.equal(financeRollup.parentStatus, 'blocked')
  assert.equal(financeRollup.activeWorkflowKey, 'finance_bond')
  assert.equal(financeRollup.activeStepKey, 'bond_approval')
  assert.equal(financeRollup.completedStages.includes('SALES_OTP'), true)
  assert.equal(financeRollup.blockers.some((item) => item.code === 'BOND_APPROVAL_REQUIRED'), true)
  assert.equal(financeRollup.legacy.mappedParentStage, 'SALES_OTP')
  assert.equal(financeRollup.progressPercent > 20, true)

  const comparison = buildLegacyRollupComparison(financeRollup)
  assert.equal(comparison.differences[0].field, 'parentStage')
  assert.equal(comparison.differences[0].legacyValue, 'SALES_OTP')
  assert.equal(comparison.differences[0].rollupValue, 'FINANCE')

  const transferRollup = await resolveTransactionRollup(
    'tx-2',
    {
      context: buildBaseContext({
        transaction: {
          id: 'tx-2',
          current_main_stage: 'FIN',
          stage: 'Finance Pending',
          seller_has_existing_bond: true,
        },
        documents: [
          { id: 'doc-generated-otp-2', document_type: 'generated_otp', status: 'completed' },
          { id: 'doc-signed-otp-2', document_type: 'signed_otp', status: 'completed' },
          { id: 'doc-buyer-fica-2', document_type: 'buyer_id_document', status: 'completed' },
          { id: 'doc-seller-fica-2', document_type: 'seller_id_document', status: 'completed' },
          { id: 'doc-bond-app-2', document_type: 'bond_application_form', status: 'completed' },
          { id: 'doc-bond-approval-2', document_type: 'bond_approval', status: 'completed' },
          { id: 'doc-guarantees-2', document_type: 'guarantees', status: 'completed' },
        ],
      }),
    },
  )

  assert.equal(transferRollup.parentStage, 'TRANSFER')
  assert.equal(transferRollup.activeWorkflowKey, 'seller_bond_cancellation')
  assert.equal(transferRollup.blockers.some((item) => item.code === 'CANCELLATION_FIGURES_REQUIRED'), true)
  assert.equal(transferRollup.completedStages.includes('FINANCE'), true)

  const completeRollup = await resolveTransactionRollup(
    'tx-3',
    {
      context: buildBaseContext({
        transaction: {
          id: 'tx-3',
          finance_type: 'cash',
          current_main_stage: 'FIN',
          stage: 'Finance Pending',
        },
        lanes: [
          {
            laneKey: 'transfer',
            steps: [
              { id: 'step-transfer-docs', key: 'transfer_documents_prepared', status: 'completed' },
              { id: 'step-transfer-buyer-signed', key: 'buyer_signed_transfer_documents', status: 'completed' },
              { id: 'step-transfer-seller-signed', key: 'seller_signed_transfer_documents', status: 'completed' },
              { id: 'step-transfer-rates', key: 'rates_clearance_uploaded', status: 'completed' },
              { id: 'step-transfer-lodgement', key: 'lodgement_submitted', status: 'completed' },
              { id: 'step-transfer-reg', key: 'registration_confirmed', status: 'completed' },
            ],
          },
        ],
        documents: [
          { id: 'doc-generated-otp-3', document_type: 'generated_otp', status: 'completed' },
          { id: 'doc-signed-otp-3', document_type: 'signed_otp', status: 'completed' },
          { id: 'doc-buyer-fica-3', document_type: 'buyer_id_document', status: 'completed' },
          { id: 'doc-seller-fica-3', document_type: 'seller_id_document', status: 'completed' },
          { id: 'doc-proof-of-funds-3', document_type: 'proof_of_funds', status: 'completed' },
          { id: 'doc-transfer-pack-3', document_type: 'transfer_documents', status: 'completed' },
          { id: 'doc-signed-transfer-pack-3', document_type: 'signed_transfer_documents', status: 'completed' },
          { id: 'doc-rates-3', document_type: 'rates_clearance_certificate', status: 'completed' },
          { id: 'doc-reg-3', document_type: 'registration_confirmation', status: 'completed' },
        ],
      }),
    },
  )

  assert.equal(completeRollup.parentStage, 'COMPLETE')
  assert.equal(completeRollup.parentStatus, 'complete')
  assert.equal(completeRollup.progressPercent, 100)
  assert.equal(completeRollup.activeWorkflowKey, null)

  console.log('transactionWorkflowRollup tests passed')
} finally {
  await server.close()
}
