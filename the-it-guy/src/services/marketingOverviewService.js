import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const DAY = 24 * 60 * 60 * 1000

function text(value = '') { return String(value || '').trim() }
function number(value = 0) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function isoDay(value) { return new Date(value).toISOString().slice(0, 10) }

export const MARKETING_DATE_RANGES = Object.freeze([
  { key: '7d', label: 'Last 7 days', days: 7 },
  { key: '30d', label: 'Last 30 days', days: 30 },
  { key: 'month', label: 'This month' },
  { key: '90d', label: 'Last 90 days', days: 90 },
  { key: 'custom', label: 'Custom range' },
])

export function resolveMarketingPeriod(range = '30d', now = new Date(), customStart = '', customEnd = '') {
  const selected = MARKETING_DATE_RANGES.find((item) => item.key === range) || MARKETING_DATE_RANGES[1]
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)
  const start = new Date(end)
  if (selected.key === 'custom') {
    const suppliedStart = new Date(`${customStart}T00:00:00`)
    const suppliedEnd = new Date(`${customEnd}T23:59:59.999`)
    if (Number.isFinite(suppliedStart.getTime()) && Number.isFinite(suppliedEnd.getTime()) && suppliedStart <= suppliedEnd) {
      start.setTime(suppliedStart.getTime())
      end.setTime(suppliedEnd.getTime())
    } else start.setTime(end.getTime() - (29 * DAY))
  } else if (selected.key === 'month') start.setDate(1)
  else start.setTime(end.getTime() - ((selected.days - 1) * DAY))
  start.setHours(0, 0, 0, 0)
  const periodDays = Math.max(1, Math.round((end - start) / DAY) + 1)
  const comparisonEnd = new Date(start.getTime() - 1)
  const comparisonStart = new Date(comparisonEnd.getTime() - ((periodDays - 1) * DAY))
  comparisonStart.setHours(0, 0, 0, 0)
  return { key: selected.key, label: selected.label, start, end, comparisonStart, comparisonEnd, days: periodDays }
}

export function normaliseMarketingLeadSource(value = '') {
  const key = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (['property24', 'p24'].includes(key)) return { key: 'property24', label: 'Property24' }
  if (['private_property', 'privateproperty', 'private_property_sa'].includes(key)) return { key: 'private_property', label: 'Private Property' }
  if (['website', 'web', 'contact_form', 'property_enquiry', 'valuation_request'].includes(key)) return { key: 'website', label: 'Website' }
  if (['email', 'email_campaign'].includes(key)) return { key: 'email_campaign', label: 'Email campaigns' }
  if (['whatsapp', 'whatsapp_campaign', 'wa'].includes(key)) return { key: 'whatsapp_campaign', label: 'WhatsApp campaigns' }
  if (['facebook', 'facebook_lead_ad'].includes(key)) return { key: 'facebook_lead_ad', label: 'Facebook / Instagram Lead Ads' }
  if (['instagram', 'instagram_lead_ad'].includes(key)) return { key: 'instagram_lead_ad', label: 'Facebook / Instagram Lead Ads' }
  if (['manual', 'manual_import', 'import', 'csv', 'referral'].includes(key)) return { key: 'manual_other', label: 'Manual / Other' }
  return { key: 'manual_other', label: 'Manual / Other' }
}

function percentageChange(current, previous) {
  if (previous === null || previous === undefined) return null
  if (previous === 0) return current === 0 ? 0 : null
  return Math.round(((current - previous) / previous) * 100)
}

function percentage(value, total) {
  const denominator = number(total)
  return denominator > 0 ? Math.round((number(value) / denominator) * 1000) / 10 : null
}

function metric(value, previous, { available = true, note = '' } = {}) {
  const previousValue = previous === null || previous === undefined ? null : number(previous)
  return { value: available ? number(value) : null, change: available ? percentageChange(number(value), previousValue) : null, available, note }
}

function buildLeadSeries(leads, period) {
  const days = Array.from({ length: period.days }, (_, index) => {
    const date = new Date(period.start.getTime() + (index * DAY))
    return { date: isoDay(date), totalLeads: 0, qualifiedLeads: null }
  })
  const byDay = new Map(days.map((row) => [row.date, row]))
  for (const lead of leads) {
    const key = isoDay(lead.created_at)
    const row = byDay.get(key)
    if (row) row.totalLeads += 1
  }
  return days
}

