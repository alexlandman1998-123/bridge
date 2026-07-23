import { ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS } from './legal-document-rollout-phase1-policy.mjs'
import {
  sha256Digest,
  stableJson,
  stableValue,
} from './legal-document-rollout-phase1-artifacts.mjs'

export const ROLLOUT_PHASE3_CONTRACT = 'legal-document-production-preflight-v1'
export const ROLLOUT_PHASE3_MAX_EVIDENCE_AGE_MS = ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS

// Phase 3 records a dark-launch preflight only. The receipt can attest that
// the frozen release is present in production while its runtime remains
// disabled; it can never turn on a cohort or send a customer document.
export const ROLLOUT_PHASE3_DOES_NOT_AUTHORIZE = Object.freeze([
  'pilot_or_cohort_activation',
  'scale_activation',
  'customer_delivery_or_signing_invites',
  'document_generation_for_customers',
  'template_or_release-source_changes',
  'rollback_execution',
])

export const ROLLOUT_PHASE3_DOES_NOT_VERIFY = Object.freeze([
  'future_provider_or_runtime_drift',
  'a_later_pilot_canary_or_customer_lifecycle',
  'legal_approval_currency_after_the_bound_review',
  'unredacted_credentials_or_provider_logs',
])

const RECEIPT_KEYS = Object.freeze([
  'contract', 'environment', 'evidence', 'execution', 'manifestDigest', 'phase', 'safety', 'source', 'status', 'version',
])
const ENVIRONMENT_KEYS = Object.freeze([
  'productionOrigin', 'productionProjectRef', 'productionUrl', 'stagingOrigin', 'stagingProjectRef',
])
const SOURCE_KEYS = Object.freeze([
  'applicationManifestSha256', 'commitSha', 'edgeFunctionDeployUnitSha256', 'migrationSetDigest', 'packageLockSha256', 'phase0ManifestDigest', 'phase1ReceiptManifestDigest', 'phase2ReceiptCommitSha', 'phase2ReceiptManifestDigest',
])
const SAFETY_KEYS = Object.freeze([
  'creationPaused', 'customerDeliveryEnabled', 'generationEnabled', 'organisationIdsSentinel', 'pilotEnabled', 'scaleEnabled',
])
const EVIDENCE_KEYS = Object.freeze([
  'changeReference', 'preflightRecordedAt', 'preflightRecordedBy', 'preparedAt', 'preparedBy', 'reviewedBy',
])
const EXECUTION_KEYS = Object.freeze([
  'operationsReadiness', 'overallEvidenceDigest', 'productionDatabase', 'productionDeployment', 'productionFunctions', 'runtimeHold', 'templateRelease',
])
const PRODUCTION_DEPLOYMENT_KEYS = Object.freeze([
  'artifactManifestSha256', 'artifactTreeSha256', 'attestedAt', 'deploymentId', 'deploymentMetadataEvidenceDigest', 'indexHtmlSha256', 'productionSupabaseOrigin', 'productionUrl', 'provider', 'releaseMarkerEvidenceDigest', 'sourceCommitSha', 'state', 'status', 'target',
])
const PRODUCTION_DATABASE_KEYS = Object.freeze([
  'baselineLedgerEvidenceDigest', 'finalLedgerEvidenceDigest', 'migrationEvidence', 'reviewedAt', 'reviewedBy', 'status',
])
const MIGRATION_EVIDENCE_KEYS = Object.freeze([
  'applied', 'behaviorChecks', 'catalogChecks', 'ledgerEvidenceDigest', 'migrationSha256', 'noResidue', 'observedAt', 'predecessorLedgerEvidenceDigest', 'reviewedBy', 'targetProjectRef', 'version',
])
const PRODUCTION_FUNCTIONS_KEYS = Object.freeze([
  'configurationReviews', 'edgeFunctionEvidence', 'reviewedAt', 'reviewedBy', 'status',
])
const FUNCTION_EVIDENCE_KEYS = Object.freeze([
  'deployUnitSha256', 'deploymentReference', 'name', 'observedAt', 'providerRevision', 'sourceTreeSha256', 'targetProjectRef',
])
const FUNCTION_CONFIGURATION_KEYS = Object.freeze([
  'configurationEvidenceDigest', 'name', 'reviewedAt', 'reviewedBy', 'targetProjectRef',
])
const RUNTIME_HOLD_KEYS = Object.freeze([
  'creationPaused', 'customerDeliveryEnabled', 'evidenceDigest', 'generationEnabled', 'organisationIdsSentinel', 'pilotEnabled', 'reviewedAt', 'reviewedBy', 'scaleEnabled', 'status',
])
const TEMPLATE_RELEASE_KEYS = Object.freeze([
  'boundB1ManifestDigest', 'evidenceDigest', 'reviewedAt', 'reviewedBy', 'routableTemplateCount', 'status', 'templateRouteSetDigest',
])
const OPERATIONS_READINESS_KEYS = Object.freeze([
  'evidenceDigest', 'incidentRunbookDigest', 'monitoringEvidenceDigest', 'operationsOwner', 'reviewedAt', 'reviewedBy', 'rollbackDryRunEvidenceDigest', 'rollbackPlanEvidenceDigest', 'status',
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

function validOpaqueId(value) {
  return /^[A-Za-z0-9._:-]{1,180}$/.test(text(value))
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
    observed >= preparedAtMs && observed <= recordedAtMs && recordedAtMs - observed <= ROLLOUT_PHASE3_MAX_EVIDENCE_AGE_MS
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

function add(blockers, code, detail, pending = false) {
  blockers.push(pending ? { code, detail, pending: true } : { code, detail })
}

function pendingExecutionShape() {
  return {
    productionDeployment: {
      status: 'not_run',
      provider: null,
      deploymentId: null,
      target: null,
      state: null,
      productionUrl: null,
      productionSupabaseOrigin: null,
      sourceCommitSha: null,
      deploymentMetadataEvidenceDigest: null,
      releaseMarkerEvidenceDigest: null,
      artifactManifestSha256: null,
      indexHtmlSha256: null,
      artifactTreeSha256: null,
      attestedAt: null,
    },
    productionDatabase: {
      status: 'not_run',
      baselineLedgerEvidenceDigest: null,
      finalLedgerEvidenceDigest: null,
      migrationEvidence: [],
      reviewedAt: null,
      reviewedBy: null,
    },
    productionFunctions: {
      status: 'not_run',
      edgeFunctionEvidence: [],
      configurationReviews: [],
      reviewedAt: null,
      reviewedBy: null,
    },
    runtimeHold: {
      status: 'not_run',
      pilotEnabled: false,
      organisationIdsSentinel: '__none__',
      creationPaused: true,
      scaleEnabled: false,
      generationEnabled: false,
      customerDeliveryEnabled: false,
      evidenceDigest: null,
      reviewedAt: null,
      reviewedBy: null,
    },
    templateRelease: {
      status: 'not_run',
      boundB1ManifestDigest: null,
      templateRouteSetDigest: null,
      routableTemplateCount: null,
      evidenceDigest: null,
      reviewedAt: null,
      reviewedBy: null,
    },
    operationsReadiness: {
      status: 'not_run',
      operationsOwner: null,
      monitoringEvidenceDigest: null,
      incidentRunbookDigest: null,
      rollbackPlanEvidenceDigest: null,
      rollbackDryRunEvidenceDigest: null,
      evidenceDigest: null,
      reviewedAt: null,
      reviewedBy: null,
    },
    overallEvidenceDigest: null,
  }
}

function validateDeployment(item, candidate, preparedAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, PRODUCTION_DEPLOYMENT_KEYS) || item.status !== 'attested') {
    add(blockers, 'P3_PRODUCTION_DEPLOYMENT_SCHEMA_INVALID', 'Production deployment evidence must have the exact attested schema.')
    return
  }
  if (item.provider !== 'vercel' || item.target !== 'production' || item.state !== 'READY' || !validOpaqueId(item.deploymentId) ||
    item.productionUrl !== candidate.environment?.productionUrl || item.productionSupabaseOrigin !== candidate.environment?.productionOrigin ||
    item.sourceCommitSha !== candidate.source?.commitSha) {
    add(blockers, 'P3_PRODUCTION_DEPLOYMENT_BINDING_INVALID', 'The Vercel production deployment must be READY and bind the frozen source, exact production URL, and production Supabase origin.')
  }
  for (const field of ['deploymentMetadataEvidenceDigest', 'releaseMarkerEvidenceDigest', 'artifactManifestSha256', 'indexHtmlSha256', 'artifactTreeSha256']) {
    if (!validDigest(item[field])) add(blockers, 'P3_PRODUCTION_DEPLOYMENT_DIGEST_INVALID', `${field} must be a SHA-256 evidence digest.`)
  }
  if (!inEvidenceWindow(item.attestedAt, preparedAtMs, recordedAtMs)) {
    add(blockers, 'P3_PRODUCTION_DEPLOYMENT_TIME_INVALID', 'Production deployment attestation must occur after preflight preparation and before preflight recording.')
  }
}

function validateDatabase(item, phase1, candidate, preparedAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, PRODUCTION_DATABASE_KEYS) || item.status !== 'attested') {
    add(blockers, 'P3_PRODUCTION_DATABASE_SCHEMA_INVALID', 'Production database evidence must have the exact attested schema.')
    return
  }
  const expected = Array.isArray(phase1.artifacts?.migrations) ? phase1.artifacts.migrations : []
  const migrations = Array.isArray(item.migrationEvidence) ? item.migrationEvidence : []
  if (!validDigest(item.baselineLedgerEvidenceDigest) || !validDigest(item.finalLedgerEvidenceDigest) || !text(item.reviewedBy) || !inEvidenceWindow(item.reviewedAt, preparedAtMs, recordedAtMs)) {
    add(blockers, 'P3_PRODUCTION_DATABASE_ACCOUNTABILITY_INVALID', 'Production database evidence requires bounded ledger digests and accountable current review.')
  }
  if (!expected.length || migrations.length !== expected.length) {
    add(blockers, 'P3_PRODUCTION_MIGRATION_COVERAGE_INVALID', 'Record one ordered production observation for every Phase 1 legal migration.')
    return
  }
  let predecessor = item.baselineLedgerEvidenceDigest
  let finalLedger = null
  for (let index = 0; index < expected.length; index += 1) {
    const expectedMigration = record(expected[index])
    const observed = record(migrations[index])
    if (!exactKeys(observed, MIGRATION_EVIDENCE_KEYS)) {
      add(blockers, 'P3_PRODUCTION_MIGRATION_SCHEMA_INVALID', `Production migration evidence ${index + 1} has missing or unknown fields.`)
      continue
    }
    if (observed.version !== expectedMigration.version || observed.migrationSha256 !== expectedMigration.sha256 || observed.targetProjectRef !== candidate.environment?.productionProjectRef ||
      observed.applied !== true || observed.catalogChecks !== 'pass' || observed.behaviorChecks !== 'pass' || observed.noResidue !== 'pass' || !text(observed.reviewedBy)) {
      add(blockers, 'P3_PRODUCTION_MIGRATION_BINDING_INVALID', `Production migration evidence ${expectedMigration.version} does not prove the exact expected migration.`)
    }
    if (observed.predecessorLedgerEvidenceDigest !== predecessor || !validDigest(observed.predecessorLedgerEvidenceDigest) || !validDigest(observed.ledgerEvidenceDigest) || observed.ledgerEvidenceDigest === predecessor) {
      add(blockers, 'P3_PRODUCTION_MIGRATION_LEDGER_INVALID', `Production migration ${expectedMigration.version} must continue the reviewed ledger chain.`)
    }
    if (!inEvidenceWindow(observed.observedAt, preparedAtMs, recordedAtMs)) {
      add(blockers, 'P3_PRODUCTION_MIGRATION_TIME_INVALID', `Production migration ${expectedMigration.version} must be observed inside the preflight evidence window.`)
    }
    predecessor = observed.ledgerEvidenceDigest
    finalLedger = observed.ledgerEvidenceDigest
  }
  if (finalLedger !== item.finalLedgerEvidenceDigest) {
    add(blockers, 'P3_PRODUCTION_MIGRATION_FINAL_LEDGER_INVALID', 'The database final-ledger digest must equal the last ordered migration ledger digest.')
  }
}

