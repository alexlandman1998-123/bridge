import {
  getAttorneyJourneyPhaseForStage,
  getAttorneyJourneyPhasesForLane,
  getAttorneyStageDefinitionsForLane,
  normalizeAttorneyStageKey,
} from '../../constants/attorneyWorkflowStages.js'

export const TRANSFER_WORKSPACE_PHASES = Object.freeze(getAttorneyJourneyPhasesForLane('transfer'))

export const TRANSFER_WORKSPACE_PERSISTED_STEP_STATUSES = Object.freeze([
  'not_started',
  'in_progress',
  'waiting',
  'blocked',
  'completed',
])

const DISPLAY_STATUS_META = Object.freeze({
  not_started: 'Not Started',
  in_progress: 'In Progress',
  waiting: 'Waiting',
  blocked: 'Blocked',
  delayed: 'Delayed',
  completed: 'Completed',
})

const UNSUPPORTED_ACTIONS = Object.freeze([
  {
    id: 'mark_delayed',
    label: 'Mark Delayed',
    status: 'delayed',
    disabled: true,
    reason: 'Workflow step persistence does not currently support delayed as a canonical status.',
  },
  {
    id: 'mark_not_applicable',
    label: 'Not Applicable',
    status: 'not_applicable',
    disabled: true,
    reason: 'Workflow step persistence does not currently support not_applicable as a canonical status.',
  },
])

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase()
}

function normalizeDisplayStatus(value, fallback = 'not_started') {
  const normalized = key(value)
  if (normalized === 'complete') return 'completed'
  if (['pending', 'requested', 'under_review', 'waiting_on_party'].includes(normalized)) return 'waiting'
  if (normalized === 'at_risk') return 'delayed'
  return DISPLAY_STATUS_META[normalized] ? normalized : fallback
}

function normalizePersistedStatus(value, fallback = 'not_started') {
  const normalized = normalizeDisplayStatus(value, fallback)
  return TRANSFER_WORKSPACE_PERSISTED_STEP_STATUSES.includes(normalized) ? normalized : fallback
}

function getStoredStepKey(step = {}, workflowKey = 'transfer') {
  return normalizeAttorneyStageKey(step.stepKey || step.step_key || step.key || '', workflowKey)
}

function getCurrentStepKey(lane = {}, workflowKey = 'transfer') {
  const steps = Array.isArray(lane?.steps) ? lane.steps : []
  const explicit = normalizeAttorneyStageKey(lane?.currentStage || lane?.summary?.currentStage || '', workflowKey)
  if (explicit) return explicit

  const current =
    steps.find((step) => ['blocked', 'waiting', 'in_progress'].includes(normalizePersistedStatus(step.status))) ||
    steps.find((step) => normalizePersistedStatus(step.status) !== 'completed') ||
    steps.at(-1)

  return getStoredStepKey(current, workflowKey)
}

function findPhaseForTask(taskKey = '') {
  return getAttorneyJourneyPhaseForStage(taskKey, 'transfer') || TRANSFER_WORKSPACE_PHASES[TRANSFER_WORKSPACE_PHASES.length - 1]
}

function buildTaskSearchText(task = {}) {
  return [
    task.key,
    task.label,
    task.description,
    task.displayStatus,
    task.ownerLabel,
    task.phaseLabel,
    ...(task.requiredDocumentKeys || []),
    ...(task.evidenceRequirements || []),
  ]
    .map(key)
    .filter(Boolean)
    .join(' ')
}

function resolveAssignedToMe({ storedStep = null, definition = {}, lane = null, workflow = null } = {}) {
  const explicit = storedStep?.assignedToMe ?? storedStep?.assigned_to_me ?? definition.assignedToMe ?? definition.assigned_to_me
  if (typeof explicit === 'boolean') return explicit
  const currentUserId = text(workflow?.currentUserId || workflow?.userId || workflow?.facts?.currentUserId || lane?.currentUserId || lane?.userId)
  const ownerId = text(storedStep?.ownerId || storedStep?.owner_id || storedStep?.assignedTo || storedStep?.assigned_to || definition.ownerId)
  if (currentUserId && ownerId) return currentUserId === ownerId
  const currentRole = key(workflow?.currentUserRole || workflow?.role || lane?.currentUserRole || lane?.role)
  const ownerRole = key(definition.ownerRole || storedStep?.ownerRole || storedStep?.owner_type || 'transfer_attorney')
  return Boolean(currentRole && ownerRole && currentRole === ownerRole)
}

