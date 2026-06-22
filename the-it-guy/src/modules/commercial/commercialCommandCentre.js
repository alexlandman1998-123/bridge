import { COMMERCIAL_ASSET_CLASSES, getCommercialAssetConfiguration, normalizeCommercialAssetClass } from './commercialAssetConfiguration.js'
import { inferCommercialDealType, inferCommercialLeadType } from './commercialConversionEngine.js'
import { normalizeKey, normalizeText } from './commercialProspectFormatters.js'

export const COMMAND_CENTRE_SNAPSHOT_VIEWS = [
  'commercial_pipeline_snapshot',
  'commercial_revenue_snapshot',
  'commercial_broker_snapshot',
  'commercial_asset_snapshot',
  'commercial_area_snapshot',
]

const ASSET_CLASSES = COMMERCIAL_ASSET_CLASSES.filter((assetClass) => assetClass !== 'other')
const DEFAULT_SALE_COMMISSION_PERCENT = 5
const DEFAULT_LEASE_COMMISSION_PERCENT = 6.5

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function asDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function today() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function daysBetween(start, end) {
  const startDate = asDate(start)
  const endDate = asDate(end)
  if (!startDate || !endDate) return null
  return Math.round((endDate.getTime() - startDate.getTime()) / 86400000)
}

function percent(numerator, denominator) {
  if (!denominator) return 0
  return Math.round((toNumber(numerator) / toNumber(denominator)) * 1000) / 10
}

function countActive(rows = []) {
  return rows.filter((row) => !['archived', 'inactive', 'lost', 'cancelled', 'withdrawn', 'expired'].includes(normalizeKey(row.status || row.stage || row.listing_status))).length
}

function isOpenDeal(row = {}) {
  return !['completed', 'closed', 'closed_won', 'won', 'lost', 'cancelled', 'archived', 'converted'].includes(normalizeKey(row.status || row.stage))
}

function isClosedThisMonth(row = {}) {
  const status = normalizeKey(row.status || row.stage)
  if (!['completed', 'closed', 'closed_won', 'won', 'converted', 'signed'].some((key) => status.includes(key))) return false
  const date = asDate(row.closed_at || row.completed_at || row.updated_at || row.actualCloseDate)
  return Boolean(date && date >= startOfMonth())
}

function recordDate(row = {}) {
  return row.updated_at || row.updatedAt || row.last_activity_at || row.lastActivityAt || row.created_at || row.createdAt
}

function getAssetClass(row = {}) {
  return normalizeCommercialAssetClass(
    row.asset_class ||
    row.property_category ||
    row.propertyCategory ||
    row.listing_category ||
    row.vacancy_type ||
    row.property_type ||
    row.propertyType ||
    row.category,
  )
}

function getArea(row = {}) {
  return normalizeText(row.area_node || row.area || row.suburb || row.city || row.node || row.formatted_address || row.property_address) || 'Unassigned'
}

function getSource(row = {}) {
  return normalizeText(row.source || row.sourceLabel || row.canvassing_method || row.canvassingMethod || row.lead_source) || 'Other'
}

function getBrokerId(row = {}) {
  return normalizeText(row.broker_id || row.brokerId || row.assigned_broker || row.assignedBrokerId || row.broker_assignment || row.created_by)
}

function brokerName(row = {}) {
  return normalizeText(row.name || row.fullName || row.full_name || [row.firstName || row.first_name, row.lastName || row.last_name].filter(Boolean).join(' ') || row.email) || 'Commercial broker'
}

function dealStageProbability(row = {}) {
  const stage = normalizeKey(row.stage || row.status || row.currentStage || row.listing_status)
  if (stage.includes('closed') || stage.includes('signed') || stage.includes('converted') || stage.includes('completed')) return 1
  if (stage.includes('offer') || stage.includes('hot_accepted') || stage.includes('lease_pending')) return 0.85
  if (stage.includes('negotiat') || stage.includes('hot') || stage.includes('proposal')) return 0.65
  if (stage.includes('viewing') || stage.includes('match')) return 0.45
  if (stage.includes('qualified') || stage.includes('approved') || stage.includes('published')) return 0.35
  return 0.2
}

