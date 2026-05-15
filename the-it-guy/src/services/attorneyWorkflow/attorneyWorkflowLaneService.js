import { isMissingColumnError, isMissingTableError, getAuthenticatedUser, requireClient } from '../attorneyFirmServiceShared'
import {
  assertCanPublishVisibility,
  canReviewAttorneyDocuments,
  canRequestAttorneyDocuments,
  canSeeAttorneyUpdateVisibility,
  canUpdateAttorneyLanePermission,
  getAttorneyLegalPermissionContext,
} from '../permissions/attorneyPermissionService'
import { getTransactionAttorneyAssignments } from '../transactionAttorneyAssignments'
import {
  getAttorneyUpdateType,
  resolveAttorneyUpdateOptions,
} from '../../constants/attorneyUpdateTypes'
import { resolveLegalDocumentRequirements } from './attorneyDocumentRequirementsResolver.js'
import { resolveAttorneyWorkflowForTransaction } from './attorneyWorkflowService'
import { ATTORNEY_LANE_STAGES } from './attorneyWorkflowResolver.js'

const LANE_META = {
  transfer: {
    laneKey: 'transfer',
    processType: 'transfer',
    attorneyRole: 'transfer_attorney',
    label: 'Transfer Attorney',
  },
  bond: {
    laneKey: 'bond',
    processType: 'bond',
    attorneyRole: 'bond_attorney',
    label: 'Bond Attorney',
  },
  cancellation: {
    laneKey: 'cancellation',
    processType: 'cancellation',
    attorneyRole: 'cancellation_attorney',
    label: 'Cancellation Attorney',
  },
}

const UPDATE_TYPE_BY_VISIBILITY = {
  internal: 'internal_note',
  professional_shared: 'shared_professional_update',
  client_visible: 'client_safe_update',
}

const TIMELINE_FILTERS = [
  'all',
  'transfer',
  'bond',
  'cancellation',
  'documents',
  'signing',
  'internal',
  'professional_shared',
  'client_visible',
]

function normalizeLaneKey(value) {
  const normalized = String(value || '').trim().toLowerCase().replace(/_attorney$/, '')
  if (normalized === 'transfer') return 'transfer'
  if (normalized === 'bond') return 'bond'
  if (normalized === 'cancellation') return 'cancellation'
  throw new Error('This workflow lane is not required for this transaction.')
}

function normalizeLaneStatus(value, fallback = 'not_started') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'complete') return 'completed'
  return ['not_started', 'in_progress', 'blocked', 'completed', 'not_required'].includes(normalized) ? normalized : fallback
}

function normalizeVisibility(value, fallback = 'internal') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'shared') return 'professional_shared'
  if (normalized === 'client') return 'client_visible'
  return ['internal', 'professional_shared', 'client_visible'].includes(normalized) ? normalized : fallback
}

function toTitleLabel(value = '') {
  return String(value || '')
    .split('_')
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ')
}

function getStageLabel(stageKey) {
  return toTitleLabel(stageKey)
}

function getUpdateTypeLabel(updateTypeId) {
  if (UPDATE_TYPE_BY_VISIBILITY.internal === updateTypeId) return 'Internal attorney note'
  if (UPDATE_TYPE_BY_VISIBILITY.professional_shared === updateTypeId) return 'Professional update'
  if (UPDATE_TYPE_BY_VISIBILITY.client_visible === updateTypeId) return 'Client-visible update'
  return getAttorneyUpdateType(updateTypeId)?.label || toTitleLabel(updateTypeId)
}

function isMissingSchemaError(error) {
  return isMissingTableError(error) || isMissingColumnError(error)
}

function getLaneStages(laneKey) {
  return ATTORNEY_LANE_STAGES[laneKey] || []
}

function mapAssignmentForLane(assignments = [], laneKey) {
  const meta = LANE_META[laneKey]
  return (
    (assignments || []).find(
      (assignment) =>
        assignment.attorneyRole === meta.attorneyRole &&
        assignment.assignmentStatus !== 'removed' &&
        assignment.isPrimary !== false,
    ) ||
    (assignments || []).find(
      (assignment) => assignment.attorneyRole === meta.attorneyRole && assignment.assignmentStatus !== 'removed',
    ) ||
    null
  )
}

function summarizeSteps(steps = [], stages = []) {
  const ordered = [...steps].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const completed = ordered.filter((step) => step.status === 'completed').length
  const blocked = ordered.find((step) => step.status === 'blocked') || null
  const inProgress = ordered.find((step) => step.status === 'in_progress') || null
  const nextOpen = ordered.find((step) => step.status !== 'completed') || null
  const current = blocked || inProgress || nextOpen || ordered.at(-1) || null
  const currentStage = current?.step_key || stages[0] || null
  const finalStage = stages.at(-1)
  const allComplete = Boolean(finalStage && ordered.length && ordered.every((step) => step.status === 'completed'))
  const status = allComplete ? 'completed' : blocked ? 'blocked' : completed || inProgress ? 'in_progress' : 'not_started'

  return {
    totalSteps: ordered.length,
    completedSteps: completed,
    completionPercent: ordered.length ? Math.round((completed / ordered.length) * 100) : 0,
    currentStage,
    currentStageLabel: getStageLabel(currentStage),
    nextAction: allComplete ? 'Workflow complete' : current ? getStageLabel(current.step_key) : 'Start workflow',
    status,
    blocked,
    allComplete,
  }
}

function mapStep(row) {
  return {
    id: row.id,
    subprocessId: row.subprocess_id,
    stepKey: row.step_key,
    stepLabel: row.step_label || getStageLabel(row.step_key),
    status: row.status || 'not_started',
    completedAt: row.completed_at || null,
    comment: row.comment || '',
    ownerType: row.owner_type || 'attorney',
    sortOrder: row.sort_order || 0,
    visibilityScope: row.visibility_scope || 'internal',
    updatedAt: row.updated_at || null,
  }
}

function normalizeDocumentStatus(value, fallback = 'requested') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'complete') return 'completed'
  if (normalized === 'approved') return 'approved'
  if (['requested', 'uploaded', 'under_review', 'approved', 'rejected', 'completed'].includes(normalized)) return normalized
  return fallback
}