function normalizeDocumentKey(value) {
  return key(value).replace(/\s+/g, '_')
}

function documentMatchesRequiredKey(document = {}, requiredKey = '') {
  const expected = normalizeDocumentKey(requiredKey)
  if (!expected) return false
  const values = [
    document.id,
    document.key,
    document.requirementId,
    document.requirement_id,
    document.requiredDocumentKey,
    document.required_document_key,
    document.documentType,
    document.document_type,
    document.category,
    document.categoryLabel,
    document.displayName,
    document.name,
    document.label,
    document.relatedWorkflow,
  ]
  return values.some((value) => {
    const candidate = normalizeDocumentKey(value)
    return Boolean(candidate) && (candidate.includes(expected) || expected.includes(candidate))
  })
}

function getDocumentStatus(document = {}) {
  const normalized = key(document.status || document.reviewStatus || document.review_status || (document.complete ? 'completed' : 'missing'))
  if (['missing', 'requested', 'uploaded', 'under_review', 'pending_review', 'approved', 'accepted', 'verified', 'rejected', 'completed', 'ready'].includes(normalized)) {
    return normalized
  }
  return 'missing'
}

function isDocumentReady(document = {}) {
  const status = getDocumentStatus(document)
  return ['uploaded', 'under_review', 'pending_review', 'approved', 'accepted', 'verified', 'completed', 'ready'].includes(status) || document.complete === true
}

const FICA_RECEIVED_STATUSES = new Set(['uploaded', 'under_review', 'pending_review', 'approved', 'accepted', 'verified', 'completed', 'ready'])
const FICA_ACCEPTED_STATUSES = new Set(['approved', 'accepted', 'verified', 'completed', 'ready'])

function rowMatchesPartyFica(document = {}, party = '') {
  const normalizedParty = key(party)
  if (!normalizedParty) return false
  const category = key(document.canonicalCategory || document.category)
  const owner = key(document.requiredParty || document.ownerLabel || document.uploadedByRole || document.uploaded_by_role)
  if (category && category !== normalizedParty && owner && owner !== normalizedParty) return false
  if (!category && owner !== normalizedParty) return false
  const haystack = [
    document.categoryGroup,
    document.categoryGroupLabel,
    document.displayName,
    document.documentType,
    document.documentTypeLabel,
    document.requiredDocumentKey,
    document.label,
    document.name,
    document.key,
    document.sourceRequirementKey,
  ].map(key).join(' ')
  return (
    document.categoryGroup === 'identity_fica' ||
    haystack.includes('fica') ||
    haystack.includes('identity') ||
    haystack.includes(' id') ||
    haystack.includes('_id') ||
    haystack.includes('proof of address') ||
    haystack.includes('proof_of_address') ||
    haystack.includes('proof of residence') ||
    haystack.includes('proof_of_residence')
  )
}

function dedupeFicaRows(rows = []) {
  const seen = new Set()
  return rows.filter((row) => {
    const keyValue = text(
      row.canonicalRequirementInstanceId ||
        row.requiredDocumentCanonicalId ||
        row.requiredDocumentId ||
        row.requiredDocumentKey ||
        row.id ||
        row.key ||
        row.displayName,
    )
    if (!keyValue || seen.has(keyValue)) return false
    seen.add(keyValue)
    return true
  })
}

function buildFicaTaskDerivedCompletion(taskKey = '', documents = []) {
  const normalizedTaskKey = key(taskKey)
  const party = normalizedTaskKey.startsWith('buyer_fica') ? 'buyer' : normalizedTaskKey.startsWith('seller_fica') ? 'seller' : ''
  if (!party) return null
  const acceptedStage = normalizedTaskKey.includes('approved')
  const matchingRows = dedupeFicaRows((Array.isArray(documents) ? documents : []).filter((document) => rowMatchesPartyFica(document, party)))
  if (!matchingRows.length) return null
  const requirementRows = matchingRows.filter((row) => row.source === 'transaction_required_documents' || row.requirement || row.requiredDocument)
  const basisRows = requirementRows.length ? requirementRows : matchingRows
  const statusSet = acceptedStage ? FICA_ACCEPTED_STATUSES : FICA_RECEIVED_STATUSES
  const completeRows = basisRows.filter((row) => statusSet.has(getDocumentStatus(row)))
  const relatedDocuments = basisRows.map((row) => ({
    ...row,
    status: getDocumentStatus(row),
    ready: statusSet.has(getDocumentStatus(row)),
    sourceRequirementKey: row.requiredDocumentKey || row.key || row.sourceRequirementKey || taskKey,
  }))
  return {
    type: acceptedStage ? 'fica_accepted' : 'fica_received',
    party,
    complete: basisRows.length > 0 && completeRows.length === basisRows.length,
    relatedDocuments,
    completedCount: completeRows.length,
    totalCount: basisRows.length,
  }
}

