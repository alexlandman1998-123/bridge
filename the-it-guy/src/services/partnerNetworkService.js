import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { getOrganizationTypeLabel, normalizeOrganizationType } from './organizationService'

export const PARTNER_CONNECTION_STATUSES = Object.freeze({
  pending: 'pending',
  connected: 'connected',
  declined: 'declined',
  blocked: 'blocked',
  removed: 'removed',
})

export const RELATIONSHIP_TYPE_LABELS = Object.freeze({
  agency_attorney: 'Agency to Attorney',
  agency_bond_originator: 'Agency to Bond Originator',
  agency_developer: 'Agency to Developer',
  developer_attorney: 'Developer to Attorney',
  developer_bond_originator: 'Developer to Bond Originator',
  other: 'Partner Relationship',
})

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for partner connections.')
  }
  return supabase
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

export function normalizeConnectionStatus(value) {
  const normalized = normalizeLower(value)
  if (normalized === 'accepted' || normalized === 'approved') return PARTNER_CONNECTION_STATUSES.connected
  if (normalized === 'rejected') return PARTNER_CONNECTION_STATUSES.declined
  if (Object.values(PARTNER_CONNECTION_STATUSES).includes(normalized)) return normalized
  return PARTNER_CONNECTION_STATUSES.pending
}

export function getPartnerRoleTypeForOrganizationType(value) {
  const organizationType = normalizeOrganizationType(value)
  if (organizationType === 'attorney_firm') return 'transfer_attorney'
  if (organizationType === 'bond_originator') return 'bond_originator'
  if (organizationType === 'developer') return 'developer'
  return 'other'
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function assertRpcSuccess(result, fallbackMessage) {
  if (result.error) throw result.error
  if (result.data?.success === false) {
    throw new Error(result.data.code || fallbackMessage)
  }
  return result.data || {}
}

export function toPartnerConnection(row = {}) {
  const partnerOrganizationType = normalizeOrganizationType(
    row.partner_organization_type || row.partnerOrganizationType || row.organization_type || row.organizationType,
  )
  const status = normalizeConnectionStatus(row.status || row.connection_status || row.connectionStatus)
  const relationshipType = normalizeLower(row.relationship_type || row.relationshipType) || 'other'
  return {
    id: row.id || row.connection_id || row.connectionId || '',
    sourceOrganizationId: row.source_organization_id || row.sourceOrganizationId || null,
    targetOrganizationId: row.target_organization_id || row.targetOrganizationId || null,
    partnerOrganizationId: row.partner_organization_id || row.partnerOrganizationId || row.id || null,
    partnerName: normalizeText(row.partner_display_name || row.partnerDisplayName || row.partner_name || row.partnerName || row.name),
    partnerType: partnerOrganizationType,
    partnerTypeLabel: getOrganizationTypeLabel(partnerOrganizationType),
    partnerSubtype: normalizeText(row.partner_organization_subtype || row.partnerOrganizationSubtype || row.organization_subtype || row.organizationSubtype),
    partnerRoleType: getPartnerRoleTypeForOrganizationType(partnerOrganizationType),
    relationshipType,
    relationshipTypeLabel: RELATIONSHIP_TYPE_LABELS[relationshipType] || RELATIONSHIP_TYPE_LABELS.other,
    status,
    direction: normalizeLower(row.direction) || 'outgoing',
    isPreferred: row.is_preferred === true || row.isPreferred === true,
    sourcePreferred: row.source_preferred === true || row.sourcePreferred === true,
    targetPreferred: row.target_preferred === true || row.targetPreferred === true,
    transactionCount: toNumber(row.transaction_count || row.transactionCount),
    activeTransactionCount: toNumber(row.active_transaction_count || row.activeTransactionCount),
    completedTransactionCount: toNumber(row.completed_transaction_count || row.completedTransactionCount),
    firstTransactionDate: row.first_transaction_date || row.firstTransactionDate || null,
    lastTransactionDate: row.last_transaction_date || row.lastTransactionDate || null,
    createdAt: row.created_at || row.createdAt || null,
    acceptedAt: row.accepted_at || row.acceptedAt || null,
  }
}

export function toPartnerCandidate(row = {}) {
  const organizationType = normalizeOrganizationType(row.organization_type || row.organizationType || row.type)
  return {
    id: row.id || row.organization_id || row.organizationId || '',
    name: normalizeText(row.display_name || row.displayName || row.name),
    type: organizationType,
    typeLabel: getOrganizationTypeLabel(organizationType),
    subtype: normalizeText(row.organization_subtype || row.organizationSubtype),
    status: normalizeLower(row.status) || 'active',
    website: normalizeText(row.website),
    connectionId: row.connection_id || row.connectionId || null,
    connectionStatus: row.connection_status || row.connectionStatus ? normalizeConnectionStatus(row.connection_status || row.connectionStatus) : '',
    connectionDirection: normalizeLower(row.connection_direction || row.connectionDirection),
    connectionCount: toNumber(row.connection_count || row.connectionCount),
  }
}

export function toTransactionPartnerOption(connection = {}) {
  const normalized = connection.partnerName ? connection : toPartnerConnection(connection)
  return {
    id: `partner-connection:${normalized.id}`,
    source: 'partner_connection',
    connectionId: normalized.id,
    relationshipId: null,
    relationshipType: normalized.isPreferred ? 'preferred' : 'connected',
    companyName: normalized.partnerName,
    email: '',
    organisationId: normalized.partnerOrganizationId,
    partnerOrganisationId: normalized.partnerOrganizationId,
    partnerOrganizationId: normalized.partnerOrganizationId,
    partnerRoleType: normalized.partnerRoleType,
    preferred: normalized.isPreferred,
    transactionCount: normalized.transactionCount,
    activeTransactionCount: normalized.activeTransactionCount,
    completedTransactionCount: normalized.completedTransactionCount,
  }
}

export async function listPartnerConnections(organizationId) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase4_list_partner_connections', {
    p_organization_id: organizationId,
  })
  if (result.error) {
    if (result.error.code === '42883') return { connections: [], recommendations: [], canManage: false }
    throw result.error
  }
  const data = assertRpcSuccess(result, 'Unable to load partner connections.')
  return {
    connections: (Array.isArray(data.connections) ? data.connections : []).map(toPartnerConnection),
    recommendations: (Array.isArray(data.recommendations) ? data.recommendations : []).map(toPartnerCandidate),
    canManage: data.canManage === true,
  }
}

