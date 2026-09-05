import { RENTAL_FOUNDATION_MIGRATION_SOURCES } from './rentalFoundationMigrationPlan.js'

const SHA256 = /^sha256:[a-f0-9]{64}$/i

function text(value) {
  return String(value ?? '').trim()
}

function timestamp(value) {
  return Boolean(text(value)) && !Number.isNaN(Date.parse(value))
}

export function assessRentalReleaseSourceBaselineLock({ evidenceClearance = {}, securityReview = {}, sourceEntries = [], chainSha256 = '', approval = {} } = {}) {
  const entries = Array.isArray(sourceEntries) ? sourceEntries : []
  const sourceOrderMatches = entries.length === RENTAL_FOUNDATION_MIGRATION_SOURCES.length
    && entries.every((entry, index) => entry?.path === RENTAL_FOUNDATION_MIGRATION_SOURCES[index] && SHA256.test(text(entry?.sha256)))
  const chainValid = SHA256.test(text(chainSha256))
  const approvalValid = approval?.approved === true
    && text(approval?.approvalReference)
    && timestamp(approval?.approvedAt)
    && approval?.chainSha256 === chainSha256
  const checks = [
    { code: 'RELEASE_EVIDENCE_CLEARED', pass: evidenceClearance.ready === true },
    { code: 'SECURITY_EXCEPTIONS_APPROVED', pass: securityReview.ready === true },
    { code: 'SOURCE_CHAIN_LOCKED', pass: sourceOrderMatches && chainValid },
    { code: 'PEER_REVIEW_BINDS_EXACT_CHAIN', pass: approvalValid },
  ]

  return {
    version: 'arch9_rental_release_source_baseline_lock_phase5_v1',
    status: checks.every((check) => check.pass) ? 'SOURCE_BASELINE_LOCKED_FOR_MIGRATION_AUTHORING' : 'BLOCKED_PENDING_SOURCE_BASELINE_LOCK',
    ready: checks.every((check) => check.pass),
    checks,
    chainSha256: chainValid ? chainSha256 : null,
    authoringAllowed: checks.every((check) => check.pass),
    applyAllowed: false,
    nextAction: checks.every((check) => check.pass)
      ? 'Create managed migration scaffolds from this exact chain only; database application remains a later phase.'
      : 'Clear evidence/security review and bind a peer approval to the exact source-chain digest.',
  }
}