function commissionPercent(row = {}, fallback) {
  const raw = toNumber(row.commission_percent || row.commissionPercentage || row.commission_rate || row.commissionRate)
  if (!raw) return fallback
  return raw > 1 ? raw : raw * 100
}

function estimateRevenue(row = {}, dealType = 'lease') {
  const probability = dealStageProbability(row)
  const explicit = toNumber(row.expected_revenue || row.expectedRevenue || row.estimated_commission || row.commission_amount || row.commission?.commissionValue)
  if (explicit) return explicit * probability

  if (dealType === 'sale') {
    const price = toNumber(row.listing_price || row.listingPrice || row.pricing || row.asking_price || row.deal_value || row.value || row.targetValue)
    return price * (commissionPercent(row, DEFAULT_SALE_COMMISSION_PERCENT) / 100) * probability
  }

  const rental = toNumber(row.asking_rental || row.rental || row.rental_per_sqm || row.deal_value || row.value)
  const area = toNumber(row.available_area_m2 || row.size_m2 || row.gla_m2 || row.area_m2) || 1
  const annualisedRental = toNumber(row.deal_value || row.value) || rental * area * 12
  return annualisedRental * (commissionPercent(row, DEFAULT_LEASE_COMMISSION_PERCENT) / 100) * probability
}

function withinHorizon(row = {}, days = 30) {
  const anchor = today()
  const end = addDays(anchor, days)
  const date = asDate(row.expected_close_date || row.expectedCloseDate || row.close_date || row.target_close_date || row.updated_at || row.created_at)
  return Boolean(date && date >= anchor && date <= end)
}

function buildFunnel(stages = []) {
  return stages.map((stage, index) => {
    const previous = stages[index - 1]
    return {
      ...stage,
      conversion_percentage: index === 0 ? 100 : percent(stage.count, previous?.count || 0),
    }
  })
}

function isSaleRecord(row = {}) {
  const type = normalizeKey(row.deal_type || row.dealType || row.transactionType || row.transaction_type || row.listing_type)
  if (type.includes('sale') || type.includes('purchase')) return true
  const role = inferCommercialLeadType(row)
  return role === 'seller' || role === 'buyer'
}

function isLeaseRecord(row = {}) {
  return !isSaleRecord(row)
}

function scoreActivity({ calls = 0, meetings = 0, leads = 0, viewings = 0, deals = 0 }) {
  return Math.min(100, Math.round((calls * 4) + (meetings * 8) + (leads * 5) + (viewings * 8) + (deals * 14)))
}

function buildForecastRows({ deals = [], listings = [], vacancies = [], leases = [], mode = 'leasing' } = {}) {
  return [30, 90, 180].map((days) => {
    const dealRows = deals.filter((deal) => inferCommercialDealType(deal) === (mode === 'sales' ? 'sale' : 'lease') && withinHorizon(deal, days))
    const inventoryRows = mode === 'sales' ? listings.filter((row) => withinHorizon(row, days)) : vacancies.filter((row) => withinHorizon(row, days))
    const revenueRows = [...dealRows, ...inventoryRows]
    return {
      window: `${days} Days`,
      expected_deals: dealRows.length,
      expected_revenue: Math.round(revenueRows.reduce((sum, row) => sum + estimateRevenue(row, mode === 'sales' ? 'sale' : 'lease'), 0)),
      expected_leases: mode === 'leasing' ? leases.filter((lease) => withinHorizon(lease, days)).length : 0,
      expected_listings: mode === 'sales' ? inventoryRows.length : 0,
      expected_offers: mode === 'sales' ? dealRows.filter((deal) => normalizeKey(deal.stage || deal.status).includes('offer')).length : 0,
    }
  })
}

function buildDemandSupplyRows({ assetClass, requirements = [], vacancies = [], listings = [], buyerRequirements = [] }) {
  const label = getCommercialAssetConfiguration(assetClass).label
  const leasingDemand = requirements.filter((row) => getAssetClass(row) === assetClass).length
  const leasingSupply = vacancies.filter((row) => getAssetClass(row) === assetClass).length
  const salesDemand = buyerRequirements.filter((row) => getAssetClass(row) === assetClass).length
  const salesSupply = listings.filter((row) => getAssetClass(row) === assetClass).length

  function result(demand, supply) {
    if (demand > supply * 1.15) return 'Demand Exceeds Supply'
    if (supply > demand * 1.15) return 'Oversupplied Market'
    return 'Balanced Market'
  }

  return {
    asset_class: assetClass,
    label,
    leasing: {
      demand: leasingDemand,
      supply: leasingSupply,
      result: result(leasingDemand, leasingSupply),
      gap_percentage: supplyGapPercent(leasingDemand, leasingSupply),
    },
    sales: {
      buyer_demand: salesDemand,
      seller_inventory: salesSupply,
      result: result(salesDemand, salesSupply),
      gap_percentage: supplyGapPercent(salesDemand, salesSupply),
    },
  }
}

