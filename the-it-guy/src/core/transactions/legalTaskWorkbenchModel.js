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

export function buildLegalTaskWorkbenchModel({
  task = null,
  taskContext = {},
  workActions = [],
  statusActions = [],
  workflowLabel = '',
  workflowTasks = [],
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

  const primaryAction = choosePrimaryAction({ task, workActions, statusActions })
  const normalizedWorkActions = workActions.map((action) => normalizeAction(action, 'work'))
  const normalizedStatusActions = statusActions.map((action) => normalizeAction(action, 'status'))
  const secondaryActions = [...normalizedWorkActions, ...normalizedStatusActions]
    .filter((action) => action.id && action.id !== primaryAction?.id)
    .filter((action) => !['mark_complete'].includes(action.id))
    .slice(0, 2)
  const checklistItems = taskContext.checklistItems || []
  const confirmationRequirements = checklistItems.filter((item) => item.type === 'evidence')
  const requirements = sortRequirements(checklistItems.filter((item) => item.type !== 'evidence'))
  const outstandingRequirements = requirements.filter((item) => !item.complete)
  const completedRequirements = requirements.filter((item) => item.complete)
  const attentionItems = buildAttentionItems(task)
  const canComplete = Boolean(task.completionReadiness?.canComplete)
  const completeAction = normalizedStatusActions.find((action) => action.id === 'mark_complete') || null
  const visibilityPolicy = task.operationalContract?.visibilityPolicy || {}
  const clientAudience = visibilityPolicy.clientAudience || []
  const clientUpdateVisible = visibilityPolicy.clientVisibleAllowed !== false && visibilityPolicy.defaultVisibility === 'client_visible' && clientAudience.length > 0
  const operationalHealth = buildLegalWorkflowOperationalHealthModel({ tasks: workflowTasks })
  const showOwner = Boolean(task.ownerLabel) && ['blocked', 'waiting', 'delayed'].includes(task.displayStatus)

  return {
    empty: false,
    contractVersion: task.operationalContract?.version || '',
    taskKey: task.key || '',
    lane: task.operationalContract?.lane || task.operationalContract?.laneKey || '',
    workflowLabel: text(workflowLabel || task.operationalContract?.laneLabel || 'Legal workflow'),
    taskType: task.operationalContract?.taskType || 'confirm_milestone',
    taskLabel: task.label,
    taskDescription: task.description,
    status: task.displayStatus,
    statusLabel: task.statusLabel,
    phaseLabel: task.phaseLabel,
    ownerLabel: task.ownerLabel,
    showOwner,
    dueDate: task.dueDate,
    primaryAction,
    secondaryActions,
    completeAction,
    canComplete,
    completionMessage: canComplete
      ? 'Required evidence is present. This task can be completed.'
      : task.completionReadiness?.warnings?.[0] || 'Complete the outstanding requirements before closing this task.',
    outstandingRequirements,
    completedRequirements,
    confirmationRequirements,
    attentionItems,
    documents: taskContext.relatedDocuments || [],
    notes: taskContext.notes || [],
    activity: taskContext.activityFeed || [],
    audience: task.operationalContract?.visibilityPolicy?.clientAudience || [],
    clientUpdate: {
      visible: clientUpdateVisible,
      audience: clientAudience,
      label: clientUpdateVisible
        ? `Visible in ${clientAudience.map((audience) => audience === 'buyer' ? 'Buyer' : audience === 'seller' ? 'Seller' : audience).join(' and ')} transaction progress`
        : 'Attorney workspace only',
    },
    operationalHealth,
  }
}
