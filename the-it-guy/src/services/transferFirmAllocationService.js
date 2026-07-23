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

export const ATTORNEY_FIRM_ALLOCATION_LANES = Object.freeze({
  transfer: Object.freeze({
    key: 'transfer',
    attorneyRole: 'transfer_attorney',
    label: 'Transfer Attorney',
  }),
  bond: Object.freeze({
    key: 'bond',
    attorneyRole: 'bond_attorney',
    label: 'Bond Attorney',
  }),
  cancellation: Object.freeze({
    key: 'cancellation',
    attorneyRole: 'cancellation_attorney',
    label: 'Cancellation Attorney',
  }),
})

function normalizeLaneKey(value = '') {
  const normalized = normalizeText(value).toLowerCase().replace(/_attorney$/, '')
  if (normalized === 'transfer_and_bond') return 'transfer'
  return ATTORNEY_FIRM_ALLOCATION_LANES[normalized] ? normalized : 'transfer'
}

export function getAttorneyFirmAllocationLane(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  const laneKey = normalizeLaneKey(normalized)
  return ATTORNEY_FIRM_ALLOCATION_LANES[laneKey]
}

export function getAttorneyFirmAllocationLaneLabel(value = '') {
  return getAttorneyFirmAllocationLane(value).label
}

function mapAllocation(row, fallbackLaneKey = 'transfer') {
  if (!row) return null
  const lane = getAttorneyFirmAllocationLane(row.attorney_role || row.assignment_type || fallbackLaneKey)
  return {
    id: row.id,
    transactionId: row.transaction_id,
    firmId: row.attorney_firm_id || row.firm_id,
    laneKey: lane.key,
    attorneyRole: row.attorney_role || lane.attorneyRole,
    assignmentType: row.assignment_type || lane.key,
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

function isMissingAttorneyAllocationRpc(error) {
  const code = String(error?.code || '').toUpperCase()
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return code === '42883' || code === 'PGRST202' || message.includes('bridge_manage_attorney_firm_allocation')
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

export async function getAttorneyFirmAllocation(
  transactionId,
  { laneKey = 'transfer', client = requireClient() } = {},
) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) return null
  const lane = getAttorneyFirmAllocationLane(laneKey)

  const result = await client
    .from('transaction_attorney_assignments')
    .select(ALLOCATION_SELECT)
    .eq('transaction_id', normalizedTransactionId)
    .eq('attorney_role', lane.attorneyRole)
    .eq('is_primary', true)
    .neq('allocation_state', 'removed')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (result.error) {
    if (isPhaseFiveUnavailable(result.error)) return null
    throw result.error
  }
  return mapAllocation(result.data, lane.key)
}

export async function getTransferFirmAllocation(transactionId, { client = requireClient() } = {}) {
  return getAttorneyFirmAllocation(transactionId, { laneKey: 'transfer', client })
}

export async function manageAttorneyFirmAllocation({
  assignmentId,
  action,
  attorneyUserId = null,
  reason = null,
  laneKey = 'transfer',
}, { client = requireClient() } = {}) {
  const normalizedAssignmentId = normalizeText(assignmentId)
  const normalizedAction = normalizeText(action).toLowerCase()
  const lane = getAttorneyFirmAllocationLane(laneKey)
  if (!normalizedAssignmentId) throw new Error(`${lane.label} firm allocation is required.`)
  if (!['accept', 'decline', 'assign_primary', 'activate'].includes(normalizedAction)) {
    throw new Error(`Unsupported ${lane.key} firm allocation action.`)
  }
  if (normalizedAction === 'assign_primary' && !normalizeText(attorneyUserId)) {
    throw new Error(`Choose a primary ${lane.label.toLowerCase()}.`)
  }
  if (normalizedAction === 'decline' && !normalizeText(reason)) {
    throw new Error('Add a reason before declining this nomination.')
  }

  const input = {
    p_assignment_id: normalizedAssignmentId,
    p_action: normalizedAction,
    p_attorney_user_id: normalizeText(attorneyUserId) || null,
    p_reason: normalizeText(reason) || null,
  }
  let result = await client.rpc('bridge_manage_attorney_firm_allocation', input)

  // Only transfer had a legacy allocation endpoint. Do not route bond or
  // cancellation through it: that would silently operate the wrong lane.
  if (result.error && lane.key === 'transfer' && isMissingAttorneyAllocationRpc(result.error)) {
    result = await client.rpc('bridge_manage_transfer_firm_allocation', input)
  }
  if (result.error) throw result.error
  return mapAllocation(Array.isArray(result.data) ? result.data[0] : result.data, lane.key)
}

export async function manageTransferFirmAllocation(input, options = {}) {
  return manageAttorneyFirmAllocation({ ...input, laneKey: 'transfer' }, options)
}
