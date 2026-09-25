const BOOKED_VIEWING_STATUSES = new Set([
  'confirmed',
  'completed',
  'no_show',
])

const CONTACTED_STATUS_GROUPS = new Set([
  'contacted',
  'viewing',
  'offer',
  'converted',
])

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

export function isBookedListingViewing(viewing = {}) {
  return BOOKED_VIEWING_STATUSES.has(normalizeText(viewing?.status))
}

export function buildListingLeadMetrics(rows = [], { now = Date.now() } = {}) {
  const leads = Array.isArray(rows) ? rows : []
  const nowTimestamp = now instanceof Date ? now.getTime() : Number(now)
  const effectiveNow = Number.isFinite(nowTimestamp) ? nowTimestamp : Date.now()
  const sevenDaysAgo = effectiveNow - (7 * 24 * 60 * 60 * 1000)
  const total = leads.length
  const percent = (value) => total ? `${Math.round((value / total) * 100)}% of total` : '0% of total'

  const newThisWeek = leads.filter((lead) => {
    const timestamp = new Date(lead?.createdAt || lead?.created_at || 0).getTime()
    return Number.isFinite(timestamp) && timestamp >= sevenDaysAgo && timestamp <= effectiveNow
  }).length

  const contacted = leads.filter((lead) => (
    Boolean(lead?.contactedAt || lead?.contacted_at || lead?.firstContactedAt || lead?.first_contacted_at) ||
    CONTACTED_STATUS_GROUPS.has(normalizeText(lead?.statusGroup))
  )).length

  const viewingsBooked = leads.filter((lead) => {
    const viewingRows = Array.isArray(lead?.viewings) ? lead.viewings : []
    if (viewingRows.length) return viewingRows.some(isBookedListingViewing)
    return Number(lead?.bookedViewingCount || 0) > 0
  }).length

  return {
    total,
    newThisWeek,
    contacted,
    viewingsBooked,
    percent,
  }
}
