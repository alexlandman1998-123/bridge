export const RENTAL_PROPERTY24_PHASE5_ACCEPTANCE_VERSION = 'arch9_rental_property24_phase5_acceptance_v1'

function check(key, label, passed, detail) { return { key, label, passed: Boolean(passed), detail } }

export function buildRentalProperty24Phase5Acceptance(evidence = {}) {
  const publish = evidence.publish || {}
  const reconciliation = evidence.reconciliation || {}
  const rendered = evidence.rendered || {}
  const negative = evidence.negative || {}
  const checks = [
    check('exdev_publish', 'ExDev rental submitted', publish.status === 'SUBMITTED' && Boolean(publish.listingNumber), 'Requires a returned Property24 listing number.'),
    check('field_rendering', 'Property24 rendered rental fields verified', rendered.monthlyRent === true && rendered.occupationDate === true && rendered.contactAgent === true && rendered.photos === true, 'Verify rent, availability, agent, and photos on Property24.'),
    check('negative_guards', 'Invalid and duplicate submissions guarded', negative.missingPhoto === true && negative.invalidAgent === true && negative.duplicateSubmit === true, 'Record the missing-photo, invalid-agent, and retry outcomes.'),
    check('reconciliation', 'Reconciliation matches rental', reconciliation.status === 'OK' && reconciliation.matchedCount > 0, 'Run reconciliation after the ExDev publish.'),
  ]
  return {
    version: RENTAL_PROPERTY24_PHASE5_ACCEPTANCE_VERSION,
    phase: 'controlled_exdev_acceptance',
    status: checks.every((item) => item.passed) ? 'ACCEPTED_FOR_PHASE6' : 'EVIDENCE_REQUIRED',
    checks,
    safety: { productionAllowed: false, maximumExDevListings: 3, customerDataAllowed: false },
  }
}