function validateFunctions(item, phase1, candidate, preparedAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, PRODUCTION_FUNCTIONS_KEYS) || item.status !== 'attested') {
    add(blockers, 'P3_PRODUCTION_FUNCTION_SCHEMA_INVALID', 'Production function evidence must have the exact attested schema.')
    return
  }
  const expectedFunctions = Array.isArray(phase1.artifacts?.edgeFunctions) ? phase1.artifacts.edgeFunctions : []
  const functions = Array.isArray(item.edgeFunctionEvidence) ? item.edgeFunctionEvidence : []
  const expectedReviews = Array.isArray(phase1.artifacts?.releaseOrder?.constrainedFunctions) ? phase1.artifacts.releaseOrder.constrainedFunctions : []
  const reviews = Array.isArray(item.configurationReviews) ? item.configurationReviews : []
  if (!text(item.reviewedBy) || !inEvidenceWindow(item.reviewedAt, preparedAtMs, recordedAtMs)) {
    add(blockers, 'P3_PRODUCTION_FUNCTION_ACCOUNTABILITY_INVALID', 'Production function evidence requires an accountable review inside the preflight window.')
  }
  if (!expectedFunctions.length || functions.length !== expectedFunctions.length) {
    add(blockers, 'P3_PRODUCTION_FUNCTION_COVERAGE_INVALID', 'Record one production observation for every exact Phase 1 Edge Function.')
  }
  for (let index = 0; index < Math.min(expectedFunctions.length, functions.length); index += 1) {
    const expected = record(expectedFunctions[index])
    const observed = record(functions[index])
    if (!exactKeys(observed, FUNCTION_EVIDENCE_KEYS) || observed.name !== expected.name || observed.sourceTreeSha256 !== expected.sourceTreeSha256 ||
      observed.deployUnitSha256 !== candidate.source?.edgeFunctionDeployUnitSha256 || observed.targetProjectRef !== candidate.environment?.productionProjectRef ||
      !text(observed.providerRevision) || !text(observed.deploymentReference) || !inEvidenceWindow(observed.observedAt, preparedAtMs, recordedAtMs)) {
      add(blockers, 'P3_PRODUCTION_FUNCTION_BINDING_INVALID', `Production function evidence ${index + 1} does not bind the reviewed deploy unit to production.`)
    }
  }
  if (reviews.length !== expectedReviews.length) {
    add(blockers, 'P3_PRODUCTION_FUNCTION_CONFIGURATION_COVERAGE_INVALID', 'Record the exact constrained-function configuration reviews for production.')
  }
  for (let index = 0; index < Math.min(expectedReviews.length, reviews.length); index += 1) {
    const observed = record(reviews[index])
    if (!exactKeys(observed, FUNCTION_CONFIGURATION_KEYS) || observed.name !== expectedReviews[index] || observed.targetProjectRef !== candidate.environment?.productionProjectRef ||
      !validDigest(observed.configurationEvidenceDigest) || !text(observed.reviewedBy) || !inEvidenceWindow(observed.reviewedAt, preparedAtMs, recordedAtMs)) {
      add(blockers, 'P3_PRODUCTION_FUNCTION_CONFIGURATION_INVALID', `Production configuration review ${index + 1} is incomplete or targets the wrong environment.`)
    }
  }
}

