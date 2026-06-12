import { listOrganisationUsers } from '../../../lib/settingsApi'
import {
  getCommercialAllDocumentRequests,
  getCommercialAllDocuments,
  getCommercialAllHeadsOfTerms,
  getCommercialCommissions,
  getCommercialCompanies,
  getCommercialContacts,
  getCommercialDeals,
  getCommercialLandlords,
  getCommercialLeases,
  getCommercialListings,
  getCommercialProperties,
  getCommercialRequirements,
  getCommercialTenants,
  getCommercialTransactions,
  getCommercialVacancies,
  getCommercialViewings,
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

function percent(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((toNumber(numerator) / toNumber(denominator)) * 1000) / 10
}

function average(values = []) {
  const numeric = values.map(toNumber).filter((value) => Number.isFinite(value) && value > 0)
  if (!numeric.length) return 0
  return Math.round((numeric.reduce((sum, value) => sum + value, 0) / numeric.length) * 10) / 10
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

function startOfMonth() {
  const today = startOfToday()
  return new Date(today.getFullYear(), today.getMonth(), 1)
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

function isActiveRequirement(row = {}) {
  return active(row) && !['won', 'lost', 'closed_won', 'closed_lost'].includes(normalize(row.stage || row.status))
}

function isActiveVacancy(row = {}) {
  return active(row) && !['occupied', 'withdrawn', 'suspended', 'archived'].includes(normalize(row.status))
}

function isActiveListing(row = {}) {
  return active(row) && !['closed', 'withdrawn', 'expired', 'archived'].includes(normalize(row.listing_status || row.status))
}

function assetClass(value = '') {
  const normalized = normalize(value).replace(/[\s-]+/g, '_')
  if (normalized.includes('industrial') || normalized.includes('warehouse')) return 'industrial'
  if (normalized.includes('office')) return 'office'
  if (normalized.includes('retail') || normalized.includes('shop')) return 'retail'
  if (normalized.includes('investment')) return 'investment'
  if (normalized.includes('agricultural') || normalized.includes('farm')) return 'agricultural'
  if (normalized.includes('development') || normalized.includes('land')) return 'land'
  if (normalized.includes('mixed')) return 'mixed_use'
  return normalized || 'unclassified'
}

function areaName(property = {}, fallback = '') {
  return normalizeText(property.suburb || property.city || property.province || fallback) || 'Unspecified Area'
}

function splitLocations(value) {
  if (Array.isArray(value)) return value.map(normalizeText).filter(Boolean)
  return String(value || '').split(',').map(normalizeText).filter(Boolean)
}

function sizeBand(value) {
  const amount = toNumber(value)
  if (!amount) return 'Unspecified'
  if (amount < 250) return '<250m2'
  if (amount < 500) return '250-499m2'
  if (amount < 1000) return '500-999m2'
  if (amount < 2500) return '1,000-2,499m2'
  if (amount < 5000) return '2,500-4,999m2'
  return '5,000m2+'
}

function budgetBand(value) {
  const amount = toNumber(value)
  if (!amount) return 'Unspecified'
  if (amount < 25000) return '<R25k'
  if (amount < 50000) return 'R25k-R50k'
  if (amount < 100000) return 'R50k-R100k'
  if (amount < 250000) return 'R100k-R250k'
  if (amount < 500000) return 'R250k-R500k'
  return 'R500k+'
}

function incrementGroup(map, key, patch = {}) {
  const normalizedKey = normalizeText(key) || 'Unspecified'
  const current = map.get(normalizedKey) || { key: normalizedKey, label: normalizedKey, count: 0 }
  current.count += patch.count ?? 1
  Object.entries(patch).forEach(([name, value]) => {
    if (name === 'count') return
    current[name] = toNumber(current[name]) + toNumber(value)
  })
  map.set(normalizedKey, current)
  return current
}

function groupRows(map) {
  return Array.from(map.values()).sort((left, right) => toNumber(right.count) - toNumber(left.count) || String(left.label).localeCompare(String(right.label)))
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
      .filter((vacancy) => active(vacancy) && !['leased', 'occupied', 'withdrawn', 'suspended', 'archived'].includes(normalize(vacancy.status)))
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
  deals = [],
  leases = [],
  headsOfTerms = [],
  documentRequests = [],
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

function buildSupplyIntelligence({ properties = [], vacancies = [], listings = [] } = {}) {
  const activeProperties = properties.filter(active)
  const activeVacancies = vacancies.filter(isActiveVacancy)
  const activeListings = listings.filter(isActiveListing)
  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const byClass = new Map()
  const totalGla = activeProperties.reduce((sum, row) => sum + toNumber(row.gla_m2), 0)
  const availableSpace = activeVacancies.reduce((sum, row) => sum + toNumber(row.available_area_m2), 0) ||
    activeProperties.reduce((sum, row) => sum + toNumber(row.available_space_m2), 0)

  activeProperties.forEach((property) => {
    incrementGroup(byClass, assetClass(property.property_type), {
      properties: 1,
      gla: toNumber(property.gla_m2),
      availableSpace: toNumber(property.available_space_m2),
    })
  })
  activeVacancies.forEach((vacancy) => {
    const property = propertiesById.get(vacancy.property_id) || {}
    incrementGroup(byClass, assetClass(property.property_type || vacancy.property_type), {
      vacancies: 1,
      availableSpace: toNumber(vacancy.available_area_m2),
    })
  })
  activeListings.forEach((listing) => {
    const property = propertiesById.get(listing.property_id) || {}
    incrementGroup(byClass, assetClass(listing.listing_category || property.property_type), { listings: 1 })
  })

  return {
    totalActiveProperties: activeProperties.length,
    totalVacancies: activeVacancies.length,
    totalListings: activeListings.length,
    availableSpace,
    occupiedSpace: Math.max(0, totalGla - availableSpace),
    totalGla,
    occupancyRate: Math.max(0, Math.min(100, 100 - percent(availableSpace, totalGla))),
    vacancyRate: percent(availableSpace, totalGla),
    byClass: groupRows(byClass).map((row) => ({
      ...row,
      properties: toNumber(row.properties),
      vacancies: toNumber(row.vacancies),
      listings: toNumber(row.listings),
      occupancyRate: Math.max(0, Math.min(100, 100 - percent(row.availableSpace, row.gla))),
      vacancyRate: percent(row.availableSpace, row.gla),
    })),
  }
}

function buildDemandIntelligence({ requirements = [], properties = [] } = {}) {
  const activeRequirements = requirements.filter(isActiveRequirement)
  const byType = new Map()
  const byArea = new Map()
  const bySize = new Map()
  const byBudget = new Map()

  activeRequirements.forEach((requirement) => {
    const demandArea = toNumber(requirement.max_size_m2) || toNumber(requirement.min_size_m2)
    incrementGroup(byType, requirement.requirement_type || requirement.property_type || 'unspecified', { demandArea, budget: toNumber(requirement.budget_max || requirement.budget_min) })
    incrementGroup(bySize, sizeBand(demandArea))
    incrementGroup(byBudget, budgetBand(requirement.budget_max || requirement.budget_min))
    const locations = splitLocations(requirement.preferred_locations)
    if (locations.length) {
      locations.forEach((location) => incrementGroup(byArea, location, { demandArea }))
    } else {
      incrementGroup(byArea, 'Unspecified Area', { demandArea })
    }
  })

  const propertyAreas = new Set(properties.map((property) => areaName(property)).filter(Boolean))
  const activeAreas = groupRows(byArea).map((row) => ({
    ...row,
    hasSupplyArea: propertyAreas.has(row.label),
  }))

  return {
    activeRequirements: activeRequirements.length,
    byType: groupRows(byType),
    byArea: activeAreas,
    bySize: groupRows(bySize),
    byBudget: groupRows(byBudget),
  }
}

function buildLeasingIntelligence({ vacancies = [], viewings = [], deals = [], transactions = [] } = {}) {
  const viewingsByVacancy = new Map()
  viewings.forEach((viewing) => {
    if (!viewing.vacancy_id) return
    const rows = viewingsByVacancy.get(viewing.vacancy_id) || []
    rows.push(viewing)
    viewingsByVacancy.set(viewing.vacancy_id, rows)
  })

  const dealsByVacancy = new Map()
  deals.forEach((deal) => {
    if (!deal.vacancy_id) return
    const rows = dealsByVacancy.get(deal.vacancy_id) || []
    rows.push(deal)
    dealsByVacancy.set(deal.vacancy_id, rows)
  })

  const transactionsByVacancy = new Map()
  transactions.forEach((transaction) => {
    if (!transaction.vacancy_id) return
    const rows = transactionsByVacancy.get(transaction.vacancy_id) || []
    rows.push(transaction)
    transactionsByVacancy.set(transaction.vacancy_id, rows)
  })

  const daysOnMarket = vacancies.map((vacancy) => {
    const start = asDate(vacancy.marketed_at || vacancy.availability_date || vacancy.created_at)
    const end = asDate(vacancy.occupied_at || vacancy.archived_at || vacancy.updated_at)
    return daysBetween(start, end || startOfToday())
  }).filter((value) => value !== null && value >= 0)

  const stageDurations = vacancies.map((vacancy) => {
    const vacancyStart = asDate(vacancy.created_at || vacancy.availability_date)
    const firstViewing = (viewingsByVacancy.get(vacancy.id) || []).map((row) => asDate(row.viewing_date || row.created_at)).filter(Boolean).sort((a, b) => a - b)[0]
    const firstDeal = (dealsByVacancy.get(vacancy.id) || []).map((row) => asDate(row.created_at)).filter(Boolean).sort((a, b) => a - b)[0]
    const firstTransaction = (transactionsByVacancy.get(vacancy.id) || []).map((row) => asDate(row.created_at)).filter(Boolean).sort((a, b) => a - b)[0]
    const completedTransaction = (transactionsByVacancy.get(vacancy.id) || []).filter((row) => normalize(row.status) === 'completed').map((row) => asDate(row.actual_close_date || row.updated_at)).filter(Boolean).sort((a, b) => a - b)[0]
    return {
      vacancyToViewing: daysBetween(vacancyStart, firstViewing),
      viewingToDeal: daysBetween(firstViewing, firstDeal),
      dealToTransaction: daysBetween(firstDeal, firstTransaction),
      transactionToComplete: daysBetween(firstTransaction, completedTransaction),
    }
  })

  const activeVacancies = vacancies.filter(isActiveVacancy)
  const viewedVacancyIds = new Set(viewings.filter((row) => row.vacancy_id).map((row) => row.vacancy_id))
  const dealVacancyIds = new Set(deals.filter((row) => row.vacancy_id).map((row) => row.vacancy_id))
  const transactionVacancyIds = new Set(transactions.filter((row) => row.vacancy_id).map((row) => row.vacancy_id))
  const completedTransactionVacancyIds = new Set(transactions.filter((row) => row.vacancy_id && normalize(row.status) === 'completed').map((row) => row.vacancy_id))

  return {
    averageDaysOnMarket: average(daysOnMarket),
    averageViewingCount: average(activeVacancies.map((vacancy) => (viewingsByVacancy.get(vacancy.id) || []).length)),
    averageDealConversion: percent(dealVacancyIds.size, viewedVacancyIds.size),
    averageTransactionDuration: average(transactions.map((row) => daysBetween(row.created_at, row.actual_close_date || row.updated_at)).filter((value) => value !== null && value >= 0)),
    velocity: [
      { key: 'vacancies', label: 'Vacancies', count: activeVacancies.length, conversion: 100 },
      { key: 'viewings', label: 'Viewings', count: viewedVacancyIds.size, conversion: percent(viewedVacancyIds.size, activeVacancies.length) },
      { key: 'deals', label: 'Deals', count: dealVacancyIds.size, conversion: percent(dealVacancyIds.size, viewedVacancyIds.size) },
      { key: 'transactions', label: 'Transactions', count: transactionVacancyIds.size, conversion: percent(transactionVacancyIds.size, dealVacancyIds.size) },
      { key: 'completed', label: 'Completed', count: completedTransactionVacancyIds.size, conversion: percent(completedTransactionVacancyIds.size, transactionVacancyIds.size) },
    ],
    bottlenecks: [
      { key: 'vacancyToViewing', label: 'Vacancy to Viewing', days: average(stageDurations.map((row) => row.vacancyToViewing)) },
      { key: 'viewingToDeal', label: 'Viewing to Deal', days: average(stageDurations.map((row) => row.viewingToDeal)) },
      { key: 'dealToTransaction', label: 'Deal to Transaction', days: average(stageDurations.map((row) => row.dealToTransaction)) },
      { key: 'transactionToComplete', label: 'Transaction to Completed', days: average(stageDurations.map((row) => row.transactionToComplete)) },
    ],
  }
}

function buildVacancyIntelligence({ vacancies = [], properties = [], brokers = [] } = {}) {
  const monthStart = startOfMonth()
  const today = startOfToday()
  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const brokerMap = new Map(brokers.map((broker) => [normalizeText(broker.userId || broker.user_id || broker.id), broker.name || broker.fullName || broker.email || 'Broker']))
  const byArea = new Map()
  const byType = new Map()
  const byBroker = new Map()
  const byBranch = new Map()
  const activeVacancies = vacancies.filter(isActiveVacancy)
  const occupiedVacancies = vacancies.filter((row) => normalize(row.status) === 'occupied' || row.occupied_at)
  const newVacancies = vacancies.filter((row) => {
    const created = asDate(row.created_at || row.availability_date)
    return created && created >= monthStart
  })
  const withdrawnVacancies = vacancies.filter((row) => normalize(row.status) === 'withdrawn' || row.withdrawn_at)
  const longTermVacancies = activeVacancies.filter((row) => {
    const started = asDate(row.marketed_at || row.availability_date || row.created_at)
    return started && daysBetween(started, today) >= 90
  })

  activeVacancies.forEach((vacancy) => {
    const property = propertiesById.get(vacancy.property_id) || {}
    const area = areaName(property)
    const type = assetClass(property.property_type)
    const areaValue = toNumber(vacancy.available_area_m2)
    const brokerId = normalizeText(vacancy.broker_id || vacancy.broker_assignment)
    incrementGroup(byArea, area, { vacancies: 1, availableSpace: areaValue })
    incrementGroup(byType, type, { vacancies: 1, availableSpace: areaValue })
    incrementGroup(byBroker, brokerNameFor(brokerId, brokerMap), { vacancies: 1, availableSpace: areaValue })
    incrementGroup(byBranch, property.branch_id || vacancy.branch_id || 'Unassigned Branch', { vacancies: 1, availableSpace: areaValue })
  })

  const totalGla = properties.filter(active).reduce((sum, row) => sum + toNumber(row.gla_m2), 0)
  const availableSpace = activeVacancies.reduce((sum, row) => sum + toNumber(row.available_area_m2), 0)

  return {
    newVacancies: newVacancies.length,
    occupiedVacancies: occupiedVacancies.length,
    withdrawnVacancies: withdrawnVacancies.length,
    longTermVacancies: longTermVacancies.length,
    vacancyRate: percent(availableSpace, totalGla),
    occupancyRate: Math.max(0, Math.min(100, 100 - percent(availableSpace, totalGla))),
    absorptionRate: percent(occupiedVacancies.length, Math.max(1, newVacancies.length + activeVacancies.length)),
    byArea: groupRows(byArea),
    byPropertyType: groupRows(byType),
    byBroker: groupRows(byBroker),
    byBranch: groupRows(byBranch),
    longTerm: longTermVacancies.slice(0, 12).map((row) => {
      const property = propertiesById.get(row.property_id) || {}
      const started = asDate(row.marketed_at || row.availability_date || row.created_at)
      return {
        id: row.id,
        title: row.vacancy_name || row.unit_or_floor || 'Vacancy',
        property: property.property_name || 'Property pending',
        area: areaName(property),
        daysVacant: daysBetween(started, today) || 0,
        availableSpace: toNumber(row.available_area_m2),
      }
    }),
  }
}

function buildAreaPerformance({ properties = [], vacancies = [], requirements = [], deals = [], transactions = [], viewings = [], activity = [] } = {}) {
  const areas = new Map()
  const propertiesById = new Map(properties.map((property) => [property.id, property]))

  properties.filter(active).forEach((property) => {
    const area = incrementGroup(areas, areaName(property), {
      properties: 1,
      totalGla: toNumber(property.gla_m2),
      availableSpace: toNumber(property.available_space_m2),
    })
    area.propertyType = area.propertyType || assetClass(property.property_type)
  })
  vacancies.filter(isActiveVacancy).forEach((vacancy) => {
    const property = propertiesById.get(vacancy.property_id) || {}
    incrementGroup(areas, areaName(property), {
      vacancies: 1,
      availableSupply: toNumber(vacancy.available_area_m2),
      rentalTotal: toNumber(vacancy.asking_rental),
      rentalCount: vacancy.asking_rental ? 1 : 0,
    })
  })
  requirements.filter(isActiveRequirement).forEach((requirement) => {
    const demandArea = toNumber(requirement.max_size_m2) || toNumber(requirement.min_size_m2)
    const locations = splitLocations(requirement.preferred_locations)
    ;(locations.length ? locations : ['Unspecified Area']).forEach((location) => {
      incrementGroup(areas, location, { demand: 1, activeDemand: demandArea })
    })
  })
  transactions.forEach((transaction) => {
    const property = propertiesById.get(transaction.property_id) || {}
    incrementGroup(areas, areaName(property), { transactions: 1, transactionValue: toNumber(transaction.target_value) })
  })
  deals.forEach((deal) => {
    const property = propertiesById.get(deal.property_id) || {}
    incrementGroup(areas, areaName(property), { deals: 1, dealValue: toNumber(deal.deal_value) })
  })
  viewings.forEach((viewing) => {
    const property = propertiesById.get(viewing.property_id) || {}
    incrementGroup(areas, areaName(property), { viewings: 1 })
  })
  activity.forEach((row) => {
    const property = propertiesById.get(row.entity_id) || {}
    if (row.entity_type === 'commercial_property' && property.id) incrementGroup(areas, areaName(property), { activity: 1 })
  })

  return groupRows(areas).map((row) => ({
    ...row,
    supplyDemandGap: toNumber(row.activeDemand) - toNumber(row.availableSupply),
    occupancyRate: Math.max(0, Math.min(100, 100 - percent(row.availableSupply || row.availableSpace, row.totalGla))),
    vacancyRate: percent(row.availableSupply || row.availableSpace, row.totalGla),
    averageRental: row.rentalCount ? Math.round(toNumber(row.rentalTotal) / toNumber(row.rentalCount)) : 0,
  }))
}

function buildBenchmarking({ brokers = [], listings = [], viewings = [], deals = [], transactions = [], commissions = [] } = {}) {
  const brokersById = new Map(brokers.map((broker) => [normalizeText(broker.userId || broker.user_id || broker.id), broker]))
  const branchRows = new Map()
  const brokerRows = new Map()

  function ensureBroker(id = '') {
    const key = normalizeText(id) || 'unassigned'
    const broker = brokersById.get(key) || {}
    const row = brokerRows.get(key) || {
      id: key,
      label: broker.name || broker.fullName || broker.email || 'Unassigned',
      branch: broker.branchName || broker.branch_id || broker.branchId || 'Unassigned Branch',
      listings: 0,
      viewings: 0,
      deals: 0,
      transactions: 0,
      occupancyGenerated: 0,
      revenueGenerated: 0,
    }
    brokerRows.set(key, row)
    return row
  }

  listings.forEach((listing) => { ensureBroker(listing.broker_id).listings += 1 })
  viewings.forEach((viewing) => { ensureBroker(viewing.broker_id).viewings += 1 })
  deals.forEach((deal) => { ensureBroker(deal.broker_id || deal.assigned_broker).deals += 1 })
  transactions.forEach((transaction) => {
    const row = ensureBroker(transaction.broker_id)
    row.transactions += 1
    if (normalize(transaction.status) === 'completed') row.occupancyGenerated += toNumber(transaction.target_value)
  })
  commissions.forEach((commission) => { ensureBroker(commission.broker_id).revenueGenerated += toNumber(commission.commission_amount) })

  Array.from(brokerRows.values()).forEach((broker) => {
    const branch = incrementGroup(branchRows, broker.branch, {
      listings: broker.listings,
      viewings: broker.viewings,
      deals: broker.deals,
      transactions: broker.transactions,
      occupancyGenerated: broker.occupancyGenerated,
      revenueGenerated: broker.revenueGenerated,
    })
    branch.brokers = toNumber(branch.brokers) + 1
  })

  return {
    brokers: Array.from(brokerRows.values()).sort((left, right) => right.revenueGenerated - left.revenueGenerated || right.transactions - left.transactions),
    branches: groupRows(branchRows),
    teams: [],
  }
}

function buildInvestorAnalytics({ requirements = [], listings = [], transactions = [], properties = [] } = {}) {
  const investmentRequirements = requirements.filter((row) => ['investment', 'purchase'].includes(normalize(row.requirement_type || row.client_type)))
  const investmentListings = listings.filter((row) => normalize(row.listing_category || row.listing_type).includes('investment'))
  const saleTransactions = transactions.filter((row) => normalize(row.transaction_type) === 'sale')
  const investmentProperties = properties.filter((row) => normalize(row.property_type).includes('investment') || toNumber(row.cap_rate) || toNumber(row.gross_yield) || toNumber(row.net_yield))

  return {
    activeOpportunities: investmentListings.filter(isActiveListing).length + investmentRequirements.filter(isActiveRequirement).length,
    transactionVolume: saleTransactions.reduce((sum, row) => sum + toNumber(row.target_value), 0),
    investmentSales: saleTransactions.length,
    averageCapRate: average(investmentProperties.map((row) => row.cap_rate)),
    averageGrossYield: average(investmentProperties.map((row) => row.gross_yield)),
    averageNetYield: average(investmentProperties.map((row) => row.net_yield)),
    opportunities: investmentListings.slice(0, 8).map((row) => ({ id: row.id, title: row.title || 'Investment opportunity', status: row.listing_status || row.status, value: toNumber(row.pricing) })),
    trends: [
      { label: 'Investment requirements', value: investmentRequirements.length },
      { label: 'Investment listings', value: investmentListings.length },
      { label: 'Sale transactions', value: saleTransactions.length },
    ],
  }
}

function buildPortfolioAnalytics({ landlords = [], properties = [], vacancies = [], transactions = [], viewings = [] } = {}) {
  return landlords.map((landlord) => {
    const landlordProperties = properties.filter((property) => property.landlord_id === landlord.id)
    const propertyIds = new Set(landlordProperties.map((property) => property.id))
    const landlordVacancies = vacancies.filter((vacancy) => propertyIds.has(vacancy.property_id))
    const landlordTransactions = transactions.filter((transaction) => propertyIds.has(transaction.property_id))
    const landlordViewings = viewings.filter((viewing) => propertyIds.has(viewing.property_id))
    const totalGla = landlordProperties.reduce((sum, row) => sum + toNumber(row.gla_m2), 0)
    const availableSpace = landlordVacancies.filter(isActiveVacancy).reduce((sum, row) => sum + toNumber(row.available_area_m2), 0)
    return {
      id: landlord.id,
      landlord: landlord.name || 'Landlord',
      properties: landlordProperties.length,
      vacancies: landlordVacancies.filter(isActiveVacancy).length,
      transactions: landlordTransactions.length,
      viewings: landlordViewings.length,
      occupancyRate: Math.max(0, Math.min(100, 100 - percent(availableSpace, totalGla))),
      vacancyRate: percent(availableSpace, totalGla),
      leasingVelocity: percent(landlordTransactions.filter((row) => normalize(row.status) === 'completed').length, landlordVacancies.length),
    }
  }).filter((row) => row.properties).sort((left, right) => right.properties - left.properties || right.transactions - left.transactions)
}

function buildDataQuality({ companies = [], contacts = [], properties = [], vacancies = [], listings = [], requirements = [], deals = [], transactions = [] } = {}) {
  const missingPropertyData = properties.filter((row) => !row.property_type || !row.gla_m2 || !row.city || !row.broker_id)
  const missingVacancyData = vacancies.filter((row) => !row.property_id || !row.available_area_m2 || !row.asking_rental || !row.broker_id)
  const missingContacts = companies.filter((company) => !contacts.some((contact) => contact.company_id === company.id))
  const missingBrokers = [
    ...properties.filter((row) => !row.broker_id),
    ...vacancies.filter((row) => !row.broker_id && !row.broker_assignment),
    ...listings.filter((row) => !row.broker_id),
    ...requirements.filter((row) => !row.broker_id && !row.assigned_broker),
    ...deals.filter((row) => !row.broker_id && !row.assigned_broker),
    ...transactions.filter((row) => !row.broker_id),
  ]
  const propertyIds = new Set(properties.map((row) => row.id))
  const requirementIds = new Set(requirements.map((row) => row.id))
  const dealIds = new Set(deals.map((row) => row.id))
  const orphanRecords = [
    ...vacancies.filter((row) => row.property_id && !propertyIds.has(row.property_id)),
    ...listings.filter((row) => row.property_id && !propertyIds.has(row.property_id)),
    ...deals.filter((row) => row.requirement_id && !requirementIds.has(row.requirement_id)),
    ...transactions.filter((row) => row.deal_id && !dealIds.has(row.deal_id)),
  ]
  const issues = [
    { key: 'missing_property_data', label: 'Missing Property Data', count: missingPropertyData.length, priority: 'High' },
    { key: 'missing_vacancy_data', label: 'Missing Vacancy Data', count: missingVacancyData.length, priority: 'High' },
    { key: 'missing_contacts', label: 'Companies Without Contacts', count: missingContacts.length, priority: 'Medium' },
    { key: 'missing_brokers', label: 'Records Without Brokers', count: missingBrokers.length, priority: 'High' },
    { key: 'orphan_records', label: 'Orphan Records', count: orphanRecords.length, priority: 'High' },
  ]
  const totalRecords = companies.length + contacts.length + properties.length + vacancies.length + listings.length + requirements.length + deals.length + transactions.length
  const issueCount = issues.reduce((sum, row) => sum + row.count, 0)
  return {
    score: totalRecords ? Math.max(0, Math.round(((totalRecords - issueCount) / totalRecords) * 100)) : 100,
    issues,
    samples: {
      missingPropertyData: missingPropertyData.slice(0, 6),
      missingVacancyData: missingVacancyData.slice(0, 6),
      missingContacts: missingContacts.slice(0, 6),
      missingBrokers: missingBrokers.slice(0, 6),
      orphanRecords: orphanRecords.slice(0, 6),
    },
  }
}

export function buildCommercialMarketIntelligence(data = {}) {
  const supply = buildSupplyIntelligence(data)
  const demand = buildDemandIntelligence(data)
  const leasing = buildLeasingIntelligence(data)
  const vacancy = buildVacancyIntelligence(data)
  const areas = buildAreaPerformance(data)
  const benchmarking = buildBenchmarking(data)
  const investor = buildInvestorAnalytics(data)
  const portfolio = buildPortfolioAnalytics(data)
  const dataQuality = buildDataQuality(data)

  return {
    supply,
    demand,
    leasing,
    vacancy,
    areas,
    benchmarking,
    investor,
    portfolio,
    dataQuality,
    reports: [
      { key: 'market', label: 'Market Report', description: 'Supply, demand, transactions, occupancy, and activity.' },
      { key: 'branch', label: 'Branch Report', description: 'Branch-level listings, viewings, deals, transactions, and revenue.' },
      { key: 'broker', label: 'Broker Report', description: 'Broker benchmarking and contribution.' },
      { key: 'area', label: 'Area Report', description: 'Area supply, demand, gap, rentals, transactions, and activity.' },
      { key: 'portfolio', label: 'Portfolio Report', description: 'Landlord asset performance across properties.' },
    ],
    futureDataSources: ['Property24', 'Private Property', 'Lightstone', 'Propstats', 'Municipal data', 'Valuation feeds', 'Economic data'],
  }
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
  const [companies, contacts, landlords, tenants, properties, requirements, deals, leases, vacancies, listings, viewings, transactions, commissions, documents, documentRequests, headsOfTerms, brokers] = await Promise.all([
    getCommercialCompanies(resolvedOrganisationId),
    getCommercialContacts(resolvedOrganisationId),
    getCommercialLandlords(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
    getCommercialVacancies(resolvedOrganisationId),
    getCommercialListings(resolvedOrganisationId),
    getCommercialViewings(resolvedOrganisationId),
    getCommercialTransactions(resolvedOrganisationId),
    getCommercialCommissions(resolvedOrganisationId),
    getCommercialAllDocuments(resolvedOrganisationId),
    getCommercialAllDocumentRequests(resolvedOrganisationId),
    getCommercialAllHeadsOfTerms(resolvedOrganisationId),
    listOrganisationUsers().catch(() => []),
  ])
  return {
    organisationId: resolvedOrganisationId,
    organisation: context.organisation,
    companies,
    contacts,
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    leases,
    vacancies,
    listings,
    viewings,
    transactions,
    commissions,
    documents,
    documentRequests,
    headsOfTerms,
    brokers,
  }
}

export async function getCommercialMarketIntelligenceData(organisationId) {
  const source = await loadCommercialIntelligenceSource(organisationId)
  return {
    organisationId: source.organisationId || '',
    organisation: source.organisation || null,
    source,
    intelligence: buildCommercialMarketIntelligence(source),
  }
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