function isTaskDueWithin(task = {}, days = 7, now = new Date()) {
  if (!task.dueDate || task.displayStatus === 'completed') return false
  const dueTime = new Date(task.dueDate).getTime()
  if (!Number.isFinite(dueTime)) return false
  const start = new Date(now).getTime()
  const end = start + days * 24 * 60 * 60 * 1000
  return dueTime >= start && dueTime <= end
}

function isTaskOverdue(task = {}, now = new Date()) {
  if (!task.dueDate || task.displayStatus === 'completed') return false
  const dueTime = new Date(task.dueDate).getTime()
  return Number.isFinite(dueTime) && dueTime < new Date(now).getTime()
}

function buildWorkflowTasks({ workflowKey = 'transfer', lane = null, facts = {}, workflow = null, documents = [] } = {}) {
  const definitions = getAttorneyStageDefinitionsForLane(workflowKey).filter(
    (definition) => definition.key !== 'guarantees_received' || !facts?.isCashDeal,
  )
  const laneSteps = Array.isArray(lane?.steps) ? lane.steps : []
  const storedStepMap = new Map(
    laneSteps.map((step) => [getStoredStepKey(step, workflowKey), step]),
  )
  const currentKey = getCurrentStepKey(lane || {}, workflowKey)
  let currentIndex = definitions.findIndex((definition) => definition.key === currentKey)

  if (currentIndex < 0) {
    currentIndex = definitions.findIndex((definition) => {
      const storedStep = storedStepMap.get(definition.key)
      return normalizePersistedStatus(storedStep?.status) !== 'completed'
    })
  }
  if (currentIndex < 0 && definitions.length) currentIndex = definitions.length - 1

  return definitions.map((definition, index) => {
    const storedStep = storedStepMap.get(definition.key) || null
    const persistedStatus = normalizePersistedStatus(storedStep?.status)
    let displayStatus = normalizeDisplayStatus(storedStep?.status)

    if (!storedStep) {
      displayStatus = index < currentIndex ? 'completed' : index === currentIndex ? 'in_progress' : 'not_started'
    } else if (index === currentIndex && !['completed', 'blocked', 'waiting', 'delayed'].includes(displayStatus)) {
      displayStatus = 'in_progress'
    }

    const phase = findPhaseForTask(definition.key)

    const derivedCompletion = buildFicaTaskDerivedCompletion(definition.key, documents)
    if (derivedCompletion?.complete && displayStatus !== 'completed') {
      displayStatus = 'completed'
    }

    return {
      id: storedStep?.id || definition.key,
      key: definition.key,
      stepKey: definition.key,
      label: definition.label,
      description: definition.description || '',
      actionLabel: definition.actionLabel || definition.label,
      phaseKey: phase.key,
      phaseLabel: phase.label,
      status: persistedStatus,
      displayStatus,
      derivedCompletion,
      statusLabel: DISPLAY_STATUS_META[displayStatus] || DISPLAY_STATUS_META.not_started,
      isCurrent: index === currentIndex,
      completedAt: storedStep?.completedAt || storedStep?.completed_at || null,
      updatedAt: storedStep?.updatedAt || storedStep?.updated_at || null,
      comment: storedStep?.comment || '',
      dueDate: storedStep?.dueDate || storedStep?.due_date || null,
      ownerRole: definition.ownerRole || storedStep?.ownerRole || storedStep?.owner_type || 'transfer_attorney',
      ownerLabel: definition.ownerLabel || 'Transfer Attorney',
      assignedToMe: resolveAssignedToMe({ storedStep, definition, lane, workflow }),
      readinessGate: definition.readinessGate || null,
      evidenceRequirements: [...(definition.evidenceRequirements || [])],
      requiredData: [...(definition.requiredData || [])],
      requiredDocumentKeys: [...(definition.requiredDocuments || [])],
      defaultVisibility: definition.defaultVisibility || 'professional_shared',
      clientVisibleAllowed: definition.clientVisibleAllowed !== false,
      requiresNote: Boolean(definition.requiresNote),
      sortOrder: storedStep?.sortOrder || storedStep?.sort_order || index + 1,
      storedStep,
      searchText: '',
    }
  }).map((task) => ({ ...task, searchText: buildTaskSearchText(task) }))
}

