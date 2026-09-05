import { RENTAL_FOUNDATION_MIGRATION_SOURCES } from './rentalFoundationMigrationPlan.js'
import { assessRentalRecoveryEvidence } from './rentalRecoveryEvidence.js'

const SHA256 = /^sha256:[a-f0-9]{64}$/i

function text(value) {
  return String(value ?? '').trim()
}

export function assessRentalFoundationSourceLock({ evidence = {}, sourceEntries = [], chainSha256 = '' } = {}) {
  const entries = Array.isArray(sourceEntries) ? sourceEntries : []
  const sourceOrderMatches = entries.length === RENTAL_FOUNDATION_MIGRATION_SOURCES.length
    && entries.every((entry, index) => entry?.path === RENTAL_FOUNDATION_MIGRATION_SOURCES[index])
  const sourceDigestsValid = sourceOrderMatches && entries.every((entry) => SHA256.test(text(entry?.sha256)))
  const evidenceAssessment = assessRentalRecoveryEvidence(evidence)
  const sourceLocked = sourceDigestsValid && SHA256.test(text(chainSha256))

  return {
    version: 'arch9_rental_foundation_source_lock_phase5_v1',
    status: evidenceAssessment.ready && sourceLocked
      ? 'READY_FOR_REVIEWED_MANAGED_MIGRATION_AUTHORING_ONLY'
      : 'BLOCKED_PENDING_EVIDENCE_OR_SOURCE_LOCK',
    sourceOrderMatches,
    sourceDigestsValid,
    chainDigestValid: SHA256.test(text(chainSha256)),
    chainSha256: text(chainSha256) || null,
    evidenceChecks: evidenceAssessment.checks,
    authoringAllowed: evidenceAssessment.ready && sourceLocked,
    applyAllowed: false,
    nextAction: evidenceAssessment.ready && sourceLocked
      ? 'Use this exact source lock for peer-reviewed managed migration authoring; a later authorised phase controls database application.'
      : 'Resolve recovery evidence or source-digest/order drift before managed migration authoring.',
  }
}
