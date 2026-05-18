import {
  getCommercialAllDocumentRequests,
  getCommercialAllDocuments,
  getCommercialAllHeadsOfTerms,
  getCommercialDeals,
  getCommercialLandlords,
  getCommercialLeases,
  getCommercialProperties,
  getCommercialRecentActivity,
  getCommercialRequirements,
  getCommercialTenants,
  getCommercialVacancies,
  resolveCommercialOrganisationContext,
} from './commercialApi'

const NEGOTIATION_DEAL_STAGES = ['proposal', 'heads_of_terms', 'lease_draft']
const REQUIREMENT_PIPELINE_STAGES = ['new_requirement', 'shortlisting', 'viewing', 'proposal', 'negotiation', 'lease_stage']
const DEAL_PIPELINE_STAGES = ['requirement', 'shortlist', 'proposal', 'heads_of_terms', 'lease_draft', 'signed']
const OPEN_VACANCY_STATUSES = ['available', 'reserved', 'under_negotiation', 'upcoming']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
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
  return isActiveStatus(row) && !['closed_won', 'closed_lost'].includes(normalizeLower(row.stage))
}

function isOpenVacancy(row) {
  return OPEN_VACANCY_STATUSES.includes(normalizeLower(row?.status || 'available'))
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

function buildActivitySnapshot({ requirements, deals, leases, vacancies, headsOfTerms, activity }) {
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
      value: requirements.filter((row) => normalizeLower(row.stage) === 'viewing').length,
      detail: 'Active requirement viewings',
    },
    {
      label: 'Proposals sent',
      value: [
        ...requirements.filter((row) => normalizeLower(row.stage) === 'proposal'),
        ...deals.filter((row) => normalizeLower(row.stage) === 'proposal'),
      ].length,
      detail: 'Proposal-stage requirements and deals',
    },
    {
      label: 'HOT sent',
      value: headsOfTerms.filter((row) => ['sent_for_review', 'approved_by_landlord', 'approved_by_tenant'].includes(normalizeLower(row.status))).length,
      detail: 'Heads of Terms in circulation',
    },
    {
      label: 'Leases signed',
      value: deals.filter((row) => normalizeLower(row.stage) === 'signed').length + leases.filter((row) => {
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

function buildLatestActivity({ activity, requirements, deals, vacancies, headsOfTerms }) {
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
    activity,
    documents,
    documentRequests,
    headsOfTerms,
  ] = await Promise.all([
    getCommercialLandlords(resolvedOrganisationId),
    getCommercialTenants(resolvedOrganisationId),
    getCommercialProperties(resolvedOrganisationId),
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialLeases(resolvedOrganisationId),
    getCommercialVacancies(resolvedOrganisationId),
    getCommercialRecentActivity(resolvedOrganisationId, 24),
    getCommercialAllDocuments(resolvedOrganisationId),
    getCommercialAllDocumentRequests(resolvedOrganisationId),
    getCommercialAllHeadsOfTerms(resolvedOrganisationId),
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
    activity,
    documents,
    documentRequests,
    headsOfTerms,
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
  activity = [],
  documents = [],
  documentRequests = [],
  headsOfTerms = [],
} = {}) {
  const activeProperties = properties.filter(isActiveStatus)
  const activeRequirements = requirements.filter(isActiveRequirement)
  const activeDeals = deals.filter(isActiveStatus)
  const activeLeases = leases.filter((row) => !['archived', 'terminated'].includes(normalizeLower(row.status)))
  const openVacancies = vacancies.filter(isOpenVacancy)
  const usesVacancyData = openVacancies.length > 0

  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const tenantsById = new Map(tenants.map((tenant) => [tenant.id, tenant]))
  const landlordsById = new Map(landlords.map((landlord) => [landlord.id, landlord]))
  const dealsById = new Map(deals.map((deal) => [deal.id, deal]))

  const totalGla = sumRows(activeProperties, 'gla_m2')
  const availableSpace = usesVacancyData ? sumRows(openVacancies, 'available_area_m2') : sumRows(activeProperties, 'available_space_m2')
  const vacancyRate = percent(availableSpace, totalGla)
  const occupancyRate = Math.max(0, Math.min(100, Math.round((100 - vacancyRate) * 10) / 10))
  const dealsInNegotiation = activeDeals.filter((row) => NEGOTIATION_DEAL_STAGES.includes(normalizeLower(row.stage)))
  const today = startOfToday()
  const next12Months = addMonths(today, 12)
  const leaseExpiryExposure = activeLeases.filter((lease) => {
    const end = asDate(lease.lease_end_date)
    return end && end >= today && end <= next12Months
  })
  const expiryExposureGla = leaseExpiryExposure.reduce((total, lease) => total + toNumber(propertiesById.get(lease.property_id)?.gla_m2), 0)

  const requirementStageCounts = countBy(activeRequirements, 'stage', REQUIREMENT_PIPELINE_STAGES)
  const dealStageCounts = countBy(activeDeals, 'stage', DEAL_PIPELINE_STAGES)
  const dealValueByStage = activeDeals.reduce((groups, deal) => {
    const stage = normalizeLower(deal.stage || 'requirement')
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
  const hotReadyForLease = headsOfTerms.filter((row) => normalizeLower(row.status) === 'ready_for_lease').length

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
    activity,
    summary: {
      totalGla,
      totalGlaChange: 0,
      availableSpace,
      vacancyRate,
      dealsInNegotiation: dealsInNegotiation.length,
      activeRequirements: activeRequirements.length,
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
      headsOfTerms: {
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
      activitySnapshot: buildActivitySnapshot({ requirements: activeRequirements, deals: activeDeals, leases: activeLeases, vacancies: openVacancies, headsOfTerms, activity }),
    },
    watchlists: {
      leaseExpiries: buildExpiryWatchlist({ leases: activeLeases, tenantsById, propertiesById, landlordsById, dealsById }),
    },
    latestActivity: buildLatestActivity({ activity, requirements: activeRequirements, deals: activeDeals, vacancies: openVacancies, headsOfTerms }),
    documents,
    documentRequests,
    headsOfTerms,
  }
}