function buildPhases(tasks = []) {
  return TRANSFER_WORKSPACE_PHASES.map((phase, index) => {
    const phaseTasks = tasks.filter((task) => task.phaseKey === phase.key)
    const completed = phaseTasks.filter((task) => task.displayStatus === 'completed').length
    const blocked = phaseTasks.filter((task) => task.displayStatus === 'blocked').length
    const waiting = phaseTasks.filter((task) => task.displayStatus === 'waiting').length
    const overdue = phaseTasks.filter((task) => task.isOverdue).length
    const missingDocuments = phaseTasks.filter((task) => task.missingDocumentCount > 0).length
    const active = phaseTasks.filter((task) => task.isCurrent || task.displayStatus === 'in_progress').length
    const total = phaseTasks.length
    const currentTask = phaseTasks.find((task) => task.isCurrent) || phaseTasks.find((task) => task.displayStatus !== 'completed') || phaseTasks.at(-1) || null
    const status = !total
      ? 'not_started'
      : completed === total
        ? 'completed'
        : blocked
          ? 'blocked'
          : active
            ? 'in_progress'
            : waiting
              ? 'waiting'
              : 'not_started'

    return {
      ...phase,
      sequence: index + 1,
      tasks: phaseTasks,
      completed,
      blocked,
      waiting,
      overdue,
      missingDocuments,
      warningCount: blocked + overdue + missingDocuments,
      active,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
      status,
      statusLabel: DISPLAY_STATUS_META[status] || DISPLAY_STATUS_META.not_started,
      currentTask,
      hasCurrentTask: phaseTasks.some((task) => task.isCurrent),
    }
  }).filter((phase) => phase.total > 0)
}

function resolveSelectedTask(tasks = [], selectedTaskKey = '') {
  const normalized = normalizeAttorneyStageKey(selectedTaskKey, 'transfer')
  const selected = normalized
    ? tasks.find((task) => task.key === normalized || task.id === selectedTaskKey)
    : null

  return (
    selected ||
    tasks.find((task) => task.displayStatus === 'blocked') ||
    tasks.find((task) => task.displayStatus === 'waiting') ||
    tasks.find((task) => task.displayStatus === 'in_progress') ||
    tasks.find((task) => task.displayStatus !== 'completed') ||
    tasks[0] ||
    null
  )
}

function filterTasks(tasks = [], { search = '', status = '', phaseKey = '', attention = '' } = {}) {
  const query = key(search)
  return tasks.filter((task) => {
    if (query && !task.searchText.includes(query)) return false
    if (status === 'open' && task.displayStatus === 'completed') return false
    else if (status === 'completed' && task.displayStatus !== 'completed') return false
    else if (status === 'blocked' && task.displayStatus !== 'blocked') return false
    else if (status === 'delayed' && task.displayStatus !== 'delayed') return false
    else if (status === 'overdue' && !task.isOverdue) return false
    else if (status === 'due_this_week' && !task.isDueThisWeek) return false
    else if (status === 'assigned_to_me' && !task.assignedToMe) return false
    else if (status === 'missing_documents' && task.missingDocumentCount <= 0) return false
    else if (status && !['open', 'completed', 'blocked', 'delayed', 'overdue', 'due_this_week', 'assigned_to_me', 'missing_documents'].includes(status) && task.displayStatus !== status) return false
    if (phaseKey && task.phaseKey !== phaseKey) return false
    if (attention === 'blocked' && task.displayStatus !== 'blocked') return false
    if (attention === 'overdue' && !task.isOverdue) return false
    if (attention === 'due_this_week' && !task.isDueThisWeek) return false
    if (attention === 'missing_documents' && task.missingDocumentCount <= 0) return false
    return true
  })
}

