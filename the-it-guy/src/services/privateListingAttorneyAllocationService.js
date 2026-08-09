import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeSelectionSource(value = '') {
  const normalized = normalizeText(value).toLowerCase()
  return ['seller_selected', 'agency_recommended', 'seller_mandate'].includes(normalized)
    ? normalized
    : 'seller_mandate'
}

function normalizeNullableUuid(value) {
  const text = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
}

function isMissingRpcError(error, functionName = '') {
  if (!error) return false
  const code = String(error.code || '').toLowerCase()
  const message = String(error.message || '').toLowerCase()
  return (
    code === '42883' ||
      code === 'pgrst202' ||
      (functionName && message.includes(String(functionName).toLowerCase()))
  )
}

function normalizeAttorneyInput(attorney = {}) {
  const source = attorney && typeof attorney === 'object' ? attorney : {}
  return {
    id: normalizeText(source.id),
    preferredPartnerId: normalizeText(source.preferredPartnerId || source.preferred_partner_id || source.partnerId || source.partner_id || source.id),
    partnerRelationshipId: normalizeText(
      source.partnerRelationshipId ||
        source.partner_relationship_id ||
        source.relationshipId ||
        source.relationship_id,
    ),
    partnerOrganisationId: normalizeText(
      source.partnerOrganisationId ||
        source.partner_organisation_id ||
        source.partnerOrganizationId ||
        source.partner_organization_id ||
        source.organisationId ||
        source.organisation_id,
    ),
    partnerRoleConfigurationId: normalizeText(
      source.partnerRoleConfigurationId ||
        source.partner_role_configuration_id ||
        source.roleConfigurationId ||
        source.role_configuration_id,
    ),
    companyName: normalizeText(source.companyName || source.company_name || source.name || source.label),
    contactPerson: normalizeText(source.contactPerson || source.contact_person),
    email: normalizeText(source.email || source.emailAddress || source.email_address).toLowerCase(),
    phone: normalizeText(source.phone || source.phoneNumber || source.phone_number),
    preferredAttorneyUserId: normalizeText(
      source.preferredAttorneyUserId ||
        source.preferred_attorney_user_id ||
        source.userId ||
        source.user_id ||
        source.selectedPerson?.userId ||
        source.selectedPerson?.id,
    ),
    preferredAttorneyName: normalizeText(source.preferredAttorneyName || source.selectedPerson?.name),
    preferredAttorneyEmail: normalizeText(source.preferredAttorneyEmail || source.selectedPerson?.email).toLowerCase(),
    preferredAttorneyPhone: normalizeText(source.preferredAttorneyPhone || source.selectedPerson?.phone),
  }
}

function buildPrivateListingAttorneyCanonicalPayload({
  legacyPayload,
  partnerRoleConfigurationId,
}) {
  return {
    p_private_listing_id: legacyPayload.p_private_listing_id,
    p_partner_role_configuration_id: partnerRoleConfigurationId,
    p_company_name: legacyPayload.p_company_name,
    p_contact_person: legacyPayload.p_contact_person,
    p_email_address: legacyPayload.p_email_address,
    p_phone_number: legacyPayload.p_phone_number,
    p_selection_source: legacyPayload.p_selection_source,
    p_mandate_packet_id: legacyPayload.p_mandate_packet_id,
    p_mandate_signed_at: legacyPayload.p_mandate_signed_at,
    p_metadata: legacyPayload.p_metadata,
  }
}

async function resolveListingOrganisationId(privateListingId) {
  const listingId = normalizeNullableUuid(privateListingId)
  if (!listingId || !isSupabaseConfigured || !supabase) return null
  const { data, error } = await supabase
    .from('private_listings')
    .select('organisation_id')
    .eq('id', listingId)
    .maybeSingle()
  if (error) return null
  return normalizeNullableUuid(data?.organisation_id)
}

