import { isMissingTableError, normalizeText, requireClient } from './attorneyFirmServiceShared'

function emptySnapshot(view = 'all', page = 1, pageSize = 20) {
  return {
    contract: 'arch9-attorney-matter-list-snapshot-v1',
    view,
    pagination: { page, pageSize, totalRows: 0 },
    kpis: {
      activeMatters: 0,
      awaitingClient: 0,
      lodgementToday: 0,
      registrationThisWeek: 0,
      delayedMatters: 0,
      appointmentsToday: 0,
    },
    rows: [],
    access: { activeMembership: false, scope: 'assigned' },
  }
}

export async function getAttorneyMatterListSnapshot({
  firmId = '',
  view = 'all',
  page = 1,
  pageSize = 20,
  search = '',
  filters = {},
} = {}) {
  const normalizedFirmId = normalizeText(firmId)
  const normalizedView = normalizeText(view).toLowerCase() || 'all'
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 20))
  if (!normalizedFirmId) return emptySnapshot(normalizedView, normalizedPage, normalizedPageSize)

  const client = requireClient()
  const result = await client.rpc('bridge_attorney_matter_list_snapshot', {
    p_attorney_firm_id: normalizedFirmId,
    p_view: normalizedView,
    p_page: normalizedPage,
    p_page_size: normalizedPageSize,
    p_search: normalizeText(search),
    p_filters: filters && typeof filters === 'object' && !Array.isArray(filters) ? filters : {},
  })

  if (result.error) {
    if (isMissingTableError(result.error, 'bridge_attorney_matter_list_snapshot')) {
      return null
    }
    throw result.error
  }

  return result.data && typeof result.data === 'object'
    ? result.data
    : emptySnapshot(normalizedView, normalizedPage, normalizedPageSize)
}
