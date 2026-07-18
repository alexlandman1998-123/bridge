const BLOCKING_STATES = new Set(['critical', 'unassigned'])
const WARNING_STATES = new Set(['breached', 'due_soon'])

function text(value = '') {
  return String(value || '').trim()
}

function date(value) {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function resolveRow(row = {}, now = new Date()) {
  const document = row.linkedDocument || row.document || row
  const status = text(document.status || row.status).toLowerCase()
  const uploadedAt = date(document.uploaded_at || document.uploadedAt || row.uploaded_at || row.uploadedAt)
  const dueAt = date(document.review_due_at || document.reviewDueAt || row.review_due_at || row.reviewDueAt) ||
    (uploadedAt ? new Date(uploadedAt.getTime() + 48 * 60 * 60 * 1000) : null)
  const assignedAgentId = text(row.assigned_agent_id || row.assignedAgentId)
  const serverState = text(row.sla_state || row.slaState).toLowerCase()
  const open = ['uploaded', 'under_review'].includes(status)
  let slaState = serverState
  if (!slaState) {
    if (!open) slaState = 'resolved'
    else if (row.owner_missing === true || row.ownerMissing === true) slaState = 'unassigned'
    else if (dueAt && now.getTime() >= dueAt.getTime() + 48 * 60 * 60 * 1000) slaState = 'critical'
    else if (dueAt && now.getTime() >= dueAt.getTime()) slaState = 'breached'
    else if (dueAt && now.getTime() >= dueAt.getTime() - 24 * 60 * 60 * 1000) slaState = 'due_soon'
    else slaState = 'on_track'
  }
  const hoursUntilDue = dueAt ? (dueAt.getTime() - now.getTime()) / 3600000 : null
  return {
    ...row,
    documentId: text(document.id || row.document_id || row.documentId),
    privateListingId: text(row.private_listing_id || row.privateListingId),
    assignedAgentId,
    title: text(row.requirement_name || row.requirementName || row.title || row.label || document.document_name || document.documentName) || 'Seller document',
    status,
    uploadedAt: uploadedAt?.toISOString() || '',
    reviewDueAt: dueAt?.toISOString() || '',
    hoursUntilDue,
    reviewAgeHours: uploadedAt ? (now.getTime() - uploadedAt.getTime()) / 3600000 : number(row.review_age_hours || row.reviewAgeHours),
    slaState,
    failedNotificationCount: number(row.failed_notification_count || row.failedNotificationCount),
    blocking: BLOCKING_STATES.has(slaState) || number(row.failed_notification_count || row.failedNotificationCount) > 0,
    attention: WARNING_STATES.has(slaState),
  }
}

export function buildSellerDocumentReviewSlaReport(rows = [], { now = new Date(), source = 'seller_document_review_sla_v1' } = {}) {
  const resolvedNow = now instanceof Date ? now : new Date(now)
  const items = (Array.isArray(rows) ? rows : []).map((row) => resolveRow(row, resolvedNow))
  const open = items.filter((item) => ['uploaded', 'under_review'].includes(item.status))
  const blocking = open.filter((item) => item.blocking)
  const attention = open.filter((item) => !item.blocking && item.attention)
  const onTrack = open.filter((item) => !item.blocking && !item.attention)
  const failedNotifications = open.reduce((count, item) => count + item.failedNotificationCount, 0)
  const gateStatus = blocking.length ? 'blocked' : attention.length ? 'warning' : 'pass'

  return {
    version: 'seller_document_review_sla_p1_9_v1',
    source,
    generatedAt: resolvedNow.toISOString(),
    summary: {
      openCount: open.length,
      onTrackCount: onTrack.length,
      dueSoonCount: open.filter((item) => item.slaState === 'due_soon').length,
      breachedCount: open.filter((item) => item.slaState === 'breached').length,
      criticalCount: open.filter((item) => item.slaState === 'critical').length,
      unassignedCount: open.filter((item) => item.slaState === 'unassigned').length,
      failedNotificationCount: failedNotifications,
      blockingCount: blocking.length,
      attentionCount: attention.length,
    },
    gate: {
      status: gateStatus,
      releaseRecommended: gateStatus === 'pass',
      reason: blocking.length
        ? `${blocking.length} seller document review${blocking.length === 1 ? '' : 's'} are critical, unassigned, or have failed SLA notifications.`
        : attention.length
          ? `${attention.length} seller document review${attention.length === 1 ? '' : 's'} are due soon or overdue.`
          : 'All open seller document reviews are within SLA.',
    },
    rows: items.sort((left, right) => Number(right.blocking) - Number(left.blocking) || (left.reviewDueAt || '').localeCompare(right.reviewDueAt || '')),
    blockingDocumentIds: blocking.map((item) => item.documentId).filter(Boolean),
  }
}

export { BLOCKING_STATES, WARNING_STATES }