function validateRuntimeHold(item, preparedAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, RUNTIME_HOLD_KEYS) || item.status !== 'attested' || item.pilotEnabled !== false || item.scaleEnabled !== false ||
    item.creationPaused !== true || item.organisationIdsSentinel !== '__none__' || item.generationEnabled !== false || item.customerDeliveryEnabled !== false ||
    !validDigest(item.evidenceDigest) || !text(item.reviewedBy) || !inEvidenceWindow(item.reviewedAt, preparedAtMs, recordedAtMs)) {
    add(blockers, 'P3_RUNTIME_HOLD_INVALID', 'Production dark-launch evidence must prove disabled pilot, no allowlist, paused creation, no generation, and no customer delivery.')
  }
}

function validateTemplateRelease(item, phase0, preparedAtMs, recordedAtMs, blockers) {
  const boundB1ManifestDigest = phase0.templateReview?.boundB1ManifestDigest
  if (!exactKeys(item, TEMPLATE_RELEASE_KEYS) || item.status !== 'attested' || item.boundB1ManifestDigest !== boundB1ManifestDigest ||
    !validDigest(item.templateRouteSetDigest) || !validDigest(item.evidenceDigest) || !Number.isInteger(item.routableTemplateCount) || item.routableTemplateCount < 1 ||
    !text(item.reviewedBy) || !inEvidenceWindow(item.reviewedAt, preparedAtMs, recordedAtMs)) {
    add(blockers, 'P3_TEMPLATE_RELEASE_EVIDENCE_INVALID', 'Production template evidence must bind the Phase 0 B1 review and every routable template set to a current reviewed digest.')
  }
}

