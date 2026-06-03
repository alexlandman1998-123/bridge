function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export const LEAD_CATEGORY_VALUES = ['buyer', 'seller', 'other']

const BUYER_CATEGORY_KEYS = new Set([
  'buyer',
  'buy',
  'buyer_lead',
  'purchaser',
  'tenant_buyer',
])

const SELLER_CATEGORY_KEYS = new Set([
  'seller',
  'sell',
  'seller_lead',
  'vendor',
  'landlord',
  'landlord_lead',
  'valuation',
  'valuation_request',
  'list_my_property',
  'mandate',
])

const BUYER_SOURCE_KEYS = new Set([
  'property24',
  'private_property',
  'website',
  'whatsapp',
  'website_property_enquiry',
  'whatsapp_property_enquiry',
  'buyer_referral',
  'property_enquiry',
  'viewing_request',
])

const SELLER_SOURCE_KEYS = new Set([
  'valuation_request',
  'website_valuation_request',
  'list_my_property',
  'list_my_property_form',
  'seller_referral',
  'canvassing',
  'seller_onboarding',
  'guided_onboarding',
  'private_listing_wizard',
  'expired_listing',
  'valuation_campaign',
  'owner_database',
])

export function normalizeLeadCategory(value, fallback = 'other') {
  const key = normalizeKey(value)
  if (!key) return fallback === '' ? '' : LEAD_CATEGORY_VALUES.includes(fallback) ? fallback : 'other'
  if (BUYER_CATEGORY_KEYS.has(key) || key.includes('buyer')) return 'buyer'
  if (SELLER_CATEGORY_KEYS.has(key) || key.includes('seller') || key.includes('landlord') || key.includes('mandate')) return 'seller'
  if (key === 'other') return 'other'
  return fallback === '' ? '' : LEAD_CATEGORY_VALUES.includes(fallback) ? fallback : 'other'
}

export function inferLeadCategoryFromSource(source = '', fallback = 'other') {
  const key = normalizeKey(source)
  if (!key) return fallback === '' ? '' : LEAD_CATEGORY_VALUES.includes(fallback) ? fallback : 'other'
  if (SELLER_SOURCE_KEYS.has(key) || key.includes('valuation') || key.includes('list_my_property') || key.includes('seller')) return 'seller'
  if (BUYER_SOURCE_KEYS.has(key) || key.includes('property24') || key.includes('private_property') || key.includes('property_enquiry')) return 'buyer'
  if (key.includes('referral')) return fallback === '' ? '' : LEAD_CATEGORY_VALUES.includes(fallback) ? fallback : 'other'
  return fallback === '' ? '' : LEAD_CATEGORY_VALUES.includes(fallback) ? fallback : 'other'
}

export function inferLeadCategoryFromRecord(record = {}, fallback = 'other') {
  const explicit = normalizeLeadCategory(record?.leadCategory ?? record?.lead_category ?? record?.leadType ?? record?.lead_type, '')
  if (explicit) return explicit

  const sellerSignals = [
    record?.sellerPropertyAddress,
    record?.seller_property_address,
    record?.estimatedValue,
    record?.estimated_value,
    record?.mandatePacketId,
    record?.mandate_packet_id,
    record?.sellerOnboardingToken,
    record?.seller_onboarding_token,
    record?.sellerOnboardingStatus,
    record?.seller_onboarding_status,
    record?.sellerLeadId,
    record?.seller_lead_id,
    record?.originatingCrmLeadId,
    record?.originating_crm_lead_id,
  ].some((value) => Boolean(normalizeText(value)))

  if (sellerSignals) return 'seller'

  const sourceCategory = inferLeadCategoryFromSource(record?.leadSource ?? record?.lead_source ?? record?.source, '')
  if (sourceCategory) return sourceCategory

  const contactCategory = normalizeLeadCategory(record?.contactType ?? record?.contact_type, '')
  if (contactCategory) return contactCategory

  return LEAD_CATEGORY_VALUES.includes(fallback) ? fallback : 'other'
}

export function leadCategoryLabel(value = '') {
  const category = normalizeLeadCategory(value, 'other')
  if (category === 'buyer') return 'Buyer'
  if (category === 'seller') return 'Seller'
  return 'Other'
}