function timeInRange(value, period) {
  const date = new Date(value || 0).getTime()
  return Number.isFinite(date) && date >= period.start.getTime() && date <= period.end.getTime()
}

function readAudience(campaign = {}) {
  const filter = campaign.audience_filter && typeof campaign.audience_filter === 'object' ? campaign.audience_filter : {}
  return text(filter.tag || filter.role_type || filter.area) || 'All consented contacts'
}

function displayLead(lead = {}) {
  const first = text(lead?.contacts?.first_name || lead?.first_name)
  const last = text(lead?.contacts?.last_name || lead?.last_name)
  return [first, last].filter(Boolean).join(' ') || text(lead?.contacts?.email || lead?.email) || 'New lead'
}

export function normalizeProperty24MarketingAnalytics(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    connected: source.connected === true,
    lastSyncedAt: text(source.lastSyncedAt),
    listingViews: number(source.listingViews),
    listingAlerts: number(source.listingAlerts),
    telephoneLeads: number(source.telephoneLeads),
    smsLeads: number(source.smsLeads),
    listingContactFormLeads: number(source.listingContactFormLeads),
    whatsAppContactFormLeads: number(source.whatsAppContactFormLeads),
    totalLeads: number(source.totalLeads),
    totalContactLeads: number(source.totalContactLeads),
    daily: Array.isArray(source.daily) ? source.daily.map((row) => ({
      date: text(row?.date),
      listingContactFormLeads: number(row?.listingContactFormLeads),
      whatsAppContactFormLeads: number(row?.whatsAppContactFormLeads),
      totalContactLeads: number(row?.totalContactLeads),
      listingViews: number(row?.listingViews),
    })).filter((row) => row.date) : [],
  }
}

export function resolveProperty24StatisticsFreshness({ connected = false, lastSyncedAt = '', now = new Date() } = {}) {
  if (!connected) return { key: 'unavailable', label: 'Not connected', detail: 'Property24 is not connected for portal statistics.' }
  const syncedAt = new Date(lastSyncedAt).getTime()
  if (!Number.isFinite(syncedAt)) return { key: 'awaiting', label: 'Awaiting sync', detail: 'Property24 is connected but has not supplied statistics yet.' }
  const ageHours = Math.max(0, Math.round((now.getTime() - syncedAt) / 3600000))
  if (ageHours > 36) return { key: 'stale', label: 'Data may be stale', detail: `Last successful sync was ${ageHours} hours ago.` }
  return { key: 'current', label: 'Current', detail: 'Statistics were refreshed within the expected daily window.' }
}