function validateOperations(item, preparedAtMs, recordedAtMs, blockers) {
  if (!exactKeys(item, OPERATIONS_READINESS_KEYS) || item.status !== 'attested' || !text(item.operationsOwner) || !text(item.reviewedBy) ||
    !inEvidenceWindow(item.reviewedAt, preparedAtMs, recordedAtMs) ||
    ['monitoringEvidenceDigest', 'incidentRunbookDigest', 'rollbackPlanEvidenceDigest', 'rollbackDryRunEvidenceDigest', 'evidenceDigest'].some((field) => !validDigest(item[field]))) {
    add(blockers, 'P3_OPERATIONS_READINESS_INVALID', 'Production preflight needs monitored ownership, incident handling, and a reviewed disabled-runtime rollback dry run.')
  }
}

function validateRecordedExecution(candidate, phase0, phase1, preparedAtMs, recordedAtMs, blockers) {
  const execution = record(candidate.execution)
  if (!exactKeys(execution, EXECUTION_KEYS) || !validDigest(execution.overallEvidenceDigest)) {
    add(blockers, 'P3_EXECUTION_SCHEMA_INVALID', 'Recorded production preflight needs the exact deployment, database, function, hold, template, operations, and overall-evidence structure.')
    return
  }
  validateDeployment(record(execution.productionDeployment), candidate, preparedAtMs, recordedAtMs, blockers)
  validateDatabase(record(execution.productionDatabase), phase1, candidate, preparedAtMs, recordedAtMs, blockers)
  validateFunctions(record(execution.productionFunctions), phase1, candidate, preparedAtMs, recordedAtMs, blockers)
  validateRuntimeHold(record(execution.runtimeHold), preparedAtMs, recordedAtMs, blockers)
  validateTemplateRelease(record(execution.templateRelease), phase0, preparedAtMs, recordedAtMs, blockers)
  validateOperations(record(execution.operationsReadiness), preparedAtMs, recordedAtMs, blockers)
}

