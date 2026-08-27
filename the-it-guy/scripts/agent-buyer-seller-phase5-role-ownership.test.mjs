import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { buildSignedOtpHandoffReleaseDecision } from '../src/core/transactions/signedOtpHandoffRelease.js'
import { generateClientPortalNextActions } from '../src/lib/clientPortalNextActionsEngine.js'

function signedOtpContext(overrides = {}) {
  return {
    onboarding: { status: 'signed_otp_received' },
    transaction: {
      id: 'phase-5-transaction',
      onboarding_status: 'signed_otp_received',
      finance_type: 'cash',
      current_main_stage: 'ATT',
    },
    lifecycle: { mainStage: 'ATT' },
    documentCenter: { requiredDocuments: [] },
    ...overrides,
  }
}

const sellerActions = generateClientPortalNextActions(signedOtpContext({
  workspaceMode: 'selling',
  portalData: {
    activeSellingContext: { sellerOnboardingStatus: 'signed_otp_received' },
  },
}))

assert.equal(sellerActions.length, 1, 'A seller with no outstanding requirement should receive one clear passive state.')
assert.equal(sellerActions[0].id, 'seller_signed_otp_handoff_in_progress')
assert.equal(sellerActions[0].title, 'Signed OTP received')
assert.equal(sellerActions[0].actionRoute, 'progress')
assert.equal(sellerActions[0].blocking, false)
assert.equal(sellerActions[0].metadata.ownerRole, 'transaction_team')
assert.equal(sellerActions[0].metadata.waitingOnRole, 'transaction_team')
assert.equal(sellerActions[0].metadata.clientRole, 'seller')

const buyerApplicationActions = generateClientPortalNextActions(signedOtpContext({
  workspaceMode: 'buying',
  transaction: {
    onboarding_status: 'signed_otp_received',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
    current_main_stage: 'FIN',
  },
  lifecycle: { mainStage: 'FIN' },
  portalData: { onboardingFormData: { formData: {} } },
}))

assert.equal(buyerApplicationActions[0].id, 'bond_application_required')
assert.equal(buyerApplicationActions[0].actionRoute, 'bond_application')
assert.equal(buyerApplicationActions[0].metadata.ownerRole, 'buyer')
assert.equal(buyerApplicationActions[0].metadata.waitingOnRole, null)
assert.equal(
  buyerApplicationActions.some((action) => action.id === 'buyer_signed_otp_finance_in_progress'),
  false,
  'A passive handoff must not compete with an existing buyer action.',
)

const submittedApplicationActions = generateClientPortalNextActions(signedOtpContext({
  workspaceMode: 'buying',
  transaction: {
    onboarding_status: 'signed_otp_received',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
    current_main_stage: 'FIN',
  },
  lifecycle: { mainStage: 'FIN' },
  portalData: {
    onboardingFormData: {
      formData: { bond_application: { status: 'Submitted' } },
    },
  },
}))

assert.equal(submittedApplicationActions.length, 1, 'An existing review state must not be duplicated by a generic passive action.')
assert.equal(submittedApplicationActions[0].id, 'bond_application_under_review')
assert.equal(submittedApplicationActions[0].metadata.ownerRole, 'transaction_team')
assert.equal(submittedApplicationActions[0].metadata.waitingOnRole, 'finance_team')

const buyerTransferActions = generateClientPortalNextActions(signedOtpContext({ workspaceMode: 'buying' }))
assert.equal(buyerTransferActions.length, 1)
assert.equal(buyerTransferActions[0].id, 'buyer_signed_otp_transfer_in_progress')
assert.equal(buyerTransferActions[0].actionRoute, 'progress')
assert.equal(buyerTransferActions[0].metadata.waitingOnRole, 'legal_team')

const blockedRelease = buildSignedOtpHandoffReleaseDecision({
  transaction: {
    id: 'phase-5-blocked',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
  bondOriginatorActivation: { activated: false },
})
assert.equal(blockedRelease.roleOwnership.agent.state, 'action_required')
assert.equal(blockedRelease.roleOwnership.agent.ownerRole, 'agent')
assert.match(blockedRelease.roleOwnership.agent.nextAction, /Assign a bond originator/)
assert.deepEqual(blockedRelease.event.data.roleOwnership, blockedRelease.roleOwnership)

const releasedHandoff = buildSignedOtpHandoffReleaseDecision({
  transaction: {
    id: 'phase-5-released',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
  bondOriginatorActivation: { activated: true },
})
assert.equal(releasedHandoff.roleOwnership.agent.state, 'monitoring')
assert.equal(releasedHandoff.roleOwnership.agent.waitingOnRole, 'bond_originator')
assert.equal(releasedHandoff.roleOwnership.seller.state, 'no_action_required')

const workspaceServiceSource = await readFile(
  resolve(process.cwd(), 'src/services/clientPortalWorkspaceService.js'),
  'utf8',
)
assert.match(
  workspaceServiceSource,
  /actionRequired:\s*Boolean\(nextClientAction\?\.blocking\)/,
  'Informational progress states must not be reported as client actions.',
)

console.log('Agent/buyer/seller Phase 5 role-ownership checks passed.')
