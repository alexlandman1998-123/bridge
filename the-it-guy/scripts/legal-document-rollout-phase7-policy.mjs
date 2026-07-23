import {
  ROLLOUT_PHASE6_CONTRACT,
  assessLegalDocumentRolloutPhase6,
} from './legal-document-rollout-phase6-policy.mjs'
import {
  ROLLOUT_PHASE7_PHASE6_MIGRATION_ID,
  ROLLOUT_PHASE7_STATIC_BOUNDARY_CONTRACT,
} from './legal-document-rollout-phase7-static-boundary.mjs'
import {
  sha256Digest,
  stableJson,
  stableValue,
} from './legal-document-rollout-phase1-artifacts.mjs'

export const ROLLOUT_PHASE7_CONTRACT = 'legal-document-successor-implementation-boundary-v1'
export const ROLLOUT_PHASE7_MAX_REVIEW_AGE_DAYS = 30
export const ROLLOUT_PHASE7_MAX_REVIEW_AGE_MS = ROLLOUT_PHASE7_MAX_REVIEW_AGE_DAYS * 24 * 60 * 60 * 1000

// Phase 7 seals only a local, non-executable change boundary. It is not a
// successor-release approval, implementation, or activation mechanism.
export const ROLLOUT_PHASE7_DOES_NOT_AUTHORIZE = Object.freeze([
  'cohort_expansion_or_scale',
  'a_second_organisation_or_candidate_assignment',
  'phase6_epoch_preparation_or_membership_registration',
  'runtime_guard_or_secret_change',
  'template_or_source_change',
  'deployment_or_production_activation',
  'customer_document_generation_or_email_delivery',
  'rollback_execution',
])

export const ROLLOUT_PHASE7_DOES_NOT_VERIFY = Object.freeze([
  'whether_the_unapplied_phase6_migration_exists_in_a_live_database',
  'future_runtime_or_provider_drift',
  'future_customer_lifecycles',
  'the_contents_of_private_review_material',
  'a_future_successor_release_implementation',
])

const RECEIPT_KEYS = Object.freeze([
  'boundary', 'changeSurface', 'cohort', 'contract', 'environment', 'evidence', 'manifestDigest', 'migrationReference', 'phase', 'safety', 'source', 'status', 'version',
])
const ENVIRONMENT_KEYS = Object.freeze([
  'productionOrigin', 'productionProjectRef', 'productionUrl',
])
const SOURCE_KEYS = Object.freeze([
  'activationPlanDigest', 'boundaryPlanDigest', 'commitSha', 'implementationCommitDiffDigest', 'implementationCommitSha', 'implementationSourceTreeDigest', 'packageLockSha256', 'phase4ReceiptCommitSha', 'phase4ReceiptManifestDigest', 'phase5ObservationPlanDigest', 'phase5ReceiptCommitSha', 'phase5ReceiptManifestDigest', 'phase6EvidencePacketDigest', 'phase6ProposalPlanDigest', 'phase6ReceiptCommitSha', 'phase6ReceiptManifestDigest',
])
const COHORT_KEYS = Object.freeze([
  'cohortDigest', 'maxOrganisations', 'organisationIds', 'requiredPacketTypes',
])
const BOUNDARY_KEYS = Object.freeze([
  'authority', 'kind', 'requestedAction',
])
const CHANGE_SURFACE_KEYS = Object.freeze([
  'customerEgress', 'deployment', 'membership', 'phase6Migration', 'releaseEpoch', 'runtime', 'templates',
])
const MIGRATION_REFERENCE_KEYS = Object.freeze([
  'migrationId', 'migrationInvariantDigest', 'migrationSourceDigest', 'state',
])
const SAFETY_KEYS = Object.freeze([
  'noActivationAuthorization', 'noCustomerDocumentAuthorization', 'noCustomerEmailAuthorization', 'noDeploymentAuthorization', 'noEpochPreparationAuthorization', 'noMembershipRegistrationAuthorization', 'noRollbackAuthorization', 'noRuntimeChangeAuthorization', 'noScaleAuthorization', 'noSecondOrganisationAuthorization',
])
const EVIDENCE_KEYS = Object.freeze([
  'architectureReviewActorReference', 'architectureReviewEvidenceDigest', 'architectureReviewReviewedAt', 'boundaryRecordedAt', 'boundaryRecordedByReference', 'changeReference', 'evidencePacketDigest', 'nonActivationReviewActorReference', 'nonActivationReviewEvidenceDigest', 'nonActivationReviewReviewedAt', 'preparedAt', 'preparedByReference', 'reviewedByReference', 'securityReviewActorReference', 'securityReviewEvidenceDigest', 'securityReviewReviewedAt',
])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right)
}

