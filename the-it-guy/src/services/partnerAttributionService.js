import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import {
  PARTNER_PROFILE_ACCESS_DENIED_MESSAGE,
  PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE,
  resolveBondPartnerProfileRelationshipId,
} from './bondPartnerProfileService'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeNullableUuid(value = '') {
  const normalized = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null
}

function createProfileError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data?.user || null
}

async function assertRpcReady(relationshipId = '') {
  if (!isSupabaseConfigured || !supabase) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_configured')
  }

  const currentUser = await getCurrentUser()
  if (!currentUser?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  return resolveBondPartnerProfileRelationshipId(relationshipId)
}

function handleProfileRpcError(payload = {}) {
  if (payload?.error_code === 'not_accepted') {
    throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
  }

  if (payload?.error_code === 'permission_denied') {
    throw createProfileError('Attribution visibility has not been granted for this relationship.', 'permission_denied')
  }

  if (payload?.error_code) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }
}

function normalizePermissions(value = {}) {
  return {
    canViewAttribution: value.can_view_attribution === true || value.canViewAttribution === true,
    canViewPartnerRevenue: value.can_view_partner_revenue === true || value.canViewPartnerRevenue === true,
  }
}

function normalizeKpis(value = {}) {
  return {
    attributedLeads: Number(value.attributed_leads || value.attributedLeads || 0) || 0,
    attributedApplications: Number(value.attributed_applications || value.attributedApplications || 0) || 0,
    attributedRevenue: Number(value.attributed_revenue || value.attributedRevenue || 0) || 0,
    conversionRate: Number(value.conversion_rate || value.conversionRate || 0) || 0,
  }
}

function normalizeFunnelRow(row = {}) {
  return {
    key: normalizeText(row.key),
    label: normalizeText(row.label) || 'Stage',
    count: Number(row.count || 0) || 0,
  }
}

function normalizePartnerRoi(value = {}) {
  return {
    partnerName: normalizeText(value.partner_name || value.partnerName) || 'Partner',
    applications: Number(value.applications || 0) || 0,
    approvals: Number(value.approvals || 0) || 0,
    revenue: Number(value.revenue || 0) || 0,
    roiScore: Number(value.roi_score || value.roiScore || 0) || 0,
  }
}

function normalizeRevenueIntelligence(value = {}) {
  return {
    revenueThisMonth: Number(value.revenue_this_month || value.revenueThisMonth || 0) || 0,
    revenueLastMonth: Number(value.revenue_last_month || value.revenueLastMonth || 0) || 0,
    growth: Number(value.growth || 0) || 0,
    projectedRevenue: Number(value.projected_revenue || value.projectedRevenue || 0) || 0,
    totalRevenue: Number(value.total_revenue || value.totalRevenue || 0) || 0,
  }
}

function normalizeRevenueTrend(row = {}) {
  return {
    month: normalizeText(row.month),
    revenue: Number(row.revenue || 0) || 0,
  }
}

function normalizeAttributionSummary(payload = {}) {
  const permissions = normalizePermissions(payload.permissions)
  return {
    relationshipId: normalizeText(payload.relationship_id || payload.relationshipId),
    partnerOrganisationId: normalizeText(payload.partner_organisation_id || payload.partnerOrganisationId),
    permissions,
    kpis: normalizeKpis(payload.kpis),
    funnel: Array.isArray(payload.funnel) ? payload.funnel.map(normalizeFunnelRow) : [],
    partnerRoi: normalizePartnerRoi(payload.partner_roi || payload.partnerRoi),
    revenueIntelligence: normalizeRevenueIntelligence(payload.revenue_intelligence || payload.revenueIntelligence),
    revenueTrend: Array.isArray(payload.revenue_trend) ? payload.revenue_trend.map(normalizeRevenueTrend) : [],
  }
}

