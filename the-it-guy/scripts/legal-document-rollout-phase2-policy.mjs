import {
  ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS,
} from './legal-document-rollout-phase1-policy.mjs'
import {
  sha256Digest,
  stableJson,
  stableValue,
} from './legal-document-rollout-phase1-artifacts.mjs'

export const ROLLOUT_PHASE2_CONTRACT = 'legal-document-staging-acceptance-v1'
export const ROLLOUT_PHASE2_MAX_EVIDENCE_AGE_MS = ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS

// These are intentionally explicit rather than inferred from whatever happens
// to be available in staging. A passing acceptance run must prove every path
// the product promises, including the company/onboarding and cash OTP paths
// that are easy to miss when only a happy-path packet is inspected.
export const ROLLOUT_PHASE2_REQUIRED_SCENARIOS = Object.freeze([
  'mandate_onboarding_individual',
  'mandate_onboarding_company',
  'otp_cash',
  'otp_bond',
  'negative_template_and_authority',
  'idempotency_and_recovery',
  'physical_signature_capability',
])

export const ROLLOUT_PHASE2_DOES_NOT_AUTHORIZE = Object.freeze([
  'production_deployment_or_promotion',
  'pilot_or_scale_activation',
  'unbounded_staging_writes',
  'production_or_customer_email_delivery',
  'physical_signature_completion_without_server_attestation',
])

export const ROLLOUT_PHASE2_DOES_NOT_VERIFY = Object.freeze([
  'future_runtime_template_or_storage_drift',
  'production_runtime_health',
  'legal_approval_currency_after_the_bound_review',
  'physical_signature_completion_when_the_capability_is_not_implemented',
])

const RECEIPT_KEYS = Object.freeze([
  'acceptance',
  'contract',
  'environment',
  'evidence',
  'execution',
  'manifestDigest',
  'phase',
  'safety',
  'source',
  'status',
  'version',
])
const ENVIRONMENT_KEYS = Object.freeze([
  'previewReleaseId',
  'previewUrl',
  'productionProjectRef',
  'stagingOrigin',
  'stagingProjectRef',
])
const SOURCE_KEYS = Object.freeze([
  'commitSha',
  'packageLockSha256',
  'phase0ManifestDigest',
  'phase1PreviewArtifactTreeSha256',
  'phase1PreviewAttestationEvidenceDigest',
  'phase1ReceiptManifestDigest',
])
const SAFETY_KEYS = Object.freeze([
  'creationPaused',
  'externalRecipientPolicy',
  'fixtureNamespace',
  'fixtureWriteLimit',
  'physicalSigningRequired',
  'pilotEnabled',
  'scaleEnabled',
  'testMailboxDigest',
])
const ACCEPTANCE_KEYS = Object.freeze([
  'physicalSigningCapability',
  'requiredScenarios',
])
const EVIDENCE_KEYS = Object.freeze([
  'acceptanceRecordedAt',
  'acceptanceRecordedBy',
  'changeReference',
  'fixtureWrites',
  'preparedAt',
  'preparedBy',
  'reviewedBy',
])
const EXECUTION_KEYS = Object.freeze([
  'browserEvidence',
  'cleanupEvidence',
  'overallEvidenceDigest',
  'scenarios',
])
const BROWSER_EVIDENCE_KEYS = Object.freeze([
  'checkedAt',
  'evidenceDigest',
  'previewReleaseId',
  'previewUrl',
  'scenarioIds',
  'status',
])
const CLEANUP_EVIDENCE_KEYS = Object.freeze([
  'archivedPacketIds',
  'completedAt',
  'evidenceDigest',
  'status',
])
const POSITIVE_SCENARIO_KEYS = Object.freeze([
  'completedAt',
  'delivery',
  'download',
  'evidenceDigest',
  'finalArtifact',
  'fixture',
  'generatedPdf',
  'reviewedBy',
  'scenario',
  'signing',
  'source',
  'startedAt',
  'status',
])
const FIXTURE_KEYS = Object.freeze([
  'leadId',
  'listingId',
  'organisationId',
  'packetId',
  'packetVersionId',
  'transactionId',
])
const SOURCE_EVIDENCE_KEYS = Object.freeze([
  'canonicalGenerator',
  'factsDigest',
  'missingRequiredFields',
  'templateContentDigest',
  'templateId',
  'templateKey',
  'templateVersion',
])
const GENERATED_PDF_KEYS = Object.freeze([
  'bytes',
  'd1Verified',
  'd2Verified',
  'd3Persisted',
  'evidenceDigest',
  'mediaType',
  'path',
  'sha256',
])
const DELIVERY_KEYS = Object.freeze([
  'dispatchId',
  'evidenceDigest',
  'providerConfirmed',
  'providerMessageDigest',
  'targetRoles',
])
const SIGNING_KEYS = Object.freeze([
  'completedFieldCount',
  'completedSignerCount',
  'requiredFieldCount',
  'requiredSignerCount',
  'signatureEvidenceDigest',
])
const FINAL_ARTIFACT_KEYS = Object.freeze([
  'bytes',
  'evidenceDigest',
  'f2EventId',
  'f2EvidenceId',
  'mediaType',
  'path',
  'sha256',
  'storageBucket',
  'transactionDocumentId',
])
const DOWNLOAD_KEYS = Object.freeze([
  'bytes',
  'evidenceDigest',
  'mediaType',
  'sha256',
])
const NEGATIVE_SCENARIO_KEYS = Object.freeze([
  'assertions',
  'completedAt',
  'evidenceDigest',
  'reviewedBy',
  'scenario',
  'startedAt',
  'status',
])
const NEGATIVE_ASSERTION_KEYS = Object.freeze([
  'alternateTemplateRejected',
  'crossOrganisationRejected',
  'dispatchTargetMismatchRejected',
  'noArtifactCreated',
  'unauthorisedActorRejected',
])
const IDEMPOTENCY_SCENARIO_KEYS = Object.freeze([
  'assertions',
  'completedAt',
  'evidenceDigest',
  'fixture',
  'reviewedBy',
  'scenario',
  'startedAt',
  'status',
])
const IDEMPOTENCY_ASSERTION_KEYS = Object.freeze([
  'finaliseReusedCanonicalArtifact',
  'noDuplicateCompletion',
  'noDuplicateFinalVersion',
  'recoveryReconciled',
  'sendReusedCanonicalVersion',
])
const PHYSICAL_SCENARIO_KEYS = Object.freeze([
  'blockerCode',
  'capability',
  'completedAt',
  'evidenceDigest',
  'reviewedBy',
  'scenario',
  'serverAttested',
  'startedAt',
  'status',
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

function validProjectRef(value) {
  return /^[a-z0-9]{8,64}$/.test(text(value))
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))
}