function documentRequestRequirementKey(request = {}) {
  return String(
    request.requirement_id ||
      request.requirementId ||
      request.document_type ||
      request.documentType ||
      request.title ||
      '',
  )
    .trim()
    .toLowerCase()
}

function requirementMatchesRequest(requirement, request) {
  if (!requirement || !request) return false
  const reqKey = documentRequestRequirementKey(request)
  const titleKey = String(request.title || '').trim().toLowerCase()
  return (
    reqKey === requirement.id ||
    reqKey === String(requirement.label || '').trim().toLowerCase() ||
    titleKey === String(requirement.label || '').trim().toLowerCase()
  )
}

function summarizeRequirementStatus(requirement, documentRequests = []) {
  const matches = documentRequests.filter((request) => requirementMatchesRequest(requirement, request))
  const sorted = [...matches].sort((left, right) => new Date(right.updated_at || right.created_at || 0).getTime() - new Date(left.updated_at || left.created_at || 0).getTime())
  const latest = sorted[0] || null
  const status = latest ? normalizeDocumentStatus(latest.review_status || latest.status) : 'missing'
  return {
    ...requirement,
    status,
    request: latest,
    requestId: latest?.id || null,
    requested: Boolean(latest),
    missing: !latest,
    complete: ['approved', 'completed'].includes(status),
    rejected: status === 'rejected',
  }
}

function summarizeLaneDocuments(requirements = []) {
  const requiredItems = requirements.filter((item) => item.required !== false)
  const missing = requirements.filter((item) => item.status === 'missing')
  const requested = requirements.filter((item) => item.status === 'requested')
  const uploaded = requirements.filter((item) => item.status === 'uploaded' || item.status === 'under_review')
  const rejected = requirements.filter((item) => item.status === 'rejected')
  const complete = requirements.filter((item) => item.complete)
  return {
    total: requirements.length,
    required: requiredItems.length,
    missing: missing.length,
    requested: requested.length,
    uploaded: uploaded.length,
    rejected: rejected.length,
    complete: complete.length,
  }
}

function mapLaneRow(row, steps = [], assignment = null) {
  const laneKey = normalizeLaneKey(row.process_type)
  const stages = getLaneStages(laneKey)
  const mappedSteps = (steps || []).map(mapStep).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
  const summary = summarizeSteps(mappedSteps.map((step) => ({
    step_key: step.stepKey,
    status: step.status,
    sort_order: step.sortOrder,
  })), stages)

  return {
    id: row.id,
    transactionId: row.transaction_id,
    laneKey,
    processType: row.process_type,
    attorneyRole: row.attorney_role || LANE_META[laneKey].attorneyRole,
    label: LANE_META[laneKey].label,
    assignmentId: row.attorney_assignment_id || assignment?.id || null,
    assignment,
    currentStage: row.current_stage || summary.currentStage,
    currentStageLabel: getStageLabel(row.current_stage || summary.currentStage),
    laneStatus: normalizeLaneStatus(row.lane_status || row.status || summary.status),
    dueDate: row.due_date || null,
    completedAt: row.completed_at || null,
    updatedBy: row.updated_by || null,
    updatedAt: row.updated_at || null,
    steps: mappedSteps,
    summary,
  }
}

function sanitizeError(error, fallback) {
  const message = String(error?.message || '').trim()
  if (!message) return fallback
  if (/supabase|pgrst|postgres|row-level security|violates|constraint|stack/i.test(message)) {
    return fallback
  }
  return message
}

async function insertTransactionEvent(client, {
  transactionId,
  eventType,
  actorId = null,
  createdByRole = 'attorney',
  visibility = 'internal',
  eventData = {},
}) {
  const payload = {
    transaction_id: transactionId,
    event_type: eventType,
    event_data: eventData,
    created_by: actorId,
    created_by_role: createdByRole,
    visibility_scope: visibility,
  }

  let result = await client.from('transaction_events').insert(payload)
  if (result.error && isMissingColumnError(result.error, 'visibility_scope')) {
    const fallback = { ...payload }
    delete fallback.visibility_scope
    result = await client.from('transaction_events').insert(fallback)
  }
  if (result.error && !isMissingSchemaError(result.error)) throw result.error
}

async function recordAttorneySecurityEvent(client, {
  transactionId,
  actorId = null,
  attorneyRole = null,
  action = 'unauthorized_access_attempt',
  visibility = 'internal',
  metadata = {},
} = {}) {
  if (!transactionId) return
  await insertTransactionEvent(client, {
    transactionId,
    eventType: 'AttorneyUnauthorizedAccessAttempt',
    actorId,
    visibility,
    eventData: {
      action,
      attorneyRole,
      ...metadata,
    },
  }).catch(() => null)
}

async function fetchTransaction(client, transactionId) {
  const query = await client.from('transactions').select('*').eq('id', transactionId).maybeSingle()
  if (query.error) throw query.error
  if (!query.data) throw new Error('Transaction not found.')
  return query.data
}

async function fetchLaneRows(client, transactionId) {
  const query = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type, owner_type, status, attorney_role, attorney_assignment_id, current_stage, lane_status, due_date, completed_at, updated_by, lane_metadata, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .in('process_type', ['transfer', 'bond', 'cancellation', 'attorney'])
    .order('created_at', { ascending: true })

  if (query.error) {
    if (isMissingSchemaError(query.error)) return []
    throw query.error
  }
  return query.data || []
}

async function fetchSteps(client, subprocessIds = []) {
  if (!subprocessIds.length) return []
  const query = await client
    .from('transaction_subprocess_steps')
    .select('id, subprocess_id, step_key, step_label, status, completed_at, comment, owner_type, sort_order, visibility_scope, updated_at, created_at')
    .in('subprocess_id', subprocessIds)
    .order('sort_order', { ascending: true })

  if (query.error) {
    if (isMissingColumnError(query.error, 'visibility_scope')) {
      const fallback = await client
        .from('transaction_subprocess_steps')
        .select('id, subprocess_id, step_key, step_label, status, completed_at, comment, owner_type, sort_order, updated_at, created_at')
        .in('subprocess_id', subprocessIds)
        .order('sort_order', { ascending: true })
      if (fallback.error) throw fallback.error
      return fallback.data || []
    }
    if (isMissingSchemaError(query.error)) return []
    throw query.error
  }
  return query.data || []
}

