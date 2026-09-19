import { LISTING_SELLER_PROFILE_BRANCHES } from './listingSellerProfileBuilderModel.js'

export const SELLER_LEAD_OWNERSHIP_SETUP_VERSION = 'seller_lead_ownership_setup_phase2_v1'

const ROUTE_MODELS = Object.freeze({
  individual: { ownerEntityType: 'natural_person', ownerStructureType: 'individual', sellerLegalType: 'individual' },
  married: { ownerEntityType: 'natural_person', ownerStructureType: 'married_cop', sellerLegalType: 'individual' },
  multiple_owners: { ownerEntityType: 'natural_person', ownerStructureType: 'multiple_owners', sellerLegalType: 'multiple_owners' },
  company: { ownerEntityType: 'company', ownerStructureType: 'company', sellerLegalType: 'company' },
  trust: { ownerEntityType: 'trust', ownerStructureType: 'trust', sellerLegalType: 'trust' },
  deceased_estate: { ownerEntityType: 'natural_person', ownerStructureType: 'deceased_estate', sellerLegalType: 'deceased_estate' },
  power_of_attorney: { ownerEntityType: 'natural_person', ownerStructureType: 'power_of_attorney', sellerLegalType: 'power_of_attorney' },
  other: { ownerEntityType: 'other', ownerStructureType: 'other', sellerLegalType: 'other' },
  foreign_individual: { ownerEntityType: 'foreign', ownerStructureType: 'foreign_individual', sellerLegalType: 'foreign_individual' },
  foreign_company: { ownerEntityType: 'foreign', ownerStructureType: 'foreign_company', sellerLegalType: 'foreign_company' },
  foreign_trust: { ownerEntityType: 'foreign', ownerStructureType: 'foreign_trust', sellerLegalType: 'foreign_trust' },
})

export const SELLER_LEAD_OWNERSHIP_ROUTES = Object.freeze([
  ...LISTING_SELLER_PROFILE_BRANCHES,
  { value: 'power_of_attorney', label: 'Power of Attorney', description: 'A representative is acting under a recorded authority.' },
].filter((route, index, routes) => route.value && routes.findIndex((candidate) => candidate.value === route.value) === index))

export function applySellerLeadOwnershipRoute(form = {}, route = '') {
  const key = String(route || '').trim().toLowerCase()
  const model = ROUTE_MODELS[key]
  if (!model) return { ...form }
  return {
    ...form,
    sellerOwnershipRoute: key,
    ownershipType: key,
    ...model,
  }
}

export function resolveSellerLeadOwnershipRoute(form = {}) {
  const explicit = String(form.sellerOwnershipRoute || form.ownershipType || form.ownerStructureType || '').trim().toLowerCase()
  if (ROUTE_MODELS[explicit]) return explicit
  if (String(form.ownerEntityType || '').trim().toLowerCase() === 'company') return 'company'
  if (String(form.ownerEntityType || '').trim().toLowerCase() === 'trust') return 'trust'
  return ''
}

/**
 * Produces the immutable ownership instruction carried into a seller's
 * onboarding link. Facts remain editable, but changing the legal route must
 * happen through the agent's ownership setup and a replacement link.
 */
export function prepareSellerOnboardingRoute({ formData = {}, subject = {}, canonicalSellerFacts = {}, lockedAt = new Date().toISOString() } = {}) {
  const kind = String(subject?.kind || '').trim().toLowerCase()
  if (!ROUTE_MODELS[kind]) {
    throw new Error('A recognised seller ownership route is required before onboarding can be prepared.')
  }
  const ownership = subject?.ownership && typeof subject.ownership === 'object' ? subject.ownership : {}
  return {
    ...formData,
    canonicalSellerFacts: canonicalSellerFacts && typeof canonicalSellerFacts === 'object' ? canonicalSellerFacts : {},
    sellerOwnershipRoute: kind,
    seller_ownership_route: kind,
    ownerEntityType: ownership.entityType || ROUTE_MODELS[kind].ownerEntityType,
    owner_entity_type: ownership.entityType || ROUTE_MODELS[kind].ownerEntityType,
    ownerStructureType: ownership.structureType || ROUTE_MODELS[kind].ownerStructureType,
    owner_structure_type: ownership.structureType || ROUTE_MODELS[kind].ownerStructureType,
    ownershipType: ownership.ownershipType || ROUTE_MODELS[kind].sellerLegalType || kind,
    sellerLegalType: kind,
    seller_legal_type: kind,
    ownershipRouteLocked: true,
    ownership_route_locked: true,
    ownershipRouteLockedAt: lockedAt,
    ownership_route_locked_at: lockedAt,
  }
}
