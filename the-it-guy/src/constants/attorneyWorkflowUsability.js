import {
  attorneyStageKeyMatches,
  getAttorneyEvidenceRequirementsForStage,
  getAttorneyStageDefinition,
  getAttorneyStageLabel,
  getAttorneyWorkflowStatusLabel,
  normalizeAttorneyStageKey,
  resolveAttorneyWorkflowState,
} from './attorneyWorkflowStages.js'

const SEVERITY_ORDER = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
}

const LANE_LABELS = {
  transfer: 'Transfer Attorney',
  bond: 'Bond Attorney',
  cancellation: 'Cancellation Attorney',
}

const PRIORITY_LABELS = {
  optional: 'Optional',
  required: 'Required',
  urgent: 'Urgent',
}

const VISIBILITY_LABELS = {
  internal: 'Internal',
  professional_shared: 'Professional Shared',
  client_visible: 'Client Visible',
}

function normalizeLaneKey(value = '') {
  const normalized = String(value || '').trim().toLowerCase().replace(/_attorney$/, '')
  if (normalized === 'bond') return 'bond'
  if (normalized === 'cancellation') return 'cancellation'
  return 'transfer'
}

function normalizeStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'complete') return 'completed'
  if (normalized === 'approved') return 'approved'
  if (normalized === 'pending') return 'waiting'
  return normalized
}

function normalizeSeverity(value = 'medium') {
  const normalized = String(value || '').trim().toLowerCase()
  return SEVERITY_ORDER[normalized] ? normalized : 'medium'
}

function highestSeverity(items = []) {
  return (items || []).reduce((highest, item) => {
    const severity = normalizeSeverity(item.severity)
    return SEVERITY_ORDER[severity] > SEVERITY_ORDER[highest] ? severity : highest
  }, 'low')
}

function itemComplete(item = {}) {
  const status = normalizeStatus(item.status || item.reviewStatus || item.review_status)
  return Boolean(item.complete || ['approved', 'completed', 'complete'].includes(status))
}

function requiredItems(items = []) {
  return (items || []).filter((item) => item.required !== false && item.affectsReadiness !== false)
}

function stepIsComplete(steps = [], laneKey = 'transfer', expectedKeys = []) {
  return (steps || []).some(
    (step) => attorneyStageKeyMatches(step.stepKey || step.step_key || step.key, expectedKeys, laneKey) && normalizeStatus(step.status) === 'completed',
  )
}

function signingComplete(requirement = {}, laneKey = 'transfer', steps = [], documentRequirements = []) {
  if (itemComplete(requirement)) return true
  if (requirement.sourceRequirementId) {
    const source = (documentRequirements || []).find((item) => item.id === requirement.sourceRequirementId)
    if (itemComplete(source)) return true
  }
  if (['buyer_transfer_signature', 'buyer_transfer_documents_signature'].includes(requirement.id)) {
    return stepIsComplete(steps, laneKey, ['buyer_signed_transfer_documents'])
  }
  if (['seller_transfer_signature', 'seller_transfer_documents_signature'].includes(requirement.id)) {
    return stepIsComplete(steps, laneKey, ['seller_signed_transfer_documents'])
  }
  if (requirement.id === 'buyer_bond_documents_signature') {
    return stepIsComplete(steps, laneKey, ['buyer_signed_bond_documents'])
  }
  if (requirement.id === 'seller_cancellation_documents_signature') {
    return stepIsComplete(steps, laneKey, ['seller_cancellation_documents_signed', 'cancellation_documents_prepared'])
  }
  return false
}

function currentStepForLane({ laneKey, steps = [], currentStage = '', summary = {} } = {}) {
  const canonicalCurrent = normalizeAttorneyStageKey(currentStage || summary.currentStage, laneKey)
  return (
    (steps || []).find((step) => normalizeAttorneyStageKey(step.stepKey || step.step_key || step.key, laneKey) === canonicalCurrent) ||
    (steps || []).find((step) => ['blocked', 'waiting', 'in_progress'].includes(normalizeStatus(step.status))) ||
    (steps || []).find((step) => normalizeStatus(step.status) !== 'completed') ||
    (steps || []).at(-1) ||
    null
  )
}

function buildAction({
  id,
  label,
  description = '',
  type = 'update_workflow',
  target = 'attorney',
  priority = 'medium',
  laneKey = 'transfer',
  stageKey = null,
  relatedId = null,
}) {
  return {
    id,
    label,
    description,
    type,
    target,
    priority: normalizeSeverity(priority),
    laneKey: normalizeLaneKey(laneKey),
    stageKey,
    relatedId,
  }
}

function sortActions(left, right) {
  const severityDelta = (SEVERITY_ORDER[right.priority] || 0) - (SEVERITY_ORDER[left.priority] || 0)
  if (severityDelta) return severityDelta
  return 0
}

function summarizeCount(count, singular, plural = `${singular}s`) {
  if (!count) return ''
  return `${count} ${count === 1 ? singular : plural}`
}

function buildAttentionSummary({ missingData, outstandingDocuments, outstandingSignatures, evidenceChecklist, assignment }) {
  const parts = [
    !assignment ? 'assignment missing' : '',
    summarizeCount(missingData.length, 'data field'),
    summarizeCount(outstandingDocuments.length, 'document'),
    summarizeCount(outstandingSignatures.length, 'signature'),
    summarizeCount(evidenceChecklist.filter((item) => !item.complete).length, 'evidence item'),
  ].filter(Boolean)
  return parts.length ? parts.join(' • ') : 'No immediate workflow blockers visible.'
}

function compactText(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function sentence(...parts) {
  return compactText(parts.filter(Boolean).join(' ')).replace(/\s+\./g, '.')
}

function stripActionPrefix(label = '') {
  return compactText(label)
    .replace(/^request\s+corrected\s+/i, '')
    .replace(/^request\s+/i, '')
    .replace(/^correct\s+/i, '')
    .replace(/^capture\s+/i, '')
    .replace(/^follow\s+up\s+/i, '')
    .replace(/^resolve\s+/i, '')
    .replace(/^complete\s+/i, '')
}

function normalizeRequestedFrom(target = '') {
  const normalized = String(target || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) return 'client'
  if (normalized.includes('buyer') || normalized.includes('purchaser')) return 'buyer'
  if (normalized.includes('seller') || normalized.includes('vendor')) return 'seller'
  if (normalized.includes('bank')) return 'bank'
  if (normalized.includes('agent') || normalized.includes('developer')) return 'agent'
  if (normalized.includes('attorney') || normalized.includes('conveyancer') || normalized.includes('originator') || normalized.includes('management')) return 'attorney'
  return 'client'
}

function requestedFromLabel(value = '') {
  const normalized = normalizeRequestedFrom(value)
  if (normalized === 'buyer') return 'Buyer'
  if (normalized === 'seller') return 'Seller'
  if (normalized === 'bank') return 'Bank'
  if (normalized === 'agent') return 'Agent'
  if (normalized === 'attorney') return 'Attorney Team'
  return 'Client'
}

function normalizeCommandVisibility(value = '', fallback = 'internal') {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'shared' || normalized === 'shared_role_players') return 'professional_shared'
  if (normalized === 'client') return 'client_visible'
  if (normalized === 'internal_only') return 'internal'
  return VISIBILITY_LABELS[normalized] ? normalized : fallback
}

