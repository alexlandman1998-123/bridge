import { buildRentalListingIndexRow } from './rentalListingIndexModel.js'

const text = (value) => String(value ?? '').trim()
const lower = (value) => text(value).toLowerCase()
const number = (value) => Number(value || 0) || 0

export const RENTAL_LEAD_MATCHING_VERSION = 'arch9_rental_lead_matching_v1'

function locationText(listing = {}) {
  return [listing.propertyAddress, listing.formattedAddress, listing.streetAddress, listing.suburb, listing.city, listing.title, listing.listingTitle].map(lower).join(' ')
}

export function scoreRentalLeadListingMatch(lead = {}, listing = {}) {
  const row = buildRentalListingIndexRow(listing)
  const desiredArea = lower(lead.desiredArea)
  const budget = number(lead.monthlyBudget)
  const bedrooms = number(lead.bedrooms)
  const monthlyRent = number(row.monthlyRent)
  const locationMatch = Boolean(desiredArea && locationText({ ...listing, ...row }).includes(desiredArea))
  const budgetMatch = !budget || !monthlyRent || monthlyRent <= budget
  const budgetNearMatch = !budget || !monthlyRent || monthlyRent <= budget * 1.1
  const bedroomMatch = !bedrooms || !row.bedrooms || row.bedrooms >= bedrooms
  const score = (locationMatch ? 50 : 0) + (budgetMatch ? 30 : budgetNearMatch ? 15 : 0) + (bedroomMatch ? 20 : 0)
  return {
    listing: row, score, locationMatch, budgetMatch, budgetNearMatch, bedroomMatch,
    recommendation: score >= 80 ? 'strong_match' : score >= 50 ? 'possible_match' : 'review',
  }
}

export function buildRentalLeadListingMatches(lead = {}, listings = []) {
  if (lower(lead.role) !== 'tenant') return []
  return (Array.isArray(listings) ? listings : []).map((listing) => scoreRentalLeadListingMatch(lead, listing)).sort((left, right) => right.score - left.score)
}
