import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'
import { normalizeOrganisationPartnerVisibilityLevel } from '../lib/partnersRepository'

export const PARTNER_PROFILE_ACCESS_DENIED_MESSAGE = 'Partner relationship not found or access denied.'
export const PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE = 'This partner relationship is not active yet.'

const LOCKED_SECTIONS = [
  {
    key: 'people',
    label: 'People',
    status: 'locked',
    reason: 'Requires partner people permissions',
  },
  {
    key: 'listings',
    label: 'Listings',
    status: 'locked',
    reason: 'Requires listing visibility permissions',
  },
  {
    key: 'applications',
    label: 'Applications',
    status: 'locked',
    reason: 'Requires application visibility permissions',
  },
  {
    key: 'campaigns',
    label: 'Marketing Collaboration',
    status: 'locked',
    reason: 'Requires campaign permissions',
  },
  {
    key: 'performance',
    label: 'Performance',
    status: 'locked',
    reason: 'Requires partner performance permissions',
  },
  {
    key: 'attribution',
    label: 'Attribution',
    status: 'locked',
    reason: 'Requires attribution and revenue permissions',
  },
]
const INVITE_RELATIONSHIP_PREFIX = 'partner-invite-relationship-'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeNullableUuid(value = '') {
  const normalized = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function isRowLevelSecurityError(error) {
  const code = String(error?.code || '')
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return code === '42501' || message.includes('row-level security')
}

function normalizePartnerScopeType(value = '') {
  const normalized = normalizeLower(value).replace(/\s+/g, '_')
  if (normalized === 'org' || normalized === 'organisation_wide' || normalized === 'organization') return 'organisation'
  if (normalized === 'personal' || normalized === 'consultant' || normalized === 'consultant_user') return 'user'
  return ['organisation', 'region', 'branch', 'team', 'user'].includes(normalized) ? normalized : 'organisation'
}

function getAcceptedInviteIdFromRelationshipId(relationshipId = '') {
  const normalized = normalizeText(relationshipId)
  if (!normalized.startsWith(INVITE_RELATIONSHIP_PREFIX)) return null
  return normalizeNullableUuid(normalized.slice(INVITE_RELATIONSHIP_PREFIX.length))
}

function isAcceptedRelationship(row = {}) {
  const status = normalizeLower(row.relationship_status || row.relationshipStatus || row.status)
  return status === 'accepted' || status === 'approved' || status === 'connected'
}

function relationshipMatchesInvitation(row = {}, invitation = {}) {
  const senderId = normalizeText(invitation.sender_organisation_id || invitation.senderOrganisationId)
  const recipientId = normalizeText(invitation.recipient_organisation_id || invitation.recipientOrganisationId)
  const organisationId = normalizeText(row.organisation_id || row.organisationId)
  const partnerOrganisationId = normalizeText(row.partner_organisation_id || row.partnerOrganisationId)
  if (!senderId || !recipientId || !organisationId || !partnerOrganisationId) return false
  const samePair =
    (organisationId === senderId && partnerOrganisationId === recipientId) ||
    (organisationId === recipientId && partnerOrganisationId === senderId)
  if (!samePair) return false
  if (!isAcceptedRelationship(row)) return false

  const inviteScopeType = normalizePartnerScopeType(invitation.scope_type || invitation.scopeType)
  const inviteScopeId = normalizeText(invitation.scope_id || invitation.scopeId) || (inviteScopeType === 'organisation' ? senderId : '')
  const rowScopeType = normalizePartnerScopeType(row.scope_type || row.scopeType)
  const rowScopeId = normalizeText(row.scope_id || row.scopeId) || (rowScopeType === 'organisation' ? organisationId : '')
  return rowScopeType === inviteScopeType && (!inviteScopeId || rowScopeId === inviteScopeId)
}

function createProfileError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function mapRelationshipOverview(row = {}, partner = {}) {
  return normalizeOverviewPayload({
    relationship: {
      id: row.id,
      status: normalizeText(row.relationship_status || row.relationshipStatus || row.status) || 'accepted',
      relationship_type: normalizeText(row.relationship_type || row.relationshipType) || 'approved',
      connected_since: row.accepted_at || row.acceptedAt || row.created_at || row.createdAt,
      organisation_id: row.organisation_id || row.organisationId,
      partner_organisation_id: row.partner_organisation_id || row.partnerOrganisationId,
      relationship_owner: null,
    },
    partnerOrganisation: {
      id: partner.id,
      name: normalizeText(partner.display_name || partner.displayName || partner.name) || 'Partner organisation',
      type: normalizeText(partner.type),
      location: [partner.city, partner.province].map(normalizeText).filter(Boolean).join(', '),
      logo_url: normalizeText(partner.logo_url || partner.logoUrl),
    },
    summary: {
      branch_count: 0,
      linked_transaction_count: 0,
      linked_application_count: 0,
      relationship_health: 'Active',
    },
  })
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()
  if (error) throw error
  return data?.user || null
}

async function resolveCurrentOrganisationId(options = {}, userId = '') {
  const explicitId =
    normalizeNullableUuid(options.currentOrganisationId) ||
    normalizeNullableUuid(options.organisationId) ||
    normalizeNullableUuid(options.workspaceId) ||
    normalizeNullableUuid(options.currentMembership?.organisation_id) ||
    normalizeNullableUuid(options.currentMembership?.organisationId) ||
    normalizeNullableUuid(options.currentMembership?.workspaceId) ||
    normalizeNullableUuid(options.currentWorkspace?.id)

  if (explicitId) return explicitId

  if (!userId) return null

  const { data, error } = await supabase
    .from('organisation_users')
    .select('organisation_id, status, active_workspace_selected_at, updated_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('active_workspace_selected_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(1)

  if (error) throw error
  return normalizeNullableUuid(data?.[0]?.organisation_id)
}

function collectExplicitOrganisationIds(options = {}) {
  return [
    options.currentOrganisationId,
    options.organisationId,
    options.workspaceId,
    options.currentMembership?.organisation_id,
    options.currentMembership?.organisationId,
    options.currentMembership?.workspaceId,
    options.currentWorkspace?.organisation_id,
    options.currentWorkspace?.organisationId,
    options.currentWorkspace?.id,
  ].map(normalizeNullableUuid).filter(Boolean)
}

async function getActiveOrganisationIds(userId = '') {
  if (!userId) return []
  const { data, error } = await supabase
    .from('organisation_users')
    .select('organisation_id, status, active_workspace_selected_at, updated_at')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('active_workspace_selected_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false, nullsFirst: false })

  if (error) throw error
  return [...new Set((data || []).map((row) => normalizeNullableUuid(row.organisation_id)).filter(Boolean))]
}

async function fetchRelationshipById(relationshipId = '') {
  const safeRelationshipId = normalizeNullableUuid(relationshipId)
  if (!safeRelationshipId) return null
  const { data, error } = await supabase
    .from('organisation_partners')
    .select('id, organisation_id, partner_organisation_id, relationship_status, status, relationship_type, scope_type, scope_id, accepted_at, created_at')
    .eq('id', safeRelationshipId)
    .single()

  if (error) throw error
  return data || null
}

async function resolveRelationshipCurrentOrganisationId(relationship = {}, options = {}, userId = '') {
  const ownerOrganisationId = normalizeNullableUuid(relationship.organisation_id || relationship.organisationId)
  const partnerOrganisationId = normalizeNullableUuid(relationship.partner_organisation_id || relationship.partnerOrganisationId)
  if (!ownerOrganisationId || !partnerOrganisationId) return resolveCurrentOrganisationId(options, userId)

  const activeIds = await getActiveOrganisationIds(userId)
  const candidates = [...new Set([...collectExplicitOrganisationIds(options), ...activeIds])]
  const matchedId = candidates.find((id) => id === ownerOrganisationId || id === partnerOrganisationId)
  if (matchedId) return matchedId

  if (!activeIds.length) {
    return partnerOrganisationId || ownerOrganisationId
  }

  throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
}

async function fetchAcceptedInvitation(invitationId = '', currentOrganisationId = '') {
  const { data, error } = await supabase
    .from('partner_invitations')
    .select('id, sender_organisation_id, recipient_organisation_id, to_workspace_type, partner_type, relationship_type, scope_type, scope_id, scope_name, preferred, status')
    .eq('id', invitationId)
    .single()

  if (error) throw error
  if (!data) throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')

  const senderId = normalizeText(data.sender_organisation_id)
  const recipientId = normalizeText(data.recipient_organisation_id)
  if (currentOrganisationId && senderId !== currentOrganisationId && recipientId !== currentOrganisationId) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const status = normalizeLower(data.status)
  if (status !== 'accepted' && status !== 'approved' && status !== 'connected') {
    throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
  }

  return data
}

async function resolveInvitationCurrentOrganisationId(invitation = {}, options = {}, userId = '') {
  const senderId = normalizeNullableUuid(invitation.sender_organisation_id)
  const recipientId = normalizeNullableUuid(invitation.recipient_organisation_id)
  const activeIds = await getActiveOrganisationIds(userId)
  const candidates = [...new Set([...collectExplicitOrganisationIds(options), ...activeIds])]
  const matchedId = candidates.find((id) => id && (id === senderId || id === recipientId))
  if (matchedId) return matchedId
  throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
}

async function findAcceptedRelationshipForInvitation(invitation = {}) {
  const senderId = normalizeText(invitation.sender_organisation_id)
  const recipientId = normalizeText(invitation.recipient_organisation_id)
  if (!senderId || !recipientId) return null

  const { data, error } = await supabase
    .from('organisation_partners')
    .select('id, organisation_id, partner_organisation_id, relationship_status, status, scope_type, scope_id, accepted_at, created_at')
    .or(`and(organisation_id.eq.${senderId},partner_organisation_id.eq.${recipientId}),and(organisation_id.eq.${recipientId},partner_organisation_id.eq.${senderId})`)
    .order('accepted_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).find((row) => relationshipMatchesInvitation(row, invitation)) || (data || []).find(isAcceptedRelationship) || null
}

async function repairAcceptedRelationshipFromInvitation(invitation = {}, currentOrganisationId = '', userId = '') {
  const senderId = normalizeText(invitation.sender_organisation_id)
  const recipientId = normalizeText(invitation.recipient_organisation_id)
  if (!senderId || !recipientId) return null

  const ownerOrganisationId = currentOrganisationId === recipientId ? recipientId : senderId
  const partnerOrganisationId = ownerOrganisationId === senderId ? recipientId : senderId
  const invitationScopeType = normalizePartnerScopeType(invitation.scope_type)
  const scopeType = ownerOrganisationId === senderId ? invitationScopeType : 'organisation'
  const scopeId = ownerOrganisationId === senderId
    ? normalizeText(invitation.scope_id) || (scopeType === 'organisation' ? ownerOrganisationId : '')
    : ownerOrganisationId
  const now = new Date().toISOString()
  const payload = {
    organisation_id: ownerOrganisationId,
    partner_organisation_id: partnerOrganisationId,
    partner_type: normalizeText(invitation.partner_type || invitation.to_workspace_type) || null,
    relationship_status: 'accepted',
    status: 'accepted',
    relationship_type: normalizeText(invitation.relationship_type) || 'approved',
    preferred: invitation.preferred === true,
    scope_type: scopeType,
    scope_id: scopeId,
    scope_name: normalizeText(invitation.scope_name) || null,
    visibility_level: normalizeOrganisationPartnerVisibilityLevel('', { preferred: invitation.preferred === true }),
    accepted_at: now,
    created_by: normalizeNullableUuid(userId),
    updated_at: now,
  }

  const { data, error } = await supabase
    .from('organisation_partners')
    .insert(payload)
    .select('id')
    .single()

  if (!error && data?.id) return data
  if (isRowLevelSecurityError(error)) return null

  const fallback = await supabase
    .from('organisation_partners')
    .insert({
      organisation_id: ownerOrganisationId,
      partner_organisation_id: partnerOrganisationId,
      relationship_status: 'accepted',
      relationship_type: normalizeText(invitation.relationship_type) || 'approved',
      visibility_level: normalizeOrganisationPartnerVisibilityLevel('', { preferred: invitation.preferred === true }),
      accepted_at: now,
      created_by: normalizeNullableUuid(userId),
    })
    .select('id')
    .single()

  if (isRowLevelSecurityError(fallback.error)) return null
  if (fallback.error) throw error || fallback.error
  return fallback.data || null
}

export async function resolveBondPartnerProfileRelationshipId(relationshipId = '', options = {}) {
  const context = await resolveBondPartnerProfileRelationshipContext(relationshipId, options)
  return context.relationshipId
}

export async function resolveBondPartnerProfileRelationshipContext(relationshipId = '', options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_configured')
  }

  const currentUser = await getCurrentUser()
  if (!currentUser?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const directRelationshipId = normalizeNullableUuid(relationshipId)
  if (directRelationshipId) {
    const relationship = await fetchRelationshipById(directRelationshipId)
    if (!relationship?.id || !isAcceptedRelationship(relationship)) {
      throw createProfileError(
        relationship?.id ? PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE : PARTNER_PROFILE_ACCESS_DENIED_MESSAGE,
        relationship?.id ? 'not_accepted' : 'not_found',
      )
    }
    return {
      relationshipId: directRelationshipId,
      currentOrganisationId: await resolveRelationshipCurrentOrganisationId(relationship, options, currentUser.id),
      relationship,
    }
  }

  const invitationId = getAcceptedInviteIdFromRelationshipId(relationshipId)
  if (!invitationId) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const invitation = await fetchAcceptedInvitation(invitationId)
  const currentOrganisationId = await resolveInvitationCurrentOrganisationId(invitation, options, currentUser.id)
  const existingRelationship = await findAcceptedRelationshipForInvitation(invitation)
  if (existingRelationship?.id) {
    return {
      relationshipId: existingRelationship.id,
      currentOrganisationId,
      relationship: existingRelationship,
    }
  }

  const repairedRelationship = await repairAcceptedRelationshipFromInvitation(invitation, currentOrganisationId, currentUser.id)
  if (repairedRelationship?.id) {
    return {
      relationshipId: repairedRelationship.id,
      currentOrganisationId,
      relationship: repairedRelationship,
    }
  }

  throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
}

function normalizeOverviewPayload(payload = {}) {
  return {
    relationship: payload.relationship || null,
    partnerOrganisation: payload.partnerOrganisation || null,
    summary: {
      branch_count: Number(payload.summary?.branch_count || 0),
      linked_transaction_count: Number(payload.summary?.linked_transaction_count || 0),
      linked_application_count: Number(payload.summary?.linked_application_count || 0),
      relationship_health: normalizeText(payload.summary?.relationship_health) || 'Active',
    },
    lockedSections: LOCKED_SECTIONS,
  }
}

function normalizePerson(row = {}) {
  return {
    userId: normalizeText(row.user_id || row.userId),
    fullName: normalizeText(row.full_name || row.fullName) || 'Partner user',
    email: normalizeText(row.email),
    phone: normalizeText(row.phone),
    role: normalizeText(row.role),
    organisationRole: normalizeText(row.organisation_role || row.organisationRole),
    branchId: normalizeText(row.branch_id || row.branchId),
    branchName: normalizeText(row.branch_name || row.branchName),
    regionId: normalizeText(row.region_id || row.regionId),
    regionName: normalizeText(row.region_name || row.regionName),
    teamId: normalizeText(row.team_id || row.teamId),
    teamName: normalizeText(row.team_name || row.teamName),
    department: normalizeText(row.department),
    title: normalizeText(row.title || row.job_title || row.jobTitle),
    isActive: row.is_active !== false,
  }
}

function normalizePeoplePayload(payload = {}) {
  const permissions = payload.permissions || {}
  const groups = payload.groups || {}
  const principal = Array.isArray(groups.principal) ? groups.principal.map(normalizePerson) : []
  const branchManagers = Array.isArray(groups.branch_managers) ? groups.branch_managers.map(normalizePerson) : []
  const agents = Array.isArray(groups.agents) ? groups.agents.map(normalizePerson) : []

  return {
    relationshipId: normalizeText(payload.relationship_id || payload.relationshipId),
    partnerOrganisationId: normalizeText(payload.partner_organisation_id || payload.partnerOrganisationId),
    permissions: {
      canViewPrincipal: permissions.can_view_principal === true,
      canViewBranchManagers: permissions.can_view_branch_managers === true,
      canViewAgents: permissions.can_view_agents === true,
    },
    groups: {
      principal,
      branchManagers,
      agents,
    },
    summary: {
      principalCount: principal.length,
      branchManagerCount: branchManagers.length,
      agentCount: agents.length,
    },
  }
}

function normalizePublicationStatuses(value = {}) {
  const statuses = value && typeof value === 'object' ? value : {}
  return {
    bridge: normalizeText(statuses.bridge || statuses.Bridge || 'not_published') || 'not_published',
    property24: normalizeText(statuses.property24 || statuses.property_24 || statuses.Property24 || 'not_published') || 'not_published',
    privateProperty: normalizeText(statuses.private_property || statuses.privateProperty || statuses.PrivateProperty || 'not_published') || 'not_published',
    website: normalizeText(statuses.website || statuses.Website || 'not_published') || 'not_published',
  }
}

function normalizeListing(row = {}) {
  return {
    listingId: normalizeText(row.listing_id || row.listingId),
    listingReference: normalizeText(row.listing_reference || row.listingReference),
    title: normalizeText(row.title) || 'Shared listing',
    propertyType: normalizeText(row.property_type || row.propertyType) || 'Property',
    status: normalizeText(row.status) || 'active',
    price: Number(row.price || 0) || 0,
    suburb: normalizeText(row.suburb),
    city: normalizeText(row.city),
    branchName: normalizeText(row.branch_name || row.branchName),
    agentName: normalizeText(row.agent_name || row.agentName) || 'Assigned agent',
    mainImage: normalizeText(row.main_image || row.mainImage),
    bedrooms: Number(row.bedrooms || 0) || 0,
    bathrooms: Number(row.bathrooms || 0) || 0,
    parking: Number(row.parking || 0) || 0,
    createdAt: normalizeText(row.created_at || row.createdAt),
    publicationStatuses: normalizePublicationStatuses(row.publication_statuses || row.publicationStatuses),
  }
}

function normalizeListingsPayload(payload = {}) {
  const rows = Array.isArray(payload.listings) ? payload.listings.map(normalizeListing) : []
  return {
    relationshipId: normalizeText(payload.relationship_id || payload.relationshipId),
    partnerOrganisationId: normalizeText(payload.partner_organisation_id || payload.partnerOrganisationId),
    permissions: {
      canViewListings: payload.permissions?.can_view_listings === true || payload.permissions?.canViewListings === true,
    },
    listings: rows,
    summary: {
      sharedListings: rows.length,
      activeListings: rows.filter((listing) => normalizeText(listing.status).toLowerCase().includes('active') || normalizeText(listing.status).toLowerCase().includes('published')).length,
      newThisMonth: rows.filter((listing) => {
        if (!listing.createdAt) return false
        const created = new Date(listing.createdAt)
        const now = new Date()
        return !Number.isNaN(created.getTime()) && created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth()
      }).length,
      averagePrice: rows.length
        ? rows.reduce((total, listing) => total + (Number(listing.price || 0) || 0), 0) / rows.length
        : 0,
    },
  }
}

function normalizeApplication(row = {}) {
  return {
    applicationId: normalizeText(row.application_id || row.applicationId),
    transactionId: normalizeText(row.transaction_id || row.transactionId),
    applicationReference: normalizeText(row.application_reference || row.applicationReference) || 'Application',
    buyerDisplayName: normalizeText(row.buyer_display_name || row.buyerDisplayName) || 'Buyer',
    propertyDisplayName: normalizeText(row.property_display_name || row.propertyDisplayName) || 'Property pending',
    stage: normalizeText(row.stage) || 'pending',
    status: normalizeText(row.status) || 'pending',
    bankSubmittedCount: Number(row.bank_submitted_count || row.bankSubmittedCount || 0) || 0,
    approvalStatus: normalizeText(row.approval_status || row.approvalStatus || row.status) || 'pending',
    approvalProbability: row.approval_probability === null || row.approval_probability === undefined
      ? null
      : Number(row.approval_probability || 0),
    createdAt: normalizeText(row.created_at || row.createdAt),
    updatedAt: normalizeText(row.updated_at || row.updatedAt),
    assignedConsultantName: normalizeText(row.assigned_consultant_name || row.assignedConsultantName) || 'Unassigned',
    agencyAgentName: normalizeText(row.agency_agent_name || row.agencyAgentName) || 'Agency agent pending',
    canOpenInternal: row.can_open_internal === true || row.canOpenInternal === true,
  }
}

function normalizeDistribution(items = [], labelKey = 'label') {
  return (Array.isArray(items) ? items : []).map((item = {}) => ({
    key: normalizeText(item.key || item.stage || item.label || item.month),
    label: normalizeText(item[labelKey] || item.label || item.stage || item.month) || 'Not recorded',
    count: Number(item.count || 0) || 0,
  }))
}

function normalizeApplicationsPayload(payload = {}) {
  const rows = Array.isArray(payload.applications) ? payload.applications.map(normalizeApplication) : []
  const stageDistribution = normalizeDistribution(payload.stage_distribution || payload.stageDistribution, 'stage')
  return {
    relationshipId: normalizeText(payload.relationship_id || payload.relationshipId),
    partnerOrganisationId: normalizeText(payload.partner_organisation_id || payload.partnerOrganisationId),
    permissions: {
      canViewApplications: payload.permissions?.can_view_applications === true || payload.permissions?.canViewApplications === true,
    },
    applications: rows,
    stageDistribution,
    summary: {
      activeApplications: rows.filter((application) => !['approved', 'buyer_approved', 'declined', 'expired'].includes(normalizeText(application.status).toLowerCase())).length,
      submittedApplications: rows.filter((application) => ['submitted', 'feedback_received', 'quote_received', 'additional_documents_required', 'approved', 'buyer_approved', 'declined'].includes(normalizeText(application.status).toLowerCase())).length,
      approvedApplications: rows.filter((application) => ['approved', 'buyer_approved'].includes(normalizeText(application.status).toLowerCase())).length,
      approvalRate: rows.length
        ? (rows.filter((application) => ['approved', 'buyer_approved'].includes(normalizeText(application.status).toLowerCase())).length / rows.length) * 100
        : 0,
    },
  }
}

function normalizePerformancePayload(payload = {}) {
  const summary = payload.summary || {}
  return {
    relationshipId: normalizeText(payload.relationship_id || payload.relationshipId),
    partnerOrganisationId: normalizeText(payload.partner_organisation_id || payload.partnerOrganisationId),
    permissions: {
      canViewPartnerPerformance: payload.permissions?.can_view_partner_performance === true || payload.permissions?.canViewPartnerPerformance === true,
    },
    summary: {
      totalApplications: Number(summary.total_applications || summary.totalApplications || 0) || 0,
      activeApplications: Number(summary.active_applications || summary.activeApplications || 0) || 0,
      submittedApplications: Number(summary.submitted_applications || summary.submittedApplications || 0) || 0,
      approvedApplications: Number(summary.approved_applications || summary.approvedApplications || 0) || 0,
      declinedApplications: Number(summary.declined_applications || summary.declinedApplications || 0) || 0,
      approvalRate: Number(summary.approval_rate || summary.approvalRate || 0) || 0,
      averageApprovalTime: Number(summary.average_approval_time || summary.averageApprovalTime || 0) || 0,
      pipelineValue: Number(summary.pipeline_value || summary.pipelineValue || 0) || 0,
      averageApplicationValue: Number(summary.average_application_value || summary.averageApplicationValue || 0) || 0,
      applicationsThisMonth: Number(summary.applications_this_month || summary.applicationsThisMonth || 0) || 0,
      applicationsLastMonth: Number(summary.applications_last_month || summary.applicationsLastMonth || 0) || 0,
      monthOnMonthChange: Number(summary.month_on_month_change || summary.monthOnMonthChange || 0) || 0,
      topStageBottleneck: normalizeText(summary.top_stage_bottleneck || summary.topStageBottleneck) || 'Not enough data',
    },
    stageDistribution: normalizeDistribution(payload.stage_distribution || payload.stageDistribution),
    bankMixSummary: normalizeDistribution(payload.bank_mix_summary || payload.bankMixSummary),
    consultantDistribution: normalizeDistribution(payload.consultant_distribution || payload.consultantDistribution),
    monthlyApplicationTrend: normalizeDistribution(payload.monthly_application_trend || payload.monthlyApplicationTrend, 'month'),
  }
}

function normalizeOpportunity(row = {}) {
  return {
    key: normalizeText(row.key),
    label: normalizeText(row.label) || 'Opportunity',
    description: normalizeText(row.description),
    actionLabel: normalizeText(row.action_label || row.actionLabel) || 'Create Campaign',
    opportunityType: normalizeText(row.opportunity_type || row.opportunityType),
    count: Number(row.count || 0) || 0,
    listingIds: Array.isArray(row.listing_ids || row.listingIds)
      ? (row.listing_ids || row.listingIds).map(normalizeText).filter(Boolean)
      : [],
  }
}

function normalizeCampaign(row = {}) {
  return {
    id: normalizeText(row.id),
    listingId: normalizeText(row.listing_id || row.listingId),
    campaignName: normalizeText(row.campaign_name || row.campaignName) || 'Partner campaign',
    campaignType: normalizeText(row.campaign_type || row.campaignType) || 'listing_finance',
    status: normalizeText(row.status) || 'draft',
    createdAt: normalizeText(row.created_at || row.createdAt),
    listingTitle: normalizeText(row.listing_title || row.listingTitle),
    estimatedRepayment: Number(row.estimated_repayment || row.estimatedRepayment || 0) || 0,
    trackingLinkCount: Number(row.tracking_link_count || row.trackingLinkCount || 0) || 0,
    assetCount: Number(row.asset_count || row.assetCount || 0) || 0,
  }
}

function normalizeCampaignCentrePayload(payload = {}) {
  const kpis = payload.kpis || {}
  const analytics = payload.analytics || {}
  return {
    relationshipId: normalizeText(payload.relationship_id || payload.relationshipId),
    partnerOrganisationId: normalizeText(payload.partner_organisation_id || payload.partnerOrganisationId),
    permissions: {
      canViewCampaigns: payload.permissions?.can_view_campaigns === true || payload.permissions?.canViewCampaigns === true,
      canCreateFinanceCampaigns: payload.permissions?.can_create_finance_campaigns === true || payload.permissions?.canCreateFinanceCampaigns === true,
      canGenerateFinanceAssets: payload.permissions?.can_generate_finance_assets === true || payload.permissions?.canGenerateFinanceAssets === true,
      canViewListingOpportunities: payload.permissions?.can_view_listing_opportunities === true || payload.permissions?.canViewListingOpportunities === true,
    },
    kpis: {
      activeCampaigns: Number(kpis.active_campaigns || kpis.activeCampaigns || 0) || 0,
      financeEnquiries: Number(kpis.finance_enquiries || kpis.financeEnquiries || 0) || 0,
      applicationsGenerated: Number(kpis.applications_generated || kpis.applicationsGenerated || 0) || 0,
      conversionRate: Number(kpis.conversion_rate || kpis.conversionRate || 0) || 0,
      campaignsCreated: Number(kpis.campaigns_created || kpis.campaignsCreated || 0) || 0,
      linksGenerated: Number(kpis.links_generated || kpis.linksGenerated || 0) || 0,
      applicationsLinked: Number(kpis.applications_linked || kpis.applicationsLinked || 0) || 0,
      activeListingsPromoted: Number(kpis.active_listings_promoted || kpis.activeListingsPromoted || 0) || 0,
    },
    opportunities: Array.isArray(payload.opportunities) ? payload.opportunities.map(normalizeOpportunity) : [],
    campaigns: Array.isArray(payload.campaigns) ? payload.campaigns.map(normalizeCampaign) : [],
    analytics: {
      campaignsCreated: Number(analytics.campaigns_created || analytics.campaignsCreated || 0) || 0,
      linksGenerated: Number(analytics.links_generated || analytics.linksGenerated || 0) || 0,
      applicationsLinked: Number(analytics.applications_linked || analytics.applicationsLinked || 0) || 0,
      activeListingsPromoted: Number(analytics.active_listings_promoted || analytics.activeListingsPromoted || 0) || 0,
    },
  }
}

function normalizeCampaignCreationPayload(payload = {}) {
  const campaign = payload.campaign || {}
  const financeProfile = payload.finance_profile || payload.financeProfile || {}
  const link = payload.link || {}
  return {
    campaign: normalizeCampaign(campaign),
    financeProfile: {
      purchasePrice: Number(financeProfile.purchase_price || financeProfile.purchasePrice || 0) || 0,
      depositAmount: Number(financeProfile.deposit_amount || financeProfile.depositAmount || 0) || 0,
      interestRate: Number(financeProfile.interest_rate || financeProfile.interestRate || 0) || 0,
      loanTerm: Number(financeProfile.loan_term || financeProfile.loanTerm || 0) || 0,
      estimatedRepayment: Number(financeProfile.estimated_repayment || financeProfile.estimatedRepayment || 0) || 0,
    },
    link: {
      trackingCode: normalizeText(link.tracking_code || link.trackingCode),
      linkSlug: normalizeText(link.link_slug || link.linkSlug),
      url: normalizeText(link.url),
    },
  }
}

export async function getBondPartnerProfileOverview(relationshipId = '', options = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_configured')
  }

  const currentUser = await getCurrentUser()
  if (!currentUser?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const fallbackCurrentOrganisationId = await resolveCurrentOrganisationId(options, currentUser.id)
  const relationshipContext = await resolveBondPartnerProfileRelationshipContext(relationshipId, {
    ...options,
    currentOrganisationId: fallbackCurrentOrganisationId,
  })
  const currentOrganisationId = relationshipContext.currentOrganisationId || fallbackCurrentOrganisationId
  if (!currentOrganisationId) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }
  const safeRelationshipId = relationshipContext.relationshipId

  const { data, error } = await supabase.rpc('bridge_get_bond_partner_profile_overview', {
    p_relationship_id: safeRelationshipId,
    p_current_organisation_id: currentOrganisationId,
  })

  if (error) throw error

  if (data?.relationship && data?.partnerOrganisation) {
    return normalizeOverviewPayload(data)
  }

  const relationship = relationshipContext.relationship || await fetchRelationshipById(safeRelationshipId)
  if (!relationship?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }
  if (!isAcceptedRelationship(relationship)) {
    throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
  }

  const ownerOrganisationId = normalizeText(relationship.organisation_id || relationship.organisationId)
  const partnerOrganisationId = normalizeText(relationship.partner_organisation_id || relationship.partnerOrganisationId)
  if (currentOrganisationId !== ownerOrganisationId && currentOrganisationId !== partnerOrganisationId) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const visiblePartnerOrganisationId = currentOrganisationId === ownerOrganisationId ? partnerOrganisationId : ownerOrganisationId
  const partnerResult = await supabase
    .from('organisations')
    .select('id, name, display_name, type, city, province, logo_url')
    .eq('id', visiblePartnerOrganisationId)
    .single()

  if (partnerResult.error || !partnerResult.data?.id) {
    if (data?.error_code === 'not_accepted') {
      throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
    }
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  return mapRelationshipOverview(relationship, partnerResult.data)
}

export async function getBondPartnerPeople(relationshipId = '') {
  if (!isSupabaseConfigured || !supabase) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_configured')
  }

  const currentUser = await getCurrentUser()
  if (!currentUser?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const safeRelationshipId = await resolveBondPartnerProfileRelationshipId(relationshipId)

  const { data, error } = await supabase.rpc('get_bond_partner_people_phase2', {
    p_relationship_id: safeRelationshipId,
  })

  if (error) throw error

  if (data?.error_code === 'not_accepted') {
    throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
  }

  if (data?.error_code) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  return normalizePeoplePayload(data)
}

export async function getBondPartnerListings(relationshipId = '') {
  if (!isSupabaseConfigured || !supabase) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_configured')
  }

  const currentUser = await getCurrentUser()
  if (!currentUser?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const safeRelationshipId = await resolveBondPartnerProfileRelationshipId(relationshipId)

  const { data, error } = await supabase.rpc('get_bond_partner_listings_phase3', {
    p_relationship_id: safeRelationshipId,
  })

  if (error) throw error

  if (data?.error_code === 'not_accepted') {
    throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
  }

  if (data?.error_code) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  return normalizeListingsPayload(data)
}

export async function getBondPartnerApplications(relationshipId = '') {
  if (!isSupabaseConfigured || !supabase) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_configured')
  }

  const currentUser = await getCurrentUser()
  if (!currentUser?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const safeRelationshipId = await resolveBondPartnerProfileRelationshipId(relationshipId)

  const { data, error } = await supabase.rpc('get_bond_partner_applications_phase4', {
    p_relationship_id: safeRelationshipId,
  })

  if (error) throw error

  if (data?.error_code === 'not_accepted') {
    throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
  }

  if (data?.error_code) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  return normalizeApplicationsPayload(data)
}

export async function getBondPartnerPerformance(relationshipId = '') {
  if (!isSupabaseConfigured || !supabase) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_configured')
  }

  const currentUser = await getCurrentUser()
  if (!currentUser?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const safeRelationshipId = await resolveBondPartnerProfileRelationshipId(relationshipId)

  const { data, error } = await supabase.rpc('get_bond_partner_performance_phase4', {
    p_relationship_id: safeRelationshipId,
  })

  if (error) throw error

  if (data?.error_code === 'not_accepted') {
    throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
  }

  if (data?.error_code) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  return normalizePerformancePayload(data)
}

export async function getBondPartnerCampaignCentre(relationshipId = '') {
  if (!isSupabaseConfigured || !supabase) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_configured')
  }

  const currentUser = await getCurrentUser()
  if (!currentUser?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const safeRelationshipId = await resolveBondPartnerProfileRelationshipId(relationshipId)

  const { data, error } = await supabase.rpc('get_bond_partner_campaign_centre_phase5', {
    p_relationship_id: safeRelationshipId,
  })

  if (error) throw error

  if (data?.error_code === 'not_accepted') {
    throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
  }

  if (data?.error_code) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  return normalizeCampaignCentrePayload(data)
}

export async function createBondPartnerFinanceCampaign(relationshipId = '', listingId = '', options = {}) {
  const safeListingId = normalizeNullableUuid(listingId)
  if (!safeListingId) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  if (!isSupabaseConfigured || !supabase) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_configured')
  }

  const currentUser = await getCurrentUser()
  if (!currentUser?.id) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  const safeRelationshipId = await resolveBondPartnerProfileRelationshipId(relationshipId)

  const { data, error } = await supabase.rpc('create_bond_partner_finance_campaign_phase5', {
    p_relationship_id: safeRelationshipId,
    p_listing_id: safeListingId,
    p_campaign_type: normalizeText(options.campaignType) || 'listing_finance',
    p_campaign_name: normalizeText(options.campaignName) || null,
    p_deposit_percent: Number(options.depositPercent || 10) || 10,
    p_interest_rate: Number(options.interestRate || 11.75) || 11.75,
    p_loan_term: Number(options.loanTerm || 20) || 20,
  })

  if (error) throw error

  if (data?.error_code === 'not_accepted') {
    throw createProfileError(PARTNER_PROFILE_NOT_ACCEPTED_MESSAGE, 'not_accepted')
  }

  if (data?.error_code === 'permission_denied') {
    throw createProfileError('Campaign permissions have not been granted for this relationship.', 'permission_denied')
  }

  if (data?.error_code) {
    throw createProfileError(PARTNER_PROFILE_ACCESS_DENIED_MESSAGE, 'not_found')
  }

  return normalizeCampaignCreationPayload(data)
}
