import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { createServer } from 'vite'

const appRoot = resolve(import.meta.dirname, '..')
const attorneyWorkspaceSource = readFileSync(resolve(appRoot, 'src/pages/AttorneyTransactionDetail.jsx'), 'utf8')

const server = await createServer({
  root: appRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    getWorkflowActionDescriptor,
    resolveWorkflowAvailableActions,
  } = await server.ssrLoadModule('/server/services/workflowActionAvailabilityService.js')

  const developmentSalesOtpWorkflow = {
    requiredSteps: [
      { key: 'buyer_onboarding_complete', label: 'Buyer onboarding complete', status: 'pending' },
      { key: 'seller_onboarding_complete', label: 'Seller onboarding not required', status: 'not_applicable' },
      { key: 'signed_otp_received', label: 'Signed OTP uploaded', status: 'pending' },
      { key: 'supporting_docs_complete', label: 'Supporting documents complete', status: 'pending' },
      { key: 'ready_for_finance_handoff', label: 'Ready for finance handoff', status: 'pending' },
    ],
  }
  const developmentState = {
    actorRole: 'developer',
    parentStage: 'SALES_OTP',
    transaction: {
      id: 'tx-dev-phase4',
      development_id: 'dev-1',
      transaction_type: 'development_sale',
      buyer_email: 'buyer@example.com',
      current_main_stage: 'OTP',
    },
    workflows: {
      sales_otp: developmentSalesOtpWorkflow,
    },
    requiredDocuments: [],
  }

  const buyerRequestDescriptor = getWorkflowActionDescriptor('REQUEST_BUYER_DETAILS', developmentState)
  assert.equal(buyerRequestDescriptor.ownerRole, 'developer')
  assert.deepEqual(
    buyerRequestDescriptor.allowedRoles,
    ['agent', 'developer', 'internal_admin'],
    'Developer sales must explicitly allow developer buyer onboarding requests.',
  )

  const developmentFinanceDescriptor = getWorkflowActionDescriptor('MOVE_TO_FINANCE', developmentState)
  assert.equal(developmentFinanceDescriptor.ownerRole, 'developer')
  assert.deepEqual(
    developmentFinanceDescriptor.requires,
    ['buyer_onboarding_complete', 'signed_otp_received'],
    'Development finance handoff must not require seller onboarding or supporting docs without an active document roster.',
  )

  const developmentFinanceWithDocuments = getWorkflowActionDescriptor('MOVE_TO_FINANCE', {
    ...developmentState,
    requiredDocuments: [{ id: 'doc-1', required: true, status: 'pending' }],
  })
  assert.deepEqual(
    developmentFinanceWithDocuments.requires,
    ['buyer_onboarding_complete', 'signed_otp_received', 'supporting_docs_complete'],
    'Development finance handoff must require supporting docs when an active document roster exists.',
  )

  const developmentActions = resolveWorkflowAvailableActions(developmentState).map((action) => action.actionKey)
  assert.equal(developmentActions.includes('REQUEST_BUYER_DETAILS'), true)
  assert.equal(developmentActions.includes('REQUEST_AGENCY_HANDOVER'), false)
  assert.equal(
    developmentActions.includes('REQUEST_SELLER_DETAILS'),
    false,
    'Seller onboarding request actions must not be available for development sales.',
  )

  const agencyActions = resolveWorkflowAvailableActions({
    actorRole: 'agent',
    parentStage: 'SALES_OTP',
    transaction: {
      id: 'tx-agency-phase4',
      buyer_email: 'buyer@example.com',
      seller_email: 'seller@example.com',
      current_main_stage: 'OTP',
    },
    workflows: {
      sales_otp: {
        requiredSteps: [
          { key: 'buyer_onboarding_complete', label: 'Buyer onboarding complete', status: 'pending' },
          { key: 'seller_onboarding_complete', label: 'Seller onboarding complete', status: 'pending' },
          { key: 'signed_otp_received', label: 'Signed OTP uploaded', status: 'pending' },
          { key: 'supporting_docs_complete', label: 'Supporting documents complete', status: 'pending' },
          { key: 'ready_for_finance_handoff', label: 'Ready for finance handoff', status: 'pending' },
        ],
      },
    },
  }).map((action) => action.actionKey)
  assert.equal(
    agencyActions.includes('REQUEST_SELLER_DETAILS'),
    true,
    'Agency transactions must still expose seller onboarding requests.',
  )

  const externalAgencyActions = resolveWorkflowAvailableActions({
    actorRole: 'agent',
    parentStage: 'SALES_OTP',
    transaction: {
      id: 'tx-external-agency-phase5',
      transaction_type: 'development_sale',
      development_id: 'dev-1',
      buyer_email: 'buyer@example.com',
      lead_owner: 'agency',
      ownership_model: 'agency_introduced',
      source_agency_org_id: 'agency-1',
      current_main_stage: 'OTP',
    },
    workflows: {
      sales_otp: developmentSalesOtpWorkflow,
    },
    requiredDocuments: [
      {
        id: 'req-agency-handover',
        document_key: 'agency_handover_pack',
        group_key: 'agency_documents',
        required_from_role: 'agency',
        status: 'pending',
      },
    ],
  })
  const agencyHandoverAction = externalAgencyActions.find((action) => action.actionKey === 'REQUEST_AGENCY_HANDOVER')
  assert.equal(Boolean(agencyHandoverAction), true, 'External agency sales must expose an agency handover action.')
  assert.equal(agencyHandoverAction?.label, 'Request agency handover')
  assert.equal(agencyHandoverAction?.ownerRole, 'agent')
  assert.equal(
    externalAgencyActions.some((action) => action.actionKey === 'REQUEST_SELLER_DETAILS'),
    false,
    'External developer agency sales must not reintroduce private seller onboarding.',
  )

  assert.match(
    attorneyWorkspaceSource,
    /developer_transaction_header_buyer_onboarding/,
    'Developer header buyer onboarding sends must use a developer-specific source.',
  )
  assert.match(
    attorneyWorkspaceSource,
    /developer_transaction_header_client_portal_resend/,
    'Developer header portal resends must use a developer-specific source.',
  )
  assert.match(
    attorneyWorkspaceSource,
    /developer_transaction_workspace_recipient_action/,
    'Developer recipient-level buyer sends must use a developer-specific source.',
  )
} finally {
  await server.close()
}

console.log('developer transaction routing phase 4 test passed')