async function resolvePartnerRoleConfigurationId({
  privateListingId = '',
  organisationId = '',
  attorney = {},
} = {}) {
  const normalizedAttorney = normalizeAttorneyInput(attorney)
  const explicitConfigId = normalizeNullableUuid(normalizedAttorney.partnerRoleConfigurationId)
  if (explicitConfigId) return explicitConfigId

  const resolvedOrganisationId = normalizeNullableUuid(organisationId) || await resolveListingOrganisationId(privateListingId)
  if (!resolvedOrganisationId || !isSupabaseConfigured || !supabase) return null

  const partnerOrganisationId = normalizeNullableUuid(normalizedAttorney.partnerOrganisationId)
  const partnerRelationshipId = normalizeNullableUuid(normalizedAttorney.partnerRelationshipId)
  const preferredPartnerId = normalizeNullableUuid(normalizedAttorney.preferredPartnerId)
  if (!partnerOrganisationId && !partnerRelationshipId && !preferredPartnerId) return null

  const { data, error } = await supabase.rpc('bridge_resolve_partner_role_configuration', {
    p_organisation_id: resolvedOrganisationId,
    p_role_type: 'transfer_attorney',
    p_partner_organisation_id: partnerOrganisationId,
    p_partner_relationship_id: partnerRelationshipId,
    p_preferred_partner_id: preferredPartnerId,
  })
  if (error) {
    if (isMissingRpcError(error, 'bridge_resolve_partner_role_configuration')) return null
    throw error
  }
  return normalizeNullableUuid(data)
}

export function buildPrivateListingAttorneyAllocationInput({
  privateListingId,
  attorney = {},
  mandatePacketId = null,
  mandateSignedAt = null,
  source = 'seller_mandate',
  metadata = {},
} = {}) {
  const listingId = normalizeNullableUuid(privateListingId)
  const normalizedAttorney = normalizeAttorneyInput(attorney)
  const companyName = normalizedAttorney.companyName
  if (!listingId) throw new Error('A private listing is required before allocating the transfer attorney.')
  if (!companyName) throw new Error('Select a transfer attorney before finalising the mandate.')
  const preferredAttorneyUserId = normalizeNullableUuid(normalizedAttorney.preferredAttorneyUserId)
  const preferredAttorneyMetadata = preferredAttorneyUserId
    ? {
        preferredAttorneyUserId,
        preferredAttorneyName: normalizedAttorney.preferredAttorneyName,
        preferredAttorneyEmail: normalizedAttorney.preferredAttorneyEmail,
        preferredAttorneyPhone: normalizedAttorney.preferredAttorneyPhone,
      }
    : {}

  return {
    p_private_listing_id: listingId,
    p_preferred_partner_id: normalizeNullableUuid(normalizedAttorney.preferredPartnerId),
    p_company_name: companyName,
    p_contact_person: normalizedAttorney.contactPerson || null,
    p_email_address: normalizedAttorney.email || null,
    p_phone_number: normalizedAttorney.phone || null,
    p_partner_organisation_id: normalizeNullableUuid(normalizedAttorney.partnerOrganisationId),
    p_selection_source: normalizeSelectionSource(source),
    p_mandate_packet_id: normalizeNullableUuid(mandatePacketId),
    p_mandate_signed_at: mandateSignedAt || new Date().toISOString(),
    p_metadata: {
      ...(metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}),
      ...preferredAttorneyMetadata,
    },
  }
}

export function normalizePrivateListingAttorneyAllocation(row = {}) {
  return {
    id: row.id || null,
    organisationId: row.organisation_id || null,
    privateListingId: row.private_listing_id || null,
    roleType: row.role_type || 'transfer_attorney',
    preferredPartnerId: row.preferred_partner_id || null,
    partnerOrganisationId: row.partner_organisation_id || null,
    companyName: normalizeText(row.company_name),
    contactPerson: normalizeText(row.contact_person),
    email: normalizeText(row.email_address).toLowerCase(),
    phone: normalizeText(row.phone_number),
    selectionSource: row.selection_source || 'seller_mandate',
    status: row.allocation_status || 'awaiting_buyer',
    mandatePacketId: row.mandate_packet_id || null,
    mandateSignedAt: row.mandate_signed_at || null,
    selectedAt: row.selected_at || null,
    metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  }
}

