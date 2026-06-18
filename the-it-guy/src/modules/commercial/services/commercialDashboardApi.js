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
  getCommercialRecentActivity,
  getCommercialRequirements,
  getCommercialTenants,
  getCommercialTransactions,
  getCommercialVacancies,
  getCommercialViewings,
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
import {
  buildCommercialPortalAdoption,
  listCommercialPortalAccessForOrganisation,
  listCommercialPortalAuditEvents,
} from './commercialPortalApi'

const NEGOTIATION_DEAL_STAGES = ['negotiation', 'hot_draft', 'hot_sent', 'hot_accepted', 'lease_pending', 'proposal', 'heads_of_terms', 'lease_draft']
const REQUIREMENT_PIPELINE_STAGES = ['new', 'qualified', 'matching', 'viewing_scheduled', 'negotiating', 'hot', 'won', 'lost']
const DEAL_PIPELINE_STAGES = ['new', 'qualified', 'negotiation', 'hot_draft', 'hot_sent', 'hot_accepted', 'lease_pending', 'converted', 'lost']
const OPEN_VACANCY_STATUSES = ['draft', 'available', 'marketing', 'under_negotiation', 'under_offer', 'hot_in_progress', 'reserved', 'upcoming']
const ACTIVE_LISTING_STATUSES = ['internal_review', 'approved', 'published', 'under_offer']
const LISTING_PIPELINE_STATUSES = ['draft', 'internal_review', 'approved', 'published', 'under_offer', 'closed', 'withdrawn', 'expired', 'archived']

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

function daysBetween(left, right) {
  const start = asDate(left)
  const end = asDate(right)
  if (!start || !end) return null
  return Math.ceil((end.getTime() - start.getTime()) / 86400000)
}

function isActiveStatus(row) {
  const status = normalizeLower(row?.status || 'active')
  return !['archived', 'inactive', 'closed_lost', 'expired', 'terminated', 'cancelled'].includes(status)
}

function isActiveRequirement(row) {
  return isActiveStatus(row) && !['won', 'lost'].includes(normalizeCommercialLifecycleStage('requirements', row.stage, 'new'))
}

function isOpenVacancy(row) {
  return OPEN_VACANCY_STATUSES.includes(normalizeCommercialLifecycleStage('vacancies', row?.status, 'draft'))
}

function isActiveListing(row) {
  return ACTIVE_LISTING_STATUSES.includes(normalizeCommercialLifecycleStage('listings', row?.listing_status || row?.status, 'draft'))
}

function sumRows(rows, key) {
  return rows.reduce((total, row) => total + toNumber(row?.[key]), 0)
}

function percent(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 1000) / 10
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

function buildInventorySummary({ properties = [], vacancies = [], listings = [], totalGla = 0, availableSpace = 0 } = {}) {
  const occupiedSpace = Math.max(0, totalGla - availableSpace)
  return {
    properties: properties.length,
    vacancies: vacancies.length,
    listings: listings.length,
    availableSpace,
    occupiedSpace,
    occupancyRate: percent(occupiedSpace, totalGla),
  }
}

function buildTopPerformingAssets({ properties = [], vacancies = [], viewings = [], deals = [], transactions = [], requirementMatches = [] } = {}) {
  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const vacancyById = new Map(vacancies.map((vacancy) => [vacancy.id, vacancy]))
  const scoreMap = new Map()

  function ensure(propertyId) {
    if (!propertyId) return null
    if (!scoreMap.has(propertyId)) {
      const property = propertiesById.get(propertyId)
      scoreMap.set(propertyId, {
        id: propertyId,
        propertyId,
        title: property?.property_name || 'Commercial asset',
        location: [property?.suburb, property?.city].filter(Boolean).join(', ') || property?.address || '-',
        viewed: 0,
        active: 0,
        leased: 0,
        demand: 0,
      })
    }
    return scoreMap.get(propertyId)
  }

  viewings.forEach((viewing) => {
    const propertyId = viewing.property_id || vacancyById.get(viewing.vacancy_id)?.property_id
    const bucket = ensure(propertyId)
    if (!bucket) return
    bucket.viewed += 1
    bucket.active += 1
  })

  deals.forEach((deal) => {
    const bucket = ensure(deal.property_id || vacancyById.get(deal.vacancy_id)?.property_id)
    if (!bucket) return
    bucket.active += 1
  })

  transactions.forEach((transaction) => {
    const bucket = ensure(transaction.property_id || vacancyById.get(transaction.vacancy_id)?.property_id)
    if (!bucket) return
    bucket.active += ['completed', 'lost', 'cancelled'].includes(normalizeLower(transaction.status)) ? 0 : 1
    bucket.leased += normalizeLower(transaction.status) === 'completed' ? 1 : 0
  })

  requirementMatches.forEach((match) => {
    const propertyId = vacancyById.get(match.vacancyId)?.property_id
    const bucket = ensure(propertyId)
    if (!bucket) return
    bucket.demand += 1
  })

  const rows = Array.from(scoreMap.values())
  return {
    mostViewed: rows.slice().sort((left, right) => right.viewed - left.viewed).slice(0, 5),
    mostActive: rows.slice().sort((left, right) => right.active - left.active).slice(0, 5),
    mostLeased: rows.slice().sort((left, right) => right.leased - left.leased).slice(0, 5),
    mostInDemand: rows.slice().sort((left, right) => right.demand - left.demand).slice(0, 5),
  }
}

