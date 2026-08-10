import { isBondFinanceType, normalizeFinanceType } from './financeType.js'

export const BOND_ASSISTANCE_ROUTING_VERSION = 'arch9_bond_assistance_routing_v1'

const ACTIVE_ROLE_STATUSES = new Set(['', 'active', 'assigned', 'current', 'pending', 'selected', 'in_progress', 'started'])
const ACCEPTED_ASSIGNMENT_STATUSES = new Set([
  'accepted',
  'assigned',
  'consultant_assigned',
  'processor_assigned',
  'fully_assigned',
  'workspace_assigned',
])

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function normalizeYesNo(value = '') {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  const normalized = lower(value)
  if (['yes', 'y', 'true', '1'].includes(normalized)) return 'yes'
  if (['no', 'n', 'false', '0'].includes(normalized)) return 'no'
  return ''
}

function normalizeSelection(value = '') {
  const normalized = lower(value)
  if (['agency_partner', 'agency', 'preferred', 'preferred_originator', 'agency_preferred'].includes(normalized)) {
    return 'agency_partner'
  }
  if (['buyer_nominated', 'buyer', 'nominated', 'own_originator', 'my_originator'].includes(normalized)) {
    return 'buyer_nominated'
  }
  if (['third_party', 'external', 'other'].includes(normalized)) return 'third_party'
  return ''
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

function resolveFinanceType({ transaction = {}, formData = {}, financeSnapshot = {} } = {}) {
  return normalizeFinanceType(
    firstText(
      financeSnapshot.financeType,
      financeSnapshot.finance_type,
      formData.purchase_finance_type,
      formData.purchaseFinanceType,
      formData.finance_type,
      formData.financeType,
      formData.finance?.purchase_finance_type,
      formData.finance?.finance_type,
      formData.finance?.financeType,
      transaction.finance_type,
      transaction.financeType,
    ),
    { allowUnknown: true },
  )
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

function resolveBondHelpRequested(formData = {}, buyerBondOriginatorRequest = {}) {
  return normalizeYesNo(
    firstText(
      formData.bond_help_requested,
      formData.bondHelpRequested,
      formData.ooba_assist_requested,
      formData.oobaAssistRequested,
      formData.finance?.bond_help_requested,
      formData.finance?.bondHelpRequested,
      formData.finance?.ooba_assist_requested,
      formData.finance?.oobaAssistRequested,
      buyerBondOriginatorRequest?.requested ? 'yes' : '',
    ),
  )
}

function buildNotificationPayload({ transactionId = '', status = '', title = '', message = '', source = '', eventData = {} } = {}) {
  if (!transactionId) return null
  return {
    roleTypes: ['agent', 'developer'],
    title,
    message,
    notificationType: status === 'pending_buyer_originator_approval' ? 'roleplayer_change_requested' : 'readiness_updated',
    eventType: 'bond_assistance_routing_decision',
    eventData: {
      source,
      bondAssistanceRoutingStatus: status,
      requestedRoleType: 'bond_originator',
      ...eventData,
    },
    dedupePrefix: `bond-assistance-routing:${status}`,
  }
}

export function buildBondAssistanceRoutingDecision({
  transaction = {},
  onboarding = {},
  formData = {},
  financeSnapshot = {},
  rolePlayers = [],
  buyerBondOriginatorRequest = {},
  completedAt = '',
  source = 'buyer_onboarding_completed',
} = {}) {
  const transactionId = firstText(transaction.id, transaction.transactionId, transaction.transaction_id, onboarding.transaction_id)
  const onboardingId = firstText(onboarding.id, onboarding.onboardingId)
  const financeType = resolveFinanceType({ transaction, formData, financeSnapshot })
  const financeManagedBy = resolveFinanceManagedBy({ transaction, formData })
  const bondHelpRequested = resolveBondHelpRequested(formData, buyerBondOriginatorRequest)
  const selectionSource =
    normalizeSelection(buyerBondOriginatorRequest?.selectionSource) ||
    normalizeSelection(
      firstText(
        formData.bond_assistance_selection,
        formData.bondAssistanceSelection,
        formData.finance?.bond_assistance_selection,
        formData.finance?.bondAssistanceSelection,
      ),
    )
  const requestStatus = lower(buyerBondOriginatorRequest?.status)
  const assigned = hasBondAssignment({ transaction, rolePlayers })
  const isBondFinance = isBondFinanceType(financeType)
  const base = {
    version: BOND_ASSISTANCE_ROUTING_VERSION,
    transactionId: transactionId || null,
    onboardingId: onboardingId || null,
    completedAt: firstText(completedAt) || null,
    financeType: financeType || 'unknown',
    financeManagedBy: financeManagedBy || null,
    bondHelpRequested,
    selectionSource: selectionSource || null,
    requestStatus: requestStatus || null,
    assigned,
    assignmentRequired: false,
    notification: null,
    event: null,
    agentSelectionPoint: 'after_buyer_onboarding_submit_before_signed_otp_handoff',
  }

  if (!isBondFinance) {
    return { ...base, status: 'not_bond_finance', nextAction: '' }
  }

  if (financeManagedBy !== 'bond_originator' || bondHelpRequested === 'no') {
    return { ...base, status: 'client_managed_finance', nextAction: '' }
  }

  if (assigned) {
    return {
      ...base,
      status: 'bond_originator_assigned',
      nextAction: 'Keep the selected bond originator ready; release formal finance handoff after signed OTP.',
    }
  }

  let status = 'originator_selection_required'
  let title = 'Bond originator selection required'
  let message = 'Buyer requested bond assistance. Select or confirm the bond originator before formal finance handoff.'
  let nextAction = 'Select or confirm the bond originator before formal finance handoff.'

  if (requestStatus === 'pending_approval') {
    const companyName = firstText(
      buyerBondOriginatorRequest.companyName,
      buyerBondOriginatorRequest.company_name,
      'the buyer-appointed bond originator',
    )
    status = 'pending_buyer_originator_approval'
    title = 'Buyer bond originator request'
    message = `Buyer nominated ${companyName}. Approve or reject the request before formal finance handoff.`
    nextAction = 'Approve or reject the buyer-appointed bond originator request.'
  } else if (selectionSource === 'agency_partner' || !selectionSource) {
    status = 'agency_originator_selection_required'
    nextAction = 'Select or confirm the agency preferred bond originator.'
  } else if (selectionSource === 'buyer_nominated' || selectionSource === 'third_party') {
    status = 'buyer_originator_assignment_required'
    nextAction = 'Review the buyer-nominated originator details and complete the bond originator assignment.'
  }

  const notification = buildNotificationPayload({
    transactionId,
    status,
    title,
    message,
    source,
    eventData: {
      selectionSource: selectionSource || null,
      requestStatus: requestStatus || null,
      financeType: financeType || 'unknown',
      financeManagedBy: financeManagedBy || null,
      bondHelpRequested,
    },
  })

  return {
    ...base,
    status,
    assignmentRequired: true,
    priority: requestStatus === 'pending_approval' ? 'high' : 'normal',
    nextAction,
    notification,
    event: {
      type: 'bond_assistance_routing_decision',
      data: {
        version: BOND_ASSISTANCE_ROUTING_VERSION,
        status,
        assignmentRequired: true,
        source,
        selectionSource: selectionSource || null,
        requestStatus: requestStatus || null,
        financeType: financeType || 'unknown',
        financeManagedBy: financeManagedBy || null,
        bondHelpRequested,
        nextAction,
      },
    },
  }
}
