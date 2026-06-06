import { isSupabaseConfigured, supabase } from '../lib/supabaseClient'

const ACCESS_DENIED_MESSAGE = 'Partner sharing is not available for this listing.'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeUuid(value = '') {
  const normalized = normalizeText(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : ''
}

function normalizeOption(row = {}) {
  return {
    relationshipId: normalizeUuid(row.relationship_id || row.relationshipId),
    partnerOrganisationId: normalizeUuid(row.partner_organisation_id || row.partnerOrganisationId),
    partnerName: normalizeText(row.partner_name || row.partnerName) || 'Partner organisation',
    partnerType: normalizeText(row.partner_type || row.partnerType),
    relationshipType: normalizeText(row.relationship_type || row.relationshipType),
    isShared: row.is_shared === true || row.isShared === true,
  }
}

function requireClient() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured.')
  }
  return supabase
}

export async function getListingPartnerShareOptions(listingId = '') {
  const safeListingId = normalizeUuid(listingId)
  if (!safeListingId) return []

  const client = requireClient()
  const { data, error } = await client.rpc('get_listing_partner_share_options_phase3', {
    p_listing_id: safeListingId,
  })

  if (error) throw error
  if (data?.error_code) throw new Error(ACCESS_DENIED_MESSAGE)

  return Array.isArray(data?.options) ? data.options.map(normalizeOption).filter((option) => option.relationshipId) : []
}

export async function shareListingWithPartner({ relationshipId = '', listingId = '' } = {}) {
  const safeRelationshipId = normalizeUuid(relationshipId)
  const safeListingId = normalizeUuid(listingId)
  if (!safeRelationshipId || !safeListingId) throw new Error(ACCESS_DENIED_MESSAGE)

  const client = requireClient()
  const { data, error } = await client.rpc('share_partner_listing_phase3', {
    p_relationship_id: safeRelationshipId,
    p_listing_id: safeListingId,
  })

  if (error) throw error
  if (data?.error_code) throw new Error(ACCESS_DENIED_MESSAGE)
  return data
}

export async function unshareListingWithPartner({ relationshipId = '', listingId = '' } = {}) {
  const safeRelationshipId = normalizeUuid(relationshipId)
  const safeListingId = normalizeUuid(listingId)
  if (!safeRelationshipId || !safeListingId) throw new Error(ACCESS_DENIED_MESSAGE)

  const client = requireClient()
  const { data, error } = await client.rpc('unshare_partner_listing_phase3', {
    p_relationship_id: safeRelationshipId,
    p_listing_id: safeListingId,
  })

  if (error) throw error
  if (data?.error_code) throw new Error(ACCESS_DENIED_MESSAGE)
  return data
}