function validOpaqueId(value) {
  return /^[A-Za-z0-9._:-]{1,160}$/.test(text(value))
}

function validStoragePath(value) {
  const candidate = text(value)
  return candidate.length > 0 && candidate.length <= 512 && !candidate.startsWith('/') && !/[\s@?#]/.test(candidate) && !candidate.includes('://')
}

function timeMs(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : NaN
}

function validIsoTime(value, nowMs) {
  const observed = timeMs(value)
  return Number.isFinite(observed) && observed <= nowMs + 5 * 60_000
}

function inEvidenceWindow(value, preparedAtMs, recordedAtMs) {
  const observed = timeMs(value)
  return Number.isFinite(observed) && Number.isFinite(preparedAtMs) && Number.isFinite(recordedAtMs) &&
    observed >= preparedAtMs && observed <= recordedAtMs && recordedAtMs - observed <= ROLLOUT_PHASE2_MAX_EVIDENCE_AGE_MS
}

function sameSet(left, right) {
  const normalized = (value) => [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].sort()
  return sameJson(normalized(left), normalized(right))
}

function add(blockers, code, detail, pending = false) {
  blockers.push(pending ? { code, detail, pending: true } : { code, detail })
}

function expectedStagingOrigin(projectRef) {
  return `https://${text(projectRef)}.supabase.co`
}

function pendingExecutionShape() {
  return {
    scenarios: [],
    browserEvidence: {
      status: 'not_run',
      previewUrl: null,
      previewReleaseId: null,
      scenarioIds: [],
      checkedAt: null,
      evidenceDigest: null,
    },
    cleanupEvidence: {
      status: 'not_run',
      archivedPacketIds: [],
      completedAt: null,
      evidenceDigest: null,
    },
    overallEvidenceDigest: null,
  }
}

function positiveScenarioType(scenario) {
  if (scenario === 'mandate_onboarding_individual') return { packetType: 'mandate', branch: 'individual', roles: ['seller'] }
  if (scenario === 'mandate_onboarding_company') return { packetType: 'mandate', branch: 'company', roles: ['seller'] }
  if (scenario === 'otp_cash') return { packetType: 'otp', branch: 'cash', roles: ['buyer', 'seller'] }
  if (scenario === 'otp_bond') return { packetType: 'otp', branch: 'bond', roles: ['buyer', 'seller'] }
  return null
}

function validatePositiveScenario(item, expected, preparedAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, POSITIVE_SCENARIO_KEYS)) {
    add(blockers, 'P2_POSITIVE_SCENARIO_SCHEMA_INVALID', `${expected.packetType} acceptance evidence has missing or unknown fields.`)
    return null
  }
  const fixture = record(item.fixture)
  const source = record(item.source)
  const generated = record(item.generatedPdf)
  const delivery = record(item.delivery)
  const signing = record(item.signing)
  const finalArtifact = record(item.finalArtifact)
  const download = record(item.download)
  if (item.status !== 'passed' || !text(item.reviewedBy) || !validDigest(item.evidenceDigest)) {
    add(blockers, 'P2_POSITIVE_SCENARIO_NOT_PASSED', `${item.scenario} must be an accountable passing acceptance result with a redacted evidence digest.`)
  }
  if (!inEvidenceWindow(item.startedAt, preparedAtMs, recordedAtMs) || !inEvidenceWindow(item.completedAt, preparedAtMs, recordedAtMs) || timeMs(item.completedAt) < timeMs(item.startedAt)) {
    add(blockers, 'P2_POSITIVE_SCENARIO_TIME_INVALID', `${item.scenario} must run after preparation, before recording, in order, and within 24 hours.`)
  }
  if (!exactKeys(fixture, FIXTURE_KEYS) || !validUuid(fixture.organisationId) || !validUuid(fixture.packetId) || !validUuid(fixture.packetVersionId) ||
    ![fixture.leadId, fixture.listingId, fixture.transactionId].some(validUuid) ||
    (expected.packetType === 'otp' && !validUuid(fixture.transactionId)) ||
    [fixture.leadId, fixture.listingId, fixture.transactionId].some((value) => value !== null && value !== undefined && !validUuid(value))) {
    add(blockers, 'P2_FIXTURE_BINDING_INVALID', `${item.scenario} must use redacted UUID fixture identifiers bound to one organisation, packet, version, and source context.`)
  }
  if (!exactKeys(source, SOURCE_EVIDENCE_KEYS) || source.canonicalGenerator !== 'generate-mandate' || !validDigest(source.factsDigest) ||
    !validUuid(source.templateId) || !text(source.templateKey) || !text(source.templateVersion) || !validDigest(source.templateContentDigest) || source.missingRequiredFields !== 0) {
    add(blockers, 'P2_TEMPLATE_OR_MERGE_EVIDENCE_INVALID', `${item.scenario} must bind a reviewed template, redacted facts digest, the canonical server renderer, and zero missing required fields.`)
  }
  if (!exactKeys(generated, GENERATED_PDF_KEYS) || generated.d1Verified !== true || generated.d2Verified !== true || generated.d3Persisted !== true ||
    generated.mediaType !== 'application/pdf' || !validStoragePath(generated.path) || !validDigest(generated.sha256) || !Number.isInteger(generated.bytes) || generated.bytes <= 0 || !validDigest(generated.evidenceDigest)) {
    add(blockers, 'P2_GENERATED_PDF_EVIDENCE_INVALID', `${item.scenario} must prove D1/D2/D3-certified native-PDF generation and persistence.`)
  }
  if (!exactKeys(delivery, DELIVERY_KEYS) || !validOpaqueId(delivery.dispatchId) || delivery.providerConfirmed !== true || !validDigest(delivery.providerMessageDigest) || !validDigest(delivery.evidenceDigest) || !sameSet(delivery.targetRoles, expected.roles)) {
    add(blockers, 'P2_TARGETED_DELIVERY_EVIDENCE_INVALID', `${item.scenario} must prove the exact role-targeted, provider-confirmed signing dispatch.`)
  }
  const signerCountsValid = [signing.requiredSignerCount, signing.completedSignerCount, signing.requiredFieldCount, signing.completedFieldCount].every(Number.isInteger) &&
    signing.requiredSignerCount > 0 && signing.requiredFieldCount > 0 && signing.completedSignerCount === signing.requiredSignerCount && signing.completedFieldCount === signing.requiredFieldCount
  if (!exactKeys(signing, SIGNING_KEYS) || !signerCountsValid || !validDigest(signing.signatureEvidenceDigest)) {
    add(blockers, 'P2_SIGNING_COMPLETION_EVIDENCE_INVALID', `${item.scenario} must prove completion of every required signer and signing field.`)
  }
  if (!exactKeys(finalArtifact, FINAL_ARTIFACT_KEYS) || !validOpaqueId(finalArtifact.f2EventId) || !validOpaqueId(finalArtifact.f2EvidenceId) || !validUuid(finalArtifact.transactionDocumentId) ||
    !text(finalArtifact.storageBucket) || !validStoragePath(finalArtifact.path) || finalArtifact.mediaType !== 'application/pdf' || !validDigest(finalArtifact.sha256) || !Number.isInteger(finalArtifact.bytes) || finalArtifact.bytes <= 0 || !validDigest(finalArtifact.evidenceDigest)) {
    add(blockers, 'P2_FINAL_ARTIFACT_EVIDENCE_INVALID', `${item.scenario} must prove F2 finalisation, database/storage linkage, and a final PDF.`)
  }
  if (!exactKeys(download, DOWNLOAD_KEYS) || download.mediaType !== 'application/pdf' || !validDigest(download.sha256) || !Number.isInteger(download.bytes) || download.bytes <= 0 || !validDigest(download.evidenceDigest) ||
    download.sha256 !== finalArtifact.sha256 || download.bytes !== finalArtifact.bytes) {
    add(blockers, 'P2_FINAL_DOWNLOAD_EVIDENCE_INVALID', `${item.scenario} must include an independently downloaded PDF matching the persisted final artifact.`)
  }
  return fixture
}

