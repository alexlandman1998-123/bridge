import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const DIRECTORY_STATUSES = new Set(['external', 'invite_pending', 'connected', 'inactive'])

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeLower(value = '') {
  return normalizeText(value).toLowerCase()
}

function normalizeRole(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (normalized === 'attorney' || normalized === 'attorney_firm') return 'transfer_attorney'
  if (normalized === 'agency' || normalized === 'agency_network') return 'referral_agency'
  if (normalized === 'developer_company') return 'developer'
  return normalized || 'other'
}

function unique(values = []) {
  return [...new Set(values.map(normalizeText).filter(Boolean))]
}

function normalizeStatus(value = '') {
  const normalized = normalizeLower(value)
  if (DIRECTORY_STATUSES.has(normalized)) return normalized
  if (normalized === 'accepted') return 'connected'
  if (normalized === 'pending') return 'invite_pending'
  if (['blocked', 'removed', 'revoked', 'expired', 'disabled'].includes(normalized)) return 'inactive'
  return 'external'
}

export function normalizePartnerDirectoryEntry(row = {}) {
  const primaryContact = row.primaryContact && typeof row.primaryContact === 'object' ? row.primaryContact : {}
  const roles = Array.isArray(row.roles) ? row.roles : [row.roleType || row.partnerType]
  const roleConfigurations = Array.isArray(row.roleConfigurations)
    ? row.roleConfigurations
        .map((configuration) => ({
          id: normalizeText(configuration?.id),
          roleType: normalizeRole(configuration?.roleType || configuration?.role_type),
          isDefault: configuration?.isDefault === true || configuration?.is_preferred_default === true,
          scopeType: normalizeText(configuration?.scopeType || configuration?.scope_type) || 'all_developments',
          scope: configuration?.scope && typeof configuration.scope === 'object' ? configuration.scope : {},
        }))
        .filter((configuration) => configuration.id)
    : []
  return {
    directoryId: normalizeText(row.directoryId || row.directory_id || row.id),
    ownerOrganisationId: normalizeText(row.ownerOrganisationId || row.owner_organisation_id),
    partnerOrganisationId: normalizeText(row.partnerOrganisationId || row.partner_organisation_id),
    relationshipId: normalizeText(row.relationshipId || row.relationship_id),
    externalPartnerId: normalizeText(row.externalPartnerId || row.external_partner_id),
    invitationId: normalizeText(row.invitationId || row.invitation_id),
    displayName: normalizeText(row.displayName || row.display_name || row.companyName || row.name) || 'Partner',
    primaryContact: {
      name: normalizeText(primaryContact.name || row.contactPerson),
      email: normalizeLower(primaryContact.email || row.email || row.emailAddress),
      phone: normalizeText(primaryContact.phone || row.phone || row.phoneNumber),
    },
    website: normalizeText(row.website),
    province: normalizeText(row.province),
    notes: normalizeText(row.notes),
    roles: unique(roles.map(normalizeRole).filter((role) => role !== 'other')),
    roleConfigurations,
    status: normalizeStatus(
      row.status || row.directoryStatus || row.connectionStatus || row.connection_status || row.invitationStatus || row.invitation_status,
    ),
    connectionStatus: normalizeLower(row.connectionStatus || row.connection_status),
    invitationStatus: normalizeLower(row.invitationStatus || row.invitation_status),
    invitationDirection: normalizeLower(row.invitationDirection || row.invitation_direction),
    isPreferred: row.isPreferred === true || row.is_preferred === true || row.isPreferredDefault === true,
    isActive: row.isActive !== false && row.is_active !== false,
    sources: unique(Array.isArray(row.sources) ? row.sources : [row.source]),
    createdAt: row.createdAt || row.created_at || null,
    updatedAt: row.updatedAt || row.updated_at || null,
  }
}

function statusRank(status = '') {
  return { connected: 4, invite_pending: 3, external: 2, inactive: 1 }[normalizeStatus(status)] || 0
}

