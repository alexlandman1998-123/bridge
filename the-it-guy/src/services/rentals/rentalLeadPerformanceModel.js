import { normaliseRentalLeadStage, resolveRentalLeadRole } from './rentalLeadPipelineModel.js'

export const RENTAL_LEAD_PERFORMANCE_VERSION = 'arch9_rental_lead_performance_v1'

const text = (value) => String(value ?? '').trim()
const sourceKey = (value) => text(value).toLowerCase() || 'manual'
const sourceLabel = (value) => sourceKey(value).replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase())
const percent = (numerator, denominator) => denominator ? Math.round((numerator / denominator) * 100) : 0

function isOutcome(lead = {}) {
  const role = resolveRentalLeadRole(lead.role || lead.rentalLeadRole)
  const stage = normaliseRentalLeadStage(lead.stage || lead.rentalStage, role)
  return role === 'landlord' ? stage === 'listing_ready' : stage === 'placement_ready'
}

export function buildRentalLeadPerformanceAnalytics(leads = []) {
  const visibleLeads = Array.isArray(leads) ? leads : []
  const groups = new Map()
  visibleLeads.forEach((lead) => {
    const key = sourceKey(lead.source)
    const current = groups.get(key) || { key, label: sourceLabel(lead.source), total: 0, landlords: 0, tenants: 0, listingReady: 0, placementReady: 0 }
    const role = resolveRentalLeadRole(lead.role || lead.rentalLeadRole)
    current.total += 1
    current[role === 'landlord' ? 'landlords' : 'tenants'] += 1
    if (isOutcome(lead)) current[role === 'landlord' ? 'listingReady' : 'placementReady'] += 1
    groups.set(key, current)
  })
  const sources = [...groups.values()]
    .map((row) => ({ ...row, outcomes: row.listingReady + row.placementReady, outcomeRate: percent(row.listingReady + row.placementReady, row.total) }))
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
  const landlords = visibleLeads.filter((lead) => resolveRentalLeadRole(lead.role || lead.rentalLeadRole) === 'landlord')
  const tenants = visibleLeads.filter((lead) => resolveRentalLeadRole(lead.role || lead.rentalLeadRole) === 'tenant')
  const listingReady = landlords.filter(isOutcome).length
  const placementReady = tenants.filter(isOutcome).length
  return {
    version: RENTAL_LEAD_PERFORMANCE_VERSION,
    total: visibleLeads.length,
    sources,
    outcomes: {
      listingReady,
      placementReady,
      total: listingReady + placementReady,
      rate: percent(listingReady + placementReady, visibleLeads.length),
      landlordRate: percent(listingReady, landlords.length),
      tenantRate: percent(placementReady, tenants.length),
    },
  }
}