function exactKeys(value, fields) {
  return sameJson(Object.keys(record(value)).sort(), [...fields].sort())
}

function validDigest(value) {
  return /^sha256:[0-9a-f]{64}$/.test(text(value))
}

function validCommit(value) {
  return /^[0-9a-f]{40}$/i.test(text(value))
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
}

function validProjectRef(value) {
  return /^[a-z0-9]{8,64}$/.test(text(value))
}

function validOpaqueReference(value) {
  return /^[a-z][a-z0-9]{2,31}(?:_[a-z0-9]{2,31}){1,3}$/.test(text(value))
}

function validChangeReference(value) {
  return /^(?:[A-Z]{2,16}-[0-9]{1,16}|change_[a-z0-9]{3,64})$/.test(text(value))
}

function timeMs(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : NaN
}

function validIsoTime(value, nowMs) {
  const parsed = timeMs(value)
  return Number.isFinite(parsed) && parsed <= nowMs + 5 * 60_000
}

function validHttpsOrigin(value) {
  const candidate = text(value)
  try {
    const parsed = new URL(candidate)
    return candidate === parsed.origin && parsed.protocol === 'https:' && !parsed.username && !parsed.password
  } catch {
    return false
  }
}

function expectedOrigin(projectRef) {
  return `https://${text(projectRef)}.supabase.co`
}

function normalizedIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].sort()
}

function cohortDigest(ids) {
  return sha256Digest(normalizedIds(ids).join(','))
}

function add(blockers, code, detail, pending = false) {
  blockers.push(pending ? { code, detail, pending: true } : { code, detail })
}

function planEvidenceProjection(evidence) {
  const candidate = record(evidence)
  return {
    preparedByReference: candidate.preparedByReference ?? null,
    preparedAt: candidate.preparedAt ?? null,
    changeReference: candidate.changeReference ?? null,
  }
}

function evidencePacketProjection(receipt) {
  const candidate = record(receipt)
  const evidence = record(candidate.evidence)
  return {
    boundaryPlanDigest: candidate.source?.boundaryPlanDigest ?? null,
    architectureReview: {
      evidenceDigest: evidence.architectureReviewEvidenceDigest ?? null,
      reviewedAt: evidence.architectureReviewReviewedAt ?? null,
      actorReference: evidence.architectureReviewActorReference ?? null,
    },
    securityReview: {
      evidenceDigest: evidence.securityReviewEvidenceDigest ?? null,
      reviewedAt: evidence.securityReviewReviewedAt ?? null,
      actorReference: evidence.securityReviewActorReference ?? null,
    },
    nonActivationReview: {
      evidenceDigest: evidence.nonActivationReviewEvidenceDigest ?? null,
      reviewedAt: evidence.nonActivationReviewReviewedAt ?? null,
      actorReference: evidence.nonActivationReviewActorReference ?? null,
    },
    boundaryRecordedAt: evidence.boundaryRecordedAt ?? null,
    boundaryRecordedByReference: evidence.boundaryRecordedByReference ?? null,
    reviewedByReference: evidence.reviewedByReference ?? null,
  }
}

