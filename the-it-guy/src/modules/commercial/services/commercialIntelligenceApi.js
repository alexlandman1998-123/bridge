import { listOrganisationUsers } from '../../../lib/settingsApi'
import {
  getCommercialAllDocumentRequests,
  getCommercialAllDocuments,
  getCommercialAllHeadsOfTerms,
  getCommercialDeals,
  getCommercialLandlords,
  getCommercialLeases,
  getCommercialListings,
  getCommercialProperties,
  getCommercialRequirements,
  getCommercialTenants,
  getCommercialVacancies,
  resolveCommercialOrganisationContext,
} from './commercialApi'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeText(value) {
  return String(value || '').trim()
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function daysBetween(left, right) {
  const start = asDate(left)
  const end = asDate(right)
  if (!start || !end) return null
  return Math.ceil((end.getTime() - start.getTime()) / 86400000)
}

function includesAny(text, values = []) {
  const haystack = normalize(text)
  return values.some((value) => {
    const needle = normalize(value)
    return needle && haystack.includes(needle)
  })
}

function active(row = {}) {
  return !['archived', 'inactive', 'closed_lost', 'expired', 'terminated', 'cancelled'].includes(normalize(row.status || row.listing_status || 'active'))
}

function brokerNameFor(id, brokerMap = new Map()) {
  const key = normalizeText(id)
  if (!key) return 'Unassigned'
  return brokerMap.get(key) || 'Assigned broker'
}

function recordDate(row = {}) {
  return row.updated_at || row.created_at || ''
}

function metadataArea(metadata = {}) {
  return toNumber(metadata.gla || metadata.gla_m2 || metadata.warehouse_size || metadata.shop_gla || metadata.land_size || metadata.farm_size)
}

function locationTextFor(property = {}, listing = {}) {
  return [property.suburb, property.city, property.province, property.address, listing.area]
    .filter(Boolean)
    .join(' ')
}

function areaScore(requirement = {}, property = {}, listing = {}) {
  const locations = Array.isArray(requirement.preferred_locations)
    ? requirement.preferred_locations
    : String(requirement.preferred_locations || '').split(',').map((item) => item.trim()).filter(Boolean)
  if (!locations.length) return 25
  return includesAny(locationTextFor(property, listing), locations) ? 25 : 0
}

function propertyTypeScore(requirement = {}, property = {}, listing = {}) {
  const wanted = normalize(requirement.property_type)
  if (!wanted) return 20
  const actual = normalize(listing.listing_category || property.property_type)
  if (!actual) return 0
  if (actual === wanted) return 20
  if ((wanted === 'land' && ['development_land', 'agricultural'].includes(actual)) || (actual === 'land' && ['development_land', 'agricultural'].includes(wanted))) return 16
  return 0
}

function glaScore(requirement = {}, vacancy = {}, listing = {}) {
  const area = toNumber(vacancy.available_area_m2) || metadataArea(listing.metadata_json)
  const min = toNumber(requirement.min_size_m2)
  const max = toNumber(requirement.max_size_m2)
  if (!area || (!min && !max)) return 18
  if ((!min || area >= min) && (!max || area <= max)) return 25
  if (min && area < min) return Math.max(0, Math.round((area / min) * 18))
  if (max && area > max) return Math.max(0, Math.round((max / area) * 18))
  return 0
}

function budgetScore(requirement = {}, vacancy = {}, listing = {}) {
  const price = toNumber(vacancy.asking_rental) || toNumber(listing.pricing)
  const min = toNumber(requirement.budget_min)
  const max = toNumber(requirement.budget_max)
  if (!price || (!min && !max)) return 14
  if ((!min || price >= min) && (!max || price <= max)) return 20
  if (max && price > max) return Math.max(0, Math.round((max / price) * 15))
  if (min && price < min) return 12
  return 0
}

function availabilityScore(requirement = {}, vacancy = {}, listing = {}) {
  const target = asDate(requirement.target_occupation_date)
  const available = asDate(vacancy.availability_date || listing.available_from)
  if (!target || !available) return 7
  if (available <= target) return 10
  const lateDays = daysBetween(target, available)
  if (lateDays !== null && lateDays <= 30) return 7
  if (lateDays !== null && lateDays <= 60) return 4
  return 0
}

export function scoreRequirementVacancyMatch(requirement = {}, vacancy = {}, context = {}) {
  const property = context.propertiesById?.get(vacancy.property_id) || {}
  const listing = context.listingsByVacancyId?.get(vacancy.id) || {}
  const score = areaScore(requirement, property, listing)
    + propertyTypeScore(requirement, property, listing)
    + glaScore(requirement, vacancy, listing)
    + budgetScore(requirement, vacancy, listing)
    + availabilityScore(requirement, vacancy, listing)
  return Math.max(0, Math.min(100, Math.round(score)))
}

export function buildRequirementVacancyMatches({
  requirements = [],
  vacancies = [],
  properties = [],
  listings = [],
  brokers = [],
  limit = 12,
} = {}) {
  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const listingsByVacancyId = new Map(listings.filter((listing) => listing.vacancy_id).map((listing) => [listing.vacancy_id, listing]))
  const brokerMap = new Map(brokers.map((broker) => [normalizeText(broker.userId || broker.user_id || broker.id), broker.name || broker.fullName || broker.email || 'Broker']))

  return requirements
    .filter((requirement) => active(requirement) && !['closed_won', 'closed_lost'].includes(normalize(requirement.stage)))
    .flatMap((requirement) => vacancies
      .filter((vacancy) => active(vacancy) && !['leased', 'occupied'].includes(normalize(vacancy.status)))
      .map((vacancy) => {
        const property = propertiesById.get(vacancy.property_id) || {}
        const listing = listingsByVacancyId.get(vacancy.id) || {}
        const matchPercentage = scoreRequirementVacancyMatch(requirement, vacancy, { propertiesById, listingsByVacancyId })
        return {
          id: `${requirement.id}-${vacancy.id}`,
          requirementId: requirement.id,
          requirementName: requirement.requirement_name || 'Requirement',
          vacancyId: vacancy.id,
          vacancyName: vacancy.vacancy_name || listing.title || 'Vacancy',
          propertyName: property.property_name || 'Property pending',
          area: [property.suburb, property.city].filter(Boolean).join(', ') || property.address || '-',
          availableGla: toNumber(vacancy.available_area_m2) || metadataArea(listing.metadata_json),
          rental: toNumber(vacancy.asking_rental) || toNumber(listing.pricing),
          matchPercentage,
          brokerId: vacancy.broker_assignment || vacancy.broker_id || listing.broker_id || requirement.assigned_broker || requirement.broker_id,
          brokerName: brokerNameFor(vacancy.broker_assignment || vacancy.broker_id || listing.broker_id || requirement.assigned_broker || requirement.broker_id, brokerMap),
          nextAction: 'Create Deal',
        }
      }))
    .filter((match) => match.matchPercentage > 0)
    .sort((left, right) => right.matchPercentage - left.matchPercentage || right.availableGla - left.availableGla)
    .slice(0, limit)
}

function riskBucket(days) {
  if (days === null || days < 0 || days > 180) return null
  if (days <= 30) return { key: '0-30', label: '0-30 days', riskLevel: 'Critical', priority: 4 }
  if (days <= 60) return { key: '31-60', label: '31-60 days', riskLevel: 'High', priority: 3 }
  if (days <= 90) return { key: '61-90', label: '61-90 days', riskLevel: 'Medium', priority: 2 }
  return { key: '91-180', label: '91-180 days', riskLevel: 'Low', priority: 1 }
}

export function buildVacancyRiskSummary({ leases = [], properties = [], tenants = [], landlords = [] } = {}) {
  const today = startOfToday()
  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant]))
  const landlordsById = new Map(landlords.map((landlord) => [landlord.id, landlord]))
  const empty = [
    { key: '0-30', label: '0-30 days', riskLevel: 'Critical', leases: 0, glaAtRisk: 0, rentalExposure: 0, priority: 4 },
    { key: '31-60', label: '31-60 days', riskLevel: 'High', leases: 0, glaAtRisk: 0, rentalExposure: 0, priority: 3 },
    { key: '61-90', label: '61-90 days', riskLevel: 'Medium', leases: 0, glaAtRisk: 0, rentalExposure: 0, priority: 2 },
    { key: '91-180', label: '91-180 days', riskLevel: 'Low', leases: 0, glaAtRisk: 0, rentalExposure: 0, priority: 1 },
  ]
  const buckets = new Map(empty.map((bucket) => [bucket.key, { ...bucket, records: [] }]))

  leases.forEach((lease) => {
    if (!active(lease)) return
    const days = daysBetween(today, lease.lease_end_date)
    const bucket = riskBucket(days)
    if (!bucket) return
    const row = buckets.get(bucket.key)
    const property = propertiesById.get(lease.property_id) || {}
    const tenant = tenantsById.get(lease.tenant_id) || {}
    const landlord = landlordsById.get(lease.landlord_id || property.landlord_id) || {}
    const gla = toNumber(property.available_space_m2) || toNumber(property.gla_m2)
    row.leases += 1
    row.glaAtRisk += gla
    row.rentalExposure += toNumber(lease.monthly_rental)
    row.records.push({
      id: lease.id,
      leaseId: lease.id,
      propertyName: property.property_name || 'Property pending',
      tenantName: tenant.name || 'Tenant pending',
      landlordName: landlord.name || 'Landlord pending',
      leaseEndDate: lease.lease_end_date,
      daysToExpiry: days,
      glaAtRisk: gla,
      rentalExposure: toNumber(lease.monthly_rental),
      riskLevel: bucket.riskLevel,
    })
  })

  const rows = Array.from(buckets.values()).sort((left, right) => right.priority - left.priority)
  return {
    rows,
    records: rows.flatMap((row) => row.records),
    totalLeases: rows.reduce((sum, row) => sum + row.leases, 0),
    totalGlaAtRisk: rows.reduce((sum, row) => sum + row.glaAtRisk, 0),
    totalRentalExposure: rows.reduce((sum, row) => sum + row.rentalExposure, 0),
  }
}

