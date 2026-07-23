import {
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES,
  getAttorneyInstructionLane,
  getAttorneyInstructionRole,
  isAttorneyInstructionAssignment,
  isAttorneyInstructionClosedStatus,
  normalizeAttorneyIncomingInstructionStatus,
} from '../core/transactions/attorneyIncomingMatterContract'
import {
  isMissingColumnError,
  isMissingTableError,
  isPermissionDeniedError,
  normalizeNullableText,
  normalizeText,
} from './attorneyFirmServiceShared'

const ASSIGNMENT_SELECT_COLUMNS = [
  'id',
  'transaction_id',
  'assignment_type',
  'matter_type',
  'attorney_role',
  'instruction_status',
  'assignment_status',
  'status',
  'instruction_accepted_at',
  'instruction_accepted_by',
  'instruction_declined_at',
  'instruction_declined_by',
  'instruction_decision_note',
  'firm_acceptance_status',
  'staff_assignment_status',
  'allocation_state',
  'appointment_source',
]

const ASSIGNMENT_RESULT_SELECT = 'id, transaction_id, instruction_status'

const TRANSACTION_RESULT_SELECT = 'id'

export const ATTORNEY_INCOMING_INSTRUCTION_EVENT_TYPES = Object.freeze({
  accepted: 'AttorneyIncomingInstructionAccepted',
  declined: 'AttorneyIncomingInstructionDeclined',
})

function errorMentionsColumn(error, column = '') {
  if (!column || !isMissingColumnError(error, column)) return false
  const normalizedColumn = String(column).toLowerCase()
  const text = ` ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''} `.toLowerCase()
  return (
    text.includes(`'${normalizedColumn}'`) ||
    text.includes(`"${normalizedColumn}"`) ||
    text.includes(`.${normalizedColumn}`) ||
    text.includes(` ${normalizedColumn} `) ||
    text.includes(`column ${normalizedColumn}`)
  )
}

function isEventTypeConstraintError(error) {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const text = ` ${error?.message || ''} ${error?.details || ''} ${error?.hint || ''} `.toLowerCase()
  return (
    code === '23514' ||
    text.includes('transaction_events_event_type_check') ||
    (text.includes('event_type') && (text.includes('constraint') || text.includes('violates')))
  )
}

async function selectAssignments(client, { assignmentId = '', transactionId = '' } = {}) {
  let activeColumns = [...ASSIGNMENT_SELECT_COLUMNS]
  let lastMissingColumnError = null

  for (let attempt = 0; attempt <= ASSIGNMENT_SELECT_COLUMNS.length; attempt += 1) {
    let query = client
      .from('transaction_attorney_assignments')
      .select(activeColumns.join(', '))

    if (assignmentId) query = query.eq('id', assignmentId)
    if (transactionId) query = query.eq('transaction_id', transactionId)

    const result = await query

    if (!result.error) return result.data || []
    if (isMissingTableError(result.error, 'transaction_attorney_assignments')) {
      throw new Error('Attorney assignment table is not available. Run the incoming matter migrations and retry.')
    }
    if (isPermissionDeniedError(result.error)) {
      throw new Error('You do not have permission to update this incoming matter.')
    }

    const missingColumn = activeColumns.find((column) => errorMentionsColumn(result.error, column))
    if (!missingColumn) throw result.error
    lastMissingColumnError = result.error
    activeColumns = activeColumns.filter((column) => column !== missingColumn)
    if (!activeColumns.length) break
  }

  if (lastMissingColumnError) throw lastMissingColumnError
  return []
}

function pickAttorneyInstructionAssignment(assignments = []) {
  const attorneyAssignments = assignments.filter((assignment) => isAttorneyInstructionAssignment(assignment))
  return (
    attorneyAssignments.find((assignment) =>
      normalizeAttorneyIncomingInstructionStatus(assignment.instruction_status || assignment.instructionStatus) ===
        ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
    ) ||
    attorneyAssignments[0] ||
    null
  )
}

