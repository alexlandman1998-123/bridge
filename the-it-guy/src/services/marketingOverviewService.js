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

export async function getMarketingOverviewDashboard({ organisationId = '', range = '30d', customStart = '', customEnd = '' } = {}) {
  const orgId = text(organisationId)
  const period = resolveMarketingPeriod(range, new Date(), customStart, customEnd)
  if (!orgId || !isSupabaseConfigured || !supabase) {
    return { period, configured: false, summary: {}, leadsOverTime: [], leadSources: [], channelPerformance: [], websitePerformance: { connected: false, topPages: [], series: [] }, recentCampaigns: [], recentLeads: [] }
  }
  const since = period.comparisonStart.toISOString()
  const [leadsResult, campaignsResult, performanceResult, siteResult] = await Promise.all([
    supabase.from('leads').select('lead_id, lead_source, stage, status, property_interest, created_at, updated_at, contacts!leads_contact_id_fkey(first_name,last_name,email)').eq('organisation_id', orgId).gte('created_at', since).order('created_at', { ascending: false }).limit(2000),
    supabase.from('email_campaigns').select('id,name,subject,preview_text,status,scheduled_for,sent_at,created_at,updated_at,audience_filter').eq('organisation_id', orgId).order('updated_at', { ascending: false }).limit(100),
    supabase.from('email_campaign_performance').select('campaign_id,recipients,delivered,opened,clicked').eq('organisation_id', orgId),
    supabase.from('website_sites').select('id').eq('organisation_id', orgId).maybeSingle(),
  ])
  for (const result of [leadsResult, campaignsResult, performanceResult, siteResult]) {
    if (result.error) throw result.error
  }
  const leads = leadsResult.data || []
  const inPeriod = leads.filter((lead) => timeInRange(lead.created_at, period))
  const comparisonPeriod = { ...period, start: period.comparisonStart, end: period.comparisonEnd }
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
  const channelPerformance = [
    { key: 'website', label: 'Website', volume: websiteAnalytics ? number(websiteAnalytics.visits) : null, volumeLabel: 'Visits', engagement: '—', leads: websiteLeadCount, costPerLead: null, connected: Boolean(websiteAnalytics), note: websiteAnalyticsError || (websiteAnalytics ? '' : 'Website tracking is not connected') },
    { key: 'email', label: 'Email', volume: emailReach, volumeLabel: 'Delivered', engagement: currentCampaigns.length ? `${Math.round((currentCampaigns.reduce((sum, campaign) => sum + number(campaignPerformance.get(campaign.id)?.clicked), 0) / Math.max(1, emailReach)) * 100)}% click rate` : '—', leads: emailSourceLeads, costPerLead: null, connected: true, note: 'Open rate is not shown because privacy tools can distort it.' },
    { key: 'whatsapp', label: 'WhatsApp', volume: null, volumeLabel: 'Reach', engagement: '—', leads: leadSources.find((row) => row.key === 'whatsapp_campaign')?.count || 0, costPerLead: null, connected: false, note: 'Campaign delivery reporting is not connected yet.' },
    { key: 'property24', label: 'Property24', volume: leadSources.find((row) => row.key === 'property24')?.count || 0, volumeLabel: 'Imported leads', engagement: '—', leads: leadSources.find((row) => row.key === 'property24')?.count || 0, costPerLead: null, connected: leadSources.some((row) => row.key === 'property24'), note: leadSources.some((row) => row.key === 'property24') ? '' : 'Not connected' },
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
    leadsOverTime: buildLeadSeries(inPeriod, period), leadSources, channelPerformance,
    websitePerformance: { connected: Boolean(websiteAnalytics), error: websiteAnalyticsError, websiteLeads: websiteLeadCount, series: websiteSeries, topPages },
    recentCampaigns: campaigns.slice(0, 5).map((campaign) => ({ ...campaign, channel: 'Email', audience: readAudience(campaign), performance: campaignPerformance.get(campaign.id) || {} })),
    recentLeads: inPeriod.slice(0, 5).map((lead) => ({ id: lead.lead_id, name: displayLead(lead), source: normaliseMarketingLeadSource(lead.lead_source), enquiry: text(lead.property_interest) || 'General enquiry', createdAt: lead.created_at, stage: text(lead.stage || lead.status) })),
  }
}