function buildRelatedDocuments(task = null, lane = null, documents = []) {
  if (!task) return []
  const requirements = Array.isArray(lane?.documentRequirements) ? lane.documentRequirements : []
  const rows = [...requirements, ...(Array.isArray(documents) ? documents : [])]
  const requiredKeys = task.requiredDocumentKeys || []
  const matched = requiredKeys.flatMap((requiredKey) => {
    const matches = rows.filter((row) => documentMatchesRequiredKey(row, requiredKey))
    if (matches.length) {
      return matches.map((row) => ({
        ...row,
        sourceRequirementKey: requiredKey,
        status: row.status || row.reviewStatus || row.review_status || 'missing',
        ready: isDocumentReady(row),
      }))
    }
    return [{
      id: `missing:${requiredKey}`,
      key: requiredKey,
      label: requiredKey.split('_').filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '),
      sourceRequirementKey: requiredKey,
      status: 'missing',
      ready: false,
      missing: true,
    }]
  })

  const seen = new Set()
  return matched.filter((row) => {
    const rowKey = text(row.id || row.requestId || row.key || row.label || row.sourceRequirementKey)
    if (!rowKey || seen.has(rowKey)) return false
    seen.add(rowKey)
    return true
  })
}

function buildCompletionReadiness(task = null) {
  if (!task) {
    return {
      canComplete: false,
      missingRequiredDocuments: [],
      warnings: ['Select a workflow task before updating status.'],
    }
  }

  const missingRequiredDocuments = (task.relatedDocuments || []).filter((document) => document.missing || document.ready === false)
  const warnings = [
    ...missingRequiredDocuments.map((document) => `${document.displayName || document.label || document.name || document.sourceRequirementKey} is not ready.`),
  ]

  return {
    canComplete: missingRequiredDocuments.length === 0,
    missingRequiredDocuments,
    warnings,
  }
}

function buildDependencySummary(tasks = [], task = null) {
  if (!task) {
    return {
      status: 'not_started',
      label: 'No task selected',
      blockers: [],
      advisory: false,
      blocksWork: false,
    }
  }

  const taskIndex = tasks.findIndex((item) => item.key === task.key)
  const earlierTasks = taskIndex > 0 ? tasks.slice(0, taskIndex) : []
  const blockers = earlierTasks.filter((item) => item.displayStatus !== 'completed')
  const advisory = blockers.length > 0
  return {
    status: advisory ? 'waiting' : 'completed',
    label: advisory ? `${blockers.length} earlier task${blockers.length === 1 ? '' : 's'} still open` : 'Dependencies clear',
    blockers: blockers.slice(-3),
    advisory,
    blocksWork: false,
    helper: advisory ? 'You can work ahead, but review these before completion.' : 'No earlier open tasks.',
  }
}

function buildChecklistItems(task = null) {
  if (!task) return []
  const evidenceItems = (task.evidenceRequirements || []).map((label, index) => ({
    id: `evidence:${task.key}:${index}`,
    label,
    type: 'evidence',
    required: true,
    complete: task.displayStatus === 'completed',
    persisted: false,
  }))
  const dataItems = (task.requiredData || []).map((requirement) => ({
    id: `data:${requirement.id || requirement.label}`,
    label: requirement.label || requirement.id,
    description: requirement.description || '',
    type: 'data',
    required: requirement.required !== false,
    complete: task.displayStatus === 'completed',
    persisted: false,
  }))
  const documentItems = (task.relatedDocuments || []).map((document) => ({
    id: `document:${document.id || document.key || document.sourceRequirementKey}`,
    label: document.displayName || document.label || document.name || document.sourceRequirementKey,
    description: document.sourceRequirementKey || '',
    type: 'document',
    required: true,
    complete: document.ready === true,
    persisted: Boolean(document.id && !document.missing),
  }))

  return [...evidenceItems, ...dataItems, ...documentItems]
}

function normalizeVisibilityLabel(value = '') {
  const normalized = key(value)
  if (normalized === 'internal') return 'Internal'
  if (normalized === 'client_visible' || normalized === 'client_safe') return 'Client Visible'
  if (normalized === 'professional_shared' || normalized === 'shared') return 'Professional Shared'
  if (normalized === 'system') return 'System'
  return normalized ? normalized.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ') : 'Shared'
}

function buildTaskNotes(activityFeed = []) {
  return activityFeed.filter((entry) => {
    const category = key(entry?.category)
    const kind = key(entry?.kind)
    const messageType = key(entry?.messageType || entry?.type)
    const title = key(entry?.title)
    return (
      kind === 'comment' ||
      category === 'notes' ||
      category === 'internal' ||
      messageType === 'comment' ||
      title.includes('note')
    )
  }).map((entry) => ({
    ...entry,
    visibilityLabel: normalizeVisibilityLabel(entry.visibility),
    internal: key(entry.visibility) === 'internal' || key(entry.category) === 'internal',
  }))
}

