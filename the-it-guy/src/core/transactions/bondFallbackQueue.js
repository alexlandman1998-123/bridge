import { isBondFinanceType, normalizeFinanceType } from './financeType.js'

export const BOND_FALLBACK_QUEUE_VERSION = 'arch9_bond_fallback_queue_v1'
export const BOND_FALLBACK_QUEUE_KEY = 'bond_fallback'

const ACTIVE_ROLE_STATUSES = new Set(['', 'active', 'assigned', 'current', 'pending', 'selected', 'in_progress', 'started'])
const ACCEPTED_ASSIGNMENT_STATUSES = new Set([
  'accepted',
  'assigned',
  'consultant_assigned',
  'processor_assigned',
  'fully_assigned',
  'workspace_assigned',
])
const OTP_READY_STATUSES = new Set(['awaiting_signed_otp', 'signed_otp_received', 'otp_uploaded'])

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase().replace(/\s+/g, '_')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function roleRows(input = {}) {
  return [
    ...(Array.isArray(input.rolePlayers) ? input.rolePlayers : []),
    ...(Array.isArray(input.role_players) ? input.role_players : []),
    ...(Array.isArray(input.transactionRolePlayers) ? input.transactionRolePlayers : []),
    ...(Array.isArray(input.transaction_role_players) ? input.transaction_role_players : []),
    ...(Array.isArray(input.transaction?.rolePlayers) ? input.transaction.rolePlayers : []),
    ...(Array.isArray(input.transaction?.transactionRolePlayers) ? input.transaction.transactionRolePlayers : []),
    ...(Array.isArray(input.transaction?.transaction_role_players) ? input.transaction.transaction_role_players : []),
  ]
}

function hasActiveBondOriginatorRole(input = {}) {
  return roleRows(input).some((row) => {
    const role = lower(row.role_type || row.roleType || row.role || row.transaction_role || row.transactionRole)
    if (!['bond_originator', 'bond_originator_consultant', 'bond_consultant'].includes(role)) return false
    const status = lower(row.assignment_status || row.assignmentStatus || row.status)
    return ACTIVE_ROLE_STATUSES.has(status)
  })
}

function hasBondAssignment({ transaction = {}, rolePlayers = [] } = {}) {
  const assignmentStatus = lower(transaction.bond_assignment_status || transaction.bondAssignmentStatus)
  if (ACCEPTED_ASSIGNMENT_STATUSES.has(assignmentStatus)) return true
  if (
    firstText(
      transaction.assigned_bond_originator_email,
      transaction.assignedBondOriginatorEmail,
      transaction.primary_bond_consultant_user_id,
      transaction.primaryBondConsultantUserId,
      transaction.bond_originator_user_id,
      transaction.bondOriginatorUserId,
      transaction.bond_workspace_id,
      transaction.bondWorkspaceId,
      transaction.bond_originator,
      transaction.bondOriginator,
    )
  ) {
    return true
  }
  return hasActiveBondOriginatorRole({ rolePlayers, transaction })
}

function resolveFinanceManagedBy({ transaction = {}, formData = {} } = {}) {
  return lower(
    firstText(
      formData.finance_managed_by,
      formData.financeManagedBy,
      formData.finance?.finance_managed_by,
      formData.finance?.financeManagedBy,
      transaction.finance_managed_by,
      transaction.financeManagedBy,
    ),
  )
}

function resolveFinanceType({ transaction = {}, formData = {}, financeSnapshot = {} } = {}) {
  return normalizeFinanceType(
    firstText(
      financeSnapshot.financeType,
      financeSnapshot.finance_type,
      formData.finance_type,
      formData.financeType,
      formData.purchase_finance_type,
      formData.purchaseFinanceType,
      formData.finance?.finance_type,
      formData.finance?.financeType,
      transaction.finance_type,
      transaction.financeType,
    ),
    { allowUnknown: true },
  )
}

function hasSignedOtp(transaction = {}, completionHook = {}) {
  const status = lower(
    transaction.onboarding_status ||
      transaction.onboardingStatus ||
      completionHook.onboardingStatus,
  )
  if (status === 'signed_otp_received' || status === 'otp_uploaded') return true
  return Boolean(
    firstText(
      transaction.signed_otp_uploaded_at,
      transaction.signedOtpUploadedAt,
      transaction.otp_uploaded_at,
      transaction.otpUploadedAt,
    ),
  )
}

function isAwaitingSignedOtp(transaction = {}, completionHook = {}) {
  const status = lower(
    transaction.onboarding_status ||
      transaction.onboardingStatus ||
      completionHook.onboardingStatus,
  )
  return OTP_READY_STATUSES.has(status) && !hasSignedOtp(transaction, completionHook)
}

