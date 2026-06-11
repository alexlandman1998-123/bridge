import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

export const ORGANIZATION_TYPES = Object.freeze({
  agency: 'agency',
  attorneyFirm: 'attorney_firm',
  bondOriginator: 'bond_originator',
  developer: 'developer',
  serviceProvider: 'service_provider',
})

export const ORGANIZATION_TYPE_LABELS = Object.freeze({
  agency: 'Agency',
  attorney_firm: 'Attorney Firm',
  bond_originator: 'Bond Originator',
  developer: 'Developer',
  service_provider: 'Service Provider',
})

export const ORGANIZATION_SUBTYPE_OPTIONS = Object.freeze({
  attorney_firm: [
    { value: 'transfer_attorney', label: 'Transfer Attorney' },
    { value: 'bond_attorney', label: 'Bond Attorney' },
    { value: 'transfer_bond_attorney', label: 'Transfer + Bond Attorney' },
  ],
  bond_originator: [
    { value: 'independent', label: 'Independent' },
    { value: 'branch', label: 'Branch' },
    { value: 'head_office', label: 'Head Office' },
  ],
})

export const ORGANIZATION_ROLE_LABELS = Object.freeze({
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  principal: 'Owner',
  super_admin: 'Owner',
  director: 'Owner',
  partner: 'Owner',
  viewer: 'Member',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured for organizations.')
  }
  return supabase
}

export function normalizeOrganizationType(value) {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (normalized === 'estate_agency' || normalized === 'real_estate_agency') return 'agency'
  if (normalized === 'attorney' || normalized === 'attorneys' || normalized === 'attorney_firm' || normalized === 'conveyancer') return 'attorney_firm'
  if (normalized === 'bond' || normalized === 'bond_originator' || normalized === 'originator') return 'bond_originator'
  if (normalized === 'developer_company' || normalized === 'development') return 'developer'
  if (Object.values(ORGANIZATION_TYPES).includes(normalized)) return normalized
  return 'service_provider'
}

export function getOrganizationTypeLabel(value) {
  return ORGANIZATION_TYPE_LABELS[normalizeOrganizationType(value)] || ORGANIZATION_TYPE_LABELS.service_provider
}

export function normalizeOrganizationRole(value) {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (['owner', 'principal', 'super_admin', 'director', 'partner'].includes(normalized)) return 'owner'
  if (['admin', 'administrator', 'manager'].includes(normalized)) return 'admin'
  return 'member'
}

function toOrganization(row = {}) {
  const organizationType = normalizeOrganizationType(row.organization_type || row.organizationType || row.type)
  return {
    id: row.id || row.organization_id || row.organisation_id || '',
    name: normalizeText(row.name || row.display_name || row.displayName),
    displayName: normalizeText(row.display_name || row.displayName || row.name),
    type: organizationType,
    typeLabel: getOrganizationTypeLabel(organizationType),
    subtype: normalizeText(row.organization_subtype || row.organizationSubtype),
    status: normalizeLower(row.status) || 'active',
    description: normalizeText(row.description),
    website: normalizeText(row.website),
    email: normalizeText(row.email || row.company_email || row.companyEmail).toLowerCase(),
    phone: normalizeText(row.phone || row.company_phone || row.companyPhone),
    logoUrl: normalizeText(row.logo_url || row.logoUrl),
    membershipId: row.membership_id || row.membershipId || null,
    membershipStatus: normalizeLower(row.membership_status || row.membershipStatus) || 'active',
    organizationRole: normalizeOrganizationRole(row.organization_role || row.organizationRole),
    organizationRoleLabel: ORGANIZATION_ROLE_LABELS[normalizeOrganizationRole(row.organization_role || row.organizationRole)] || 'Member',
    memberCount: Number(row.member_count || row.memberCount || 0),
    pendingRequests: Number(row.pending_requests || row.pendingRequests || 0),
    transactionCount: Number(row.transaction_count || row.transactionCount || 0),
    joinedAt: row.joined_at || row.joinedAt || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

function toMember(row = {}) {
  const role = normalizeOrganizationRole(row.organization_role || row.organizationRole)
  return {
    id: row.id || '',
    userId: row.user_id || row.userId || null,
    firstName: normalizeText(row.first_name || row.firstName),
    lastName: normalizeText(row.last_name || row.lastName),
    fullName: normalizeText(row.full_name || row.fullName) || normalizeText(`${row.first_name || ''} ${row.last_name || ''}`) || normalizeText(row.email) || 'Member',
    email: normalizeText(row.email).toLowerCase(),
    membershipStatus: normalizeLower(row.membership_status || row.membershipStatus) || 'pending',
    organizationRole: role,
    organizationRoleLabel: ORGANIZATION_ROLE_LABELS[role] || 'Member',
    requestMessage: normalizeText(row.request_message || row.requestMessage),
    requestedAt: row.requested_at || row.requestedAt || null,
    joinedAt: row.joined_at || row.joinedAt || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  }
}

function toEvent(row = {}) {
  return {
    id: row.id || '',
    eventType: normalizeText(row.event_type || row.eventType),
    eventData: row.event_data || row.eventData || {},
    actorUserId: row.actor_user_id || row.actorUserId || null,
    targetUserId: row.target_user_id || row.targetUserId || null,
    partnerProspectId: row.partner_prospect_id || row.partnerProspectId || null,
    transactionId: row.transaction_id || row.transactionId || null,
    createdAt: row.created_at || row.createdAt || null,
  }
}

function toProspect(row = {}) {
  return {
    id: row.id || '',
    companyName: normalizeText(row.company_name || row.companyName),
    contactName: normalizeText(row.contact_name || row.contactName),
    email: normalizeText(row.email).toLowerCase(),
    roleType: normalizeText(row.role_type || row.roleType),
    status: normalizeText(row.status) || 'invited',
    transactionCount: Number(row.transaction_count || row.transactionCount || 0),
    lastTransactionDate: row.last_transaction_date || row.lastTransactionDate || null,
    organizationId: row.organisation_id || row.organization_id || row.organizationId || null,
  }
}

function assertRpcSuccess(result, fallbackMessage) {
  if (result.error) throw result.error
  if (result.data?.success === false) {
    throw new Error(result.data.code || fallbackMessage)
  }
  return result.data
}

export async function listMyOrganizations() {
  const client = requireClient()
  const result = await client.rpc('bridge_phase3_list_my_organizations')
  if (result.error) {
    if (result.error.code === '42883') return []
    throw result.error
  }
  return (Array.isArray(result.data) ? result.data : []).map(toOrganization)
}

export async function searchOrganizations({ query = '', organizationType = '' } = {}) {
  const client = requireClient()
  const safeQuery = normalizeText(query)
  if (safeQuery.length < 2) return []
  const result = await client.rpc('bridge_phase3_search_organizations', {
    p_query: safeQuery,
    p_organization_type: organizationType ? normalizeOrganizationType(organizationType) : null,
  })
  if (result.error) throw result.error
  return (Array.isArray(result.data) ? result.data : []).map(toOrganization)
}

export async function findMatchingProspectsForOrganization({ name = '', organizationType = '' } = {}) {
  const client = requireClient()
  if (!normalizeText(name)) return []
  const result = await client.rpc('bridge_phase3_find_matching_prospects', {
    p_name: normalizeText(name),
    p_organization_type: organizationType ? normalizeOrganizationType(organizationType) : null,
  })
  if (result.error) {
    if (result.error.code === '42883') return []
    throw result.error
  }
  return (Array.isArray(result.data) ? result.data : []).map(toProspect)
}

export async function createOrganization(input = {}) {
  const client = requireClient()
  const payload = {
    name: normalizeText(input.name),
    organization_type: normalizeOrganizationType(input.organizationType || input.organization_type),
    organization_subtype: normalizeText(input.organizationSubtype || input.organization_subtype),
    phone: normalizeText(input.phone),
    email: normalizeText(input.email).toLowerCase(),
    website: normalizeText(input.website),
    description: normalizeText(input.description),
    logo_url: normalizeText(input.logoUrl || input.logo_url),
  }
  if (!payload.name) throw new Error('Organization name is required.')
  const result = await client.rpc('bridge_phase3_create_organization', {
    p_organization: payload,
    p_partner_prospect_id: input.partnerProspectId || input.partner_prospect_id || null,
  })
  const data = assertRpcSuccess(result, 'Unable to create organization.')
  return {
    organization: toOrganization(data.organization || {}),
    membershipId: data.membershipId || null,
  }
}

export async function requestOrganizationMembership({ organizationId, message = '' } = {}) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase3_request_organization_membership', {
    p_organization_id: organizationId,
    p_message: normalizeText(message) || null,
  })
  const data = assertRpcSuccess(result, 'Unable to request membership.')
  return toMember(data.membership || {})
}

