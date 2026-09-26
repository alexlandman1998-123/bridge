import { requireClient } from './attorneyFirmServiceShared'

export async function getAttorneyDashboardMetricPage({
  firmId,
  metricGroup,
  metricKey,
  roleView = 'all',
  page = 1,
  pageSize = 20,
  search = '',
} = {}) {
  if (!firmId || !metricGroup || !metricKey) throw new Error('An attorney dashboard metric is required.')
  const { data, error } = await requireClient().rpc('get_attorney_dashboard_metric_matter_page', {
    p_firm_id: firmId,
    p_metric_group: metricGroup,
    p_metric_key: metricKey,
    p_role_view: roleView,
    p_page: Math.max(1, Number(page) || 1),
    p_page_size: Math.min(100, Math.max(1, Number(pageSize) || 20)),
    p_search: String(search || '').trim(),
  })
  if (error) throw error
  if (data?.contract !== 'arch9-attorney-dashboard-metric-page-v1') {
    throw new Error('Attorney dashboard drill-down is unavailable.')
  }
  return data
}
