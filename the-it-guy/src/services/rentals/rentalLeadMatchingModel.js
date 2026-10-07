import { buildRentalListingIndexRow } from './rentalListingIndexModel.js'

const text = (value) => String(value ?? '').trim()
const lower = (value) => text(value).toLowerCase()
const number = (value) => Number(value || 0) || 0

export const RENTAL_LEAD_MATCHING_VERSION = 'arch9_rental_lead_matching_v1'
export const RENTAL_MATCH_BUDGET_TOLERANCE = 1000

export function rentalMatchBudgetRange(value) {
  const budget = Number(value)
  if (!Number.isFinite(budget) || budget <= 0) return null
  return { minimum: Math.max(0, budget - RENTAL_MATCH_BUDGET_TOLERANCE), maximum: budget + RENTAL_MATCH_BUDGET_TOLERANCE }
}

export function isRentalListingWithinBudget(lead = {}, listing = {}) {
  const range = rentalMatchBudgetRange(lead.qualification?.monthlyBudget ?? lead.monthlyBudget)
  const rent = Number(listing.monthlyRent)
  return Boolean(range && isRentalMonthlyRate(listing) && Number.isFinite(rent) && rent > 0 && rent >= range.minimum && rent <= range.maximum)
}

export function isRentalMonthlyRate(listing = {}) {
  return ['', 'monthly'].includes(lower(listing.rentalPriceFrequency))
}

function locationText(listing = {}) {
  return [listing.address, listing.propertyAddress, listing.formattedAddress, listing.streetAddress, listing.suburb, listing.city, listing.title, listing.listingTitle].map(lower).join(' ')
}

export function scoreRentalLeadListingMatch(lead = {}, listing = {}) {
  const row = buildRentalListingIndexRow(listing)
  const desiredArea = lower(lead.desiredArea)
  const budget = number(lead.qualification?.monthlyBudget ?? lead.monthlyBudget)
  const bedrooms = number(lead.bedrooms)
  const monthlyRent = number(row.monthlyRent)
  const areas = desiredArea.split(/[,;\n]+/).map(text).filter(Boolean)
  const locationMatch = areas.some((area) => locationText(row).includes(area))
  const budgetMatch = isRentalListingWithinBudget(lead, row)
  const budgetNearMatch = budgetMatch && monthlyRent > budget
  const bedroomMatch = !bedrooms || (row.bedrooms !== null && row.bedrooms >= bedrooms)
  const score = (locationMatch ? 50 : 0) + (budgetMatch ? 30 : 0) + (bedroomMatch ? 20 : 0)
  return {
    listing: row, score, locationMatch, budgetMatch, budgetNearMatch, bedroomMatch,
    recommendation: score >= 80 && budgetMatch && bedroomMatch ? 'strong_match' : score >= 50 ? 'possible_match' : 'review',
  }
}

export function buildRentalLeadListingMatches(lead = {}, listings = []) {
  if (lower(lead.role) !== 'tenant') return []
  return (Array.isArray(listings) ? listings : []).map((listing) => scoreRentalLeadListingMatch(lead, listing)).sort((left, right) => right.score - left.score)
}