// Seals the immutable P6 parent, current one-organisation scope, source-only
// migration reference, no-op boundary, and preparation accountability.
export function rolloutPhase7BoundaryPlanDigest(receipt) {
  const candidate = record(receipt)
  const source = { ...record(candidate.source) }
  delete source.boundaryPlanDigest
  return sha256Digest(stableJson({
    version: candidate.version,
    phase: candidate.phase,
    contract: candidate.contract,
    environment: candidate.environment,
    source,
    cohort: candidate.cohort,
    boundary: candidate.boundary,
    changeSurface: candidate.changeSurface,
    migrationReference: candidate.migrationReference,
    safety: candidate.safety,
    evidence: planEvidenceProjection(candidate.evidence),
  }))
}

export function rolloutPhase7EvidencePacketDigest(receipt) {
  return sha256Digest(stableJson(evidencePacketProjection(receipt)))
}

export function rolloutPhase7ManifestDigest(receipt) {
  const canonical = { ...record(receipt) }
  delete canonical.manifestDigest
  return sha256Digest(stableJson(canonical))
}

function validCommittedPhase6History(history, nowMs) {
  const item = record(history)
  const receipt = record(item.receipt)
  const phase5History = record(item.phase5History)
  const phase6Report = assessLegalDocumentRolloutPhase6({ receipt, phase5History, now: nowMs })
  return item.receiptOnlyCommit === true && item.parentPlaceholderValid === true && item.receiptManifestDigestValid === true &&
    item.directParentMatchesDeclaredPhase5 === true && item.parentPhase5BlobSchemaValid === true &&
    item.parentPhase5BlobManifestValid === true && item.parentPhase5PackageLockValid === true && item.phase6PackageLockValid === true &&
    item.receiptStatus === 'successor_proposal_recorded' && item.receiptPhase === 'ROLL_OUT_6' &&
    item.receiptContract === ROLLOUT_PHASE6_CONTRACT && item.phase6AssessmentStatus === 'SUCCESSOR_PROPOSAL_RECORDED' &&
    item.phase6AssessmentBlockerCount === 0 && item.parentPhase5TerminalContinuityValid === true &&
    validCommit(item.receiptCommitSha) && validDigest(item.receiptManifestDigest) &&
    phase6Report.status === 'SUCCESSOR_PROPOSAL_RECORDED' && phase6Report.blockerCount === 0
}

function validateParentBindings(candidate, phase6History, nowMs, blockers) {
  const source = record(candidate.source)
  const environment = record(candidate.environment)
  const cohort = record(candidate.cohort)
  const history = record(phase6History)
  const parent = record(history.receipt)
  const parentSource = record(parent.source)
  const parentCohort = record(parent.cohort)
  const ids = normalizedIds(parentCohort.organisationIds)
  if (!validCommittedPhase6History(history, nowMs)) {
    add(blockers, 'P7_PHASE6_COMMITTED_HISTORY_INVALID', 'Phase 7 requires one immutable, receipt-only committed Phase 6 successor proposal whose embedded Phase 5 parent proves the terminal P0→P5 receipt lineage.')
    return
  }
  if (source.phase6ReceiptCommitSha !== history.receiptCommitSha || source.phase6ReceiptManifestDigest !== history.receiptManifestDigest ||
    source.phase6ProposalPlanDigest !== parentSource.proposalPlanDigest || source.phase6EvidencePacketDigest !== parent.evidence?.evidencePacketDigest ||
    source.phase5ReceiptCommitSha !== parentSource.phase5ReceiptCommitSha || source.phase5ReceiptManifestDigest !== parentSource.phase5ReceiptManifestDigest ||
    source.phase5ObservationPlanDigest !== parentSource.phase5ObservationPlanDigest || source.phase4ReceiptCommitSha !== parentSource.phase4ReceiptCommitSha ||
    source.phase4ReceiptManifestDigest !== parentSource.phase4ReceiptManifestDigest || source.activationPlanDigest !== parentSource.activationPlanDigest ||
    source.commitSha !== parentSource.commitSha || source.packageLockSha256 !== parentSource.packageLockSha256 ||
    environment.productionProjectRef !== parent.environment?.productionProjectRef || environment.productionOrigin !== parent.environment?.productionOrigin || environment.productionUrl !== parent.environment?.productionUrl ||
    !sameJson(cohort.organisationIds, ids) || cohort.cohortDigest !== parentCohort.cohortDigest || !sameJson(cohort.requiredPacketTypes, ['mandate', 'otp'])) {
    add(blockers, 'P7_PHASE6_PARENT_BINDING_INVALID', 'The boundary must exactly bind the immutable recorded Phase 6 proposal, its terminal Phase 5 parent, frozen source, production identity, and existing mandate/OTP cohort.')
  }
}