function mergeDirectoryEntries(current, incoming) {
  if (!current) return normalizePartnerDirectoryEntry(incoming)
  const next = normalizePartnerDirectoryEntry(incoming)
  const preferredStatus = statusRank(next.status) > statusRank(current.status) ? next.status : current.status
  return {
    ...current,
    partnerOrganisationId: current.partnerOrganisationId || next.partnerOrganisationId,
    relationshipId: current.relationshipId || next.relationshipId,
    externalPartnerId: current.externalPartnerId || next.externalPartnerId,
    invitationId: next.invitationId || current.invitationId,
    displayName: current.displayName || next.displayName,
    primaryContact: {
      name: current.primaryContact.name || next.primaryContact.name,
      email: current.primaryContact.email || next.primaryContact.email,
      phone: current.primaryContact.phone || next.primaryContact.phone,
    },
    website: current.website || next.website,
    province: current.province || next.province,
    notes: current.notes || next.notes,
    roles: unique([...current.roles, ...next.roles]),
    roleConfigurations: [
      ...current.roleConfigurations,
      ...next.roleConfigurations.filter(
        (candidate) => !current.roleConfigurations.some((configuration) => configuration.id === candidate.id),
      ),
    ],
    status: preferredStatus,
    connectionStatus: current.connectionStatus || next.connectionStatus,
    invitationStatus: next.invitationStatus || current.invitationStatus,
    invitationDirection: next.invitationDirection || current.invitationDirection,
    isPreferred: current.isPreferred || next.isPreferred,
    isActive: current.isActive || next.isActive,
    sources: unique([...current.sources, ...next.sources]),
    createdAt: current.createdAt || next.createdAt,
    updatedAt: next.updatedAt || current.updatedAt,
  }
}

function relationshipRole(relationship = {}) {
  return normalizeRole(
    relationship.partnerType ||
      relationship.partner_type ||
      relationship.partner?.type ||
      relationship.partner?.organizationType,
  )
}

function invitationCounterparty(invitation = {}, organisationId = '') {
  const ownerId = normalizeText(organisationId)
  const fromId = normalizeText(invitation.fromOrganisationId || invitation.senderOrganisationId)
  const toId = normalizeText(invitation.toOrganisationId || invitation.recipientOrganisationId)
  const incoming = toId === ownerId
  return {
    direction: incoming ? 'incoming' : 'outgoing',
    organisationId: incoming ? fromId : toId,
    externalPartnerId: incoming ? '' : normalizeText(invitation.externalPartnerId || invitation.external_partner_id),
    displayName: incoming
      ? invitation.fromOrganisationName || invitation.fromName
      : invitation.toOrganisationName || invitation.toName,
    email: incoming ? '' : invitation.invitedEmail || invitation.recipientEmail,
    role: normalizeRole(incoming ? invitation.fromWorkspaceType : invitation.partnerType || invitation.toWorkspaceType),
  }
}

