import { isBondFinanceType, normalizeFinanceType } from './financeType.js'

export const SIGNED_OTP_HANDOFF_RELEASE_VERSION = 'arch9_signed_otp_handoff_release_v1'
export const SIGNED_OTP_ROLE_OWNERSHIP_VERSION = 'arch9_signed_otp_role_ownership_v1'

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase().replace(/[\s/-]+/g, '_')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function roleType(row = {}) {
  const normalized = lower(row.roleType || row.role_type || row.role || row.attorneyRole || row.attorney_role)
  if (normalized === 'attorney' || normalized === 'conveyancer') return 'transfer_attorney'
  return normalized
}

function unique(values = []) {
  return [...new Set(values.map(text).filter(Boolean))]
}

function attorneyActivationLanes(attorneyActivation = []) {
  return unique((Array.isArray(attorneyActivation) ? attorneyActivation : []).map(roleType))
}

function isBondOriginatorActivated(activation = null) {
  return Boolean(activation?.activated)
}

function normalizeFinanceManagedBy({ transaction = {}, financeManagedBy = '' } = {}) {
  return lower(
    firstText(
      financeManagedBy,
      transaction.finance_managed_by,
      transaction.financeManagedBy,
    ),
  )
}

export function buildSignedOtpRoleOwnership({
  originatorManagedFinance = false,
  bondOriginatorActivated = false,
  financeType = '',
  financeManagedBy = '',
} = {}) {
  const normalizedFinanceType = normalizeFinanceType(financeType, { allowUnknown: true })
  const normalizedFinanceManagedBy = lower(financeManagedBy)
  const financeHandoffBlocked = Boolean(originatorManagedFinance && !bondOriginatorActivated)

  return {
    version: SIGNED_OTP_ROLE_OWNERSHIP_VERSION,
    agent: financeHandoffBlocked
      ? {
          state: 'action_required',
          ownerRole: 'agent',
          waitingOnRole: 'agent',
          nextAction: 'Assign a bond originator to release the finance handoff.',
        }
      : {
          state: 'monitoring',
          ownerRole: 'transaction_team',
          waitingOnRole: originatorManagedFinance ? 'bond_originator' : 'transfer_attorney',
          nextAction: 'Monitor the released handoff and resolve any control-board blockers.',
        },
    buyer: {
      state: 'action_required_if_requested',
      ownerRole: 'buyer',
      waitingOnRole: originatorManagedFinance ? 'bond_originator' : 'transaction_team',
      nextAction: originatorManagedFinance
        ? 'Complete the existing bond application or finance requirements shown in the buyer portal.'
        : normalizedFinanceType === 'bond' || normalizedFinanceType === 'hybrid'
          ? 'Provide external finance evidence only through existing requested document slots.'
          : 'Provide proof of funds only when it appears as an existing portal requirement.',
    },
    seller: {
      state: 'no_action_required',
      ownerRole: 'transaction_team',
      waitingOnRole: 'transaction_team',
      nextAction: 'Track finance and transfer progress in the seller portal.',
    },
    financeType: normalizedFinanceType || 'unknown',
    financeManagedBy: normalizedFinanceManagedBy || null,
  }
}

function buildNotificationPayload({
  transactionId = '',
  status = '',
  originatorManagedFinance = false,
  bondOriginatorActivated = false,
  nextAction = '',
  source = '',
  eventData = {},
} = {}) {
  if (!transactionId) return null

  const blocked = originatorManagedFinance && !bondOriginatorActivated
  return {
    roleTypes: blocked
      ? ['agent', 'developer', 'attorney']
      : originatorManagedFinance
        ? ['bond_originator', 'developer', 'agent', 'attorney']
        : ['attorney', 'developer', 'agent'],
    title: blocked
      ? 'Finance handoff blocked'
      : originatorManagedFinance
        ? 'Finance handoff ready'
        : 'Transfer handoff ready',
    message: blocked
      ? 'Signed OTP finalised, but the bond originator must be assigned before finance handoff can proceed.'
      : originatorManagedFinance
        ? 'Signed OTP finalised. Finance workflow has been triggered.'
        : 'Signed OTP finalised. Transfer workflow can proceed.',
    notificationType: blocked ? 'readiness_updated' : 'lane_handoff',
    eventType: 'signed_otp_handoff_release_decision',
    eventData: {
      source,
      signedOtpHandoffReleaseStatus: status,
      nextAction,
      ...eventData,
    },
    dedupePrefix: `signed-otp-handoff:${status}`,
  }
}

