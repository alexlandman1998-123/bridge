import assert from 'node:assert/strict'
import {
  NEW_TRANSACTION_SETUP_HEALTH_VERSION,
  buildNewTransactionSetupHealth,
  extractNewTransactionSetupHealthFromEvents,
  resolveWizardHandoffNextAction,
  resolveWizardInitialTransactionStage,
} from '../newTransactionSetupHealth.js'

assert.deepEqual(
  resolveWizardInitialTransactionStage({ signedOtpStatus: 'uploaded' }, { stage: 'Reserved', mainStage: 'OTP' }),
  { stage: 'Finance In Progress', mainStage: 'FIN', onboardingStatus: 'signed_otp_received' },
)
assert.deepEqual(
  resolveWizardInitialTransactionStage({ signedOtpStatus: 'pending_upload' }, { stage: 'Reserved', mainStage: 'OTP' }),
  { stage: 'Reserved', mainStage: 'OTP', onboardingStatus: 'awaiting_signed_otp' },
)
assert.match(resolveWizardHandoffNextAction({ signedOtpStatus: 'uploaded' }) || '', /finance processing/i)

const readyDeveloperSale = buildNewTransactionSetupHealth({
  transactionType: 'developer_sale',
  transactionPayload: {
    development_id: 'dev-1',
    unit_id: 'unit-1',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
    purchase_price: 1500000,
  },
  sourceContext: {
    originLabel: 'Created via development unit',
  },
  buyerParties: [{ name: 'Alex Buyer' }],
  rolePlayers: [{ roleType: 'transfer_attorney' }, { roleType: 'bond_originator' }],
  onboardingRecord: { token: 'onboarding-token' },
  handoffChecklist: {
    signedOtpStatus: 'uploaded',
    financeCaptured: true,
    partnersCaptured: true,
  },
})

assert.equal(readyDeveloperSale.version, NEW_TRANSACTION_SETUP_HEALTH_VERSION)
assert.equal(readyDeveloperSale.status, 'ready')
assert.equal(readyDeveloperSale.completeCount, 7)
assert.equal(readyDeveloperSale.actionRequiredCount, 0)
assert.equal(readyDeveloperSale.needsAttentionCount, 0)
assert.equal(readyDeveloperSale.checks.find((check) => check.key === 'source')?.status, 'complete')
assert.equal(readyDeveloperSale.checks.find((check) => check.key === 'signed_otp')?.status, 'complete')

const agentListingNeedsOtpUpload = buildNewTransactionSetupHealth({
  transactionType: 'private_property',
  transactionPayload: {
    listing_id: 'listing-1',
    property_address_line_1: '1 Example Road',
    finance_type: 'cash',
    purchase_price: 950000,
  },
  buyerParties: [{ name: 'Noah Buyer' }],
  rolePlayers: [{ roleType: 'transfer_attorney' }],
  onboardingRecord: { token: 'agent-token' },
  handoffChecklist: {
    signedOtpStatus: 'pending_upload',
    financeCaptured: true,
    partnersCaptured: true,
  },
})

assert.equal(agentListingNeedsOtpUpload.status, 'ready_with_next_actions')
assert.equal(agentListingNeedsOtpUpload.actionRequiredCount, 1)
assert.equal(agentListingNeedsOtpUpload.checks.find((check) => check.key === 'signed_otp')?.status, 'action_required')
assert.match(agentListingNeedsOtpUpload.nextAction || '', /Upload the signed OTP/i)

const missingSourceWithWarnings = buildNewTransactionSetupHealth({
  transactionType: 'private_property',
  transactionPayload: {
    finance_managed_by: 'client',
  },
  setupWarnings: [
    { area: 'role_players', message: 'Role-player setup could not be completed.' },
    { area: 'required_documents', message: 'Required document setup could not be completed.' },
  ],
  handoffChecklist: {
    signedOtpStatus: 'not_signed',
  },
})

assert.equal(missingSourceWithWarnings.status, 'needs_attention')
assert.equal(missingSourceWithWarnings.warningCount, 2)
assert.equal(missingSourceWithWarnings.checks.find((check) => check.key === 'source')?.status, 'needs_attention')
assert.equal(missingSourceWithWarnings.checks.find((check) => check.key === 'automation')?.status, 'needs_attention')
assert.match(resolveWizardHandoffNextAction({ signedOtpStatus: 'not_signed' }) || '', /onboarding/i)

const recoveredAudit = extractNewTransactionSetupHealthFromEvents([
  {
    id: 'event-1',
    eventType: 'transaction_setup_audit',
    createdAt: '2026-08-24T12:00:00.000Z',
    eventData: {
      setupHealth: agentListingNeedsOtpUpload,
    },
  },
])

assert.equal(recoveredAudit?.status, 'ready_with_next_actions')
assert.equal(recoveredAudit?.auditEventId, 'event-1')
assert.equal(recoveredAudit?.auditEventCreatedAt, '2026-08-24T12:00:00.000Z')
assert.equal(recoveredAudit?.auditEventLogged, true)

console.log('new transaction setup health tests passed')
