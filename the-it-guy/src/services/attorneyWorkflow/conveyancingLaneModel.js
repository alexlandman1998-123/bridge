import {
  getAttorneyStageDefinitionsForLane,
  normalizeAttorneyStageKey,
} from '../../constants/attorneyWorkflowStages.js'

export const CONVEYANCING_LANE_ORDER = Object.freeze(['transfer', 'bond', 'cancellation'])

const CONVEYANCING_LANE_META = Object.freeze({
  transfer: {
    key: 'transfer',
    detailKey: 'transfer',
    label: 'Transfer',
    roleLabel: 'Transfer Attorney',
    assignmentPendingLabel: 'Transfer attorney assignment',
  },
  bond: {
    key: 'bond',
    detailKey: 'bond-registration',
    label: 'Bond Attorney',
    roleLabel: 'Bond Attorney',
    assignmentPendingLabel: 'Bond attorney assignment',
  },
  cancellation: {
    key: 'cancellation',
    detailKey: 'bond-cancellation',
    label: 'Cancellation Attorney',
    roleLabel: 'Cancellation Attorney',
    assignmentPendingLabel: 'Cancellation attorney assignment',
  },
})

const STATUS_LABELS = Object.freeze({
  not_started: 'Not Started',
  waiting: 'Waiting',
  waiting_on_party: 'Waiting',
  in_progress: 'In Progress',
  delayed: 'Delayed',
  blocked: 'Blocked',
  completed: 'Completed',
  complete: 'Completed',
  registered: 'Registered',
})

const DAY_MS = 86_400_000

function text(value) {
  return String(value || '').trim()
}

function normalized(value) {
  return text(value).toLowerCase()
}

