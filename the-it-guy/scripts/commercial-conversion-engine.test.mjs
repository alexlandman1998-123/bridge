import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  buildCommercialConversionDashboard,
  buildCommercialConversionSuggestion,
  buildCommercialConversionTimeline,
  buildCommercialLeadConversionDraft,
  buildCommercialRelationshipGraph,
  categorizeCommercialMatchScore,
  scoreCommercialBuyerListingMatch,
  scoreCommercialRequirementVacancyMatch,
} from '../src/modules/commercial/commercialConversionEngine.js'

const detailSource = await fs.readFile(new URL('../src/modules/commercial/pages/CommercialLeadDetailPage.jsx', import.meta.url), 'utf8')

const baseLead = {
  id: 'lead-1',
  companyName: 'Alex Properties',
  contactName: 'John Smith',
  phone: '082 123 4567',
  email: 'john@example.test',
  area: 'Sandton',
  propertyCategory: 'office',
  assignedBrokerId: 'broker-1',
  notes: 'Qualified opportunity',
}

const landlordVacancy = buildCommercialLeadConversionDraft({
  ...baseLead,
  prospectRole: 'landlord',
  propertyName: 'The Atrium',
  propertyAddress: '1 Main Road, Sandton',
  askingRental: 145,
  availableSizeSqm: 480,
}, 'vacancy')

assert.equal(landlordVacancy.target_type, 'vacancy')
assert.equal(landlordVacancy.created_from_type, 'lead')
assert.equal(landlordVacancy.created_from_id, 'lead-1')
assert.equal(landlordVacancy.landlord_name, 'Alex Properties')
assert.equal(landlordVacancy.property_name, 'The Atrium')
assert.equal(landlordVacancy.metadata_json.conversion_engine, 'CommercialConversionEngine')
assert.equal(landlordVacancy.metadata_json.conversion_event.title, 'Vacancy Created')
assert.ok(landlordVacancy.metadata_json.relationship_graph.nodes.some((node) => node.type === 'vacancy'))
assert.ok(landlordVacancy.required_additional_capture.includes('Rental'))

const tenantRequirement = buildCommercialLeadConversionDraft({
  ...baseLead,
  id: 'tenant-lead-1',
  prospectRole: 'tenant',
  preferredAreas: ['Sandton', 'Rosebank'],
  budgetPerSqm: 150,
  occupationDate: '2026-08-01',
}, 'tenant_requirement')

assert.equal(tenantRequirement.target_type, 'tenant_requirement')
assert.equal(tenantRequirement.requirement_type, 'lease')
assert.equal(tenantRequirement.created_from_id, 'tenant-lead-1')
assert.deepEqual(tenantRequirement.preferred_locations, ['Sandton', 'Rosebank'])
assert.equal(tenantRequirement.metadata_json.conversion_event.title, 'Requirement Created')

const sellerListing = buildCommercialLeadConversionDraft({
  ...baseLead,
  id: 'seller-lead-1',
  prospectRole: 'seller',
  propertyName: 'Northpoint Office',
  listingPrice: 12500000,
}, 'listing')

assert.equal(sellerListing.target_type, 'listing')
assert.equal(sellerListing.listing_type, 'sale')
assert.equal(sellerListing.created_from_id, 'seller-lead-1')
assert.equal(sellerListing.metadata_json.conversion_event.title, 'Listing Created')

const buyerRequirement = buildCommercialLeadConversionDraft({
  ...baseLead,
  id: 'buyer-lead-1',
  prospectRole: 'buyer',
  purchaseBudget: 15000000,
  fundingStatus: 'Approved',
}, 'buyer_requirement')

assert.equal(buyerRequirement.target_type, 'buyer_requirement')
assert.equal(buyerRequirement.requirement_type, 'purchase')
assert.equal(buyerRequirement.created_from_id, 'buyer-lead-1')
assert.equal(buyerRequirement.funding_status, 'Approved')

const leaseDeal = buildCommercialLeadConversionDraft({ ...baseLead, prospectRole: 'tenant' }, 'deal')
assert.equal(leaseDeal.target_type, 'deal')
assert.equal(leaseDeal.deal_type, 'lease')
assert.deepEqual(leaseDeal.required_relationships, ['Tenant Requirement', 'Vacancy', 'Tenant', 'Landlord'])

const saleDeal = buildCommercialLeadConversionDraft({ ...baseLead, prospectRole: 'buyer' }, 'deal')
assert.equal(saleDeal.deal_type, 'sale')
assert.deepEqual(saleDeal.required_relationships, ['Buyer Requirement', 'Listing', 'Buyer', 'Seller'])

const hotDraft = buildCommercialLeadConversionDraft({ ...baseLead, prospectRole: 'tenant', budgetPerSqm: 150 }, 'hot')
assert.equal(hotDraft.target_type, 'hot')
assert.equal(hotDraft.metadata_json.conversion_event.title, 'HOT Created')