export async function getOrganizationProfile(organizationId) {
  const client = requireClient()
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase3_get_organization_profile', {
    p_organization_id: organizationId,
  })
  const data = assertRpcSuccess(result, 'Unable to load organization profile.')
  return {
    organization: toOrganization(data.organization || {}),
    members: (Array.isArray(data.members) ? data.members : []).map(toMember),
    events: (Array.isArray(data.events) ? data.events : []).map(toEvent),
    canManage: data.canManage === true,
  }
}

export async function reviewOrganizationMembership({ membershipId, action, organizationRole = 'member' } = {}) {
  const client = requireClient()
  if (!membershipId) throw new Error('Membership is required.')
  const result = await client.rpc('bridge_phase3_review_organization_membership', {
    p_membership_id: membershipId,
    p_action: action,
    p_organization_role: normalizeOrganizationRole(organizationRole),
  })
  const data = assertRpcSuccess(result, 'Unable to update membership request.')
  return toMember(data.membership || {})
}

export async function updateOrganizationMemberRole({ membershipId, organizationRole } = {}) {
  const client = requireClient()
  if (!membershipId) throw new Error('Membership is required.')
  const result = await client.rpc('bridge_phase3_update_member_role', {
    p_membership_id: membershipId,
    p_organization_role: normalizeOrganizationRole(organizationRole),
  })
  const data = assertRpcSuccess(result, 'Unable to update member role.')
  return toMember(data.membership || {})
}

export async function removeOrganizationMember(membershipId) {
  const client = requireClient()
  if (!membershipId) throw new Error('Membership is required.')
  const result = await client.rpc('bridge_phase3_remove_member', {
    p_membership_id: membershipId,
  })
  const data = assertRpcSuccess(result, 'Unable to remove member.')
  return toMember(data.membership || {})
}

export async function linkProspectToOrganization({ partnerProspectId, organizationId } = {}) {
  const client = requireClient()
  if (!partnerProspectId) throw new Error('Partner prospect is required.')
  if (!organizationId) throw new Error('Organization is required.')
  const result = await client.rpc('bridge_phase3_link_prospect_to_organization', {
    p_partner_prospect_id: partnerProspectId,
    p_organization_id: organizationId,
  })
  const data = assertRpcSuccess(result, 'Unable to link prospect.')
  return toProspect(data.prospect || {})
}

export const __organizationServiceTestUtils = {
  toOrganization,
  toMember,
  toEvent,
  toProspect,
}