function validateNegativeScenario(item, preparedAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, NEGATIVE_SCENARIO_KEYS) || item.status !== 'passed' || !text(item.reviewedBy) || !validDigest(item.evidenceDigest)) {
    add(blockers, 'P2_NEGATIVE_SCENARIO_INVALID', 'The template/authority negative scenario must be a reviewed passing result with evidence.')
    return
  }
  const assertions = record(item.assertions)
  if (!exactKeys(assertions, NEGATIVE_ASSERTION_KEYS) || Object.values(assertions).some((value) => value !== true)) {
    add(blockers, 'P2_NEGATIVE_CONTROLS_INCOMPLETE', 'Alternate-template, cross-org, unauthorized-actor, target-mismatch, and no-artifact checks must all pass.')
  }
  if (!inEvidenceWindow(item.startedAt, preparedAtMs, recordedAtMs) || !inEvidenceWindow(item.completedAt, preparedAtMs, recordedAtMs) || timeMs(item.completedAt) < timeMs(item.startedAt)) {
    add(blockers, 'P2_NEGATIVE_SCENARIO_TIME_INVALID', 'Negative-control evidence must be within the acceptance window.')
  }
}

function validateIdempotencyScenario(item, positiveFixtures, preparedAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, IDEMPOTENCY_SCENARIO_KEYS) || item.status !== 'passed' || !text(item.reviewedBy) || !validDigest(item.evidenceDigest)) {
    add(blockers, 'P2_IDEMPOTENCY_SCENARIO_INVALID', 'The idempotency/recovery scenario must be a reviewed passing result with evidence.')
    return
  }
  const assertions = record(item.assertions)
  const fixture = record(item.fixture)
  if (!exactKeys(assertions, IDEMPOTENCY_ASSERTION_KEYS) || Object.values(assertions).some((value) => value !== true)) {
    add(blockers, 'P2_IDEMPOTENCY_CONTROLS_INCOMPLETE', 'Retry, recovery, version, final-artifact, and completion idempotency checks must all pass.')
  }
  if (!exactKeys(fixture, FIXTURE_KEYS) || !validUuid(fixture.packetId) || !validUuid(fixture.packetVersionId) ||
    !positiveFixtures.some((candidate) => candidate.packetId === fixture.packetId && candidate.packetVersionId === fixture.packetVersionId)) {
    add(blockers, 'P2_IDEMPOTENCY_FIXTURE_UNBOUND', 'Idempotency evidence must operate on one of the controlled positive fixtures, never an arbitrary packet.')
  }
  if (!inEvidenceWindow(item.startedAt, preparedAtMs, recordedAtMs) || !inEvidenceWindow(item.completedAt, preparedAtMs, recordedAtMs) || timeMs(item.completedAt) < timeMs(item.startedAt)) {
    add(blockers, 'P2_IDEMPOTENCY_SCENARIO_TIME_INVALID', 'Idempotency evidence must be within the acceptance window.')
  }
}