async function updateRowWithMissingColumnFallback(client, table, id, payload = {}, select = 'id', { requiredColumns = [] } = {}) {
  let currentPayload = { ...payload }
  let result = await client.from(table).update(currentPayload).eq('id', id).select(select).limit(1)
  let attempts = 0

  while (result.error && attempts < 24) {
    const missingKey = Object.keys(currentPayload).find((key) => errorMentionsColumn(result.error, key))
    if (!missingKey) break
    if (requiredColumns.includes(missingKey)) {
      throw new Error(`Column ${missingKey} is required for incoming matter decisions. Run the incoming matter migrations and retry.`)
    }
    delete currentPayload[missingKey]
    if (!Object.keys(currentPayload).length) return null
    result = await client.from(table).update(currentPayload).eq('id', id).select(select).limit(1)
    attempts += 1
  }

  if (result.error) {
    if (isMissingTableError(result.error, table)) {
      throw new Error(`${table} is not available. Run the incoming matter migrations and retry.`)
    }
    if (isPermissionDeniedError(result.error)) {
      throw new Error('You do not have permission to update this incoming matter.')
    }
    throw result.error
  }

  return result.data || null
}

async function insertTransactionEventWithFallback(client, payload = {}) {
  if (!client || !payload?.transaction_id || !payload?.event_type) return null

  let currentPayload = { ...payload }
  let result = await client.from('transaction_events').insert(currentPayload).select('id, transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope, created_at').limit(1)
  let attempts = 0

  while (result.error && attempts < 12) {
    if (isMissingTableError(result.error, 'transaction_events') || isPermissionDeniedError(result.error)) {
      return null
    }

    const missingKey = Object.keys(currentPayload).find((key) => errorMentionsColumn(result.error, key))
    if (missingKey) {
      delete currentPayload[missingKey]
      if (!Object.keys(currentPayload).length) return null
      result = await client.from('transaction_events').insert(currentPayload).select('id, transaction_id, event_type, created_at').limit(1)
      attempts += 1
      continue
    }

    if (isEventTypeConstraintError(result.error) && currentPayload.event_type !== 'TransactionUpdated') {
      const originalEventType = currentPayload.event_type
      currentPayload = {
        ...currentPayload,
        event_type: 'TransactionUpdated',
        event_data: {
          ...(currentPayload.event_data && typeof currentPayload.event_data === 'object' ? currentPayload.event_data : {}),
          originalEventType,
        },
      }
      result = await client.from('transaction_events').insert(currentPayload).select('id, transaction_id, event_type, event_data, created_by, created_by_role, visibility_scope, created_at').limit(1)
      attempts += 1
      continue
    }

    return null
  }

  if (result.error) return null
  return Array.isArray(result.data) ? result.data[0] || null : result.data || null
}

async function getActorUserId(client, actorUserId = '') {
  const explicitActorId = normalizeText(actorUserId)
  if (explicitActorId) return explicitActorId
  try {
    const result = await client.auth?.getUser?.()
    return normalizeText(result?.data?.user?.id)
  } catch {
    return ''
  }
}

async function selectRowsWithMissingTableFallback(client, table, filters = []) {
  let query = client.from(table).select('*')
  for (const [column, value] of filters) query = query.eq(column, value)
  const result = await query
  if (result.error) {
    if (isMissingTableError(result.error, table) || isMissingColumnError(result.error) || isPermissionDeniedError(result.error)) return []
    throw result.error
  }
  return result.data || []
}

function getAttorneyInstructionLabel(attorneyRole = '') {
  const lane = getAttorneyInstructionLane({ attorney_role: attorneyRole })
  if (lane === 'bond') return 'Bond attorney'
  if (lane === 'cancellation') return 'Cancellation attorney'
  return 'Transfer attorney'
}

