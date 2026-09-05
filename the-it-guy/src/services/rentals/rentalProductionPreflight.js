import { RENTAL_RECOVERY_ENVIRONMENTS } from './rentalRecoveryEvidence.js'

function text(value) {
  return String(value ?? '').trim()
}

function timestamp(value) {
  return Boolean(text(value)) && !Number.isNaN(Date.parse(value))
}

export function assessRentalProductionPreflight({ stagingCertification = {}, sourceBaseline = {}, candidate = {}, headCommit = '', workingTreeClean = false } = {}) {
  const candidateBound = candidate.approved === true
    && text(candidate.approvalReference)
    && timestamp(candidate.approvedAt)
    && candidate.releaseCommit === headCommit
    && candidate.sourceChainSha256 === sourceBaseline.chainSha256
    && candidate.productionProjectRef === RENTAL_RECOVERY_ENVIRONMENTS.production
    && text(candidate.rollbackReference)
    && candidate.deploymentFrozen === true
  const checks = [
    { code: 'STAGING_CERTIFICATION_COMPLETE', pass: stagingCertification.ready === true },
    { code: 'SOURCE_BASELINE_LOCKED', pass: sourceBaseline.ready === true },
    { code: 'IMMUTABLE_RELEASE_CANDIDATE_BOUND', pass: candidateBound },
    { code: 'RELEASE_WORKTREE_CLEAN', pass: workingTreeClean === true },
  ]
  return {
    version: 'arch9_rental_production_preflight_phase10_v1',
    status: checks.every((check) => check.pass) ? 'READY_FOR_SEPARATE_PRODUCTION_RELEASE_DECISION' : 'BLOCKED_PENDING_PRODUCTION_PREFLIGHT',
    ready: checks.every((check) => check.pass),
    checks,
    target: RENTAL_RECOVERY_ENVIRONMENTS.production,
    applyAllowed: false,
    nextAction: checks.every((check) => check.pass)
      ? 'Production preflight is complete. A separate explicit production release decision is required.'
      : 'Certify staging, bind an approved immutable release candidate with rollback, and run from a clean worktree.',
  }
}
