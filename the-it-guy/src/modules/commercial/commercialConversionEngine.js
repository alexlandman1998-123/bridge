import { getCommercialAssetConfiguration, normalizeCommercialAssetClass } from './commercialAssetConfiguration.js'
import { normalizeKey, normalizeText } from './commercialProspectFormatters.js'

export const COMMERCIAL_CONVERSION_EVENTS = {
  prospectConvertedToLead: 'Prospect Converted To Lead',
  leadCreated: 'Lead Created',
  vacancyCreated: 'Vacancy Created',
  requirementCreated: 'Requirement Created',
  listingCreated: 'Listing Created',
  matchAccepted: 'Match Accepted',
  dealCreated: 'Deal Created',
  hotCreated: 'HOT Created',
  hotSigned: 'HOT Signed',
  offerSubmitted: 'Offer Submitted',
  leaseExecuted: 'Lease Executed',
}

const LEAD_OBJECT_LABELS = {
  vacancy: 'Vacancy',
  tenant_requirement: 'Requirement',
  buyer_requirement: 'Buyer Requirement',
  listing: 'Listing',
  deal: 'Deal',
  hot: 'HOT',
  offer: 'Offer',
}

function firstText(...values) {
  return values.map((value) => normalizeText(value)).find(Boolean) || ''
}

