import {
  getCommercialAllDocumentRequests,
  getCommercialAllDocuments,
  getCommercialAllHeadsOfTerms,
  getCommercialDeals,
  getCommercialLandlords,
  getCommercialLeases,
  getCommercialListings,
  getCommercialProperties,
  getCommercialRecentActivity,
  getCommercialRequirements,
  getCommercialTenants,
  getCommercialVacancies,
  resolveCommercialOrganisationContext,
} from './commercialApi'
import { buildCommercialIntelligence } from './commercialIntelligenceApi'
import { listOrganisationUsers } from '../../../lib/settingsApi'
import { buildCommercialDocumentCompliance } from '../commercialDocumentConstants'
import { buildCommercialConversionMetrics, normalizeCommercialLifecycleStage } from '../commercialWorkflow'
import {
  buildCommercialFinancialSummary,
  buildCommercialRenewalRisk,
  buildCommercialSearchIndex,
  buildCommercialTransactions,
} from './commercialPlatformApi'

const NEGOTIATION_DEAL_STAGES = ['negotiation', 'hot_draft', 'hot_sent', 'hot_accepted', 'lease_pending', 'proposal', 'heads_of_terms', 'lease_draft']
const REQUIREMENT_PIPELINE_STAGES = ['new', 'qualified', 'matching', 'viewing', 'negotiating', 'converted', 'lost']
const DEAL_PIPELINE_STAGES = ['new', 'qualified', 'negotiation', 'hot_draft', 'hot_sent', 'hot_accepted', 'lease_pending', 'converted', 'lost']
const OPEN_VACANCY_STATUSES = ['available', 'marketing', 'under_offer', 'hot_in_progress', 'lease_pending', 'reserved', 'under_negotiation', 'upcoming']
const ACTIVE_LISTING_STATUSES = ['coming_soon', 'active', 'under_offer']
const LISTING_PIPELINE_STATUSES = ['draft', 'coming_soon', 'active', 'under_offer', 'leased', 'sold', 'expired']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function brokerDisplayName(row = {}) {
  return [normalizeText(row.firstName), normalizeText(row.lastName)].filter(Boolean).join(' ')
    || normalizeText(row.fullName)
    || normalizeText(row.email)
    || 'Commercial broker'
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function addMonths(date, months) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function isActiveStatus(row) {
  const status = normalizeLower(row?.status || 'active')
  return !['archived', 'inactive', 'closed_lost', 'expired', 'terminated', 'cancelled'].includes(status)
}

function isActiveRequirement(row) {
  return isActiveStatus(row) && !['converted', 'lost', 'closed_won', 'closed_lost'].includes(normalizeCommercialLifecycleStage('requirements', row.stage, 'new'))
}

function isOpenVacancy(row) {
  return OPEN_VACANCY_STATUSES.includes(normalizeLower(row?.status || 'available'))
}

function isActiveListing(row) {
  return ACTIVE_LISTING_STATUSES.includes(normalizeLower(row?.listing_status || row?.status || 'active'))
}

function sumRows(rows, key) {
  return rows.reduce((total, row) => total + toNumber(row?.[key]), 0)
}

function percent(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 1000) / 10
}