export async function searchPartnerConnectionCandidates({ organizationId, query = '', organizationType = '' } = {}) {
  const client = requireClient()
  const safeQuery = normalizeText(query)
  if (!organizationId) throw new Error('Organization is required.')
  if (safeQuery.length < 2) return []
  const result = await client.rpc('bridge_phase4_search_partner_candidates', {
    p_organization_id: organizationId,
    p_query: safeQuery,
    p_organization_type: organizationType ? normalizeOrganizationType(organizationType) : null,
  })
  const data = assertRpcSuccess(result, 'Unable to search partner organizations.')
  return (Array.isArray(data.organizations) ? data.organizations : []).map(toPartnerCandidate)
}

export async function requestPartnerConnection({ sourceOrganizationId, targetOrganizationId, message = '' } = {}) {
  const client = requireClient()
  if (!sourceOrganizationId) throw new Error('Source organization is required.')
  if (!targetOrganizationId) throw new Error('Target organization is required.')
  const result = await client.rpc('bridge_phase4_request_partner_connection', {
    p_source_organization_id: sourceOrganizationId,
    p_target_organization_id: targetOrganizationId,
    p_message: normalizeText(message) || null,
  })
  const data = assertRpcSuccess(result, 'Unable to request partner connection.')
  return toPartnerConnection(data.connection || {})
}

export async function reviewPartnerConnection({ connectionId, action } = {}) {
  const client = requireClient()
  if (!connectionId) throw new Error('Connection is required.')
  const result = await client.rpc('bridge_phase4_review_partner_connection', {
    p_connection_id: connectionId,
    p_action: action,
  })
  const data = assertRpcSuccess(result, 'Unable to update partner connection.')
  return toPartnerConnection(data.connection || {})
}

export async function setPartnerConnectionPreferred({ organizationId, connectionId, preferred } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  if (!connectionId) throw new Error('Connection is required.')
  const result = await client.rpc('bridge_phase4_set_partner_preferred', {
    p_organization_id: organizationId,
    p_connection_id: connectionId,
    p_preferred: Boolean(preferred),
  })
  const data = assertRpcSuccess(result, 'Unable to update preferred partner.')
  return toPartnerConnection(data.connection || {})
}

export async function removePartnerConnection({ organizationId, connectionId } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  if (!connectionId) throw new Error('Connection is required.')
  const result = await client.rpc('bridge_phase4_remove_partner_connection', {
    p_organization_id: organizationId,
    p_connection_id: connectionId,
  })
  const data = assertRpcSuccess(result, 'Unable to remove partner connection.')
  return toPartnerConnection(data.connection || {})
}

export async function listTransactionPartnerConnectionOptions({ organizationId, roleType } = {}) {
  if (!organizationId) return []
  const { connections } = await listPartnerConnections(organizationId)
  return connections
    .filter((connection) => connection.status === PARTNER_CONNECTION_STATUSES.connected)
    .filter((connection) => !roleType || connection.partnerRoleType === roleType)
    .sort((left, right) => {
      if (left.isPreferred !== right.isPreferred) return left.isPreferred ? -1 : 1
      return right.transactionCount - left.transactionCount || left.partnerName.localeCompare(right.partnerName)
    })
    .map(toTransactionPartnerOption)
}

export const __partnerNetworkServiceTestUtils = {
  toPartnerCandidate,
  toPartnerConnection,
  toTransactionPartnerOption,
}
