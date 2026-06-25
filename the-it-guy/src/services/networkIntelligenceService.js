import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getOrganizationTypeLabel, normalizeOrganizationType } from './organizationService'
import { RELATIONSHIP_TYPE_LABELS } from './partnerNetworkService'

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for network intelligence.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function toInteger(value) {
  return Math.round(toNumber(value))
}

function assertRpcSuccess(result, fallbackMessage) {
  if (result.error) throw result.error
  if (result.data?.success === false) {
    throw new Error(result.data.code || fallbackMessage)
  }
  return result.data || {}
}

export function formatCurrency(value) {
  const amount = toNumber(value)
  if (!amount) return 'R0'
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatDuration(value, unit = 'days') {
  const amount = toNumber(value)
  if (!amount) return 'Not yet'
  const rounded = amount >= 10 ? Math.round(amount) : Math.round(amount * 10) / 10
  return `${rounded}${unit === 'hours' ? 'h' : 'd'}`
}

export function getRelationshipMilestone(transactionCount) {
  const count = toInteger(transactionCount)
  if (count >= 100) return '100 transactions together'
  if (count >= 50) return '50 transactions together'
  if (count >= 25) return '25 transactions together'
  if (count >= 10) return '10 transactions together'
  if (count > 0) return `${count} transaction${count === 1 ? '' : 's'} together`
  return 'New relationship'
}

export function toNetworkRelationship(row = {}) {
  const partnerType = normalizeOrganizationType(row.partner_organization_type || row.partnerOrganizationType)
  const relationshipType = normalizeText(row.relationship_type || row.relationshipType || 'other')
  const transactionCount = toInteger(row.transaction_count || row.transactionCount)

  return {
    id: row.id || '',
    sourceOrganizationId: row.source_organization_id || row.sourceOrganizationId || null,
    targetOrganizationId: row.target_organization_id || row.targetOrganizationId || null,
    relationshipType,
    relationshipTypeLabel: RELATIONSHIP_TYPE_LABELS[relationshipType] || RELATIONSHIP_TYPE_LABELS.other,
    direction: normalizeText(row.direction || 'outgoing'),
    partnerOrganizationId: row.partner_organization_id || row.partnerOrganizationId || null,
    partnerName: normalizeText(row.partner_display_name || row.partnerDisplayName || row.partner_name || row.partnerName),
    partnerType,
    partnerTypeLabel: getOrganizationTypeLabel(partnerType),
    partnerSubtype: normalizeText(row.partner_organization_subtype || row.partnerOrganizationSubtype),
    transactionCount,
    activeTransactionCount: toInteger(row.active_transaction_count || row.activeTransactionCount),
    completedTransactionCount: toInteger(row.completed_transaction_count || row.completedTransactionCount),
    completionRate: toNumber(row.completion_rate || row.completionRate),
    averageCycleTime: toNumber(row.average_cycle_time || row.averageCycleTime),
    averageResponseTime: toNumber(row.average_response_time || row.averageResponseTime),
    referralVolume: toNumber(row.referral_volume || row.referralVolume),
    relationshipHealthScore: toInteger(row.relationship_health_score || row.relationshipHealthScore),
    firstTransactionDate: row.first_transaction_date || row.firstTransactionDate || null,
    lastTransactionDate: row.last_transaction_date || row.lastTransactionDate || null,
    milestone: getRelationshipMilestone(transactionCount),
  }
}

export function toReferralMetric(row = {}) {
  const organizationType = normalizeOrganizationType(row.organization_type || row.organizationType)
  return {
    organizationId: row.organization_id || row.organizationId || row.id || '',
    organizationName: normalizeText(row.organization_display_name || row.organizationDisplayName || row.organization_name || row.organizationName || row.name),
    organizationType,
    organizationTypeLabel: getOrganizationTypeLabel(organizationType),
    transactionCount: toInteger(row.transaction_count || row.transactionCount),
    activeTransactionCount: toInteger(row.active_transaction_count || row.activeTransactionCount),
    relationshipHealthScore: toInteger(row.relationship_health_score || row.relationshipHealthScore),
    referralVolume: toNumber(row.referral_volume || row.referralVolume),
  }
}

export function toPartnerSuggestion(row = {}) {
  const organizationType = normalizeOrganizationType(row.organization_type || row.organizationType)
  return {
    id: row.id || row.organization_id || row.organizationId || '',
    name: normalizeText(row.display_name || row.displayName || row.name),
    organizationType,
    organizationTypeLabel: getOrganizationTypeLabel(organizationType),
    organizationSubtype: normalizeText(row.organization_subtype || row.organizationSubtype),
    networkSignal: toInteger(row.network_signal || row.networkSignal),
    reason: normalizeText(row.reason) || 'Suggested from Arch9 network activity',
  }
}

export function toNetworkOpportunity(row = {}) {
  const roleType = normalizeText(row.role_type || row.roleType || 'other')
  const invitations = toInteger(row.invitation_count || row.invitationCount)
  const accepted = toInteger(row.accepted_invitation_count || row.acceptedInvitationCount)
  return {
    id: row.id || '',
    partnerProspectId: row.partner_prospect_id || row.partnerProspectId || null,
    roleType,
    companyName: normalizeText(row.company_name || row.companyName),
    status: normalizeText(row.status || 'pending'),
    transactionsWaiting: toInteger(row.transactions_waiting || row.transactionsWaiting),
    agenciesCount: toInteger(row.agencies_count || row.agenciesCount),
    invitationCount: invitations,
    acceptedInvitationCount: accepted,
    conversionRate: invitations ? accepted / invitations : toNumber(row.conversion_rate || row.conversionRate),
    opportunityScore: toInteger(row.opportunity_score || row.opportunityScore),
    lastSelectedAt: row.last_selected_at || row.lastSelectedAt || null,
  }
}

export function toNetworkSummary(row = {}) {
  return {
    networkSize: toInteger(row.networkSize || row.network_size),
    connectedAgencies: toInteger(row.connectedAgencies || row.connected_agencies),
    connectedAttorneys: toInteger(row.connectedAttorneys || row.connected_attorneys),
    connectedOriginators: toInteger(row.connectedOriginators || row.connected_originators),
    connectedDevelopers: toInteger(row.connectedDevelopers || row.connected_developers),
    transactionCount: toInteger(row.transactionCount || row.transaction_count),
    activeTransactionCount: toInteger(row.activeTransactionCount || row.active_transaction_count),
    completedTransactionCount: toInteger(row.completedTransactionCount || row.completed_transaction_count),
    referralVolume: toNumber(row.referralVolume || row.referral_volume),
    averageCycleTime: toNumber(row.averageCycleTime || row.average_cycle_time),
    averageResponseTime: toNumber(row.averageResponseTime || row.average_response_time),
    averageRelationshipScore: toInteger(row.averageRelationshipScore || row.average_relationship_score),
  }
}

export async function getNetworkIntelligence(organizationId) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase7_get_network_intelligence', {
    p_organization_id: organizationId,
  })
  if (result.error) {
    if (result.error.code === '42883') {
      return {
        summary: toNetworkSummary(),
        relationships: [],
        topReferrers: [],
        mostUsedPartners: [],
        suggestions: [],
      }
    }
    throw result.error
  }
  const data = assertRpcSuccess(result, 'Unable to load network intelligence.')
  return {
    summary: toNetworkSummary(data.summary || {}),
    relationships: (Array.isArray(data.relationships) ? data.relationships : []).map(toNetworkRelationship),
    topReferrers: (Array.isArray(data.topReferrers) ? data.topReferrers : []).map(toReferralMetric),
    mostUsedPartners: (Array.isArray(data.mostUsedPartners) ? data.mostUsedPartners : []).map(toReferralMetric),
    suggestions: (Array.isArray(data.suggestions) ? data.suggestions : []).map(toPartnerSuggestion),
  }
}

export async function getNetworkGrowthDashboard() {
  const client = requireClient()
  const result = await client.rpc('bridge_phase7_get_growth_dashboard')
  const data = assertRpcSuccess(result, 'Unable to load growth dashboard.')
  return {
    summary: {
      pendingOpportunities: toInteger(data.summary?.pendingOpportunities || data.summary?.pending_opportunities),
      convertedOpportunities: toInteger(data.summary?.convertedOpportunities || data.summary?.converted_opportunities),
      transactionsWaiting: toInteger(data.summary?.transactionsWaiting || data.summary?.transactions_waiting),
      averageConversionRate: toNumber(data.summary?.averageConversionRate || data.summary?.average_conversion_rate),
    },
    opportunities: (Array.isArray(data.opportunities) ? data.opportunities : []).map(toNetworkOpportunity),
  }
}

export const __networkIntelligenceServiceTestUtils = {
  toNetworkOpportunity,
  toNetworkRelationship,
  toNetworkSummary,
  toPartnerSuggestion,
  toReferralMetric,
  formatCurrency,
  formatDuration,
  getRelationshipMilestone,
}