function mediaItems(listing = {}) {
  const media = listing.media_json || {}
  return {
    photos: Array.isArray(media.photos) ? media.photos : [],
    videos: Array.isArray(media.videos) ? media.videos : [],
    brochure: media.brochure || media.brochure_url || null,
    floorPlan: media.floor_plan || media.floorPlan || media.floor_plan_url || null,
  }
}

export function scoreListingQuality(listing = {}, context = {}) {
  const property = context.propertiesById?.get(listing.property_id) || {}
  const metadata = listing.metadata_json || {}
  const media = mediaItems(listing)
  const missing = []
  let score = 0

  if (normalizeText(listing.title)) score += 10
  else missing.push('Title')
  if (normalizeText(listing.description) && normalizeText(listing.description).length > 40) score += 12
  else missing.push('Description')
  if (normalizeText(locationTextFor(property, listing))) score += 8
  else missing.push('Location')

  if (toNumber(listing.pricing)) score += 10
  else missing.push('Price/rental')
  if (metadataArea(metadata) || toNumber(property.gla_m2) || toNumber(property.available_space_m2)) score += 10
  else missing.push('GLA')

  if (media.photos.length) score += 8
  else missing.push('Photos')
  if (media.brochure) score += 6
  else missing.push('Brochure')
  if (media.floorPlan) score += 6
  else missing.push('Floor Plan')

  const categoryFieldCount = Object.values(metadata).filter((value) => value !== null && value !== undefined && value !== '').length
  if (categoryFieldCount >= 6) score += 20
  else {
    score += Math.min(16, categoryFieldCount * 3)
    missing.push(normalize(listing.listing_category) === 'industrial' ? 'Power Supply' : 'Category-specific fields')
  }

  if (normalizeText(listing.broker_id)) score += 5
  else missing.push('Broker assigned')
  if (normalizeText(listing.available_from)) score += 5
  else missing.push('Availability date')

  return {
    listingId: listing.id,
    title: listing.title || 'Commercial listing',
    score: Math.max(0, Math.min(100, Math.round(score))),
    missing: Array.from(new Set(missing)).slice(0, 6),
    status: listing.listing_status || listing.status || 'draft',
  }
}

