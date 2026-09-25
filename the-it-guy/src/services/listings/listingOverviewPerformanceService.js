import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const UPCOMING_VIEWING_STATUSES = new Set([
  'confirmed',
  'pending_approval',
  'reschedule_requested',
  'viewing_requested',
  'requested',
])
const EXCLUDED_VIEWING_STATUSES = new Set(['cancelled', 'declined', 'rejected'])

function text(value = '') {
  return String(value || '').trim()
}

function count(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null
}

function channel(value = {}, fallbackReason = '') {
  const source = value && typeof value === 'object' ? value : {}
  return {
    connected: source.connected === true,
    available: source.available === true,
    views: count(source.views),
    previousViews: count(source.previousViews),
    portalContacts: count(source.portalContacts),
    lastSyncedAt: text(source.lastSyncedAt || source.lastTrackedAt),
    reason: text(source.reason || fallbackReason),
  }
}

export function createEmptyListingOverviewAnalytics() {
  return {
    loading: false,
    error: '',
    windowDays: 30,
    generatedAt: '',
    property24: channel({}, 'Property24 statistics are awaiting a successful sync.'),
    privateProperty: channel({}, 'Private Property view statistics are not available in the current Arch9 feed.'),
    website: channel({}, 'This listing is not published on a connected Arch9 website.'),
  }
}

export function normalizeListingOverviewAnalytics(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    ...createEmptyListingOverviewAnalytics(),
    windowDays: Math.max(1, Math.min(90, count(source.windowDays) || 30)),
    generatedAt: text(source.generatedAt),
    property24: channel(source.property24, 'Property24 statistics are awaiting a successful sync.'),
    privateProperty: channel(source.privateProperty, 'Private Property view statistics are not available in the current Arch9 feed.'),
    website: channel(source.website, 'This listing is not published on a connected Arch9 website.'),
  }
}

export async function getListingOverviewAnalytics({ organisationId = '', listingId = '', days = 30 } = {}) {
  const orgId = text(organisationId)
  const id = text(listingId)
  if (!orgId || !id || !isSupabaseConfigured || !supabase) return createEmptyListingOverviewAnalytics()

  const result = await supabase.rpc('listing_overview_performance', {
    p_organisation_id: orgId,
    p_listing_id: id,
    p_days: Math.max(1, Math.min(90, count(days) || 30)),
  })
  if (result.error) throw result.error
  return normalizeListingOverviewAnalytics(result.data)
}

function timestamp(value) {
  const parsed = new Date(value || 0).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function viewingStatus(viewing = {}) {
  return text(viewing.status).toLowerCase().replace(/[^a-z0-9]+/g, '_')
}

function uniqueLeadRows(leads = []) {
  const unique = new Map()
  leads.forEach((lead, index) => {
    const key = text(
      lead?.email || lead?.buyerEmail || lead?.phone || lead?.buyerPhone ||
      lead?.leadId || lead?.lead_id || lead?.id || lead?.contactId || lead?.contact_id,
    ).toLowerCase() || `unidentified-${index}`
    const existing = unique.get(key)
    if (!existing || timestamp(lead?.updatedAt || lead?.updated_at || lead?.createdAt || lead?.created_at) >= timestamp(existing?.updatedAt || existing?.updated_at || existing?.createdAt || existing?.created_at)) {
      unique.set(key, lead)
    }
  })
  return [...unique.values()]
}

export function buildListingOverviewPerformance({
  analytics = createEmptyListingOverviewAnalytics(),
  leads = [],
  viewings = [],
  daysOnMarket = 0,
  marketStartDate = '',
  areaAverageDays = 0,
  now = new Date(),
} = {}) {
  const normalizedAnalytics = normalizeListingOverviewAnalytics(analytics)
  const availableViewChannels = [normalizedAnalytics.property24, normalizedAnalytics.website]
    .filter((item) => item.available && item.views !== null)
  const totalViews = availableViewChannels.length
    ? availableViewChannels.reduce((sum, item) => sum + item.views, 0)
    : null
  const comparableChannels = availableViewChannels.filter((item) => item.previousViews !== null)
  const priorViews = comparableChannels.length === availableViewChannels.length && comparableChannels.length
    ? comparableChannels.reduce((sum, item) => sum + item.previousViews, 0)
    : null
  const viewChangePercent = priorViews && totalViews !== null
    ? ((totalViews - priorViews) / priorViews) * 100
    : priorViews === 0 && totalViews === 0
      ? 0
      : null

  const leadRows = uniqueLeadRows(Array.isArray(leads) ? leads : [])
  const viewingRows = Array.isArray(viewings) ? viewings : []
  const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000)
  const newThisWeek = leadRows.filter((lead) => timestamp(lead.createdAt || lead.created_at || lead.updatedAt || lead.updated_at) >= sevenDaysAgo).length
  const activeViewings = viewingRows.filter((viewing) => !EXCLUDED_VIEWING_STATUSES.has(viewingStatus(viewing)))
  const completedViewings = viewingRows.filter((viewing) => viewingStatus(viewing) === 'completed').length
  const upcomingViewings = viewingRows.filter((viewing) => UPCOMING_VIEWING_STATUSES.has(viewingStatus(viewing))).length
  const uniqueViewingLeadIds = new Set(activeViewings
    .map((viewing) => text(viewing.buyer_lead_id || viewing.buyerLeadId))
    .filter(Boolean))

  return {
    totalViews,
    viewsAvailable: totalViews !== null,
    partialViews: normalizedAnalytics.privateProperty.connected && !normalizedAnalytics.privateProperty.available,
    portalViews: normalizedAnalytics.property24.views,
    bridgeViews: normalizedAnalytics.website.views,
    privatePropertyViews: normalizedAnalytics.privateProperty.views,
    priorViews,
    viewChangePercent,
    channels: {
      property24: normalizedAnalytics.property24,
      privateProperty: normalizedAnalytics.privateProperty,
      website: normalizedAnalytics.website,
    },
    leadCount: leadRows.length,
    newThisWeek,
    scheduledViewings: activeViewings.length,
    completedViewings,
    upcomingViewings,
    viewingConversionRate: leadRows.length ? Math.round((uniqueViewingLeadIds.size / leadRows.length) * 1000) / 10 : null,
    daysOnMarket: Math.max(0, count(daysOnMarket) || 0),
    marketStartDate,
    areaAverageDays: Math.max(0, count(areaAverageDays) || 0),
    analyticsError: text(analytics?.error),
    analyticsLoading: analytics?.loading === true,
  }
}
