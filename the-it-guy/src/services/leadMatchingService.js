import { createAgencyCrmLeadActivity } from '../lib/agencyCrmRepository'
import { buildRequirementSummary, getLeadRequirement, listLeadRequirements, mapLeadRequirement } from './leadRequirementService'
import { listLeadListingInterests, listSearchablePrivateListings, upsertLeadListingInterest } from './leadListingInterestService'

const AVAILABLE_STATUS_HINTS = ['active', 'available', 'live', 'published', 'mandate_signed', 'ready']
const UNAVAILABLE_STATUS_HINTS = ['sold', 'archived', 'withdrawn', 'converted', 'removed', 'inactive', 'expired']

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeToken(value) {
  return normalizeLower(value).replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeNumber(value) {
  if (normalizeText(value) === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  const text = normalizeText(value)
  if (!text) return []
  return text.split(/[,;\n]/).map(normalizeText).filter(Boolean)
}

function includesToken(haystack = '', needle = '') {
  const normalizedHaystack = normalizeToken(haystack)
  const normalizedNeedle = normalizeToken(needle)
  if (!normalizedHaystack || !normalizedNeedle) return false
  return normalizedHaystack === normalizedNeedle || normalizedHaystack.includes(normalizedNeedle)
}

function readListingNumber(listing = {}, keys = []) {
  const raw = listing?.raw && typeof listing.raw === 'object' ? listing.raw : {}
  const propertyDetails = raw?.propertyDetails && typeof raw.propertyDetails === 'object' ? raw.propertyDetails : {}
  for (const key of keys) {
    const value = normalizeNumber(listing?.[key] ?? raw?.[key] ?? propertyDetails?.[key])
    if (value !== null) return value
  }
  return null
}

function readListingText(listing = {}, keys = []) {
  const raw = listing?.raw && typeof listing.raw === 'object' ? listing.raw : {}
  const propertyDetails = raw?.propertyDetails && typeof raw.propertyDetails === 'object' ? raw.propertyDetails : {}
  const onboarding = raw?.onboarding && typeof raw.onboarding === 'object' ? raw.onboarding : {}
  const onboardingFormData = onboarding?.formData && typeof onboarding.formData === 'object' ? onboarding.formData : {}
  for (const key of keys) {
    const value = normalizeText(listing?.[key] ?? raw?.[key] ?? propertyDetails?.[key] ?? onboardingFormData?.[key])
    if (value) return value
  }
  return ''
}

function getListingFeatureText(listing = {}) {
  const raw = listing?.raw && typeof listing.raw === 'object' ? listing.raw : {}
  const propertyDetails = raw?.propertyDetails && typeof raw.propertyDetails === 'object' ? raw.propertyDetails : {}
  const marketing = raw?.marketing && typeof raw.marketing === 'object' ? raw.marketing : {}
  return [
    listing.title,
    listing.address,
    listing.suburb,
    listing.city,
    listing.province,
    listing.propertyType,
    ...(Array.isArray(listing.features) ? listing.features : []),
    ...(Array.isArray(propertyDetails.features) ? propertyDetails.features : []),
    propertyDetails.securityFeatures,
    propertyDetails.description,
    marketing.description,
    raw.description,
  ].map(normalizeText).filter(Boolean).join(' ')
}

function getListingStatusBucket(listing = {}) {
  const status = normalizeLower(listing.status || listing.listingStatus || listing.listing_status)
  if (UNAVAILABLE_STATUS_HINTS.some((hint) => status.includes(hint))) return 'unavailable'
  if (AVAILABLE_STATUS_HINTS.some((hint) => status.includes(hint))) return 'available'
  return 'unknown'
}

function pushReason(reasons, type, text) {
  if (text) reasons.push({ type, text })
}

function scoreBudget(listing, requirement, reasons) {
  const price = readListingNumber(listing, ['price', 'askingPrice', 'asking_price'])
  const min = normalizeNumber(requirement.budgetMin ?? requirement.budget_min)
  const max = normalizeNumber(requirement.budgetMax ?? requirement.budget_max)
  if (min === null && max === null) return 0
  if (price === null) {
    pushReason(reasons, 'missing', 'Listing price missing')
    return 0
  }
  if (max !== null && price > max) {
    pushReason(reasons, 'mismatch', 'Price above max budget')
    return 0
  }
  if (min !== null && price < min) {
    pushReason(reasons, 'mismatch', 'Price below min budget')
    return 0
  }
  pushReason(reasons, 'match', 'Price within budget')
  return 30
}

function scoreLocation(listing, requirement, reasons) {
  const suburbs = normalizeArray(requirement.suburbs)
  const areas = normalizeArray(requirement.areas)
  const city = normalizeText(requirement.city)
  const province = normalizeText(requirement.province)
  if (!suburbs.length && !areas.length && !city && !province) return 0

  const listingSuburb = readListingText(listing, ['suburb'])
  const listingCity = readListingText(listing, ['city'])
  const listingProvince = readListingText(listing, ['province'])
  const locationText = [listingSuburb, listingCity, listingProvince, listing.address, listing.title].join(' ')
  if (!normalizeText(locationText)) {
    pushReason(reasons, 'missing', 'Listing location missing')
    return 0
  }
  if (suburbs.some((item) => includesToken(listingSuburb, item) || includesToken(locationText, item))) {
    pushReason(reasons, 'match', 'Suburb matches preferred area')
    return 25
  }
  if (areas.some((item) => includesToken(locationText, item))) {
    pushReason(reasons, 'match', 'Area matches preferred location')
    return 22
  }
  if (city && includesToken(listingCity, city)) {
    pushReason(reasons, 'match', 'City matches requirement')
    return 15
  }
  if (province && includesToken(listingProvince, province)) {
    pushReason(reasons, 'match', 'Province matches requirement')
    return 8
  }
  pushReason(reasons, 'mismatch', 'Suburb outside preferred areas')
  return 0
}

function scorePropertyType(listing, requirement, reasons) {
  const requiredTypes = normalizeArray(requirement.propertyTypes ?? requirement.property_types)
  if (!requiredTypes.length) return 0
  const listingType = readListingText(listing, ['propertyType', 'property_type'])
  if (!listingType) {
    pushReason(reasons, 'missing', 'Property type missing')
    return 0
  }
  const matchedType = requiredTypes.find((type) => includesToken(listingType, type) || includesToken(type, listingType))
  if (!matchedType) {
    pushReason(reasons, 'mismatch', 'Property type outside requirement')
    return 0
  }
  pushReason(reasons, 'match', `Property type matches ${matchedType}`)
  return 15
}

function scoreMinimum(listing, requirement, { requirementKey, listingKeys, points, label, pluralLabel }, reasons) {
  const required = normalizeNumber(requirement[requirementKey])
  if (required === null || required <= 0) return 0
  const actual = readListingNumber(listing, listingKeys)
  if (actual === null) {
    pushReason(reasons, 'missing', `${label} count missing`)
    return 0
  }
  if (actual < required) {
    pushReason(reasons, 'mismatch', `${label} count below requirement`)
    return 0
  }
  pushReason(reasons, 'match', `${actual} ${pluralLabel} meets minimum`)
  return points
}

function scoreParking(listing, requirement, reasons) {
  const garageMin = normalizeNumber(requirement.garagesMin ?? requirement.garages_min)
  const parkingMin = normalizeNumber(requirement.parkingMin ?? requirement.parking_min)
  const required = Math.max(garageMin || 0, parkingMin || 0)
  if (!required) return 0
  const garages = readListingNumber(listing, ['garages'])
  const covered = readListingNumber(listing, ['coveredParking', 'covered_parking'])
  const open = readListingNumber(listing, ['openParking', 'open_parking'])
  const actual = Math.max(garages || 0, (covered || 0) + (open || 0))
  if (!actual) {
    pushReason(reasons, 'missing', 'Parking/garages missing')
    return 0
  }
  if (actual < required) {
    pushReason(reasons, 'mismatch', 'Parking below requirement')
    return 0
  }
  pushReason(reasons, 'match', 'Parking/garages meets minimum')
  return 5
}

function scoreSize(listing, requirement, reasons) {
  const erfMin = normalizeNumber(requirement.erfSizeMin ?? requirement.erf_size_min)
  const floorMin = normalizeNumber(requirement.floorSizeMin ?? requirement.floor_size_min)
  if (!erfMin && !floorMin) return 0
  const erf = readListingNumber(listing, ['erfSize', 'erf_size'])
  const floor = readListingNumber(listing, ['floorSize', 'floor_size'])
  const erfOk = !erfMin || (erf !== null && erf >= erfMin)
  const floorOk = !floorMin || (floor !== null && floor >= floorMin)
  if ((erfMin && erf === null) || (floorMin && floor === null)) {
    pushReason(reasons, 'missing', 'Size data missing')
    return 0
  }
  if (!erfOk || !floorOk) {
    pushReason(reasons, 'mismatch', 'Size below requirement')
    return 0
  }
  pushReason(reasons, 'match', 'Size meets minimum')
  return 5
}

function scoreMustHaves(listing, requirement, reasons) {
  const mustHaves = normalizeArray(requirement.mustHaves ?? requirement.must_haves)
  if (!mustHaves.length) return 0
  const featureText = getListingFeatureText(listing)
  if (!featureText) {
    pushReason(reasons, 'missing', 'Listing feature data missing')
    return 0
  }
  const matched = mustHaves.filter((item) => includesToken(featureText, item))
  const missing = mustHaves.filter((item) => !includesToken(featureText, item))
  if (matched.length) pushReason(reasons, 'match', `Must-have matched: ${matched.join(', ')}`)
  if (missing.length) pushReason(reasons, 'mismatch', `Must-have not visible: ${missing.join(', ')}`)
  return matched.length === mustHaves.length ? 5 : Math.round((matched.length / mustHaves.length) * 5)
}

export function buildMatchReasons({ listing = {}, requirement = {} } = {}) {
  return scoreListingAgainstRequirement({ listing, requirement }).matchReasons
}

export function scoreListingAgainstRequirement({ listing = {}, requirement = {} } = {}) {
  const normalizedRequirement = requirement?.requirementId || requirement?.requirement_id ? mapLeadRequirement(requirement) : requirement
  const reasons = []
  let score = 0
  score += scoreBudget(listing, normalizedRequirement, reasons)
  score += scoreLocation(listing, normalizedRequirement, reasons)
  score += scorePropertyType(listing, normalizedRequirement, reasons)
  score += scoreMinimum(listing, normalizedRequirement, {
    requirementKey: 'bedroomsMin',
    listingKeys: ['bedrooms'],
    points: 10,
    label: 'Bedroom',
    pluralLabel: 'bedrooms',
  }, reasons)
  score += scoreMinimum(listing, normalizedRequirement, {
    requirementKey: 'bathroomsMin',
    listingKeys: ['bathrooms'],
    points: 5,
    label: 'Bathroom',
    pluralLabel: 'bathrooms',
  }, reasons)
  score += scoreParking(listing, normalizedRequirement, reasons)
  score += scoreSize(listing, normalizedRequirement, reasons)
  score += scoreMustHaves(listing, normalizedRequirement, reasons)
  return {
    matchScore: Math.max(0, Math.min(100, score)),
    matchReasons: reasons,
    summary: buildRequirementSummary(normalizedRequirement),
  }
}

function isListingSearchable(listing = {}) {
  return getListingStatusBucket(listing) !== 'unavailable'
}

function decorateMatches({ listings = [], requirement = {}, existingInterests = [] } = {}) {
  const interestByListingId = new Map(existingInterests.map((interest) => [interest.listingId || interest.listing_id, interest]).filter(([id]) => id))
  return listings
    .filter(isListingSearchable)
    .map((listing) => {
      const score = scoreListingAgainstRequirement({ listing, requirement })
      const existingInterest = interestByListingId.get(listing.id) || null
      return {
        ...listing,
        ...score,
        alreadyLinked: Boolean(existingInterest),
        existingInterest,
        statusBucket: getListingStatusBucket(listing),
      }
    })
    .sort((left, right) => {
      if (left.statusBucket !== right.statusBucket) return left.statusBucket === 'available' ? -1 : 1
      if (right.matchScore !== left.matchScore) return right.matchScore - left.matchScore
      return normalizeText(left.title).localeCompare(normalizeText(right.title))
    })
}

export async function findListingsForRequirement({ organisationId = '', requirementId = '', limit = 60 } = {}) {
  const requirement = await getLeadRequirement({ requirementId })
  if (!requirement) return { requirement: null, matches: [] }
  const scopedOrganisationId = normalizeText(organisationId || requirement.organisationId)
  const [listings, existingInterests] = await Promise.all([
    listSearchablePrivateListings({ organisationId: scopedOrganisationId }),
    listLeadListingInterests({ organisationId: scopedOrganisationId, leadId: requirement.leadId }),
  ])
  return {
    requirement,
    matches: decorateMatches({ listings, requirement, existingInterests }).slice(0, limit),
  }
}

export async function findListingsForLead({ organisationId = '', leadId = '', limitPerRequirement = 30 } = {}) {
  const requirements = await listLeadRequirements({ organisationId, leadId })
  const results = await Promise.all(requirements
    .filter((requirement) => requirement.status === 'active')
    .map((requirement) => findListingsForRequirement({ organisationId, requirementId: requirement.requirementId, limit: limitPerRequirement })))
  return results
}

export async function addMatchesToLead({ organisationId = '', leadId = '', requirementId = '', listingIds = [] } = {}, { actor = null } = {}) {
  const requirementResult = await findListingsForRequirement({ organisationId, requirementId, limit: 500 })
  const requirement = requirementResult.requirement
  if (!requirement || requirement.leadId !== leadId) {
    throw new Error('A valid requirement for this lead is required before adding matches.')
  }
  const selectedIds = [...new Set((Array.isArray(listingIds) ? listingIds : []).map(normalizeText).filter(Boolean))]
  if (!selectedIds.length) return []
  const matchesById = new Map(requirementResult.matches.map((match) => [match.id, match]))
  const saved = []
  for (const listingId of selectedIds) {
    const match = matchesById.get(listingId)
    if (!match) continue
    saved.push(await upsertLeadListingInterest(
      {
        organisationId: organisationId || requirement.organisationId,
        leadId,
        contactId: requirement.contactId,
        listingId,
        requirementId,
        source: 'manual_match',
        status: 'suggested',
        isAgentSelected: true,
        matchScore: match.matchScore,
        matchReasons: match.matchReasons,
        createdBy: actor?.id,
      },
      { actor },
    ))
  }
  if (saved.length) {
    try {
      await createAgencyCrmLeadActivity(
        organisationId || requirement.organisationId,
        leadId,
        {
          activityType: 'Matched listing added to lead',
          activityNote: saved.length === 1 ? '1 matched listing added to lead.' : `${saved.length} matched listings added to lead.`,
          outcome: 'manual_match',
        },
        { actor },
      )
    } catch (error) {
      console.warn('[leadMatchingService] activity logging skipped', error)
    }
  }
  return saved
}

export const __leadMatchingServiceTestUtils = {
  decorateMatches,
  getListingStatusBucket,
  scoreListingAgainstRequirement,
  buildMatchReasons,
}
