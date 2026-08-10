import { isBondFinanceType, normalizeFinanceType } from './financeType.js'

export const BUYER_ONBOARDING_COMPLETION_HOOK_VERSION = 'arch9_buyer_onboarding_completion_hook_v1'

const COMPLETE_ONBOARDING_STATUSES = new Set([
  'submitted',
  'reviewed',
  'approved',
  'complete',
  'completed',
  'awaiting_signed_otp',
  'signed_otp_received',
  'otp_uploaded',
])

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase().replace(/\s+/g, '_')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function compact(values = []) {
  return values.map(text).filter(Boolean)
}

function hasCompletionSignal(transaction = {}, onboarding = {}) {
  return Boolean(
    firstText(
      transaction.onboarding_completed_at,
      transaction.onboardingCompletedAt,
      transaction.external_onboarding_submitted_at,
      transaction.externalOnboardingSubmittedAt,
      onboarding.submitted_at,
      onboarding.submittedAt,
    ) ||
      COMPLETE_ONBOARDING_STATUSES.has(lower(transaction.onboarding_status || transaction.onboardingStatus)) ||
      COMPLETE_ONBOARDING_STATUSES.has(lower(onboarding.status)),
  )
}

function resolveFinanceManagedBy({ formData = {}, transaction = {} } = {}) {
  return firstText(
    formData.finance_managed_by,
    formData.financeManagedBy,
    formData.finance?.finance_managed_by,
    formData.finance?.financeManagedBy,
    transaction.finance_managed_by,
    transaction.financeManagedBy,
  )
}

function resolveIntakePreference(formData = {}) {
  return lower(
    firstText(
      formData.bridge_client_intake_preference,
      formData.client_intake_preference,
      formData.delivery_mode,
      formData.deliveryMode,
      formData.__bridge_onboarding_mode,
      formData.bridge_hard_copy_preferred === 'yes' ? 'hard_copy' : '',
      formData.bridge_agent_assisted_onboarding === 'yes' ? 'agent_assisted' : '',
    ),
  ) || 'digital_portal'
}

function defaultSignedOtpAction(formData = {}) {
  const preference = resolveIntakePreference(formData)
  if (preference === 'hard_copy') {
    return 'Prepare hard-copy OTP pack, obtain signatures, and upload the signed OTP before finance or attorney handoff.'
  }
  if (preference === 'agent_assisted') {
    return 'Prepare the OTP for assisted signing, obtain signatures, and upload the signed OTP before finance or attorney handoff.'
  }
  return 'Generate or release the OTP for signature, then upload the signed OTP before finance or attorney handoff.'
}

function hookStep(key, status, detail, action = '') {
  return { key, status, detail, action }
}