export function buildLegacyPartnerDirectory({ preferredPartners = [], relationships = [], invitations = [], organisationId = '' } = {}) {
  const entries = new Map()
  const externalByEmail = new Map()

  const add = (entry) => {
    const normalized = normalizePartnerDirectoryEntry(entry)
    if (!normalized.directoryId) return
    entries.set(normalized.directoryId, mergeDirectoryEntries(entries.get(normalized.directoryId), normalized))
  }

  relationships.forEach((relationship) => {
    const partner = relationship.partner || {}
    const partnerOrganisationId = normalizeText(partner.id || relationship.counterpartOrganisationId || relationship.partnerOrganisationId)
    if (!partnerOrganisationId) return
    add({
      directoryId: `organisation:${partnerOrganisationId}`,
      ownerOrganisationId: organisationId,
      partnerOrganisationId,
      relationshipId: relationship.id,
      displayName: partner.name || partner.displayName,
      roles: [relationshipRole(relationship)],
      status: normalizeLower(relationship.relationshipStatus || relationship.status) === 'accepted' ? 'connected' : relationship.status,
      connectionStatus: relationship.relationshipStatus || relationship.status,
      isPreferred: relationship.preferred || relationship.relationshipType === 'preferred',
      isActive: !['blocked', 'declined', 'removed'].includes(normalizeLower(relationship.relationshipStatus || relationship.status)),
      source: 'organisation_relationship',
      createdAt: relationship.createdAt,
      updatedAt: relationship.updatedAt,
    })
  })

  preferredPartners.forEach((partner) => {
    const partnerOrganisationId = normalizeText(partner.partnerOrganisationId || partner.organisationId)
    const directoryId = partnerOrganisationId ? `organisation:${partnerOrganisationId}` : `external:${partner.id}`
    const email = normalizeLower(partner.email || partner.emailAddress)
    if (email && !partnerOrganisationId) externalByEmail.set(email, directoryId)
    add({
      directoryId,
      ownerOrganisationId: organisationId,
      partnerOrganisationId,
      externalPartnerId: partner.id,
      displayName: partner.companyName || partner.organisationName,
      contactPerson: partner.contactPerson,
      email,
      phone: partner.phone,
      website: partner.website,
      province: partner.province,
      notes: partner.notes,
      roles: [normalizeRole(partner.partnerType)],
      status: partnerOrganisationId && entries.has(`organisation:${partnerOrganisationId}`) ? 'connected' : partner.isActive === false ? 'inactive' : 'external',
      isPreferred: partner.isPreferredDefault,
      isActive: partner.isActive !== false,
      source: partnerOrganisationId ? 'partner_role_default' : 'external_partner',
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
    })
  })

  invitations.forEach((invitation) => {
    const counterpart = invitationCounterparty(invitation, organisationId)
    const email = normalizeLower(counterpart.email)
    const directoryId = counterpart.organisationId
      ? `organisation:${counterpart.organisationId}`
      : counterpart.externalPartnerId
        ? `external:${counterpart.externalPartnerId}`
        : externalByEmail.get(email) || `invitation:${invitation.id}`
    add({
      directoryId,
      ownerOrganisationId: organisationId,
      partnerOrganisationId: counterpart.organisationId,
      externalPartnerId: counterpart.externalPartnerId,
      invitationId: invitation.id,
      displayName: counterpart.displayName,
      email,
      roles: [counterpart.role],
      status: normalizeLower(invitation.status) === 'pending' ? 'invite_pending' : invitation.status,
      invitationStatus: invitation.status,
      invitationDirection: counterpart.direction,
      isPreferred: invitation.preferred,
      isActive: !['revoked', 'expired', 'cancelled'].includes(normalizeLower(invitation.status)),
      source: 'partner_invitation',
      createdAt: invitation.createdAt,
      updatedAt: invitation.respondedAt || invitation.createdAt,
    })
  })

  return [...entries.values()].sort((left, right) => {
    if (left.isPreferred !== right.isPreferred) return left.isPreferred ? -1 : 1
    return left.displayName.localeCompare(right.displayName)
  })
}

function isMissingDirectoryRpc(error = {}) {
  const code = normalizeText(error.code)
  const message = normalizeLower(error.message)
  return code === '42883' || code === 'PGRST202' || message.includes('bridge_list_organisation_partner_directory') && message.includes('not')
}

export async function listUnifiedPartnerDirectory(organisationId = '') {
  const scopedOrganisationId = normalizeText(organisationId)
  if (!scopedOrganisationId || !isSupabaseConfigured || !supabase) {
    return { available: false, partners: [], canManage: false }
  }

  const result = await supabase.rpc('bridge_list_organisation_partner_directory', {
    p_organisation_id: scopedOrganisationId,
  })
  if (result.error) {
    if (isMissingDirectoryRpc(result.error)) return { available: false, partners: [], canManage: false }
    throw result.error
  }
  if (result.data?.success === false) {
    throw new Error(result.data.code || 'Unable to load partner directory.')
  }

  return {
    available: true,
    partners: (Array.isArray(result.data?.partners) ? result.data.partners : []).map(normalizePartnerDirectoryEntry),
    canManage: result.data?.canManage === true,
  }
}

export const __partnerDirectoryServiceTestUtils = {
  invitationCounterparty,
  mergeDirectoryEntries,
  normalizeRole,
  normalizeStatus,
}
