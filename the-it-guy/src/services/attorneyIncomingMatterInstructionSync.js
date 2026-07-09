import {
  ATTORNEY_INCOMING_INSTRUCTION_STATUSES,
  isAttorneyInstructionClosedStatus,
  isTransferAttorneyAssignment,
  normalizeAttorneyIncomingInstructionStatus,
} from '../core/transactions/attorneyIncomingMatterContract'
import {
  isMissingColumnError,
  isMissingTableError,
  isPermissionDeniedError,
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
]

const FORWARD_TRANSITIONS = {
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp]: new Set([
    '',
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
  ]),
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments]: new Set([
    '',
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
  ]),
  [ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance]: new Set([
    '',
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.newInstruction,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingClientOnboarding,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingSignedOtp,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.awaitingDocuments,
    ATTORNEY_INCOMING_INSTRUCTION_STATUSES.readyForAcceptance,
  ]),
}

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

async function selectAssignments(client, transactionId) {
  let activeColumns = [...ASSIGNMENT_SELECT_COLUMNS]
  let lastMissingColumnError = null

  for (let attempt = 0; attempt <= ASSIGNMENT_SELECT_COLUMNS.length; attempt += 1) {
    const result = await client
      .from('transaction_attorney_assignments')
      .select(activeColumns.join(', '))
      .eq('transaction_id', transactionId)

    if (!result.error) return result.data || []
    if (isMissingTableError(result.error, 'transaction_attorney_assignments') || isPermissionDeniedError(result.error)) return []

    const missingColumn = activeColumns.find((column) => errorMentionsColumn(result.error, column))
    if (!missingColumn) throw result.error
    lastMissingColumnError = result.error
    activeColumns = activeColumns.filter((column) => column !== missingColumn)
    if (!activeColumns.length) break
  }

  if (lastMissingColumnError) throw lastMissingColumnError
  return []
}

async function updateAssignmentInstructionStatus(client, assignmentId, payload) {
  let currentPayload = { ...payload }
  let result = await client
    .from('transaction_attorney_assignments')
    .update(currentPayload)
    .eq('id', assignmentId)
    .select('id')
    .limit(1)

  for (let attempt = 0; result.error && attempt < 4; attempt += 1) {
    const missingColumn = Object.keys(currentPayload).find((column) => errorMentionsColumn(result.error, column))
    if (!missingColumn) break
    if (missingColumn === 'instruction_status') return null
    delete currentPayload[missingColumn]
    if (!Object.keys(currentPayload).length) return null
    result = await client
      .from('transaction_attorney_assignments')
      .update(currentPayload)
      .eq('id', assignmentId)
      .select('id')
      .limit(1)
  }

  if (result.error) {
    if (isMissingTableError(result.error, 'transaction_attorney_assignments') || isPermissionDeniedError(result.error)) return null
    throw result.error
  }
  return result.data?.[0] || null
}

export function shouldSyncAttorneyIncomingInstruction(assignment = {}, nextStatus = '') {
  const normalizedStatus = normalizeAttorneyIncomingInstructionStatus(nextStatus)
  if (!normalizedStatus || !FORWARD_TRANSITIONS[normalizedStatus]) return false
  if (!isTransferAttorneyAssignment(assignment)) return false

  const currentInstructionStatus = normalizeAttorneyIncomingInstructionStatus(assignment.instruction_status || assignment.instructionStatus)
  const assignmentLifecycleStatus = normalizeAttorneyIncomingInstructionStatus(
    assignment.assignment_status || assignment.assignmentStatus || assignment.status,
  )

  if (isAttorneyInstructionClosedStatus(currentInstructionStatus)) return false
  if (isAttorneyInstructionClosedStatus(assignmentLifecycleStatus)) return false
  return FORWARD_TRANSITIONS[normalizedStatus].has(currentInstructionStatus)
}

export function buildAttorneyIncomingInstructionSyncPayload({
  status,
  occurredAt = null,
  source = 'attorney_incoming_sync',
} = {}) {
  const normalizedStatus = normalizeAttorneyIncomingInstructionStatus(status)
  if (!FORWARD_TRANSITIONS[normalizedStatus]) return null

  return {
    instruction_status: normalizedStatus,
    updated_at: occurredAt || new Date().toISOString(),
    sync_source: normalizeText(source) || 'attorney_incoming_sync',
  }
}

export async function syncAttorneyIncomingInstructionStatus(client, {
  transactionId,
  status,
  occurredAt = null,
  source = 'attorney_incoming_sync',
} = {}) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!client || !normalizedTransactionId) {
    return { updatedCount: 0, skippedCount: 0, status: normalizeAttorneyIncomingInstructionStatus(status) }
  }

  const payload = buildAttorneyIncomingInstructionSyncPayload({ status, occurredAt, source })
  if (!payload) {
    return { updatedCount: 0, skippedCount: 0, status: normalizeAttorneyIncomingInstructionStatus(status) }
  }

  const assignments = await selectAssignments(client, normalizedTransactionId)
  const transferAssignments = assignments.filter((assignment) => isTransferAttorneyAssignment(assignment))
  const candidates = transferAssignments.filter((assignment) => shouldSyncAttorneyIncomingInstruction(assignment, payload.instruction_status))
  const updatePayload = {
    instruction_status: payload.instruction_status,
    updated_at: payload.updated_at,
  }

  const updates = []
  for (const assignment of candidates) {
    const updated = await updateAssignmentInstructionStatus(client, assignment.id, updatePayload)
    if (updated) updates.push(updated)
  }

  return {
    updatedCount: updates.length,
    skippedCount: transferAssignments.length - candidates.length,
    status: payload.instruction_status,
  }
}

export const __attorneyIncomingMatterInstructionSyncTestUtils = Object.freeze({
  buildAttorneyIncomingInstructionSyncPayload,
  errorMentionsColumn,
  shouldSyncAttorneyIncomingInstruction,
})