function normalizeCampaignPerformanceRow(row = {}) {
  return {
    campaignId: normalizeText(row.campaign_id || row.campaignId),
    campaignName: normalizeText(row.campaign_name || row.campaignName) || 'Campaign',
    campaignType: normalizeText(row.campaign_type || row.campaignType),
    status: normalizeText(row.status) || 'active',
    listingsPromoted: Number(row.listings_promoted || row.listingsPromoted || 0) || 0,
    applicationsGenerated: Number(row.applications_generated || row.applicationsGenerated || 0) || 0,
    approvals: Number(row.approvals || 0) || 0,
    revenueGenerated: Number(row.revenue_generated || row.revenueGenerated || 0) || 0,
  }
}

function normalizeCampaignPerformance(payload = {}) {
  return {
    relationshipId: normalizeText(payload.relationship_id || payload.relationshipId),
    permissions: normalizePermissions(payload.permissions),
    campaigns: Array.isArray(payload.campaigns) ? payload.campaigns.map(normalizeCampaignPerformanceRow) : [],
  }
}

function normalizeListingAttributionRow(row = {}) {
  return {
    listingId: normalizeText(row.listing_id || row.listingId),
    title: normalizeText(row.title) || 'Shared listing',
    listingViews: Number(row.listing_views || row.listingViews || 0) || 0,
    financeCtaClicks: Number(row.finance_cta_clicks || row.financeCtaClicks || 0) || 0,
    applicationsGenerated: Number(row.applications_generated || row.applicationsGenerated || 0) || 0,
    approvals: Number(row.approvals || 0) || 0,
    revenueGenerated: Number(row.revenue_generated || row.revenueGenerated || 0) || 0,
  }
}

function normalizeListingAttribution(payload = {}) {
  const listings = Array.isArray(payload.listings) ? payload.listings.map(normalizeListingAttributionRow) : []
  return {
    relationshipId: normalizeText(payload.relationship_id || payload.relationshipId),
    permissions: normalizePermissions(payload.permissions),
    listings,
    byListingId: listings.reduce((accumulator, row) => {
      if (row.listingId) accumulator[row.listingId] = row
      return accumulator
    }, {}),
  }
}

export async function trackAttributionEvent(options = {}) {
  const relationshipId = await assertRpcReady(options.relationshipId)

  const { data, error } = await supabase.rpc('track_partner_attribution_event_phase6', {
    p_relationship_id: relationshipId,
    p_campaign_id: normalizeNullableUuid(options.campaignId),
    p_listing_id: normalizeNullableUuid(options.listingId),
    p_application_id: normalizeNullableUuid(options.applicationId),
    p_transaction_id: normalizeNullableUuid(options.transactionId),
    p_lead_id: normalizeNullableUuid(options.leadId),
    p_event_type: normalizeText(options.eventType),
    p_event_value: options.eventValue === null || options.eventValue === undefined ? null : Number(options.eventValue),
  })

  if (error) throw error
  handleProfileRpcError(data)
  return data?.event || null
}

export async function getPartnerAttributionSummary(relationshipId = '') {
  const safeRelationshipId = await assertRpcReady(relationshipId)

  const { data, error } = await supabase.rpc('get_partner_attribution_summary_phase6', {
    p_relationship_id: safeRelationshipId,
  })

  if (error) throw error
  handleProfileRpcError(data)
  return normalizeAttributionSummary(data)
}

export async function getPartnerRevenueSummary(relationshipId = '') {
  const safeRelationshipId = await assertRpcReady(relationshipId)

  const { data, error } = await supabase.rpc('get_partner_revenue_summary_phase6', {
    p_relationship_id: safeRelationshipId,
  })

  if (error) throw error
  handleProfileRpcError(data)
  return normalizeAttributionSummary(data)
}

export async function getCampaignPerformance(relationshipId = '') {
  const safeRelationshipId = await assertRpcReady(relationshipId)

  const { data, error } = await supabase.rpc('get_campaign_performance_phase6', {
    p_relationship_id: safeRelationshipId,
  })

  if (error) throw error
  handleProfileRpcError(data)
  return normalizeCampaignPerformance(data)
}

export async function getListingAttribution(relationshipId = '') {
  const safeRelationshipId = await assertRpcReady(relationshipId)

  const { data, error } = await supabase.rpc('get_listing_attribution_phase6', {
    p_relationship_id: safeRelationshipId,
  })

  if (error) throw error
  handleProfileRpcError(data)
  return normalizeListingAttribution(data)
}
