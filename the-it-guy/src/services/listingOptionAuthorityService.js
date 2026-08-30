const SOURCE_AUTHORITY_RANK = Object.freeze({
  lead_projection: 100,
  canonical_listing: 200,
  canonical_hydrated_listing: 300,
})

function normalizeText(value) {
  return String(value ?? '').trim()
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function readSourceAuthority(option = {}) {
  const explicit = normalizeText(
    option?.sourceAuthority ||
      option?.source_authority ||
      option?.listingOptionSourceAuthority ||
      option?.listing_option_source_authority ||
      option?.sourceListing?.listingOptionSourceAuthority,
  ).toLowerCase()
  return Object.hasOwn(SOURCE_AUTHORITY_RANK, explicit) ? explicit : 'canonical_listing'
}

function sourceCompletenessScore(source = {}) {
  if (!isPlainObject(source)) return 0
  let score = 0
  if (normalizeText(source?.id || source?.listingId || source?.listing_id)) score += 20
  if (normalizeText(source?.sellerLeadId || source?.seller_lead_id || source?.originatingCrmLeadId || source?.originating_crm_lead_id)) score += 15
  if (normalizeText(source?.listingStatus || source?.listing_status || source?.lifecycleStatus || source?.lifecycle_status)) score += 15
  if (normalizeText(source?.mandateStatus || source?.mandate_status)) score += 20
  if (normalizeText(source?.sellerOnboardingStatus || source?.seller_onboarding_status)) score += 15
  if (isPlainObject(source?.sellerOnboarding) || isPlainObject(source?.seller_onboarding)) score += 60
  if (Array.isArray(source?.documents)) score += 30 + Math.min(source.documents.length, 10)
  if (Array.isArray(source?.requirements)) score += 20 + Math.min(source.requirements.length, 10)
  if (isPlainObject(source?.sellerCanonicalFacts || source?.seller_canonical_facts_json)) score += 20
  if (normalizeText(source?.propertyAddress || source?.property_address || source?.addressLine1 || source?.address_line_1 || source?.address)) score += 5
  return score
}

function sourceTimestamp(option = {}) {
  const value = option?.updatedAt || option?.updated_at || option?.sourceListing?.updatedAt || option?.sourceListing?.updated_at
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function sourceRank(option = {}) {
  const authority = readSourceAuthority(option)
  return [
    SOURCE_AUTHORITY_RANK[authority] || 0,
    sourceCompletenessScore(option?.sourceListing),
    sourceTimestamp(option),
  ]
}

function compareRank(left = [], right = []) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = Number(left[index] || 0) - Number(right[index] || 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function selectAuthoritativeListingOptionSource(existingOption = {}, candidateOption = {}) {
  const selected = compareRank(sourceRank(candidateOption), sourceRank(existingOption)) > 0
    ? candidateOption
    : existingOption
  return {
    sourceListing: isPlainObject(selected?.sourceListing) ? selected.sourceListing : {},
    sourceAuthority: readSourceAuthority(selected),
  }
}

export function getListingOptionSourceAuthority(option = {}) {
  return readSourceAuthority(option)
}