function documentVisibilityForAudience(audience = 'client') {
  const normalized = normalizeRequestedFrom(audience)
  if (['buyer', 'seller', 'client'].includes(normalized)) return 'client_visible'
  if (['bank', 'agent', 'attorney'].includes(normalized)) return 'professional_shared'
  return 'professional_shared'
}

function commandPriorityForAction(action = {}, fallback = 'required') {
  const actionType = String(action.type || '').trim().toLowerCase()
  if (actionType === 'request_corrected_document') return 'urgent'
  const priority = normalizeSeverity(action.priority || fallback)
  if (priority === 'critical' || priority === 'high') return 'urgent'
  if (priority === 'low') return 'optional'
  return 'required'
}

function dueDaysForAction(action = {}, commandType = '') {
  const actionType = String(action.type || '').trim().toLowerCase()
  const priority = normalizeSeverity(action.priority)
  if (actionType === 'request_corrected_document' || priority === 'critical') return 1
  if (priority === 'high' || commandType === 'schedule_signing') return 2
  if (priority === 'medium') return 3
  return 7
}

function isoDatePlusDays(value, days = 3) {
  const date = new Date(value || Date.now())
  if (Number.isNaN(date.getTime())) return ''
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function buildWorkPacket({
  action = {},
  laneKey = 'transfer',
  stageKey = '',
  subject = '',
  commandType = 'add_note',
  requestedFrom = '',
  visibility = 'internal',
  priority = 'required',
  dueDate = '',
  checklist = [],
  now = null,
} = {}) {
  const normalizedVisibility = normalizeCommandVisibility(visibility)
  const normalizedPriority = ['urgent', 'required', 'optional'].includes(priority) ? priority : 'required'
  const stageLabel = stageKey ? getAttorneyStageLabel(stageKey, laneKey) : ''
  return {
    title: subject || action.label || 'Workflow action',
    laneKey,
    laneLabel: LANE_LABELS[laneKey] || 'Transfer Attorney',
    stageKey,
    stageLabel,
    commandType,
    audience: requestedFrom ? normalizeRequestedFrom(requestedFrom) : action.target || 'attorney',
    audienceLabel: requestedFrom ? requestedFromLabel(requestedFrom) : requestedFromLabel(action.target || 'attorney'),
    priority: normalizedPriority,
    priorityLabel: PRIORITY_LABELS[normalizedPriority] || 'Required',
    visibility: normalizedVisibility,
    visibilityLabel: VISIBILITY_LABELS[normalizedVisibility] || 'Internal',
    dueDate: dueDate || isoDatePlusDays(now, dueDaysForAction(action, commandType)),
    checklist: checklist.filter(Boolean),
  }
}

export function normalizeAttorneyWorkflowWorkPacket(packet = null) {
  if (!packet || typeof packet !== 'object') return null
  const laneKey = normalizeLaneKey(packet.laneKey)
  const stageKey = normalizeAttorneyStageKey(packet.stageKey || '', laneKey)
  const visibility = normalizeCommandVisibility(packet.visibility)
  const priority = ['urgent', 'required', 'optional'].includes(packet.priority) ? packet.priority : 'required'
  const checklist = Array.isArray(packet.checklist)
    ? packet.checklist.map((item) => compactText(item)).filter(Boolean).slice(0, 6)
    : []

  return {
    title: compactText(packet.title || 'Workflow action'),
    laneKey,
    laneLabel: compactText(packet.laneLabel || LANE_LABELS[laneKey] || 'Transfer Attorney'),
    stageKey,
    stageLabel: compactText(packet.stageLabel || (stageKey ? getAttorneyStageLabel(stageKey, laneKey) : '')),
    commandType: compactText(packet.commandType || 'add_note'),
    audience: compactText(packet.audience || 'attorney'),
    audienceLabel: compactText(packet.audienceLabel || requestedFromLabel(packet.audience || 'attorney')),
    priority,
    priorityLabel: PRIORITY_LABELS[priority] || 'Required',
    visibility,
    visibilityLabel: VISIBILITY_LABELS[visibility] || 'Internal',
    dueDate: compactText(packet.dueDate || ''),
    checklist,
    sourceFollowUpId: compactText(packet.sourceFollowUpId || ''),
    sourceFollowUpSource: compactText(packet.sourceFollowUpSource || ''),
    sourceFollowUpRelatedId: compactText(packet.sourceFollowUpRelatedId || ''),
    sourceFollowUpStatus: compactText(packet.sourceFollowUpStatus || ''),
    sourceCoordinationId: compactText(packet.sourceCoordinationId || ''),
    sourceCoordinationLaneKey: compactText(packet.sourceCoordinationLaneKey || ''),
    sourceCoordinationTargetStage: compactText(packet.sourceCoordinationTargetStage || ''),
    sourceCoordinationStatus: compactText(packet.sourceCoordinationStatus || ''),
  }
}

function buildNoteDraft({ laneKey, message, visibility = 'internal', workPacket = null }) {
  return {
    laneKey,
    visibility: normalizeCommandVisibility(visibility),
    message: compactText(message),
    workPacket: normalizeAttorneyWorkflowWorkPacket(workPacket),
  }
}

function buildCommand({
  action = {},
  laneKey = 'transfer',
  stageKey = '',
  commandType = 'add_note',
  label = 'Start Action',
  description = '',
  draft = null,
  workPacket = null,
}) {
  const normalizedWorkPacket = normalizeAttorneyWorkflowWorkPacket(workPacket)
  const normalizedDraft = draft && typeof draft === 'object' && 'workPacket' in draft
    ? { ...draft, workPacket: normalizedWorkPacket }
    : draft

  return {
    id: `${action.id || action.type || 'workflow'}_command`,
    actionId: action.id || '',
    actionType: action.type || '',
    commandType,
    label,
    description,
    laneKey,
    stageKey,
    relatedId: action.relatedId || '',
    workPacket: normalizedWorkPacket,
    draft: normalizedDraft,
  }
}

export function buildAttorneyWorkflowActionCommand(action = {}, context = {}) {
  const laneKey = normalizeLaneKey(action.laneKey || context.laneKey)
  const stageKey = normalizeAttorneyStageKey(action.stageKey || context.stageKey || '', laneKey)
  const actionType = String(action.type || '').trim().toLowerCase()
  const actionLabel = compactText(action.label || 'Review workflow')
  const actionDescription = compactText(action.description || '')
  const subject = stripActionPrefix(actionLabel) || actionLabel
  const now = context.now || null

  if (actionType === 'assign_attorney') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject: actionLabel,
      commandType: 'open_assignments',
      requestedFrom: 'attorney',
      priority: 'urgent',
      visibility: 'internal',
      checklist: ['Confirm the correct firm and responsible attorney.', 'Check whether the lane is required for this transaction.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'open_assignments',
      label: 'Open Assignment',
      description: 'Choose or confirm the firm responsible for this legal lane.',
      workPacket,
    })
  }

  if (actionType === 'request_document' || actionType === 'request_corrected_document') {
    const corrected = actionType === 'request_corrected_document'
    const title = subject || 'Required Document'
    const requestedFrom = normalizeRequestedFrom(action.target)
    const priority = commandPriorityForAction(action)
    const visibility = documentVisibilityForAudience(requestedFrom)
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject: title,
      commandType: 'request_document',
      requestedFrom,
      priority,
      visibility,
      checklist: [
        corrected ? 'Explain what must be corrected.' : 'Confirm the exact document name before sending.',
        'Check that the request is routed to the right party.',
        'Attach or reference any rejected copy if available.',
      ],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'request_document',
      label: corrected ? 'Request Correction' : 'Request Document',
      description: corrected ? 'Prepare a corrected document request.' : 'Prepare a missing document request.',
      workPacket,
      draft: {
        laneKey,
        title,
        requestedFrom,
        priority,
        visibility,
        dueDate: workPacket.dueDate,
        workPacket,
        description: sentence(
          corrected ? `Please provide a corrected ${title}.` : `Please provide ${title}.`,
          actionDescription,
        ),
      },
    })
  }

  if (actionType === 'manage_signing') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject,
      commandType: 'schedule_signing',
      requestedFrom: action.target || 'client',
      priority: commandPriorityForAction(action),
      visibility: 'internal',
      checklist: ['Confirm signer availability.', 'Confirm the document pack is ready.', 'Record the appointment date and channel.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'schedule_signing',
      label: 'Schedule Signing',
      description: 'Prepare a signing follow-up note for the workflow.',
      workPacket,
      draft: buildNoteDraft({
        laneKey,
        visibility: workPacket.visibility,
        message: sentence(actionLabel, actionDescription || 'Confirm date, signer, and documents for signing.'),
        workPacket,
      }),
    })
  }

  if (actionType === 'complete_stage_evidence') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject,
      commandType: 'complete_step',
      requestedFrom: action.target || 'attorney',
      priority: commandPriorityForAction(action),
      visibility: 'internal',
      checklist: ['Confirm evidence exists on the matter.', 'Add a note identifying the evidence captured.', 'Only complete the stage when the checklist is satisfied.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'complete_step',
      label: 'Complete Stage',
      description: 'Open the active step completion form with the evidence note started.',
      workPacket,
      draft: {
        laneKey,
        status: 'completed',
        note: sentence('Evidence captured.', actionDescription),
        workPacket,
      },
    })
  }

  if (actionType === 'resolve_blocker') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject,
      commandType: 'add_note',
      requestedFrom: action.target || 'attorney',
      priority: commandPriorityForAction(action),
      visibility: 'internal',
      checklist: ['Record the blocker owner.', 'Capture the next follow-up needed.', 'Update the step status once the blocker is cleared.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'add_note',
      label: 'Add Resolution Note',
      description: 'Record what changed or what is still blocking the stage.',
      workPacket,
      draft: buildNoteDraft({
        laneKey,
        visibility: workPacket.visibility,
        message: sentence(`Blocker update for ${subject || 'current stage'}.`, actionDescription),
        workPacket,
      }),
    })
  }

  if (actionType === 'update_matter_data') {
    const workPacket = buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject,
      commandType: 'add_note',
      requestedFrom: action.target || 'attorney',
      priority: commandPriorityForAction(action),
      visibility: 'internal',
      checklist: ['Confirm the source of the data.', 'Capture it on the matter record.', 'Note who supplied the information.'],
      now,
    })
    return buildCommand({
      action,
      laneKey,
      stageKey,
      commandType: 'add_note',
      label: 'Add Data Note',
      description: 'Record the missing data so the team can capture it on the matter.',
      workPacket,
      draft: buildNoteDraft({
        laneKey,
        visibility: workPacket.visibility,
        message: sentence(`Matter data needed: ${subject || 'required field'}.`, actionDescription),
        workPacket,
      }),
    })
  }

  const workPacket = buildWorkPacket({
    action,
    laneKey,
    stageKey,
    subject: actionLabel,
    commandType: 'add_note',
    requestedFrom: action.target || 'attorney',
    priority: commandPriorityForAction(action),
    visibility: 'internal',
    checklist: ['Review the current workflow state.', 'Record the outcome or next follow-up.'],
    now,
  })
  return buildCommand({
    action,
    laneKey,
    stageKey,
    commandType: 'add_note',
    label: actionType === 'review_workflow' ? 'Add Review Note' : 'Add Note',
    description: 'Record a workflow note from this action.',
    workPacket,
    draft: buildNoteDraft({
      laneKey,
      visibility: workPacket.visibility,
      message: sentence(actionLabel, actionDescription),
      workPacket,
    }),
  })
}

