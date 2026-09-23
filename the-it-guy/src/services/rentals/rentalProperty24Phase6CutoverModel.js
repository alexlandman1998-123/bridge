export const RENTAL_PROPERTY24_PHASE6_CUTOVER_VERSION = 'arch9_rental_property24_phase6_cutover_v2'

function check(key, label, passed, detail) { return { key, label, passed: Boolean(passed), detail } }

export function buildRentalProperty24Phase6CutoverGate(input = {}) {
  const production = input.production || {}
  const pilot = input.pilot || {}
  const phase5 = input.phase5 || {}
  const agencyAllowlist = Array.isArray(production.agencyAllowlist) ? production.agencyAllowlist.filter(Boolean) : []
  const requestedListingId = String(production.requestedListingId || pilot.listingId || '').trim()
  const pilotListingId = String(production.pilotListingId || '').trim()
  const approvalId = String(production.approvalId || '').trim()
  const phase5Accepted = phase5.status === 'ACCEPTED_FOR_PHASE6'
  const pilotSubmitted = pilot.status === 'SUBMITTED' && Boolean(pilot.listingNumber)
  const checks = [
    check('phase5_acceptance', 'Phase 5 ExDev acceptance completed', phase5Accepted, 'Production is unavailable until controlled ExDev acceptance is complete.'),
    check('separate_production_credentials', 'Separate production credentials configured', production.credentialsReady === true && production.environment === 'production' && production.productionAccessAuditStatus === 'READY', 'Production credentials must be separate from ExDev and pass the read-only access audit.'),
    check('agency_allowlist', 'Single agency allowlisted', agencyAllowlist.length === 1 && agencyAllowlist[0] === String(production.agencyId || '').trim(), 'Start with exactly one approved agency.'),
    check('explicit_approval', 'Pilot approval recorded', Boolean(approvalId), 'Record a specific production pilot approval before enabling rental publishing.'),
    check('single_pilot_listing', 'Single pilot listing selected', Boolean(pilotListingId) && pilotListingId === requestedListingId, 'Production publishing is limited to the one approved pilot listing.'),
    check('explicit_activation', 'Rental production activation explicitly approved', production.rentalLivePublishEnabled === true, 'PROPERTY24_RENTAL_LIVE_PUBLISH_ENABLED must be explicitly enabled only for the pilot.'),
    check('first_publish', 'First production rental published and reconciled', pilotSubmitted && pilot.portalVisible === true && pilot.reconciliationStatus === 'OK', 'Verify the first listing, portal visibility, and reconciliation.'),
    check('lead_monitoring', 'Lead and failure monitoring verified', pilot.leadRoutingVerified === true && pilot.failureMonitoringVerified === true, 'Confirm lead routing and failed-sync alerting before expanding.'),
  ]
  const failedChecks = checks.filter((item) => !item.passed)
  const prePilotChecks = checks.filter((item) => !['first_publish', 'lead_monitoring'].includes(item.key))
  const readyForPilot = prePilotChecks.every((item) => item.passed)
  return {
    version: RENTAL_PROPERTY24_PHASE6_CUTOVER_VERSION,
    phase: 'production_cutover',
    status: checks.every((item) => item.passed)
      ? 'PILOT_COMPLETE_EXPANSION_REQUIRES_APPROVAL'
      : readyForPilot
        ? 'READY_FOR_SINGLE_APPROVED_PILOT'
        : 'PRODUCTION_CUTOVER_BLOCKED',
    checks,
    failedChecks,
    pilot: {
      approvalId: approvalId || null,
      agencyId: String(production.agencyId || '').trim() || null,
      pilotListingId: pilotListingId || null,
      requestedListingId: requestedListingId || null,
    },
    safety: {
      maximumPilotAgencies: 1,
      maximumInitialListings: 1,
      bulkPublishAllowed: false,
      expansionRequiresExplicitApproval: true,
      productionActivatedByThisCheck: false,
      portalCallsMade: false,
      databaseWritten: false,
    },
  }
}
