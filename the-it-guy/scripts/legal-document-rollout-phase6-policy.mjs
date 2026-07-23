import {
  sha256Digest,
  stableJson,
  stableValue,
} from './legal-document-rollout-phase1-artifacts.mjs'

export const ROLLOUT_PHASE6_CONTRACT = 'legal-document-successor-release-proposal-v1'
export const ROLLOUT_PHASE6_MAX_APPROVAL_AGE_DAYS = 30
export const ROLLOUT_PHASE6_MAX_APPROVAL_AGE_MS = ROLLOUT_PHASE6_MAX_APPROVAL_AGE_DAYS * 24 * 60 * 60 * 1000
export const ROLLOUT_PHASE6_RELEASE_EPOCH_CONTRACT = 'legal-document-successor-release-epoch-v1'
export const ROLLOUT_PHASE6_RELEASE_EPOCH_MIGRATION_ID = 'phase6_server_owned_release_epoch_integrity'

// Phase 6 records only the decision material needed to consider a future,
// separately governed successor release. It deliberately does not create a
// release authority or change the terminal Phase 0→5 receipt chain.
export const ROLLOUT_PHASE6_DOES_NOT_AUTHORIZE = Object.freeze([
  'cohort_expansion_or_scale',
  'a_second_organisation',
  'runtime_guard_or_secret_change',
  'v1_allowlist_widening',
  'template_or_source_change',
  'deployment_or_production_activation',
  'customer_document_or_email_delivery',
  'rollback_execution',
])

export const ROLLOUT_PHASE6_DOES_NOT_VERIFY = Object.freeze([
  'future_runtime_or_provider_drift',
  'future_customer_lifecycles',
  'the contents of private legal_or_release_approval_material',
  'a future successor_release_implementation',
])