function countBy(rows, key, allowed = []) {
  return rows.reduce((counts, row) => {
    const value = normalizeLower(row?.[key]) || allowed[0] || 'unclassified'
    if (allowed.length && !allowed.includes(value)) return counts
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function countByLifecycle(rows, key, allowed = [], kind = '') {
  return rows.reduce((counts, row) => {
    const value = normalizeCommercialLifecycleStage(kind, row?.[key], allowed[0] || 'unclassified')
    if (allowed.length && !allowed.includes(value)) return counts
    counts[value] = (counts[value] || 0) + 1
    return counts
  }, {})
}

function labelFromStage(value) {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase())
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('en-ZA', { month: 'short' }).format(date)
}

function lastSixMonths() {
  const today = startOfToday()
  return Array.from({ length: 6 }, (_, index) => {
    const date = addMonths(today, index - 5)
    date.setDate(1)
    const end = addMonths(date, 1)
    end.setDate(0)
    end.setHours(23, 59, 59, 999)
    return { date, end, label: monthLabel(date) }
  })
}

function rowsCreatedBefore(rows, endDate) {
  return rows.filter((row) => {
    const createdAt = asDate(row.created_at)
    return !createdAt || createdAt <= endDate
  })
}

function buildOccupancyTrend({ properties, vacancies }) {
  const usesVacancies = vacancies.length > 0

  return lastSixMonths().map(({ end, label }) => {
    const periodProperties = rowsCreatedBefore(properties, end)
    const periodVacancies = rowsCreatedBefore(vacancies, end).filter(isOpenVacancy)
    const gla = sumRows(periodProperties, 'gla_m2')
    const available = usesVacancies ? sumRows(periodVacancies, 'available_area_m2') : sumRows(periodProperties, 'available_space_m2')
    const vacancyRate = percent(available, gla)
    return {
      label,
      occupancy: Math.max(0, Math.min(100, Math.round((100 - vacancyRate) * 10) / 10)),
      vacancy: Math.max(0, Math.min(100, vacancyRate)),
    }
  })
}

function buildAssetClassBreakdown(properties) {
  const totals = properties.reduce((groups, property) => {
    const type = normalizeLower(property.property_type || 'unclassified')
    groups[type] = (groups[type] || 0) + toNumber(property.gla_m2)
    return groups
  }, {})

  return Object.entries(totals)
    .map(([type, value]) => ({ label: labelFromStage(type), value, key: type }))
    .sort((a, b) => b.value - a.value)
}

function buildLeaseExpiryDistribution(leases, propertiesById) {
  const today = startOfToday()
  const buckets = [
    { key: '0-3', label: '0-3m', min: 0, max: 3 },
    { key: '3-6', label: '3-6m', min: 3, max: 6 },
    { key: '6-12', label: '6-12m', min: 6, max: 12 },
    { key: '12-18', label: '12-18m', min: 12, max: 18 },
    { key: '18-24', label: '18-24m', min: 18, max: 24 },
    { key: '24+', label: '24m+', min: 24, max: Infinity },
  ].map((bucket) => ({ ...bucket, count: 0, gla: 0 }))

  leases.forEach((lease) => {
    const end = asDate(lease.lease_end_date)
    if (!end || end < today) return
    const months = Math.max(0, ((end.getFullYear() - today.getFullYear()) * 12) + (end.getMonth() - today.getMonth()))
    const bucket = buckets.find((item) => months >= item.min && months < item.max)
    if (!bucket) return
    bucket.count += 1
    bucket.gla += toNumber(propertiesById.get(lease.property_id)?.gla_m2)
  })

  return buckets
}

function buildLandlordLeaderboard({ landlords, properties, vacancies }) {
  const landlordMap = new Map(landlords.map((landlord) => [landlord.id, landlord]))
  const vacancyByLandlord = vacancies.filter(isOpenVacancy).reduce((groups, vacancy) => {
    const landlordId = vacancy.landlord_id || properties.find((property) => property.id === vacancy.property_id)?.landlord_id
    if (!landlordId) return groups
    groups[landlordId] = (groups[landlordId] || 0) + toNumber(vacancy.available_area_m2)
    return groups
  }, {})

  const rows = properties.reduce((groups, property) => {
    const landlordId = property.landlord_id || 'unassigned'
    const existing = groups.get(landlordId) || {
      id: landlordId,
      name: landlordMap.get(landlordId)?.name || 'Unassigned portfolio',
      gla: 0,
      available: 0,
      properties: 0,
    }
    existing.gla += toNumber(property.gla_m2)
    existing.available += vacancies.length ? 0 : toNumber(property.available_space_m2)
    existing.properties += 1
    groups.set(landlordId, existing)
    return groups
  }, new Map())

  vacancyByLandlord && Object.entries(vacancyByLandlord).forEach(([landlordId, available]) => {
    const existing = rows.get(landlordId) || {
      id: landlordId,
      name: landlordMap.get(landlordId)?.name || 'Unassigned portfolio',
      gla: 0,
      available: 0,
      properties: 0,
    }
    existing.available += available
    rows.set(landlordId, existing)
  })

  return Array.from(rows.values())
    .map((row) => ({ ...row, vacancyRate: percent(row.available, row.gla) }))
    .sort((a, b) => b.gla - a.gla)
    .slice(0, 6)
}

function buildPipeline(stages, counts, valueByStage = {}) {
  return stages.map((stage) => ({
    key: stage,
    label: stage === 'heads_of_terms' ? 'HOT' : labelFromStage(stage),
    count: counts[stage] || 0,
    value: valueByStage[stage] || 0,
  }))
}

function buildActivitySnapshot({ requirements, deals, leases, vacancies, listings, headsOfTerms, activity }) {
  const today = startOfToday()
  const nextWeek = new Date(today)
  nextWeek.setDate(nextWeek.getDate() + 7)
  const createdThisWeek = (row) => {
    const createdAt = asDate(row.created_at)
    return createdAt && createdAt >= today
  }

  return [
    {
      label: 'Viewings this week',
      value: requirements.filter((row) => normalizeCommercialLifecycleStage('requirements', row.stage, 'new') === 'viewing').length,
      detail: 'Active requirement viewings',
    },
    {
      label: 'Proposals sent',
      value: [
        ...requirements.filter((row) => normalizeCommercialLifecycleStage('requirements', row.stage, 'new') === 'negotiating'),
        ...deals.filter((row) => normalizeCommercialLifecycleStage('deals', row.stage, 'new') === 'negotiation'),
      ].length,
      detail: 'Proposal-stage requirements and deals',
    },
    {
      label: 'HOT sent',
      value: headsOfTerms.filter((row) => ['sent', 'under_review', 'accepted'].includes(normalizeCommercialLifecycleStage('headsOfTerms', row.status, 'draft'))).length,
      detail: 'Heads of Terms in circulation',
    },
    {
      label: 'Leases signed',
      value: deals.filter((row) => normalizeCommercialLifecycleStage('deals', row.stage, 'new') === 'converted').length + leases.filter((row) => {
        const start = asDate(row.lease_start_date)
        return normalizeLower(row.status) === 'active' && start && start <= nextWeek
      }).length,
      detail: 'Signed deals and active leases',
    },
    {
      label: 'New vacancies added',
      value: vacancies.length ? vacancies.filter(createdThisWeek).length : activity.filter((row) => normalizeLower(row.activity_type).includes('vacancy')).length,
      detail: 'Vacancy-level availability updates',
    },
    {
      label: 'New listings published',
      value: listings.filter(createdThisWeek).length,
      detail: 'Market-facing listing updates',
    },
  ]
}

function buildExpiryWatchlist({ leases, tenantsById, propertiesById, landlordsById, dealsById }) {
  const today = startOfToday()
  const horizon = addMonths(today, 24)

  return leases
    .map((lease) => {
      const end = asDate(lease.lease_end_date)
      if (!end || end < today || end > horizon) return null
      const monthsRemaining = Math.max(0, ((end.getFullYear() - today.getFullYear()) * 12) + (end.getMonth() - today.getMonth()))
      const property = propertiesById.get(lease.property_id)
      const tenant = tenantsById.get(lease.tenant_id)
      const landlord = landlordsById.get(lease.landlord_id || property?.landlord_id)
      const linkedDeal = dealsById.get(lease.deal_id)
      const risk = monthsRemaining <= 3 ? 'High' : monthsRemaining <= 6 ? 'Medium' : 'Low'
      return {
        id: lease.id,
        tenant: tenant?.name || 'Unassigned tenant',
        property: property?.property_name || 'Unassigned property',
        landlord: landlord?.name || 'Unassigned landlord',
        gla: toNumber(property?.gla_m2),
        leaseExpiry: lease.lease_end_date,
        monthsRemaining,
        risk,
        assignedBroker: linkedDeal?.assigned_broker ? 'Assigned broker' : 'Unassigned',
      }
    })
    .filter(Boolean)
    .sort((a, b) => asDate(a.leaseExpiry) - asDate(b.leaseExpiry))
    .slice(0, 8)
}

function buildLatestActivity({ activity, requirements, deals, vacancies, listings, headsOfTerms }) {
  const generated = [
    ...requirements.slice(0, 4).map((row) => ({
      id: `requirement-${row.id}`,
      title: 'Requirement created',
      body: row.requirement_name,
      entity: 'Requirement',
      timestamp: row.created_at,
      user: 'Commercial team',
    })),
    ...deals.slice(0, 4).map((row) => ({
      id: `deal-${row.id}`,
      title: 'Deal updated',
      body: row.deal_name,
      entity: 'Deal',
      timestamp: row.updated_at || row.created_at,
      user: 'Commercial team',
    })),
    ...vacancies.slice(0, 4).map((row) => ({
      id: `vacancy-${row.id}`,
      title: 'Vacancy added',
      body: row.vacancy_name,
      entity: 'Vacancy',
      timestamp: row.created_at,
      user: 'Commercial team',
    })),
    ...listings.slice(0, 5).map((row) => ({
      id: `listing-${row.id}`,
      title: 'Listing updated',
      body: row.title,
      entity: 'Listing',
      timestamp: row.updated_at || row.created_at,
      user: 'Commercial team',
    })),
    ...headsOfTerms.slice(0, 3).map((row) => ({
      id: `hot-${row.id}`,
      title: 'Heads of Terms updated',
      body: labelFromStage(row.status),
      entity: 'HOT',
      timestamp: row.updated_at || row.created_at,
      user: 'Commercial team',
    })),
  ]

  const explicitActivity = activity.map((row) => ({
    id: row.id,
    title: row.title || labelFromStage(row.activity_type),
    body: row.body || '',
    entity: labelFromStage(row.entity_type),
    timestamp: row.created_at,
    user: row.created_by ? 'Team member' : 'System',
  }))

  return [...explicitActivity, ...generated]
    .sort((a, b) => asDate(b.timestamp || 0) - asDate(a.timestamp || 0))
    .slice(0, 10)
}

function buildDocumentCompliance({ landlords = [], tenants = [], properties = [], leases = [], headsOfTerms = [], documents = [], documentRequests = [] }) {
  const today = startOfToday()
  const expiryHorizon = new Date(today)
  expiryHorizon.setDate(expiryHorizon.getDate() + 60)
  const docsByRecord = documents.reduce((groups, document) => {
    const key = `${document.entity_type}:${document.entity_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(document)
    return groups
  }, new Map())
  const requestsByRecord = documentRequests.reduce((groups, request) => {
    const key = `${request.entity_type}:${request.entity_id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(request)
    return groups
  }, new Map())
  const records = [
    ...landlords.map((row) => ({ type: 'commercial_landlord', label: 'Landlord', id: row.id, name: row.name, brokerId: row.broker_id, branchId: row.branch_id, teamId: row.team_id })),
    ...tenants.map((row) => ({ type: 'commercial_tenant', label: 'Tenant', id: row.id, name: row.name, brokerId: row.broker_id, branchId: row.branch_id, teamId: row.team_id })),
    ...properties.map((row) => ({ type: 'commercial_property', label: 'Property', id: row.id, name: row.property_name, brokerId: row.broker_id, branchId: row.branch_id, teamId: row.team_id })),
    ...leases.map((row) => ({ type: 'commercial_lease', label: 'Lease', id: row.id, name: `Lease ${String(row.id || '').slice(0, 8)}`, brokerId: row.broker_id, branchId: row.branch_id, teamId: row.team_id })),
    ...headsOfTerms.map((row) => ({ type: 'commercial_heads_of_terms', label: 'HOT', id: row.id, name: row.premises_description || `HOT ${String(row.id || '').slice(0, 8)}`, brokerId: row.broker_id, branchId: row.branch_id, teamId: row.team_id })),
  ]

  const riskRows = records.map((record) => {
    const key = `${record.type}:${record.id}`
    const compliance = buildCommercialDocumentCompliance({
      entityType: record.type,
      documents: docsByRecord.get(key) || [],
      requests: requestsByRecord.get(key) || [],
    })
    return {
      ...record,
      completionPercent: compliance.completionPercent,
      outstanding: compliance.outstanding.length + compliance.openRequests.length,
      rejected: compliance.rejected.length,
      pendingReview: compliance.pendingReview.length,
    }
  }).filter((row) => row.outstanding || row.rejected || row.pendingReview)
    .sort((left, right) => right.outstanding - left.outstanding || left.completionPercent - right.completionPercent)
    .slice(0, 8)

  const expiringDocuments = documents.filter((document) => {
    const expiry = asDate(document.expires_at)
    return expiry && expiry <= expiryHorizon && !['archived', 'superseded'].includes(normalizeLower(document.status))
  })
  const openRequests = documentRequests.filter((request) => !['approved', 'completed', 'archived'].includes(normalizeLower(request.status)))

  return {
    outstanding: openRequests.length + riskRows.reduce((total, row) => total + row.outstanding, 0),
    overdue: openRequests.filter((request) => {
      const dueDate = asDate(request.due_date)
      return dueDate && dueDate < today
    }).length,
    rejected: documents.filter((document) => normalizeLower(document.status) === 'rejected').length,
    underReview: documents.filter((document) => normalizeLower(document.status) === 'under_review').length,
    expiring: expiringDocuments.length,
    riskRows,
    recentUploads: documents
      .filter((document) => !['archived', 'superseded'].includes(normalizeLower(document.status)))
      .sort((left, right) => asDate(right.uploaded_at || right.created_at || 0) - asDate(left.uploaded_at || left.created_at || 0))
      .slice(0, 5),
  }
}

export async function getCommercialPrincipalDashboardData(organisationId) {
  const context = await resolveCommercialOrganisationContext()
  const resolvedOrganisationId = organisationId || context.organisationId

  if (!resolvedOrganisationId) {
    return buildCommercialPrincipalDashboardData({ organisation: context.organisation })
  }

  const [
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    leases,
    vacancies,
    listings,
    activity,
    documents,
    documentRequests,
    headsOfTerms,
    brokers,
  ] = await Promise.all([
    getCommercialLandlords(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
    getCommercialVacancies(resolvedOrganisationId),
    getCommercialListings(resolvedOrganisationId),
    getCommercialRecentActivity(resolvedOrganisationId, 24),
    getCommercialAllDocuments(resolvedOrganisationId),
    getCommercialAllDocumentRequests(resolvedOrganisationId),
    getCommercialAllHeadsOfTerms(resolvedOrganisationId),
    listOrganisationUsers().catch(() => []),
  ])

  return buildCommercialPrincipalDashboardData({
    organisationId: resolvedOrganisationId,
    organisation: context.organisation,
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    leases,
    vacancies,
    listings,
    activity,
    documents,
    documentRequests,
    headsOfTerms,
    brokers,
  })
}

export function buildCommercialPrincipalDashboardData({
  organisationId = '',
  organisation = null,
  landlords = [],
  tenants = [],
  properties = [],
  requirements = [],
  deals = [],
  leases = [],
  vacancies = [],
  listings = [],
  activity = [],
  documents = [],
  documentRequests = [],
  headsOfTerms = [],
  brokers = [],
} = {}) {
  const activeProperties = properties.filter(isActiveStatus)
  const activeRequirements = requirements.filter(isActiveRequirement)
  const activeDeals = deals.filter(isActiveStatus)
  const activeLeases = leases.filter((row) => !['archived', 'terminated'].includes(normalizeLower(row.status)))
  const openVacancies = vacancies.filter(isOpenVacancy)
  const activeListings = listings.filter(isActiveListing)
  const usesVacancyData = openVacancies.length > 0

  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant]))
  const landlordsById = new Map(landlords.map((landlord) => [landlord.id, landlord]))
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]))

  const totalGla = sumRows(activeProperties, 'gla_m2')
  const availableSpace = usesVacancyData ? sumRows(openVacancies, 'available_area_m2') : sumRows(activeProperties, 'available_space_m2')
  const vacancyRate = percent(availableSpace, totalGla)
  const occupancyRate = Math.max(0, Math.min(100, Math.round((100 - vacancyRate) * 10) / 10))
  const hotCount = headsOfTerms.filter((row) => !['converted', 'superseded', 'archived'].includes(normalizeLower(row.status))).length
  const dealsInNegotiation = activeDeals.filter((row) => NEGOTIATION_DEAL_STAGES.includes(normalizeCommercialLifecycleStage('deals', row.stage, 'new')))
  const today = startOfToday()
  const next12Months = addMonths(today, 12)
  const leaseExpiryExposure = activeLeases.filter((lease) => {
    const end = asDate(lease.lease_end_date)
    return end && end >= today && end <= next12Months
  })
  const expiryExposureGla = leaseExpiryExposure.reduce((total, lease) => total + toNumber(propertiesById.get(lease.property_id)?.gla_m2), 0)

  const requirementStageCounts = countByLifecycle(activeRequirements, 'stage', REQUIREMENT_PIPELINE_STAGES, 'requirements')
  const dealStageCounts = countByLifecycle(activeDeals, 'stage', DEAL_PIPELINE_STAGES, 'deals')
  const listingStatusCounts = countBy(listings, 'listing_status', LISTING_PIPELINE_STATUSES)
  const dealValueByStage = activeDeals.reduce((groups, deal) => {
    const stage = normalizeCommercialLifecycleStage('deals', deal.stage, 'new')
    groups[stage] = (groups[stage] || 0) + toNumber(deal.deal_value)
    return groups
  }, {})
  const activeNegotiationValue = dealsInNegotiation.reduce((total, deal) => total + toNumber(deal.deal_value), 0)

  const outstandingDocumentRequests = documentRequests.filter((row) => ['requested', 'under_review'].includes(normalizeLower(row.status))).length
  const overdueDocumentRequests = documentRequests.filter((row) => {
    const dueDate = asDate(row.due_date)
    return dueDate && dueDate < today && !['completed', 'approved', 'archived'].includes(normalizeLower(row.status))
  }).length
  const hotDrafts = headsOfTerms.filter((row) => normalizeLower(row.status) === 'draft').length
  const hotReadyForLease = headsOfTerms.filter((row) => ['signed', 'ready_for_lease'].includes(normalizeLower(row.status))).length
  const commercialIntelligence = buildCommercialIntelligence({
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    leases,
    vacancies,
    listings,
    activity,
    documents,
    documentRequests,
    headsOfTerms,
    brokers,
  })
  const documentCompliance = buildDocumentCompliance({ landlords, tenants, properties, leases, headsOfTerms, documents, documentRequests })
  const conversionMetrics = buildCommercialConversionMetrics({ requirements, deals, headsOfTerms, leases })
  const commercialTransactions = buildCommercialTransactions({
    organisationId,
    organisationName: organisation?.name || '',
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    leases,
    vacancies,
    headsOfTerms,
    documents,
    documentRequests,
    activity,
    brokers,
  })
  const financialSummary = buildCommercialFinancialSummary(commercialTransactions)
  const renewalRisk = buildCommercialRenewalRisk(commercialTransactions)
  const platformTasks = commercialTransactions.flatMap((transaction) =>
    (transaction.tasks || []).map((task) => ({
      ...task,
      transactionId: transaction.id,
      transactionTitle: transaction.title,
      to: `/commercial/transactions/${transaction.id}`,
    })),
  ).slice(0, 12)
  const platformNotifications = commercialTransactions.flatMap((transaction) =>
    (transaction.notifications || []).map((notification) => ({
      ...notification,
      transactionId: transaction.id,
      transactionTitle: transaction.title,
      to: `/commercial/transactions/${transaction.id}`,
    })),
  ).slice(0, 12)
  const commercialSearchIndex = buildCommercialSearchIndex({ transactions: commercialTransactions, landlords, tenants, properties, deals, headsOfTerms, leases })

  return {
    organisationId,
    organisation,
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    leases,
    vacancies,
    listings,
    activity,
    brokers: brokers.map((broker) => ({
      id: normalizeText(broker.userId || broker.id),
      userId: normalizeText(broker.userId),
      name: brokerDisplayName(broker),
      email: normalizeText(broker.email),
      role: normalizeText(broker.role),
      branchId: normalizeText(broker.branchId),
    })),
    summary: {
      totalGla,
      totalGlaChange: 0,
      totalProperties: activeProperties.length,
      availableSpace,
      occupiedSpace: Math.max(0, totalGla - availableSpace),
      vacancyRate,
      activeDeals: activeDeals.length,
      activeListings: activeListings.length,
      dealsInNegotiation: dealsInNegotiation.length,
      activeRequirements: activeRequirements.length,
      unassignedRequirements: activeRequirements.filter((row) => !normalizeText(row.assigned_broker || row.broker_id)).length,
      unassignedDeals: activeDeals.filter((row) => !normalizeText(row.assigned_broker || row.broker_id)).length,
      unassignedListings: activeListings.filter((row) => !normalizeText(row.broker_id)).length,
      activeRequirementsChange: 0,
      occupancyRate,
      leaseExpiryGla: expiryExposureGla,
      leaseExpiryCount: leaseExpiryExposure.length,
      activeNegotiationValue,
      usesVacancyData,
      documentRequests: {
        outstanding: outstandingDocumentRequests,
        overdue: overdueDocumentRequests,
      },
      documentCompliance,
      conversionMetrics,
      commercialTransactions: commercialTransactions.length,
      platformTasks: platformTasks.length,
      platformNotifications: platformNotifications.length,
      financialSummary,
      headsOfTerms: {
        total: hotCount,
        drafts: hotDrafts,
        readyForLease: hotReadyForLease,
      },
    },
    charts: {
      occupancyTrend: buildOccupancyTrend({ properties: activeProperties, vacancies: openVacancies }),
      assetClassBreakdown: buildAssetClassBreakdown(activeProperties),
      leaseExpiryDistribution: buildLeaseExpiryDistribution(activeLeases, propertiesById),
    },
    intelligence: {
      topLandlords: buildLandlordLeaderboard({ landlords, properties: activeProperties, vacancies: openVacancies }),
      requirementsPipeline: buildPipeline(REQUIREMENT_PIPELINE_STAGES, requirementStageCounts),
      dealsPipeline: buildPipeline(DEAL_PIPELINE_STAGES, dealStageCounts, dealValueByStage),
      listingPipeline: buildPipeline(LISTING_PIPELINE_STATUSES, listingStatusCounts),
      activitySnapshot: buildActivitySnapshot({ requirements: activeRequirements, deals: activeDeals, leases: activeLeases, vacancies: openVacancies, listings: activeListings, headsOfTerms, activity }),
      requirementMatches: commercialIntelligence.matches,
      vacancyRisk: commercialIntelligence.vacancyRisk,
      listingQualityScores: commercialIntelligence.listingQualityScores,
      listingsNeedingAttention: commercialIntelligence.listingsNeedingAttention,
      nextBestActions: commercialIntelligence.nextBestActions,
      brokerLeaderboard: commercialIntelligence.brokerLeaderboard,
      platformTasks,
      platformNotifications,
      renewalRisk,
    },
    watchlists: {
      leaseExpiries: buildExpiryWatchlist({ leases: activeLeases, tenantsById, propertiesById, landlordsById, dealsById }),
      renewalRisk,
    },
    latestActivity: buildLatestActivity({ activity, requirements: activeRequirements, deals: activeDeals, vacancies: openVacancies, listings: activeListings, headsOfTerms }),
    commercialTransactions,
    financialSummary,
    commercialSearchIndex,
    documents,
    documentRequests,
    headsOfTerms,
  }
}