function buildPipeline(stages, counts, valueByStage = {}) {
  return stages.map((stage) => ({
    key: stage,
    label: stage === 'heads_of_terms' ? 'Heads of Terms' : labelFromStage(stage),
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
      value: requirements.filter((row) => normalizeCommercialLifecycleStage('requirements', row.stage, 'new') === 'viewing_scheduled').length,
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
      label: 'Heads of Terms sent',
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

function viewingDateTime(row = {}) {
  const date = row.viewing_date ? new Date(`${row.viewing_date}T${String(row.viewing_time || '00:00').slice(0, 8)}`) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function buildUpcomingViewings({ viewings = [], companiesById = new Map(), tenantsById = new Map(), propertiesById = new Map(), brokers = [] } = {}) {
  const today = startOfToday()
  const brokerMap = new Map(brokers.map((broker) => [normalizeText(broker.userId || broker.user_id || broker.id), brokerDisplayName(broker)]))
  return viewings
    .filter((row) => !['completed', 'cancelled', 'no_show'].includes(normalizeLower(row.status)))
    .map((row) => ({ ...row, scheduledAt: viewingDateTime(row) }))
    .filter((row) => row.scheduledAt && row.scheduledAt >= today)
    .sort((left, right) => left.scheduledAt - right.scheduledAt)
    .slice(0, 5)
    .map((row) => ({
      id: row.id,
      date: row.viewing_date,
      time: String(row.viewing_time || '').slice(0, 5),
      company: companiesById.get(row.company_id)?.company_name || companiesById.get(row.company_id)?.name || tenantsById.get(row.company_id)?.name || 'Company pending',
      property: propertiesById.get(row.property_id)?.property_name || 'Property pending',
      broker: brokerMap.get(normalizeText(row.broker_id)) || 'Broker pending',
      status: normalizeLower(row.status || 'scheduled'),
      to: '/commercial/viewings',
    }))
}

function buildExpiryWatchlist({ leases, tenantsById, propertiesById, landlordsById, dealsById }) {
  const today = startOfToday()
  const horizon = addMonths(today, 24)

  return leases
    .map((lease) => {
      const end = asDate(lease.lease_end_date)
      if (!end || end < today || end > horizon) return null
      const monthsRemaining = Math.max(0, ((end.getFullYear() - today.getFullYear()) * 12) + (end.getMonth() - today.getMonth()))
      const daysToExpiry = daysBetween(today, end)
      const property = propertiesById.get(lease.property_id)
      const tenant = tenantsById.get(lease.tenant_id)
      const landlord = landlordsById.get(lease.landlord_id || property?.landlord_id)
      const linkedDeal = dealsById.get(lease.deal_id)
      const risk = daysToExpiry <= 30 ? 'High' : daysToExpiry <= 90 ? 'Medium' : 'Low'
      return {
        id: lease.id,
        tenant: tenant?.name || 'Unassigned tenant',
        property: property?.property_name || 'Unassigned property',
        landlord: landlord?.name || 'Unassigned landlord',
        gla: toNumber(property?.gla_m2),
        leaseExpiry: lease.lease_end_date,
        monthsRemaining,
        daysToExpiry,
        risk,
        assignedBroker: linkedDeal?.assigned_broker ? 'Assigned broker' : 'Unassigned',
      }
    })
    .filter(Boolean)
    .sort((a, b) => asDate(a.leaseExpiry) - asDate(b.leaseExpiry))
    .slice(0, 8)
}

function withinCurrentMonth(date) {
  const value = asDate(date)
  if (!value) return false
  const today = startOfToday()
  const start = new Date(today.getFullYear(), today.getMonth(), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  end.setHours(23, 59, 59, 999)
  return value >= start && value <= end
}

function averageDealCycleDays(transactions = []) {
  const values = transactions
    .filter((transaction) => normalizeLower(transaction.status) === 'completed')
    .map((transaction) => daysBetween(transaction.createdAt, transaction.actualCloseDate || transaction.updatedAt))
    .filter((value) => Number.isFinite(value) && value >= 0)
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function buildExecutivePipelineView({ requirements = [], viewings = [], deals = [], transactions = [] } = {}) {
  const activeRequirements = requirements.filter(isActiveRequirement)
  const activeViewings = viewings.filter((viewing) => !['cancelled', 'no_show'].includes(normalizeLower(viewing.status)))
  const activeDeals = deals.filter(isActiveStatus)
  const activeTransactions = transactions.filter((transaction) => !['completed', 'lost', 'cancelled'].includes(normalizeLower(transaction.status)))
  const completedTransactions = transactions.filter((transaction) => normalizeLower(transaction.status) === 'completed')
  const requirementValue = activeRequirements.reduce((sum, requirement) => sum + Math.max(toNumber(requirement.budget_max), toNumber(requirement.budget_min)), 0)
  const viewingValue = activeViewings.reduce((sum, viewing) => sum + Math.max(toNumber(viewing.asking_rental), 0), 0)
  const dealValue = activeDeals.reduce((sum, deal) => sum + toNumber(deal.deal_value), 0)
  const transactionValue = activeTransactions.reduce((sum, transaction) => sum + toNumber(transaction.value || transaction.targetValue), 0)
  const completedValue = completedTransactions.reduce((sum, transaction) => sum + toNumber(transaction.value || transaction.targetValue), 0)
  const stages = [
    { key: 'requirements', label: 'Requirements', count: activeRequirements.length, value: requirementValue },
    { key: 'viewings', label: 'Viewings', count: activeViewings.length, value: viewingValue },
    { key: 'deals', label: 'Deals', count: activeDeals.length, value: dealValue },
    { key: 'transactions', label: 'Transactions', count: activeTransactions.length, value: transactionValue },
    { key: 'completed', label: 'Completed', count: completedTransactions.length, value: completedValue },
  ]

  return stages.map((stage, index) => {
    const previous = stages[index - 1]
    return {
      ...stage,
      conversion: !previous?.count ? 100 : percent(stage.count, previous.count),
    }
  })
}

function buildRenewalPipeline({ renewalRisk = [], commercialTransactions = [] } = {}) {
  const renewalTransactionIds = new Set(
    commercialTransactions
      .filter((transaction) => transaction.lease?.lease_end_date && transaction.lease?.id)
      .map((transaction) => transaction.id),
  )
  const renewalRequired = renewalRisk.filter((row) => row.daysToExpiry <= 180).length
  const negotiating = commercialTransactions.filter((transaction) => renewalTransactionIds.has(transaction.id) && normalizeLower(transaction.status) === 'negotiating').length
  const hot = commercialTransactions.filter((transaction) => renewalTransactionIds.has(transaction.id) && ['hot_in_progress', 'hot_signed'].includes(normalizeLower(transaction.status))).length
  const renewed = commercialTransactions.filter((transaction) => renewalTransactionIds.has(transaction.id) && normalizeLower(transaction.status) === 'completed').length
  const vacated = renewalRisk.filter((row) => row.daysToExpiry <= 0).length
  return [
    { key: 'renewal_required', label: 'Renewal Required', count: renewalRequired },
    { key: 'negotiating', label: 'Negotiating', count: negotiating },
    { key: 'hot', label: 'Heads of Terms', count: hot },
    { key: 'renewed', label: 'Renewed', count: renewed },
    { key: 'vacated', label: 'Vacated', count: vacated },
  ]
}

function buildManagementAlerts({ vacancies = [], requirements = [], commercialTransactions = [], leases = [], brokerRows = [] } = {}) {
  const today = startOfToday()
  const alerts = []

  vacancies.forEach((vacancy) => {
    if (!isOpenVacancy(vacancy)) return
    const startedAt = asDate(vacancy.marketed_at || vacancy.created_at)
    const age = startedAt ? daysBetween(startedAt, today) : null
    if (Number.isFinite(age) && age > 90) {
      alerts.push({
        id: `vacancy-${vacancy.id}`,
        type: 'Stale Vacancy',
        priority: age > 120 ? 'High' : 'Medium',
        title: vacancy.vacancy_name || 'Commercial vacancy',
        detail: `${age} days on market`,
        to: `/commercial/vacancies/${vacancy.id}`,
      })
    }
  })

  requirements.forEach((requirement) => {
    if (!isActiveRequirement(requirement)) return
    const updatedAt = asDate(requirement.updated_at || requirement.created_at)
    const age = updatedAt ? daysBetween(updatedAt, today) : null
    if (Number.isFinite(age) && age > 60) {
      alerts.push({
        id: `requirement-${requirement.id}`,
        type: 'Aging Requirement',
        priority: age > 90 ? 'High' : 'Medium',
        title: requirement.requirement_name || 'Requirement',
        detail: `${age} days without resolution`,
        to: '/commercial/requirements',
      })
    }
  })

  commercialTransactions.forEach((transaction) => {
    if (['completed', 'lost', 'cancelled'].includes(normalizeLower(transaction.status))) return
    const updatedAt = asDate(transaction.updatedAt || transaction.createdAt)
    const age = updatedAt ? daysBetween(updatedAt, today) : null
    if (Number.isFinite(age) && age > 21) {
      alerts.push({
        id: `transaction-${transaction.id}`,
        type: 'Stalled Transaction',
        priority: age > 35 ? 'High' : 'Medium',
        title: transaction.title || 'Commercial transaction',
        detail: `${age} days since last meaningful update`,
        to: `/commercial/transactions/${transaction.id}`,
      })
    }
  })

  leases.forEach((lease) => {
    if (!isActiveStatus(lease)) return
    const days = daysBetween(today, lease.lease_end_date)
    if (days !== null && days >= 0 && days <= 180) {
      alerts.push({
        id: `lease-${lease.id}`,
        type: 'Lease Expiring',
        priority: days <= 30 ? 'High' : days <= 90 ? 'Medium' : 'Low',
        title: lease.id ? `Lease ${String(lease.id).slice(0, 8)}` : 'Commercial lease',
        detail: `${days} days to expiry`,
        to: '/commercial/lease-expiry-watch',
      })
    }
  })

  brokerRows.forEach((broker) => {
    if (broker.capacityLabel !== 'Overloaded') return
    alerts.push({
      id: `broker-${broker.id}`,
      type: 'Broker Over Capacity',
      priority: 'High',
      title: broker.name || 'Commercial broker',
      detail: `${broker.capacityScore} workload score`,
      to: `/commercial/brokers/${broker.id}`,
    })
  })

  const order = { High: 3, Medium: 2, Low: 1 }
  return alerts
    .sort((left, right) => (order[right.priority] || 0) - (order[left.priority] || 0) || String(left.title).localeCompare(String(right.title)))
    .slice(0, 12)
}

function brokerKey(row = {}) {
  return normalizeText(row.userId || row.user_id || row.id)
}

function buildCommercialViewerBrokerIds(scope = {}) {
  return new Set([
    normalizeText(scope.userId),
    normalizeText(scope.membership?.id),
    normalizeText(scope.membership?.user_id),
    normalizeText(scope.membership?.userId),
  ].filter(Boolean))
}

function filterBrokerDirectoryForScope(brokers = [], scope = {}) {
  if (!scope?.scopeLevel) return brokers
  if (scope?.scopeLevel === 'organisation') return brokers
  if (scope?.scopeLevel === 'branch' && normalizeText(scope.branchId)) {
    return brokers.filter((broker) => normalizeText(broker.branchId || broker.branch_id || broker.primary_branch_id) === normalizeText(scope.branchId))
  }
  if (scope?.scopeLevel === 'team' && normalizeText(scope.teamId)) {
    return brokers.filter((broker) => normalizeText(broker.teamId || broker.team_id) === normalizeText(scope.teamId))
  }
  if (scope?.scopeLevel === 'broker') {
    const brokerIds = buildCommercialViewerBrokerIds(scope)
    return brokers.filter((broker) => brokerIds.has(normalizeText(broker.userId || broker.user_id || broker.id)))
  }
  return []
}

function buildBrokerScorecards({ brokers = [], requirements = [], viewings = [], deals = [], vacancies = [], listings = [], commercialTransactions = [], commissions = [], properties = [] } = {}) {
  const brokerMap = new Map()
  brokers.forEach((broker) => {
    const id = brokerKey(broker)
    if (!id) return
    brokerMap.set(id, {
      id,
      name: brokerDisplayName(broker),
      email: normalizeText(broker.email),
      role: normalizeText(broker.role),
      branchId: normalizeText(broker.branchId || broker.branch_id || broker.primary_branch_id),
      teamId: normalizeText(broker.teamId || broker.team_id),
      branchName: normalizeText(broker.branchName) || 'Assigned branch',
    })
  })

  const allBrokerIds = new Set([
    ...Array.from(brokerMap.keys()),
    ...requirements.map((row) => normalizeText(row.assigned_broker || row.broker_id)),
    ...viewings.map((row) => normalizeText(row.broker_id)),
    ...deals.map((row) => normalizeText(row.assigned_broker || row.broker_id)),
    ...vacancies.map((row) => normalizeText(row.broker_assignment || row.broker_id)),
    ...listings.map((row) => normalizeText(row.broker_id)),
    ...commercialTransactions.map((row) => normalizeText(row.brokerId || row.broker_id)),
  ].filter(Boolean))

  return Array.from(allBrokerIds).map((id) => {
    const broker = brokerMap.get(id) || { id, name: 'Assigned broker', email: '', role: 'broker', branchId: '', teamId: '', branchName: 'Assigned branch' }
    const brokerRequirements = requirements.filter((row) => normalizeText(row.assigned_broker || row.broker_id) === id)
    const brokerViewings = viewings.filter((row) => normalizeText(row.broker_id) === id)
    const brokerDeals = deals.filter((row) => normalizeText(row.assigned_broker || row.broker_id) === id)
    const brokerVacancies = vacancies.filter((row) => normalizeText(row.broker_assignment || row.broker_id) === id)
    const brokerListings = listings.filter((row) => normalizeText(row.broker_id) === id)
    const brokerProperties = properties.filter((row) => normalizeText(row.broker_id) === id)
    const brokerTransactions = commercialTransactions.filter((row) => normalizeText(row.brokerId || row.broker_id) === id)
    const brokerCommissions = commissions.filter((row) => normalizeText(row.broker_id) === id)
    const activeRequirements = brokerRequirements.filter(isActiveRequirement)
    const activeDeals = brokerDeals.filter(isActiveStatus)
    const activeTransactions = brokerTransactions.filter((row) => !['completed', 'lost', 'cancelled'].includes(normalizeLower(row.status)))
    const upcomingViewings = brokerViewings.filter((row) => {
      const scheduledAt = viewingDateTime(row)
      return scheduledAt && scheduledAt >= startOfToday() && !['completed', 'cancelled', 'no_show'].includes(normalizeLower(row.status))
    })
    const completedViewings = brokerViewings.filter((row) => normalizeLower(row.status) === 'completed')
    const closedTransactions = brokerTransactions.filter((row) => normalizeLower(row.status) === 'completed')
    const pipelineValue = activeTransactions.reduce((sum, row) => sum + toNumber(row.value || row.targetValue), 0) || activeDeals.reduce((sum, row) => sum + toNumber(row.deal_value), 0)
    const expectedCommission = brokerCommissions.filter((row) => normalizeLower(row.status) === 'projected').reduce((sum, row) => sum + toNumber(row.commission_amount), 0)
    const approvedRevenue = brokerCommissions.filter((row) => normalizeLower(row.status) === 'approved').reduce((sum, row) => sum + toNumber(row.commission_amount), 0)
    const paidRevenue = brokerCommissions.filter((row) => normalizeLower(row.status) === 'paid').reduce((sum, row) => sum + toNumber(row.commission_amount), 0)
    const leasedSpace = closedTransactions.reduce((sum, row) => sum + (normalizeLower(row.transactionType) === 'lease' ? toNumber(row.vacancy?.available_area_m2 || row.property?.gla_m2) : 0), 0)
    const soldSpace = closedTransactions.reduce((sum, row) => sum + (normalizeLower(row.transactionType) === 'sale' ? toNumber(row.property?.gla_m2 || row.vacancy?.available_area_m2) : 0), 0)
    const workload = activeRequirements.length + activeDeals.length * 2 + activeTransactions.length * 2 + brokerListings.filter(isActiveListing).length + brokerVacancies.filter(isOpenVacancy).length + upcomingViewings.length
    const capacityLabel = workload >= 18 ? 'Overloaded' : workload >= 12 ? 'High' : workload >= 6 ? 'Medium' : 'Low'

    return {
      ...broker,
      activeRequirements: activeRequirements.length,
      requirementsCreated: brokerRequirements.length,
      viewingsCompleted: completedViewings.length,
      activeViewings: upcomingViewings.length,
      dealsCreated: brokerDeals.length,
      activeDeals: activeDeals.length,
      transactionsCreated: brokerTransactions.length,
      activeTransactions: activeTransactions.length,
      closedTransactions: closedTransactions.length,
      valueClosed: closedTransactions.reduce((sum, row) => sum + toNumber(row.value || row.targetValue), 0),
      pipelineValue,
      expectedCommission,
      approvedRevenue,
      paidRevenue,
      activeListings: brokerListings.filter(isActiveListing).length,
      activeVacancies: brokerVacancies.filter(isOpenVacancy).length,
      activeProperties: brokerProperties.filter(isActiveStatus).length,
      leasedSpace,
      soldSpace,
      occupancyGenerated: leasedSpace + soldSpace,
      upcomingViewings: upcomingViewings.length,
      capacityScore: workload,
      capacityLabel,
      requirements: brokerRequirements,
      viewings: brokerViewings,
      deals: brokerDeals,
      vacancies: brokerVacancies,
      listings: brokerListings,
      properties: brokerProperties,
      transactions: brokerTransactions,
      commissions: brokerCommissions,
    }
  }).sort((left, right) => right.pipelineValue - left.pipelineValue || right.valueClosed - left.valueClosed || left.name.localeCompare(right.name))
}

function buildStockLeaderboard({ properties = [], vacancies = [], deals = [], commercialTransactions = [], viewings = [] } = {}) {
  return properties.map((property) => {
    const propertyVacancies = vacancies.filter((vacancy) => vacancy.property_id === property.id)
    const available = propertyVacancies.filter(isOpenVacancy).reduce((sum, vacancy) => sum + toNumber(vacancy.available_area_m2), 0)
    const totalGla = toNumber(property.gla_m2)
    return {
      id: property.id,
      propertyName: property.property_name || 'Commercial asset',
      occupancyRate: Math.max(0, 100 - percent(available, totalGla)),
      vacancyRate: percent(available, totalGla),
      activeDeals: deals.filter((deal) => deal.property_id === property.id && isActiveStatus(deal)).length,
      transactions: commercialTransactions.filter((transaction) => transaction.property?.id === property.id || transaction.property_id === property.id).length,
      leasingVelocity: viewings.filter((viewing) => viewing.property_id === property.id && normalizeLower(viewing.status) === 'completed').length,
    }
  }).sort((left, right) => right.occupancyRate - left.occupancyRate || right.transactions - left.transactions).slice(0, 10)
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
      entity: 'Heads of Terms',
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
    ...headsOfTerms.map((row) => ({ type: 'commercial_heads_of_terms', label: 'Heads of Terms', id: row.id, name: row.premises_description || `Heads of Terms ${String(row.id || '').slice(0, 8)}`, brokerId: row.broker_id, branchId: row.branch_id, teamId: row.team_id })),
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

export async function getCommercialPrincipalDashboardData(organisationId, accessScope = null) {
  const context = await resolveCommercialOrganisationContext()
  const resolvedOrganisationId = organisationId || context.organisationId
  const scope = accessScope || {}

  if (!resolvedOrganisationId) {
    return buildCommercialPrincipalDashboardData({ organisation: context.organisation })
  }

  const [
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
    activity,
    documents,
    documentRequests,
    headsOfTerms,
    portalAccess,
    portalAudit,
    brokers,
  ] = await Promise.all([
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
    getCommercialRecentActivity(resolvedOrganisationId, 24),
    getCommercialAllDocuments(resolvedOrganisationId),
    getCommercialAllDocumentRequests(resolvedOrganisationId),
    getCommercialAllHeadsOfTerms(resolvedOrganisationId),
    listCommercialPortalAccessForOrganisation(resolvedOrganisationId).catch(() => []),
    listCommercialPortalAuditEvents(resolvedOrganisationId, 40).catch(() => []),
    listOrganisationUsers().catch(() => []),
  ])

  return buildCommercialPrincipalDashboardData({
    organisationId: resolvedOrganisationId,
    organisation: context.organisation,
    viewerScope: scope,
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
    activity,
    documents,
    documentRequests,
    headsOfTerms,
    portalAccess,
    portalAudit,
    brokers: filterBrokerDirectoryForScope(brokers, scope),
  })
}

export function buildCommercialPrincipalDashboardData({
  organisationId = '',
  organisation = null,
  transactions = [],
  commissions = [],
  companies = [],
  contacts = [],
  landlords = [],
  tenants = [],
  properties = [],
  requirements = [],
  deals = [],
  leases = [],
  vacancies = [],
  listings = [],
  viewings = [],
  activity = [],
  documents = [],
  documentRequests = [],
  headsOfTerms = [],
  portalAccess = [],
  portalAudit = [],
  brokers = [],
  viewerScope = {},
} = {}) {
  const activeProperties = properties.filter(isActiveStatus)
  const activeCompanies = companies.filter((row) => !['archived', 'inactive'].includes(normalizeLower(row.status)))
  const activeContacts = contacts.filter((row) => normalizeLower(row.status) === 'active')
  const activeRequirements = requirements.filter(isActiveRequirement)
  const activeDeals = deals.filter(isActiveStatus)
  const activeLeases = leases.filter((row) => !['archived', 'terminated'].includes(normalizeLower(row.status)))
  const openVacancies = vacancies.filter(isOpenVacancy)
  const activeListings = listings.filter(isActiveListing)
  const usesVacancyData = openVacancies.length > 0

  const propertiesById = new Map(properties.map((property) => [property.id, property]))
  const companiesById = new Map(companies.map((company) => [company.id, company]))
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
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  endOfMonth.setHours(23, 59, 59, 999)
  const next12Months = addMonths(today, 12)
  const leaseExpiryExposure = activeLeases.filter((lease) => {
    const end = asDate(lease.lease_end_date)
    return end && end >= today && end <= next12Months
  })
  const expiryExposureGla = leaseExpiryExposure.reduce((total, lease) => total + toNumber(propertiesById.get(lease.property_id)?.gla_m2), 0)

  const requirementStageCounts = countByLifecycle(activeRequirements, 'stage', REQUIREMENT_PIPELINE_STAGES, 'requirements')
  const dealStageCounts = countByLifecycle(activeDeals, 'stage', DEAL_PIPELINE_STAGES, 'deals')
  const listingStatusCounts = countByLifecycle(listings, 'listing_status', LISTING_PIPELINE_STATUSES, 'listings')
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
    companies,
    contacts,
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
    transactions,
    commissions,
    landlords,
    tenants,
    properties,
    requirements,
    deals,
    listings,
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
  const brokerScorecards = buildBrokerScorecards({
    brokers,
    requirements,
    viewings,
    deals,
    vacancies,
    listings,
    commercialTransactions,
    commissions,
    properties,
  })
  const executivePipeline = buildExecutivePipelineView({
    requirements,
    viewings,
    deals,
    transactions: commercialTransactions,
  })
  const managementAlerts = buildManagementAlerts({
    vacancies: openVacancies,
    requirements: activeRequirements,
    commercialTransactions,
    leases: activeLeases,
    brokerRows: brokerScorecards,
  })
  const renewalPipeline = buildRenewalPipeline({ renewalRisk, commercialTransactions })
  const stockLeaderboard = buildStockLeaderboard({
    properties: activeProperties,
    vacancies: openVacancies,
    deals: activeDeals,
    commercialTransactions,
    viewings,
  })
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
  const commercialSearchIndex = buildCommercialSearchIndex({ transactions: commercialTransactions, companies, contacts, landlords, tenants, properties, deals, headsOfTerms, leases })
  const activeViewings = viewings.filter((row) => !['cancelled'].includes(normalizeLower(row.status)))
  const viewingsThisMonth = activeViewings.filter((row) => {
    const date = viewingDateTime(row)
    return date && date >= startOfMonth && date <= endOfMonth
  }).length
  const viewingsCompleted = viewings.filter((row) => normalizeLower(row.status) === 'completed').length
  const upcomingViewings = buildUpcomingViewings({ viewings, companiesById, tenantsById, propertiesById, brokers })
  const activeTransactions = commercialTransactions.filter((row) => !['completed', 'lost', 'cancelled'].includes(normalizeLower(row.status)))
  const transactionsClosedThisMonth = commercialTransactions.filter((row) => {
    if (normalizeLower(row.status) !== 'completed') return false
    const closedAt = asDate(row.actualCloseDate || row.updatedAt)
    return closedAt && closedAt >= startOfMonth && closedAt <= endOfMonth
  }).length
  const dealsCreatedThisMonth = deals.filter((row) => withinCurrentMonth(row.created_at)).length
  const transactionValue = activeTransactions.reduce((total, row) => total + toNumber(row.value), 0)
  const averageDealCycle = averageDealCycleDays(commercialTransactions)
  const recentCompanies = activeCompanies
    .slice()
    .sort((left, right) => asDate(right.updated_at || right.created_at || 0) - asDate(left.updated_at || left.created_at || 0))
    .slice(0, 5)
  const topClients = activeCompanies
    .map((company) => ({
      ...company,
      requirements: activeRequirements.filter((row) => row.company_id === company.id).length,
      deals: activeDeals.filter((row) => row.company_id === company.id).length,
      transactions: activeTransactions.filter((row) => row.company?.id === company.id || row.company_id === company.id).length,
    }))
    .filter((row) => row.requirements || row.deals || row.transactions)
    .sort((left, right) => (right.requirements + right.deals + right.transactions) - (left.requirements + left.deals + left.transactions))
    .slice(0, 5)
  const inventorySummary = buildInventorySummary({
    properties: activeProperties,
    vacancies: openVacancies,
    listings: activeListings,
    totalGla,
    availableSpace,
  })
  const topPerformingAssets = buildTopPerformingAssets({
    properties: activeProperties,
    vacancies: openVacancies,
    viewings,
    deals: activeDeals,
    transactions: commercialTransactions,
    requirementMatches: commercialIntelligence.matches || [],
  })
  const portalAdoption = buildCommercialPortalAdoption(portalAccess, portalAudit)

  return {
    organisationId,
    organisation,
    viewerScope,
    landlords,
    tenants,
    companies,
    contacts,
    properties,
    requirements,
    deals,
    leases,
    vacancies,
    listings,
    viewings,
    commissions,
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
      activeCompanies: activeCompanies.length,
      activeContacts: activeContacts.length,
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
      activeTransactions: activeTransactions.length,
      transactionsClosedThisMonth,
      transactionValue,
      activeVacancies: openVacancies.length,
      pipelineValue: financialSummary.pipelineValue,
      expectedRevenue: financialSummary.projectedRevenue,
      approvedRevenue: financialSummary.approvedRevenue,
      paidRevenue: financialSummary.paidRevenue,
      dealsCreatedThisMonth,
      averageDealCycle,
      headsOfTerms: {
        total: hotCount,
        drafts: hotDrafts,
        readyForLease: hotReadyForLease,
      },
      viewings: {
        upcoming: upcomingViewings.length,
        thisMonth: viewingsThisMonth,
        completed: viewingsCompleted,
      },
      portal: {
        activeAccess: portalAdoption.activeAccess,
        activeUsers: portalAdoption.activeUsers,
        pendingInvitations: portalAdoption.pendingInvitations,
        recentUploads: portalAdoption.recentUploads?.length || 0,
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
      managementAlerts,
      executivePipeline,
      renewalPipeline,
      stockLeaderboard,
      upcomingViewings,
      recentCompanies,
      topClients,
      inventorySummary,
      topPerformingAssets,
      portalAdoption,
      brokerLeaderboard: commercialIntelligence.brokerLeaderboard,
      platformTasks,
      platformNotifications,
      recentTransactions: commercialTransactions.slice(0, 5),
      renewalRisk,
      brokerScorecards,
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
    portalAccess,
    portalAudit,
    portalAdoption,
  }
}
