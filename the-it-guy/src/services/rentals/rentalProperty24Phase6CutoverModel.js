export const RENTAL_PROPERTY24_PHASE6_CUTOVER_VERSION = 'arch9_rental_property24_phase6_cutover_v1'

function check(key, label, passed, detail) { return { key, label, passed: Boolean(passed), detail } }

export function buildRentalProperty24Phase6CutoverGate(input = {}) {
  const production = input.production || {}
  const pilot = input.pilot || {}
  const checks = [
    check('separate_production_credentials', 'Separate production credentials configured', production.credentialsReady === true && production.environment === 'production', 'Production credentials must be separate from ExDev.'),
    check('agency_allowlist', 'Single agency allowlisted', Array.isArray(production.agencyAllowlist) && production.agencyAllowlist.length === 1, 'Start with exactly one approved agency.'),
    check('explicit_activation', 'Rental production activation explicitly approved', production.rentalLivePublishEnabled === true, 'PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED must be explicitly enabled only for the pilot.'),
    check('first_publish', 'First production rental published and reconciled', pilot.status === 'SUBMITTED' && Boolean(pilot.listingNumber) && pilot.portalVisible === true && pilot.reconciliationStatus === 'OK', 'Verify the first listing, portal visibility, and reconciliation.'),
    check('lead_monitoring', 'Lead and failure monitoring verified', pilot.leadRoutingVerified === true && pilot.failureMonitoringVerified === true, 'Confirm lead routing and failed-sync alerting before expanding.'),
  ]
  return {
    version: RENTAL_PROPERTY24_PHASE6_CUTOVER_VERSION,
    phase: 'production_cutover',
    status: checks.every((item) => item.passed) ? 'PILOT_COMPLETE_EXPANSION_REQUIRES_APPROVAL' : 'PRODUCTION_CUTOVER_BLOCKED',
    checks,
    safety: { maximumPilotAgencies: 1, maximumInitialListings: 1, bulkPublishAllowed: false, expansionRequiresExplicitApproval: true },
  }
}
