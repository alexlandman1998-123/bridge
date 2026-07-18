import {
  isMissingColumnError,
  isMissingTableError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared.js'

const ALLOCATION_SELECT = [
  'id',
  'transaction_id',
  'attorney_firm_id',
  'firm_id',
  'attorney_user_id',
  'primary_attorney_id',
  'attorney_role',
  'assignment_type',
  'assignment_status',
  'status',
  'is_primary',
  'appointment_source',
  'preferred_contact_name',
  'preferred_contact_email',
  'preferred_attorney_user_id',
  'firm_acceptance_status',
  'firm_accepted_at',
  'firm_accepted_by',
  'firm_declined_at',
  'firm_declined_by',
  'firm_decline_reason',
  'staff_assignment_status',
  'allocation_state',
  'allocation_state_changed_at',
  'updated_at',
].join(', ')

export const TRANSFER_FIRM_ALLOCATION_STATES = Object.freeze({
  awaitingFirmAcceptance: 'awaiting_firm_acceptance',
  awaitingStaffAssignment: 'awaiting_staff_assignment',
  staffAssigned: 'staff_assigned',
  active: 'active',
  declined: 'declined',
  removed: 'removed',
})

function mapAllocation(row) {
  if (!row) return null
  return {
    id: row.id,
    transactionId: row.transaction_id,
    firmId: row.attorney_firm_id || row.firm_id,
    attorneyUserId: row.attorney_user_id || row.primary_attorney_id || null,
    appointmentSource: row.appointment_source || '',
    preferredContactName: row.preferred_contact_name || '',
    preferredContactEmail: row.preferred_contact_email || '',
    preferredAttorneyUserId: row.preferred_attorney_user_id || null,
    firmAcceptanceStatus: row.firm_acceptance_status || 'not_required',
    firmAcceptedAt: row.firm_accepted_at || null,
    firmDeclinedAt: row.firm_declined_at || null,
    firmDeclineReason: row.firm_decline_reason || '',
    staffAssignmentStatus: row.staff_assignment_status || 'not_required',
    allocationState: row.allocation_state || 'active',
    assignmentStatus: row.assignment_status || row.status || 'pending',
    stateChangedAt: row.allocation_state_changed_at || row.updated_at || null,
  }
}

function isPhaseFiveUnavailable(error) {
  return isMissingTableError(error, 'transaction_attorney_assignments') ||
    isMissingColumnError(error, 'allocation_state') ||
    isMissingColumnError(error, 'firm_acceptance_status')
}

export function getTransferFirmAllocationLabel(state) {
  if (state === TRANSFER_FIRM_ALLOCATION_STATES.awaitingFirmAcceptance) return 'Awaiting firm acceptance'
  if (state === TRANSFER_FIRM_ALLOCATION_STATES.awaitingStaffAssignment) return 'Awaiting internal assignment'
  if (state === TRANSFER_FIRM_ALLOCATION_STATES.staffAssigned) return 'Primary attorney assigned'
  if (state === TRANSFER_FIRM_ALLOCATION_STATES.active) return 'Active'
  if (state === TRANSFER_FIRM_ALLOCATION_STATES.declined) return 'Declined by firm'
  if (state === TRANSFER_FIRM_ALLOCATION_STATES.removed) return 'Removed'
  return 'Pending'
}

export async function getTransferFirmAllocation(transactionId, { client = requireClient() } = {}) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) return null

  const result = await client
    .from('transaction_attorney_assignments')
    .select(ALLOCATION_SELECT)
    .eq('transaction_id', normalizedTransactionId)
    .eq('attorney_role', 'transfer_attorney')
    .eq('is_primary', true)
    .neq('allocation_state', 'removed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    if (isPhaseFiveUnavailable(result.error)) return null
    throw result.error
  }
  return mapAllocation(result.data)
}

export async function manageTransferFirmAllocation({
  assignmentId,
  action,
  attorneyUserId = null,
  reason = null,
}, { client = requireClient() } = {}) {
  const normalizedAssignmentId = normalizeText(assignmentId)
  const normalizedAction = normalizeText(action).toLowerCase()
  if (!normalizedAssignmentId) throw new Error('Transfer firm allocation is required.')
  if (!['accept', 'decline', 'assign_primary', 'activate'].includes(normalizedAction)) {
    throw new Error('Unsupported transfer firm allocation action.')
  }
  if (normalizedAction === 'assign_primary' && !normalizeText(attorneyUserId)) {
    throw new Error('Choose a primary transfer attorney.')
  }
  if (normalizedAction === 'decline' && !normalizeText(reason)) {
    throw new Error('Add a reason before declining this nomination.')
  }

  const result = await client.rpc('bridge_manage_transfer_firm_allocation', {
    p_assignment_id: normalizedAssignmentId,
    p_action: normalizedAction,
    p_attorney_user_id: normalizeText(attorneyUserId) || null,
    p_reason: normalizeText(reason) || null,
  })
  if (result.error) throw result.error
  return mapAllocation(Array.isArray(result.data) ? result.data[0] : result.data)
}
