import { buildLegalWorkflowOperationalHealthModel } from './legalWorkflowOperationalHealthModel.js'

const WORK_ACTION_PRIORITY = Object.freeze([
  'request_document',
  'upload_document',
  'review_document',
  'schedule_signing',
  'open_documents',
  'open_parties',
  'open_finance',
  'add_note',
])

function text(value = '') {
  return String(value || '').trim()
}

function normalizeAction(action = {}, source = 'work') {
  return {
    ...action,
    source,
    id: text(action.id),
    label: text(action.label || action.actionLabel || action.id),
    description: text(action.description || action.reason),
    disabled: Boolean(action.disabled),
  }
}

function choosePrimaryAction({ task = {}, workActions = [], statusActions = [] } = {}) {
  const normalizedWorkActions = workActions.map((action) => normalizeAction(action, 'work'))
  const normalizedStatusActions = statusActions.map((action) => normalizeAction(action, 'status'))
  const missingDocuments = Number(task.missingDocumentCount || 0) > 0
  const preferredId = text(task.operationalContract?.primaryAction?.id)

  if (missingDocuments) {
    const requestAction = normalizedWorkActions.find((action) => action.id === 'request_document' && !action.disabled)
    if (requestAction) return requestAction
  }

  const preferredActionMap = {
    capture_data: ['capture_data', 'open_parties', 'open_finance'],
    upload_document: ['upload_document', 'open_documents'],
    review_document: ['open_documents', 'upload_document'],
    request_external_action: ['request_document', 'open_finance', 'add_note'],
    schedule_action: ['schedule_signing'],
    mark_complete: ['mark_complete'],
  }
  const preferredIds = preferredActionMap[preferredId] || [preferredId]
  for (const id of preferredIds) {
    const workAction = normalizedWorkActions.find((action) => action.id === id && !action.disabled)
    if (workAction) return workAction
    const statusAction = normalizedStatusActions.find((action) => action.id === id && !action.disabled)
    if (statusAction) return statusAction
  }

  if (task.completionReadiness?.canComplete) {
    const completeAction = normalizedStatusActions.find((action) => action.id === 'mark_complete' && !action.disabled)
    if (completeAction) return completeAction
  }

  for (const id of WORK_ACTION_PRIORITY) {
    const action = normalizedWorkActions.find((item) => item.id === id && !item.disabled)
    if (action) return action
  }
  return normalizedStatusActions.find((action) => !action.disabled) || normalizedWorkActions[0] || normalizedStatusActions[0] || null
}

function buildAttentionItems(task = {}) {
  const rows = []
  const dependency = task.dependencySummary || {}
  if (dependency.advisory) {
    rows.push({
      id: 'dependencies',
      label: dependency.label || 'Earlier work is still open',
      description: dependency.helper || 'Review earlier work before completing this task.',
      tone: 'warning',
    })
  }
  for (const warning of task.completionReadiness?.warnings || []) {
    rows.push({
      id: `warning:${warning}`,
      label: text(warning),
      description: 'Resolve this item before completing the task.',
      tone: 'warning',
    })
  }
  if (task.displayStatus === 'blocked' && !rows.length) {
    rows.push({
      id: 'blocked',
      label: 'This task is blocked',
      description: task.comment || 'Record the blocker and the next follow-up.',
      tone: 'critical',
    })
  }
  return rows.slice(0, 5)
}

function sortRequirements(items = []) {
  return [...items].sort((left, right) => {
    if (left.complete !== right.complete) return left.complete ? 1 : -1
    if (left.required !== right.required) return left.required ? -1 : 1
    return text(left.label).localeCompare(text(right.label))
  })
}