const RECEIPT_KEYS = Object.freeze([
  'cohort', 'contract', 'environment', 'evidence', 'inventory', 'manifestDigest', 'phase', 'proposal', 'releaseEpochReadiness', 'safety', 'source', 'status', 'version',
])
const ENVIRONMENT_KEYS = Object.freeze([
  'productionOrigin', 'productionProjectRef', 'productionUrl',
])
const SOURCE_KEYS = Object.freeze([
  'activationPlanDigest', 'commitSha', 'packageLockSha256', 'phase4ReceiptCommitSha', 'phase4ReceiptManifestDigest', 'phase5ObservationPlanDigest', 'phase5ReceiptCommitSha', 'phase5ReceiptManifestDigest', 'proposalPlanDigest',
])
const COHORT_KEYS = Object.freeze([
  'cohortDigest', 'maxOrganisations', 'organisationIds', 'requiredPacketTypes',
])
const INVENTORY_KEYS = Object.freeze([
  'authority', 'candidateCount', 'candidateInventoryDigest', 'classification',
])
const SAFETY_KEYS = Object.freeze([
  'noActivationAuthorization', 'noCustomerEmailAuthorization', 'noDeploymentAuthorization', 'noRollbackAuthorization', 'noRuntimeChangeAuthorization', 'noScaleAuthorization', 'noSecondOrganisationAuthorization',
])
const PROPOSAL_KEYS = Object.freeze([
  'authority', 'kind', 'requestedAction',
])
const RELEASE_EPOCH_READINESS_KEYS = Object.freeze([
  'legacyA3Q2V2MutatorRetirementEvidenceDigest', 'releaseEpochMigrationEvidenceDigest', 'releaseEpochMigrationId', 'serverOwnedReleaseEpochContract', 'v1AllowlistPreservationEvidenceDigest', 'v1AllowlistWideningAllowed',
])
const EVIDENCE_KEYS = Object.freeze([
  'changeReference', 'evidencePacketDigest', 'legalApprovalActorReference', 'legalApprovalApprovedAt', 'legalApprovalEvidenceDigest', 'preparedAt', 'preparedByReference', 'proposalRecordedAt', 'proposalRecordedByReference', 'releaseApprovalActorReference', 'releaseApprovalApprovedAt', 'releaseApprovalEvidenceDigest', 'reviewedByReference',
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

function validReference(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(text(value)) && !/[\/@\s]/.test(text(value))
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
  const inventory = record(candidate.inventory)
  const releaseEpochReadiness = record(candidate.releaseEpochReadiness)
  return {
    proposalPlanDigest: candidate.source?.proposalPlanDigest ?? null,
    inventory: {
      classification: inventory.classification ?? null,
      authority: inventory.authority ?? null,
      candidateCount: inventory.candidateCount ?? null,
      candidateInventoryDigest: inventory.candidateInventoryDigest ?? null,
    },
    legalApproval: {
      evidenceDigest: evidence.legalApprovalEvidenceDigest ?? null,
      approvedAt: evidence.legalApprovalApprovedAt ?? null,
      actorReference: evidence.legalApprovalActorReference ?? null,
    },
    releaseApproval: {
      evidenceDigest: evidence.releaseApprovalEvidenceDigest ?? null,
      approvedAt: evidence.releaseApprovalApprovedAt ?? null,
      actorReference: evidence.releaseApprovalActorReference ?? null,
    },
    releaseEpochReadiness: {
      releaseEpochMigrationEvidenceDigest: releaseEpochReadiness.releaseEpochMigrationEvidenceDigest ?? null,
      legacyA3Q2V2MutatorRetirementEvidenceDigest: releaseEpochReadiness.legacyA3Q2V2MutatorRetirementEvidenceDigest ?? null,
      v1AllowlistPreservationEvidenceDigest: releaseEpochReadiness.v1AllowlistPreservationEvidenceDigest ?? null,
    },
    proposalRecordedAt: evidence.proposalRecordedAt ?? null,
    proposalRecordedByReference: evidence.proposalRecordedByReference ?? null,
    reviewedByReference: evidence.reviewedByReference ?? null,
  }
}

// This digest seals the independent Phase 6 proposal envelope before private
// approval evidence or a non-authority inventory are attached.
export function rolloutPhase6ProposalPlanDigest(receipt) {
  const candidate = record(receipt)
  const source = { ...record(candidate.source) }
  delete source.proposalPlanDigest
  const inventory = record(candidate.inventory)
  return sha256Digest(stableJson({
    version: candidate.version,
    phase: candidate.phase,
    contract: candidate.contract,
    environment: candidate.environment,
    source,
    cohort: candidate.cohort,
    inventory: {
      classification: inventory.classification ?? null,
      authority: inventory.authority ?? null,
    },
    safety: candidate.safety,
    proposal: candidate.proposal,
    releaseEpochReadiness: {
      serverOwnedReleaseEpochContract: record(candidate.releaseEpochReadiness).serverOwnedReleaseEpochContract ?? null,
      releaseEpochMigrationId: record(candidate.releaseEpochReadiness).releaseEpochMigrationId ?? null,
      v1AllowlistWideningAllowed: record(candidate.releaseEpochReadiness).v1AllowlistWideningAllowed ?? null,
    },
    evidence: planEvidenceProjection(candidate.evidence),
  }))
}

// This digest binds the redacted approval evidence and non-authority inventory
// to the sealed proposal without committing legal material, PII, or secrets.
export function rolloutPhase6EvidencePacketDigest(receipt) {
  return sha256Digest(stableJson(evidencePacketProjection(receipt)))
}

export function rolloutPhase6ManifestDigest(receipt) {
  const canonical = { ...record(receipt) }
  delete canonical.manifestDigest
  return sha256Digest(stableJson(canonical))
}

function validCommittedPhase5History(history) {
  const item = record(history)
  const ids = normalizedIds(item.organisationIds)
  return item.receiptOnlyCommit === true && item.receiptManifestDigestValid === true &&
    item.receiptStatus === 'pilot_observation_recorded' && item.receiptPhase === 'ROLL_OUT_5' &&
    item.receiptContract === 'legal-document-production-pilot-observation-v1' &&
    validCommit(item.receiptCommitSha) && validDigest(item.receiptManifestDigest) &&
    validCommit(item.phase4ReceiptCommitSha) && validDigest(item.phase4ReceiptManifestDigest) &&
    validCommit(item.sourceCommitSha) && validDigest(item.packageLockSha256) &&
    validDigest(item.activationPlanDigest) && validDigest(item.observationPlanDigest) &&
    validDigest(item.cohortDigest) && ids.length === 1 && validUuid(ids[0]) &&
    item.cohortDigest === cohortDigest(ids) && sameJson(item.requiredPacketTypes, ['mandate', 'otp']) &&
    validProjectRef(item.productionProjectRef) && item.productionOrigin === expectedOrigin(item.productionProjectRef) &&
    validHttpsOrigin(item.productionUrl) && Number.isFinite(timeMs(item.observationRecordedAt)) &&
    text(item.runtimeGuardContract) === 'legal-document-pilot-release-v1' && text(item.watchdogContract) === 'phase5-f2-f3-f4-v2'
}

function validateParentBindings(candidate, phase5History, blockers) {
  const source = record(candidate.source)
  const environment = record(candidate.environment)
  const cohort = record(candidate.cohort)
  const history = record(phase5History)
  const ids = normalizedIds(history.organisationIds)
  if (!validCommittedPhase5History(history)) {
    add(blockers, 'P6_PHASE5_COMMITTED_HISTORY_INVALID', 'Phase 6 requires one immutable, receipt-only committed Phase 5 pilot-observation record with a valid digest and no working-tree substitution.')
    return
  }
  if (source.phase5ReceiptCommitSha !== history.receiptCommitSha || source.phase5ReceiptManifestDigest !== history.receiptManifestDigest ||
    source.phase5ObservationPlanDigest !== history.observationPlanDigest || source.phase4ReceiptCommitSha !== history.phase4ReceiptCommitSha ||
    source.phase4ReceiptManifestDigest !== history.phase4ReceiptManifestDigest || source.activationPlanDigest !== history.activationPlanDigest ||
    source.commitSha !== history.sourceCommitSha || source.packageLockSha256 !== history.packageLockSha256 ||
    environment.productionProjectRef !== history.productionProjectRef || environment.productionOrigin !== history.productionOrigin || environment.productionUrl !== history.productionUrl ||
    !sameJson(cohort.organisationIds, ids) || cohort.cohortDigest !== history.cohortDigest || !sameJson(cohort.requiredPacketTypes, ['mandate', 'otp'])) {
    add(blockers, 'P6_PHASE5_PARENT_BINDING_INVALID', 'The proposal must exactly bind the committed Phase 5 receipt, frozen source, activation marker, production identity, one existing organisation, and mandate/OTP coverage.')
  }
}

function validateScope(candidate, blockers) {
  const cohort = record(candidate.cohort)
  const inventory = record(candidate.inventory)
  const ids = normalizedIds(cohort.organisationIds)
  if (!exactKeys(cohort, COHORT_KEYS) || !sameJson(cohort.organisationIds, ids) || ids.length !== 1 || !validUuid(ids[0]) || cohort.maxOrganisations !== 1 ||
    cohort.cohortDigest !== cohortDigest(ids) || !sameJson(cohort.requiredPacketTypes, ['mandate', 'otp'])) {
    add(blockers, 'P6_EXISTING_COHORT_SCOPE_INVALID', 'Phase 6 can reference exactly one existing UUID organisation and both mandate and OTP packet types; it cannot name a second organisation.')
  }
  const validInventory = exactKeys(inventory, INVENTORY_KEYS) && inventory.classification === 'potential_successor_non_authority_inventory' &&
    inventory.authority === 'none' && (inventory.candidateCount === null || (Number.isInteger(inventory.candidateCount) && inventory.candidateCount >= 0)) &&
    (inventory.candidateInventoryDigest === null || validDigest(inventory.candidateInventoryDigest))
  if (!validInventory) {
    add(blockers, 'P6_INVENTORY_NON_AUTHORITY_INVALID', 'Potential successor scope must be a digest-only, non-authoritative inventory with no candidate identifiers or activation authority.')
  }
}

function validateSafety(candidate, blockers) {
  const safety = record(candidate.safety)
  const proposal = record(candidate.proposal)
  if (!exactKeys(safety, SAFETY_KEYS) || Object.values(safety).some((value) => value !== true) ||
    !exactKeys(proposal, PROPOSAL_KEYS) || proposal.kind !== 'successor_release_proposal_only' ||
    proposal.authority !== 'non_authoritative' || proposal.requestedAction !== 'separately_authorised_future_review_only') {
    add(blockers, 'P6_NO_AUTHORITY_BOUNDARY_INVALID', 'Phase 6 must remain a non-authoritative proposal only: no scale, second organisation, runtime change, deployment, email, activation, or rollback authority exists.')
  }
}

function validateReleaseEpochReadiness(candidate, recorded, blockers) {
  const readiness = record(candidate.releaseEpochReadiness)
  const contractValid = exactKeys(readiness, RELEASE_EPOCH_READINESS_KEYS) &&
    readiness.serverOwnedReleaseEpochContract === ROLLOUT_PHASE6_RELEASE_EPOCH_CONTRACT &&
    readiness.releaseEpochMigrationId === ROLLOUT_PHASE6_RELEASE_EPOCH_MIGRATION_ID &&
    readiness.v1AllowlistWideningAllowed === false
  const evidenceValid = [
    readiness.releaseEpochMigrationEvidenceDigest,
    readiness.legacyA3Q2V2MutatorRetirementEvidenceDigest,
    readiness.v1AllowlistPreservationEvidenceDigest,
  ].every((value) => recorded ? validDigest(value) : value === null)
  if (!contractValid || !evidenceValid) {
    add(blockers, 'P6_SERVER_OWNED_RELEASE_EPOCH_READINESS_INVALID', 'Phase 6 requires evidence for the server-owned release-epoch migration, legacy A3/Q2/V2 mutator retirement, and unchanged v1 allowlist; it cannot widen the v1 allowlist or activate the successor epoch.')
  }
}

function validateEvidenceSchema(candidate, nowMs, blockers) {
  const evidence = record(candidate.evidence)
  if (!exactKeys(evidence, EVIDENCE_KEYS) || !validReference(evidence.preparedByReference) || !validReference(evidence.changeReference) || !validIsoTime(evidence.preparedAt, nowMs)) {
    add(blockers, 'P6_PREPARATION_ACCOUNTABILITY_INVALID', 'The proposal requires a safe opaque preparer reference, change reference, and non-future preparation timestamp.')
  }
}

function validatePendingState(candidate, blockers) {
  const evidence = record(candidate.evidence)
  const inventory = record(candidate.inventory)
  if (inventory.candidateCount !== null || inventory.candidateInventoryDigest !== null ||
    [
      'legalApprovalEvidenceDigest', 'legalApprovalApprovedAt', 'legalApprovalActorReference',
      'releaseApprovalEvidenceDigest', 'releaseApprovalApprovedAt', 'releaseApprovalActorReference',
      'proposalRecordedAt', 'proposalRecordedByReference', 'reviewedByReference', 'evidencePacketDigest',
    ].some((field) => evidence[field] !== null)) {
    add(blockers, 'P6_PENDING_STATE_INVALID', 'A pending successor proposal cannot claim inventory, legal approval, release approval, or recorded evidence.')
  }
  add(blockers, 'P6_APPROVAL_EVIDENCE_PENDING', 'Fresh redacted legal and release approval evidence has not been recorded; the proposal remains non-authoritative.', true)
}

function validateRecordedState(candidate, phase5History, nowMs, blockers) {
  const evidence = record(candidate.evidence)
  const inventory = record(candidate.inventory)
  const preparedAtMs = timeMs(evidence.preparedAt)
  const phase5RecordedAtMs = timeMs(record(phase5History).observationRecordedAt)
  const legalApprovedAtMs = timeMs(evidence.legalApprovalApprovedAt)
  const releaseApprovedAtMs = timeMs(evidence.releaseApprovalApprovedAt)
  const recordedAtMs = timeMs(evidence.proposalRecordedAt)
  const approvalTimes = [legalApprovedAtMs, releaseApprovedAtMs]
  const fresh = approvalTimes.every((value) => Number.isFinite(value) && value >= preparedAtMs && value >= phase5RecordedAtMs && value <= recordedAtMs && recordedAtMs - value <= ROLLOUT_PHASE6_MAX_APPROVAL_AGE_MS)
  if (!Number.isInteger(inventory.candidateCount) || inventory.candidateCount < 0 || !validDigest(inventory.candidateInventoryDigest) ||
    !validDigest(evidence.legalApprovalEvidenceDigest) || !validDigest(evidence.releaseApprovalEvidenceDigest) ||
    !validReference(evidence.legalApprovalActorReference) || !validReference(evidence.releaseApprovalActorReference) ||
    !validReference(evidence.proposalRecordedByReference) || !validReference(evidence.reviewedByReference) ||
    !validIsoTime(evidence.legalApprovalApprovedAt, nowMs) || !validIsoTime(evidence.releaseApprovalApprovedAt, nowMs) ||
    !validIsoTime(evidence.proposalRecordedAt, nowMs) || !Number.isFinite(recordedAtMs) || recordedAtMs < preparedAtMs || !fresh) {
    add(blockers, 'P6_FRESH_APPROVAL_EVIDENCE_INVALID', `Recorded successor proposals require redacted legal and release approval digests that are fresh (no more than ${ROLLOUT_PHASE6_MAX_APPROVAL_AGE_DAYS} days before recording), post-date Phase 5, and have safe opaque actor references.`)
  }
  if (!validDigest(evidence.evidencePacketDigest) || evidence.evidencePacketDigest !== rolloutPhase6EvidencePacketDigest(candidate)) {
    add(blockers, 'P6_EVIDENCE_PACKET_DIGEST_INVALID', 'The redacted legal/release approval and inventory evidence digest does not match the recorded proposal.')
  }
}

/**
 * Validates an independent, local Phase 6 successor-release proposal. It is
 * intentionally unable to activate production, change runtime settings,
 * expand a cohort, send email, deploy, roll back, or make a network request.
 */
export function assessLegalDocumentRolloutPhase6({ receipt, phase5History, now = Date.now() } = {}) {
  const nowMs = typeof now === 'number' ? now : timeMs(now)
  const candidate = record(receipt)
  const environment = record(candidate.environment)
  const source = record(candidate.source)
  const blockers = []
  if (!exactKeys(candidate, RECEIPT_KEYS)) add(blockers, 'P6_RECEIPT_SCHEMA_INVALID', 'The Phase 6 receipt contains missing or unknown top-level fields.')
  if (candidate.version !== 1 || candidate.phase !== 'ROLL_OUT_6' || candidate.contract !== ROLLOUT_PHASE6_CONTRACT) {
    add(blockers, 'P6_RECEIPT_CONTRACT_INVALID', 'The receipt must use the current Phase 6 successor-release-proposal contract.')
  }
  if (!['pending_proposal', 'successor_proposal_recorded'].includes(candidate.status)) {
    add(blockers, 'P6_RECEIPT_STATUS_INVALID', 'The receipt status must be pending_proposal or successor_proposal_recorded.')
  }
  if (!exactKeys(environment, ENVIRONMENT_KEYS) || !validProjectRef(environment.productionProjectRef) || environment.productionOrigin !== expectedOrigin(environment.productionProjectRef) || !validHttpsOrigin(environment.productionUrl)) {
    add(blockers, 'P6_ENVIRONMENT_BINDING_INVALID', 'The receipt must bind exactly one production project, Supabase origin, and HTTPS web origin.')
  }
  if (!exactKeys(source, SOURCE_KEYS) || !validCommit(source.phase5ReceiptCommitSha) || !validDigest(source.phase5ReceiptManifestDigest) ||
    !validDigest(source.phase5ObservationPlanDigest) || !validCommit(source.phase4ReceiptCommitSha) || !validDigest(source.phase4ReceiptManifestDigest) ||
    !validDigest(source.activationPlanDigest) || !validCommit(source.commitSha) || !validDigest(source.packageLockSha256) || !validDigest(source.proposalPlanDigest)) {
    add(blockers, 'P6_SOURCE_SCHEMA_INVALID', 'The receipt must bind an immutable Phase 5 receipt, its sealed observation marker, and the frozen source with a proposal-plan digest.')
  }
  validateScope(candidate, blockers)
  validateSafety(candidate, blockers)
  validateReleaseEpochReadiness(candidate, candidate.status === 'successor_proposal_recorded', blockers)
  validateEvidenceSchema(candidate, nowMs, blockers)
  validateParentBindings(candidate, phase5History, blockers)
  if (source.proposalPlanDigest !== rolloutPhase6ProposalPlanDigest(candidate)) {
    add(blockers, 'P6_PROPOSAL_PLAN_DIGEST_INVALID', 'The sealed proposal-plan digest does not match its immutable parent, scope, boundary, and preparation context.')
  }
  if (candidate.status === 'pending_proposal') validatePendingState(candidate, blockers)
  if (candidate.status === 'successor_proposal_recorded') validateRecordedState(candidate, phase5History, nowMs, blockers)
  if (!validDigest(candidate.manifestDigest) || candidate.manifestDigest !== rolloutPhase6ManifestDigest(candidate)) {
    add(blockers, 'P6_RECEIPT_DIGEST_INVALID', 'The receipt manifest digest does not match its contents.')
  }
  const hardBlockers = blockers.filter((blocker) => !blocker.pending)
  const status = hardBlockers.length
    ? 'HOLD'
    : candidate.status === 'pending_proposal'
      ? 'SUCCESSOR_PROPOSAL_READY'
      : 'SUCCESSOR_PROPOSAL_RECORDED'
  const ids = normalizedIds(candidate.cohort?.organisationIds)
  return {
    phase: 'ROLL_OUT_6',
    contract: ROLLOUT_PHASE6_CONTRACT,
    scope: 'local_non_authoritative_successor_proposal_validation',
    proposalState: candidate.status ?? null,
    status,
    blockerCount: hardBlockers.length,
    pendingCount: blockers.length - hardBlockers.length,
    blockers,
    evidence: {
      phase5ReceiptCommitSha: text(source.phase5ReceiptCommitSha) || null,
      phase5ReceiptManifestDigest: text(source.phase5ReceiptManifestDigest) || null,
      phase5ObservationPlanDigest: text(source.phase5ObservationPlanDigest) || null,
      proposalPlanDigest: text(source.proposalPlanDigest) || null,
      evidencePacketDigest: text(candidate.evidence?.evidencePacketDigest) || null,
      productionProjectRef: text(environment.productionProjectRef) || null,
      existingCohortSize: ids.length,
      existingCohortDigest: text(candidate.cohort?.cohortDigest) || null,
      candidateInventoryCount: Number.isInteger(candidate.inventory?.candidateCount) ? candidate.inventory.candidateCount : null,
    },
    doesNotVerify: [...ROLLOUT_PHASE6_DOES_NOT_VERIFY],
    doesNotAuthorize: [...ROLLOUT_PHASE6_DOES_NOT_AUTHORIZE],
    mutatedData: false,
  }
}

export function createPendingLegalDocumentRolloutPhase6Receipt({
  phase5History,
  preparedByReference,
  changeReference,
  preparedAt = new Date().toISOString(),
} = {}) {
  const history = record(phase5History)
  const ids = normalizedIds(history.organisationIds)
  const receipt = {
    version: 1,
    phase: 'ROLL_OUT_6',
    contract: ROLLOUT_PHASE6_CONTRACT,
    status: 'pending_proposal',
    environment: {
      productionProjectRef: history.productionProjectRef ?? null,
      productionOrigin: history.productionOrigin ?? null,
      productionUrl: history.productionUrl ?? null,
    },
    source: {
      phase5ReceiptCommitSha: history.receiptCommitSha ?? null,
      phase5ReceiptManifestDigest: history.receiptManifestDigest ?? null,
      phase5ObservationPlanDigest: history.observationPlanDigest ?? null,
      phase4ReceiptCommitSha: history.phase4ReceiptCommitSha ?? null,
      phase4ReceiptManifestDigest: history.phase4ReceiptManifestDigest ?? null,
      activationPlanDigest: history.activationPlanDigest ?? null,
      commitSha: history.sourceCommitSha ?? null,
      packageLockSha256: history.packageLockSha256 ?? null,
      proposalPlanDigest: null,
    },
    cohort: {
      organisationIds: ids,
      cohortDigest: cohortDigest(ids),
      maxOrganisations: 1,
      requiredPacketTypes: ['mandate', 'otp'],
    },
    inventory: {
      classification: 'potential_successor_non_authority_inventory',
      candidateCount: null,
      candidateInventoryDigest: null,
      authority: 'none',
    },
    safety: {
      noActivationAuthorization: true,
      noScaleAuthorization: true,
      noSecondOrganisationAuthorization: true,
      noRuntimeChangeAuthorization: true,
      noDeploymentAuthorization: true,
      noCustomerEmailAuthorization: true,
      noRollbackAuthorization: true,
    },
    proposal: {
      kind: 'successor_release_proposal_only',
      authority: 'non_authoritative',
      requestedAction: 'separately_authorised_future_review_only',
    },
    releaseEpochReadiness: {
      serverOwnedReleaseEpochContract: ROLLOUT_PHASE6_RELEASE_EPOCH_CONTRACT,
      releaseEpochMigrationId: ROLLOUT_PHASE6_RELEASE_EPOCH_MIGRATION_ID,
      releaseEpochMigrationEvidenceDigest: null,
      legacyA3Q2V2MutatorRetirementEvidenceDigest: null,
      v1AllowlistPreservationEvidenceDigest: null,
      v1AllowlistWideningAllowed: false,
    },
    evidence: {
      preparedByReference: preparedByReference || null,
      preparedAt,
      changeReference: changeReference || null,
      legalApprovalEvidenceDigest: null,
      legalApprovalApprovedAt: null,
      legalApprovalActorReference: null,
      releaseApprovalEvidenceDigest: null,
      releaseApprovalApprovedAt: null,
      releaseApprovalActorReference: null,
      proposalRecordedAt: null,
      proposalRecordedByReference: null,
      reviewedByReference: null,
      evidencePacketDigest: null,
    },
    manifestDigest: null,
  }
  receipt.source.proposalPlanDigest = rolloutPhase6ProposalPlanDigest(receipt)
  receipt.manifestDigest = rolloutPhase6ManifestDigest(receipt)
  return stableValue(receipt)
}
