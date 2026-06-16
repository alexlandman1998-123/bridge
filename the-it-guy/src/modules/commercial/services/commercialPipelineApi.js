import {
  getCommercialDeals,
  getCommercialListings,
  getCommercialRequirements,
  getCommercialTransactions,
  getCommercialViewings,
  resolveCommercialOrganisationContext,
} from './commercialApi'
import { getCommercialLifecycle, normalizeCommercialLifecycleStage } from '../commercialWorkflow'

const INACTIVE_STATUSES = new Set(['archived', 'inactive', 'closed_lost', 'expired', 'terminated', 'cancelled'])

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

function isActiveRecord(row = {}) {
  return !INACTIVE_STATUSES.has(normalizeLower(row?.status || row?.listing_status || 'active'))
}

function isActiveRequirement(row = {}) {
  const stage = normalizeCommercialLifecycleStage('requirements', row?.stage, 'new')
  return isActiveRecord(row) && !['won', 'lost', 'closed_won', 'closed_lost'].includes(stage)
}

function isActiveDeal(row = {}) {
  const stage = normalizeCommercialLifecycleStage('deals', row?.stage, 'new')
  return isActiveRecord(row) && !['lost', 'converted'].includes(stage)
}

function isActiveListing(row = {}) {
  const stage = normalizeCommercialLifecycleStage('listings', row?.listing_status || row?.status, 'draft')
  return isActiveRecord(row) && !['closed', 'withdrawn', 'expired', 'archived'].includes(stage)
}

function isActiveTransaction(row = {}) {
  return !['completed', 'lost', 'cancelled'].includes(normalizeLower(row?.status))
}

function isUpcomingViewing(row = {}) {
  const status = normalizeLower(row?.status)
  if (['completed', 'cancelled', 'no_show'].includes(status)) return false
  const dateText = normalizeText(row?.viewing_date)
  const timeText = normalizeText(row?.viewing_time || '09:00').slice(0, 5) || '09:00'
  const scheduledAt = new Date(`${dateText}T${timeText}`)
  return Boolean(dateText) && !Number.isNaN(scheduledAt.getTime()) && scheduledAt >= new Date()
}

function requirementPipelineValue(row = {}) {
  return Math.max(toNumber(row?.budget_max), toNumber(row?.budget_min))
}

function dealPipelineValue(row = {}) {
  return toNumber(row?.deal_value)
}

function listingPipelineValue(row = {}) {
  return toNumber(row?.pricing) || toNumber(row?.asking_sale_price) || toNumber(row?.asking_rental) || toNumber(row?.asking_rental_per_m2)
}

function transactionPipelineValue(row = {}) {
  return toNumber(row?.value || row?.target_value)
}

function buildStageBuckets(rows = [], kind, valueSelector = () => 0) {
  const lifecycle = getCommercialLifecycle(kind)
  const orderedBuckets = lifecycle.map(({ value, label }) => ({
    key: value,
    label,
    count: 0,
    value: 0,
  }))

  const bucketMap = new Map(orderedBuckets.map((bucket) => [bucket.key, bucket]))

  rows.forEach((row) => {
    const rawStage = row?.stage || row?.listing_status || row?.status
    const stage = normalizeCommercialLifecycleStage(kind, rawStage, lifecycle[0]?.value || 'new')
    const bucket = bucketMap.get(stage)
    if (!bucket) return
    bucket.count += 1
    bucket.value += valueSelector(row)
  })

  return orderedBuckets
}

export function buildCommercialPipelineData({
  organisationId = '',
  requirements = [],
  deals = [],
  listings = [],
  transactions = [],
  viewings = [],
} = {}) {
  const activeRequirements = requirements.filter(isActiveRequirement)
  const activeDeals = deals.filter(isActiveDeal)
  const activeListings = listings.filter(isActiveListing)
  const activeTransactions = transactions.filter(isActiveTransaction)
  const upcomingViewings = viewings.filter(isUpcomingViewing)
  const completedViewings = viewings.filter((row) => normalizeLower(row?.status) === 'completed')

  const pipelineValue = activeTransactions.reduce((sum, row) => sum + transactionPipelineValue(row), 0)
    || activeDeals.reduce((sum, row) => sum + dealPipelineValue(row), 0)

  return {
    organisationId,
    requirements: activeRequirements,
    deals: activeDeals,
    listings: activeListings,
    transactions: activeTransactions,
    viewings,
    summary: {
      pipelineValue,
      activeRequirements: activeRequirements.length,
      activeDeals: activeDeals.length,
      activeListings: activeListings.length,
      activeTransactions: activeTransactions.length,
      viewings: {
        upcoming: upcomingViewings.length,
        completed: completedViewings.length,
        total: viewings.length,
      },
    },
    financialSummary: {
      pipelineValue,
    },
    intelligence: {
      requirementsPipeline: buildStageBuckets(activeRequirements, 'requirements', requirementPipelineValue),
      dealsPipeline: buildStageBuckets(activeDeals, 'deals', dealPipelineValue),
      listingPipeline: buildStageBuckets(activeListings, 'listings', listingPipelineValue),
    },
  }
}

export async function getCommercialPipelineData(organisationId) {
  const resolvedOrganisationId = normalizeText(organisationId) || (await resolveCommercialOrganisationContext()).organisationId
  if (!resolvedOrganisationId) {
    return buildCommercialPipelineData()
  }

  const [requirements, deals, listings, transactions, viewings] = await Promise.all([
    getCommercialRequirements(resolvedOrganisationId),
    getCommercialDeals(resolvedOrganisationId),
    getCommercialListings(resolvedOrganisationId),
    getCommercialTransactions(resolvedOrganisationId),
    getCommercialViewings(resolvedOrganisationId),
  ])

  return buildCommercialPipelineData({
    organisationId: resolvedOrganisationId,
    requirements,
    deals,
    listings,
    transactions,
    viewings,
  })
}