export function buildListingQualityScores({ listings = [], properties = [] } = {}) {
  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  return listings
    .map((listing) => ({
      ...scoreListingQuality(listing, { propertiesById }),
      listing,
      to: `/commercial/listings/${listing.id}`,
    }))
    .sort((left, right) => left.score - right.score || String(left.title).localeCompare(String(right.title)))
}

export function buildBrokerLeaderboard({ brokers = [], deals = [], headsOfTerms = [], leases = [], requirements = [], activity = [] } = {}) {
  const brokerRows = (brokers || []).map((broker) => {
    const id = normalizeText(broker.userId || broker.user_id || broker.id)
    const name = broker.name || broker.fullName || [broker.firstName, broker.lastName].filter(Boolean).join(' ') || broker.email || 'Broker'
    const brokerDeals = deals.filter((deal) => normalizeText(deal.assigned_broker || deal.broker_id) === id && active(deal))
    const brokerRequirements = requirements.filter((requirement) => normalizeText(requirement.assigned_broker || requirement.broker_id) === id && active(requirement))
    const brokerHots = headsOfTerms.filter((hot) => normalizeText(hot.broker_id) === id || brokerDeals.some((deal) => deal.id === hot.deal_id))
    const brokerLeases = leases.filter((lease) => normalizeText(lease.broker_id) === id || brokerDeals.some((deal) => deal.id === lease.deal_id))
    const lastActivity = [
      broker.lastActiveAt || broker.last_active_at,
      ...brokerDeals.map(recordDate),
      ...brokerRequirements.map(recordDate),
      ...brokerHots.map(recordDate),
      ...brokerLeases.map(recordDate),
      ...activity.filter((row) => normalizeText(row.created_by) === id || normalizeText(row.broker_id) === id).map((row) => row.created_at),
    ].map(asDate).filter(Boolean).sort((left, right) => right - left)[0]

    return {
      id,
      name,
      branchId: broker.branchId || broker.branch_id || '',
      branchName: broker.branchName || 'Commercial branch',
      activeRequirements: brokerRequirements.length,
      activeDeals: brokerDeals.length,
      hotsSent: brokerHots.filter((hot) => !['draft', 'archived', 'superseded'].includes(normalize(hot.status))).length,
      hotsSigned: brokerHots.filter((hot) => ['signed', 'ready_for_lease', 'approved_by_landlord', 'approved_by_tenant'].includes(normalize(hot.status))).length,
      leasesCreated: brokerLeases.filter(active).length,
      pipelineValue: brokerDeals.reduce((sum, deal) => sum + toNumber(deal.deal_value), 0),
      commissionValue: brokerDeals.reduce((sum, deal) => sum + toNumber(deal.estimated_commission), 0),
      lastActivityAt: lastActivity?.toISOString() || null,
    }
  })

  return brokerRows.sort((left, right) => right.pipelineValue - left.pipelineValue || right.activeDeals - left.activeDeals)
}

