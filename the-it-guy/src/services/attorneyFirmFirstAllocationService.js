import {
  ATTORNEY_ALLOCATION_STATES,
  ATTORNEY_FIRM_ACCEPTANCE_STATUSES,
  ATTORNEY_STAFF_ASSIGNMENT_STATUSES,
  canTransitionAttorneyAllocation,
} from '../core/transactions/attorneyFirmFirstAllocation.js'
import {
  getAuthenticatedUser,
  isMissingColumnError,
  isMissingTableError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared.js'

const ASSIGNMENT_SELECT =
  'id, transaction_id, firm_id, attorney_firm_id, assignment_type, attorney_role, primary_attorney_id, attorney_user_id, preferred_attorney_user_id, preferred_contact_name, preferred_contact_email, preferred_contact_phone, appointment_source, firm_acceptance_status, firm_accepted_by, firm_accepted_at, staff_assignment_status, allocation_state, allocation_state_changed_at, declined_by, declined_at, decline_reason, replacement_required_by, replacement_required_at, replacement_reason, superseded_by_assignment_id, status, assignment_status, instruction_status, is_primary, assigned_by, assigned_at, created_at, updated_at'

const TRANSFER_ROLE = 'transfer_attorney'
const TRANSFER_TYPE = 'transfer'
const FIRM_MANAGEMENT_ROLES = new Set(['firm_admin', 'director_partner'])
const TRANSFER_PRIMARY_ROLES = new Set(['transfer_attorney', 'director_partner', 'firm_admin'])
const OPEN_ALLOCATION_STATES = [
  ATTORNEY_ALLOCATION_STATES.awaitingFirmAcceptance,
  ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment,
  ATTORNEY_ALLOCATION_STATES.staffAssigned,
  ATTORNEY_ALLOCATION_STATES.active,
]

export function mapAttorneyFirmFirstAllocationRow(row) {
  if (!row) return null
  return {
    id: row.id,
    transactionId: row.transaction_id,
    attorneyFirmId: row.attorney_firm_id || row.firm_id,
    firmId: row.attorney_firm_id || row.firm_id,
    attorneyRole: row.attorney_role,
    assignmentType: row.assignment_type,
    attorneyUserId: row.attorney_user_id || row.primary_attorney_id || null,
    primaryAttorneyId: row.primary_attorney_id || row.attorney_user_id || null,
    preferredAttorneyUserId: row.preferred_attorney_user_id || null,
    preferredContactName: row.preferred_contact_name || null,
    preferredContactEmail: row.preferred_contact_email || null,
    preferredContactPhone: row.preferred_contact_phone || null,
    appointmentSource: row.appointment_source,
    firmAcceptanceStatus: row.firm_acceptance_status,
    firmAcceptedBy: row.firm_accepted_by || null,
    firmAcceptedAt: row.firm_accepted_at || null,
    staffAssignmentStatus: row.staff_assignment_status,
    allocationState: row.allocation_state,
    allocationStateChangedAt: row.allocation_state_changed_at || null,
    declinedBy: row.declined_by || null,
    declinedAt: row.declined_at || null,
    declineReason: row.decline_reason || null,
    replacementRequiredBy: row.replacement_required_by || null,
    replacementRequiredAt: row.replacement_required_at || null,
    replacementReason: row.replacement_reason || null,
    supersededByAssignmentId: row.superseded_by_assignment_id || null,
    status: row.assignment_status || row.status,
    assignmentStatus: row.assignment_status || row.status,
    instructionStatus: row.instruction_status,
    isPrimary: row.is_primary !== false,
    assignedBy: row.assigned_by || null,
    assignedAt: row.assigned_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase() || null
}

function normalizePhone(value) {
  return normalizeText(value) || null
}

function normalizeAppointmentSource(value, fallback = 'agent_nomination') {
  return normalizeText(value || fallback).toLowerCase().replace(/[\s/-]+/g, '_')
}

function assertTransition(fromState, toState) {
  if (!canTransitionAttorneyAllocation(fromState, toState)) {
    throw new Error(`Attorney allocation cannot move from ${fromState || 'unknown'} to ${toState}.`)
  }
}

function assertTransferAssignment(assignment) {
  if (!assignment?.id) throw new Error('Attorney allocation not found.')
  if (assignment.attorney_role !== TRANSFER_ROLE) {
    throw new Error('Phase 3 firm-first allocation currently supports transfer attorney instructions only.')
  }
}

export function buildAttorneyFirmNominationPayload({
  transactionId,
  attorneyFirmId,
  preferredAttorneyUserId = null,
  preferredContactName = null,
  preferredContactEmail = null,
  preferredContactPhone = null,
  appointmentSource = 'agent_nomination',
  actorUserId,
  nominatedAt = new Date().toISOString(),
} = {}) {
  const normalizedTransactionId = normalizeText(transactionId)
  const normalizedFirmId = normalizeText(attorneyFirmId)
  const normalizedActorId = normalizeText(actorUserId)
  if (!normalizedTransactionId) throw new Error('Transaction id is required.')
  if (!normalizedFirmId) throw new Error('Attorney firm is required.')
  if (!normalizedActorId) throw new Error('Authenticated actor is required.')

  return {
    transaction_id: normalizedTransactionId,
    firm_id: normalizedFirmId,
    attorney_firm_id: normalizedFirmId,
    assignment_type: TRANSFER_TYPE,
    attorney_role: TRANSFER_ROLE,
    primary_attorney_id: null,
    attorney_user_id: null,
    preferred_attorney_user_id: normalizeText(preferredAttorneyUserId) || null,
    preferred_contact_name: normalizeText(preferredContactName) || null,
    preferred_contact_email: normalizeEmail(preferredContactEmail),
    preferred_contact_phone: normalizePhone(preferredContactPhone),
    appointment_source: normalizeAppointmentSource(appointmentSource),
    firm_acceptance_status: ATTORNEY_FIRM_ACCEPTANCE_STATUSES.awaiting,
    staff_assignment_status: ATTORNEY_STAFF_ASSIGNMENT_STATUSES.awaiting,
    allocation_state: ATTORNEY_ALLOCATION_STATES.awaitingFirmAcceptance,
    status: 'pending',
    assignment_status: 'pending',
    instruction_status: 'new_instruction',
    is_primary: true,
    visibility_scope: 'firm_matter',
    assigned_by: normalizedActorId,
    assigned_at: nominatedAt,
  }
}

export function buildAttorneyFirmAcceptancePayload({ actorUserId, acceptedAt = new Date().toISOString() } = {}) {
  const normalizedActorId = normalizeText(actorUserId)
  if (!normalizedActorId) throw new Error('Authenticated actor is required.')
  return {
    firm_acceptance_status: ATTORNEY_FIRM_ACCEPTANCE_STATUSES.accepted,
    firm_accepted_by: normalizedActorId,
    firm_accepted_at: acceptedAt,
    staff_assignment_status: ATTORNEY_STAFF_ASSIGNMENT_STATUSES.awaiting,
    allocation_state: ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment,
    status: 'pending',
    assignment_status: 'pending',
  }
}

export function buildAttorneyFirmDeclinePayload({
  actorUserId,
  reason,
  declinedAt = new Date().toISOString(),
} = {}) {
  const normalizedActorId = normalizeText(actorUserId)
  const normalizedReason = normalizeText(reason)
  if (!normalizedActorId) throw new Error('Authenticated actor is required.')
  if (!normalizedReason) throw new Error('A decline reason is required.')
  return {
    firm_acceptance_status: ATTORNEY_FIRM_ACCEPTANCE_STATUSES.declined,
    allocation_state: ATTORNEY_ALLOCATION_STATES.declined,
    declined_by: normalizedActorId,
    declined_at: declinedAt,
    decline_reason: normalizedReason,
    instruction_status: 'declined',
    status: 'removed',
    assignment_status: 'removed',
  }
}

export function buildInternalPrimaryAttorneyPayload({
  attorneyUserId,
  actorUserId,
  keepActive = false,
  assignedAt = new Date().toISOString(),
} = {}) {
  const normalizedAttorneyId = normalizeText(attorneyUserId)
  const normalizedActorId = normalizeText(actorUserId)
  if (!normalizedAttorneyId) throw new Error('Primary attorney is required.')
  if (!normalizedActorId) throw new Error('Authenticated actor is required.')
  return {
    primary_attorney_id: normalizedAttorneyId,
    attorney_user_id: normalizedAttorneyId,
    staff_assignment_status: ATTORNEY_STAFF_ASSIGNMENT_STATUSES.assigned,
    allocation_state: keepActive ? ATTORNEY_ALLOCATION_STATES.active : ATTORNEY_ALLOCATION_STATES.staffAssigned,
    status: keepActive ? 'active' : 'pending',
    assignment_status: keepActive ? 'active' : 'pending',
    assigned_by: normalizedActorId,
    assigned_at: assignedAt,
  }
}

export function buildAttorneyAllocationActivationPayload({
  actorUserId,
  activatedAt = new Date().toISOString(),
  source = 'firm_internal_assignment',
} = {}) {
  const normalizedActorId = normalizeText(actorUserId)
  if (!normalizedActorId) throw new Error('Authenticated actor is required.')
  return {
    allocation_state: ATTORNEY_ALLOCATION_STATES.active,
    status: 'active',
    assignment_status: 'active',
    instruction_status: 'accepted',
    instruction_accepted_by: normalizedActorId,
    instruction_accepted_at: activatedAt,
    instruction_decision_source: normalizeAppointmentSource(source, 'firm_internal_assignment'),
  }
}

async function fetchAssignment(client, assignmentId) {
  const normalizedId = normalizeText(assignmentId)
  if (!normalizedId) throw new Error('Attorney allocation id is required.')
  const result = await client
    .from('transaction_attorney_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('id', normalizedId)
    .maybeSingle()
  if (result.error) throw result.error
  assertTransferAssignment(result.data)
  return result.data
}

async function assertActiveFirm(client, firmId) {
  const result = await client
    .from('attorney_firms')
    .select('id, is_active')
    .eq('id', firmId)
    .eq('is_active', true)
    .maybeSingle()
  if (result.error) throw result.error
  if (!result.data?.id) throw new Error('Select an active attorney firm.')
}

async function getActiveFirmMember(client, firmId, userId) {
  const result = await client
    .from('attorney_firm_members')
    .select('id, firm_id, user_id, role, status')
    .eq('firm_id', firmId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  if (result.error) throw result.error
  return result.data || null
}

async function assertFirmManager(client, firmId, actorUserId) {
  const member = await getActiveFirmMember(client, firmId, actorUserId)
  if (member && FIRM_MANAGEMENT_ROLES.has(normalizeText(member.role).toLowerCase())) return member

  const owner = await client
    .from('attorney_firms')
    .select('id')
    .eq('id', firmId)
    .eq('created_by', actorUserId)
    .maybeSingle()
  if (owner.error || !owner.data?.id) {
    throw new Error('Only an active firm administrator or director can manage this allocation.')
  }
  return member
}

async function assertPreferredAttorney(client, firmId, preferredAttorneyUserId) {
  if (!preferredAttorneyUserId) return
  const member = await getActiveFirmMember(client, firmId, preferredAttorneyUserId)
  if (!member) throw new Error('The preferred attorney must be an active member of the nominated firm.')
}

async function assertPrimaryAttorney(client, firmId, attorneyUserId) {
  const member = await getActiveFirmMember(client, firmId, attorneyUserId)
  if (!member) throw new Error('The primary attorney must be an active member of the appointed firm.')
  if (!TRANSFER_PRIMARY_ROLES.has(normalizeText(member.role).toLowerCase())) {
    throw new Error('The selected member cannot be the primary transfer attorney.')
  }
  return member
}

async function assertNoOpenTransferAllocation(client, transactionId) {
  const result = await client
    .from('transaction_attorney_assignments')
    .select('id, allocation_state')
    .eq('transaction_id', transactionId)
    .eq('attorney_role', TRANSFER_ROLE)
    .eq('is_primary', true)
    .in('allocation_state', OPEN_ALLOCATION_STATES)
    .limit(1)
  if (result.error) throw result.error
  if ((result.data || []).length) {
    throw new Error('This transaction already has an open transfer attorney allocation.')
  }
}

async function persistAssignmentUpdate(client, assignmentId, payload) {
  const result = await client
    .from('transaction_attorney_assignments')
    .update(payload)
    .eq('id', assignmentId)
    .select(ASSIGNMENT_SELECT)
    .single()
  if (result.error) throw result.error
  return result.data
}

async function recordLifecycleEvent(client, { assignment, actorUserId, actorRole = 'attorney', eventType, message }) {
  const result = await client.from('transaction_events').insert({
    transaction_id: assignment.transaction_id,
    event_type: eventType,
    event_data: {
      message,
      visibility: 'internal',
      assignmentId: assignment.id,
      attorneyRole: assignment.attorney_role,
      attorneyFirmId: assignment.attorney_firm_id,
      attorneyUserId: assignment.attorney_user_id || null,
      allocationState: assignment.allocation_state,
    },
    created_by: actorUserId,
    created_by_role: actorRole,
  })
  if (result.error && !isMissingTableError(result.error, 'transaction_events') && !isMissingColumnError(result.error)) {
    console.warn('[attorneyFirmFirstAllocationService] lifecycle event could not be recorded', result.error)
  }
}

function withMigrationHint(error) {
  if (isMissingColumnError(error, 'allocation_state')) {
    throw new Error('Firm-first attorney allocation requires migration 202607170016 before Phase 3 can be used.')
  }
  throw error
}

export async function nominateTransferAttorneyFirm(input = {}, { client = requireClient() } = {}) {
  const actor = await getAuthenticatedUser(client)
  const payload = buildAttorneyFirmNominationPayload({ ...input, actorUserId: actor.id })
  try {
    await assertActiveFirm(client, payload.attorney_firm_id)
    await assertPreferredAttorney(client, payload.attorney_firm_id, payload.preferred_attorney_user_id)
    await assertNoOpenTransferAllocation(client, payload.transaction_id)
    const result = await client
      .from('transaction_attorney_assignments')
      .insert(payload)
      .select(ASSIGNMENT_SELECT)
      .single()
    if (result.error) throw result.error
    await recordLifecycleEvent(client, {
      assignment: result.data,
      actorUserId: actor.id,
      actorRole: 'agent',
      eventType: 'attorney_firm_nominated',
      message: 'Transfer attorney firm nominated; awaiting firm acceptance.',
    })
    return mapAttorneyFirmFirstAllocationRow(result.data)
  } catch (error) {
    return withMigrationHint(error)
  }
}

export async function acceptTransferAttorneyFirmAppointment(assignmentId, options = {}, { client = requireClient() } = {}) {
  const actor = await getAuthenticatedUser(client)
  try {
    const assignment = await fetchAssignment(client, assignmentId)
    assertTransition(assignment.allocation_state, ATTORNEY_ALLOCATION_STATES.awaitingStaffAssignment)
    await assertFirmManager(client, assignment.attorney_firm_id, actor.id)
    const updated = await persistAssignmentUpdate(
      client,
      assignment.id,
      buildAttorneyFirmAcceptancePayload({ actorUserId: actor.id, acceptedAt: options.acceptedAt }),
    )
    await recordLifecycleEvent(client, {
      assignment: updated,
      actorUserId: actor.id,
      eventType: 'attorney_firm_accepted',
      message: 'Transfer attorney firm accepted the appointment; awaiting internal staff assignment.',
    })
    return mapAttorneyFirmFirstAllocationRow(updated)
  } catch (error) {
    return withMigrationHint(error)
  }
}

export async function declineTransferAttorneyFirmAppointment(assignmentId, options = {}, { client = requireClient() } = {}) {
  const actor = await getAuthenticatedUser(client)
  try {
    const assignment = await fetchAssignment(client, assignmentId)
    assertTransition(assignment.allocation_state, ATTORNEY_ALLOCATION_STATES.declined)
    await assertFirmManager(client, assignment.attorney_firm_id, actor.id)
    const updated = await persistAssignmentUpdate(
      client,
      assignment.id,
      buildAttorneyFirmDeclinePayload({
        actorUserId: actor.id,
        reason: options.reason,
        declinedAt: options.declinedAt,
      }),
    )
    await recordLifecycleEvent(client, {
      assignment: updated,
      actorUserId: actor.id,
      eventType: 'attorney_firm_declined',
      message: 'Transfer attorney firm declined the appointment; replacement is required.',
    })
    return mapAttorneyFirmFirstAllocationRow(updated)
  } catch (error) {
    return withMigrationHint(error)
  }
}

export async function assignTransferPrimaryAttorney(assignmentId, options = {}, { client = requireClient() } = {}) {
  const actor = await getAuthenticatedUser(client)
  try {
    const assignment = await fetchAssignment(client, assignmentId)
    const keepActive = assignment.allocation_state === ATTORNEY_ALLOCATION_STATES.active
    if (!keepActive) assertTransition(assignment.allocation_state, ATTORNEY_ALLOCATION_STATES.staffAssigned)
    if (assignment.firm_acceptance_status !== ATTORNEY_FIRM_ACCEPTANCE_STATUSES.accepted) {
      throw new Error('The firm must accept the appointment before assigning its primary attorney.')
    }
    await assertFirmManager(client, assignment.attorney_firm_id, actor.id)
    await assertPrimaryAttorney(client, assignment.attorney_firm_id, options.attorneyUserId)
    const updated = await persistAssignmentUpdate(
      client,
      assignment.id,
      buildInternalPrimaryAttorneyPayload({
        attorneyUserId: options.attorneyUserId,
        actorUserId: actor.id,
        keepActive,
        assignedAt: options.assignedAt,
      }),
    )
    await recordLifecycleEvent(client, {
      assignment: updated,
      actorUserId: actor.id,
      eventType: keepActive ? 'attorney_primary_reassigned' : 'attorney_primary_assigned',
      message: keepActive
        ? 'Primary transfer attorney reassigned within the appointed firm.'
        : 'Primary transfer attorney assigned; ready for activation.',
    })
    return mapAttorneyFirmFirstAllocationRow(updated)
  } catch (error) {
    return withMigrationHint(error)
  }
}

export async function activateTransferAttorneyAllocation(assignmentId, options = {}, { client = requireClient() } = {}) {
  const actor = await getAuthenticatedUser(client)
  try {
    const assignment = await fetchAssignment(client, assignmentId)
    assertTransition(assignment.allocation_state, ATTORNEY_ALLOCATION_STATES.active)
    if (assignment.firm_acceptance_status !== ATTORNEY_FIRM_ACCEPTANCE_STATUSES.accepted) {
      throw new Error('The appointed firm has not accepted this instruction.')
    }
    if (!assignment.attorney_user_id || assignment.staff_assignment_status !== ATTORNEY_STAFF_ASSIGNMENT_STATUSES.assigned) {
      throw new Error('Assign the primary attorney before activating this instruction.')
    }
    await assertFirmManager(client, assignment.attorney_firm_id, actor.id)
    await assertPrimaryAttorney(client, assignment.attorney_firm_id, assignment.attorney_user_id)
    const updated = await persistAssignmentUpdate(
      client,
      assignment.id,
      buildAttorneyAllocationActivationPayload({
        actorUserId: actor.id,
        activatedAt: options.activatedAt,
        source: options.source,
      }),
    )
    await recordLifecycleEvent(client, {
      assignment: updated,
      actorUserId: actor.id,
      eventType: 'attorney_allocation_activated',
      message: 'Transfer attorney allocation activated.',
    })
    return mapAttorneyFirmFirstAllocationRow(updated)
  } catch (error) {
    return withMigrationHint(error)
  }
}

export const __attorneyFirmFirstAllocationServiceTestUtils = Object.freeze({
  ASSIGNMENT_SELECT,
  OPEN_ALLOCATION_STATES,
  normalizeAppointmentSource,
  assertTransition,
})
