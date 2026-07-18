import {
  isMissingTableError,
  normalizeText,
  requireClient,
} from './attorneyFirmServiceShared.js'

const ALERT_SELECT = [
  'id',
  'assignment_id',
  'transaction_id',
  'attorney_firm_id',
  'organisation_id',
  'alert_type',
  'severity',
  'status',
  'due_at',
  'triggered_at',
  'payload_json',
  'acknowledged_at',
  'acknowledged_by',
  'created_at',
  'updated_at',
  'transaction_reference',
  'allocation_state',
  'firm_acceptance_status',
  'staff_assignment_status',
  'replacement_sequence',
].join(',')

function mapAlert(row = {}) {
  return {
    id: row.id,
    assignmentId: row.assignment_id,
    transactionId: row.transaction_id,
    attorneyFirmId: row.attorney_firm_id,
    organisationId: row.organisation_id,
    alertType: row.alert_type,
    severity: row.severity || 'info',
    status: row.status || 'open',
    dueAt: row.due_at || null,
    triggeredAt: row.triggered_at || row.created_at || null,
    payload: row.payload_json || {},
    acknowledgedAt: row.acknowledged_at || null,
    acknowledgedBy: row.acknowledged_by || null,
    transactionReference: row.transaction_reference || '',
    allocationState: row.allocation_state || '',
    firmAcceptanceStatus: row.firm_acceptance_status || '',
    staffAssignmentStatus: row.staff_assignment_status || '',
    replacementSequence: Number(row.replacement_sequence || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  }
}

export function buildAttorneyFirmAllocationAlertSummary(alerts = [], { now = new Date() } = {}) {
  const rows = Array.isArray(alerts) ? alerts : []
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const open = rows.filter((alert) => ['open', 'acknowledged'].includes(normalizeText(alert.status).toLowerCase()))
  const critical = open.filter((alert) => normalizeText(alert.severity).toLowerCase() === 'critical')
  const overdue = open.filter((alert) => alert.dueAt && new Date(alert.dueAt).getTime() <= nowMs)
  const countsByType = open.reduce((counts, alert) => {
    const key = normalizeText(alert.alertType) || 'unknown'
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})

  return {
    totalCount: rows.length,
    openCount: open.length,
    criticalCount: critical.length,
    overdueCount: overdue.length,
    countsByType,
    requiresAttention: critical.length > 0 || overdue.length > 0,
    nextDueAt: open
      .map((alert) => alert.dueAt)
      .filter(Boolean)
      .sort()[0] || null,
  }
}

export async function getAttorneyFirmAllocationAlerts({
  attorneyFirmId = '',
  organisationId = '',
  transactionId = '',
  includeResolved = false,
  client = requireClient(),
} = {}) {
  let query = client
    .from('attorney_firm_allocation_alert_queue_v1')
    .select(ALERT_SELECT)
    .order('created_at', { ascending: false })

  if (attorneyFirmId) query = query.eq('attorney_firm_id', attorneyFirmId)
  if (organisationId) query = query.eq('organisation_id', organisationId)
  if (transactionId) query = query.eq('transaction_id', transactionId)
  if (!includeResolved) query = query.in('status', ['open', 'acknowledged'])
  const result = await query

  if (result.error) {
    if (isMissingTableError(result.error, 'attorney_firm_allocation_alert_queue_v1')) {
      throw new Error('Deploy the Phase 9 firm allocation alert migration before loading alerts.')
    }
    throw result.error
  }

  const alerts = (result.data || []).map(mapAlert)
  return { alerts, summary: buildAttorneyFirmAllocationAlertSummary(alerts) }
}

export async function acknowledgeAttorneyFirmAllocationAlert(alertId, { client = requireClient() } = {}) {
  const normalizedAlertId = normalizeText(alertId)
  if (!normalizedAlertId) throw new Error('Firm allocation alert is required.')
  const result = await client.rpc('bridge_acknowledge_transfer_firm_alert', { p_alert_id: normalizedAlertId })
  if (result.error) throw result.error
  return mapAlert(Array.isArray(result.data) ? result.data[0] : result.data)
}