function supplyGapPercent(demand, supply) {
  if (!supply && demand) return 100
  if (!demand && supply) return -100
  if (!supply) return 0
  return Math.round(((demand - supply) / supply) * 100)
}

function buildRiskAlerts({ leads = [], vacancies = [], listings = [], deals = [] } = {}) {
  const now = today()
  const alerts = []

  leads.forEach((lead) => {
    const age = daysBetween(recordDate(lead), now)
    if (age !== null && age > 30) {
      alerts.push({ id: `stale-lead-${lead.id || alerts.length}`, type: 'Stale Lead', priority: age > 60 ? 'High' : 'Medium', title: normalizeText(lead.companyName || lead.name || lead.displayName) || 'Commercial lead', detail: `No activity in ${age} days` })
    }
  })

  vacancies.forEach((vacancy) => {
    const age = daysBetween(vacancy.available_from || vacancy.marketed_at || vacancy.created_at, now)
    if (age !== null && age > 90) {
      alerts.push({ id: `stale-vacancy-${vacancy.id || alerts.length}`, type: 'Stale Vacancy', priority: age > 120 ? 'High' : 'Medium', title: normalizeText(vacancy.vacancy_name || vacancy.property_name) || 'Commercial vacancy', detail: `Available for ${age} days` })
    }
  })

  listings.forEach((listing) => {
    const age = daysBetween(listing.published_at || listing.created_at, now)
    if (age !== null && age > 120) {
      alerts.push({ id: `stale-listing-${listing.id || alerts.length}`, type: 'Stale Listing', priority: age > 180 ? 'High' : 'Medium', title: normalizeText(listing.title || listing.property_name) || 'Commercial listing', detail: `Active for ${age} days` })
    }
  })

  deals.forEach((deal) => {
    if (!isOpenDeal(deal)) return
    const age = daysBetween(recordDate(deal), now)
    if (age !== null && age > 14) {
      alerts.push({ id: `stalled-deal-${deal.id || alerts.length}`, type: 'Stalled Deal', priority: age > 30 ? 'High' : 'Medium', title: normalizeText(deal.deal_name || deal.title) || 'Commercial deal', detail: `No movement in ${age} days` })
    }
  })

  const priority = { High: 3, Medium: 2, Low: 1 }
  return alerts.sort((left, right) => (priority[right.priority] || 0) - (priority[left.priority] || 0)).slice(0, 12)
}