function buildTaskTabs({ checklistItems = [], relatedDocuments = [], notes = [], activityFeed = [], canAddNotes = true } = {}) {
  return [
    { key: 'overview', label: 'Overview', count: null },
    checklistItems.length ? { key: 'checklist', label: 'Checklist', count: checklistItems.length, readOnly: true } : null,
    relatedDocuments.length ? { key: 'documents', label: 'Documents', count: relatedDocuments.length } : null,
    notes.length || canAddNotes ? { key: 'notes', label: 'Notes', count: notes.length } : null,
    activityFeed.length ? { key: 'activity', label: 'Activity', count: activityFeed.length } : null,
  ].filter(Boolean)
}

function normalizeKeyDateRows(keyDates = []) {
  const preferredOrder = [
    'instruction date',
    'agreement date',
    'obligation date',
    'transfer duty due',
    'lodgement date',
    'expected registration',
  ]
  const rows = (Array.isArray(keyDates) ? keyDates : []).map((row) => {
    if (Array.isArray(row)) {
      return {
        key: key(row[0]),
        label: text(row[0]) || 'Date',
        value: normalizeEmptyDateValue(row[1]),
      }
    }
    return {
      key: key(row.key || row.label || row.name),
      label: text(row.label || row.name || row.key) || 'Date',
      value: normalizeEmptyDateValue(row.value || row.date || row.dueDate),
    }
  })

  return rows
    .sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(key(left.label))
      const rightIndex = preferredOrder.indexOf(key(right.label))
      return (leftIndex === -1 ? preferredOrder.length : leftIndex) - (rightIndex === -1 ? preferredOrder.length : rightIndex)
    })
    .slice(0, 6)
}

function normalizeEmptyDateValue(value) {
  const cleaned = text(value)
  if (!cleaned || ['tbd', 'null', 'undefined', 'n/a', '-'].includes(key(cleaned))) return 'Not set'
  return cleaned
}

function normalizePartyRows({ parties = [], workflow = null, selectedTask = null } = {}) {
  const rows = (Array.isArray(parties) ? parties : []).map((item) => ({
    key: key(item.key || item.role || item.label || item.name),
    label: text(item.label || item.role || item.key) || 'Party',
    value: text(item.value || item.name || item.displayName) || 'Not assigned',
    role: key(item.role || item.key || item.label),
  }))

  const hasRole = (role) => rows.some((item) => item.role === role || item.key === role)
  if (!hasRole('buyer')) {
    rows.unshift({ key: 'buyer', label: 'Buyer', value: 'Not assigned', role: 'buyer' })
  }
  if (!hasRole('seller')) {
    rows.splice(1, 0, { key: 'seller', label: 'Seller', value: 'Not assigned', role: 'seller' })
  }

  const assignedLabel = text(workflow?.assignedDisplay || selectedTask?.ownerLabel) || 'Matter team'
  if (!hasRole('assigned_attorney')) {
    rows.push({ key: 'assigned_attorney', label: 'Assigned Attorney', value: assignedLabel, role: 'assigned_attorney' })
  }
  if (!hasRole('matter_team')) {
    rows.push({ key: 'matter_team', label: 'Matter Team', value: assignedLabel, role: 'matter_team' })
  }

  const seen = new Set()
  return rows.filter((item) => {
    if (!item.key || seen.has(item.key)) return false
    seen.add(item.key)
    return true
  }).slice(0, 6)
}

function buildDocumentSummary(relatedDocuments = []) {
  const required = relatedDocuments.length
  const received = relatedDocuments.filter((document) => document.ready === true).length
  const missing = relatedDocuments.filter((document) => document.missing || document.ready === false).length
  return {
    required,
    received,
    missing,
    label: required ? `${received} / ${required} received` : 'No required documents',
  }
}

function buildAvailableActions(task = null, permissions = {}) {
  const canUpdate = Boolean(permissions.canUpdateStage ?? permissions.canUpdateSteps ?? permissions.canUpdate ?? true)
  if (!task || !canUpdate) {
    return {
      primary: [],
      unsupported: UNSUPPORTED_ACTIONS,
      readOnlyReason: permissions.readOnlyReason || 'view_only',
    }
  }

  const primary = [
    task.displayStatus !== 'completed'
      ? {
          id: 'mark_complete',
          label: 'Mark Complete',
          status: 'completed',
          disabled: task.completionReadiness?.canComplete === false,
          reason: task.completionReadiness?.warnings?.[0] || '',
        }
      : null,
    task.displayStatus !== 'in_progress'
      ? { id: 'mark_in_progress', label: 'Mark In Progress', status: 'in_progress', disabled: false }
      : null,
    task.displayStatus !== 'blocked'
      ? { id: 'mark_blocked', label: 'Mark Blocked', status: 'blocked', requiresNote: true, disabled: false }
      : null,
    task.displayStatus !== 'waiting'
      ? { id: 'mark_waiting', label: 'Mark Waiting', status: 'waiting', requiresNote: true, disabled: false }
      : null,
  ].filter(Boolean)

  return {
    primary,
    unsupported: UNSUPPORTED_ACTIONS,
    readOnlyReason: '',
  }
}

