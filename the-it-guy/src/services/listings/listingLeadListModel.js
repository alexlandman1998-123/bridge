function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function validTimestamp(value) {
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function startOfLocalDay(timestamp) {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function hasContactSignal(lead = {}) {
  return Boolean(
    lead.contactedAt ||
    lead.contacted_at ||
    lead.firstContactedAt ||
    lead.first_contacted_at ||
    lead.lastContactedAt ||
    lead.last_contacted_at,
  )
}

export function filterListingLeadRows(rows = [], filters = {}, { now = Date.now() } = {}) {
  const leads = Array.isArray(rows) ? rows : []
  const query = lower(filters.search)
  const status = lower(filters.status || 'all')
  const source = text(filters.source || 'all')
  const activity = lower(filters.activity || 'all')
  const dateRange = lower(filters.date || 'all')
  const parsedNow = now instanceof Date ? now.getTime() : Number(now)
  const effectiveNow = Number.isFinite(parsedNow) ? parsedNow : Date.now()
  const dayMs = 24 * 60 * 60 * 1000

  return leads.filter((lead) => {
    const searchText = lower(lead.searchText || [lead.name, lead.phone, lead.email, lead.sourceLabel, lead.statusLabel].filter(Boolean).join(' '))
    if (query && !searchText.includes(query)) return false
    if (status !== 'all' && lower(lead.statusGroup) !== status) return false
    if (source !== 'all' && text(lead.sourceLabel) !== source) return false
    if (activity === 'has_viewing' && Number(lead.bookedViewingCount || 0) <= 0) return false
    if (activity === 'has_offer' && Number(lead.offerCount || 0) <= 0) return false
    if (activity === 'needs_follow_up' && (hasContactSignal(lead) || lower(lead.statusGroup) !== 'new')) return false

    if (dateRange !== 'all') {
      const created = validTimestamp(lead.createdAt || lead.created_at)
      if (created === null || created > effectiveNow) return false
      const minimum = dateRange === 'today'
        ? startOfLocalDay(effectiveNow)
        : effectiveNow - (dateRange === '7_days' ? 7 * dayMs : 30 * dayMs)
      if (created < minimum) return false
    }
    return true
  })
}

export function clampListingLeadPage(page, rowCount, pageSize = 10) {
  const safePageSize = Math.max(1, Number(pageSize) || 10)
  const pageCount = Math.max(1, Math.ceil(Math.max(0, Number(rowCount) || 0) / safePageSize))
  const safePage = Math.min(pageCount, Math.max(1, Number(page) || 1))
  return { page: safePage, pageCount }
}

export function escapeListingLeadCsvValue(value) {
  const raw = String(value ?? '')
  const spreadsheetSafe = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw
  return `"${spreadsheetSafe.replace(/"/g, '""')}"`
}