export function buildNextBestActions({
  requirements = [],
  vacancies = [],
  properties = [],
  listings = [],
  deals = [],
  leases = [],
  headsOfTerms = [],
  documentRequests = [],
  documents = [],
  matches = [],
  qualityScores = [],
} = {}) {
  const today = startOfToday()
  const actions = []
  const hotFollowUps = headsOfTerms.filter((hot) => active(hot) && ['sent', 'under_review', 'approved_by_landlord', 'approved_by_tenant'].includes(normalize(hot.status)))
  if (hotFollowUps.length) actions.push({ id: 'hots-follow-up', title: `${hotFollowUps.length} HOTs need follow-up`, reason: 'Heads of Terms are in circulation or awaiting signature.', priority: 'High', relatedRecord: hotFollowUps[0]?.premises_description || 'Heads of Terms', cta: 'Review HOTs', to: '/commercial/heads-of-terms' })

  const leases60 = leases.filter((lease) => {
    const days = daysBetween(today, lease.lease_end_date)
    return active(lease) && days !== null && days >= 0 && days <= 60
  })
  if (leases60.length) actions.push({ id: 'leases-60', title: `${leases60.length} leases expire in 60 days`, reason: 'Future vacancy exposure needs renewal or backfill planning.', priority: 'High', relatedRecord: leases60[0]?.id ? `Lease ${String(leases60[0].id).slice(0, 8)}` : 'Lease watch', cta: 'Open risk watch', to: '/commercial/lease-expiry-watch' })

  const matchedRequirementIds = new Set(matches.filter((match) => match.matchPercentage >= 60).map((match) => match.requirementId))
  const unmatchedRequirements = requirements.filter((requirement) => active(requirement) && !['closed_won', 'closed_lost'].includes(normalize(requirement.stage)) && !matchedRequirementIds.has(requirement.id))
  if (unmatchedRequirements.length) actions.push({ id: 'requirements-no-matches', title: `${unmatchedRequirements.length} requirements have no strong vacancy matches`, reason: 'No vacancy currently scores above 60% against these requirements.', priority: 'Medium', relatedRecord: unmatchedRequirements[0]?.requirement_name || 'Requirement', cta: 'Review requirements', to: '/commercial/requirements' })

  const brochureMissing = qualityScores.filter((score) => score.missing.includes('Brochure'))
  if (brochureMissing.length) actions.push({ id: 'listings-missing-brochures', title: `${brochureMissing.length} listings are missing brochures`, reason: 'Listing quality improves when marketing packs are complete.', priority: 'Medium', relatedRecord: brochureMissing[0]?.title || 'Listing', cta: 'Improve listings', to: '/commercial/listings' })

  const staleDeals = deals.filter((deal) => {
    const updated = asDate(deal.updated_at || deal.created_at)
    if (!active(deal) || !updated) return false
    return daysBetween(updated, today) >= 14
  })
  if (staleDeals.length) actions.push({ id: 'stale-deals', title: `${staleDeals.length} deals have had no activity in 14 days`, reason: 'Deal momentum may be at risk.', priority: 'Medium', relatedRecord: staleDeals[0]?.deal_name || 'Deal', cta: 'Open deals', to: '/commercial/deals/leasing' })

  const overdueRequests = documentRequests.filter((request) => {
    const due = asDate(request.due_date)
    return due && due < today && !['completed', 'approved', 'archived'].includes(normalize(request.status))
  })
  if (overdueRequests.length) actions.push({ id: 'overdue-documents', title: `${overdueRequests.length} document requests are overdue`, reason: 'Outstanding compliance items can block HOT and lease progress.', priority: 'High', relatedRecord: overdueRequests[0]?.document_name || 'Document request', cta: 'Open documents', to: '/commercial/documents' })

  const emptyVacancies = vacancies.filter((vacancy) => active(vacancy) && !toNumber(vacancy.available_area_m2))
  if (emptyVacancies.length) actions.push({ id: 'vacancy-gla-missing', title: `${emptyVacancies.length} vacancies need GLA captured`, reason: 'Vacancy matching needs available area data.', priority: 'Low', relatedRecord: emptyVacancies[0]?.vacancy_name || 'Vacancy', cta: 'Review vacancies', to: '/commercial/vacancies' })

  return actions
    .map((action, index) => ({ ...action, sort: ({ High: 3, Medium: 2, Low: 1 }[action.priority] || 0), index }))
    .sort((left, right) => right.sort - left.sort || left.index - right.index)
    .slice(0, 8)
}