function validateScope(candidate, blockers) {
  const cohort = record(candidate.cohort)
  const ids = normalizedIds(cohort.organisationIds)
  if (!exactKeys(cohort, COHORT_KEYS) || !sameJson(cohort.organisationIds, ids) || ids.length !== 1 || !validUuid(ids[0]) || cohort.maxOrganisations !== 1 ||
    cohort.cohortDigest !== cohortDigest(ids) || !sameJson(cohort.requiredPacketTypes, ['mandate', 'otp'])) {
    add(blockers, 'P7_EXISTING_COHORT_SCOPE_INVALID', 'Phase 7 can reference exactly one existing UUID organisation and both mandate and OTP packet types; it cannot name or assign a candidate organisation.')
  }
}

function validateBoundary(candidate, blockers) {
  const boundary = record(candidate.boundary)
  const changeSurface = record(candidate.changeSurface)
  const expectedChangeSurface = {
    phase6Migration: 'unapplied_reference_only',
    releaseEpoch: 'absent_no_epoch_id',
    membership: 'no_candidate_or_membership_assignment',
    runtime: 'no_runtime_hook_or_allowlist_change',
    deployment: 'no_deployment_or_production_activation',
    customerEgress: 'no_customer_document_or_email_delivery',
    templates: 'unchanged',
  }
  if (!exactKeys(boundary, BOUNDARY_KEYS) || boundary.kind !== 'successor_implementation_boundary_only' ||
    boundary.authority !== 'non_authoritative' || boundary.requestedAction !== 'separately_authorised_future_implementation_review_only' ||
    !exactKeys(changeSurface, CHANGE_SURFACE_KEYS) || !sameJson(changeSurface, expectedChangeSurface)) {
    add(blockers, 'P7_NON_EXECUTABLE_BOUNDARY_INVALID', 'Phase 7 must remain a non-executable implementation boundary: the migration is only an unapplied reference, no epoch/candidate exists, and no runtime, deployment, template, or customer egress change is authorised.')
  }
}

function validateSafety(candidate, blockers) {
  const safety = record(candidate.safety)
  if (!exactKeys(safety, SAFETY_KEYS) || Object.values(safety).some((value) => value !== true)) {
    add(blockers, 'P7_NO_AUTHORITY_BOUNDARY_INVALID', 'All Phase 7 no-authority controls must be explicitly true: it cannot prepare an epoch, register a membership, add an organisation, scale, change runtime, deploy, generate/send customer documents, activate, or roll back.')
  }
}

