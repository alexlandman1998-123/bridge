import { normalizeText, requireClient } from './attorneyFirmServiceShared.js'

export const ATTORNEY_NOMINATABLE_LANES = Object.freeze({
  bond: 'bond_attorney',
  cancellation: 'cancellation_attorney',
})

export const ATTORNEY_FIRM_ALLOCATION_ACTIONS = Object.freeze({
  accept: 'accept',
  decline: 'decline',
  assignPrimary: 'assign_primary',
  activate: 'activate',
})

function normalizeLaneRole(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  if (normalized === 'bond' || normalized === 'bond_attorney') return 'bond_attorney'
  if (normalized === 'cancellation' || normalized === 'cancellation_attorney') return 'cancellation_attorney'
  throw new Error('Select a bond or cancellation attorney lane.')
}

function unwrapRpcRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null
}

function assertClient(client) {
  if (!client?.rpc) throw new Error('Supabase client is required.')
  return client
}

export function buildAttorneyFirmNominationInput({ transactionId = '', attorneyRole = '', attorneyFirmId = '', reason = '' } = {}) {
  const resolvedTransactionId = normalizeText(transactionId)
  const resolvedFirmId = normalizeText(attorneyFirmId)
  if (!resolvedTransactionId) throw new Error('Transaction is required before nominating an attorney firm.')
  if (!resolvedFirmId) throw new Error('Select the attorney firm to nominate.')
  return {
    p_transaction_id: resolvedTransactionId,
    p_attorney_role: normalizeLaneRole(attorneyRole),
    p_attorney_firm_id: resolvedFirmId,
    p_reason: normalizeText(reason) || null,
  }
}

export async function nominateAttorneyLaneFirm(input = {}, options = {}) {
  const client = assertClient(options.client || requireClient())
  const payload = buildAttorneyFirmNominationInput(input)
  const result = await client.rpc('bridge_nominate_attorney_lane_firm', payload)
  if (result.error) throw result.error
  return unwrapRpcRow(result.data)
}

export async function manageAttorneyFirmAllocation({ assignmentId = '', action = '', attorneyUserId = '', reason = '' } = {}, options = {}) {
  const client = assertClient(options.client || requireClient())
  const resolvedAssignmentId = normalizeText(assignmentId)
  const resolvedAction = normalizeText(action).toLowerCase()
  if (!resolvedAssignmentId) throw new Error('Attorney assignment is required.')
  if (!Object.values(ATTORNEY_FIRM_ALLOCATION_ACTIONS).includes(resolvedAction)) {
    throw new Error('Select a supported firm-allocation action.')
  }
  if (resolvedAction === ATTORNEY_FIRM_ALLOCATION_ACTIONS.assignPrimary && !normalizeText(attorneyUserId)) {
    throw new Error('Select the primary attorney allocated by the responsible firm.')
  }
  if (resolvedAction === ATTORNEY_FIRM_ALLOCATION_ACTIONS.decline && !normalizeText(reason)) {
    throw new Error('Add a reason before declining the nomination.')
  }

  const result = await client.rpc('bridge_manage_attorney_firm_allocation', {
    p_assignment_id: resolvedAssignmentId,
    p_action: resolvedAction,
    p_attorney_user_id: normalizeText(attorneyUserId) || null,
    p_reason: normalizeText(reason) || null,
  })
  if (result.error) throw result.error
  return unwrapRpcRow(result.data)
}

export function buildAttorneyAllocationStatus(assignment = {}) {
  const role = normalizeLaneRole(assignment.attorney_role || assignment.attorneyRole || assignment.assignment_type || assignment.assignmentType)
  const allocationState = normalizeText(assignment.allocation_state || assignment.allocationState || 'awaiting_firm_acceptance')
  const firmId = normalizeText(assignment.attorney_firm_id || assignment.attorneyFirmId || assignment.firm_id || assignment.firmId)
  const attorneyUserId = normalizeText(assignment.attorney_user_id || assignment.attorneyUserId || assignment.primary_attorney_id || assignment.primaryAttorneyId)
  return Object.freeze({
    assignmentId: normalizeText(assignment.id) || null,
    attorneyRole: role,
    firmId: firmId || null,
    firmName: normalizeText(assignment.firm_name || assignment.firmName) || 'Nominated firm',
    attorneyUserId: attorneyUserId || null,
    firmAcceptanceStatus: normalizeText(assignment.firm_acceptance_status || assignment.firmAcceptanceStatus || 'awaiting_firm_acceptance'),
    staffAssignmentStatus: normalizeText(assignment.staff_assignment_status || assignment.staffAssignmentStatus || 'awaiting_staff_assignment'),
    allocationState,
    mayFirmRespond: allocationState === 'awaiting_firm_acceptance',
    mayAllocatePrimary: allocationState === 'awaiting_staff_assignment',
    mayActivate: allocationState === 'staff_assigned' && Boolean(attorneyUserId),
    isActive: allocationState === 'active',
  })
}