function buildBrokerRows({ brokers = [], prospects = [], leads = [], requirements = [], vacancies = [], listings = [], deals = [], viewings = [], activity = [], commissions = [] } = {}) {
  const brokerIds = new Set([
    ...brokers.map((broker) => normalizeText(broker.userId || broker.user_id || broker.id)),
    ...[prospects, leads, requirements, vacancies, listings, deals, viewings, activity, commissions].flat().map(getBrokerId),
  ].filter(Boolean))

  return Array.from(brokerIds).map((id) => {
    const broker = brokers.find((row) => [row.userId, row.user_id, row.id].map(normalizeText).includes(id)) || {}
    const brokerProspects = prospects.filter((row) => getBrokerId(row) === id)
    const brokerLeads = leads.filter((row) => getBrokerId(row) === id)
    const brokerRequirements = requirements.filter((row) => getBrokerId(row) === id)
    const brokerVacancies = vacancies.filter((row) => getBrokerId(row) === id)
    const brokerListings = listings.filter((row) => getBrokerId(row) === id)
    const brokerDeals = deals.filter((row) => getBrokerId(row) === id)
    const brokerViewings = viewings.filter((row) => getBrokerId(row) === id)
    const brokerActivity = activity.filter((row) => getBrokerId(row) === id || normalizeText(row.created_by) === id)
    const brokerCommissions = commissions.filter((row) => getBrokerId(row) === id)
    const closedDeals = brokerDeals.filter(isClosedThisMonth).length
    const revenue = brokerCommissions.reduce((sum, row) => sum + toNumber(row.commission_amount || row.commissionValue || row.commission_value), 0) ||
      brokerDeals.reduce((sum, row) => sum + estimateRevenue(row, inferCommercialDealType(row)), 0)
    const calls = brokerActivity.filter((row) => normalizeKey(row.activity_type || row.activityType).includes('call')).length
    const meetings = brokerActivity.filter((row) => normalizeKey(row.activity_type || row.activityType).includes('meeting')).length
    const dealsProgressed = brokerDeals.filter((row) => {
      const age = daysBetween(row.updated_at || row.updatedAt, today())
      return age !== null && age <= 30
    }).length
    const activityScore = scoreActivity({
      calls,
      meetings,
      leads: brokerLeads.length,
      viewings: brokerViewings.length,
      deals: dealsProgressed,
    })
    const workloadScore = brokerProspects.length + brokerLeads.length + brokerRequirements.length + brokerVacancies.length + brokerListings.length + (brokerDeals.length * 2)
    const workloadStatus = workloadScore >= 45 ? 'Overloaded' : workloadScore <= 8 ? 'Underutilized' : 'Balanced'

    return {
      id,
      broker: brokerName(broker),
      prospects_captured: brokerProspects.length,
      leads_converted: brokerLeads.length,
      listings_created: brokerListings.length,
      vacancies_created: brokerVacancies.length,
      deals_created: brokerDeals.length,
      deals_closed: closedDeals,
      revenue_generated: Math.round(revenue),
      conversion_rate: percent(brokerDeals.length, Math.max(1, brokerLeads.length)),
      activity_score: activityScore,
      workload: {
        prospects: brokerProspects.length,
        leads: brokerLeads.length,
        requirements: brokerRequirements.length,
        vacancies: brokerVacancies.length,
        listings: brokerListings.length,
        deals: brokerDeals.length,
        score: workloadScore,
        status: workloadStatus,
      },
    }
  }).sort((left, right) => right.revenue_generated - left.revenue_generated || right.activity_score - left.activity_score)
}

function groupPerformance(rows = [], keyFn, dealRows = [], revenueType = 'lease') {
  const keys = new Set(rows.map(keyFn).filter(Boolean))
  return Array.from(keys).map((key) => {
    const sourceRows = rows.filter((row) => keyFn(row) === key)
    const matchedDeals = dealRows.filter((deal) => keyFn(deal) === key)
    const revenue = matchedDeals.reduce((sum, deal) => sum + estimateRevenue(deal, revenueType === 'sale' ? 'sale' : inferCommercialDealType(deal)), 0)
    return {
      key,
      label: key,
      prospects: sourceRows.filter((row) => normalizeKey(row.entity_type || row.type).includes('prospect')).length || sourceRows.length,
      leads: sourceRows.filter((row) => normalizeKey(row.entity_type || row.type).includes('lead')).length,
      deals: matchedDeals.length,
      revenue: Math.round(revenue),
      conversion_percentage: percent(matchedDeals.length, sourceRows.length),
    }
  }).sort((left, right) => right.revenue - left.revenue || right.deals - left.deals).slice(0, 8)
}

function averageVelocity(label, rows = [], fromAccessor, toAccessor) {
  const values = rows.map((row) => daysBetween(fromAccessor(row), toAccessor(row))).filter((value) => Number.isFinite(value) && value >= 0)
  const days = values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0
  return { label, average_days: days, samples: values.length, bottleneck: days > 21 }
}

function relationshipSummary(label, sourceRows = [], relatedRows = [], dealRows = [], revenueType = 'lease') {
  return {
    label,
    active: countActive(sourceRows),
    related_records: relatedRows.length,
    deals: dealRows.length,
    revenue: Math.round(dealRows.reduce((sum, row) => sum + estimateRevenue(row, revenueType === 'sale' ? 'sale' : inferCommercialDealType(row)), 0)),
  }
}