export function deriveProperty24PerformanceInsights(performance = {}) {
  const portal = performance && typeof performance === 'object' ? performance : {}
  const insights = []
  const contactForms = number(portal.listingContactFormLeads) + number(portal.whatsAppContactFormLeads)
  const whatsappShare = percentage(portal.whatsAppContactFormLeads, contactForms)
  const views = number(portal.listingViews)
  const contacts = number(portal.totalContactLeads)
  const contactChange = portal.comparison?.totalContactLeads
  const viewsChange = portal.comparison?.listingViews

  if (!portal.connected) return [{ key: 'not-connected', tone: 'neutral', title: 'Property24 statistics are not connected', detail: 'Connect Property24 and run the first statistics sync to generate portal insights.' }]
  if (portal.freshness?.key === 'stale') insights.push({ key: 'stale', tone: 'warning', title: 'Statistics may be stale', detail: portal.freshness.detail })
  if (portal.freshness?.key === 'awaiting') insights.push({ key: 'awaiting', tone: 'neutral', title: 'Waiting for the first statistics sync', detail: portal.freshness.detail })
  if (views > 0 && contacts === 0) insights.push({ key: 'no-contacts', tone: 'warning', title: 'Views have not generated portal contacts', detail: `${views.toLocaleString()} listing views produced no recorded portal contacts in this period.` })
  if (contacts > 0 && portal.contactRate !== null && portal.contactRate !== undefined) insights.push({ key: 'contact-rate', tone: 'positive', title: `${portal.contactRate}% of views became portal contacts`, detail: `${contacts.toLocaleString()} portal contact${contacts === 1 ? '' : 's'} from ${views.toLocaleString()} listing view${views === 1 ? '' : 's'}.` })
  if (whatsappShare !== null && contactForms > 0) insights.push({ key: 'whatsapp-share', tone: 'neutral', title: `WhatsApp forms account for ${whatsappShare}% of online forms`, detail: `${number(portal.whatsAppContactFormLeads).toLocaleString()} WhatsApp form${number(portal.whatsAppContactFormLeads) === 1 ? '' : 's'} and ${number(portal.listingContactFormLeads).toLocaleString()} listing contact form${number(portal.listingContactFormLeads) === 1 ? '' : 's'}.` })
  if (contactChange !== null && contactChange !== undefined) insights.push({ key: 'contact-trend', tone: contactChange < 0 ? 'warning' : 'positive', title: `Portal contacts ${contactChange < 0 ? 'decreased' : contactChange > 0 ? 'increased' : 'held steady'} versus the prior period`, detail: `${Math.abs(contactChange)}% ${contactChange < 0 ? 'fewer' : contactChange > 0 ? 'more' : 'change'} portal contacts for the same number of days.` })
  if (viewsChange !== null && viewsChange !== undefined) insights.push({ key: 'views-trend', tone: viewsChange < 0 ? 'warning' : 'neutral', title: `Listing views ${viewsChange < 0 ? 'decreased' : viewsChange > 0 ? 'increased' : 'held steady'} versus the prior period`, detail: `${Math.abs(viewsChange)}% ${viewsChange < 0 ? 'fewer' : viewsChange > 0 ? 'more' : 'change'} listing views for the same number of days.` })
  return insights.slice(0, 4)
}

export function normalizeProperty24ListingPerformance(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  return {
    rows: Array.isArray(source.rows) ? source.rows.map((row) => ({
      listingNumber: text(row?.listingNumber),
      listingId: text(row?.listingId),
      title: text(row?.title) || `Property24 listing ${text(row?.listingNumber)}`,
      status: text(row?.status),
      listingViews: number(row?.listingViews),
      listingContactFormLeads: number(row?.listingContactFormLeads),
      whatsAppContactFormLeads: number(row?.whatsAppContactFormLeads),
      telephoneLeads: number(row?.telephoneLeads),
      smsLeads: number(row?.smsLeads),
      totalContactLeads: number(row?.totalContactLeads),
      contactRate: row?.contactRate === null || row?.contactRate === undefined ? null : number(row.contactRate),
    })).filter((row) => row.listingNumber) : [],
  }
}

export async function getProperty24ListingPerformance({ organisationId = '', startDate = '', endDate = '', limit = 50 } = {}) {
  const orgId = text(organisationId)
  if (!orgId || !startDate || !endDate || !isSupabaseConfigured || !supabase) return { rows: [], error: '' }
  const result = await supabase.rpc('property24_listing_performance', {
    p_organisation_id: orgId,
    p_start_date: startDate,
    p_end_date: endDate,
    p_limit: Math.max(1, Math.min(100, number(limit) || 50)),
  })
  if (result.error) return { rows: [], error: result.error.message || 'Property24 listing performance is unavailable.' }
  const analytics = normalizeProperty24ListingPerformance(result.data)
  return { rows: analytics.rows, error: '' }
}

async function fetchProperty24MarketingAnalytics({ organisationId, period }) {
  const result = await supabase.rpc('property24_marketing_analytics', {
    p_organisation_id: organisationId,
    p_start_date: isoDay(period.start),
    p_end_date: isoDay(period.end),
  })
  if (result.error) return { analytics: normalizeProperty24MarketingAnalytics(), error: result.error.message || 'Property24 portal analytics are unavailable.' }
  return { analytics: normalizeProperty24MarketingAnalytics(result.data), error: '' }
}