async function fetchLaneUpdates(client, transactionId) {
  const query = await client
    .from('transaction_attorney_lane_updates')
    .select('id, transaction_id, subprocess_id, lane_key, attorney_role, update_type, visibility, message, created_by, created_at, metadata, related_document_id, related_signing_packet_id, client_recipients')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (query.error) {
    if (
      isMissingColumnError(query.error, 'metadata') ||
      isMissingColumnError(query.error, 'related_document_id') ||
      isMissingColumnError(query.error, 'related_signing_packet_id') ||
      isMissingColumnError(query.error, 'client_recipients')
    ) {
      const fallback = await client
        .from('transaction_attorney_lane_updates')
        .select('id, transaction_id, subprocess_id, lane_key, attorney_role, update_type, visibility, message, created_by, created_at')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })
        .limit(50)
      if (fallback.error) {
        if (isMissingSchemaError(fallback.error)) return []
        throw fallback.error
      }
      return fallback.data || []
    }
    if (isMissingSchemaError(query.error)) return []
    throw query.error
  }
  return query.data || []
}

async function fetchLaneHistory(client, transactionId) {
  const query = await client
    .from('transaction_attorney_lane_history')
    .select('id, transaction_id, subprocess_id, lane_key, attorney_role, previous_stage, new_stage, previous_status, new_status, changed_by, changed_at, note, visibility, source, metadata')
    .eq('transaction_id', transactionId)
    .order('changed_at', { ascending: false })
    .limit(80)

  if (query.error) {
    if (isMissingSchemaError(query.error)) return []
    throw query.error
  }
  return query.data || []
}

async function fetchLaneDocumentRequests(client, transactionId) {
  const query = await client
    .from('document_requests')
    .select('id, transaction_id, category, document_type, title, description, priority, status, due_date, lane_key, attorney_role, requested_from, requested_by, review_status, requirement_id, rejected_reason, rejection_reason, visibility_scope, created_at, updated_at')
    .eq('transaction_id', transactionId)
    .order('created_at', { ascending: false })

  if (query.error) {
    if (
      isMissingColumnError(query.error, 'lane_key') ||
      isMissingColumnError(query.error, 'requirement_id') ||
      isMissingColumnError(query.error, 'rejection_reason')
    ) {
      const fallback = await client
        .from('document_requests')
        .select('id, transaction_id, category, document_type, title, description, priority, status, due_date, created_at, updated_at')
        .eq('transaction_id', transactionId)
        .order('created_at', { ascending: false })
      if (fallback.error) throw fallback.error
      return fallback.data || []
    }
    if (isMissingSchemaError(query.error)) return []
    throw query.error
  }
  return query.data || []
}

function actorLabel(id) {
  return id ? 'Transaction team' : 'Bridge'
}

function buildTimelineFromSources({ updates = [], history = [], documentRequests = [], permissionByLane = {} }) {
  const items = []

  for (const update of updates) {
    const visibility = normalizeVisibility(update.visibility)
    const laneKey = normalizeLaneKey(update.lane_key || update.attorney_role || 'transfer')
    const permissionContext = permissionByLane[laneKey]
    if (!canSeeAttorneyUpdateVisibility(permissionContext, visibility)) continue
    items.push({
      id: `update_${update.id}`,
      source: 'attorney_update',
      type: update.update_type || UPDATE_TYPE_BY_VISIBILITY[visibility] || 'attorney_update',
      title: getUpdateTypeLabel(update.update_type),
      message: update.message,
      actor: actorLabel(update.created_by),
      actorId: update.created_by || null,
      timestamp: update.created_at,
      laneKey,
      attorneyRole: update.attorney_role || LANE_META[laneKey]?.attorneyRole || null,
      visibility,
      category: getAttorneyUpdateType(update.update_type)?.category || (visibility === 'internal' ? 'internal' : 'updates'),
      relatedDocumentId: update.related_document_id || update.metadata?.relatedDocumentId || null,
      relatedSigningPacketId: update.related_signing_packet_id || update.metadata?.relatedSigningPacketId || null,
      metadata: update.metadata || {},
    })
  }

  for (const item of history) {
    const visibility = normalizeVisibility(item.visibility)
    const laneKey = normalizeLaneKey(item.lane_key || item.attorney_role || 'transfer')
    const permissionContext = permissionByLane[laneKey]
    if (!canSeeAttorneyUpdateVisibility(permissionContext, visibility)) continue
    items.push({
      id: `history_${item.id}`,
      source: 'lane_history',
      type: 'lane_stage_changed',
      title: `Stage updated to ${getStageLabel(item.new_stage)}`,
      message: item.note || `${LANE_META[laneKey]?.label || 'Attorney'} workflow moved forward.`,
      actor: actorLabel(item.changed_by),
      actorId: item.changed_by || null,
      timestamp: item.changed_at,
      laneKey,
      attorneyRole: item.attorney_role || LANE_META[laneKey]?.attorneyRole || null,
      visibility,
      category: 'workflow',
      metadata: item.metadata || {},
    })
  }

  for (const request of documentRequests) {
    const laneKey = request.lane_key ? normalizeLaneKey(request.lane_key) : null
    if (!laneKey) continue
    const visibility = normalizeVisibility(request.visibility_scope || (['buyer', 'seller', 'client'].includes(String(request.requested_from || '').toLowerCase()) ? 'client_visible' : 'professional_shared'))
    const permissionContext = permissionByLane[laneKey]
    if (!canSeeAttorneyUpdateVisibility(permissionContext, visibility)) continue
    const status = normalizeDocumentStatus(request.review_status || request.status)
    items.push({
      id: `document_${request.id}`,
      source: 'document_request',
      type: status === 'rejected' ? 'document_rejected' : status === 'approved' || status === 'completed' ? 'document_approved' : 'document_requested',
      title: status === 'rejected' ? `${request.title || 'Document'} rejected` : status === 'approved' || status === 'completed' ? `${request.title || 'Document'} approved` : `${request.title || 'Document'} requested`,
      message: status === 'rejected' ? request.rejection_reason || request.rejected_reason || 'A corrected document is required.' : request.description || '',
      actor: actorLabel(request.requested_by || request.created_by),
      actorId: request.requested_by || request.created_by || null,
      timestamp: request.updated_at || request.created_at,
      laneKey,
      attorneyRole: request.attorney_role || LANE_META[laneKey]?.attorneyRole || null,
      visibility,
      category: 'documents',
      relatedDocumentId: request.id,
      metadata: {
        status,
        requestedFrom: request.requested_from || request.assigned_to_role || '',
      },
    })
  }

  return items.sort((left, right) => new Date(right.timestamp || 0).getTime() - new Date(left.timestamp || 0).getTime())
}

