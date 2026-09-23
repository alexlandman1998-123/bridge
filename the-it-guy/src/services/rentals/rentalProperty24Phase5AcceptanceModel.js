export const RENTAL_PROPERTY24_PHASE5_ACCEPTANCE_VERSION = 'arch9_rental_property24_phase5_acceptance_v2'
export const RENTAL_PROPERTY24_PHASE5_MAXIMUM_EXDEV_LISTINGS = 3

function text(value = '') { return String(value ?? '').trim() }
function key(value = '') { return text(value).toLowerCase().replace(/[\s-]+/g, '_') }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0 }
function check(key, label, passed, detail) { return { key, label, passed: Boolean(passed), detail } }

function summarizeEvidence(evidence = {}) {
  const publish = evidence.publish || {}
  const rendered = evidence.rendered || {}
  const negative = evidence.negative || {}
  const reconciliation = evidence.reconciliation || {}
  const safety = evidence.safety || {}
  const optional = evidence.optional || {}
  return {
    environment: key(publish.environment),
    listingNumber: text(publish.listingNumber),
    submissionCount: number(safety.exdevListingCount || safety.submissionCount || publish.exdevListingCount),
    customerDataIncluded: safety.customerDataIncluded === true,
    rendered: {
      rentalAmount: rendered.rentalAmount === true || rendered.monthlyRent === true,
      rentalRate: rendered.rentalRate === true,
      depositPolicy: rendered.depositPolicy === true,
      occupationDate: rendered.occupationDate === true,
      contactAgent: rendered.contactAgent === true,
      photos: rendered.photos === true,
    },
    negative: {
      missingPhoto: negative.missingPhoto === true,
      invalidAgent: negative.invalidAgent === true,
      duplicateSubmit: negative.duplicateSubmit === true,
      unsupportedHouseShare: negative.unsupportedHouseShare === true,
    },
    reconciliation: {
      status: key(reconciliation.status),
      matchedCount: number(reconciliation.matchedCount),
    },
    optional: {
      retirementAccommodationNotMapped: optional.retirementAccommodationNotMapped === true,
    },
  }
}

// This evaluates recorded evidence only. It deliberately makes no portal call,
// database write, publication, or production-enablement change.
export function buildRentalProperty24Phase5Acceptance(evidence = {}) {
  const publish = evidence.publish || {}
  const summary = summarizeEvidence(evidence)
  const checks = [
    check('exdev_only', 'Controlled ExDev scope', summary.environment === 'exdev' && !summary.customerDataIncluded && summary.submissionCount > 0 && summary.submissionCount <= RENTAL_PROPERTY24_PHASE5_MAXIMUM_EXDEV_LISTINGS, `Use ExDev only, no customer data, and no more than ${RENTAL_PROPERTY24_PHASE5_MAXIMUM_EXDEV_LISTINGS} listings.`),
    check('exdev_publish', 'ExDev rental submitted', key(publish.status) === 'submitted' && Boolean(summary.listingNumber), 'Requires a returned Property24 listing number from an ExDev submission.'),
    check('field_rendering', 'Property24 rendered rental fields verified', Object.values(summary.rendered).every(Boolean), 'Verify rental amount, frequency, deposit policy, availability, agent, and photos on Property24.'),
    check('negative_guards', 'Invalid and duplicate submissions guarded', Object.values(summary.negative).every(Boolean), 'Record missing-photo, invalid-agent, duplicate-retry, and unsupported-house-share outcomes.'),
    check('reconciliation', 'Reconciliation matches rental', summary.reconciliation.status === 'ok' && summary.reconciliation.matchedCount > 0, 'Run reconciliation after the ExDev publish.'),
  ]
  const failedChecks = checks.filter((item) => !item.passed)
  return {
    version: RENTAL_PROPERTY24_PHASE5_ACCEPTANCE_VERSION,
    phase: 'controlled_exdev_acceptance',
    status: failedChecks.length === 0 ? 'ACCEPTED_FOR_PHASE6' : 'EVIDENCE_REQUIRED',
    checks,
    failedChecks,
    evidence: summary,
    optionalMappingNotes: summary.optional.retirementAccommodationNotMapped
      ? ['Retirement accommodation remains in Arch9 until a Property24 v55 field is confirmed.']
      : [],
    safety: {
      productionAllowed: false,
      maximumExDevListings: RENTAL_PROPERTY24_PHASE5_MAXIMUM_EXDEV_LISTINGS,
      customerDataAllowed: false,
      portalCallsMade: false,
      databaseWritten: false,
      listingPublished: false,
    },
  }
}