function firstNumber(...values) {
  for (const value of values) {
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function firstArray(...values) {
  for (const value of values) {
    if (Array.isArray(value) && value.length) return value
    if (typeof value === 'string' && normalizeText(value)) return value.split(/[,;|]/).map((item) => normalizeText(item)).filter(Boolean)
  }
  return []
}

function getRoleSpecific(record = {}) {
  return record.roleSpecific || record.role_specific || record.metadata?.roleSpecific || record.metadata_json?.roleSpecific || {}
}

function getPreserved(record = {}) {
  return getRoleSpecific(record).preservedProspectData || {}
}

export function inferCommercialLeadType(record = {}) {
  const role = normalizeKey(record.prospectRole || record.prospect_role || record.prospectType || record.prospect_type || record.leadType || record.lead_type)
  if (role.includes('tenant') || role.includes('occupier')) return 'tenant'
  if (role.includes('landlord')) return 'landlord'
  if (role.includes('buyer') || role.includes('purchaser')) return 'buyer'
  if (role.includes('seller') || role.includes('owner')) return 'seller'
  return normalizeKey(record.dealType || record.deal_type) === 'sale' ? 'seller' : 'landlord'
}

export function inferCommercialDealType(record = {}) {
  const explicit = normalizeKey(record.dealType || record.deal_type)
  if (explicit === 'sale') return 'sale'
  if (explicit === 'lease') return 'lease'
  return ['seller', 'buyer'].includes(inferCommercialLeadType(record)) ? 'sale' : 'lease'
}

export function getCommercialConversionAssetClass(record = {}) {
  const preserved = getPreserved(record)
  return normalizeCommercialAssetClass(record.propertyCategory || record.property_category || preserved.assetClass || record.assetClass || record.asset_class || record.propertyType || record.property_type)
}

function leadName(record = {}) {
  const preserved = getPreserved(record)
  return firstText(record.companyName, record.company_name, record.displayName, record.display_name, preserved.companyName, record.contactName, record.contact_name) || 'Commercial lead'
}

function contactName(record = {}) {
  const preserved = getPreserved(record)
  return firstText(record.contactName, record.contact_name, preserved.contactPerson, [record.firstName, record.lastName].filter(Boolean).join(' ')) || null
}

function contactPhone(record = {}) {
  const preserved = getPreserved(record)
  return firstText(record.phone, record.contactNumber, record.contact_number, preserved.contactNumber) || null
}

function contactEmail(record = {}) {
  const preserved = getPreserved(record)
  return firstText(record.email, preserved.email) || null
}

function brokerId(record = {}) {
  const preserved = getPreserved(record)
  return firstText(record.assignedBrokerId, record.assigned_broker_id, record.broker_id, record.brokerId, preserved.brokerId) || null
}

function area(record = {}) {
  const preserved = getPreserved(record)
  return firstText(record.area, record.preferredArea, record.preferred_area, record.areaNode, record.area_node, record.propertyAddress, record.property_address, preserved.area, preserved.address) || null
}

function propertyAddress(record = {}) {
  const roleSpecific = getRoleSpecific(record)
  const preserved = getPreserved(record)
  return firstText(record.propertyAddress, record.property_address, roleSpecific.propertyAddress, roleSpecific.property_address, record.formatted_address, preserved.address, record.area) || null
}

function propertyName(record = {}) {
  const roleSpecific = getRoleSpecific(record)
  return firstText(record.propertyName, record.property_name, roleSpecific.propertyName, roleSpecific.property_name, roleSpecific.propertyDetails, roleSpecific.property_details) || propertyAddress(record) || null
}

export function buildCommercialLineage(source = {}, sourceType = 'lead') {
  return {
    created_from_type: sourceType,
    created_from_id: source.id || source.source_lead_id || null,
  }
}

export function buildCommercialConversionEvent(eventType, source = {}, target = {}) {
  return {
    event_type: eventType,
    title: eventType,
    source_type: target.created_from_type || 'lead',
    source_id: target.created_from_id || source.id || null,
    target_type: target.target_type || target.entity_type || null,
    target_id: target.id || null,
    created_at: new Date().toISOString(),
  }
}

function withConversionMetadata(payload = {}, source = {}, targetType = '') {
  const lineage = buildCommercialLineage(source, 'lead')
  const eventTitle = targetType === 'vacancy'
    ? COMMERCIAL_CONVERSION_EVENTS.vacancyCreated
    : targetType === 'listing'
      ? COMMERCIAL_CONVERSION_EVENTS.listingCreated
      : targetType.includes('requirement')
        ? COMMERCIAL_CONVERSION_EVENTS.requirementCreated
        : targetType === 'deal'
          ? COMMERCIAL_CONVERSION_EVENTS.dealCreated
          : targetType === 'hot'
            ? COMMERCIAL_CONVERSION_EVENTS.hotCreated
            : targetType === 'offer'
              ? COMMERCIAL_CONVERSION_EVENTS.offerSubmitted
              : COMMERCIAL_CONVERSION_EVENTS.leadCreated
  return {
    ...payload,
    ...lineage,
    metadata_json: {
      ...(payload.metadata_json || {}),
      conversion_engine: 'CommercialConversionEngine',
      conversion_event: buildCommercialConversionEvent(eventTitle, source, { ...lineage, target_type: targetType }),
      relationship_graph: buildCommercialRelationshipGraph(source, { [targetType]: payload }),
    },
  }
}

export function buildCommercialLeadConversionDraft(lead = {}, targetType = '') {
  const leadType = inferCommercialLeadType(lead)
  const dealType = inferCommercialDealType(lead)
  const assetClass = getCommercialConversionAssetClass(lead)
  const roleSpecific = getRoleSpecific(lead)
  const common = {
    source: `commercial_${dealType}_${leadType}_lead`,
    source_lead_id: lead.id || null,
    company_name: leadName(lead),
    contact_name: contactName(lead),
    phone: contactPhone(lead),
    email: contactEmail(lead),
    asset_class: assetClass,
    area_node: area(lead),
    assigned_broker: brokerId(lead),
    broker_id: brokerId(lead),
    notes: firstText(lead.notes, roleSpecific.qualificationNotes, roleSpecific.qualification_notes, getPreserved(lead).notes) || null,
    status: 'draft',
  }

  if (targetType === 'vacancy') {
    return withConversionMetadata({
      ...common,
      target_type: 'vacancy',
      landlord_name: leadName(lead),
      property_name: propertyName(lead),
      formatted_address: propertyAddress(lead),
      vacancy_type: assetClass,
      broker_assignment: brokerId(lead),
      available_area_m2: firstNumber(lead.availableSizeSqm, lead.available_size_sqm, roleSpecific.availableSizeSqm, roleSpecific.available_size_sqm),
      asking_rental: firstNumber(lead.askingRental, lead.asking_rental, roleSpecific.askingRental, roleSpecific.asking_rental),
      availability_date: firstText(lead.availabilityDate, lead.availability_date, roleSpecific.availabilityDate, roleSpecific.availability_date) || null,
      operating_costs: firstNumber(lead.operatingCosts, lead.operating_costs, roleSpecific.operatingCosts, roleSpecific.operating_costs),
      minimum_lease_term: firstText(lead.leaseTermPreference, lead.lease_term_preference, roleSpecific.leaseTermPreference, roleSpecific.lease_term_preference) || null,
      required_additional_capture: ['Available Area', 'Rental', 'Availability Date', 'Operating Costs', 'Lease Term'],
    }, lead, 'vacancy')
  }

  if (targetType === 'tenant_requirement' || (targetType === 'requirement' && leadType === 'tenant')) {
    const preferredAreas = firstArray(lead.preferredAreas, lead.preferred_areas, roleSpecific.preferredAreas, roleSpecific.preferred_areas, area(lead))
    return withConversionMetadata({
      ...common,
      target_type: 'tenant_requirement',
      requirement_type: 'lease',
      client_type: 'tenant',
      requirement_name: `${leadName(lead)} Requirement`,
      preferred_locations: preferredAreas,
      property_type: assetClass,
      budget_max: firstNumber(lead.budgetPerSqm, lead.budget_per_sqm, roleSpecific.budgetPerSqm, roleSpecific.budget_per_sqm, lead.monthlyBudget, lead.monthly_budget),
      target_occupation_date: firstText(lead.occupationDate, lead.occupation_date, roleSpecific.occupationDate, roleSpecific.occupation_date) || null,
      special_requirements: firstText(lead.specialRequirements, lead.special_requirements, roleSpecific.specialRequirements, roleSpecific.special_requirements) || null,
      required_additional_capture: ['Power Requirements', 'Parking Requirements', 'Special Requirements'],
    }, lead, 'tenant_requirement')
  }

  if (targetType === 'listing') {
    return withConversionMetadata({
      ...common,
      target_type: 'listing',
      listing_type: 'sale',
      seller_name: leadName(lead),
      title: propertyName(lead) || `${leadName(lead)} Listing`,
      property_name: propertyName(lead),
      formatted_address: propertyAddress(lead),
      listing_category: assetClass,
      ownership_type: firstText(lead.ownershipType, lead.ownership_type, roleSpecific.ownershipType, roleSpecific.ownership_type) || null,
      pricing: firstNumber(lead.listingPrice, lead.listing_price, roleSpecific.listingPrice, roleSpecific.listing_price),
      required_additional_capture: ['Listing Price', 'Marketing Notes', 'Listing Visibility'],
    }, lead, 'listing')
  }

  if (targetType === 'buyer_requirement' || (targetType === 'requirement' && leadType === 'buyer')) {
    const preferredAreas = firstArray(lead.preferredAreas, lead.preferred_areas, roleSpecific.preferredAreas, roleSpecific.preferred_areas, area(lead))
    return withConversionMetadata({
      ...common,
      target_type: 'buyer_requirement',
      requirement_type: 'purchase',
      client_type: 'buyer',
      requirement_name: `${leadName(lead)} Buyer Requirement`,
      preferred_locations: preferredAreas,
      property_type: assetClass,
      budget_max: firstNumber(lead.purchaseBudget, lead.purchase_budget, roleSpecific.purchaseBudget, roleSpecific.purchase_budget, lead.maxPurchasePrice, lead.max_purchase_price),
      funding_type: firstText(lead.fundingType, lead.funding_type, roleSpecific.fundingType, roleSpecific.funding_type) || null,
      funding_status: firstText(lead.fundingStatus, lead.funding_status, roleSpecific.fundingStatus, roleSpecific.funding_status) || null,
      required_additional_capture: ['Investment Objectives', 'Special Requirements'],
    }, lead, 'buyer_requirement')
  }

  if (targetType === 'deal') {
    return withConversionMetadata({
      ...common,
      target_type: 'deal',
      deal_type: dealType,
      deal_name: `${leadName(lead)} ${dealType === 'sale' ? 'Sale' : 'Lease'} Deal`,
      stage: 'lead',
      deal_value: firstNumber(lead.listingPrice, lead.listing_price, lead.purchaseBudget, lead.purchase_budget, roleSpecific.listingPrice, roleSpecific.purchaseBudget),
      required_relationships: dealType === 'sale' ? ['Buyer Requirement', 'Listing', 'Buyer', 'Seller'] : ['Tenant Requirement', 'Vacancy', 'Tenant', 'Landlord'],
    }, lead, 'deal')
  }

  if (targetType === 'hot') {
    return withConversionMetadata({
      ...common,
      target_type: 'hot',
      deal_type: 'lease',
      document_type: 'heads_of_terms',
      title: `${leadName(lead)} Heads Of Terms`,
      status: 'draft',
      rental: firstNumber(lead.askingRental, lead.asking_rental, lead.budgetPerSqm, lead.budget_per_sqm, roleSpecific.askingRental, roleSpecific.budgetPerSqm),
      escalation: firstText(lead.escalation, roleSpecific.escalation) || null,
      lease_term: firstText(lead.leaseTerm, lead.lease_term, lead.leaseTermPreference, lead.lease_term_preference, roleSpecific.leaseTerm, roleSpecific.leaseTermPreference) || null,
      deposit: firstText(lead.deposit, roleSpecific.deposit) || null,
      occupation_date: firstText(lead.occupationDate, lead.occupation_date, lead.availabilityDate, lead.availability_date, roleSpecific.occupationDate, roleSpecific.availabilityDate) || null,
      incentives: firstText(lead.incentives, roleSpecific.incentives) || null,
      required_additional_capture: ['Escalation', 'Deposit', 'Lease Term', 'Occupation Date', 'Conditions'],
    }, lead, 'hot')
  }

  if (targetType === 'offer') {
    return withConversionMetadata({
      ...common,
      target_type: 'offer',
      deal_type: 'sale',
      document_type: 'offer_to_purchase',
      title: `${leadName(lead)} Offer`,
      status: 'draft',
      offer_amount: firstNumber(lead.offerAmount, lead.offer_amount, lead.purchaseBudget, lead.purchase_budget, roleSpecific.offerAmount, roleSpecific.purchaseBudget),
      deposit: firstText(lead.deposit, roleSpecific.deposit) || null,
      conditions: firstText(lead.conditions, roleSpecific.conditions, roleSpecific.specialRequirements, roleSpecific.special_requirements) || null,
      occupation_date: firstText(lead.occupationDate, lead.occupation_date, lead.purchaseTimeline, lead.purchase_timeline, roleSpecific.occupationDate, roleSpecific.purchaseTimeline) || null,
      required_additional_capture: ['Offer Amount', 'Deposit', 'Conditions', 'Occupation Date'],
    }, lead, 'offer')
  }

  return withConversionMetadata(common, lead, targetType || 'lead')
}

export function buildCommercialRelationshipGraph(source = {}, convertedObjects = {}) {
  const leadType = inferCommercialLeadType(source)
  const dealType = inferCommercialDealType(source)
  const nodes = [
    { id: source.id || 'lead', type: 'lead', label: leadName(source), role: leadType },
  ]
  Object.entries(convertedObjects || {}).forEach(([type, value]) => {
    if (!value) return
    nodes.push({
      id: value.id || value.source_lead_id || `${type}_${source.id || 'draft'}`,
      type,
      label: value.title || value.requirement_name || value.vacancy_name || value.deal_name || LEAD_OBJECT_LABELS[type] || type,
      created_from_id: value.created_from_id || source.id || null,
    })
  })
  const edges = nodes.slice(1).map((node) => ({ from: source.id || 'lead', to: node.id, relationship: 'converted_to' }))
  return {
    graph_type: dealType === 'sale' ? 'sales_relationship_graph' : 'leasing_relationship_graph',
    source_role: leadType,
    nodes,
    edges,
  }
}

export function buildCommercialConversionTimeline(source = {}, convertedObjects = {}) {
  const leadType = inferCommercialLeadType(source)
  const events = [
    { label: 'Prospect Created', complete: Boolean(source.createdAt || source.created_at), entity_type: 'prospect' },
    { label: 'Lead Created', complete: true, entity_type: 'lead', entity_id: source.id || null },
  ]
  const conversions = [
    ['vacancy', COMMERCIAL_CONVERSION_EVENTS.vacancyCreated],
    ['tenant_requirement', COMMERCIAL_CONVERSION_EVENTS.requirementCreated],
    ['buyer_requirement', COMMERCIAL_CONVERSION_EVENTS.requirementCreated],
    ['listing', COMMERCIAL_CONVERSION_EVENTS.listingCreated],
    ['deal', COMMERCIAL_CONVERSION_EVENTS.dealCreated],
    ['hot', COMMERCIAL_CONVERSION_EVENTS.hotCreated],
    ['offer', COMMERCIAL_CONVERSION_EVENTS.offerSubmitted],
  ]
  conversions.forEach(([key, label]) => {
    const object = convertedObjects[key]
    if (object) events.push({ label, complete: true, entity_type: key, entity_id: object.id || null })
  })
  if (leadType === 'landlord' && !convertedObjects.vacancy) events.push({ label: 'Ready to Create Vacancy', complete: false, entity_type: 'vacancy' })
  if (leadType === 'tenant' && !convertedObjects.tenant_requirement) events.push({ label: 'Ready to Create Requirement', complete: false, entity_type: 'tenant_requirement' })
  if (leadType === 'seller' && !convertedObjects.listing) events.push({ label: 'Ready to Create Listing', complete: false, entity_type: 'listing' })
  if (leadType === 'buyer' && !convertedObjects.buyer_requirement) events.push({ label: 'Ready to Create Requirement', complete: false, entity_type: 'buyer_requirement' })
  return events
}

export function buildCommercialConversionSuggestion(source = {}, readinessPercentage = 0) {
  const leadType = inferCommercialLeadType(source)
  if (readinessPercentage < 80) return null
  if (leadType === 'landlord') return { label: 'Ready to Create Vacancy', target_type: 'vacancy' }
  if (leadType === 'tenant') return { label: 'Ready to Create Requirement', target_type: 'tenant_requirement' }
  if (leadType === 'seller') return { label: 'Ready to Create Listing', target_type: 'listing' }
  if (leadType === 'buyer') return { label: 'Ready to Create Requirement', target_type: 'buyer_requirement' }
  return null
}

export function buildCommercialConversionDashboard({
  prospects = [],
  leads = [],
  vacancies = [],
  tenantRequirements = [],
  buyerRequirements = [],
  listings = [],
  deals = [],
  leases = [],
} = {}) {
  const leadCounts = leads.reduce((counts, lead) => {
    const leadType = inferCommercialLeadType(lead)
    return { ...counts, [leadType]: (counts[leadType] || 0) + 1 }
  }, { landlord: 0, tenant: 0, seller: 0, buyer: 0 })

  return {
    total_prospects: prospects.length,
    total_leads: leads.length,
    leasing: {
      landlord_leads: leadCounts.landlord,
      tenant_leads: leadCounts.tenant,
      vacancies: vacancies.length,
      requirements: tenantRequirements.length,
      deals: deals.filter((deal) => inferCommercialDealType(deal) === 'lease').length,
      leases: leases.length,
    },
    sales: {
      seller_leads: leadCounts.seller,
      buyer_leads: leadCounts.buyer,
      listings: listings.length,
      buyer_requirements: buyerRequirements.length,
      deals: deals.filter((deal) => inferCommercialDealType(deal) === 'sale').length,
      offers: deals.filter((deal) => normalizeKey(deal.stage || deal.status).includes('offer')).length,
    },
    conversion_matrix: [
      'Prospect -> Lead',
      'Landlord Lead -> Vacancy',
      'Tenant Lead -> Requirement',
      'Seller Lead -> Listing',
      'Buyer Lead -> Buyer Requirement',
      'Accepted Match -> Deal',
      'Lease Deal -> HOT',
      'Sale Deal -> Offer',
    ],
  }
}

function scoreByEquality(left, right, points) {
  if (!normalizeText(left) || !normalizeText(right)) return 0
  return normalizeKey(left) === normalizeKey(right) ? points : 0
}

function scoreByRange(target, low, high, points) {
  const value = Number(target)
  if (!Number.isFinite(value) || value <= 0) return 0
  const min = Number(low)
  const max = Number(high)
  if (Number.isFinite(min) && value < min) return 0
  if (Number.isFinite(max) && value > max) return Math.round(points / 2)
  return points
}

export function categorizeCommercialMatchScore(score = 0) {
  if (score >= 90) return 'Excellent Match'
  if (score >= 75) return 'Strong Match'
  if (score >= 55) return 'Possible Match'
  return 'Weak Match'
}

export function scoreCommercialRequirementVacancyMatch(requirement = {}, vacancy = {}) {
  const assetClass = normalizeCommercialAssetClass(requirement.asset_class || requirement.property_type || vacancy.asset_class || vacancy.vacancy_type)
  const config = getCommercialAssetConfiguration(assetClass)
  const preferredAreas = firstArray(requirement.preferred_locations, requirement.preferredAreas, requirement.area_node)
  const areaScore = preferredAreas.some((item) => normalizeKey(vacancy.area_node || vacancy.suburb || vacancy.city || vacancy.formatted_address).includes(normalizeKey(item))) ? 25 : 0
  const assetScore = scoreByEquality(assetClass, vacancy.asset_class || vacancy.vacancy_type || vacancy.property_type, 20)
  const budgetScore = scoreByRange(vacancy.asking_rental || vacancy.rental, requirement.budget_min, requirement.budget_max, 20)
  const sizeScore = scoreByRange(vacancy.available_area_m2 || vacancy.size_m2, requirement.min_size_m2, requirement.max_size_m2, 15)
  const ruleScore = Math.min(20, (config.matchingRules || []).reduce((sum, rule) => {
    const key = normalizeKey(rule)
    return sum + (normalizeText(requirement[key] || vacancy[key]) ? 4 : 0)
  }, 0))
  const score = Math.max(0, Math.min(100, areaScore + assetScore + budgetScore + sizeScore + ruleScore))
  return { score, category: categorizeCommercialMatchScore(score), criteria: config.matchingRules || [] }
}

export function scoreCommercialBuyerListingMatch(requirement = {}, listing = {}) {
  const assetClass = normalizeCommercialAssetClass(requirement.asset_class || requirement.property_type || listing.asset_class || listing.listing_category)
  const config = getCommercialAssetConfiguration(assetClass)
  const preferredAreas = firstArray(requirement.preferred_locations, requirement.preferredAreas, requirement.area_node)
  const areaScore = preferredAreas.some((item) => normalizeKey(listing.area_node || listing.suburb || listing.city || listing.formatted_address).includes(normalizeKey(item))) ? 25 : 0
  const assetScore = scoreByEquality(assetClass, listing.asset_class || listing.listing_category || listing.property_type, 20)
  const budgetScore = scoreByRange(listing.pricing || listing.listing_price, requirement.budget_min, requirement.budget_max, 20)
  const fundingScore = ['confirmed', 'proof_received', 'approved'].includes(normalizeKey(requirement.funding_status)) ? 15 : 5
  const ruleScore = Math.min(20, (config.matchingRules || []).reduce((sum, rule) => {
    const key = normalizeKey(rule)
    return sum + (normalizeText(requirement[key] || listing[key]) ? 4 : 0)
  }, 0))
  const score = Math.max(0, Math.min(100, areaScore + assetScore + budgetScore + fundingScore + ruleScore))
  return { score, category: categorizeCommercialMatchScore(score), criteria: ['Area', 'Budget', 'Asset Class', 'Size', 'Timeline', 'Funding Position', ...(config.matchingRules || [])] }
}