async function createLane(client, { transactionId, laneKey, assignment, actorId = null }) {
  const meta = LANE_META[laneKey]
  const stages = getLaneStages(laneKey)
  const payload = {
    transaction_id: transactionId,
    process_type: meta.processType,
    owner_type: 'attorney',
    status: 'not_started',
    attorney_role: meta.attorneyRole,
    attorney_assignment_id: assignment?.id || null,
    current_stage: stages[0] || null,
    lane_status: 'not_started',
    lane_metadata: { source: 'phase_4_attorney_lane_init' },
  }

  let upsert = await client
    .from('transaction_subprocesses')
    .upsert(payload, { onConflict: 'transaction_id,process_type', ignoreDuplicates: true })
    .select('id, transaction_id, process_type, owner_type, status, attorney_role, attorney_assignment_id, current_stage, lane_status, due_date, completed_at, updated_by, lane_metadata, created_at, updated_at')
    .single()

  if (upsert.error && isMissingColumnError(upsert.error, 'attorney_role')) {
    const fallbackPayload = {
      transaction_id: transactionId,
      process_type: meta.processType,
      owner_type: 'attorney',
      status: 'not_started',
    }
    upsert = await client
      .from('transaction_subprocesses')
      .upsert(fallbackPayload, { onConflict: 'transaction_id,process_type', ignoreDuplicates: true })
      .select('id, transaction_id, process_type, owner_type, status, created_at, updated_at')
      .single()
  }
  if (upsert.error) throw upsert.error

  const laneRow = upsert.data
  const stepRows = stages.map((stage, index) => ({
    subprocess_id: laneRow.id,
    step_key: stage,
    step_label: getStageLabel(stage),
    status: 'not_started',
    owner_type: 'attorney',
    sort_order: index + 1,
    visibility_scope: 'internal',
  }))

  if (stepRows.length) {
    let stepInsert = await client
      .from('transaction_subprocess_steps')
      .upsert(stepRows, { onConflict: 'subprocess_id,step_key', ignoreDuplicates: true })

    if (stepInsert.error && isMissingColumnError(stepInsert.error, 'visibility_scope')) {
      const fallbackRows = stepRows.map((row) => {
        const next = { ...row }
        delete next.visibility_scope
        return next
      })
      stepInsert = await client
        .from('transaction_subprocess_steps')
        .upsert(fallbackRows, { onConflict: 'subprocess_id,step_key', ignoreDuplicates: true })
    }
    if (stepInsert.error) throw stepInsert.error
  }

  await insertTransactionEvent(client, {
    transactionId,
    eventType: 'AttorneyLaneCreated',
    actorId,
    visibility: 'internal',
    eventData: { laneKey, attorneyRole: meta.attorneyRole, assignmentId: assignment?.id || null },
  }).catch(() => null)

  return laneRow
}