function validatePhysicalScenario(item, physicalSigningRequired, preparedAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, PHYSICAL_SCENARIO_KEYS) || item.capability !== 'server_attested_physical_completion' || !text(item.reviewedBy) || !validDigest(item.evidenceDigest)) {
    add(blockers, 'P2_PHYSICAL_SIGNATURE_EVIDENCE_INVALID', 'Physical-signature evidence must explicitly name the server-attested completion capability and a reviewer.')
    return
  }
  if (!inEvidenceWindow(item.startedAt, preparedAtMs, recordedAtMs) || !inEvidenceWindow(item.completedAt, preparedAtMs, recordedAtMs) || timeMs(item.completedAt) < timeMs(item.startedAt)) {
    add(blockers, 'P2_PHYSICAL_SIGNATURE_TIME_INVALID', 'Physical-signature capability evidence must be within the acceptance window.')
  }
  if (item.status === 'passed' && item.serverAttested === true && item.blockerCode === null) return
  if (item.status === 'unsupported' && item.serverAttested === false && item.blockerCode === 'P2_PHYSICAL_SIGNATURE_UNSUPPORTED') {
    if (physicalSigningRequired) add(blockers, 'P2_PHYSICAL_SIGNATURE_CAPABILITY_HOLD', 'Physical signature remains print/download-only; server-attested upload, party attestation, and immutable finalisation are not implemented.')
    return
  }
  add(blockers, 'P2_PHYSICAL_SIGNATURE_RESULT_INVALID', 'Physical signing must either pass with server attestation or record the exact unsupported capability hold.')
}

