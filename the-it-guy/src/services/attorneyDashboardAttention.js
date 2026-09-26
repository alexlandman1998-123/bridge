import { requireClient } from './attorneyFirmServiceShared'

function normalizeText(value = '') {
  return String(value || '').trim()
}

export async function getAttorneyDashboardAttentionSnapshot(firmId, { roleView = 'all' } = {}) {
  const normalizedFirmId = normalizeText(firmId)
  if (!normalizedFirmId) throw new Error('An attorney firm is required to load attention metrics.')

  const { data, error } = await requireClient().rpc('get_attorney_dashboard_attention_snapshot', {
    p_firm_id: normalizedFirmId,
    p_role_view: roleView,
  })
  if (error) throw error
  if (data?.sourceStatus !== 'available') throw new Error('Attorney attention metrics are unavailable.')
  return data
}