export async function getAttorneyWorkflowOperationsForTransaction(transactionId, { initialize = true } = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client).catch(() => null)
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) throw new Error('Transaction id is required.')

  const baselineContext = await getAttorneyLegalPermissionContext({
    userId: actor?.id || null,
    transactionId: normalizedTransactionId,
    attorneyRole: 'transfer_attorney',
  }).catch(async (error) => {
    await recordAttorneySecurityEvent(client, {
      transactionId: normalizedTransactionId,
      actorId: actor?.id || null,
      action: 'legal_workspace_context_failed',
      metadata: { message: sanitizeError(error, 'Unable to resolve permissions.') },
    })
    return null
  })

  if (!baselineContext?.canViewLegalWorkspace) {
    await recordAttorneySecurityEvent(client, {
      transactionId: normalizedTransactionId,
      actorId: actor?.id || null,
      action: 'legal_workspace_view_denied',
    })
    throw new Error('You do not have permission to view this legal workspace.')
  }

  const transaction = await fetchTransaction(client, normalizedTransactionId)
  const assignments = await getTransactionAttorneyAssignments(normalizedTransactionId).catch(() => [])
  const workflow = resolveAttorneyWorkflowForTransaction(transaction, assignments)
  const legalDocuments = resolveLegalDocumentRequirements(transaction)
  const requiredLaneKeys = Object.entries(workflow.lanes)
    .filter(([, lane]) => lane.required)
    .map(([laneKey]) => laneKey)

  let laneRows = await fetchLaneRows(client, normalizedTransactionId)
  const existingLaneKeys = new Set(laneRows.map((row) => normalizeLaneKey(row.process_type === 'attorney' ? 'transfer' : row.process_type)))
  const missingRequiredLaneKeys = requiredLaneKeys.filter((laneKey) => !existingLaneKeys.has(laneKey))

  if (initialize && missingRequiredLaneKeys.length) {
    for (const laneKey of missingRequiredLaneKeys) {
      await createLane(client, {
        transactionId: normalizedTransactionId,
        laneKey,
        assignment: mapAssignmentForLane(assignments, laneKey),
        actorId: actor?.id || null,
      })
    }
    laneRows = await fetchLaneRows(client, normalizedTransactionId)
  }

  const laneIds = laneRows.map((row) => row.id).filter(Boolean)
  const [steps, updates, history, documentRequests] = await Promise.all([
    fetchSteps(client, laneIds),
    fetchLaneUpdates(client, normalizedTransactionId),
    fetchLaneHistory(client, normalizedTransactionId),
    fetchLaneDocumentRequests(client, normalizedTransactionId),
  ])
  const stepsBySubprocessId = steps.reduce((accumulator, step) => {
    if (!accumulator[step.subprocess_id]) accumulator[step.subprocess_id] = []
    accumulator[step.subprocess_id].push(step)
    return accumulator
  }, {})

  const laneContexts = {}
  for (const laneKey of requiredLaneKeys) {
    const meta = LANE_META[laneKey]
    laneContexts[laneKey] = await getAttorneyLegalPermissionContext({
      userId: actor?.id || null,
      transactionId: normalizedTransactionId,
      attorneyRole: meta.attorneyRole,
    }).catch(() => baselineContext)
  }
  const legalTimeline = buildTimelineFromSources({
    updates,
    history,
    documentRequests,
    permissionByLane: laneContexts,
  })

  const lanes = laneRows
    .map((row) => {
      const laneKey = normalizeLaneKey(row.process_type === 'attorney' ? 'transfer' : row.process_type)
      const assignment = mapAssignmentForLane(assignments, laneKey)
      const lane = mapLaneRow({ ...row, process_type: laneKey }, stepsBySubprocessId[row.id] || [], assignment)
      const permissionContext = laneContexts[laneKey] || baselineContext
      const visibleUpdates = updates.filter((update) => {
        if (!(update.lane_key === laneKey || update.attorney_role === lane.attorneyRole)) return false
        return canSeeAttorneyUpdateVisibility(permissionContext, update.visibility)
      })
      const laneDocumentRequests = documentRequests.filter(
        (request) =>
          request.lane_key === laneKey ||
          request.attorney_role === lane.attorneyRole ||
          (!request.lane_key && String(request.category || '').trim().toLowerCase().includes(laneKey)),
      )
      const laneRequirements = legalDocuments.requirements
        .filter((requirement) => requirement.laneKey === laneKey || requirement.attorneyRole === lane.attorneyRole)
        .map((requirement) => summarizeRequirementStatus(requirement, laneDocumentRequests))
      const laneSigningRequirements = legalDocuments.signingRequirements.filter(
        (requirement) => requirement.laneKey === laneKey || requirement.attorneyRole === lane.attorneyRole,
      )
      const updateOptions = resolveAttorneyUpdateOptions(transaction, lane.attorneyRole)
      return {
        ...lane,
        permissions: {
          canView: Boolean(permissionContext?.canViewLane),
          canUpdateStage: Boolean(permissionContext?.canUpdateLane),
          canAddInternalNote: Boolean(permissionContext?.canAddInternalNote),
          canAddSharedUpdate: Boolean(permissionContext?.canAddSharedUpdate),
          canPublishClientVisibleUpdate: Boolean(permissionContext?.canPublishClientVisibleUpdate),
          canRequestDocuments: Boolean(permissionContext?.canRequestDocuments),
          canUploadDocuments: Boolean(permissionContext?.canUploadDocuments),
          canReviewDocuments: Boolean(permissionContext?.canReviewDocuments),
          canManageSigning: Boolean(permissionContext?.canManageSigning),
          canAssignAttorney: Boolean(permissionContext?.canAssignAttorney),
          readOnlyReason: permissionContext?.viewReason || 'view_only',
        },
        updates: visibleUpdates,
        updateOptions,
        timeline: legalTimeline.filter((item) => item.laneKey === laneKey || item.attorneyRole === lane.attorneyRole).slice(0, 12),
        documentRequests: laneDocumentRequests,
        documentRequirements: laneRequirements,
        documentSummary: summarizeLaneDocuments(laneRequirements),
        signingRequirements: laneSigningRequirements,
      }
    })
    .filter((lane) => requiredLaneKeys.includes(lane.laneKey))

  return {
    transaction,
    workflow,
    legalDocuments,
    legalTimeline,
    timelineFilters: TIMELINE_FILTERS,
    lanes,
    missingRequiredRoles: workflow.missingRequiredRoles,
    assignments,
    permissions: {
      canViewLegalWorkspace: true,
      canViewInternalNotes: Boolean(baselineContext?.canViewInternalNotes),
      canViewProfessionalUpdates: Boolean(baselineContext?.canViewProfessionalUpdates),
      canAssignAttorney: Boolean(baselineContext?.canAssignAttorney),
      appRole: baselineContext?.appRole || null,
      viewReason: baselineContext?.viewReason || null,
    },
  }
}

async function assertCanUpdateLane({ user, transactionId, laneKey }) {
  const meta = LANE_META[laneKey]
  const canUpdate = await canUpdateAttorneyLanePermission(user?.id || user, transactionId, meta.attorneyRole)
  if (!canUpdate) {
    throw new Error('You do not have permission to update this attorney workflow.')
  }
}

async function assertCanRequestLaneDocument({ user, transactionId, laneKey }) {
  const meta = LANE_META[laneKey]
  const allowed = await canRequestAttorneyDocuments(user?.id || user, transactionId, meta.attorneyRole)
  if (!allowed) {
    throw new Error('This document action is restricted to the assigned attorney or firm manager.')
  }
}

async function assertCanReviewLaneDocument({ user, transactionId, laneKey }) {
  const meta = LANE_META[laneKey]
  const allowed = await canReviewAttorneyDocuments(user?.id || user, transactionId, meta.attorneyRole)
  if (!allowed) {
    throw new Error('This document cannot be reviewed by your role.')
  }
}

