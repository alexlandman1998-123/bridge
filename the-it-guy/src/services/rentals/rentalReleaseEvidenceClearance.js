import { assessRentalProductionBaselineAuthority } from './rentalProductionBaselineAuthority.js'
import { assessRentalStagingRecoveryAuthority } from './rentalStagingRecoveryAuthority.js'

export function assessRentalReleaseEvidenceClearance(evidence = {}) {
  const staging = assessRentalStagingRecoveryAuthority(evidence)
  const production = assessRentalProductionBaselineAuthority(evidence)
  const checks = [
    { code: 'STAGING_RECOVERY_AUTHORITY_CLEARED', pass: staging.ready },
    { code: 'PRODUCTION_BASELINE_AUTHORITY_CLEARED', pass: production.ready },
  ]

  return {
    version: 'arch9_rental_release_evidence_clearance_phase3_v1',
    status: checks.every((check) => check.pass)
      ? 'RELEASE_EVIDENCE_CLEARED_FOR_AUTHORING_ONLY'
      : 'BLOCKED_PENDING_RELEASE_EVIDENCE',
    ready: checks.every((check) => check.pass),
    checks,
    stagingChecks: staging.checks,
    productionChecks: production.checks,
    authoringAllowed: checks.every((check) => check.pass),
    applyAllowed: false,
    nextAction: checks.every((check) => check.pass)
      ? 'The evidence chain is complete for managed migration authoring only. Database application remains a later, separately approved phase.'
      : 'Clear both Phase 1 staging recovery authority and Phase 2 production baseline authority.',
  }
}
