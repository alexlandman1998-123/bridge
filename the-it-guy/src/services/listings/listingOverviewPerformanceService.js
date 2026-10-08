import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient.js'

const UPCOMING_VIEWING_STATUSES = new Set([
  'confirmed',
  'pending_approval',
  'reschedule_requested',
  'viewing_requested',
  'requested',
])
const EXCLUDED_VIEWING_STATUSES = new Set(['cancelled', 'declined', 'rejected'])

// The Overview is a summary of these existing records, not a second source of truth.
// Keep this contract beside the count builder so later UI/workflow phases reuse it.
export const LISTING_OVERVIEW_DISPLAY_SOURCES = Object.freeze({
  leads: 'listing-linked buyer leads',
  viewings: 'listing-linked appointments and their participants',
  daysOnMarket: 'saved listing date or verified publication/market-start timestamp',
  buyerActivity: 'listing-linked buyer leads and viewings',
  seller: 'canonical seller profile, onboarding, mandate and portal state',
  marketing: 'saved listing marketing draft and distribution links',
  pricePosition: 'saved listing asking price',
  documentProgress: 'canonical seller document requirement summary',
  published: 'saved distribution channel publication states and URLs',
  listingAgent: 'assigned listing agent and organisation profile',
})

export const LISTING_OVERVIEW_STATUS_CONTRACT = Object.freeze({
  viewing: Object.freeze({
    viewing_requested: 'Awaiting responses',
    pending_approval: 'Awaiting responses',
    reschedule_requested: 'New time proposed',
    confirmed: 'Confirmed',
    declined: 'Declined',
    cancelled: 'Cancelled',
    completed: 'Completed',
  }),
  sellerSetup: Object.freeze(['setup_needed', 'invited', 'activated', 'attention']),
  documentProgress: Object.freeze(['setup_needed', 'incomplete', 'ready_for_review', 'complete', 'unavailable']),
  pricing: Object.freeze(['not_captured', 'current', 'reduced']),
  publication: Object.freeze(['not_published', 'submitting', 'published', 'needs_attention', 'unknown']),
})

export function getListingOverviewViewingStatusLabel(status = '') {
  return LISTING_OVERVIEW_STATUS_CONTRACT.viewing[text(status).toLowerCase()] || 'Status unavailable'
}

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
  const metrics = Object.fromEntries(Object.entries(source.metrics || {}).map(([key, metric]) => [key, {
    value: count(metric?.value), available: metric?.available === true, complete: metric?.complete === true,
    coveredDays: count(metric?.coveredDays), expectedDays: count(metric?.expectedDays), kind: text(metric?.kind),
  }]))
  return {
    connected: source.connected === true,
    available: source.available === true,
    complete: source.complete === true,
    published: source.published === true,
    state: text(source.state),
    views: count(source.views),
    previousViews: count(source.previousViews),
    portalContacts: count(source.portalContacts),
    lastSyncedAt: text(source.lastSyncedAt),
    lastTrackedAt: text(source.lastTrackedAt),
    dataThrough: text(source.dataThrough),
    requestedStartDate: text(source.requestedStartDate), requestedEndDate: text(source.requestedEndDate),
    metrics,
    coverage: { coveredDays: count(source.coverage?.coveredDays), expectedDays: count(source.coverage?.expectedDays), kind: text(source.coverage?.kind) },
    sourceTimeZone: text(source.sourceTimeZone), timezoneAligned: source.timezoneAligned === true,
    lastAttempt: source.lastAttempt ? { status: text(source.lastAttempt.status), at: text(source.lastAttempt.at), failed: source.lastAttempt.failed === true, pendingCount: count(source.lastAttempt.pendingCount), deferredCount: count(source.lastAttempt.deferredCount) } : null,
    reason: text(source.reason || fallbackReason),
  }
}

export function createEmptyListingOverviewAnalytics() {
  return {
    loading: false,
    error: '',
    windowDays: 30,
    generatedAt: '',
    period: null,
    property24: channel({}, 'Property24 statistics are awaiting a successful sync.'),
    privateProperty: channel({}, 'Private Property statistics are awaiting a successful sync.'),
    website: channel({}, 'This listing is not published on a connected Arch9 website.'),
  }
}