function buildDocumentRequestPayload({
  transactionId,
  actorId,
  laneKey,
  requirement = null,
  title = '',
  description = '',
  requestedFrom = 'client',
  priority = 'required',
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const meta = LANE_META[normalizedLaneKey]
  const requestAudience = String(requestedFrom || requirement?.requiredFrom || 'client').trim().toLowerCase()
  const requestVisibility = requirement?.visibilityDefault || (['client', 'buyer', 'seller'].includes(requestAudience) ? 'client_visible' : 'professional_shared')
  const requestTitle = String(title || requirement?.label || '').trim()
  const requestDescription = description || requirement?.description || requirement?.reason || null

  return {
    transaction_id: transactionId,
    category: requirement?.category || normalizedLaneKey,
    document_type: requirement?.id || requestTitle,
    title: requestTitle,
    description: requestDescription,
    priority: priority || (requirement?.required === false ? 'optional' : 'required'),
    assigned_to_role: requestAudience || 'client',
    status: 'requested',
    requires_review: requirement?.reviewRequired !== false,
    visibility_scope: requestVisibility,
    created_by: actorId,
    created_by_role: 'attorney',
    lane_key: normalizedLaneKey,
    attorney_role: meta.attorneyRole,
    requested_from: requestAudience || 'client',
    requested_by: actorId,
    review_status: 'requested',
    requirement_id: requirement?.id || null,
  }
}

async function insertDocumentRequest(client, payload) {
  let insert = await client.from('document_requests').insert(payload).select('id').maybeSingle()
  if (
    insert.error &&
    (isMissingColumnError(insert.error, 'lane_key') ||
      isMissingColumnError(insert.error, 'review_status') ||
      isMissingColumnError(insert.error, 'visibility_scope') ||
      isMissingColumnError(insert.error, 'requirement_id'))
  ) {
    const fallback = { ...payload }
    delete fallback.lane_key
    delete fallback.attorney_role
    delete fallback.requested_from
    delete fallback.requested_by
    delete fallback.review_status
    delete fallback.visibility_scope
    delete fallback.requirement_id
    insert = await client.from('document_requests').insert(fallback).select('id').maybeSingle()
  }
  if (insert.error) throw insert.error
  return insert.data
}

async function fetchLaneForUpdate(client, transactionId, laneKey) {
  const query = await client
    .from('transaction_subprocesses')
    .select('id, transaction_id, process_type, status, attorney_role, current_stage, lane_status, completed_at')
    .eq('transaction_id', transactionId)
    .eq('process_type', laneKey)
    .maybeSingle()

  if (query.error) {
    if (isMissingSchemaError(query.error)) throw new Error('Attorney workflow lanes are not set up yet.')
    throw query.error
  }
  if (!query.data) throw new Error('This workflow lane is not required for this transaction.')
  return query.data
}

export async function updateAttorneyWorkflowLaneStage({
  transactionId,
  laneKey,
  stageKey,
  note = '',
  laneStatus = 'in_progress',
  visibility = 'internal',
} = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)
  const normalizedTransactionId = String(transactionId || '').trim()
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const normalizedStageKey = String(stageKey || '').trim()
  const stages = getLaneStages(normalizedLaneKey)
  const targetIndex = stages.indexOf(normalizedStageKey)
  if (!normalizedTransactionId) throw new Error('Transaction id is required.')
  if (targetIndex < 0) throw new Error('This stage does not belong to this attorney workflow.')

  await assertCanUpdateLane({ user: actor, transactionId: normalizedTransactionId, laneKey: normalizedLaneKey })
  const permissionContext = await getAttorneyLegalPermissionContext({
    userId: actor.id,
    transactionId: normalizedTransactionId,
    attorneyRole: LANE_META[normalizedLaneKey].attorneyRole,
  })
  assertCanPublishVisibility(permissionContext, visibility)
  const lane = await fetchLaneForUpdate(client, normalizedTransactionId, normalizedLaneKey)
  const currentStage = lane.current_stage || stages[0]
  const currentIndex = stages.indexOf(currentStage)
  const isRegression = currentIndex >= 0 && targetIndex < currentIndex
  const normalizedNote = String(note || '').trim()
  if (isRegression && !normalizedNote) {
    throw new Error('Please provide a reason when moving a workflow backwards.')
  }

  const finalStage = targetIndex === stages.length - 1
  const nextLaneStatus = normalizeLaneStatus(finalStage ? 'completed' : laneStatus, 'in_progress')
  const nowIso = new Date().toISOString()

  const stepRows = stages.map((stage, index) => ({
    subprocess_id: lane.id,
    step_key: stage,
    step_label: getStageLabel(stage),
    status: finalStage || index < targetIndex ? 'completed' : index === targetIndex ? nextLaneStatus === 'blocked' ? 'blocked' : 'in_progress' : 'not_started',
    completed_at: finalStage || index < targetIndex ? nowIso : null,
    comment: index === targetIndex ? normalizedNote || null : null,
    owner_type: 'attorney',
    sort_order: index + 1,
    visibility_scope: normalizeVisibility(visibility),
    completed_by: finalStage || index < targetIndex ? actor.id : null,
  }))

  let stepUpdate = await client
    .from('transaction_subprocess_steps')
    .upsert(stepRows, { onConflict: 'subprocess_id,step_key' })

  if (stepUpdate.error && (isMissingColumnError(stepUpdate.error, 'visibility_scope') || isMissingColumnError(stepUpdate.error, 'completed_by'))) {
    const fallbackRows = stepRows.map((row) => {
      const next = { ...row }
      delete next.visibility_scope
      delete next.completed_by
      return next
    })
    stepUpdate = await client
      .from('transaction_subprocess_steps')
      .upsert(fallbackRows, { onConflict: 'subprocess_id,step_key' })
  }
  if (stepUpdate.error) throw stepUpdate.error

  let laneUpdate = await client
    .from('transaction_subprocesses')
    .update({
      current_stage: normalizedStageKey,
      lane_status: nextLaneStatus,
      status: nextLaneStatus,
      completed_at: nextLaneStatus === 'completed' ? nowIso : null,
      updated_by: actor.id,
      updated_at: nowIso,
    })
    .eq('id', lane.id)

  if (laneUpdate.error && (isMissingColumnError(laneUpdate.error, 'current_stage') || isMissingColumnError(laneUpdate.error, 'lane_status'))) {
    laneUpdate = await client
      .from('transaction_subprocesses')
      .update({
        status: nextLaneStatus,
        updated_at: nowIso,
      })
      .eq('id', lane.id)
  }
  if (laneUpdate.error) throw laneUpdate.error

  await client.from('transaction_attorney_lane_history').insert({
    transaction_id: normalizedTransactionId,
    subprocess_id: lane.id,
    lane_key: normalizedLaneKey,
    attorney_role: LANE_META[normalizedLaneKey].attorneyRole,
    previous_stage: currentStage || null,
    new_stage: normalizedStageKey,
    previous_status: lane.lane_status || lane.status || null,
    new_status: nextLaneStatus,
    changed_by: actor.id,
    note: normalizedNote || null,
    visibility: normalizeVisibility(visibility),
    source: 'attorney_workspace',
    metadata: { regression: isRegression },
  }).catch(() => null)

  await insertTransactionEvent(client, {
    transactionId: normalizedTransactionId,
    eventType: nextLaneStatus === 'blocked' ? 'AttorneyLaneBlocked' : nextLaneStatus === 'completed' ? 'AttorneyLaneCompleted' : 'AttorneyLaneStageUpdated',
    actorId: actor.id,
    visibility: normalizeVisibility(visibility),
    eventData: {
      laneKey: normalizedLaneKey,
      attorneyRole: LANE_META[normalizedLaneKey].attorneyRole,
      previousStage: currentStage || null,
      newStage: normalizedStageKey,
      note: normalizedNote || null,
    },
  })

  return getAttorneyWorkflowOperationsForTransaction(normalizedTransactionId, { initialize: false })
}

