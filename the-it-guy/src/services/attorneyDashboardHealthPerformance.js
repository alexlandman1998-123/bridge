import { requireClient } from './attorneyFirmServiceShared'

function normalizeText(value = '') {
  return String(value || '').trim()
}

export async function getAttorneyDashboardHealthPerformanceSnapshot(firmId, { roleView = 'all', periodStart = null, periodEnd = null } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('An attorney firm is required to load health and performance metrics.')

  const { data, error } = await requireClient().rpc('get_attorney_dashboard_health_performance_snapshot', {
    p_firm_id: normalizedFirmId,
    p_role_view: roleView,
    p_period_start: periodStart,
    p_period_end: periodEnd,
  })
  if (error) throw error
  if (data?.sourceStatus !== 'available') throw new Error('Attorney health and performance metrics are unavailable.')
  return data
}