export function normalizeListingOverviewAnalytics(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    ...createEmptyListingOverviewAnalytics(),
    windowDays: Math.max(1, Math.min(90, count(source.windowDays) || 30)),
    generatedAt: text(source.generatedAt),
    period: source.period ? { startDate: text(source.period.startDate), endDate: text(source.period.endDate), days: count(source.period.days), timeZone: text(source.period.timeZone), completedDaysOnly: source.period.completedDaysOnly === true } : null,
    property24: channel(source.property24, 'Property24 statistics are awaiting a successful sync.'),
    privateProperty: channel(source.privateProperty, 'Private Property statistics are awaiting a successful sync.'),
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

function viewingTime(viewing = {}) {
  const date = text(viewing.proposed_date || viewing.proposedDate || viewing.date || viewing.appointmentDate)
  const time = text(viewing.proposed_time || viewing.proposedTime || viewing.startTime || viewing.start_time)
  if (!date || !time) return 0
  const parsed = new Date(`${date}T${time}`).getTime()
  return Number.isFinite(parsed) ? parsed : 0
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
  const allViewChannels = [normalizedAnalytics.property24, normalizedAnalytics.privateProperty, normalizedAnalytics.website]
  const availableViewChannels = allViewChannels
    .filter((item) => item.available && item.views !== null)
  const totalViews = availableViewChannels.length
    ? availableViewChannels.reduce((sum, item) => sum + item.views, 0)
    : null
  const comparableChannels = availableViewChannels.filter((item) => item.previousViews !== null)
  const priorViews = availableViewChannels.every((item) => item.complete) && comparableChannels.length === availableViewChannels.length && comparableChannels.length
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
  const upcomingViewings = viewingRows.filter((viewing) => UPCOMING_VIEWING_STATUSES.has(viewingStatus(viewing)) && viewingTime(viewing) >= now.getTime()).length
  const uniqueViewingLeadIds = new Set(activeViewings
    .map((viewing) => text(viewing.buyer_lead_id || viewing.buyerLeadId))
    .filter(Boolean))

  return {
    totalViews,
    viewsAvailable: totalViews !== null,
    partialViews: allViewChannels.some((item) => (item.connected && !item.available) || (item.available && !item.complete)),
    property24Views: normalizedAnalytics.property24.views,
    websiteViews: normalizedAnalytics.website.views,
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

export function resolveListingOverviewMarketStartDate(listing = {}, draft = {}) {
  return [draft?.listingDate, listing?.listingDate, listing?.publishedAt, listing?.published_at,
    listing?.firstPublishedAt, listing?.first_published_at, listing?.marketedAt, listing?.marketed_at,
    listing?.listedAt, listing?.listed_at].map(text).find(Boolean) || ''
}

export function getListingOverviewDaysOnMarket(marketStartDate, now = new Date()) {
  const start = new Date(marketStartDate || '').getTime()
  return Number.isFinite(start) ? Math.max(0, Math.floor((now.getTime() - start) / 86_400_000)) : 0
}

async function readSellerOverview(name, token, accessToken) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const request = supabase.rpc(name, { p_token: token, p_access_token: accessToken })
    return await (typeof request.abortSignal === 'function' ? request.abortSignal(controller.signal) : request)
  } finally {
    clearTimeout(timeout)
  }
}

export async function getSellerListingOverviewPerformance({ token, accessToken, listingId }) {
  if (!token || !accessToken || !listingId || !isSupabaseConfigured || !supabase) throw new Error('Listing performance unavailable.')
  const result = await readSellerOverview('bridge_seller_listing_marketing_performance', token, accessToken)
  if (result.error) throw result.error
  if (String(result.data?.listingId || '') !== String(listingId)) throw new Error('Listing performance scope mismatch.')
  return { ...result.data, available: true }
}

export async function getSellerListingOverviewContext({ token, accessToken, listingId }) {
  if (!token || !accessToken || !listingId || !isSupabaseConfigured || !supabase) throw new Error('Listing context unavailable.')
  const result = await readSellerOverview('bridge_seller_listing_overview_context', token, accessToken)
  if (result.error) throw result.error
  if (String(result.data?.listingId || '') !== String(listingId)) throw new Error('Listing context scope mismatch.')
  return result.data
}