function parseDateOnly(value = '') {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function daysUntil(dueDate = '', now = null) {
  const due = parseDateOnly(dueDate)
  const base = parseDateOnly(now || new Date().toISOString())
  if (!due || !base) return null
  return Math.round((due.getTime() - base.getTime()) / 86400000)
}

function daysSince(value = '', now = null) {
  const start = parseDateOnly(value)
  const base = parseDateOnly(now || new Date().toISOString())
  if (!start || !base) return null
  return Math.max(0, Math.round((base.getTime() - start.getTime()) / 86400000))
}

function normalizeFollowUpPriority(value = '', fallback = 'required') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['urgent', 'critical', 'high'].includes(normalized)) return 'urgent'
  if (['optional', 'low'].includes(normalized)) return 'optional'
  if (['medium', 'normal', 'required', 'important'].includes(normalized)) return 'required'
  return fallback
}

function normalizeDocumentRequestStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['approved', 'completed', 'complete'].includes(normalized)) return 'closed'
  if (['rejected', 'declined'].includes(normalized)) return 'needs_correction'
  if (['uploaded', 'under_review', 'pending_review'].includes(normalized)) return 'review_pending'
  return 'open'
}

function classifyFollowUp({ dueDate = '', priority = 'required', status = 'open', now = null } = {}) {
  if (status === 'closed') return 'closed'
  if (status === 'needs_correction') return 'needs_correction'
  if (status === 'review_pending') return 'review_pending'
  const remaining = daysUntil(dueDate, now)
  if (remaining !== null && remaining < 0) return 'overdue'
  if (remaining === 0) return 'due_today'
  if (remaining !== null && remaining <= 2) return 'due_soon'
  if (priority === 'urgent') return 'urgent'
  return dueDate ? 'open' : 'unscheduled'
}

function followUpStatusLabel(status = 'open') {
  if (status === 'needs_correction') return 'Needs Correction'
  if (status === 'review_pending') return 'Review Pending'
  if (status === 'overdue') return 'Overdue'
  if (status === 'due_today') return 'Due Today'
  if (status === 'due_soon') return 'Due Soon'
  if (status === 'urgent') return 'Urgent'
  if (status === 'unscheduled') return 'No Due Date'
  return 'Open'
}