export function buildBuyerOnboardingCompletionHook({
  transaction = {},
  onboarding = {},
  previousTransaction = null,
  previousOnboarding = null,
  formData = {},
  financeSnapshot = {},
  rolePlayerPolicy = {},
  buyerBondOriginatorRequest = {},
  bondAssistanceRouting = null,
  completedAt = '',
  nextAction = '',
  submit = true,
} = {}) {
  const transactionId = firstText(transaction.id, transaction.transactionId, onboarding.transaction_id, onboarding.transactionId)
  const onboardingId = firstText(onboarding.id, onboarding.onboardingId)
  const resolvedCompletedAt = firstText(
    completedAt,
    transaction.onboarding_completed_at,
    transaction.onboardingCompletedAt,
    transaction.external_onboarding_submitted_at,
    transaction.externalOnboardingSubmittedAt,
    onboarding.submitted_at,
    onboarding.submittedAt,
  )
  const previouslyCompleted = hasCompletionSignal(previousTransaction || transaction, previousOnboarding || onboarding)
  const financeType = normalizeFinanceType(
    firstText(
      financeSnapshot.financeType,
      financeSnapshot.finance_type,
      formData.finance_type,
      formData.financeType,
      transaction.finance_type,
      transaction.financeType,
    ),
    { allowUnknown: true },
  )
  const financeManagedBy = resolveFinanceManagedBy({ formData, transaction })
  const requiresBondLane = isBondFinanceType(financeType)
  const buyerRequestedBondOriginator = lower(buyerBondOriginatorRequest.status) === 'requested'
  const bondAssistanceRoutingStatus = lower(bondAssistanceRouting?.status)
  const bondOriginatorAssignmentRequired = Boolean(bondAssistanceRouting?.assignmentRequired)
  const resolvedNextAction = firstText(nextAction) || defaultSignedOtpAction(formData)
  const status = !submit ? 'draft' : previouslyCompleted ? 'already_completed' : 'completed'

  const steps = [
    hookStep(
      'transaction_onboarding_state',
      submit && transactionId ? 'complete' : 'pending',
      submit && transactionId
        ? 'Transaction is marked as awaiting signed OTP with buyer onboarding timestamps.'
        : 'Buyer onboarding is still a draft.',
      'Persist onboarding status and completion timestamps.',
    ),
    hookStep(
      'information_sheet_document',
      submit ? 'complete' : 'pending',
      submit
        ? 'Information sheet requirement is completed from submitted form data without implying a file upload.'
        : 'Information sheet remains outstanding until buyer onboarding is submitted.',
      'Complete the information sheet requirement from onboarding source data.',
    ),
    hookStep(
      'workflow_evidence',
      submit ? 'complete' : 'pending',
      submit
        ? 'Buyer onboarding completion evidence is projected for downstream workflow checks.'
        : 'Completion evidence waits for submit.',
      'Record buyer_onboarding_complete evidence.',
    ),
    hookStep(
      'owner_notification',
      submit ? 'complete' : 'pending',
      submit
        ? 'Agent/developer owner is notified that OTP preparation is required.'
        : 'Owner notification waits for submit.',
      'Notify the transaction owner to prepare and upload the signed OTP.',
    ),
    hookStep(
      'attorney_instruction_projection',
      submit ? 'complete' : 'pending',
      submit
        ? 'Transfer attorney instruction is projected as awaiting signed OTP.'
        : 'Attorney instruction projection waits for submit.',
      'Keep attorney handoff visible, but blocked until signed OTP.',
    ),
    hookStep(
      'roleplayer_handoff_gate',
      submit ? 'blocked_until_signed_otp' : 'pending',
      submit
        ? 'Finance and attorney handoffs must remain gated until signed OTP is uploaded.'
        : 'Roleplayer handoff is not evaluated for drafts.',
      resolvedNextAction,
    ),
  ]

  if (requiresBondLane) {
    steps.push(
      hookStep(
        'bond_originator_request',
        buyerRequestedBondOriginator
          ? 'complete'
          : bondOriginatorAssignmentRequired || financeManagedBy === 'bond_originator'
            ? 'attention'
            : 'not_applicable',
        buyerRequestedBondOriginator
          ? 'Buyer-appointed bond originator request is captured for processing.'
          : bondOriginatorAssignmentRequired
            ? 'Buyer requested bond assistance; agent or developer must select or confirm the bond originator.'
          : financeManagedBy === 'bond_originator'
            ? 'Bond finance is routed through a bond originator; confirm assignment before signed OTP.'
            : 'Bond originator request is not required for this finance route.',
        buyerRequestedBondOriginator
          ? 'Process buyer-appointed bond originator consent and assignment.'
          : bondOriginatorAssignmentRequired
            ? bondAssistanceRouting.nextAction || 'Select or confirm the bond originator.'
          : 'Confirm the assigned bond originator lane before releasing post-OTP handoff.',
      ),
    )
  }

  const blocked = steps.filter((step) => step.status === 'blocked' || step.status === 'blocked_until_signed_otp')
  const attention = steps.filter((step) => step.status === 'attention')
  const pending = steps.filter((step) => step.status === 'pending')

  return {
    version: BUYER_ONBOARDING_COMPLETION_HOOK_VERSION,
    status,
    transactionId: transactionId || null,
    onboardingId: onboardingId || null,
    completedAt: resolvedCompletedAt || null,
    onboardingStatus: submit ? 'awaiting_signed_otp' : 'awaiting_client_onboarding',
    nextAction: resolvedNextAction,
    financeType: financeType || 'unknown',
    financeManagedBy: financeManagedBy || null,
    requiresBondLane,
    buyerRequestedBondOriginator,
    steps,
    nextOperationalActions: compact([
      submit ? resolvedNextAction : 'Wait for buyer onboarding submit.',
      requiresBondLane && financeManagedBy === 'bond_originator'
        ? 'Keep bond originator intake warm; release formal handoff after signed OTP.'
        : '',
      bondOriginatorAssignmentRequired ? bondAssistanceRouting.nextAction : '',
      'Keep transfer attorney instruction visible as awaiting signed OTP.',
    ]),
    event: {
      type: 'buyer_onboarding_completion_hook',
      data: {
        status,
        onboardingStatus: submit ? 'awaiting_signed_otp' : 'awaiting_client_onboarding',
        nextAction: resolvedNextAction,
        financeType: financeType || 'unknown',
        financeManagedBy: financeManagedBy || null,
        requiresBondLane,
        buyerRequestedBondOriginator,
        bondAssistanceRoutingStatus: bondAssistanceRoutingStatus || null,
        bondOriginatorAssignmentRequired,
        blockedStepCount: blocked.length,
        attentionStepCount: attention.length,
        pendingStepCount: pending.length,
      },
    },
    summary: {
      total: steps.length,
      completeCount: steps.filter((step) => step.status === 'complete').length,
      blockedCount: blocked.length,
      attentionCount: attention.length,
      pendingCount: pending.length,
    },
    rolePlayerPolicy: rolePlayerPolicy && typeof rolePlayerPolicy === 'object' ? rolePlayerPolicy : {},
    bondAssistanceRouting: bondAssistanceRouting && typeof bondAssistanceRouting === 'object' ? bondAssistanceRouting : null,
  }
}