function validateStaticBoundary(candidate, staticBoundaryFacts, blockers) {
  const source = record(candidate.source)
  const migration = record(candidate.migrationReference)
  const facts = record(staticBoundaryFacts)
  const factsValid = facts.contract === ROLLOUT_PHASE7_STATIC_BOUNDARY_CONTRACT && facts.migrationId === ROLLOUT_PHASE7_PHASE6_MIGRATION_ID &&
    facts.staticBoundaryValid === true && facts.migrationInvariantsValid === true && facts.noSuccessorRpcRuntimeCallers === true &&
    facts.noMigrationApplyCallers === true && facts.legacyActivatorsRetired === true && facts.sourcePathsRegular === true &&
    facts.implementationCommitDescendsFromPhase6 === true && facts.implementationCommitDiffValid === true && validCommit(facts.implementationCommitSha) &&
    validDigest(facts.implementationCommitDiffDigest) && validDigest(facts.sourceTreeDigest) && validDigest(facts.migrationSourceDigest) && validDigest(facts.migrationInvariantDigest)
  if (!factsValid) {
    add(blockers, 'P7_STATIC_BOUNDARY_FACTS_INVALID', 'The local Phase 6 source inspection must prove the migration remains an unapplied reference, its required invariants are present, no runtime successor-RPC writer is wired, and A3/Q2/V2 remain retired.')
  }
  if (!exactKeys(migration, MIGRATION_REFERENCE_KEYS) || source.implementationCommitSha !== facts.implementationCommitSha ||
    source.implementationCommitDiffDigest !== facts.implementationCommitDiffDigest || source.implementationSourceTreeDigest !== facts.sourceTreeDigest || migration.migrationId !== ROLLOUT_PHASE7_PHASE6_MIGRATION_ID || migration.state !== 'unapplied_reference_only' ||
    !validDigest(migration.migrationSourceDigest) || !validDigest(migration.migrationInvariantDigest) ||
    migration.migrationSourceDigest !== facts.migrationSourceDigest || migration.migrationInvariantDigest !== facts.migrationInvariantDigest) {
    add(blockers, 'P7_MIGRATION_REFERENCE_INVALID', 'The boundary must bind the exact locally inspected Phase 6 migration source and invariant digest as an unapplied reference only.')
  }
}

function validateEvidenceSchema(candidate, nowMs, blockers) {
  const evidence = record(candidate.evidence)
  if (!exactKeys(evidence, EVIDENCE_KEYS) || !validOpaqueReference(evidence.preparedByReference) || !validChangeReference(evidence.changeReference) || !validIsoTime(evidence.preparedAt, nowMs)) {
    add(blockers, 'P7_PREPARATION_ACCOUNTABILITY_INVALID', 'The boundary requires a safe opaque preparer reference, change reference, and non-future preparation timestamp.')
  }
}

function reviewFields(prefix) {
  return {
    evidenceDigest: `${prefix}EvidenceDigest`,
    reviewedAt: `${prefix}ReviewedAt`,
    actorReference: `${prefix}ActorReference`,
  }
}

function validatePendingState(candidate, blockers) {
  const evidence = record(candidate.evidence)
  const reviewFieldsPending = ['architectureReview', 'securityReview', 'nonActivationReview']
    .flatMap((prefix) => Object.values(reviewFields(prefix)))
  if ([...reviewFieldsPending, 'boundaryRecordedAt', 'boundaryRecordedByReference', 'reviewedByReference', 'evidencePacketDigest'].some((field) => evidence[field] !== null)) {
    add(blockers, 'P7_PENDING_STATE_INVALID', 'A pending implementation boundary cannot claim review evidence or a recorded boundary.')
  }
  add(blockers, 'P7_REVIEW_EVIDENCE_PENDING', 'Fresh redacted architecture, security, and non-activation review evidence has not been recorded; the boundary remains non-authoritative.', true)
}

function validateRecordedState(candidate, phase6History, nowMs, blockers) {
  const evidence = record(candidate.evidence)
  const parentRecordedAtMs = timeMs(record(record(phase6History).receipt).evidence?.proposalRecordedAt)
  const preparedAtMs = timeMs(evidence.preparedAt)
  const recordedAtMs = timeMs(evidence.boundaryRecordedAt)
  const reviewTimes = ['architectureReview', 'securityReview', 'nonActivationReview'].map((prefix) => timeMs(evidence[reviewFields(prefix).reviewedAt]))
  const reviewsValid = ['architectureReview', 'securityReview', 'nonActivationReview'].every((prefix) => {
    const fields = reviewFields(prefix)
    return validDigest(evidence[fields.evidenceDigest]) && validOpaqueReference(evidence[fields.actorReference]) && validIsoTime(evidence[fields.reviewedAt], nowMs)
  })
  const fresh = reviewTimes.every((value) => Number.isFinite(value) && value >= preparedAtMs && value >= parentRecordedAtMs && value <= recordedAtMs && recordedAtMs - value <= ROLLOUT_PHASE7_MAX_REVIEW_AGE_MS)
  if (!reviewsValid || !validOpaqueReference(evidence.boundaryRecordedByReference) || !validOpaqueReference(evidence.reviewedByReference) ||
    !validIsoTime(evidence.boundaryRecordedAt, nowMs) || !Number.isFinite(recordedAtMs) || recordedAtMs < preparedAtMs || !fresh) {
    add(blockers, 'P7_FRESH_REVIEW_EVIDENCE_INVALID', `Recorded implementation boundaries require redacted architecture, security, and non-activation review digests that post-date Phase 6, are fresh (no more than ${ROLLOUT_PHASE7_MAX_REVIEW_AGE_DAYS} days before recording), and have safe opaque actor references.`)
  }
  if (!validDigest(evidence.evidencePacketDigest) || evidence.evidencePacketDigest !== rolloutPhase7EvidencePacketDigest(candidate)) {
    add(blockers, 'P7_EVIDENCE_PACKET_DIGEST_INVALID', 'The redacted review evidence digest does not match the recorded Phase 7 boundary.')
  }
}