async function syncAttorneyInstructionDecisionLifecycle(client, {
  transactionId = '',
  attorneyRole = 'transfer_attorney',
  decision = '',
  actorUserId = '',
  decidedAt = null,
  reason = '',
  note = '',
  source = 'attorney_incoming_queue',
} = {}) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId) return { roleplayersUpdated: 0, allocationsUpdated: 0 }
  const normalizedAttorneyRole = getAttorneyInstructionRole({ attorney_role: attorneyRole })
  if (!normalizedAttorneyRole) return { roleplayersUpdated: 0, allocationsUpdated: 0 }

  const normalizedDecision = normalizeText(decision).toLowerCase()
  const accepted = normalizedDecision === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted
  const occurredAt = decidedAt || new Date().toISOString()
  const decisionNote = normalizeNullableText(reason) || normalizeNullableText(note)
  const roleplayers = await selectRowsWithMissingTableFallback(client, 'transaction_role_players', [
    ['transaction_id', normalizedTransactionId],
    ['role_type', normalizedAttorneyRole],
  ])

  let roleplayersUpdated = 0
  for (const roleplayer of roleplayers) {
    const rows = await updateRowWithMissingColumnFallback(
      client,
      'transaction_role_players',
      roleplayer.id,
      accepted
        ? {
            status: 'active',
            assignment_status: 'active',
            updated_at: occurredAt,
          }
        : {
            status: 'removed',
            assignment_status: 'removed',
            removed_at: occurredAt,
            updated_at: occurredAt,
          },
      'id',
    )
    if (rows?.length) roleplayersUpdated += 1
  }

  const transactionRows = await selectRowsWithMissingTableFallback(client, 'transactions', [
    ['id', normalizedTransactionId],
  ])
  const listingId = normalizeText(transactionRows[0]?.listing_id || transactionRows[0]?.listingId)
  let allocations = await selectRowsWithMissingTableFallback(client, 'private_listing_role_players', [
    ['transaction_id', normalizedTransactionId],
    ['role_type', normalizedAttorneyRole],
  ])
  if (!allocations.length && listingId) {
    allocations = await selectRowsWithMissingTableFallback(client, 'private_listing_role_players', [
      ['private_listing_id', listingId],
      ['role_type', normalizedAttorneyRole],
    ])
  }

  let allocationsUpdated = 0
  for (const allocation of allocations) {
    const rows = await updateRowWithMissingColumnFallback(
      client,
      'private_listing_role_players',
      allocation.id,
      accepted
        ? {
            allocation_status: 'converted',
            transaction_id: normalizedTransactionId,
            instruction_accepted_at: occurredAt,
            instruction_accepted_by: normalizeText(actorUserId) || null,
            instruction_decision_note: decisionNote,
            instruction_decision_source: normalizeText(source) || 'attorney_incoming_queue',
            updated_at: occurredAt,
          }
        : {
            allocation_status: 'withdrawn',
            instruction_declined_at: occurredAt,
            instruction_declined_by: normalizeText(actorUserId) || null,
            instruction_decision_note: decisionNote,
            instruction_decision_source: normalizeText(source) || 'attorney_incoming_queue',
            updated_at: occurredAt,
          },
      'id',
    )
    if (rows?.length) allocationsUpdated += 1
  }

  return { roleplayersUpdated, allocationsUpdated }
}

// Compatibility alias for callers deployed before the three-lane intake path.
const syncTransferInstructionDecisionLifecycle = (client, options = {}) =>
  syncAttorneyInstructionDecisionLifecycle(client, {
    ...options,
    attorneyRole: options.attorneyRole || 'transfer_attorney',
  })

export function buildAttorneyIncomingInstructionDecisionEventPayload({
  transactionId = '',
  assignmentId = '',
  attorneyRole = 'transfer_attorney',
  actorUserId = '',
  decision = '',
  decidedAt = null,
  note = '',
  reason = '',
  source = 'attorney_incoming_queue',
} = {}) {
  const normalizedDecision = normalizeText(decision).toLowerCase()
  const isDecline = normalizedDecision === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined
  const instructionStatus = isDecline
    ? ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined
    : ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted
  const occurredAt = decidedAt || new Date().toISOString()
  const decisionNote = normalizeNullableText(reason) || normalizeNullableText(note)
  const normalizedAttorneyRole = getAttorneyInstructionRole({ attorney_role: attorneyRole }) || 'transfer_attorney'
  const eventType = isDecline
    ? ATTORNEY_INCOMING_INSTRUCTION_EVENT_TYPES.declined
    : ATTORNEY_INCOMING_INSTRUCTION_EVENT_TYPES.accepted

  return {
    transaction_id: normalizeText(transactionId),
    event_type: eventType,
    event_data: {
      source: normalizeText(source) || 'attorney_incoming_queue',
      assignmentId: normalizeText(assignmentId) || null,
      attorneyRole: normalizedAttorneyRole,
      laneKey: getAttorneyInstructionLane({ attorney_role: normalizedAttorneyRole }) || 'transfer',
      actorUserId: normalizeText(actorUserId) || null,
      decision: instructionStatus,
      instructionStatus,
      decisionNote,
      decidedAt: occurredAt,
    },
    created_by: normalizeText(actorUserId) || null,
    created_by_role: 'attorney',
    visibility_scope: 'internal',
  }
}