function validateRecordedExecution(candidate, preparedAtMs, recordedAtMs, blockers) {
  const execution = record(candidate.execution)
  const acceptance = record(candidate.acceptance)
  const safety = record(candidate.safety)
  if (!exactKeys(execution, EXECUTION_KEYS) || !Array.isArray(execution.scenarios) || !validDigest(execution.overallEvidenceDigest)) {
    add(blockers, 'P2_EXECUTION_SCHEMA_INVALID', 'Recorded acceptance needs the exact scenario, browser, cleanup, and overall-evidence structure.')
    return
  }
  if (execution.scenarios.length !== ROLLOUT_PHASE2_REQUIRED_SCENARIOS.length || !sameJson(execution.scenarios.map((item) => record(item).scenario), ROLLOUT_PHASE2_REQUIRED_SCENARIOS)) {
    add(blockers, 'P2_SCENARIO_COVERAGE_INVALID', 'Record every required staging-acceptance scenario exactly once and in the reviewed order.')
    return
  }
  const positiveFixtures = []
  for (const item of execution.scenarios) {
    const scenario = text(item?.scenario)
    const expected = positiveScenarioType(scenario)
    if (expected) {
      const fixture = validatePositiveScenario(record(item), expected, preparedAtMs, recordedAtMs, blockers)
      if (fixture) positiveFixtures.push(fixture)
    } else if (scenario === 'negative_template_and_authority') {
      validateNegativeScenario(record(item), preparedAtMs, recordedAtMs, blockers)
    }
  }
  const uniquePackets = new Set(positiveFixtures.map((fixture) => fixture.packetId))
  const uniqueVersions = new Set(positiveFixtures.map((fixture) => fixture.packetVersionId))
  if (positiveFixtures.length !== 4 || uniquePackets.size !== 4 || uniqueVersions.size !== 4) {
    add(blockers, 'P2_POSITIVE_FIXTURE_ISOLATION_INVALID', 'Individual mandate, company mandate, cash OTP, and bond OTP must use four distinct controlled packet versions.')
  }
  const idempotency = execution.scenarios.find((item) => item?.scenario === 'idempotency_and_recovery')
  if (idempotency) validateIdempotencyScenario(record(idempotency), positiveFixtures, preparedAtMs, recordedAtMs, blockers)
  const physical = execution.scenarios.find((item) => item?.scenario === 'physical_signature_capability')
  if (physical) validatePhysicalScenario(record(physical), safety.physicalSigningRequired === true, preparedAtMs, recordedAtMs, blockers)

  const browser = record(execution.browserEvidence)
  if (!exactKeys(browser, BROWSER_EVIDENCE_KEYS) || browser.status !== 'passed' || browser.previewUrl !== candidate.environment?.previewUrl ||
    browser.previewReleaseId !== candidate.environment?.previewReleaseId || !sameSet(browser.scenarioIds, ROLLOUT_PHASE2_REQUIRED_SCENARIOS.slice(0, 4)) ||
    !validDigest(browser.evidenceDigest) || !inEvidenceWindow(browser.checkedAt, preparedAtMs, recordedAtMs)) {
    add(blockers, 'P2_BROWSER_PREVIEW_EVIDENCE_INVALID', 'Browser evidence must run the four electronic lifecycles on the exact Phase 1-attested preview/release.')
  }
  const cleanup = record(execution.cleanupEvidence)
  const validCleanupStatus = ['archived', 'retained_for_evidence'].includes(cleanup.status)
  const archivedIds = Array.isArray(cleanup.archivedPacketIds) ? cleanup.archivedPacketIds : []
  if (!exactKeys(cleanup, CLEANUP_EVIDENCE_KEYS) || !validCleanupStatus || !archivedIds.every(validUuid) || new Set(archivedIds).size !== archivedIds.length ||
    (cleanup.status === 'archived' && !sameSet(archivedIds, [...uniquePackets])) ||
    (cleanup.status === 'retained_for_evidence' && archivedIds.length !== 0) || !validDigest(cleanup.evidenceDigest) || !inEvidenceWindow(cleanup.completedAt, preparedAtMs, recordedAtMs)) {
    add(blockers, 'P2_CLEANUP_EVIDENCE_INVALID', 'Fixture cleanup must explicitly archive all controlled packets or retain them deliberately for evidence, never leave an ambiguous state.')
  }
  if (!Number.isInteger(candidate.evidence?.fixtureWrites) || candidate.evidence.fixtureWrites < 0 || candidate.evidence.fixtureWrites > safety.fixtureWriteLimit) {
    add(blockers, 'P2_FIXTURE_WRITE_BOUND_EXCEEDED', 'Recorded fixture writes exceed the narrow controlled acceptance limit.')
  }
  if (!sameSet(acceptance.requiredScenarios, ROLLOUT_PHASE2_REQUIRED_SCENARIOS)) {
    add(blockers, 'P2_ACCEPTANCE_SCOPE_DRIFT', 'The receipt must retain the complete approved scenario matrix.')
  }
}

