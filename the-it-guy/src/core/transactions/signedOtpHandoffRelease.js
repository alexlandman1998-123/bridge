import { isBondFinanceType, normalizeFinanceType } from './financeType.js'

export const SIGNED_OTP_HANDOFF_RELEASE_VERSION = 'arch9_signed_otp_handoff_release_v1'

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
