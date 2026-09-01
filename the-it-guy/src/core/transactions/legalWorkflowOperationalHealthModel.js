const ACTIVE_STATUSES = new Set(['in_progress', 'waiting', 'blocked', 'delayed'])

function text(value = '') {
  return String(value || '').trim()
}

function timestamp(value = '') {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function daysBetween(earlier, later) {
  return Math.floor((later - earlier) / (24 * 60 * 60 * 1000))
}

function severityRank(value = '') {
  if (value === 'critical') return 3
  if (value === 'attention') return 2
  return 1
}

function buildTaskException(task = {}, nowMs, staleAfterDays) {
  if (!task?.key || task.displayStatus === 'completed') return null
  const reasons = []
  const dueAt = timestamp(task.dueDate)
  const updatedAt = timestamp(task.updatedAt)
  const missingDocuments = Number(task.missingDocumentCount || 0)

  if (task.displayStatus === 'blocked') {
    reasons.push({ code: 'blocked', label: 'Blocked', severity: 'critical' })
  }
  if (dueAt !== null && dueAt < nowMs) {
    reasons.push({ code: 'overdue', label: 'Past due', severity: 'critical' })
  }
  if (ACTIVE_STATUSES.has(task.displayStatus) && updatedAt !== null && daysBetween(updatedAt, nowMs) >= staleAfterDays) {
    reasons.push({ code: 'stale', label: `No update for ${daysBetween(updatedAt, nowMs)} days`, severity: 'attention' })
  }
  if (task.displayStatus === 'waiting' && dueAt === null) {
    reasons.push({ code: 'follow_up_missing', label: 'Follow-up date needed', severity: 'attention' })
  }
  if (missingDocuments > 0) {
    reasons.push({ code: 'missing_documents', label: `${missingDocuments} document${missingDocuments === 1 ? '' : 's'} outstanding`, severity: 'attention' })
  }
  if (!reasons.length) return null

  const severity = reasons.reduce(
    (highest, reason) => severityRank(reason.severity) > severityRank(highest) ? reason.severity : highest,
    'notice',
  )
  return {
    id: `workflow_exception:${task.key}`,
    taskKey: task.key,
    taskLabel: text(task.label, 'Legal task'),
    phaseKey: text(task.phaseKey),
    phaseLabel: text(task.phaseLabel, 'Legal workflow'),
    severity,
    reasons,
    dueDate: task.dueDate || null,
    updatedAt: task.updatedAt || null,
  }
}

export function buildLegalWorkflowOperationalHealthModel({ tasks = [], now = new Date(), staleAfterDays = 7 } = {}) {
  const nowMs = timestamp(now instanceof Date ? now.toISOString() : now) ?? Date.now()
  const exceptions = (Array.isArray(tasks) ? tasks : [])
    .map((task) => buildTaskException(task, nowMs, staleAfterDays))
    .filter(Boolean)
    .sort((left, right) => {
      const severityDifference = severityRank(right.severity) - severityRank(left.severity)
      if (severityDifference) return severityDifference
      const leftDue = timestamp(left.dueDate) ?? Number.MAX_SAFE_INTEGER
      const rightDue = timestamp(right.dueDate) ?? Number.MAX_SAFE_INTEGER
      if (leftDue !== rightDue) return leftDue - rightDue
      return left.taskLabel.localeCompare(right.taskLabel)
    })

  const counts = {
    total: exceptions.length,
    critical: exceptions.filter((item) => item.severity === 'critical').length,
    attention: exceptions.filter((item) => item.severity === 'attention').length,
    blocked: exceptions.filter((item) => item.reasons.some((reason) => reason.code === 'blocked')).length,
    overdue: exceptions.filter((item) => item.reasons.some((reason) => reason.code === 'overdue')).length,
    stale: exceptions.filter((item) => item.reasons.some((reason) => reason.code === 'stale')).length,
    missingDocuments: exceptions.filter((item) => item.reasons.some((reason) => reason.code === 'missing_documents')).length,
    followUpMissing: exceptions.filter((item) => item.reasons.some((reason) => reason.code === 'follow_up_missing')).length,
  }
  const completed = (Array.isArray(tasks) ? tasks : []).filter((task) => task.displayStatus === 'completed').length
  const totalTasks = Array.isArray(tasks) ? tasks.length : 0
  const status = counts.critical ? 'critical' : counts.attention ? 'attention' : 'clear'

  return {
    status,
    label: status === 'critical' ? 'Intervention needed' : status === 'attention' ? 'Review needed' : 'Workflow healthy',
    summary: status === 'clear'
      ? 'No blocked, overdue, stale, or unfollowed legal tasks.'
      : `${counts.total} legal task${counts.total === 1 ? '' : 's'} need review.`,
    counts,
    exceptions: exceptions.slice(0, 8),
    primaryException: exceptions[0] || null,
    completedTasks: completed,
    totalTasks,
    progressPercent: totalTasks ? Math.round((completed / totalTasks) * 100) : 0,
    staleAfterDays,
  }
}