export async function getMarketingOverviewDashboard({ organisationId = '', range = '30d', customStart = '', customEnd = '' } = {}) {
  const orgId = text(organisationId)
  const period = resolveMarketingPeriod(range, new Date(), customStart, customEnd)
  if (!orgId || !isSupabaseConfigured || !supabase) {
    return { period, configured: false, summary: {}, leadsOverTime: [], leadSources: [], channelPerformance: [], websitePerformance: { connected: false, topPages: [], series: [] }, recentCampaigns: [], recentLeads: [] }
  }
  const since = period.comparisonStart.toISOString()
  const comparisonPeriod = { ...period, start: period.comparisonStart, end: period.comparisonEnd }
  const [leadsResult, campaignsResult, performanceResult, siteResult, property24CurrentResult, property24PreviousResult] = await Promise.all([
    supabase.from('leads').select('lead_id, lead_source, stage, status, property_interest, created_at, updated_at, contacts!leads_contact_id_fkey(first_name,last_name,email)').eq('organisation_id', orgId).gte('created_at', since).order('created_at', { ascending: false }).limit(2000),
    supabase.from('email_campaigns').select('id,name,subject,preview_text,status,scheduled_for,sent_at,created_at,updated_at,audience_filter').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(100),
    supabase.from('email_campaign_performance').select('campaign_id,recipients,delivered,opened,clicked').eq('organisation_id', orgId),
    supabase.from('website_sites').select('id').eq('organisation_id', orgId).maybeSingle(),
    fetchProperty24MarketingAnalytics({ organisationId: orgId, period }),
    fetchProperty24MarketingAnalytics({ organisationId: orgId, period: comparisonPeriod }),
  ])
  for (const result of [leadsResult, campaignsResult, performanceResult, siteResult]) {
    if (result.error) throw result.error
  }
  const leads = leadsResult.data || []
  const inPeriod = leads.filter((lead) => timeInRange(lead.created_at, period))
  const previousLeads = leads.filter((lead) => timeInRange(lead.created_at, comparisonPeriod))
  const sourceMap = new Map()
  for (const lead of inPeriod) {
    const source = normaliseMarketingLeadSource(lead.lead_source)
    const current = sourceMap.get(source.key) || { ...source, count: 0 }
    current.count += 1
    sourceMap.set(source.key, current)
  }
  const leadSources = [...sourceMap.values()].sort((a, b) => b.count - a.count).map((row) => ({ ...row, percentage: inPeriod.length ? Math.round((row.count / inPeriod.length) * 100) : 0 }))
  const campaigns = campaignsResult.data || []
  const campaignPerformance = new Map((performanceResult.data || []).map((row) => [row.campaign_id, row]))
  const currentCampaigns = campaigns.filter((campaign) => timeInRange(campaign.created_at, period))
  const activeCampaigns = campaigns.filter((campaign) => ['draft', 'scheduled', 'sending'].includes(text(campaign.status).toLowerCase())).length
  const emailReach = currentCampaigns.reduce((sum, campaign) => sum + number(campaignPerformance.get(campaign.id)?.delivered), 0)
  let websiteAnalytics = null
  let websiteAnalyticsError = ''
  const websiteRangeAvailable = period.days <= 90 && isoDay(period.end) === isoDay(new Date())
  if (siteResult.data?.id && websiteRangeAvailable) {
    const result = await supabase.rpc('website_dashboard_analytics', { p_website_site_id: siteResult.data.id, p_days: period.days })
    websiteAnalytics = result.data || null
    websiteAnalyticsError = result.error?.message || ''
  } else if (siteResult.data?.id) {
    websiteAnalyticsError = 'Website visit aggregates are currently available for ranges up to 90 days ending today.'
  }
  const websiteLeadCount = inPeriod.filter((lead) => normaliseMarketingLeadSource(lead.lead_source).key === 'website').length
  const websiteSeries = Array.isArray(websiteAnalytics?.dailyTraffic) ? websiteAnalytics.dailyTraffic : []
  const topPages = [...(websiteAnalytics?.topPages || []), ...(websiteAnalytics?.topListings || [])].slice(0, 5)
  const emailSourceLeads = leadSources.find((row) => row.key === 'email_campaign')?.count || 0
  const importedProperty24Leads = leadSources.find((row) => row.key === 'property24')?.count || 0
  const property24Current = property24CurrentResult.analytics
  const property24Previous = property24PreviousResult.analytics
  const property24Error = property24CurrentResult.error
  const property24Performance = {
    ...property24Current,
    importedProperty24Leads,
    error: property24Error,
    contactRate: percentage(property24Current.totalContactLeads, property24Current.listingViews),
    freshness: resolveProperty24StatisticsFreshness({ connected: property24Current.connected && !property24Error, lastSyncedAt: property24Current.lastSyncedAt }),
    comparison: {
      listingViews: percentageChange(property24Current.listingViews, property24Previous.listingViews),
      totalContactLeads: percentageChange(property24Current.totalContactLeads, property24Previous.totalContactLeads),
      listingContactFormLeads: percentageChange(property24Current.listingContactFormLeads, property24Previous.listingContactFormLeads),
      whatsAppContactFormLeads: percentageChange(property24Current.whatsAppContactFormLeads, property24Previous.whatsAppContactFormLeads),
    },
  }
  property24Performance.insights = deriveProperty24PerformanceInsights(property24Performance)
  const channelPerformance = [
    { key: 'website', label: 'Website', volume: websiteAnalytics ? number(websiteAnalytics.visits) : null, volumeLabel: 'Visits', engagement: '—', leads: websiteLeadCount, costPerLead: null, connected: Boolean(websiteAnalytics), note: websiteAnalyticsError || (websiteAnalytics ? '' : 'Website tracking is not connected') },
    { key: 'email', label: 'Email', volume: emailReach, volumeLabel: 'Delivered', engagement: currentCampaigns.length ? `${Math.round((currentCampaigns.reduce((sum, campaign) => sum + number(campaignPerformance.get(campaign.id)?.clicked), 0) / Math.max(1, emailReach)) * 100)}% click rate` : '—', leads: emailSourceLeads, costPerLead: null, connected: true, note: 'Open rate is not shown because privacy tools can distort it.' },
    { key: 'whatsapp', label: 'WhatsApp', volume: null, volumeLabel: 'Reach', engagement: '—', leads: leadSources.find((row) => row.key === 'whatsapp_campaign')?.count || 0, costPerLead: null, connected: false, note: 'Campaign delivery reporting is not connected yet.' },
    { key: 'property24', label: 'Property24', volume: property24Performance.listingViews, volumeLabel: 'Listing views', engagement: property24Performance.contactRate === null ? '—' : `${property24Performance.contactRate}% contact rate`, leads: property24Performance.totalContactLeads, costPerLead: null, connected: property24Performance.connected && !property24Performance.error, note: property24Performance.error || (!property24Performance.connected ? 'Not connected' : !property24Performance.lastSyncedAt ? 'Statistics awaiting first sync' : '') },
    { key: 'private-property', label: 'Private Property', volume: leadSources.find((row) => row.key === 'private_property')?.count || 0, volumeLabel: 'Imported leads', engagement: '—', leads: leadSources.find((row) => row.key === 'private_property')?.count || 0, costPerLead: null, connected: leadSources.some((row) => row.key === 'private_property'), note: leadSources.some((row) => row.key === 'private_property') ? '' : 'Not connected' },
  ]
  return {
    period, configured: true,
    summary: {
      totalLeads: metric(inPeriod.length, previousLeads.length),
      qualifiedLeads: metric(null, null, { available: false, note: 'Qualification dates are not recorded yet.' }),
      websiteVisits: metric(websiteAnalytics?.visits, null, { available: Boolean(websiteAnalytics), note: websiteAnalyticsError || 'Website tracking is not connected.' }),
      campaignReach: metric(emailReach, null, { available: true, note: 'Email delivery only; WhatsApp delivery is not connected.' }),
      activeCampaigns: metric(activeCampaigns, null),
    },
    leadsOverTime: buildLeadSeries(inPeriod, period), leadSources, channelPerformance, property24Performance,
    websitePerformance: { connected: Boolean(websiteAnalytics), error: websiteAnalyticsError, websiteLeads: websiteLeadCount, series: websiteSeries, topPages },
    recentCampaigns: campaigns.slice(0, 5).map((campaign) => ({ ...campaign, channel: 'Email', audience: readAudience(campaign), performance: campaignPerformance.get(campaign.id) || {} })),
    recentLeads: inPeriod.slice(0, 5).map((lead) => ({ id: lead.lead_id, name: displayLead(lead), source: normaliseMarketingLeadSource(lead.lead_source), enquiry: text(lead.property_interest) || 'General enquiry', createdAt: lead.created_at, stage: text(lead.stage || lead.status) })),
  }
}
