import { RENTAL_RECOVERY_ENVIRONMENTS } from './rentalRecoveryEvidence.js'

const REQUIRED_OPERATIONS = Object.freeze([
  'database_migrations',
  'application_deployment',
  'post_release_smoke_checks',
])

function text(value) {
  return String(value ?? '').trim()
}

function timestamp(value) {
  return Boolean(text(value)) && !Number.isNaN(Date.parse(value))
}

function hasExactOperations(operations) {
  const values = Array.isArray(operations) ? operations : []
  return values.length === REQUIRED_OPERATIONS.length && REQUIRED_OPERATIONS.every((operation) => values.includes(operation))
}

export function assessRentalProductionReleaseAuthority({ preflightReceipt = {}, authority = {} } = {}) {
  const preflightValid = preflightReceipt.confirmed === true
    && text(preflightReceipt.reference)
    && timestamp(preflightReceipt.recordedAt)
    && text(preflightReceipt.releaseCommit)
    && text(preflightReceipt.sourceChainSha256)
    && preflightReceipt.productionProjectRef === RENTAL_RECOVERY_ENVIRONMENTS.production
  const authorityBound = authority.approved === true
    && text(authority.approvalReference)
    && timestamp(authority.approvedAt)
    && authority.releaseCommit === preflightReceipt.releaseCommit
    && authority.sourceChainSha256 === preflightReceipt.sourceChainSha256
    && authority.productionProjectRef === RENTAL_RECOVERY_ENVIRONMENTS.production
    && text(authority.rollbackReference)
    && hasExactOperations(authority.operations)
  const checks = [
    { code: 'PRODUCTION_PREFLIGHT_RECEIPT_CONFIRMED', pass: preflightValid },
    { code: 'PRODUCTION_RELEASE_AUTHORITY_BOUND', pass: authorityBound },
  ]
  return {
    version: 'arch9_rental_production_release_authority_phase11_v1',
    status: checks.every((check) => check.pass) ? 'READY_FOR_SEPARATE_OPERATOR_CONTROLLED_RELEASE' : 'BLOCKED_PENDING_PRODUCTION_RELEASE_AUTHORITY',
    ready: checks.every((check) => check.pass),
    checks,
    requiredOperations: REQUIRED_OPERATIONS,
    applyAllowed: false,
    nextAction: checks.every((check) => check.pass)
      ? 'Hand the exact bound release record to the separately approved production operator; this repository gate performs no live mutation.'
      : 'Record the passing Phase 10 preflight receipt and bind a named approval to the exact commit, chain, target, rollback, and operation set.',
  }
}