export async function recordAttorneyIncomingInstructionDecisionEvent(client, payload = {}) {
  const eventPayload = buildAttorneyIncomingInstructionDecisionEventPayload(payload)
  return insertTransactionEventWithFallback(client, eventPayload)
}

export function buildAcceptAttorneyIncomingInstructionPayload({
  actorUserId = '',
  acceptedAt = null,
  note = '',
  source = 'attorney_incoming_queue',
} = {}) {
  const occurredAt = acceptedAt || new Date().toISOString()
  const normalizedNote = normalizeNullableText(note)

  return {
    instruction_status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted,
    assignment_status: 'active',
    status: 'active',
    instruction_accepted_at: occurredAt,
    instruction_accepted_by: normalizeText(actorUserId) || null,
    instruction_decision_note: normalizedNote,
    instruction_decision_source: normalizeText(source) || 'attorney_incoming_queue',
    updated_at: occurredAt,
  }
}

export function buildAcceptedIncomingAttorneyTransactionPayload({
  acceptedAt = null,
  note = '',
  attorneyRole = 'transfer_attorney',
} = {}) {
  const occurredAt = acceptedAt || new Date().toISOString()
  const normalizedAttorneyRole = getAttorneyInstructionRole({ attorney_role: attorneyRole }) || 'transfer_attorney'
  const label = getAttorneyInstructionLabel(normalizedAttorneyRole)
  const nextAction = normalizeNullableText(note) || (
    normalizedAttorneyRole === 'transfer_attorney'
      ? 'Transfer instruction accepted. Begin attorney preparation.'
      : `${label} instruction accepted. Begin legal preparation.`
  )

  if (normalizedAttorneyRole !== 'transfer_attorney') {
    return {
      next_action: nextAction,
      comment: nextAction,
      is_active: true,
      last_meaningful_activity_at: occurredAt,
      updated_at: occurredAt,
    }
  }

  return {
    current_main_stage: 'ATTY',
    attorney_stage: 'instruction_received',
    next_action: nextAction,
    comment: nextAction,
    is_active: true,
    last_meaningful_activity_at: occurredAt,
    updated_at: occurredAt,
  }
}

export function buildAcceptedIncomingTransferTransactionPayload(options = {}) {
  return buildAcceptedIncomingAttorneyTransactionPayload({
    ...options,
    attorneyRole: 'transfer_attorney',
  })
}

export function buildDeclineAttorneyIncomingInstructionPayload({
  actorUserId = '',
  declinedAt = null,
  reason = '',
  source = 'attorney_incoming_queue',
} = {}) {
  const occurredAt = declinedAt || new Date().toISOString()
  const normalizedReason = normalizeNullableText(reason)

  return {
    instruction_status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined,
    assignment_status: 'removed',
    status: 'removed',
    instruction_declined_at: occurredAt,
    instruction_declined_by: normalizeText(actorUserId) || null,
    instruction_decision_note: normalizedReason,
    instruction_decision_source: normalizeText(source) || 'attorney_incoming_queue',
    updated_at: occurredAt,
  }
}

export function buildDeclinedIncomingAttorneyTransactionPayload({
  declinedAt = null,
  reason = '',
  attorneyRole = 'transfer_attorney',
} = {}) {
  const occurredAt = declinedAt || new Date().toISOString()
  const normalizedAttorneyRole = getAttorneyInstructionRole({ attorney_role: attorneyRole }) || 'transfer_attorney'
  const label = getAttorneyInstructionLabel(normalizedAttorneyRole)
  const nextAction = normalizeNullableText(reason) || (
    normalizedAttorneyRole === 'transfer_attorney'
      ? 'Transfer instruction declined by attorney firm. Review attorney reassignment.'
      : `${label} instruction declined. Review attorney reassignment.`
  )

  return {
    next_action: nextAction,
    comment: nextAction,
    last_meaningful_activity_at: occurredAt,
    updated_at: occurredAt,
  }
}