export function buildSignedOtpHandoffReleaseDecision({
  transaction = {},
  financeType = '',
  financeManagedBy = '',
  originatorManagedFinance = null,
  bondOriginatorActivation = null,
  attorneyActivation = [],
  mandateAllocationPromotion = null,
  stageResult = null,
  nextAction = '',
  releasedAt = '',
  source = 'signed_otp_received',
} = {}) {
  const transactionId = firstText(transaction.id, transaction.transactionId, transaction.transaction_id)
  const normalizedFinanceType = normalizeFinanceType(
    firstText(financeType, transaction.finance_type, transaction.financeType),
    { allowUnknown: true },
  )
  const normalizedFinanceManagedBy = normalizeFinanceManagedBy({ transaction, financeManagedBy })
  const bondFinance = isBondFinanceType(normalizedFinanceType)
  const resolvedOriginatorManagedFinance = originatorManagedFinance === null
    ? bondFinance && normalizedFinanceManagedBy === 'bond_originator'
    : Boolean(originatorManagedFinance)
  const bondOriginatorActivated = isBondOriginatorActivated(bondOriginatorActivation)
  const activatedAttorneyLanes = attorneyActivationLanes(attorneyActivation)
  const releasedLanes = unique([
    'transfer_attorney',
    ...activatedAttorneyLanes,
    resolvedOriginatorManagedFinance && bondOriginatorActivated ? 'bond_originator' : '',
  ])
  const gatedLanes = unique([
    resolvedOriginatorManagedFinance && !bondOriginatorActivated ? 'bond_originator' : '',
  ])
  const status = resolvedOriginatorManagedFinance
    ? bondOriginatorActivated
      ? 'finance_and_transfer_handoff_released'
      : 'finance_handoff_blocked_originator_missing'
    : bondFinance
      ? 'transfer_handoff_released_buyer_managed_finance'
      : 'transfer_handoff_released'
  const workflow = resolvedOriginatorManagedFinance ? 'finance' : 'attorney'
  const roleOwnership = buildSignedOtpRoleOwnership({
    originatorManagedFinance: resolvedOriginatorManagedFinance,
    bondOriginatorActivated,
    financeType: normalizedFinanceType,
    financeManagedBy: normalizedFinanceManagedBy,
  })
  const eventData = {
    version: SIGNED_OTP_HANDOFF_RELEASE_VERSION,
    status,
    source,
    workflow,
    financeType: normalizedFinanceType || 'unknown',
    financeManagedBy: normalizedFinanceManagedBy || null,
    originatorManagedFinance: resolvedOriginatorManagedFinance,
    bondOriginatorActivated,
    releasedLanes,
    gatedLanes,
    attorneyActivationCount: activatedAttorneyLanes.length,
    mandateAllocationPromoted: Boolean(mandateAllocationPromotion?.updatedCount),
    mandateAllocationPromotionCount: Number(mandateAllocationPromotion?.updatedCount || 0),
    stageAdvanced: Boolean(stageResult?.advanced),
    nextAction: firstText(nextAction),
    roleOwnership,
  }

  return {
    version: SIGNED_OTP_HANDOFF_RELEASE_VERSION,
    transactionId: transactionId || null,
    releasedAt: firstText(releasedAt) || null,
    status,
    workflow,
    financeType: normalizedFinanceType || 'unknown',
    financeManagedBy: normalizedFinanceManagedBy || null,
    originatorManagedFinance: resolvedOriginatorManagedFinance,
    bondOriginatorActivated,
    releasedLanes,
    gatedLanes,
    nextAction: firstText(nextAction),
    roleOwnership,
    notification: buildNotificationPayload({
      transactionId,
      status,
      originatorManagedFinance: resolvedOriginatorManagedFinance,
      bondOriginatorActivated,
      nextAction: firstText(nextAction),
      source,
      eventData,
    }),
    event: {
      type: 'signed_otp_handoff_release_decision',
      data: eventData,
    },
  }
}