/**
 * Validates a local-only Phase 7 implementation boundary. It has no ability
 * to apply a migration, call a successor RPC, create an epoch, change a
 * runtime, deploy, email, generate a customer document, or roll back.
 */
export function assessLegalDocumentRolloutPhase7({ receipt, phase6History, staticBoundaryFacts, now = Date.now() } = {}) {
  const nowMs = typeof now === 'number' ? now : timeMs(now)
  const candidate = record(receipt)
  const environment = record(candidate.environment)
  const source = record(candidate.source)
  const blockers = []
  if (!exactKeys(candidate, RECEIPT_KEYS)) add(blockers, 'P7_RECEIPT_SCHEMA_INVALID', 'The Phase 7 receipt contains missing or unknown top-level fields.')
  if (candidate.version !== 1 || candidate.phase !== 'ROLL_OUT_7' || candidate.contract !== ROLLOUT_PHASE7_CONTRACT) {
    add(blockers, 'P7_RECEIPT_CONTRACT_INVALID', 'The receipt must use the current Phase 7 successor-implementation-boundary contract.')
  }
  if (!['pending_boundary', 'implementation_boundary_recorded'].includes(candidate.status)) {
    add(blockers, 'P7_RECEIPT_STATUS_INVALID', 'The receipt status must be pending_boundary or implementation_boundary_recorded.')
  }
  if (!exactKeys(environment, ENVIRONMENT_KEYS) || !validProjectRef(environment.productionProjectRef) || environment.productionOrigin !== expectedOrigin(environment.productionProjectRef) || !validHttpsOrigin(environment.productionUrl)) {
    add(blockers, 'P7_ENVIRONMENT_BINDING_INVALID', 'The receipt must bind exactly one production project, Supabase origin, and HTTPS web origin.')
  }
  if (!exactKeys(source, SOURCE_KEYS) || !validCommit(source.phase6ReceiptCommitSha) || !validDigest(source.phase6ReceiptManifestDigest) ||
    !validDigest(source.phase6ProposalPlanDigest) || !validDigest(source.phase6EvidencePacketDigest) || !validCommit(source.phase5ReceiptCommitSha) ||
    !validDigest(source.phase5ReceiptManifestDigest) || !validDigest(source.phase5ObservationPlanDigest) || !validCommit(source.phase4ReceiptCommitSha) ||
    !validDigest(source.phase4ReceiptManifestDigest) || !validDigest(source.activationPlanDigest) || !validCommit(source.commitSha) ||
    !validCommit(source.implementationCommitSha) || !validDigest(source.implementationCommitDiffDigest) || !validDigest(source.implementationSourceTreeDigest) || !validDigest(source.packageLockSha256) || !validDigest(source.boundaryPlanDigest)) {
    add(blockers, 'P7_SOURCE_SCHEMA_INVALID', 'The receipt must bind immutable Phase 6 and Phase 5 history, frozen source, and a sealed boundary-plan digest.')
  }
  validateScope(candidate, blockers)
  validateBoundary(candidate, blockers)
  validateSafety(candidate, blockers)
  validateStaticBoundary(candidate, staticBoundaryFacts, blockers)
  validateEvidenceSchema(candidate, nowMs, blockers)
  validateParentBindings(candidate, phase6History, nowMs, blockers)
  if (source.boundaryPlanDigest !== rolloutPhase7BoundaryPlanDigest(candidate)) {
    add(blockers, 'P7_BOUNDARY_PLAN_DIGEST_INVALID', 'The sealed boundary-plan digest does not match its immutable parent, no-op surface, migration reference, and preparation context.')
  }
  if (candidate.status === 'pending_boundary') validatePendingState(candidate, blockers)
  if (candidate.status === 'implementation_boundary_recorded') validateRecordedState(candidate, phase6History, nowMs, blockers)
  if (!validDigest(candidate.manifestDigest) || candidate.manifestDigest !== rolloutPhase7ManifestDigest(candidate)) {
    add(blockers, 'P7_RECEIPT_DIGEST_INVALID', 'The receipt manifest digest does not match its contents.')
  }
  const hardBlockers = blockers.filter((blocker) => !blocker.pending)
  const status = hardBlockers.length
    ? 'HOLD'
    : candidate.status === 'pending_boundary'
      ? 'IMPLEMENTATION_BOUNDARY_READY'
      : 'IMPLEMENTATION_BOUNDARY_RECORDED'
  const ids = normalizedIds(candidate.cohort?.organisationIds)
  return {
    phase: 'ROLL_OUT_7',
    contract: ROLLOUT_PHASE7_CONTRACT,
    scope: 'local_non_executable_successor_implementation_boundary_validation',
    boundaryState: candidate.status ?? null,
    status,
    blockerCount: hardBlockers.length,
    pendingCount: blockers.length - hardBlockers.length,
    blockers,
    evidence: {
      phase6ReceiptCommitSha: text(source.phase6ReceiptCommitSha) || null,
      phase6ReceiptManifestDigest: text(source.phase6ReceiptManifestDigest) || null,
      phase6ProposalPlanDigest: text(source.phase6ProposalPlanDigest) || null,
      phase6EvidencePacketDigest: text(source.phase6EvidencePacketDigest) || null,
      implementationCommitSha: text(source.implementationCommitSha) || null,
      implementationCommitDiffDigest: text(source.implementationCommitDiffDigest) || null,
      implementationSourceTreeDigest: text(source.implementationSourceTreeDigest) || null,
      boundaryPlanDigest: text(source.boundaryPlanDigest) || null,
      evidencePacketDigest: text(candidate.evidence?.evidencePacketDigest) || null,
      migrationSourceDigest: text(candidate.migrationReference?.migrationSourceDigest) || null,
      migrationInvariantDigest: text(candidate.migrationReference?.migrationInvariantDigest) || null,
      productionProjectRef: text(environment.productionProjectRef) || null,
      existingCohortSize: ids.length,
      existingCohortDigest: text(candidate.cohort?.cohortDigest) || null,
    },
    doesNotVerify: [...ROLLOUT_PHASE7_DOES_NOT_VERIFY],
    doesNotAuthorize: [...ROLLOUT_PHASE7_DOES_NOT_AUTHORIZE],
    mutatedData: false,
  }
}