export function rolloutPhase3ManifestDigest(receipt) {
  const canonical = { ...record(receipt) }
  delete canonical.manifestDigest
  return sha256Digest(stableJson(canonical))
}

/**
 * Validates an immutable, redacted production dark-launch receipt. It never
 * deploys, queries a provider, activates a cohort, or creates a document.
 * Remote observations belong to an explicitly authorised operator procedure;
 * this policy makes their resulting evidence fail closed and auditable.
 */
export function assessLegalDocumentRolloutPhase3({
  receipt,
  phase0Freeze,
  phase0Report,
  phase1Receipt,
  phase1Report,
  phase2Receipt,
  phase2Report,
  phase2History,
  now = Date.now(),
} = {}) {
  const candidate = record(receipt)
  const environment = record(candidate.environment)
  const source = record(candidate.source)
  const safety = record(candidate.safety)
  const evidence = record(candidate.evidence)
  const phase0 = record(phase0Freeze)
  const phase1 = record(phase1Receipt)
  const phase2 = record(phase2Receipt)
  const history = record(phase2History)
  const phase0Evidence = record(record(phase0Report).evidence)
  const blockers = []

  if (!exactKeys(candidate, RECEIPT_KEYS)) add(blockers, 'P3_RECEIPT_SCHEMA_INVALID', 'The Phase 3 receipt contains missing or unknown top-level fields.')
  if (candidate.version !== 1 || candidate.phase !== 'ROLL_OUT_3' || candidate.contract !== ROLLOUT_PHASE3_CONTRACT) {
    add(blockers, 'P3_RECEIPT_CONTRACT_INVALID', 'The receipt must use the current Phase 3 production-preflight contract.')
  }
  if (!['pending_preflight', 'production_preflight_recorded'].includes(candidate.status)) {
    add(blockers, 'P3_RECEIPT_STATUS_INVALID', 'The receipt status must be pending_preflight or production_preflight_recorded.')
  }
  if (!exactKeys(environment, ENVIRONMENT_KEYS) || !validProjectRef(environment.productionProjectRef) || !validProjectRef(environment.stagingProjectRef) ||
    environment.productionProjectRef === environment.stagingProjectRef || environment.productionOrigin !== expectedOrigin(environment.productionProjectRef) ||
    environment.stagingOrigin !== expectedOrigin(environment.stagingProjectRef) || !validHttpsOrigin(environment.productionUrl) || environment.productionUrl === environment.stagingOrigin) {
    add(blockers, 'P3_ENVIRONMENT_BINDING_INVALID', 'The receipt must name distinct production/staging refs, the exact production origin, and an HTTPS production web origin.')
  }
  if (!exactKeys(source, SOURCE_KEYS) || !validCommit(source.commitSha) || !validDigest(source.packageLockSha256) || !validDigest(source.phase0ManifestDigest) ||
    !validDigest(source.phase1ReceiptManifestDigest) || !validDigest(source.phase2ReceiptManifestDigest) || !validCommit(source.phase2ReceiptCommitSha) ||
    !validDigest(source.migrationSetDigest) || !validDigest(source.edgeFunctionDeployUnitSha256) || !validDigest(source.applicationManifestSha256)) {
    add(blockers, 'P3_SOURCE_SCHEMA_INVALID', 'The receipt must bind frozen source, all parent receipts, immutable Phase 2 commit, and production release artifacts.')
  }
  if (!exactKeys(safety, SAFETY_KEYS) || safety.pilotEnabled !== false || safety.scaleEnabled !== false || safety.creationPaused !== true ||
    safety.organisationIdsSentinel !== '__none__' || safety.generationEnabled !== false || safety.customerDeliveryEnabled !== false) {
    add(blockers, 'P3_SAFETY_SCOPE_INVALID', 'Phase 3 must retain a fully disabled dark-launch runtime with no customer generation or delivery.')
  }
  if (!exactKeys(evidence, EVIDENCE_KEYS) || !text(evidence.preparedBy) || !text(evidence.changeReference) || !validIsoTime(evidence.preparedAt, now)) {
    add(blockers, 'P3_PREPARATION_ACCOUNTABILITY_MISSING', 'preparedBy, preparedAt, and changeReference are required.')
  }

  if (record(phase0Report).status !== 'FROZEN') add(blockers, 'P3_PHASE0_NOT_FROZEN', 'A current clean Phase 0 FROZEN report is required before production preflight.')
  if (record(phase1Report).status !== 'STAGING_EVIDENCE_RECORDED') add(blockers, 'P3_PHASE1_NOT_RECORDED', 'Phase 1 must have current evidence-recorded staging evidence before production preflight.')
  if (record(phase2Report).status !== 'STAGING_ACCEPTANCE_RECORDED') add(blockers, 'P3_PHASE2_NOT_ACCEPTED', 'Phase 2 must have a current recorded full-lifecycle acceptance, including physical-signature capability.')
  if (phase1.status !== 'staging_evidence_recorded' || phase2.status !== 'acceptance_evidence_recorded') {
    add(blockers, 'P3_PARENT_RECEIPT_STATUS_INVALID', 'Phase 1 and Phase 2 parent receipts must be evidence-recorded.')
  }
  if (source.phase0ManifestDigest !== phase0.manifestDigest || source.phase1ReceiptManifestDigest !== phase1.manifestDigest || source.phase2ReceiptManifestDigest !== phase2.manifestDigest ||
    source.commitSha !== phase1.source?.commitSha || source.packageLockSha256 !== phase1.source?.packageLockSha256 ||
    source.migrationSetDigest !== phase1.artifacts?.migrationSetDigest || source.edgeFunctionDeployUnitSha256 !== phase1.artifacts?.edgeFunctionDeployUnitSha256 ||
    source.applicationManifestSha256 !== phase1.artifacts?.applicationManifestSha256 || phase2.source?.phase1ReceiptManifestDigest !== phase1.manifestDigest ||
    phase2.source?.commitSha !== source.commitSha || phase2.source?.packageLockSha256 !== source.packageLockSha256) {
    add(blockers, 'P3_PARENT_OR_SOURCE_DRIFT', 'Production preflight must bind the exact frozen source and Phase 0/1/2 receipt lineage.')
  }
  if (environment.productionProjectRef !== phase0.productionProjectRef || environment.productionProjectRef !== phase1.environment?.productionProjectRef ||
    environment.productionProjectRef !== phase2.environment?.productionProjectRef || environment.stagingProjectRef !== phase1.environment?.stagingProjectRef ||
    environment.stagingProjectRef !== phase2.environment?.stagingProjectRef || environment.stagingOrigin !== phase1.environment?.stagingOrigin || environment.stagingOrigin !== phase2.environment?.stagingOrigin) {
    add(blockers, 'P3_PARENT_ENVIRONMENT_DRIFT', 'Production/staging identities must exactly match the Phase 0, 1, and 2 bindings.')
  }
  if (history.receiptStatus !== 'acceptance_evidence_recorded' || history.receiptManifestDigest !== source.phase2ReceiptManifestDigest ||
    history.receiptCommitSha !== source.phase2ReceiptCommitSha || history.phase1ReceiptManifestDigest !== source.phase1ReceiptManifestDigest) {
    add(blockers, 'P3_PHASE2_COMMITTED_HISTORY_INVALID', 'Phase 3 must bind the committed Phase 2 acceptance receipt, not only a working-tree copy.')
  }

  const phase1RecordedAtMs = timeMs(phase1.evidence?.evidenceRecordedAt)
  const phase2RecordedAtMs = timeMs(phase2.evidence?.acceptanceRecordedAt)
  const preparedAtMs = timeMs(evidence.preparedAt)
  if (!Number.isFinite(phase1RecordedAtMs) || !Number.isFinite(phase2RecordedAtMs) || !Number.isFinite(preparedAtMs) ||
    preparedAtMs < phase2RecordedAtMs || phase2RecordedAtMs < phase1RecordedAtMs || now - phase1RecordedAtMs > ROLLOUT_PHASE3_MAX_EVIDENCE_AGE_MS || now - phase2RecordedAtMs > ROLLOUT_PHASE3_MAX_EVIDENCE_AGE_MS) {
    add(blockers, 'P3_PARENT_EVIDENCE_STALE_OR_ORDER_INVALID', 'Phase 3 must begin after Phase 2 and within the 24-hour evidence window of both parent stages.')
  }

  const phase1ReceiptChangeCount = phase0Evidence.phase1ReceiptChangeCount
  const phase2ReceiptChangeCount = phase0Evidence.phase2ReceiptChangeCount
  const phase3ReceiptChangeCount = phase0Evidence.phase3ReceiptChangeCount
  if (phase1ReceiptChangeCount !== 2 || phase2ReceiptChangeCount !== 1 || !Number.isInteger(phase3ReceiptChangeCount) || phase3ReceiptChangeCount < 0 || phase3ReceiptChangeCount > 1 ||
    (candidate.status === 'pending_preflight' && phase3ReceiptChangeCount !== 0) ||
    (candidate.status === 'production_preflight_recorded' && phase3ReceiptChangeCount !== 1)) {
    add(blockers, 'P3_RECEIPT_HISTORY_INVALID', 'Phase 3 is planned off-tree and recorded once only after the immutable Phase 0→1→2 receipt chain.')
  }

  if (candidate.status === 'pending_preflight') {
    if (!sameJson(candidate.execution, pendingExecutionShape()) || evidence.preflightRecordedAt !== null || evidence.preflightRecordedBy !== null || evidence.reviewedBy !== null) {
      add(blockers, 'P3_PENDING_STATE_INVALID', 'A pending production-preflight receipt may not claim deployment, operational, or recorded evidence.')
    }
    add(blockers, 'P3_PRODUCTION_PREFLIGHT_PENDING', 'The separately authorised production dark-launch observations have not been recorded.', true)
  } else {
    const recordedAtMs = timeMs(evidence.preflightRecordedAt)
    if (!text(evidence.preflightRecordedBy) || !text(evidence.reviewedBy) || !validIsoTime(evidence.preflightRecordedAt, now) || !Number.isFinite(recordedAtMs) || !Number.isFinite(preparedAtMs) ||
      recordedAtMs < preparedAtMs || now - recordedAtMs > ROLLOUT_PHASE3_MAX_EVIDENCE_AGE_MS) {
      add(blockers, 'P3_RECORDING_ACCOUNTABILITY_OR_TIME_INVALID', 'Recorded preflight requires a current accountable review after preparation.')
    }
    validateRecordedExecution(candidate, phase0, phase1, preparedAtMs, recordedAtMs, blockers)
  }
  if (!validDigest(candidate.manifestDigest) || candidate.manifestDigest !== rolloutPhase3ManifestDigest(candidate)) {
    add(blockers, 'P3_RECEIPT_DIGEST_INVALID', 'The receipt digest does not match its contents.')
  }

  const hardBlockers = blockers.filter((blocker) => !blocker.pending)
  const status = hardBlockers.length ? 'HOLD' : candidate.status === 'production_preflight_recorded' ? 'PRODUCTION_PREFLIGHT_RECORDED' : 'PRODUCTION_PREFLIGHT_PLANNED'
  return {
    phase: 'ROLL_OUT_3',
    contract: ROLLOUT_PHASE3_CONTRACT,
    scope: 'local_receipt_validation',
    status,
    blockerCount: hardBlockers.length,
    pendingCount: blockers.length - hardBlockers.length,
    blockers,
    evidence: {
      sourceCommitSha: text(source.commitSha) || null,
      phase2ReceiptManifestDigest: text(source.phase2ReceiptManifestDigest) || null,
      phase2ReceiptCommitSha: text(source.phase2ReceiptCommitSha) || null,
      productionProjectRef: text(environment.productionProjectRef) || null,
      productionUrl: text(environment.productionUrl) || null,
      receiptChangeCount: Number.isInteger(phase3ReceiptChangeCount) ? phase3ReceiptChangeCount : null,
      runtimeDisabled: safety.pilotEnabled === false && safety.generationEnabled === false && safety.customerDeliveryEnabled === false,
    },
    doesNotVerify: [...ROLLOUT_PHASE3_DOES_NOT_VERIFY],
    doesNotAuthorize: [...ROLLOUT_PHASE3_DOES_NOT_AUTHORIZE],
    mutatedData: false,
  }
}