export function rolloutPhase2ManifestDigest(receipt) {
  const canonical = { ...record(receipt) }
  delete canonical.manifestDigest
  return sha256Digest(stableJson(canonical))
}

/**
 * Verifies local receipt continuity and the contents of a redacted evidence
 * packet. It deliberately never opens a browser, starts Vite, or contacts a
 * provider: live staging work belongs to the separately authorised operator
 * procedure, while this gate makes any claim about that work auditable.
 */
export function assessLegalDocumentRolloutPhase2({
  receipt,
  phase0Freeze,
  phase0Report,
  phase1Receipt,
  phase1Report,
  now = Date.now(),
} = {}) {
  const candidate = record(receipt)
  const environment = record(candidate.environment)
  const source = record(candidate.source)
  const safety = record(candidate.safety)
  const acceptance = record(candidate.acceptance)
  const evidence = record(candidate.evidence)
  const phase0 = record(phase0Freeze)
  const phase1 = record(phase1Receipt)
  const phase1Source = record(phase1.source)
  const phase1Preview = record(record(phase1.execution).previewEvidence)
  const phase0Evidence = record(record(phase0Report).evidence)
  const blockers = []

  if (!exactKeys(candidate, RECEIPT_KEYS)) add(blockers, 'P2_RECEIPT_SCHEMA_INVALID', 'The Phase 2 receipt contains missing or unknown top-level fields.')
  if (candidate.version !== 1 || candidate.phase !== 'ROLL_OUT_2' || candidate.contract !== ROLLOUT_PHASE2_CONTRACT) add(blockers, 'P2_RECEIPT_CONTRACT_INVALID', 'The receipt must use the current Phase 2 staging-acceptance contract.')
  if (!['pending_acceptance', 'acceptance_evidence_recorded'].includes(candidate.status)) add(blockers, 'P2_RECEIPT_STATUS_INVALID', 'The receipt status must be pending_acceptance or acceptance_evidence_recorded.')

  if (!exactKeys(environment, ENVIRONMENT_KEYS) || !validProjectRef(environment.productionProjectRef) || !validProjectRef(environment.stagingProjectRef) ||
    environment.productionProjectRef === environment.stagingProjectRef || environment.stagingOrigin !== expectedStagingOrigin(environment.stagingProjectRef) || !text(environment.previewUrl) || !validCommit(environment.previewReleaseId)) {
    add(blockers, 'P2_ENVIRONMENT_BINDING_INVALID', 'The receipt must name distinct production/staging refs, exact staging origin, and the attested preview/release.')
  }
  if (!exactKeys(source, SOURCE_KEYS) || !validDigest(source.phase0ManifestDigest) || !validDigest(source.phase1ReceiptManifestDigest) || !validCommit(source.commitSha) ||
    !validDigest(source.packageLockSha256) || !validDigest(source.phase1PreviewAttestationEvidenceDigest) || !validDigest(source.phase1PreviewArtifactTreeSha256)) {
    add(blockers, 'P2_SOURCE_SCHEMA_INVALID', 'The receipt must bind Phase 0, Phase 1, source/lockfile, and provider-attested preview facts.')
  }
  if (!exactKeys(safety, SAFETY_KEYS) || safety.pilotEnabled !== false || safety.scaleEnabled !== false || safety.creationPaused !== true ||
    safety.externalRecipientPolicy !== 'controlled_test_mailbox_only' || !/^[a-z0-9_]{8,80}$/.test(text(safety.fixtureNamespace)) ||
    !Number.isInteger(safety.fixtureWriteLimit) || safety.fixtureWriteLimit < 1 || safety.fixtureWriteLimit > 8 || !validDigest(safety.testMailboxDigest) || safety.physicalSigningRequired !== true) {
    add(blockers, 'P2_SAFETY_SCOPE_INVALID', 'Phase 2 must retain the disabled rollout posture, bounded fixture namespace/write limit, redacted test mailbox, and required physical-signature capability.')
  }
  if (!exactKeys(acceptance, ACCEPTANCE_KEYS) || acceptance.physicalSigningCapability !== 'server_attested_physical_completion' || !sameJson(acceptance.requiredScenarios, ROLLOUT_PHASE2_REQUIRED_SCENARIOS)) {
    add(blockers, 'P2_ACCEPTANCE_SCOPE_INVALID', 'Phase 2 must retain the exact full scenario matrix and server-attested physical-signature requirement.')
  }
  if (!exactKeys(evidence, EVIDENCE_KEYS) || !text(evidence.preparedBy) || !text(evidence.changeReference) || !validIsoTime(evidence.preparedAt, now)) {
    add(blockers, 'P2_PREPARATION_ACCOUNTABILITY_MISSING', 'preparedBy, preparedAt, and changeReference are required.')
  }

  if (record(phase0Report).status !== 'FROZEN') add(blockers, 'P2_PHASE0_NOT_FROZEN', 'A current clean Phase 0 FROZEN report is required before staging acceptance.')
  if (record(phase1Report).status !== 'STAGING_EVIDENCE_RECORDED') add(blockers, 'P2_PHASE1_NOT_RECORDED', 'Phase 1 must have a current evidence-recorded staging receipt before acceptance can start.')
  if (phase1.status !== 'staging_evidence_recorded' || !validDigest(phase1.manifestDigest) || phase1.manifestDigest !== source.phase1ReceiptManifestDigest) {
    add(blockers, 'P2_PHASE1_RECEIPT_PARENT_DRIFT', 'The receipt must bind the exact evidence-recorded Phase 1 staging receipt.')
  }
  if (source.phase0ManifestDigest !== phase0.manifestDigest || source.phase0ManifestDigest !== phase1Source.phase0ManifestDigest || source.commitSha !== phase1Source.commitSha || source.packageLockSha256 !== phase1Source.packageLockSha256) {
    add(blockers, 'P2_PHASE0_OR_SOURCE_DRIFT', 'Phase 2 must bind the same frozen Phase 0 source and lockfile as Phase 1.')
  }
  if (environment.productionProjectRef !== phase1.environment?.productionProjectRef || environment.stagingProjectRef !== phase1.environment?.stagingProjectRef || environment.stagingOrigin !== phase1.environment?.stagingOrigin ||
    environment.previewUrl !== phase1Preview.previewUrl || environment.previewReleaseId !== phase1Preview.previewReleaseId || source.phase1PreviewAttestationEvidenceDigest !== phase1Preview.attestationEvidenceDigest || source.phase1PreviewArtifactTreeSha256 !== phase1Preview.previewArtifactTreeSha256) {
    add(blockers, 'P2_PHASE1_ENVIRONMENT_OR_PREVIEW_DRIFT', 'Acceptance must use the exact Phase 1 staging target and provider-attested generated preview.')
  }
  const phase1RecordedAt = timeMs(phase1.evidence?.evidenceRecordedAt)
  const preparedAtMs = timeMs(evidence.preparedAt)
  if (!Number.isFinite(phase1RecordedAt) || !Number.isFinite(preparedAtMs) || preparedAtMs < phase1RecordedAt || now - phase1RecordedAt > ROLLOUT_PHASE2_MAX_EVIDENCE_AGE_MS) {
    add(blockers, 'P2_PHASE1_EVIDENCE_STALE_OR_ORDER_INVALID', 'Phase 2 must begin after, and within 24 hours of, the evidence-recorded Phase 1 release.')
  }
  const phase1ReceiptChangeCount = phase0Evidence.phase1ReceiptChangeCount
  const phase2ReceiptChangeCount = phase0Evidence.phase2ReceiptChangeCount
  if (phase1ReceiptChangeCount !== 2 || !Number.isInteger(phase2ReceiptChangeCount) || phase2ReceiptChangeCount < 0 || phase2ReceiptChangeCount > 1 ||
    (candidate.status === 'pending_acceptance' && phase2ReceiptChangeCount !== 0) ||
    (candidate.status === 'acceptance_evidence_recorded' && phase2ReceiptChangeCount !== 1)) {
    add(blockers, 'P2_RECEIPT_HISTORY_INVALID', 'Phase 1 must have exactly two receipt commits; Phase 2 is planned off-tree and recorded once, without rewrite.')
  }

  if (candidate.status === 'pending_acceptance') {
    if (!sameJson(candidate.execution, pendingExecutionShape()) || evidence.fixtureWrites !== 0 || evidence.acceptanceRecordedBy !== null || evidence.reviewedBy !== null || evidence.acceptanceRecordedAt !== null) {
      add(blockers, 'P2_PENDING_STATE_INVALID', 'A pending acceptance receipt must contain no fixture, browser, or recorded evidence.')
    }
    add(blockers, 'P2_STAGING_ACCEPTANCE_PENDING', 'The controlled staging acceptance procedure and evidence capture have not been recorded.', true)
  } else {
    const recordedAtMs = timeMs(evidence.acceptanceRecordedAt)
    if (!text(evidence.acceptanceRecordedBy) || !text(evidence.reviewedBy) || !validIsoTime(evidence.acceptanceRecordedAt, now) || !Number.isFinite(recordedAtMs) || !Number.isFinite(preparedAtMs) || recordedAtMs < preparedAtMs || now - recordedAtMs > ROLLOUT_PHASE2_MAX_EVIDENCE_AGE_MS) {
      add(blockers, 'P2_RECORDING_ACCOUNTABILITY_OR_TIME_INVALID', 'Recorded acceptance requires current accountable review after preparation.')
    }
    validateRecordedExecution(candidate, preparedAtMs, recordedAtMs, blockers)
  }
  if (!validDigest(candidate.manifestDigest) || candidate.manifestDigest !== rolloutPhase2ManifestDigest(candidate)) add(blockers, 'P2_RECEIPT_DIGEST_INVALID', 'The receipt digest does not match its contents.')

  const hardBlockers = blockers.filter((blocker) => !blocker.pending)
  const status = hardBlockers.length ? 'HOLD' : candidate.status === 'acceptance_evidence_recorded' ? 'STAGING_ACCEPTANCE_RECORDED' : 'STAGING_ACCEPTANCE_PLANNED'
  return {
    phase: 'ROLL_OUT_2',
    contract: ROLLOUT_PHASE2_CONTRACT,
    scope: 'local_receipt_validation',
    status,
    blockerCount: hardBlockers.length,
    pendingCount: blockers.length - hardBlockers.length,
    blockers,
    evidence: {
      sourceCommitSha: text(source.commitSha) || null,
      phase1ReceiptManifestDigest: text(source.phase1ReceiptManifestDigest) || null,
      stagingProjectRef: text(environment.stagingProjectRef) || null,
      previewUrl: text(environment.previewUrl) || null,
      physicalSigningRequired: safety.physicalSigningRequired === true,
      receiptChangeCount: Number.isInteger(phase2ReceiptChangeCount) ? phase2ReceiptChangeCount : null,
    },
    doesNotVerify: [...ROLLOUT_PHASE2_DOES_NOT_VERIFY],
    doesNotAuthorize: [...ROLLOUT_PHASE2_DOES_NOT_AUTHORIZE],
    mutatedData: false,
  }
}