export function buildDeclinedIncomingTransferTransactionPayload(options = {}) {
  return buildDeclinedIncomingAttorneyTransactionPayload({
    ...options,
    attorneyRole: 'transfer_attorney',
  })
}

export function assertAttorneyIncomingInstructionCanBeAccepted(assignment = {}) {
  if (!assignment?.id) {
    throw new Error('Incoming matter assignment was not found.')
  }
  if (!isAttorneyInstructionAssignment(assignment)) {
    throw new Error('This assignment is not an attorney instruction.')
  }

  const instructionStatus = normalizeAttorneyIncomingInstructionStatus(assignment.instruction_status || assignment.instructionStatus)
  const assignmentStatus = normalizeAttorneyIncomingInstructionStatus(assignment.assignment_status || assignment.assignmentStatus || assignment.status)

  if (instructionStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted) {
    return { accepted: true, alreadyAccepted: true }
  }
  if (isAttorneyInstructionClosedStatus(instructionStatus) || isAttorneyInstructionClosedStatus(assignmentStatus)) {
    throw new Error('This incoming matter has already been closed.')
  }
  const lane = getAttorneyInstructionLane(assignment)
  const isImmediatelyActionableLane = lane === 'bond' || lane === 'cancellation'
  const isImmediatelyActionableStatus = [
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
  ].includes(instructionStatus)
  if (
    instructionStatus !== ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance &&
    !(isImmediatelyActionableLane && isImmediatelyActionableStatus)
  ) {
    throw new Error('This incoming attorney instruction is not ready for acceptance yet.')
  }

  return { accepted: false, alreadyAccepted: false }
}

export function assertAttorneyIncomingInstructionCanBeDeclined(assignment = {}) {
  if (!assignment?.id) {
    throw new Error('Incoming matter assignment was not found.')
  }
  if (!isAttorneyInstructionAssignment(assignment)) {
    throw new Error('This assignment is not an attorney instruction.')
  }

  const instructionStatus = normalizeAttorneyIncomingInstructionStatus(assignment.instruction_status || assignment.instructionStatus)
  const assignmentStatus = normalizeAttorneyIncomingInstructionStatus(assignment.assignment_status || assignment.assignmentStatus || assignment.status)

  if (
    instructionStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined ||
    instructionStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.removed ||
    assignmentStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.removed
  ) {
    return { declined: true, alreadyDeclined: true }
  }
  if (instructionStatus === ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted) {
    throw new Error('Accepted incoming matters cannot be declined.')
  }
  if (isAttorneyInstructionClosedStatus(instructionStatus) || isAttorneyInstructionClosedStatus(assignmentStatus)) {
    throw new Error('This incoming matter has already been closed.')
  }

  return { declined: false, alreadyDeclined: false }
}