export function createPendingLegalDocumentRolloutPhase3Receipt({
  phase0Freeze,
  phase1Receipt,
  phase2Receipt,
  phase2History,
  productionProjectRef,
  productionOrigin,
  productionUrl,
  preparedBy,
  changeReference,
  preparedAt = new Date().toISOString(),
} = {}) {
  const phase0 = record(phase0Freeze)
  const phase1 = record(phase1Receipt)
  const phase2 = record(phase2Receipt)
  const history = record(phase2History)
  const receipt = {
    version: 1,
    phase: 'ROLL_OUT_3',
    contract: ROLLOUT_PHASE3_CONTRACT,
    status: 'pending_preflight',
    environment: {
      productionProjectRef: productionProjectRef || null,
      productionOrigin: productionOrigin || null,
      productionUrl: productionUrl || null,
      stagingProjectRef: phase1.environment?.stagingProjectRef ?? null,
      stagingOrigin: phase1.environment?.stagingOrigin ?? null,
    },
    source: {
      phase0ManifestDigest: phase0.manifestDigest ?? null,
      phase1ReceiptManifestDigest: phase1.manifestDigest ?? null,
      phase2ReceiptManifestDigest: phase2.manifestDigest ?? null,
      phase2ReceiptCommitSha: history.receiptCommitSha ?? null,
      commitSha: phase1.source?.commitSha ?? null,
      packageLockSha256: phase1.source?.packageLockSha256 ?? null,
      migrationSetDigest: phase1.artifacts?.migrationSetDigest ?? null,
      edgeFunctionDeployUnitSha256: phase1.artifacts?.edgeFunctionDeployUnitSha256 ?? null,
      applicationManifestSha256: phase1.artifacts?.applicationManifestSha256 ?? null,
    },
    safety: {
      pilotEnabled: false,
      scaleEnabled: false,
      creationPaused: true,
      organisationIdsSentinel: '__none__',
      generationEnabled: false,
      customerDeliveryEnabled: false,
    },
    execution: pendingExecutionShape(),
    evidence: {
      preparedBy: preparedBy || null,
      preparedAt,
      preflightRecordedBy: null,
      reviewedBy: null,
      preflightRecordedAt: null,
      changeReference: changeReference || null,
    },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase3ManifestDigest(receipt)
  return stableValue(receipt)
}