function buildFollowUpItem({
  id,
  source,
  title,
  description = '',
  laneKey = 'transfer',
  stageKey = '',
  commandType = '',
  audience = 'attorney',
  audienceLabel = '',
  priority = 'required',
  dueDate = '',
  visibility = 'internal',
  status = 'open',
  checklist = [],
  relatedId = '',
  now = null,
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const normalizedPriority = normalizeFollowUpPriority(priority)
  const normalizedStatus = classifyFollowUp({ dueDate, priority: normalizedPriority, status, now })
  if (normalizedStatus === 'closed') return null
  return {
    id,
    source,
    title: compactText(title || 'Workflow follow-up'),
    description: compactText(description),
    laneKey: normalizedLaneKey,
    laneLabel: LANE_LABELS[normalizedLaneKey] || 'Transfer Attorney',
    stageKey: normalizeAttorneyStageKey(stageKey || '', normalizedLaneKey),
    stageLabel: stageKey ? getAttorneyStageLabel(stageKey, normalizedLaneKey) : '',
    commandType,
    audience: compactText(audience || 'attorney'),
    audienceLabel: compactText(audienceLabel || requestedFromLabel(audience || 'attorney')),
    priority: normalizedPriority,
    priorityLabel: PRIORITY_LABELS[normalizedPriority] || 'Required',
    visibility: normalizeCommandVisibility(visibility),
    dueDate: compactText(dueDate || ''),
    dueInDays: daysUntil(dueDate, now),
    status: normalizedStatus,
    statusLabel: followUpStatusLabel(normalizedStatus),
    checklist: Array.isArray(checklist) ? checklist.filter(Boolean).slice(0, 4) : [],
    relatedId: relatedId || '',
  }
}

function sortFollowUps(left, right) {
  const statusOrder = {
    needs_correction: 0,
    overdue: 1,
    due_today: 2,
    due_soon: 3,
    review_pending: 4,
    urgent: 5,
    open: 6,
    unscheduled: 7,
  }
  const statusDelta = (statusOrder[left.status] ?? 99) - (statusOrder[right.status] ?? 99)
  if (statusDelta) return statusDelta
  const leftDue = parseDateOnly(left.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
  const rightDue = parseDateOnly(right.dueDate)?.getTime() ?? Number.MAX_SAFE_INTEGER
  if (leftDue !== rightDue) return leftDue - rightDue
  return (SEVERITY_ORDER[right.priority] || 0) - (SEVERITY_ORDER[left.priority] || 0)
}

function buildFollowUpResolutionIndex(timeline = []) {
  const ids = new Set()
  const relatedKeys = new Set()

  for (const entry of timeline || []) {
    const packet = normalizeAttorneyWorkflowWorkPacket(entry?.metadata?.workPacket)
    if (!packet?.sourceFollowUpId) continue
    ids.add(packet.sourceFollowUpId)
    if (packet.sourceFollowUpRelatedId) {
      relatedKeys.add(`${packet.sourceFollowUpSource || 'workflow'}:${packet.sourceFollowUpRelatedId}`)
    }
  }

  return { ids, relatedKeys }
}

function followUpWasActioned(index, { id = '', source = 'workflow', relatedId = '' } = {}) {
  if (!index) return false
  if (id && index.ids.has(id)) return true
  if (relatedId && index.relatedKeys.has(`${source || 'workflow'}:${relatedId}`)) return true
  return false
}

export function buildAttorneyWorkflowFollowUpSummary({
  laneKey = 'transfer',
  label = '',
  timeline = [],
  documentRequests = [],
  nextActions = [],
  now = null,
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const items = []
  const seen = new Set()
  const actioned = buildFollowUpResolutionIndex(timeline)

  function add(item) {
    if (!item || seen.has(item.id)) return
    if (followUpWasActioned(actioned, item)) return
    seen.add(item.id)
    items.push(item)
  }

  for (const request of documentRequests || []) {
    const status = normalizeDocumentRequestStatus(request.review_status || request.reviewStatus || request.status)
    const priority = status === 'needs_correction' ? 'urgent' : normalizeFollowUpPriority(request.priority)
    const audience = request.requested_from || request.requestedFrom || request.assigned_to_role || request.assignedToRole || 'client'
    add(buildFollowUpItem({
      id: `document_${request.id || request.requirement_id || request.title}`,
      source: 'document_request',
      title: status === 'needs_correction' ? `Correct ${request.title || 'document'}` : request.title || 'Document request',
      description: status === 'needs_correction'
        ? request.rejection_reason || request.rejected_reason || request.description || 'A corrected document is required.'
        : request.description || '',
      laneKey: request.lane_key || request.laneKey || normalizedLaneKey,
      audience,
      audienceLabel: requestedFromLabel(audience),
      priority,
      dueDate: request.due_date || request.dueDate || '',
      visibility: request.visibility_scope || request.visibility || documentVisibilityForAudience(audience),
      status,
      relatedId: request.id || request.requirement_id || '',
      now,
    }))
  }

  for (const entry of timeline || []) {
    const packet = normalizeAttorneyWorkflowWorkPacket(entry?.metadata?.workPacket)
    if (!packet || packet.commandType === 'complete_step') continue
    if (packet.sourceFollowUpId) continue
    add(buildFollowUpItem({
      id: `packet_${entry.id || packet.title}`,
      source: 'work_packet',
      title: packet.title,
      description: entry.message || entry.body || '',
      laneKey: packet.laneKey || normalizedLaneKey,
      stageKey: packet.stageKey,
      commandType: packet.commandType,
      audience: packet.audience,
      audienceLabel: packet.audienceLabel,
      priority: packet.priority,
      dueDate: packet.dueDate,
      visibility: packet.visibility,
      checklist: packet.checklist,
      relatedId: entry.relatedDocumentId || '',
      now,
    }))
  }

  for (const action of nextActions || []) {
    const command = buildAttorneyWorkflowActionCommand(action, { laneKey: normalizedLaneKey, now })
    const packet = command.workPacket
    if (!packet) continue
    add(buildFollowUpItem({
      id: `next_${action.id || command.id}`,
      source: 'next_action',
      title: action.label || packet.title,
      description: action.description || command.description || '',
      laneKey: normalizedLaneKey,
      stageKey: packet.stageKey,
      commandType: command.commandType,
      audience: packet.audience,
      audienceLabel: packet.audienceLabel,
      priority: packet.priority,
      dueDate: packet.dueDate,
      visibility: packet.visibility,
      checklist: packet.checklist,
      relatedId: action.relatedId || '',
      now,
    }))
  }

  const sorted = items.sort(sortFollowUps)
  const counts = sorted.reduce((accumulator, item) => {
    accumulator.total += 1
    if (item.status === 'needs_correction') accumulator.needsCorrection += 1
    if (item.status === 'overdue') accumulator.overdue += 1
    if (item.status === 'due_today') accumulator.dueToday += 1
    if (item.status === 'due_soon') accumulator.dueSoon += 1
    if (item.priority === 'urgent') accumulator.urgent += 1
    if (['buyer', 'seller', 'client'].includes(item.audience)) accumulator.clientFacing += 1
    if (['bank', 'agent', 'attorney'].includes(item.audience)) accumulator.professionalFacing += 1
    return accumulator
  }, {
    total: 0,
    needsCorrection: 0,
    overdue: 0,
    dueToday: 0,
    dueSoon: 0,
    urgent: 0,
    clientFacing: 0,
    professionalFacing: 0,
    actioned: actioned.ids.size,
  })

  const health = counts.needsCorrection || counts.overdue
    ? 'critical'
    : counts.dueToday || counts.dueSoon || counts.urgent
      ? 'attention'
      : counts.total
        ? 'open'
        : 'clear'

  return {
    laneKey: normalizedLaneKey,
    laneLabel: label || LANE_LABELS[normalizedLaneKey] || 'Transfer Attorney',
    health,
    primaryFollowUp: sorted[0] || null,
    counts,
    actionedFollowUpIds: [...actioned.ids],
    items: sorted.slice(0, 10),
  }
}

function severityFromFollowUpPriority(priority = 'required') {
  const normalized = normalizeFollowUpPriority(priority)
  if (normalized === 'urgent') return 'high'
  if (normalized === 'optional') return 'low'
  return 'medium'
}

function actionTypeFromFollowUp(followUp = {}) {
  if (followUp.status === 'needs_correction') return 'request_corrected_document'
  if (followUp.source === 'document_request') return 'request_document'
  if (followUp.commandType === 'request_document') return 'request_document'
  if (followUp.commandType === 'schedule_signing') return 'manage_signing'
  if (followUp.commandType === 'complete_step') return 'complete_stage_evidence'
  if (String(followUp.title || '').toLowerCase().includes('data')) return 'update_matter_data'
  return 'review_workflow'
}

export function buildAttorneyWorkflowFollowUpCommand(followUp = {}, context = {}) {
  const laneKey = normalizeLaneKey(followUp.laneKey || context.laneKey)
  const actionType = actionTypeFromFollowUp(followUp)
  const title = compactText(followUp.title || 'Workflow follow-up')
  const documentTitle = ['request_corrected_document', 'request_document'].includes(actionType)
    ? stripActionPrefix(title) || title
    : title
  const actionLabel =
    actionType === 'request_corrected_document'
      ? `Request corrected ${documentTitle}`
      : actionType === 'request_document'
        ? `Request ${documentTitle}`
        : title
  const action = {
    id: followUp.id || `${laneKey}_follow_up`,
    label: actionLabel,
    description: followUp.description || `${followUp.statusLabel || 'Open'} follow-up.`,
    type: actionType,
    target: followUp.audience || 'attorney',
    priority: severityFromFollowUpPriority(followUp.priority),
    laneKey,
    stageKey: followUp.stageKey || context.stageKey || '',
    relatedId: followUp.relatedId || '',
  }
  const command = buildAttorneyWorkflowActionCommand(action, {
    laneKey,
    stageKey: followUp.stageKey || context.stageKey || '',
    now: context.now || null,
  })
  const packet = normalizeAttorneyWorkflowWorkPacket({
    ...(command.workPacket || {}),
    title: command.commandType === 'request_document' ? documentTitle : title,
    laneKey,
    laneLabel: followUp.laneLabel || command.workPacket?.laneLabel,
    stageKey: followUp.stageKey || command.workPacket?.stageKey,
    stageLabel: followUp.stageLabel || command.workPacket?.stageLabel,
    commandType: command.commandType,
    audience: followUp.audience || command.workPacket?.audience,
    audienceLabel: followUp.audienceLabel || command.workPacket?.audienceLabel,
    priority: followUp.priority || command.workPacket?.priority,
    priorityLabel: followUp.priorityLabel || command.workPacket?.priorityLabel,
    visibility: followUp.visibility || command.workPacket?.visibility,
    dueDate: followUp.dueDate || command.workPacket?.dueDate,
    checklist: followUp.checklist?.length ? followUp.checklist : command.workPacket?.checklist,
    sourceFollowUpId: followUp.id || '',
    sourceFollowUpSource: followUp.source || '',
    sourceFollowUpRelatedId: followUp.relatedId || '',
    sourceFollowUpStatus: followUp.status || '',
  })
  const draft = command.draft && typeof command.draft === 'object'
    ? {
        ...command.draft,
        title: command.commandType === 'request_document' ? documentTitle : command.draft.title,
        requestedFrom: command.commandType === 'request_document' ? followUp.audience || command.draft.requestedFrom : command.draft.requestedFrom,
        priority: command.commandType === 'request_document' ? followUp.priority || command.draft.priority : command.draft.priority,
        visibility: command.commandType === 'request_document' ? followUp.visibility || command.draft.visibility : command.draft.visibility,
        dueDate: command.commandType === 'request_document' ? followUp.dueDate || command.draft.dueDate : command.draft.dueDate,
        workPacket: packet,
      }
    : command.draft

  return {
    ...command,
    id: `${followUp.id || command.id}_follow_up_command`,
    label:
      followUp.status === 'needs_correction'
        ? 'Request Correction'
        : followUp.status === 'review_pending'
          ? 'Review Follow-up'
          : command.label,
    workPacket: packet,
    draft,
    followUpId: followUp.id || '',
  }
}

const COORDINATION_RULES = {
  transfer: [
    {
      id: 'bond_guarantees_issued',
      dependencyLaneKey: 'bond',
      title: 'Bond guarantees issued',
      description: 'Transfer can accept guarantees once the bond attorney has issued them.',
      targetStages: ['guarantees_issued'],
    },
    {
      id: 'bond_lodgement_ready',
      dependencyLaneKey: 'bond',
      title: 'Bond lodgement readiness',
      description: 'Bond pack must be ready before simultaneous lodgement is confirmed.',
      targetStages: ['bond_lodgement_ready'],
    },
    {
      id: 'cancellation_guarantees_accepted',
      dependencyLaneKey: 'cancellation',
      title: 'Cancellation guarantees accepted',
      description: 'Cancellation guarantees must be accepted before transfer proceeds to lodgement.',
      targetStages: ['cancellation_guarantees_accepted'],
    },
    {
      id: 'cancellation_lodgement_ready',
      dependencyLaneKey: 'cancellation',
      title: 'Cancellation lodgement readiness',
      description: 'Cancellation must be ready for simultaneous lodgement with the transfer.',
      targetStages: ['cancellation_lodgement_ready'],
    },
  ],
  bond: [
    {
      id: 'transfer_guarantee_acceptance',
      dependencyLaneKey: 'transfer',
      title: 'Transfer guarantee acceptance',
      description: 'Bond attorney needs the transfer attorney to accept guarantee wording and values.',
      targetStages: ['transfer_guarantees_accepted'],
    },
    {
      id: 'transfer_lodgement_ready',
      dependencyLaneKey: 'transfer',
      title: 'Transfer lodgement readiness',
      description: 'Bond lodgement should align with transfer lodgement readiness.',
      targetStages: ['lodgement_ready'],
    },
  ],
  cancellation: [
    {
      id: 'transfer_cancellation_alignment',
      dependencyLaneKey: 'transfer',
      title: 'Transfer guarantee alignment',
      description: 'Cancellation figures and guarantees must align with the transfer attorney.',
      targetStages: ['transfer_guarantees_accepted'],
    },
    {
      id: 'transfer_lodgement_ready',
      dependencyLaneKey: 'transfer',
      title: 'Transfer lodgement readiness',
      description: 'Cancellation lodgement should align with transfer lodgement readiness.',
      targetStages: ['lodgement_ready'],
    },
  ],
}

function getLaneFromCollection(lanes = [], laneKey = 'transfer') {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  return (lanes || []).find((lane) => normalizeLaneKey(lane?.laneKey || lane?.processType || lane?.attorneyRole) === normalizedLaneKey) || null
}

function laneAssignmentPresent(lane = {}) {
  return Boolean(lane?.assignment || lane?.assignmentId || lane?.assignedFirm || lane?.firmName)
}

function getLaneCurrentStage(lane = {}) {
  return lane?.currentStage || lane?.summary?.currentStage || ''
}

function getLaneStepIndex(steps = [], laneKey = 'transfer', stageKey = '') {
  const normalizedStageKey = normalizeAttorneyStageKey(stageKey || '', laneKey)
  if (!normalizedStageKey) return -1
  return (steps || []).findIndex((step) =>
    normalizeAttorneyStageKey(step?.stepKey || step?.step_key || step?.key || '', laneKey) === normalizedStageKey,
  )
}

function laneStageReached(lane = {}, targetStages = []) {
  if (!lane) return false
  const laneKey = normalizeLaneKey(lane.laneKey || lane.processType || lane.attorneyRole)
  const laneStatus = normalizeStatus(lane.laneStatus || lane.status || lane.summary?.status)
  if (laneStatus === 'completed') return true

  const steps = Array.isArray(lane.steps) ? lane.steps : []
  const currentStage = normalizeAttorneyStageKey(getLaneCurrentStage(lane), laneKey)
  const currentIndex = getLaneStepIndex(steps, laneKey, currentStage)
  const targetKeys = (targetStages || [])
    .map((stageKey) => normalizeAttorneyStageKey(stageKey, laneKey))
    .filter(Boolean)

  return targetKeys.some((targetKey) => {
    const targetIndex = getLaneStepIndex(steps, laneKey, targetKey)
    const targetStep = targetIndex >= 0 ? steps[targetIndex] : null
    const targetStatus = normalizeStatus(targetStep?.status || '')
    if (targetStatus === 'completed' || targetStatus === 'approved') return true
    if (targetIndex >= 0 && currentIndex > targetIndex) return true
    return currentStage === targetKey && laneStatus === 'completed'
  })
}

function buildCoordinationItem(rule = {}, lanes = []) {
  const dependencyLaneKey = normalizeLaneKey(rule.dependencyLaneKey)
  const dependencyLane = getLaneFromCollection(lanes, dependencyLaneKey)
  const targetStage = normalizeAttorneyStageKey(rule.targetStages?.[0] || '', dependencyLaneKey)
  const targetStageLabel = targetStage ? getAttorneyStageLabel(targetStage, dependencyLaneKey) : ''
  if (!dependencyLane) return null

  const ready = laneStageReached(dependencyLane, rule.targetStages)
  const assigned = laneAssignmentPresent(dependencyLane)
  const status = ready ? 'ready' : assigned ? 'waiting' : 'blocked'
  const currentStage = normalizeAttorneyStageKey(getLaneCurrentStage(dependencyLane), dependencyLaneKey)

  return {
    id: `${dependencyLaneKey}_${rule.id}`,
    laneKey: dependencyLaneKey,
    laneLabel: LANE_LABELS[dependencyLaneKey] || 'Attorney',
    title: rule.title,
    description: rule.description,
    status,
    statusLabel: status === 'ready' ? 'Ready' : status === 'blocked' ? 'Assignment Needed' : 'Waiting',
    targetStage,
    targetStageLabel,
    currentStage,
    currentStageLabel: dependencyLane.currentStageLabel || (currentStage ? getAttorneyStageLabel(currentStage, dependencyLaneKey) : 'Not started'),
    assigned,
  }
}

function buildCoordinationActionIndex(timeline = []) {
  const byId = new Map()

  for (const entry of timeline || []) {
    const packet = normalizeAttorneyWorkflowWorkPacket(entry?.metadata?.workPacket)
    if (!packet?.sourceCoordinationId) continue
    const existing = byId.get(packet.sourceCoordinationId) || {
      id: packet.sourceCoordinationId,
      at: '',
      message: '',
      dueDate: '',
      latestAt: '',
      latestMessage: '',
      latestDueDate: '',
      status: packet.sourceCoordinationStatus || '',
      laneKey: packet.sourceCoordinationLaneKey || '',
      targetStage: packet.sourceCoordinationTargetStage || '',
      actionCount: 0,
      escalationCount: 0,
      escalatedAt: '',
      escalationMessage: '',
    }
    const at = compactText(entry.timestamp || entry.createdAt || entry.created_at || '')
    const message = compactText(entry.message || entry.body || '')
    const dueDate = compactText(packet.dueDate || '')
    const isEscalation = packet.commandType === 'escalate_coordination' || packet.sourceCoordinationStatus === 'escalated'

    existing.actionCount += 1
    existing.at = existing.at || at
    existing.message = existing.message || message
    existing.dueDate = existing.dueDate || dueDate
    existing.latestAt = at || existing.latestAt
    existing.latestMessage = message || existing.latestMessage
    existing.latestDueDate = dueDate || existing.latestDueDate
    existing.status = packet.sourceCoordinationStatus || existing.status
    existing.laneKey = packet.sourceCoordinationLaneKey || existing.laneKey
    existing.targetStage = packet.sourceCoordinationTargetStage || existing.targetStage
    if (isEscalation) {
      existing.escalationCount += 1
      existing.escalatedAt = at || existing.escalatedAt
      existing.escalationMessage = message || existing.escalationMessage
    }
    byId.set(packet.sourceCoordinationId, existing)
  }

  return byId
}

function applyCoordinationActionState(item = {}, actioned = null, now = null) {
  const action = actioned?.get(item.id)
  if (!action) return item
  const dueInDays = now && action.dueDate ? daysUntil(action.dueDate, now) : null
  const actionAgeDays = now && action.at ? daysSince(action.at, now) : null
  const escalated = action.escalationCount > 0
  const escalationNeeded = item.status !== 'ready' && !escalated && dueInDays !== null && dueInDays < 0
  const escalationDueToday = item.status !== 'ready' && !escalated && dueInDays === 0
  const escalationStatus = item.status === 'ready'
    ? 'recorded'
    : escalated
      ? 'escalated'
      : escalationNeeded
        ? 'overdue'
        : escalationDueToday
          ? 'due_today'
          : 'requested'
  const actionedLabel = item.status === 'ready'
    ? 'Recorded'
    : escalated
      ? 'Escalated'
      : escalationNeeded
        ? 'Escalation Due'
        : 'Handoff Requested'

  return {
    ...item,
    actioned: true,
    actionedAt: action.at,
    actionedMessage: action.message,
    actionedDueDate: action.dueDate,
    actionedDueInDays: dueInDays,
    actionedAgeDays: actionAgeDays,
    actionedLabel,
    statusLabel: item.status === 'ready' ? item.statusLabel : actionedLabel,
    escalationStatus,
    escalationNeeded,
    escalationDueToday,
    escalated,
    escalationCount: action.escalationCount,
    escalatedAt: action.escalatedAt,
    escalationMessage: action.escalationMessage,
  }
}

function buildCoordinationEscalationCommand(item = {}, context = {}) {
  const laneKey = normalizeLaneKey(context.laneKey)
  const dependencyLaneKey = normalizeLaneKey(item.laneKey || item.dependencyLaneKey)
  const stageKey = normalizeAttorneyStageKey(context.stageKey || '', laneKey)
  const title = compactText(item.title || 'Coordination handoff')
  const dependencyLabel = compactText(item.laneLabel || LANE_LABELS[dependencyLaneKey] || 'Attorney')
  const ageLabel = Number.isFinite(item.actionedAgeDays) ? `${item.actionedAgeDays} day${item.actionedAgeDays === 1 ? '' : 's'} ago` : 'previously'
  const action = {
    id: `${item.id || `${laneKey}_${dependencyLaneKey}_coordination`}_escalation`,
    label: `Escalate ${title}`,
    description: item.description || `Escalate unresolved coordination with ${dependencyLabel}.`,
    type: 'escalate_coordination',
    target: 'attorney',
    priority: 'high',
    laneKey,
    stageKey,
    relatedId: item.id || '',
  }
  const workPacket = normalizeAttorneyWorkflowWorkPacket({
    ...buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject: `Escalate ${title}`,
      commandType: 'escalate_coordination',
      requestedFrom: 'attorney',
      priority: 'urgent',
      visibility: 'professional_shared',
      dueDate: isoDatePlusDays(context.now || null, 1),
      checklist: [
        'Confirm the unresolved dependency and owner.',
        'Ask for the blocker, expected date, and next action.',
        'Record the escalation outcome on the matter timeline.',
      ],
      now: context.now || null,
    }),
    sourceCoordinationId: item.id || '',
    sourceCoordinationLaneKey: dependencyLaneKey,
    sourceCoordinationTargetStage: item.targetStage || '',
    sourceCoordinationStatus: 'escalated',
  })
  const draft = buildNoteDraft({
    laneKey,
    visibility: 'professional_shared',
    message: sentence(
      `Escalation for ${dependencyLabel}: ${title} remains unresolved after the handoff request sent ${ageLabel}.`,
      item.targetStageLabel ? `Needed: ${item.targetStageLabel}.` : '',
      item.currentStageLabel ? `Current: ${item.currentStageLabel}.` : '',
      item.actionedDueDate ? `Requested response date was ${item.actionedDueDate}.` : '',
      'Please confirm owner, blocker, and expected completion date.',
    ),
    workPacket,
  })

  return buildCommand({
    action,
    laneKey,
    stageKey,
    commandType: 'add_note',
    label: 'Escalate Handoff',
    description: 'Prepare a professional escalation note for the unresolved legal dependency.',
    workPacket,
    draft,
  })
}

export function buildAttorneyWorkflowCoordinationSummary({
  laneKey = 'transfer',
  lanes = [],
  timeline = [],
  now = null,
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const rules = COORDINATION_RULES[normalizedLaneKey] || []
  const actioned = buildCoordinationActionIndex(timeline)
  const items = rules
    .map((rule) => buildCoordinationItem(rule, lanes))
    .filter(Boolean)
    .map((item) => applyCoordinationActionState(item, actioned, now))

  const counts = items.reduce((accumulator, item) => {
    accumulator.total += 1
    if (item.status === 'ready') accumulator.ready += 1
    if (item.status === 'waiting') accumulator.waiting += 1
    if (item.status === 'blocked') accumulator.blocked += 1
    if (item.actioned) accumulator.actioned += 1
    if (item.escalationNeeded) accumulator.escalationNeeded += 1
    if (item.escalationDueToday) accumulator.escalationDueToday += 1
    if (item.escalated) accumulator.escalated += 1
    return accumulator
  }, {
    total: 0,
    ready: 0,
    waiting: 0,
    blocked: 0,
    actioned: 0,
    escalationNeeded: 0,
    escalationDueToday: 0,
    escalated: 0,
  })

  const health = counts.escalationNeeded
    ? 'escalation'
    : counts.blocked
    ? 'blocked'
    : counts.waiting
      ? 'waiting'
      : counts.total
        ? 'ready'
        : 'clear'

  return {
    laneKey: normalizedLaneKey,
    health,
    counts,
    actionedCoordinationIds: [...actioned.keys()],
    primaryDependency:
      items.find((item) => item.escalationNeeded) ||
      items.find((item) => item.status === 'blocked' && !item.actioned) ||
      items.find((item) => item.status === 'waiting' && !item.actioned) ||
      items.find((item) => item.status === 'blocked') ||
      items.find((item) => item.status === 'waiting') ||
      items[0] ||
      null,
    items,
  }
}

export function buildAttorneyWorkflowCoordinationCommand(item = {}, context = {}) {
  const laneKey = normalizeLaneKey(context.laneKey)
  const dependencyLaneKey = normalizeLaneKey(item.laneKey || item.dependencyLaneKey)
  const blocked = item.status === 'blocked'
  const stageKey = normalizeAttorneyStageKey(context.stageKey || '', laneKey)
  const title = compactText(item.title || 'Coordination handoff')
  const dependencyLabel = compactText(item.laneLabel || LANE_LABELS[dependencyLaneKey] || 'Attorney')

  if (item.actioned && item.escalationNeeded && item.status !== 'ready') {
    return buildCoordinationEscalationCommand(item, context)
  }

  const action = {
    id: item.id || `${laneKey}_${dependencyLaneKey}_coordination`,
    label: blocked ? `Assign ${dependencyLabel}` : `Request ${title}`,
    description: item.description || `Coordinate with ${dependencyLabel}.`,
    type: blocked ? 'assign_attorney' : 'request_coordination_update',
    target: 'attorney',
    priority: blocked ? 'high' : 'medium',
    laneKey,
    stageKey,
    relatedId: item.id || '',
  }

  if (blocked) {
    const command = buildAttorneyWorkflowActionCommand(action, { laneKey, stageKey, now: context.now || null })
    const packet = normalizeAttorneyWorkflowWorkPacket({
      ...(command.workPacket || {}),
      title: `Assign ${dependencyLabel}`,
      laneKey,
      stageKey,
      commandType: command.commandType,
      audience: 'attorney',
      audienceLabel: dependencyLabel,
      priority: 'urgent',
      visibility: 'internal',
      sourceCoordinationId: item.id || '',
      sourceCoordinationLaneKey: dependencyLaneKey,
      sourceCoordinationTargetStage: item.targetStage || '',
      sourceCoordinationStatus: item.status || '',
    })
    return {
      ...command,
      id: `${item.id || command.id}_coordination_command`,
      label: 'Open Assignment',
      workPacket: packet,
      coordinationId: item.id || '',
      dependencyLaneKey,
    }
  }

  const workPacket = normalizeAttorneyWorkflowWorkPacket({
    ...buildWorkPacket({
      action,
      laneKey,
      stageKey,
      subject: title,
      commandType: 'add_note',
      requestedFrom: 'attorney',
      priority: item.status === 'waiting' ? 'required' : 'optional',
      visibility: 'professional_shared',
      checklist: [
        'Confirm the owner and expected date.',
        'Record what remains outstanding.',
        'Update the dependency once resolved.',
      ],
      now: context.now || null,
    }),
    sourceCoordinationId: item.id || '',
    sourceCoordinationLaneKey: dependencyLaneKey,
    sourceCoordinationTargetStage: item.targetStage || '',
    sourceCoordinationStatus: item.status || '',
  })
  const draft = buildNoteDraft({
    laneKey,
    visibility: 'professional_shared',
    message: sentence(
      `Coordination request for ${dependencyLabel}: ${title}.`,
      item.targetStageLabel ? `Needed: ${item.targetStageLabel}.` : '',
      item.currentStageLabel ? `Current: ${item.currentStageLabel}.` : '',
      item.description,
    ),
    workPacket,
  })

  return buildCommand({
    action,
    laneKey,
    stageKey,
    commandType: 'add_note',
    label: item.status === 'ready' ? 'Add Coordination Note' : 'Request Handoff',
    description: 'Prepare a professional coordination update for the linked legal workflow.',
    workPacket,
    draft,
  })
}

export function buildAttorneyLaneUsabilitySnapshot({
  laneKey = 'transfer',
  label = '',
  assignment = null,
  laneStatus = '',
  currentStage = '',
  summary = {},
  steps = [],
  dataRequirements = [],
  documentRequirements = [],
  signingRequirements = [],
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const currentStep = currentStepForLane({ laneKey: normalizedLaneKey, steps, currentStage, summary })
  const stageKey = normalizeAttorneyStageKey(currentStep?.stepKey || currentStep?.step_key || currentStep?.key || currentStage || summary.currentStage, normalizedLaneKey)
  const stageDefinition = getAttorneyStageDefinition(stageKey, normalizedLaneKey)
  const currentStageLabel = stageKey ? getAttorneyStageLabel(stageKey, normalizedLaneKey) : 'Not started'
  const workflowState = resolveAttorneyWorkflowState({ laneKey: normalizedLaneKey, laneStatus, currentStage: stageKey, summary })
  const currentStepComplete = normalizeStatus(currentStep?.status) === 'completed' || Boolean(summary?.allComplete)

  const missingData = requiredItems(dataRequirements)
    .filter((item) => !itemComplete(item))
    .map((item) => ({ ...item, severity: normalizeSeverity(item.severity || 'medium') }))
  const outstandingDocuments = requiredItems(documentRequirements)
    .filter((item) => !itemComplete(item))
    .map((item) => ({
      ...item,
      severity: normalizeStatus(item.status) === 'rejected' ? 'high' : normalizeSeverity(item.severity || 'medium'),
    }))
  const outstandingSignatures = requiredItems(signingRequirements)
    .filter((item) => !signingComplete(item, normalizedLaneKey, steps, documentRequirements))
    .map((item) => ({ ...item, severity: normalizeSeverity(item.severity || 'high') }))

  const evidenceRequirements = stageKey ? getAttorneyEvidenceRequirementsForStage(stageKey, normalizedLaneKey) : []
  const evidenceChecklist = evidenceRequirements.map((item, index) => ({
    id: `${stageKey || 'not_started'}_evidence_${index + 1}`,
    label: item,
    stageKey,
    stageLabel: currentStageLabel,
    complete: currentStepComplete,
    status: currentStepComplete ? 'complete' : 'required',
  }))

  const readinessChecklist = [
    {
      id: 'assignment',
      label: `${label || currentStageLabel} assignment`,
      complete: Boolean(assignment),
      missingCount: assignment ? 0 : 1,
      severity: assignment ? 'low' : 'critical',
    },
    {
      id: 'data',
      label: 'Matter data',
      complete: missingData.length === 0,
      missingCount: missingData.length,
      severity: missingData.length ? highestSeverity(missingData) : 'low',
    },
    {
      id: 'documents',
      label: 'Documents',
      complete: outstandingDocuments.length === 0,
      missingCount: outstandingDocuments.length,
      severity: outstandingDocuments.length ? highestSeverity(outstandingDocuments) : 'low',
    },
    {
      id: 'signatures',
      label: 'Signatures',
      complete: outstandingSignatures.length === 0,
      missingCount: outstandingSignatures.length,
      severity: outstandingSignatures.length ? highestSeverity(outstandingSignatures) : 'low',
    },
    {
      id: 'evidence',
      label: 'Current stage evidence',
      complete: evidenceChecklist.every((item) => item.complete),
      missingCount: evidenceChecklist.filter((item) => !item.complete).length,
      severity: evidenceChecklist.some((item) => !item.complete) ? 'medium' : 'low',
    },
  ]

  const actions = []
  if (!assignment) {
    actions.push(buildAction({
      id: `${normalizedLaneKey}_assign_attorney`,
      label: `Assign ${label || 'attorney'}`,
      description: 'Lane ownership is required before workflow responsibility is clear.',
      type: 'assign_attorney',
      target: 'management',
      priority: 'critical',
      laneKey: normalizedLaneKey,
    }))
  }
  if (laneStatus === 'blocked' || normalizeStatus(currentStep?.status) === 'blocked') {
    actions.push(buildAction({
      id: `${normalizedLaneKey}_resolve_blocker`,
      label: `Resolve ${currentStageLabel} blocker`,
      description: currentStep?.comment || 'The active workflow step is blocked.',
      type: 'resolve_blocker',
      target: stageDefinition?.ownerRole || 'attorney',
      priority: 'high',
      laneKey: normalizedLaneKey,
      stageKey,
    }))
  }
  for (const item of missingData.slice(0, 3)) {
    actions.push(buildAction({
      id: `${item.id}_capture_data`,
      label: `Capture ${item.label}`,
      description: item.description || 'Required matter data is missing.',
      type: 'update_matter_data',
      target: item.owner || 'attorney',
      priority: item.severity || 'medium',
      laneKey: normalizedLaneKey,
      stageKey: item.stageKey || item.stageKeys?.[0] || stageKey,
      relatedId: item.id,
    }))
  }
  for (const item of outstandingDocuments.slice(0, 3)) {
    const rejected = normalizeStatus(item.status) === 'rejected'
    actions.push(buildAction({
      id: `${item.id}_${rejected ? 'correct' : 'request'}_document`,
      label: rejected ? `Request corrected ${item.label}` : `Request ${item.label}`,
      description: item.reason || item.description || 'Required document is not complete.',
      type: rejected ? 'request_corrected_document' : 'request_document',
      target: item.requiredFrom || item.appliesTo || 'client',
      priority: item.severity || 'medium',
      laneKey: normalizedLaneKey,
      stageKey,
      relatedId: item.id,
    }))
  }
  for (const item of outstandingSignatures.slice(0, 2)) {
    actions.push(buildAction({
      id: `${item.id}_follow_up_signature`,
      label: `Follow up ${item.label}`,
      description: 'Required signing is still outstanding.',
      type: 'manage_signing',
      target: item.signerType || 'client',
      priority: item.severity || 'high',
      laneKey: normalizedLaneKey,
      stageKey,
      relatedId: item.id,
    }))
  }
  if (!actions.length && stageKey && !currentStepComplete) {
    actions.push(buildAction({
      id: `${stageKey}_complete_evidence`,
      label: `Complete ${currentStageLabel}`,
      description: evidenceRequirements[0] || 'Capture the evidence needed for the active workflow stage.',
      type: 'complete_stage_evidence',
      target: stageDefinition?.ownerRole || 'attorney',
      priority: 'medium',
      laneKey: normalizedLaneKey,
      stageKey,
    }))
  }
  if (!actions.length) {
    actions.push(buildAction({
      id: `${normalizedLaneKey}_review_workflow`,
      label: workflowState === 'complete' ? 'Review closed matter' : 'Review workflow',
      description: workflowState === 'complete' ? 'Matter workflow is complete.' : 'No immediate workflow blockers are visible.',
      type: 'review_workflow',
      target: 'attorney',
      priority: 'low',
      laneKey: normalizedLaneKey,
      stageKey,
    }))
  }

  const nextActions = actions.sort(sortActions).slice(0, 6)

  return {
    laneKey: normalizedLaneKey,
    currentStage: stageKey,
    currentStageLabel,
    workflowState,
    workflowStateLabel: getAttorneyWorkflowStatusLabel(workflowState),
    attentionSummary: buildAttentionSummary({ missingData, outstandingDocuments, outstandingSignatures, evidenceChecklist, assignment }),
    primaryNextAction: nextActions[0] || null,
    nextActions,
    readinessChecklist,
    evidenceChecklist,
    missingData,
    outstandingDocuments,
    outstandingSignatures,
  }
}