export function buildTransferTaskWorkActions(task = null, permissions = {}) {
  if (!task) return []
  const canRequestDocuments = Boolean(permissions.canRequestDocuments ?? permissions.canUpdateStage ?? permissions.canUpdate ?? true)
  const canUploadDocuments = Boolean(permissions.canUploadDocuments ?? permissions.canUpdateStage ?? permissions.canUpdate ?? true)
  const canAddNote = Boolean(
    permissions.canAddInternalNote ??
      permissions.canAddSharedUpdate ??
      permissions.canPublishClientVisibleUpdate ??
      permissions.canAddNotes ??
      permissions.canUpdateStage ??
      true,
  )
  const hasDocumentRequirements = (task.requiredDocumentKeys || []).length > 0 || task.missingDocumentCount > 0
  const phaseKey = key(task.phaseKey)
  const taskKey = key(task.key)
  const actions = []

  if (hasDocumentRequirements) {
    actions.push({
      id: 'request_document',
      label: 'Request Document',
      description: 'Ask the responsible party for evidence linked to this task.',
      target: 'document_request',
      disabled: !canRequestDocuments,
      reason: canRequestDocuments ? '' : 'You do not have permission to request documents on this lane.',
      primary: task.missingDocumentCount > 0,
    })
    actions.push({
      id: 'upload_document',
      label: 'Upload Evidence',
      description: 'Upload a file against this transfer task or requirement.',
      target: 'document_upload',
      disabled: !canUploadDocuments,
      reason: canUploadDocuments ? '' : 'You do not have permission to upload documents on this lane.',
    })
    actions.push({
      id: 'open_documents',
      label: 'Open Documents',
      description: 'Review the full document register for this matter.',
      target: 'documents',
      disabled: false,
      reason: '',
    })
  }

  if (
    phaseKey === 'instruction' ||
    phaseKey === 'fica_authority' ||
    /buyer|seller|entity|authority|title|ownership|existing_bond|matter_opened/.test(taskKey)
  ) {
    actions.push({
      id: 'open_parties',
      label: 'Open Roleplayers',
      description: 'Check parties, representatives, and legal roleplayers for this task.',
      target: 'parties',
      disabled: false,
      reason: '',
    })
  }

  if (
    phaseKey === 'financial_preparation' ||
    /transfer_duty|rates|levy|clearance|compliance|guarantee/.test(taskKey)
  ) {
    actions.push({
      id: 'open_finance',
      label: 'Open Financials',
      description: 'Review transfer duty, clearances, guarantees, and finance dependencies.',
      target: 'finance',
      disabled: false,
      reason: '',
    })
  }

  if (/signing|signed/.test(taskKey)) {
    actions.push({
      id: 'open_documents',
      label: 'Open Signing Docs',
      description: 'Review or upload the signed transfer document pack.',
      target: 'documents',
      disabled: false,
      reason: '',
    })
  }

  actions.push({
    id: 'add_note',
    label: 'Add Note',
    description: 'Record context or a professional update for this task.',
    target: 'notes',
    disabled: !canAddNote,
    reason: canAddNote ? '' : 'You do not have permission to add updates on this lane.',
  })

  const seen = new Set()
  return actions.filter((action) => {
    if (!action.id || seen.has(action.id)) return false
    seen.add(action.id)
    return true
  })
}