export async function getAttorneyUpdateOptionsForTransaction(transactionId, attorneyRole = 'transfer_attorney') {
  const client = requireClient()
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) throw new Error('Transaction id is required.')
  const transaction = await fetchTransaction(client, normalizedTransactionId)
  return resolveAttorneyUpdateOptions(transaction, attorneyRole)
}

export async function addAttorneyTransactionUpdate({
  transactionId,
  laneKey,
  attorneyRole = null,
  updateType = '',
  message,
  visibility = null,
  clientRecipients = [],
  documentId = null,
  signingPacketId = null,
} = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)
  const normalizedTransactionId = String(transactionId || '').trim()
  const normalizedLaneKey = normalizeLaneKey(laneKey || attorneyRole)
  const meta = LANE_META[normalizedLaneKey]
  const normalizedAttorneyRole = meta.attorneyRole
  const normalizedMessage = String(message || '').trim()
  if (!normalizedMessage) throw new Error('Unable to save attorney update.')

  const transaction = await fetchTransaction(client, normalizedTransactionId)
  const registryType = getAttorneyUpdateType(updateType)
  const isGenericInternalNote = !updateType || updateType === 'internal_note'
  const resolvedOptions = resolveAttorneyUpdateOptions(transaction, normalizedAttorneyRole)
  const validOptionIds = new Set(resolvedOptions.groups.flatMap((group) => group.options.map((option) => option.id)))
  if (!isGenericInternalNote && (!registryType || registryType.attorneyRole !== normalizedAttorneyRole || !validOptionIds.has(registryType.id))) {
    throw new Error('This update type does not apply to this transaction.')
  }

  const defaultVisibility = isGenericInternalNote ? 'internal' : registryType.defaultVisibility || 'internal'
  const normalizedVisibility = normalizeVisibility(visibility || defaultVisibility)
  if (isGenericInternalNote && normalizedVisibility === 'client_visible') {
    throw new Error('Internal notes cannot be made client-visible.')
  }
  if (normalizedVisibility === 'client_visible' && registryType && !registryType.clientVisibleAllowed) {
    throw new Error('This update type cannot be published to the client portal.')
  }

  const permissionContext = await getAttorneyLegalPermissionContext({
    userId: actor.id,
    transactionId: normalizedTransactionId,
    attorneyRole: normalizedAttorneyRole,
  })
  assertCanPublishVisibility(permissionContext, normalizedVisibility)
  const lane = await fetchLaneForUpdate(client, normalizedTransactionId, normalizedLaneKey)

  const payload = {
    transaction_id: normalizedTransactionId,
    subprocess_id: lane.id,
    lane_key: normalizedLaneKey,
    attorney_role: normalizedAttorneyRole,
    update_type: isGenericInternalNote ? UPDATE_TYPE_BY_VISIBILITY[normalizedVisibility] || 'internal_note' : registryType.id,
    visibility: normalizedVisibility,
    message: normalizedMessage,
    created_by: actor.id,
    related_document_id: documentId || null,
    related_signing_packet_id: signingPacketId || null,
    client_recipients: Array.isArray(clientRecipients) ? clientRecipients : [],
    metadata: {
      updateTypeLabel: isGenericInternalNote ? getUpdateTypeLabel(UPDATE_TYPE_BY_VISIBILITY[normalizedVisibility]) : registryType.label,
      updateCategory: isGenericInternalNote ? 'note' : registryType.category,
      clientVisibleAllowed: Boolean(registryType?.clientVisibleAllowed),
      documentId: documentId || null,
      signingPacketId: signingPacketId || null,
    },
  }

  let insert = await client.from('transaction_attorney_lane_updates').insert(payload)
  if (
    insert.error &&
    (isMissingColumnError(insert.error, 'related_document_id') ||
      isMissingColumnError(insert.error, 'related_signing_packet_id') ||
      isMissingColumnError(insert.error, 'client_recipients') ||
      isMissingColumnError(insert.error, 'metadata'))
  ) {
    const fallback = { ...payload }
    delete fallback.related_document_id
    delete fallback.related_signing_packet_id
    delete fallback.client_recipients
    delete fallback.metadata
    insert = await client.from('transaction_attorney_lane_updates').insert(fallback)
  }
  if (insert.error) throw insert.error

  await insertTransactionEvent(client, {
    transactionId: normalizedTransactionId,
    eventType:
      normalizedVisibility === 'client_visible'
        ? 'AttorneyLaneClientVisibleUpdatePublished'
        : normalizedVisibility === 'professional_shared'
          ? 'AttorneyLaneSharedUpdateAdded'
          : 'AttorneyLaneNoteAdded',
    actorId: actor.id,
    visibility: normalizedVisibility,
    eventData: {
      laneKey: normalizedLaneKey,
      attorneyRole: normalizedAttorneyRole,
      updateType: payload.update_type,
      title: payload.metadata.updateTypeLabel,
      message: normalizedMessage,
      relatedDocumentId: documentId || null,
      relatedSigningPacketId: signingPacketId || null,
      clientRecipients: payload.client_recipients,
    },
  })

  return getAttorneyWorkflowOperationsForTransaction(normalizedTransactionId, { initialize: false })
}

export async function addAttorneyWorkflowLaneUpdate(options = {}) {
  return addAttorneyTransactionUpdate(options)
}

