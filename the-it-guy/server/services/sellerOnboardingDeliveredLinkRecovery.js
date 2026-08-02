const SELLER_ONBOARDING_DELIVERY_TYPE = 'seller_onboarding_link_seller'
const SELLER_ONBOARDING_LINK_KEYS = ['onboardingLink', 'legacyOnboardingLink']
const SELLER_ONBOARDING_LINK_ORIGINS = [
  'https://app.arch9.co.za',
  'https://www.app.arch9.co.za',
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function readFormDataEmail(formData = {}) {
  const source = formData && typeof formData === 'object' && !Array.isArray(formData) ? formData : {}
  return normalizeEmail(
    source.sellerEmail ||
      source.email ||
      source.seller_email ||
      source.contactEmail ||
      source.contact_email,
  )
}

function buildCandidateLinks(token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken) return []
  const encodedToken = encodeURIComponent(normalizedToken)
  return SELLER_ONBOARDING_LINK_ORIGINS.map((origin) => `${origin}/seller/onboarding/${encodedToken}`)
}

function metadataContainsDeliveredToken(metadata = {}, token = '') {
  const normalizedToken = normalizeText(token)
  if (!normalizedToken || !metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false
  return SELLER_ONBOARDING_LINK_KEYS.some((key) => normalizeText(metadata[key]).includes(`/seller/onboarding/${normalizedToken}`))
}

async function queryDeliveredLinkByMetadata(client, token = '') {
  const links = buildCandidateLinks(token)
  for (const key of SELLER_ONBOARDING_LINK_KEYS) {
    for (const link of links) {
      const { data, error } = await client
        .from('communication_deliveries')
        .select('id, organisation_id, recipient, metadata_json, created_at, status, communication_type')
        .eq('communication_type', SELLER_ONBOARDING_DELIVERY_TYPE)
        .contains('metadata_json', { [key]: link })
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) {
        if (['42P01', '42703', '42883'].includes(String(error.code || ''))) return null
        throw error
      }
      if (data?.[0]) return data[0]
    }
  }
  return null
}

async function queryDeliveredLinkByRecentScan(client, token = '') {
  const { data, error } = await client
    .from('communication_deliveries')
    .select('id, organisation_id, recipient, metadata_json, created_at, status, communication_type')
    .eq('communication_type', SELLER_ONBOARDING_DELIVERY_TYPE)
    .order('created_at', { ascending: false })
    .limit(250)
  if (error) {
    if (['42P01', '42703'].includes(String(error.code || ''))) return null
    throw error
  }
  return (data || []).find((row) => metadataContainsDeliveredToken(row.metadata_json, token)) || null
}

async function findDeliveredSellerOnboardingLink(client, token = '') {
  return await queryDeliveredLinkByMetadata(client, token) || await queryDeliveredLinkByRecentScan(client, token)
}

function rowUpdatedTime(row = {}) {
  const parsed = Date.parse(normalizeText(row.updated_at || row.created_at))
  return Number.isFinite(parsed) ? parsed : 0
}

export async function resolveDeliveredSellerOnboardingRecovery(client, token = '', { select = '*' } = {}) {
  const delivery = await findDeliveredSellerOnboardingLink(client, token)
  const organisationId = normalizeText(delivery?.organisation_id)
  const recipientEmail = normalizeEmail(delivery?.recipient)
  if (!delivery?.id || !organisationId || !recipientEmail) return null

  const listings = await client
    .from('private_listings')
    .select('id')
    .eq('organisation_id', organisationId)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (listings.error) throw listings.error
  const listingIds = (listings.data || []).map((listing) => normalizeText(listing.id)).filter(Boolean)
  if (!listingIds.length) return null

  const onboarding = await client
    .from('private_listing_seller_onboarding')
    .select(select)
    .in('private_listing_id', listingIds)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (onboarding.error) throw onboarding.error

  const recovered = (onboarding.data || [])
    .filter((row) => readFormDataEmail(row.form_data) === recipientEmail)
    .sort((left, right) => rowUpdatedTime(right) - rowUpdatedTime(left))[0]
  if (!recovered?.id) return null

  return {
    onboarding: recovered,
    tokenKind: 'delivered_recovery',
    tokenValid: true,
    delivery,
  }
}