const offerDraft = buildCommercialLeadConversionDraft({ ...baseLead, prospectRole: 'buyer', purchaseBudget: 12000000 }, 'offer')
assert.equal(offerDraft.target_type, 'offer')
assert.equal(offerDraft.metadata_json.conversion_event.title, 'Offer Submitted')

const graph = buildCommercialRelationshipGraph({ ...baseLead, prospectRole: 'buyer' }, { buyer_requirement: buyerRequirement, listing: sellerListing, deal: saleDeal })
assert.equal(graph.graph_type, 'sales_relationship_graph')
assert.equal(graph.edges.length, 3)

const timeline = buildCommercialConversionTimeline({ ...baseLead, prospectRole: 'landlord' }, { vacancy: landlordVacancy })
assert.ok(timeline.some((event) => event.label === 'Lead Created' && event.complete))
assert.ok(timeline.some((event) => event.label === 'Vacancy Created' && event.complete))

assert.equal(buildCommercialConversionSuggestion({ ...baseLead, prospectRole: 'seller' }, 82).target_type, 'listing')
assert.equal(buildCommercialConversionSuggestion({ ...baseLead, prospectRole: 'buyer' }, 65), null)

assert.equal(categorizeCommercialMatchScore(91), 'Excellent Match')
assert.equal(categorizeCommercialMatchScore(76), 'Strong Match')
assert.equal(categorizeCommercialMatchScore(56), 'Possible Match')
assert.equal(categorizeCommercialMatchScore(30), 'Weak Match')

const leasingMatch = scoreCommercialRequirementVacancyMatch(
  {
    asset_class: 'office',
    preferred_locations: ['Sandton'],
    budget_min: 100,
    budget_max: 160,
    min_size_m2: 300,
    max_size_m2: 600,
    grade: 'A',
    parking: '4 bays / 100 sqm',
    power: 'Backup',
    meeting_rooms: 'Required',
  },
  {
    asset_class: 'office',
    area_node: 'Sandton CBD',
    asking_rental: 145,
    available_area_m2: 480,
    grade: 'A',
    parking: '4 bays / 100 sqm',
    power: 'Backup',
    meeting_rooms: 'Available',
  },
)
assert.ok(leasingMatch.score >= 75, `expected leasing match to be strong, got ${leasingMatch.score}`)
assert.match(leasingMatch.category, /Strong Match|Excellent Match/)

const salesMatch = scoreCommercialBuyerListingMatch(
  {
    asset_class: 'office',
    preferred_locations: ['Sandton'],
    budget_min: 10000000,
    budget_max: 15000000,
    funding_status: 'approved',
    grade: 'A',
    parking: 'Basement',
    power: 'Backup',
    meeting_rooms: 'Required',
  },
  {
    asset_class: 'office',
    area_node: 'Sandton',
    pricing: 12500000,
    grade: 'A',
    parking: 'Basement',
    power: 'Backup',
    meeting_rooms: 'Available',
  },
)
assert.ok(salesMatch.score >= 75, `expected sales match to be strong, got ${salesMatch.score}`)
assert.match(salesMatch.category, /Strong Match|Excellent Match/)
assert.ok(salesMatch.criteria.includes('Funding Position'))

const dashboard = buildCommercialConversionDashboard({
  prospects: [{ id: 'p1' }],
  leads: [
    { prospectRole: 'landlord' },
    { prospectRole: 'tenant' },
    { prospectRole: 'seller' },
    { prospectRole: 'buyer' },
  ],
  vacancies: [{}],
  tenantRequirements: [{}],
  buyerRequirements: [{}],
  listings: [{}],
  deals: [{ dealType: 'lease' }, { dealType: 'sale', stage: 'offer accepted' }],
  leases: [{}],
})
assert.equal(dashboard.leasing.vacancies, 1)
assert.equal(dashboard.sales.listings, 1)
assert.ok(dashboard.conversion_matrix.includes('Prospect -> Lead'))
assert.ok(dashboard.conversion_matrix.includes('Accepted Match -> Deal'))

for (const marker of [
  'buildCommercialLeadConversionDraft',
  'buildCommercialConversionTimeline',
  'buildCommercialRelationshipGraph',
  'CommercialConversionLineagePanel',
  'Commercial Conversion Engine',
  'Created From',
  'Converted To',
  'Related Objects',
  'commercial-create-vacancy-draft',
  'commercial-create-requirement-draft',
  'commercial-create-sales-listing-draft',
  'commercial-create-deal-draft',
  'commercial-create-hot-draft',
  'commercial-create-offer-draft',
  'commercial-submit-offer-draft',
]) {
  assert.match(detailSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `detail page should include ${marker}`)
}

console.log('commercial conversion engine tests passed')