function resolveRequirementAction(requirement = {}, actions = []) {
  const haystack = `${requirement.id || ''} ${requirement.label || ''} ${requirement.description || ''} ${(requirement.fields || []).join(' ')}`.toLowerCase()
  const available = actions.filter((action) => !action.disabled)
  const pick = (...ids) => available.find((action) => ids.includes(action.id)) || actions.find((action) => ids.includes(action.id)) || null
  const present = (action) => {
    if (!action) return null
    const labels = {
      capture_data: 'Capture details',
      upload_document: 'Upload document',
      request_document: 'Request document',
      open_documents: 'Review documents',
      open_finance: 'Open finance details',
      open_parties: 'Open party details',
      open_matter: 'Open matter details',
      add_note: 'Add a note',
    }
    return {
      ...action,
      requirementId: requirement.id || '',
      requirementLabel: text(requirement.label || 'this requirement'),
      requirement,
      label: labels[action.id] || action.label,
      description: action.description || `Resolve ${text(requirement.label || 'this requirement')} before completing the task.`,
    }
  }
  if (requirement.type === 'document') return present(pick('upload_document', 'request_document', 'open_documents'))
  if (requirement.type === 'data') return present(pick('capture_data', 'open_parties', 'open_finance', 'open_matter'))
  if (/finance|bond|loan|bank|guarantee/.test(haystack)) return present(pick('capture_data', 'open_finance'))
  if (/buyer|seller|party|authority|contact|transaction type/.test(haystack)) return present(pick('capture_data', 'open_parties', 'open_matter'))
  return present(pick('capture_data', 'open_matter', 'add_note'))
}

