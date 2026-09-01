function text(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function timestamp(value = '') {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function resolveDueState(value, nowMs) {
  const dueAt = timestamp(value)
  if (dueAt === null) return 'unscheduled'
  if (dueAt < nowMs) return 'overdue'
  if (dueAt - nowMs <= 24 * 60 * 60 * 1000) return 'due_soon'
  return 'scheduled'
}

function priorityScore(row = {}, nowMs) {
  const healthScore = row?.health?.key === 'critical' ? 0 : 100
  const dueState = resolveDueState(row.expectedDue, nowMs)
  const dueScore = dueState === 'overdue' ? 0 : dueState === 'due_soon' ? 10 : dueState === 'scheduled' ? 20 : 40
  const assignmentScore = row?.assignedAttorney?.id ? 10 : 0
  const clientScore = row?.clientActionRequired ? 5 : 10
  const dueAt = timestamp(row.expectedDue) ?? Number.MAX_SAFE_INTEGER
  return healthScore + dueScore + assignmentScore + clientScore + Math.min(dueAt / 1e13, 9)
}

function presentQueueItem(row = {}, nowMs) {
  const dueState = resolveDueState(row.expectedDue, nowMs)
  const reasons = []
  if (row?.health?.key === 'critical') reasons.push('Critical matter')
  if (dueState === 'overdue') reasons.push('Past due')
  if (!row?.assignedAttorney?.id) reasons.push('Unassigned')
  if (row.clientActionRequired) reasons.push('Client action outstanding')
  if (!reasons.length) reasons.push('Needs attention')

  return {
    id: text(row.matterId || row.assignmentId || row.reference),
    matterId: text(row.matterId),
    reference: text(row.reference || row.matterReference, 'Matter'),
    property: text(row.propertyAddress || row.property, 'Property pending'),
    matterType: text(row.matterType, 'Legal matter'),
    stage: text(row?.stage?.label || row.currentStage, 'In progress'),
    nextAction: text(row.nextAction, 'Review this matter'),
    dueDate: row.expectedDue || null,
    dueState,
    health: row?.health?.key === 'critical' ? 'critical' : 'attention',
    healthLabel: text(row?.health?.label, 'Attention'),
    assignedTo: text(row?.assignedAttorney?.name, 'Unassigned'),
    actionHref: text(row.actionHref),
    reasons,
    score: priorityScore(row, nowMs),
    source: row,
  }
}

export function buildLegalPortfolioPriorityQueueModel({ rows = [], now = new Date(), limit = 3 } = {}) {
  const nowMs = timestamp(now instanceof Date ? now.toISOString() : now) ?? Date.now()
  const eligibleRows = (Array.isArray(rows) ? rows : []).filter((row) => (
    ['critical', 'attention'].includes(row?.health?.key) &&
    !['Registered', 'Completed', 'Archived'].includes(row?.status) &&
    row?.actionHref
  ))
  const ranked = eligibleRows
    .map((row) => presentQueueItem(row, nowMs))
    .sort((left, right) => left.score - right.score || left.reference.localeCompare(right.reference))
  const items = ranked.slice(0, Math.max(1, Number(limit) || 3))

  return {
    available: items.length > 0,
    items,
    totalAttention: eligibleRows.length,
    hiddenCount: Math.max(eligibleRows.length - items.length, 0),
    criticalCount: eligibleRows.filter((row) => row?.health?.key === 'critical').length,
    overdueCount: ranked.filter((item) => item.dueState === 'overdue').length,
    unassignedCount: ranked.filter((item) => item.assignedTo === 'Unassigned').length,
  }
}

