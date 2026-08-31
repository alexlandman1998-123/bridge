export const RENTAL_GOLDEN_PATH_VERSION = 'arch9_rental_golden_path_v1'

export const RENTAL_GOLDEN_PATH_STEPS = Object.freeze([
  { key: 'portfolio', title: 'Portfolio, property and unit', evidence: 'A managed unit is available in the pilot organisation.' },
  { key: 'vacancy', title: 'Vacancy and marketing', evidence: 'A vacancy follows the Rentals marketing lifecycle without external publishing.' },
  { key: 'application', title: 'Application and review', evidence: 'An applicant submission is screened and receives an explicit human decision.' },
  { key: 'tenancy', title: 'Lease and tenancy', evidence: 'An approved applicant becomes an active tenancy with a current lease.' },
  { key: 'operations', title: 'Charges, maintenance and inspections', evidence: 'Operational records remain linked to the tenancy and are auditable.' },
  { key: 'exit', title: 'Notice, move-out and closure', evidence: 'Move-out is completed and tenancy closure may create a new vacancy.' },
])

export function evaluateRentalGoldenPathAcceptance(evidence = {}) {
  const checks = RENTAL_GOLDEN_PATH_STEPS.map((step) => ({
    ...step,
    status: evidence[step.key] === true ? 'pass' : 'blocked',
  }))
  const blockers = checks.filter((check) => check.status === 'blocked').map((check) => check.key)
  return {
    version: RENTAL_GOLDEN_PATH_VERSION,
    status: blockers.length === 0 ? 'ready_for_pilot_review' : 'not_ready',
    checks,
    blockers,
    guardrail: 'This acceptance record never enables environment flags, sends external messages, or changes Sales.',
  }
}