function toTitle(value = '') {
  return text(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function clampPercent(value = 0) {
  const percent = Number(value)
  if (!Number.isFinite(percent)) return 0
  return Math.max(0, Math.min(100, Math.round(percent)))
}

function normalizeLaneKey(value = '') {
  const key = normalized(value).replace(/[_\s]+/g, '-')
  if (!key) return ''
  if (key.includes('bond-cancellation') || key.includes('cancellation')) return 'cancellation'
  if (key.includes('bond-registration') || key === 'bond' || key.includes('bond-attorney')) return 'bond'
  return 'transfer'
}

function normalizeStatus(value = '') {
  const status = normalized(value).replace(/[-\s]+/g, '_')
  if (status === 'complete') return 'completed'
  if (['pending', 'requested', 'under_review', 'waiting_on_party'].includes(status)) return 'waiting'
  if (status === 'at_risk') return 'delayed'
  return STATUS_LABELS[status] ? status : 'not_started'
}

function normalizeVisibility(value = '') {
  const visibility = normalized(value).replace(/[-\s]+/g, '_')
  if (visibility === 'shared') return 'professional_shared'
  if (visibility === 'client_safe' || visibility === 'client') return 'client_visible'
  if (visibility === 'professional' || visibility === 'roleplayers') return 'professional_shared'
  return visibility
}

function isAgentVisibleUpdate(entry = {}) {
  const visibility = normalizeVisibility(entry.visibility || entry.visibilityScope || entry.visibility_scope)
  if (visibility === 'internal') return false

  const type = normalized(entry.type || entry.updateType || entry.update_type || entry.messageType)
  if (type === 'internal_note' || type.includes('internal_note')) return false

  const category = normalized(entry.category)
  const commentType = normalized(entry.commentType || entry.comment_type || entry.categoryLabel)
  if (category === 'internal' || commentType === 'internal') return false

  return true
}

function getStatusLabel(status = '') {
  const key = normalizeStatus(status)
  return STATUS_LABELS[key] || toTitle(key)
}

function getWorkflowLaneKey(workflow = {}) {
  return normalizeLaneKey(
    workflow.accentKey ||
      workflow.lane?.laneKey ||
      workflow.lane?.processType ||
      workflow.detailKey ||
      workflow.key,
  )
}

function getWorkflowStepKey(step = {}, laneKey = 'transfer') {
  return normalizeAttorneyStageKey(step.stepKey || step.step_key || step.key || '', laneKey)
}

function getWorkflowStepLabel(step = {}, laneKey = 'transfer') {
  const stepKey = getWorkflowStepKey(step, laneKey)
  const definition = getAttorneyStageDefinitionsForLane(laneKey).find((item) => item.key === stepKey)
  return step.stepLabel || step.step_label || definition?.label || toTitle(stepKey || step.key || 'Workflow step')
}

function buildLaneStepRows(laneKey = 'transfer', lane = null) {
  const definitions = getAttorneyStageDefinitionsForLane(laneKey)
  const storedSteps = Array.isArray(lane?.steps) ? lane.steps : []
  const storedByKey = new Map()

  storedSteps.forEach((step) => {
    const stepKey = getWorkflowStepKey(step, laneKey)
    if (stepKey) storedByKey.set(stepKey, step)
  })

  const definitionRows = definitions.map((definition, index) => {
    const stored = storedByKey.get(definition.key) || null
    return {
      key: definition.key,
      label: definition.label,
      status: normalizeStatus(stored?.status || (stored ? 'not_started' : 'not_started')),
      index,
      raw: stored || null,
    }
  })

  const definitionKeys = new Set(definitionRows.map((step) => step.key))
  const orphanRows = storedSteps
    .map((step, index) => {
      const stepKey = getWorkflowStepKey(step, laneKey)
      if (!stepKey || definitionKeys.has(stepKey)) return null
      return {
        key: stepKey,
        label: getWorkflowStepLabel(step, laneKey),
        status: normalizeStatus(step.status),
        index: definitionRows.length + index,
        raw: step,
      }
    })
    .filter(Boolean)

  return [...definitionRows, ...orphanRows]
}

function resolveCurrentStep({ laneKey = 'transfer', lane = null, workflow = null, applicable = true } = {}) {
  const meta = CONVEYANCING_LANE_META[laneKey]
  if (!applicable) {
    return { key: 'not_required', label: 'Not required', status: 'not_started', statusLabel: 'Not Required' }
  }

  if (!lane) {
    return {
      key: 'assignment_pending',
      label: meta.assignmentPendingLabel,
      status: 'waiting',
      statusLabel: 'Waiting',
    }
  }

  const rows = buildLaneStepRows(laneKey, lane)
  const explicitCurrentKey = normalizeAttorneyStageKey(lane?.currentStage || lane?.summary?.currentStage || '', laneKey)
  const current =
    rows.find((step) => step.key === explicitCurrentKey) ||
    rows.find((step) => ['blocked', 'waiting', 'in_progress', 'delayed'].includes(step.status)) ||
    rows.find((step) => step.status !== 'completed') ||
    rows.at(-1) ||
    null

  if (current) {
    const step = current || rows[0]
    return {
      key: step?.key || 'workflow_review',
      label: step?.label || workflow?.nextStep || 'Workflow review',
      status: step?.status || normalizeStatus(workflow?.statusKey),
      statusLabel: getStatusLabel(step?.status || workflow?.statusKey),
    }
  }

  return { key: 'workflow_review', label: workflow?.nextStep || 'Workflow review', status: 'waiting', statusLabel: 'Waiting' }
}

function resolveNextStep({ laneKey = 'transfer', lane = null, workflow = null, currentStep = null, applicable = true } = {}) {
  if (!applicable) {
    return { key: 'not_required', label: 'Not required', status: 'not_started', statusLabel: 'Not Required' }
  }

  if (!lane) {
    return {
      key: 'workflow_review',
      label: workflow?.nextStep || 'Workflow review',
      status: normalizeStatus(workflow?.statusKey),
      statusLabel: getStatusLabel(workflow?.statusKey),
    }
  }

  const rows = buildLaneStepRows(laneKey, lane)
  const currentIndex = rows.findIndex((step) => step.key === currentStep?.key)
  const next =
    (currentIndex >= 0 ? rows.slice(currentIndex + 1).find((step) => step.status !== 'completed') : null) ||
    rows.find((step) => step.status !== 'completed' && step.key !== currentStep?.key) ||
    null

  if (next) {
    return {
      key: next.key,
      label: next.label,
      status: next.status,
      statusLabel: getStatusLabel(next.status),
    }
  }

  const fallbackLabel = workflow?.nextStep || lane?.summary?.nextAction || 'Workflow review'
  return {
    key: 'workflow_review',
    label: fallbackLabel,
    status: normalizeStatus(workflow?.statusKey || lane?.summary?.status),
    statusLabel: getStatusLabel(workflow?.statusKey || lane?.summary?.status),
  }
}

function resolveProgress({ workflow = null, lane = null, applicable = true } = {}) {
  if (!applicable) return 0
  const explicit = workflow?.progressPercent ?? lane?.summary?.completionPercent ?? lane?.completionPercent
  if (explicit !== null && explicit !== undefined && explicit !== '') return clampPercent(explicit)

  const storedSteps = Array.isArray(lane?.steps) ? lane.steps : []
  if (!storedSteps.length) return 0
  const completed = storedSteps.filter((step) => normalizeStatus(step.status) === 'completed').length
  return clampPercent((completed / storedSteps.length) * 100)
}

function getEntryTimestamp(entry = {}) {
  const date = new Date(entry.createdAt || entry.created_at || entry.timestamp || entry.changedAt || entry.changed_at || 0)
  const time = date.getTime()
  return Number.isFinite(time) ? time : 0
}

function getNowTimestamp(now = Date.now()) {
  const value = typeof now === 'number' ? now : new Date(now).getTime()
  return Number.isFinite(value) ? value : Date.now()
}

function getUpdateFreshness(createdAt = '', now = Date.now()) {
  const timestamp = new Date(createdAt || 0).getTime()
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return { key: 'empty', label: 'No update yet' }
  }

  const diffDays = Math.max(0, Math.floor((getNowTimestamp(now) - timestamp) / DAY_MS))
  if (diffDays === 0) return { key: 'current', label: 'Updated today' }
  if (diffDays === 1) return { key: 'current', label: 'Updated yesterday' }
  if (diffDays <= 7) return { key: 'current', label: `Updated ${diffDays} days ago` }
  return { key: 'stale', label: 'Needs update' }
}

function entryMatchesLane(entry = {}, laneKey = 'transfer') {
  const filterKeys = Array.isArray(entry.filterKeys) ? entry.filterKeys : []
  const directValues = [
    entry.laneKey,
    entry.lane_key,
    entry.workflowLane,
    entry.workflow_lane,
    entry.attorneyRole,
    entry.attorney_role,
    entry.category,
    ...filterKeys,
  ]
    .map(normalizeLaneKey)
    .filter(Boolean)

  if (directValues.includes(laneKey)) return true

  const haystack = [
    entry.title,
    entry.body,
    entry.message,
    entry.detail,
    entry.roleLabel,
    entry.categoryLabel,
    entry.commentType,
    entry.messageType,
  ]
    .map(normalized)
    .join(' ')

  if (laneKey === 'cancellation') return /bond cancellation|cancellation attorney|cancellation workflow|cancellation/.test(haystack)
  if (laneKey === 'bond') return /bond registration|bond attorney|bond workflow|bond grant|bond instruction/.test(haystack)
  return /transfer|conveyancing|lodgement|registration|deeds office/.test(haystack)
}

function getLaneActivityEntries(activityFeed = [], laneKey = 'transfer', { audience = 'internal' } = {}) {
  return [...(Array.isArray(activityFeed) ? activityFeed : [])]
    .filter((item) => audience === 'agent' ? isAgentVisibleUpdate(item) : true)
    .filter((item) => entryMatchesLane(item, laneKey))
}

function getLatestLaneUpdate(activityFeed = [], laneKey = 'transfer', { audience = 'internal', now = Date.now() } = {}) {
  const entry = getLaneActivityEntries(activityFeed, laneKey, { audience })
    .sort((left, right) => getEntryTimestamp(right) - getEntryTimestamp(left))[0]

  if (!entry) {
    return {
      id: '',
      title: 'No update captured yet',
      body: '',
      createdAt: '',
      authorName: '',
      roleLabel: '',
      visibility: '',
      freshnessKey: 'empty',
      freshnessLabel: 'No update yet',
      empty: true,
    }
  }

  const createdAt = entry.createdAt || entry.created_at || entry.timestamp || entry.changedAt || entry.changed_at || ''
  const freshness = getUpdateFreshness(createdAt, now)

  return {
    id: entry.id || '',
    title: entry.title || 'Latest update',
    body: entry.body || entry.message || entry.detail || '',
    createdAt,
    authorName: entry.authorName || entry.actorName || entry.actor || 'Matter team',
    roleLabel: entry.roleLabel || entry.attorneyRole || entry.attorney_role || '',
    visibility: entry.visibility || '',
    freshnessKey: freshness.key,
    freshnessLabel: freshness.label,
    empty: false,
  }
}

function findWorkflowForLane(workflows = [], laneKey = 'transfer') {
  return (Array.isArray(workflows) ? workflows : []).find((workflow) => getWorkflowLaneKey(workflow) === laneKey) || null
}

function buildConveyancingLane({ laneKey = 'transfer', workflow = null, activityFeed = [], audience = 'internal', now = Date.now() } = {}) {
  const meta = CONVEYANCING_LANE_META[laneKey]
  const applicable = laneKey === 'transfer' ? workflow?.required !== false : Boolean(workflow?.required)
  const lane = workflow?.lane || null
  const currentStep = resolveCurrentStep({ laneKey, lane, workflow, applicable })
  const nextStep = resolveNextStep({ laneKey, lane, workflow, currentStep, applicable })
  const progressPercent = resolveProgress({ workflow, lane, applicable })
  const latestUpdate = getLatestLaneUpdate(activityFeed, laneKey, { audience, now })
  const activityCount = getLaneActivityEntries(activityFeed, laneKey, { audience }).length

  return {
    key: laneKey,
    detailKey: workflow?.detailKey || meta.detailKey,
    label: meta.label,
    roleLabel: meta.roleLabel,
    applicable,
    required: applicable,
    statusKey: applicable ? normalizeStatus(workflow?.statusKey || lane?.laneStatus || lane?.summary?.status) : 'not_started',
    statusLabel: applicable ? workflow?.statusLabel || getStatusLabel(lane?.laneStatus || lane?.summary?.status) : 'Not Required',
    progressPercent,
    currentStep,
    nextStep,
    latestUpdate,
    activityCount,
    assignedDisplay: applicable ? workflow?.assignedDisplay || 'Not assigned' : 'Not required',
    assignedOrganisation: applicable ? workflow?.assignedOrganisation || workflow?.assignedDisplay || 'Not assigned' : 'Not required',
    blockers: applicable && Array.isArray(workflow?.blockers) ? workflow.blockers.filter(Boolean) : [],
    route: workflow?.route || '',
    lane,
    sourceWorkflow: workflow,
  }
}

export function buildConveyancingLaneModel({ workflows = [], activityFeed = [], audience = 'internal', now = Date.now() } = {}) {
  const lanes = CONVEYANCING_LANE_ORDER.map((laneKey) =>
    buildConveyancingLane({
      laneKey,
      workflow: findWorkflowForLane(workflows, laneKey),
      activityFeed,
      audience,
      now,
    }),
  )
  const applicableLanes = lanes.filter((lane) => lane.applicable)
  const blocked = applicableLanes.filter((lane) => lane.statusKey === 'blocked').length
  const waiting = applicableLanes.filter((lane) => lane.statusKey === 'waiting').length
  const averageProgress = applicableLanes.length
    ? clampPercent(applicableLanes.reduce((total, lane) => total + lane.progressPercent, 0) / applicableLanes.length)
    : 0

  return {
    title: 'Conveyancing',
    lanes,
    applicableLanes,
    applicableLaneKeys: applicableLanes.map((lane) => lane.key),
    summary: {
      applicableCount: applicableLanes.length,
      blocked,
      waiting,
      averageProgress,
      statusLabel: blocked ? 'Blocked' : waiting ? 'Waiting' : applicableLanes.length ? 'On Track' : 'Not Required',
    },
  }
}