export function buildLegalTaskWorkbenchModel({
  task = null,
  taskContext = {},
  workActions = [],
  statusActions = [],
  workflowLabel = '',
  workflowTasks = [],
  canUpdateTask = true,
  forceEditable = false,
} = {}) {
  if (!task) {
    return {
      empty: true,
      primaryAction: null,
      secondaryActions: [],
      outstandingRequirements: [],
      completedRequirements: [],
      attentionItems: [],
    }
  }

  const normalizedWorkActions = workActions.map((action) => normalizeAction(action, 'work'))
  const normalizedStatusActions = statusActions.map((action) => normalizeAction({ ...action, disabled: action.disabled || !canUpdateTask }, 'status'))
  // An attorney's Work tab must remain operable while the action projection is
  // refreshing. The mutation still goes through the canonical workflow update.
  const fallbackStatusActions = forceEditable && canUpdateTask && !normalizedStatusActions.length
    ? [
        !['completed', 'completed_externally', 'not_applicable'].includes(task.displayStatus) ? { id: 'mark_complete', label: 'Complete task', status: 'completed', disabled: false } : null,
        task.displayStatus !== 'in_progress' ? { id: 'mark_in_progress', label: 'Mark in progress', status: 'in_progress', disabled: false } : null,
        task.displayStatus !== 'blocked' ? { id: 'mark_blocked', label: 'Mark blocked', status: 'blocked', disabled: false, requiresNote: true } : null,
        task.displayStatus !== 'waiting' ? { id: 'mark_waiting', label: 'Mark waiting', status: 'waiting', disabled: false, requiresNote: true } : null,
        ...(['completed', 'completed_externally', 'not_applicable'].includes(task.displayStatus)
          ? [{ id: 'reopen_task', label: 'Reopen task', status: 'not_started', requiresNote: true }]
          : [
              { id: 'complete_externally', label: 'Completed externally', status: 'completed_externally', requiresReason: true },
              { id: 'mark_not_applicable', label: 'Not applicable', status: 'not_applicable', requiresReason: true },
            ]),
      ].filter(Boolean).map((action) => normalizeAction(action, 'status'))
    : []
  const effectiveStatusActions = normalizedStatusActions.length ? normalizedStatusActions : fallbackStatusActions
  const primaryAction = choosePrimaryAction({ task, workActions, statusActions: effectiveStatusActions })
  const secondaryActions = [...normalizedWorkActions, ...effectiveStatusActions]
    .filter((action) => action.id && action.id !== primaryAction?.id)
    .filter((action) => !['mark_complete'].includes(action.id))
    .slice(0, 2)
  const checklistItems = taskContext.checklistItems || []
  const confirmationRequirements = checklistItems.filter((item) => item.type === 'evidence')
  const requirements = sortRequirements(checklistItems.filter((item) => item.type !== 'evidence'))
  const outstandingRequirements = requirements.filter((item) => !item.complete)
  const completedRequirements = requirements.filter((item) => item.complete)
  const attentionItems = buildAttentionItems(task)
  const requirementsSatisfied = Boolean(task.completionReadiness?.canComplete)
  const completionAction = effectiveStatusActions.find((action) => action.id === 'mark_complete') || null
  // Requirements inform the attorney's judgement; they must not trap an authorised
  // attorney in a workflow stage. An incomplete checklist therefore records an
  // explicit completion note instead of disabling the lifecycle transition.
  const completeAction = completionAction
    ? {
        ...completionAction,
        requiresNote: Boolean(completionAction.requiresNote || !requirementsSatisfied),
        completionOverrideRequired: !requirementsSatisfied,
      }
    : null
  const canComplete = Boolean(completeAction && !completeAction.disabled)
  const startAction = effectiveStatusActions.find(action => action.id === 'mark_in_progress') || null
  const canMarkInProgress = ['not_started', 'blocked', 'waiting'].includes(task.displayStatus) && Boolean(startAction && !startAction.disabled)
  const visibilityPolicy = task.operationalContract?.visibilityPolicy || {}
  const clientAudience = visibilityPolicy.clientAudience || []
  const clientUpdateAvailable = visibilityPolicy.clientVisibleAllowed !== false && clientAudience.length > 0
  const operationalHealth = buildLegalWorkflowOperationalHealthModel({ tasks: workflowTasks })
  const showOwner = Boolean(task.ownerLabel) && ['blocked', 'waiting', 'delayed'].includes(task.displayStatus)
  const requirementActions = Object.fromEntries(
    outstandingRequirements.map((requirement) => [requirement.id, resolveRequirementAction(requirement, normalizedWorkActions)]).filter(([, action]) => action),
  )
  const uploadAction = normalizedWorkActions.find((action) => action.id === 'upload_document') || null

  return {
    empty: false,
    contractVersion: task.operationalContract?.version || '',
    taskKey: task.key || '',
    lane: task.operationalContract?.lane || task.operationalContract?.laneKey || '',
    workflowLabel: text(workflowLabel || task.operationalContract?.laneLabel || 'Legal workflow'),
    taskType: task.operationalContract?.taskType || 'confirm_milestone',
    taskLabel: task.label,
    taskDescription: task.description,
    note: text(task.comment),
    applicabilitySuggestion: task.applicabilitySuggestion || '',
    outcomeReason: ['completed_externally', 'not_applicable'].includes(task.status) ? text(task.comment) : '',
    status: task.displayStatus,
    statusLabel: task.statusLabel,
    phaseLabel: task.phaseLabel,
    ownerLabel: task.ownerLabel,
    showOwner,
    dueDate: task.dueDate,
    primaryAction,
    secondaryActions,
    contextualActions: normalizedWorkActions.filter(action => ['open_parties', 'open_finance', 'schedule_signing'].includes(action.id)),
    completeAction,
    statusActions: effectiveStatusActions.map(action => action.id === 'mark_complete' ? completeAction : action),
    outcomeActions: effectiveStatusActions.filter(action => ['complete_externally', 'mark_not_applicable', 'reopen_task'].includes(action.id)),
    followUpActions: ['completed', 'completed_externally', 'not_applicable'].includes(task.displayStatus) ? [] : effectiveStatusActions.filter(action => ['mark_blocked', 'mark_waiting'].includes(action.id)),
    readOnly: !forceEditable && !normalizedStatusActions.some(action => !action.disabled),
    taskResolved: ['completed', 'completed_externally', 'not_applicable'].includes(task.displayStatus),
    canMarkInProgress,
    markInProgressLabel: task.displayStatus === 'not_started' ? 'Start task' : 'Resume task',
    canComplete,
    requirementsSatisfied,
    completionMessage: requirementsSatisfied
      ? 'Confirm this work was done. Checklist completion is not a legal-compliance or lodgement certification.'
      : 'These requirements are guidance. You may work ahead. Confirm completed work, record work completed externally, or explain why a task is not applicable. Missing evidence stays visible.',
    outstandingRequirements,
    requirementActions,
    uploadAction,
    completedRequirements,
    confirmationRequirements,
    attentionItems,
    documents: taskContext.relatedDocuments || [],
    notes: taskContext.notes || [],
    activity: taskContext.activityFeed || [],
    audience: task.operationalContract?.visibilityPolicy?.clientAudience || [],
    clientUpdate: {
      available: clientUpdateAvailable,
      audience: clientAudience,
      audienceLabel: clientAudience.map((audience) => audience === 'buyer' ? 'Buyer' : audience === 'seller' ? 'Seller' : audience).join(' and '),
    },
    operationalHealth,
  }
}