export function createPendingLegalDocumentRolloutPhase2Receipt({
  phase1Receipt,
  preparedBy,
  changeReference,
  fixtureNamespace,
  fixtureWriteLimit = 4,
  testMailboxDigest,
  preparedAt = new Date().toISOString(),
} = {}) {
  const phase1 = record(phase1Receipt)
  const phase1Source = record(phase1.source)
  const phase1Preview = record(record(phase1.execution).previewEvidence)
  const receipt = {
    version: 1,
    phase: 'ROLL_OUT_2',
    contract: ROLLOUT_PHASE2_CONTRACT,
    status: 'pending_acceptance',
    environment: {
      productionProjectRef: phase1.environment?.productionProjectRef ?? null,
      stagingProjectRef: phase1.environment?.stagingProjectRef ?? null,
      stagingOrigin: phase1.environment?.stagingOrigin ?? null,
      previewUrl: phase1Preview.previewUrl ?? null,
      previewReleaseId: phase1Preview.previewReleaseId ?? null,
    },
    source: {
      phase0ManifestDigest: phase1Source.phase0ManifestDigest ?? null,
      phase1ReceiptManifestDigest: phase1.manifestDigest ?? null,
      commitSha: phase1Source.commitSha ?? null,
      packageLockSha256: phase1Source.packageLockSha256 ?? null,
      phase1PreviewAttestationEvidenceDigest: phase1Preview.attestationEvidenceDigest ?? null,
      phase1PreviewArtifactTreeSha256: phase1Preview.previewArtifactTreeSha256 ?? null,
    },
    safety: {
      pilotEnabled: false,
      scaleEnabled: false,
      creationPaused: true,
      externalRecipientPolicy: 'controlled_test_mailbox_only',
      fixtureNamespace: fixtureNamespace || null,
      fixtureWriteLimit,
      testMailboxDigest: testMailboxDigest || null,
      physicalSigningRequired: true,
    },
    acceptance: {
      requiredScenarios: [...ROLLOUT_PHASE2_REQUIRED_SCENARIOS],
      physicalSigningCapability: 'server_attested_physical_completion',
    },
    execution: pendingExecutionShape(),
    evidence: {
      preparedBy: preparedBy || null,
      preparedAt,
      acceptanceRecordedBy: null,
      reviewedBy: null,
      acceptanceRecordedAt: null,
      changeReference: changeReference || null,
      fixtureWrites: 0,
    },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase2ManifestDigest(receipt)
  return stableValue(receipt)
}