export function buildCommercialCommandCentreSnapshot(data = {}, viewerScope = {}) {
  const prospects = data.prospects || data.canvassingProspects || []
  const companies = data.companies || []
  const landlords = data.landlords || []
  const tenants = data.tenants || []
  const requirements = data.requirements || []
  const vacancies = data.vacancies || []
  const listings = data.listings || []
  const deals = data.deals || []
  const leases = data.leases || []
  const viewings = data.viewings || []
  const activity = data.activity || []
  const commissions = data.commissions || []
  const brokers = data.brokers || []
  const transactions = data.commercialTransactions || data.transactions || []
  const sourceRows = [...prospects, ...companies, ...landlords, ...tenants]
  const leasingLeads = [...landlords, ...tenants, ...companies.filter(isLeaseRecord)]
  const salesLeads = companies.filter(isSaleRecord)
  const buyerRequirements = requirements.filter(isSaleRecord)
  const tenantRequirements = requirements.filter(isLeaseRecord)
  const leaseDeals = deals.filter((deal) => inferCommercialDealType(deal) === 'lease')
  const saleDeals = deals.filter((deal) => inferCommercialDealType(deal) === 'sale')
  const openLeaseDeals = leaseDeals.filter(isOpenDeal)
  const openSaleDeals = saleDeals.filter(isOpenDeal)
  const activeVacancies = vacancies.filter((row) => !['archived', 'withdrawn', 'occupied'].includes(normalizeKey(row.status)))
  const activeListings = listings.filter((row) => !['archived', 'withdrawn', 'expired', 'closed'].includes(normalizeKey(row.status || row.listing_status)))
  const closedLeasesThisMonth = leases.filter(isClosedThisMonth).length
  const closedSalesThisMonth = saleDeals.filter(isClosedThisMonth).length
  const leasingForecast = buildForecastRows({ deals, vacancies: activeVacancies, leases, mode: 'leasing' })
  const salesForecast = buildForecastRows({ deals, listings: activeListings, mode: 'sales' })
  const demandSupply = ASSET_CLASSES.map((assetClass) => buildDemandSupplyRows({ assetClass, requirements: tenantRequirements, vacancies: activeVacancies, listings: activeListings, buyerRequirements }))
  const assetClassDashboard = ASSET_CLASSES.map((assetClass) => {
    const assetRequirements = requirements.filter((row) => getAssetClass(row) === assetClass)
    const assetVacancies = activeVacancies.filter((row) => getAssetClass(row) === assetClass)
    const assetListings = activeListings.filter((row) => getAssetClass(row) === assetClass)
    const assetDeals = deals.filter((row) => getAssetClass(row) === assetClass)
    return {
      asset_class: assetClass,
      label: getCommercialAssetConfiguration(assetClass).label,
      prospects: prospects.filter((row) => getAssetClass(row) === assetClass).length,
      leads: [...leasingLeads, ...salesLeads].filter((row) => getAssetClass(row) === assetClass).length,
      listings_vacancies: assetListings.length + assetVacancies.length,
      requirements: assetRequirements.length,
      deals: assetDeals.length,
      revenue: Math.round(assetDeals.reduce((sum, row) => sum + estimateRevenue(row, inferCommercialDealType(row)), 0)),
    }
  })
  const brokerPerformance = buildBrokerRows({ brokers, prospects, leads: [...leasingLeads, ...salesLeads], requirements, vacancies: activeVacancies, listings: activeListings, deals, viewings, activity, commissions })
  const riskAlerts = buildRiskAlerts({ leads: [...leasingLeads, ...salesLeads], vacancies: activeVacancies, listings: activeListings, deals })
  const scopeLevel = normalizeKey(viewerScope.scopeLevel || viewerScope.visibilityLevel || viewerScope.role)
  const canViewExecutive = ['organisation', 'executive', 'principal', 'platform_admin', 'commercial_principal', 'national', 'regional'].includes(scopeLevel) || viewerScope.canManageBrokerage === true

  const snapshot = {
    generated_at: new Date().toISOString(),
    cached_snapshot_views: COMMAND_CENTRE_SNAPSHOT_VIEWS,
    permissions: {
      scope_level: scopeLevel || 'organisation',
      broker_visibility: scopeLevel === 'broker' ? 'Own Pipeline' : 'Scoped Pipeline',
      team_leader_visibility: ['team', 'branch'].includes(scopeLevel) ? 'Team Data' : 'Scoped Team Data',
      principal_visibility: canViewExecutive ? 'Agency Data' : 'Restricted',
      executive_visibility: canViewExecutive ? 'National / Regional / Agency' : 'Restricted',
      can_view_executive: canViewExecutive,
    },
    executiveSummary: {
      leasing: {
        active_landlords: countActive(landlords),
        active_tenants: countActive(tenants),
        active_vacancies: activeVacancies.length,
        active_requirements: tenantRequirements.length,
        open_deals: openLeaseDeals.length,
        leases_signed_this_month: closedLeasesThisMonth,
      },
      sales: {
        active_sellers: salesLeads.filter((row) => inferCommercialLeadType(row) === 'seller').length || activeListings.length,
        active_buyers: salesLeads.filter((row) => inferCommercialLeadType(row) === 'buyer').length || buyerRequirements.length,
        active_listings: activeListings.length,
        buyer_requirements: buyerRequirements.length,
        open_deals: openSaleDeals.length,
        sales_closed_this_month: closedSalesThisMonth,
      },
      revenueForecast: {
        leasing_expected_revenue: leasingForecast[1]?.expected_revenue || 0,
        sales_expected_revenue: salesForecast[1]?.expected_revenue || 0,
      },
    },
    revenueForecast: {
      leasing: {
        potential_commission_pipeline: Math.round([...openLeaseDeals, ...activeVacancies].reduce((sum, row) => sum + estimateRevenue(row, 'lease'), 0)),
        windows: leasingForecast,
      },
      sales: {
        potential_commission_pipeline: Math.round([...openSaleDeals, ...activeListings].reduce((sum, row) => sum + estimateRevenue(row, 'sale'), 0)),
        windows: salesForecast,
      },
    },
    pipelineHealth: {
      leasingFunnel: buildFunnel([
        { key: 'prospects', label: 'Prospects', count: prospects.filter(isLeaseRecord).length || sourceRows.filter(isLeaseRecord).length },
        { key: 'leads', label: 'Leads', count: leasingLeads.length },
        { key: 'requirements', label: 'Requirements', count: tenantRequirements.length },
        { key: 'matches', label: 'Matches', count: viewings.filter(isLeaseRecord).length },
        { key: 'deals', label: 'Deals', count: leaseDeals.length },
        { key: 'leases', label: 'Leases', count: leases.length },
      ]),
      salesFunnel: buildFunnel([
        { key: 'prospects', label: 'Prospects', count: prospects.filter(isSaleRecord).length || sourceRows.filter(isSaleRecord).length },
        { key: 'leads', label: 'Leads', count: salesLeads.length },
        { key: 'listings', label: 'Listings', count: activeListings.length },
        { key: 'viewings', label: 'Viewings', count: viewings.filter(isSaleRecord).length },
        { key: 'offers', label: 'Offers', count: saleDeals.filter((deal) => normalizeKey(deal.stage || deal.status).includes('offer')).length },
        { key: 'deals', label: 'Deals', count: saleDeals.length },
      ]),
    },
    demandSupply,
    assetClassDashboard,
    brokerPerformance: {
      leaderboard: brokerPerformance,
      workload: brokerPerformance.map((row) => ({ broker: row.broker, ...row.workload })),
    },
    dealVelocity: {
      leasing: [
        averageVelocity('Lead -> Requirement', tenantRequirements, (row) => row.created_from_date || row.created_at, (row) => row.created_at || row.updated_at),
        averageVelocity('Requirement -> Match', viewings.filter(isLeaseRecord), (row) => row.requirement_created_at || row.created_at, (row) => row.viewing_date || row.updated_at),
        averageVelocity('Match -> Deal', leaseDeals, (row) => row.matched_at || row.created_at, (row) => row.created_at || row.updated_at),
        averageVelocity('Deal -> Lease', leases, (row) => row.deal_created_at || row.created_at, (row) => row.lease_start_date || row.updated_at),
      ],
      sales: [
        averageVelocity('Lead -> Listing', activeListings, (row) => row.created_from_date || row.created_at, (row) => row.published_at || row.updated_at || row.created_at),
        averageVelocity('Listing -> Viewing', viewings.filter(isSaleRecord), (row) => row.listing_created_at || row.created_at, (row) => row.viewing_date || row.updated_at),
        averageVelocity('Viewing -> Offer', saleDeals.filter((deal) => normalizeKey(deal.stage || deal.status).includes('offer')), (row) => row.viewing_date || row.created_at, (row) => row.updated_at || row.created_at),
        averageVelocity('Offer -> Deal', saleDeals, (row) => row.offer_date || row.created_at, (row) => row.updated_at || row.created_at),
      ],
    },
    riskEngine: {
      alerts: riskAlerts,
      stale_leads: riskAlerts.filter((alert) => alert.type === 'Stale Lead').length,
      stale_vacancies: riskAlerts.filter((alert) => alert.type === 'Stale Vacancy').length,
      stale_listings: riskAlerts.filter((alert) => alert.type === 'Stale Listing').length,
      stalled_deals: riskAlerts.filter((alert) => alert.type === 'Stalled Deal').length,
    },
    sourcePerformance: groupPerformance(sourceRows, getSource, deals),
    areaIntelligence: groupPerformance([...requirements, ...activeVacancies, ...activeListings], getArea, deals),
    relationshipIntelligence: {
      landlords: relationshipSummary('Landlord Intelligence', landlords, activeVacancies, leaseDeals, 'lease'),
      tenants: relationshipSummary('Tenant Intelligence', tenants, tenantRequirements, leaseDeals, 'lease'),
      sellers: relationshipSummary('Seller Intelligence', salesLeads.filter((row) => inferCommercialLeadType(row) === 'seller'), activeListings, saleDeals, 'sale'),
      buyers: relationshipSummary('Buyer Intelligence', salesLeads.filter((row) => inferCommercialLeadType(row) === 'buyer'), buyerRequirements, saleDeals, 'sale'),
    },
    recommendations: [
      ...demandSupply
        .filter((row) => Math.abs(row.leasing.gap_percentage) >= 20 || Math.abs(row.sales.gap_percentage) >= 20)
        .slice(0, 4)
        .map((row) => `${row.label} ${Math.abs(row.leasing.gap_percentage) >= 20 ? row.leasing.result.toLowerCase() : row.sales.result.toLowerCase()}`),
      ...brokerPerformance
        .filter((row) => row.workload.status === 'Overloaded' || row.workload.status === 'Underutilized')
        .slice(0, 3)
        .map((row) => `${row.broker} is ${row.workload.status.toLowerCase()} with ${row.workload.leads} leads and ${row.workload.deals} deals`),
      ...riskAlerts.slice(0, 3).map((alert) => `${alert.type}: ${alert.title} requires attention`),
    ].slice(0, 8),
    executiveMode: canViewExecutive
      ? {
          agency_revenue: Math.round(commissions.reduce((sum, row) => sum + toNumber(row.commission_amount || row.commissionValue || row.commission_value), 0)),
          pipeline_value: Math.round(transactions.reduce((sum, row) => sum + toNumber(row.value || row.targetValue || row.deal_value), 0)),
          forecast_revenue: (leasingForecast[1]?.expected_revenue || 0) + (salesForecast[1]?.expected_revenue || 0),
          broker_rankings: brokerPerformance.slice(0, 5),
          asset_class_breakdown: assetClassDashboard,
          regional_breakdown: groupPerformance([...requirements, ...activeVacancies, ...activeListings], getArea, deals).slice(0, 5),
        }
      : null,
    mobileDashboard: {
      todays_activity: activity.filter((row) => {
        const date = asDate(row.created_at || row.createdAt)
        return date && date >= today()
      }).length,
      deals_requiring_attention: riskAlerts.filter((alert) => alert.type === 'Stalled Deal').length,
      broker_performance_snapshot: brokerPerformance.slice(0, 3),
      revenue_forecast: {
        leasing: leasingForecast[0]?.expected_revenue || 0,
        sales: salesForecast[0]?.expected_revenue || 0,
      },
    },
  }

  return {
    ...snapshot,
    snapshots: {
      commercial_pipeline_snapshot: snapshot.pipelineHealth,
      commercial_revenue_snapshot: snapshot.revenueForecast,
      commercial_broker_snapshot: snapshot.brokerPerformance,
      commercial_asset_snapshot: snapshot.assetClassDashboard,
      commercial_area_snapshot: snapshot.areaIntelligence,
    },
  }
}
