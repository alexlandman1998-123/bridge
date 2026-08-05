import assert from 'node:assert/strict'
import { buildBuyerOnboardingCompletionHook } from '../buyerOnboardingCompletionHook.js'

const completed = buildBuyerOnboardingCompletionHook({
  transaction: {
    id: 'tx-1',
    finance_type: 'cash',
  },
  onboarding: {
    id: 'onboarding-1',
    status: 'draft',
  },
  formData: {
    bridge_client_intake_preference: 'digital_portal',
  },
  completedAt: '2026-08-05T10:00:00.000Z',
  submit: true,
})

assert.equal(completed.status, 'completed')
assert.equal(completed.onboardingStatus, 'awaiting_signed_otp')
assert.match(completed.nextAction, /upload the signed OTP/i)
assert.equal(
  completed.steps.find((step) => step.key === 'roleplayer_handoff_gate')?.status,
  'blocked_until_signed_otp',
)
assert.match(completed.steps.find((step) => step.key === 'information_sheet_document')?.detail, /form data/i)
assert.doesNotMatch(completed.steps.find((step) => step.key === 'information_sheet_document')?.detail || '', /uploaded/i)
assert.equal(completed.event.type, 'buyer_onboarding_completion_hook')
assert.equal(completed.event.data.blockedStepCount, 1)

const justSubmittedWithUpdatedRow = buildBuyerOnboardingCompletionHook({
  transaction: {
    id: 'tx-just-submitted',
  },
  onboarding: {
    id: 'onboarding-just-submitted',
    status: 'submitted',
  },
  previousOnboarding: {
    id: 'onboarding-just-submitted',
    status: 'draft',
  },
  submit: true,
})

assert.equal(justSubmittedWithUpdatedRow.status, 'completed')

const alreadyCompleted = buildBuyerOnboardingCompletionHook({
  transaction: {
    id: 'tx-2',
    onboarding_status: 'awaiting_signed_otp',
    onboarding_completed_at: '2026-08-04T09:00:00.000Z',
    finance_type: 'cash',
  },
  onboarding: {
    id: 'onboarding-2',
    status: 'submitted',
  },
  submit: true,
})

assert.equal(alreadyCompleted.status, 'already_completed')
assert.equal(alreadyCompleted.completedAt, '2026-08-04T09:00:00.000Z')

const bondManagedByOriginator = buildBuyerOnboardingCompletionHook({
  transaction: {
    id: 'tx-3',
    finance_type: 'bond',
    finance_managed_by: 'bond_originator',
  },
  onboarding: {
    id: 'onboarding-3',
  },
  buyerBondOriginatorRequest: {
    status: 'not_requested',
  },
  submit: true,
})

assert.equal(bondManagedByOriginator.requiresBondLane, true)
assert.equal(
  bondManagedByOriginator.steps.find((step) => step.key === 'bond_originator_request')?.status,
  'attention',
)
assert.equal(bondManagedByOriginator.summary.attentionCount, 1)

const draft = buildBuyerOnboardingCompletionHook({
  transaction: {
    id: 'tx-4',
  },
  submit: false,
})

assert.equal(draft.status, 'draft')
assert.equal(draft.onboardingStatus, 'awaiting_client_onboarding')
assert.equal(draft.summary.pendingCount > 0, true)

console.log('buyer onboarding completion hook tests passed')
