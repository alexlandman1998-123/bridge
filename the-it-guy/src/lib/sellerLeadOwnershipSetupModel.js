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
    // This marker distinguishes an agent's deliberate selection from the
    // historical compatibility default of "individual".
    ownershipRouteConfirmed: true,
    ownership_route_confirmed: true,
    ownershipDeclarationPending: false,
    ownership_declaration_pending: false,
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
 * Produces the ownership instruction carried into a seller's onboarding link.
 * Agents can send a generic fact-collection link before the legal route is
 * known. A known agent-selected route is locked; an unknown route is declared
 * by the seller and must be reviewed before any formal signing pack is sent.
 */
export function prepareSellerOnboardingRoute({ formData = {}, subject = {}, canonicalSellerFacts = {}, lockedAt = new Date().toISOString() } = {}) {
  const kind = String(subject?.kind || '').trim().toLowerCase()
  if (!ROUTE_MODELS[kind]) {
    return {
      ...formData,
      canonicalSellerFacts: canonicalSellerFacts && typeof canonicalSellerFacts === 'object' ? canonicalSellerFacts : {},
      sellerOwnershipRoute: '',
      seller_ownership_route: '',
      ownershipType: '',
      ownerEntityType: '',
      owner_entity_type: '',
      ownerStructureType: '',
      owner_structure_type: '',
      sellerLegalType: '',
      seller_legal_type: '',
      ownershipDeclarationPending: true,
      ownership_declaration_pending: true,
      ownershipRouteLocked: false,
      ownership_route_locked: false,
      ownershipRouteConfirmed: false,
      ownership_route_confirmed: false,
      ownershipRouteLockedAt: '',
      ownership_route_locked_at: '',
    }
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
    ownershipDeclarationPending: false,
    ownership_declaration_pending: false,
    ownershipRouteLocked: true,
    ownership_route_locked: true,
    ownershipRouteConfirmed: true,
    ownership_route_confirmed: true,
    ownershipRouteLockedAt: lockedAt,
    ownership_route_locked_at: lockedAt,
  }
}