export async function allocatePrivateListingTransferAttorney(input = {}) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is required to allocate the transfer attorney.')
  }

  const payload = buildPrivateListingAttorneyAllocationInput(input)
  const partnerRoleConfigurationId = await resolvePartnerRoleConfigurationId({
    privateListingId: input.privateListingId,
    organisationId: input.organisationId,
    attorney: input.attorney,
  })

  if (partnerRoleConfigurationId) {
    const canonicalPayload = buildPrivateListingAttorneyCanonicalPayload({
      legacyPayload: payload,
      partnerRoleConfigurationId,
    })
    const { data, error } = await supabase.rpc('bridge_allocate_private_listing_transfer_attorney_v2', canonicalPayload)
    if (!error) return normalizePrivateListingAttorneyAllocation(data || {})
    if (!isMissingRpcError(error, 'bridge_allocate_private_listing_transfer_attorney_v2')) throw error
  }

  const { data, error } = await supabase.rpc('bridge_allocate_private_listing_transfer_attorney', payload)
  if (error) throw error
  return normalizePrivateListingAttorneyAllocation(data || {})
}

export async function allocatePrivateListingTransferAttorneyPreInstruction(input = {}) {
  const attorney = normalizeAttorneyInput(input.attorney)
  const partnerRoleConfigurationId = await resolvePartnerRoleConfigurationId({
    privateListingId: input.privateListingId,
    organisationId: input.organisationId,
    attorney,
  })

  if (!partnerRoleConfigurationId) {
    return {
      skipped: true,
      reason: attorney.partnerOrganisationId || attorney.preferredPartnerId || attorney.partnerRelationshipId
        ? 'partner_role_configuration_not_found'
        : 'attorney_not_connected',
      attorney,
    }
  }

  const allocation = await allocatePrivateListingTransferAttorney({
    ...input,
    attorney: {
      ...attorney,
      partnerRoleConfigurationId,
    },
    source: input.source || attorney.selectionSource || 'agency_recommended',
  })

  return {
    skipped: false,
    allocation,
    attorney,
  }
}

export async function getPrivateListingTransferAttorneyAllocation(privateListingId) {
  const listingId = normalizeNullableUuid(privateListingId)
  if (!listingId || !isSupabaseConfigured || !supabase) return null

  const { data, error } = await supabase
    .from('private_listing_role_players')
    .select('*')
    .eq('private_listing_id', listingId)
    .eq('role_type', 'transfer_attorney')
    .in('allocation_status', ['awaiting_buyer', 'under_offer', 'instructed'])
    .order('selected_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    if (['42P01', 'PGRST205'].includes(String(error.code || '').toUpperCase())) return null
    throw error
  }
  return data ? normalizePrivateListingAttorneyAllocation(data) : null
}

export async function listPrivateListingTransferAttorneyAllocations(privateListingIds = []) {
  const listingIds = [...new Set(
    (Array.isArray(privateListingIds) ? privateListingIds : [])
      .map(normalizeNullableUuid)
      .filter(Boolean),
  )]
  if (!listingIds.length || !isSupabaseConfigured || !supabase) return []

  const { data, error } = await supabase
    .from('private_listing_role_players')
    .select('*')
    .in('private_listing_id', listingIds)
    .eq('role_type', 'transfer_attorney')
    .in('allocation_status', ['awaiting_buyer', 'under_offer', 'instructed'])
    .order('selected_at', { ascending: false })

  if (error) {
    if (['42P01', 'PGRST205'].includes(String(error.code || '').toUpperCase())) return []
    throw error
  }

  const byListingId = new Map()
  for (const row of Array.isArray(data) ? data : []) {
    const allocation = normalizePrivateListingAttorneyAllocation(row)
    const listingId = normalizeText(allocation.privateListingId)
    if (listingId && !byListingId.has(listingId)) byListingId.set(listingId, allocation)
  }
  return Array.from(byListingId.values())
}