export function buildTransferWorkspaceViewModel({
  workflow = null,
  workflowKey = 'transfer',
  documents = [],
  keyDates = [],
  parties = [],
  activityFeed = [],
  selectedTaskKey = '',
  filters = {},
  search = '',
  now = new Date(),
} = {}) {
  const lane = workflow?.lane || null
  const permissions = lane?.permissions || {}
  const tasks = buildWorkflowTasks({ workflowKey, lane, facts: workflow?.facts || {}, workflow, documents }).map((task) => {
    const relatedDocuments = task.derivedCompletion?.relatedDocuments?.length
      ? task.derivedCompletion.relatedDocuments
      : buildRelatedDocuments(task, lane, documents)
    const taskWithDocuments = {
      ...task,
      relatedDocuments,
      missingDocumentCount: relatedDocuments.filter((document) => document.missing || document.ready === false).length,
      isOverdue: isTaskOverdue(task, now),
      isDueThisWeek: isTaskDueWithin(task, 7, now),
    }
    return {
      ...taskWithDocuments,
      completionReadiness: buildCompletionReadiness(taskWithDocuments),
    }
  }).map((task, index, allTasks) => ({
    ...task,
    dependencySummary: buildDependencySummary(allTasks, task),
  }))
  const phases = buildPhases(tasks)
  const selectedTask = resolveSelectedTask(tasks, selectedTaskKey)
  const visibleTasks = filterTasks(tasks, { ...filters, search })
  const completed = tasks.filter((task) => task.displayStatus === 'completed').length
  const total = tasks.length
  const currentPhase = phases.find((phase) => phase.tasks.some((task) => task.key === selectedTask?.key)) || phases.find((phase) => phase.status === 'in_progress') || phases[0] || null
  const selectedRelatedDocuments = selectedTask ? selectedTask.relatedDocuments : []
  const selectedChecklistItems = buildChecklistItems(selectedTask)
  const selectedActivityFeed = Array.isArray(activityFeed)
    ? activityFeed.filter((entry) => {
        const haystack = key([
          entry?.stepKey,
          entry?.step_key,
          entry?.title,
          entry?.body,
          entry?.message,
          ...(entry?.filterKeys || []),
        ].join(' '))
        return !selectedTask || haystack.includes(selectedTask.key) || haystack.includes(lane?.laneKey || workflowKey)
      })
    : []
  const selectedNotes = buildTaskNotes(selectedActivityFeed)
  const selectedKeyDates = normalizeKeyDateRows(keyDates)
  const selectedParties = normalizePartyRows({ parties, workflow, selectedTask })
  const selectedDocumentSummary = buildDocumentSummary(selectedRelatedDocuments)
  const workActionsByTaskKey = Object.fromEntries(
    tasks.map((task) => [task.key, buildTransferTaskWorkActions(task, permissions)]),
  )
  const selectedWorkActions = selectedTask ? workActionsByTaskKey[selectedTask.key] || [] : []
  const selectedTabs = buildTaskTabs({
    checklistItems: selectedChecklistItems,
    relatedDocuments: selectedRelatedDocuments,
    notes: selectedNotes,
    activityFeed: selectedActivityFeed,
    canAddNotes: Boolean(permissions.canAddNotes ?? permissions.canUpdateStage ?? true),
  })
  const selectedTaskIndex = tasks.findIndex((task) => task.key === selectedTask?.key)
  const nextActionableTask = selectedTaskIndex >= 0
    ? tasks.slice(selectedTaskIndex + 1).find((task) => task.displayStatus !== 'completed') || null
    : null

  return {
    workflowKey,
    laneKey: lane?.laneKey || workflowKey,
    title: workflow?.title || 'Transfer Progress',
    statusLabel: workflow?.statusLabel || '',
    tasks,
    visibleTasks,
    phases,
    selectedTask,
    nextActionableTask,
    currentPhase,
    progress: {
      completed,
      total,
      percent: total ? Math.round((completed / total) * 100) : 0,
      label: `${completed} / ${total} tasks completed`,
    },
    attention: {
      blocked: tasks.filter((task) => task.displayStatus === 'blocked').length,
      overdue: tasks.filter((task) => task.isOverdue).length,
      dueThisWeek: tasks.filter((task) => task.isDueThisWeek).length,
      missingDocuments: tasks.filter((task) => task.missingDocumentCount > 0).length,
    },
    selectedTaskContext: {
      relatedDocuments: selectedRelatedDocuments,
      documentSummary: selectedDocumentSummary,
      checklistItems: selectedChecklistItems,
      keyDates: selectedKeyDates,
      parties: selectedParties,
      notes: selectedNotes,
      activityFeed: selectedActivityFeed,
      tabs: selectedTabs,
      workActions: selectedWorkActions,
    },
    permissions,
    availableActions: buildAvailableActions(selectedTask, permissions),
    workActionsByTaskKey,
    unsupportedCapabilities: {
      delayedStatus: true,
      notApplicableStatus: true,
      editableTaskAssignee: true,
      editableTaskDueDate: true,
      persistedChecklistItems: true,
      hardTaskDocumentLinks: true,
    },
  }
}
