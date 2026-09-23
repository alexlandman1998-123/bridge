import { normalizeProperty24Text } from './client.js'

export const PROPERTY24_RENTAL_PRODUCTION_PILOT_POLICY_VERSION = 'arch9_property24_rental_production_pilot_policy_v1'

function text(value = '') {
  return normalizeProperty24Text(value)
}

function list(value = []) {
  const values = Array.isArray(value) ? value : String(value || '').split(',')
  return [...new Set(values.map(text).filter(Boolean))]
}

// This is deliberately evaluated only for rental publication in production.
// It does not enable a configuration flag or publish anything by itself.
export function evaluateProperty24RentalProductionPilotPolicy(config = {}) {
  const environment = text(config.environment).toLowerCase()
  if (environment !== 'production') {
    return {
      version: PROPERTY24_RENTAL_PRODUCTION_PILOT_POLICY_VERSION,
      enforced: false,
      allowed: true,
      blockers: [],
    }
  }

  const agencyAllowlist = list(config.rentalProductionAgencyAllowlist)
  const agencyId = text(config.agencyId)
  const listingId = text(config.listingId)
  const pilotListingId = text(config.rentalProductionPilotListingId)
  const approvalId = text(config.rentalProductionApprovalId)
  const blockers = []
  if (config.rentalLivePublishEnabled !== true) blockers.push('property24_rental_live_publish_not_enabled')
  if (!approvalId) blockers.push('property24_rental_production_approval_required')
  if (agencyAllowlist.length !== 1) blockers.push('property24_rental_single_agency_allowlist_required')
  if (agencyAllowlist.length === 1 && agencyAllowlist[0] !== agencyId) blockers.push('property24_rental_agency_not_allowlisted_for_pilot')
  if (!pilotListingId) blockers.push('property24_rental_pilot_listing_required')
  if (pilotListingId && pilotListingId !== listingId) blockers.push('property24_rental_listing_not_selected_for_pilot')

  return {
    version: PROPERTY24_RENTAL_PRODUCTION_PILOT_POLICY_VERSION,
    enforced: true,
    allowed: blockers.length === 0,
    blockers,
    approvalId: approvalId || null,
    agencyAllowlist,
    pilotListingId: pilotListingId || null,
  }
}