export function createPendingLegalDocumentRolloutPhase7Receipt({
  phase6History,
  staticBoundaryFacts,
  preparedByReference,
  changeReference,
  preparedAt = new Date().toISOString(),
} = {}) {
  const history = record(phase6History)
  const phase6Receipt = record(history.receipt)
  const phase6Source = record(phase6Receipt.source)
  const ids = normalizedIds(phase6Receipt.cohort?.organisationIds)
  const facts = record(staticBoundaryFacts)
  const receipt = {
    version: 1,
    phase: 'ROLL_OUT_7',
    contract: ROLLOUT_PHASE7_CONTRACT,
    status: 'pending_boundary',
    environment: {
      productionProjectRef: phase6Receipt.environment?.productionProjectRef ?? null,
      productionOrigin: phase6Receipt.environment?.productionOrigin ?? null,
      productionUrl: phase6Receipt.environment?.productionUrl ?? null,
    },
    source: {
      phase6ReceiptCommitSha: history.receiptCommitSha ?? null,
      phase6ReceiptManifestDigest: history.receiptManifestDigest ?? null,
      phase6ProposalPlanDigest: phase6Source.proposalPlanDigest ?? null,
      phase6EvidencePacketDigest: phase6Receipt.evidence?.evidencePacketDigest ?? null,
      phase5ReceiptCommitSha: phase6Source.phase5ReceiptCommitSha ?? null,
      phase5ReceiptManifestDigest: phase6Source.phase5ReceiptManifestDigest ?? null,
      phase5ObservationPlanDigest: phase6Source.phase5ObservationPlanDigest ?? null,
      phase4ReceiptCommitSha: phase6Source.phase4ReceiptCommitSha ?? null,
      phase4ReceiptManifestDigest: phase6Source.phase4ReceiptManifestDigest ?? null,
      activationPlanDigest: phase6Source.activationPlanDigest ?? null,
      commitSha: phase6Source.commitSha ?? null,
      implementationCommitSha: facts.implementationCommitSha ?? null,
      implementationCommitDiffDigest: facts.implementationCommitDiffDigest ?? null,
      implementationSourceTreeDigest: facts.sourceTreeDigest ?? null,
      packageLockSha256: phase6Source.packageLockSha256 ?? null,
      boundaryPlanDigest: null,
    },
    cohort: {
      organisationIds: ids,
      cohortDigest: cohortDigest(ids),
      maxOrganisations: 1,
      requiredPacketTypes: ['mandate', 'otp'],
    },
    boundary: {
      kind: 'successor_implementation_boundary_only',
      authority: 'non_authoritative',
      requestedAction: 'separately_authorised_future_implementation_review_only',
    },
    changeSurface: {
      phase6Migration: 'unapplied_reference_only',
      releaseEpoch: 'absent_no_epoch_id',
      membership: 'no_candidate_or_membership_assignment',
      runtime: 'no_runtime_hook_or_allowlist_change',
      deployment: 'no_deployment_or_production_activation',
      customerEgress: 'no_customer_document_or_email_delivery',
      templates: 'unchanged',
    },
    migrationReference: {
      migrationId: ROLLOUT_PHASE7_PHASE6_MIGRATION_ID,
      migrationSourceDigest: facts.migrationSourceDigest ?? null,
      migrationInvariantDigest: facts.migrationInvariantDigest ?? null,
      state: 'unapplied_reference_only',
    },
    safety: {
      noActivationAuthorization: true,
      noScaleAuthorization: true,
      noSecondOrganisationAuthorization: true,
      noEpochPreparationAuthorization: true,
      noMembershipRegistrationAuthorization: true,
      noRuntimeChangeAuthorization: true,
      noDeploymentAuthorization: true,
      noCustomerDocumentAuthorization: true,
      noCustomerEmailAuthorization: true,
      noRollbackAuthorization: true,
    },
    evidence: {
      preparedByReference: preparedByReference || null,
      preparedAt,
      changeReference: changeReference || null,
      architectureReviewEvidenceDigest: null,
      architectureReviewReviewedAt: null,
      architectureReviewActorReference: null,
      securityReviewEvidenceDigest: null,
      securityReviewReviewedAt: null,
      securityReviewActorReference: null,
      nonActivationReviewEvidenceDigest: null,
      nonActivationReviewReviewedAt: null,
      nonActivationReviewActorReference: null,
      boundaryRecordedAt: null,
      boundaryRecordedByReference: null,
      reviewedByReference: null,
      evidencePacketDigest: null,
    },
    manifestDigest: null,
  }
  receipt.source.boundaryPlanDigest = rolloutPhase7BoundaryPlanDigest(receipt)
  receipt.manifestDigest = rolloutPhase7ManifestDigest(receipt)
  return stableValue(receipt)
}