export function buildCommercialIntelligence(data = {}) {
  const matches = buildRequirementVacancyMatches(data)
  const vacancyRisk = buildVacancyRiskSummary(data)
  const listingQualityScores = buildListingQualityScores(data)
  const brokerLeaderboard = buildBrokerLeaderboard(data)
  const nextBestActions = buildNextBestActions({
    ...data,
    matches,
    qualityScores: listingQualityScores,
  })
  return {
    matches,
    vacancyRisk,
    listingQualityScores,
    listingsNeedingAttention: listingQualityScores.filter((score) => score.score < 80).slice(0, 8),
    brokerLeaderboard,
    nextBestActions,
  }
}

async function loadCommercialIntelligenceSource(organisationId) {
  const context = await resolveCommercialOrganisationContext()
  const resolvedOrganisationId = organisationId || context.organisationId
  if (!resolvedOrganisationId) return {}
  const [landlords, tenants, properties, requirements, deals, leases, vacancies, listings, documents, documentRequests, headsOfTerms, brokers] = await Promise.all([
    getCommercialLandlords(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
    getCommercialVacancies(resolvedOrganisationId),
    getCommercialListings(resolvedOrganisationId),
    getCommercialAllDocuments(resolvedOrganisationId),
    getCommercialAllDocumentRequests(resolvedOrganisationId),
    getCommercialAllHeadsOfTerms(resolvedOrganisationId),
    listOrganisationUsers().catch(() => []),
  ])
  return { landlords, tenants, properties, requirements, deals, leases, vacancies, listings, documents, documentRequests, headsOfTerms, brokers }
}

export async function getRequirementVacancyMatches(organisationId) {
  return buildRequirementVacancyMatches(await loadCommercialIntelligenceSource(organisationId))
}

export async function getVacancyRiskSummary(organisationId) {
  return buildVacancyRiskSummary(await loadCommercialIntelligenceSource(organisationId))
}

export async function getListingQualityScores(organisationId) {
  return buildListingQualityScores(await loadCommercialIntelligenceSource(organisationId))
}

export async function getNextBestActions(organisationId) {
  const source = await loadCommercialIntelligenceSource(organisationId)
  const matches = buildRequirementVacancyMatches(source)
  const qualityScores = buildListingQualityScores(source)
  return buildNextBestActions({ ...source, matches, qualityScores })
}

export async function getBrokerLeaderboard(organisationId) {
  return buildBrokerLeaderboard(await loadCommercialIntelligenceSource(organisationId))
}
