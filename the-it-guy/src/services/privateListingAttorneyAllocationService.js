import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeNullableUuid(value) {
  const text = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null
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
  const companyName = normalizeText(attorney.companyName || attorney.company_name)
  if (!listingId) throw new Error('A private listing is required before allocating the transfer attorney.')
  if (!companyName) throw new Error('Select a transfer attorney before finalising the mandate.')

  return {
    p_private_listing_id: listingId,
    p_partner_role_configuration_id: normalizeNullableUuid(
      attorney.partnerRoleConfigurationId || attorney.partner_role_configuration_id,
    ),
    p_preferred_partner_id: normalizeNullableUuid(attorney.preferredPartnerId || attorney.preferred_partner_id || attorney.id),
    p_company_name: companyName,
    p_contact_person: normalizeText(attorney.contactPerson || attorney.contact_person) || null,
    p_email_address: normalizeText(attorney.email || attorney.emailAddress || attorney.email_address).toLowerCase() || null,
    p_phone_number: normalizeText(attorney.phone || attorney.phoneNumber || attorney.phone_number) || null,
    p_partner_organisation_id: normalizeNullableUuid(attorney.partnerOrganisationId || attorney.partner_organisation_id),
    p_selection_source: ['seller_selected', 'agency_recommended', 'seller_mandate'].includes(normalizeText(source))
      ? normalizeText(source)
      : 'seller_mandate',
    p_mandate_packet_id: normalizeNullableUuid(mandatePacketId),
    p_mandate_signed_at: mandateSignedAt || new Date().toISOString(),
    p_metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {},
  }
}

export function normalizePrivateListingAttorneyAllocation(row = {}) {
  return {
    id: row.id || null,
    organisationId: row.organisation_id || null,
    privateListingId: row.private_listing_id || null,
    roleType: row.role_type || 'transfer_attorney',
    partnerRoleConfigurationId: row.partner_role_configuration_id || null,
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
  if (!payload.p_partner_role_configuration_id) {
    throw new Error('Select a canonical transfer-attorney partner before allocating the mandate.')
  }
  const canonicalPayload = {
    p_private_listing_id: payload.p_private_listing_id,
    p_partner_role_configuration_id: payload.p_partner_role_configuration_id,
    p_company_name: payload.p_company_name,
    p_contact_person: payload.p_contact_person,
    p_email_address: payload.p_email_address,
    p_phone_number: payload.p_phone_number,
    p_selection_source: payload.p_selection_source,
    p_mandate_packet_id: payload.p_mandate_packet_id,
    p_mandate_signed_at: payload.p_mandate_signed_at,
    p_metadata: payload.p_metadata,
  }
  const canonicalResult = await supabase.rpc(
    'bridge_allocate_private_listing_transfer_attorney_v2',
    canonicalPayload,
  )
  if (canonicalResult.error) throw canonicalResult.error
  return normalizePrivateListingAttorneyAllocation(canonicalResult.data || {})
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