export async function requestAttorneyWorkflowLaneDocument({
  transactionId,
  laneKey,
  title,
  description = '',
  requestedFrom = 'client',
  priority = 'required',
} = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)
  const normalizedTransactionId = String(transactionId || '').trim()
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const normalizedTitle = String(title || '').trim()
  if (!normalizedTitle) throw new Error('Document title is required.')

  await assertCanRequestLaneDocument({ user: actor, transactionId: normalizedTransactionId, laneKey: normalizedLaneKey })
  await fetchLaneForUpdate(client, normalizedTransactionId, normalizedLaneKey)

  const payload = buildDocumentRequestPayload({
    transactionId: normalizedTransactionId,
    actorId: actor.id,
    laneKey: normalizedLaneKey,
    title: normalizedTitle,
    description,
    requestedFrom,
    priority,
  })
  await insertDocumentRequest(client, payload)

  await insertTransactionEvent(client, {
    transactionId: normalizedTransactionId,
    eventType: 'AttorneyLaneDocumentRequested',
    actorId: actor.id,
    visibility: payload.visibility_scope,
    eventData: { laneKey: normalizedLaneKey, attorneyRole: payload.attorney_role, title: normalizedTitle, requestedFrom: payload.requested_from },
  })

  return getAttorneyWorkflowOperationsForTransaction(normalizedTransactionId, { initialize: false })
}

export async function generateMissingAttorneyDocumentRequests(transactionId, { laneKey = null } = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)
  const normalizedTransactionId = String(transactionId || '').trim()
  if (!normalizedTransactionId) throw new Error('Transaction id is required.')

  const transaction = await fetchTransaction(client, normalizedTransactionId)
  const resolved = resolveLegalDocumentRequirements(transaction)
  const documentRequests = await fetchLaneDocumentRequests(client, normalizedTransactionId)
  const targetLaneKey = laneKey ? normalizeLaneKey(laneKey) : null
  const missingRequirements = resolved.requirements.filter((requirement) => {
    if (targetLaneKey && requirement.laneKey !== targetLaneKey) return false
    if (requirement.requestable === false) return false
    return !documentRequests.some((request) => requirementMatchesRequest(requirement, request))
  })

  const created = []
  for (const requirement of missingRequirements) {
    await assertCanRequestLaneDocument({ user: actor, transactionId: normalizedTransactionId, laneKey: requirement.laneKey })
    const payload = buildDocumentRequestPayload({
      transactionId: normalizedTransactionId,
      actorId: actor.id,
      laneKey: requirement.laneKey,
      requirement,
      requestedFrom: requirement.requiredFrom,
      priority: requirement.required === false ? 'optional' : 'required',
    })
    const inserted = await insertDocumentRequest(client, payload)
    created.push({ ...requirement, requestId: inserted?.id || null })
    await insertTransactionEvent(client, {
      transactionId: normalizedTransactionId,
      eventType: 'AttorneyLaneDocumentRequested',
      actorId: actor.id,
      visibility: payload.visibility_scope,
      eventData: {
        action: 'conditional_requirement_request_created',
        laneKey: requirement.laneKey,
        attorneyRole: requirement.attorneyRole,
        requirementId: requirement.id,
        title: requirement.label,
        requestedFrom: payload.requested_from,
      },
    })
  }

  if (created.length) {
    await insertTransactionEvent(client, {
      transactionId: normalizedTransactionId,
      eventType: 'AttorneyDocumentRequirementsGenerated',
      actorId: actor.id,
      visibility: 'internal',
      eventData: {
        count: created.length,
        laneKey: targetLaneKey || 'all',
        requirementIds: created.map((item) => item.id),
      },
    }).catch(() => null)
  }

  return getAttorneyWorkflowOperationsForTransaction(normalizedTransactionId, { initialize: false })
}

export async function reviewAttorneyDocumentRequest({
  transactionId,
  requestId,
  laneKey,
  decision,
  reason = '',
} = {}) {
  const client = requireClient()
  const actor = await getAuthenticatedUser(client)
  const normalizedTransactionId = String(transactionId || '').trim()
  const normalizedRequestId = String(requestId || '').trim()
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const normalizedDecision = String(decision || '').trim().toLowerCase()
  const normalizedReason = String(reason || '').trim()
  if (!normalizedTransactionId || !normalizedRequestId) throw new Error('Document request is required.')
  if (!['under_review', 'approved', 'rejected', 'completed'].includes(normalizedDecision)) {
    throw new Error('Document review decision is not valid.')
  }
  if (normalizedDecision === 'rejected' && !normalizedReason) {
    throw new Error('Please provide a rejection reason.')
  }

  await assertCanReviewLaneDocument({ user: actor, transactionId: normalizedTransactionId, laneKey: normalizedLaneKey })

  const nextStatus = normalizedDecision === 'approved' ? 'approved' : normalizedDecision
  const updates = {
    status: nextStatus,
    review_status: nextStatus,
    updated_at: new Date().toISOString(),
  }
  if (normalizedDecision === 'rejected') {
    updates.rejected_reason = normalizedReason
    updates.rejection_reason = normalizedReason
  }
  if (normalizedDecision === 'completed') {
    updates.completed_at = new Date().toISOString()
  }

  let update = await client
    .from('document_requests')
    .update(updates)
    .eq('id', normalizedRequestId)
    .eq('transaction_id', normalizedTransactionId)

  if (
    update.error &&
    (isMissingColumnError(update.error, 'review_status') ||
      isMissingColumnError(update.error, 'rejection_reason') ||
      isMissingColumnError(update.error, 'rejected_reason') ||
      isMissingColumnError(update.error, 'completed_at'))
  ) {
    const fallback = {
      status: nextStatus,
      updated_at: updates.updated_at,
    }
    update = await client
      .from('document_requests')
      .update(fallback)
      .eq('id', normalizedRequestId)
      .eq('transaction_id', normalizedTransactionId)
  }
  if (update.error) throw update.error

  const eventByDecision = {
    under_review: 'AttorneyDocumentUploaded',
    approved: 'AttorneyDocumentApproved',
    rejected: 'AttorneyDocumentRejected',
    completed: 'AttorneyDocumentCompleted',
  }

  await insertTransactionEvent(client, {
    transactionId: normalizedTransactionId,
    eventType: eventByDecision[normalizedDecision] || 'AttorneyDocumentApproved',
    actorId: actor.id,
    visibility: normalizedDecision === 'rejected' ? 'client_visible' : 'professional_shared',
    eventData: {
      laneKey: normalizedLaneKey,
      attorneyRole: LANE_META[normalizedLaneKey].attorneyRole,
      requestId: normalizedRequestId,
      decision: normalizedDecision,
      reason: normalizedReason || null,
    },
  })

  return getAttorneyWorkflowOperationsForTransaction(normalizedTransactionId, { initialize: false })
}