function isMissingAttorneyAllocationRpc(error) {
  const code = String(error?.code || '').toUpperCase()
  const message = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`.toLowerCase()
  return code === '42883' || code === 'PGRST202' || message.includes('bridge_manage_attorney_firm_allocation')
}

async function manageAttorneyFirmAllocation(client, {
  assignment,
  action,
  attorneyUserId = null,
  reason = null,
} = {}) {
  const input = {
    p_assignment_id: assignment.id,
    p_action: action,
    p_attorney_user_id: attorneyUserId,
    p_reason: reason,
  }
  let result = await client.rpc('bridge_manage_attorney_firm_allocation', input)

  // Keep transfer usable during a rolling database deployment. Bond and
  // cancellation intentionally require the generic three-lane RPC.
  if (result.error && isMissingAttorneyAllocationRpc(result.error) && getAttorneyInstructionLane(assignment) === 'transfer') {
    result = await client.rpc('bridge_manage_transfer_firm_allocation', input)
  }
  if (result.error) throw result.error
  return Array.isArray(result.data) ? result.data[0] : result.data
}

export async function acceptAttorneyIncomingInstruction(client, {
  assignmentId = '',
  transactionId = '',
  actorUserId = '',
  note = '',
  acceptedAt = null,
  source = 'attorney_incoming_queue',
} = {}) {
  if (!client) throw new Error('Supabase client is required.')

  const normalizedAssignmentId = normalizeText(assignmentId)
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedAssignmentId && !normalizedTransactionId) {
    throw new Error('Incoming matter assignment is required.')
  }

  const assignments = await selectAssignments(client, {
    assignmentId: normalizedAssignmentId,
    transactionId: normalizedAssignmentId ? '' : normalizedTransactionId,
  })
  const assignment = pickAttorneyInstructionAssignment(assignments) || assignments[0] || null
  if (!assignment) throw new Error('Incoming matter assignment was not found.')
  const resolvedTransactionId = normalizeText(assignment.transaction_id || assignment.transactionId || normalizedTransactionId)
  const attorneyRole = getAttorneyInstructionRole(assignment)

  if (
    normalizeText(assignment.allocation_state) === 'awaiting_firm_acceptance' &&
    normalizeText(assignment.firm_acceptance_status) === 'awaiting_firm_acceptance'
  ) {
    const firmDecision = await manageAttorneyFirmAllocation(client, {
      assignment,
      action: 'accept',
    })
    return {
      assignment: firmDecision,
      transactionId: resolvedTransactionId,
      status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
      alreadyAccepted: false,
      firmAccepted: true,
      actionHref: resolvedTransactionId ? `/transactions/${resolvedTransactionId}` : '',
    }
  }

  const readiness = assertAttorneyIncomingInstructionCanBeAccepted(assignment)

  if (readiness.alreadyAccepted) {
    return {
      assignment,
      transactionId: resolvedTransactionId,
      status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted,
      alreadyAccepted: true,
      actionHref: resolvedTransactionId ? `/transactions/${resolvedTransactionId}` : '',
    }
  }

  const resolvedActorUserId = await getActorUserId(client, actorUserId)
  const occurredAt = acceptedAt || new Date().toISOString()
  const assignmentPayload = buildAcceptAttorneyIncomingInstructionPayload({
    actorUserId: resolvedActorUserId,
    acceptedAt: occurredAt,
    note,
    source,
  })
  const updatedAssignments = await updateRowWithMissingColumnFallback(
    client,
    'transaction_attorney_assignments',
    assignment.id,
    assignmentPayload,
    ASSIGNMENT_RESULT_SELECT,
    { requiredColumns: ['instruction_status'] },
  )

  if (resolvedTransactionId) {
    await updateRowWithMissingColumnFallback(
      client,
      'transactions',
      resolvedTransactionId,
      buildAcceptedIncomingAttorneyTransactionPayload({ acceptedAt: occurredAt, note, attorneyRole }),
      TRANSACTION_RESULT_SELECT,
    )
  }
  const lifecycleSync = await syncAttorneyInstructionDecisionLifecycle(client, {
    transactionId: resolvedTransactionId,
    attorneyRole,
    decision: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted,
    actorUserId: resolvedActorUserId,
    decidedAt: occurredAt,
    note,
    source,
  })
  const auditEvent = resolvedTransactionId
    ? await recordAttorneyIncomingInstructionDecisionEvent(client, {
        transactionId: resolvedTransactionId,
        assignmentId: assignment.id,
        attorneyRole,
        actorUserId: resolvedActorUserId,
        decision: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted,
        decidedAt: occurredAt,
        note,
        source,
      })
    : null

  return {
    assignment: updatedAssignments?.[0] || {
      ...assignment,
      ...assignmentPayload,
    },
    transactionId: resolvedTransactionId,
    status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.accepted,
    alreadyAccepted: false,
    acceptedAt: occurredAt,
    lifecycleSync,
    auditEvent,
    actionHref: resolvedTransactionId ? `/transactions/${resolvedTransactionId}` : '',
  }
}

export async function declineAttorneyIncomingInstruction(client, {
  assignmentId = '',
  transactionId = '',
  actorUserId = '',
  reason = '',
  declinedAt = null,
  source = 'attorney_incoming_queue',
} = {}) {
  if (!client) throw new Error('Supabase client is required.')

  const normalizedAssignmentId = normalizeText(assignmentId)
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedAssignmentId && !normalizedTransactionId) {
    throw new Error('Incoming matter assignment is required.')
  }

  const assignments = await selectAssignments(client, {
    assignmentId: normalizedAssignmentId,
    transactionId: normalizedAssignmentId ? '' : normalizedTransactionId,
  })
  const assignment = pickAttorneyInstructionAssignment(assignments) || assignments[0] || null
  if (!assignment) throw new Error('Incoming matter assignment was not found.')
  const resolvedTransactionId = normalizeText(assignment.transaction_id || assignment.transactionId || normalizedTransactionId)
  const attorneyRole = getAttorneyInstructionRole(assignment)

  if (
    ['awaiting_firm_acceptance', 'awaiting_staff_assignment', 'staff_assigned'].includes(normalizeText(assignment.allocation_state)) &&
    normalizeText(assignment.firm_acceptance_status) !== 'not_required'
  ) {
    const firmDecision = await manageAttorneyFirmAllocation(client, {
      assignment,
      action: 'decline',
      reason: normalizeText(reason),
    })
    return {
      assignment: firmDecision,
      transactionId: resolvedTransactionId,
      status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined,
      alreadyDeclined: false,
      firmDeclined: true,
      actionHref: resolvedTransactionId ? `/transactions/${resolvedTransactionId}` : '',
    }
  }

  const readiness = assertAttorneyIncomingInstructionCanBeDeclined(assignment)

  if (readiness.alreadyDeclined) {
    return {
      assignment,
      transactionId: resolvedTransactionId,
      status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined,
      alreadyDeclined: true,
      actionHref: resolvedTransactionId ? `/transactions/${resolvedTransactionId}` : '',
    }
  }

  const resolvedActorUserId = await getActorUserId(client, actorUserId)
  const occurredAt = declinedAt || new Date().toISOString()
  const assignmentPayload = buildDeclineAttorneyIncomingInstructionPayload({
    actorUserId: resolvedActorUserId,
    declinedAt: occurredAt,
    reason,
    source,
  })
  const updatedAssignments = await updateRowWithMissingColumnFallback(
    client,
    'transaction_attorney_assignments',
    assignment.id,
    assignmentPayload,
    ASSIGNMENT_RESULT_SELECT,
    { requiredColumns: ['instruction_status'] },
  )

  if (resolvedTransactionId) {
    await updateRowWithMissingColumnFallback(
      client,
      'transactions',
      resolvedTransactionId,
      buildDeclinedIncomingAttorneyTransactionPayload({ declinedAt: occurredAt, reason, attorneyRole }),
      TRANSACTION_RESULT_SELECT,
    )
  }
  const lifecycleSync = await syncAttorneyInstructionDecisionLifecycle(client, {
    transactionId: resolvedTransactionId,
    attorneyRole,
    decision: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined,
    actorUserId: resolvedActorUserId,
    decidedAt: occurredAt,
    reason,
    source,
  })
  const auditEvent = resolvedTransactionId
    ? await recordAttorneyIncomingInstructionDecisionEvent(client, {
        transactionId: resolvedTransactionId,
        assignmentId: assignment.id,
        attorneyRole,
        actorUserId: resolvedActorUserId,
        decision: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined,
        decidedAt: occurredAt,
        reason,
        source,
      })
    : null

  return {
    assignment: updatedAssignments?.[0] || {
      ...assignment,
      ...assignmentPayload,
    },
    transactionId: resolvedTransactionId,
    status: ATTORNEY_INCOMING_INSTRUCTION_STATUSES.declined,
    alreadyDeclined: false,
    declinedAt: occurredAt,
    lifecycleSync,
    auditEvent,
    actionHref: resolvedTransactionId ? `/transactions/${resolvedTransactionId}` : '',
  }
}

export const __attorneyIncomingMatterInstructionActionsTestUtils = Object.freeze({
  ATTORNEY_INCOMING_INSTRUCTION_EVENT_TYPES,
  assertAttorneyIncomingInstructionCanBeDeclined,
  assertAttorneyIncomingInstructionCanBeAccepted,
  buildAcceptedIncomingAttorneyTransactionPayload,
  buildAcceptedIncomingTransferTransactionPayload,
  buildAcceptAttorneyIncomingInstructionPayload,
  buildAttorneyIncomingInstructionDecisionEventPayload,
  buildDeclinedIncomingAttorneyTransactionPayload,
  buildDeclinedIncomingTransferTransactionPayload,
  buildDeclineAttorneyIncomingInstructionPayload,
  errorMentionsColumn,
  isEventTypeConstraintError,
  syncAttorneyInstructionDecisionLifecycle,
  syncTransferInstructionDecisionLifecycle,
})