function reason(key, label, detail, action = '') {
  return { key, label, detail, action }
}

export function buildBondFallbackQueueCandidate({
  transaction = {},
  onboarding = {},
  formData = {},
  financeSnapshot = {},
  rolePlayers = [],
  buyerBondOriginatorRequest = {},
  completionHook = {},
  completedAt = '',
  source = 'buyer_onboarding_completed',
} = {}) {
  const transactionId = firstText(transaction.id, transaction.transactionId, transaction.transaction_id, onboarding.transaction_id)
  const financeType = resolveFinanceType({ transaction, formData, financeSnapshot })
  const financeManagedBy = resolveFinanceManagedBy({ transaction, formData })
  const originatorManaged = isBondFinanceType(financeType) && financeManagedBy === 'bond_originator'
  const assigned = hasBondAssignment({ transaction, rolePlayers })
  const requestedStatus = lower(buyerBondOriginatorRequest.status)
  const buyerRequestedOriginator = requestedStatus === 'requested'
  const awaitingSignedOtp = isAwaitingSignedOtp(transaction, completionHook)
  const reasons = []

  if (!isBondFinanceType(financeType)) {
    return {
      version: BOND_FALLBACK_QUEUE_VERSION,
      queueKey: BOND_FALLBACK_QUEUE_KEY,
      required: false,
      status: 'not_bond_finance',
      transactionId: transactionId || null,
      financeType: financeType || 'unknown',
      financeManagedBy: financeManagedBy || null,
      reasons: [],
      nextAction: '',
      event: null,
    }
  }

  if (!originatorManaged) {
    return {
      version: BOND_FALLBACK_QUEUE_VERSION,
      queueKey: BOND_FALLBACK_QUEUE_KEY,
      required: false,
      status: 'client_managed_finance',
      transactionId: transactionId || null,
      financeType: financeType || 'unknown',
      financeManagedBy: financeManagedBy || null,
      reasons: [],
      nextAction: '',
      event: null,
    }
  }

  if (!assigned) {
    reasons.push(reason(
      'no_bond_originator_assignment',
      'Bond originator not assigned',
      'Bond finance is originator-managed, but no bond originator workspace, consultant, email, or active role-player is linked.',
      'Assign a bond originator or route the transaction to the bond operations fallback owner.',
    ))
  }

  if (buyerRequestedOriginator && !assigned) {
    reasons.push(reason(
      'buyer_requested_originator_pending',
      'Buyer-appointed originator pending',
      'The buyer requested a bond originator, but the request has not produced an active transaction assignment.',
      'Review the buyer-appointed originator request and complete the assignment.',
    ))
  }

  if (awaitingSignedOtp) {
    reasons.push(reason(
      'awaiting_signed_otp',
      'Signed OTP pending',
      'Formal finance handoff remains gated until the signed OTP is uploaded.',
      completionHook.nextAction || 'Upload the signed OTP before releasing finance or attorney handoff.',
    ))
  }

  const required = reasons.some((item) => item.key !== 'awaiting_signed_otp')
  const status = required ? 'queued' : assigned ? 'covered' : 'monitor'
  const priority = buyerRequestedOriginator || !assigned ? 'high' : awaitingSignedOtp ? 'normal' : 'low'
  const nextAction = reasons.find((item) => item.key !== 'awaiting_signed_otp')?.action ||
    reasons[0]?.action ||
    ''

  return {
    version: BOND_FALLBACK_QUEUE_VERSION,
    queueKey: BOND_FALLBACK_QUEUE_KEY,
    required,
    status,
    priority,
    transactionId: transactionId || null,
    onboardingId: firstText(onboarding.id, onboarding.onboardingId) || null,
    completedAt: firstText(completedAt, completionHook.completedAt) || null,
    financeType: financeType || 'unknown',
    financeManagedBy: financeManagedBy || null,
    assigned,
    buyerRequestedOriginator,
    awaitingSignedOtp,
    reasons,
    nextAction,
    event: required
      ? {
          type: 'bond_fallback_queue_candidate',
          data: {
            version: BOND_FALLBACK_QUEUE_VERSION,
            queueKey: BOND_FALLBACK_QUEUE_KEY,
            status,
            priority,
            source,
            financeType: financeType || 'unknown',
            financeManagedBy: financeManagedBy || null,
            buyerRequestedOriginator,
            awaitingSignedOtp,
            reasonKeys: reasons.map((item) => item.key),
            nextAction,
          },
        }
      : null,
    metadata: isPlainObject(completionHook) ? { completionHookVersion: completionHook.version || null } : {},
  }
}
