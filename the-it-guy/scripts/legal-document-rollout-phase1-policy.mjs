import {
  PHASE1_DATABASE_RUNNER,
  PHASE1_DATABASE_TARGET_CONTRACT,
  PHASE1_SUPABASE_CLI_VERSION,
  edgeFunctionDeployUnitDigest,
  sha256Digest,
  stableJson,
  stableValue,
} from './legal-document-rollout-phase1-artifacts.mjs'
import {
  KNOWN_PRODUCTION_HOSTS,
  LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION,
} from './legal-document-rollout-phase1-preview-attestation.mjs'

export const ROLLOUT_PHASE1_CONTRACT = 'legal-document-staging-release-v2'
export const ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000

export const ROLLOUT_PHASE1_DOES_NOT_VERIFY = Object.freeze([
  'live_supabase_or_vercel_state',
  'unredacted_deployment_logs_or_credentials',
  'future_runtime_or_template_drift',
  'production_deployment_or_pilot_activation',
  'legal_approval_currency',
])

export const ROLLOUT_PHASE1_DOES_NOT_AUTHORIZE = Object.freeze([
  'database_migration_apply_or_repair',
  'edge_function_deployment',
  'vercel_deployment_or_promotion',
  'document_generation_or_signing',
  'email_delivery_or_watchdog_execution',
  'pilot_or_scale_activation',
])

const RECEIPT_KEYS = Object.freeze([
  'artifacts', 'contract', 'environment', 'evidence', 'execution', 'manifestDigest', 'phase', 'safety', 'source', 'status', 'version',
])
const ARTIFACT_KEYS = Object.freeze([
  'applicationManifestCoverageDigest', 'applicationManifestLinkedProjectRef', 'applicationManifestSha256', 'configTomlSha256', 'databaseRunnerCliVersion', 'databaseRunnerProtectedProjectRef', 'databaseRunnerSourceSha256', 'databaseRunnerTargetContract', 'edgeFunctionDeployUnitSha256', 'edgeFunctionSetDigest', 'edgeFunctions', 'frontend', 'migrationSetDigest', 'migrations', 'releaseOrder', 'sharedRuntimeFileCount', 'sharedRuntimeRequiredFileSha256', 'sharedRuntimeSha256',
])
const FRONTEND_ARTIFACT_KEYS = Object.freeze([
  'buildCommand', 'packageJsonSha256', 'packageLockSha256', 'root', 'sourceFileCount', 'sourceTreeSha256', 'vercelBuildCommand', 'vercelConfigSha256', 'viteConfigSha256',
])
const EXECUTION_KEYS = Object.freeze([
  'databaseRunner', 'databaseRunnerCliVersion', 'edgeFunctionEvidence', 'functionConfigurationReviews', 'migrationEvidence', 'postDeployContractEvidenceDigest', 'preflightLedgerEvidenceDigest', 'previewEvidence', 'recoveryEvidenceReference',
])
export const ROLLOUT_PHASE1_PREVIEW_EVIDENCE_FIELDS = Object.freeze([
  'attestationEvidenceDigest', 'attestationVersion', 'attestedAt', 'deploymentId', 'deploymentMetadataEvidenceDigest', 'deploymentSourceCommitSha', 'previewArtifactTreeSha256', 'previewIndexHtmlSha256', 'previewReleaseId', 'previewReleaseManifestSha256', 'previewUrl', 'provider', 'publicSupabaseOrigin',
])
export const ROLLOUT_PHASE1_MIGRATION_EVIDENCE_FIELDS = Object.freeze([
  'appliedAt', 'applyEvidenceDigest', 'behaviorChecks', 'catalogChecks', 'ledgerEvidenceDigest', 'ledgerRecordedAt', 'migrationSha256', 'predecessorLedgerEvidenceDigest', 'reviewedBy', 'rollbackOrNoResidue', 'sqlApplied', 'targetProjectRef', 'version',
])
export const ROLLOUT_PHASE1_EDGE_FUNCTION_EVIDENCE_FIELDS = Object.freeze([
  'deployUnitSha256', 'deployedAt', 'deploymentReference', 'name', 'providerRevision', 'sourceTreeSha256', 'targetProjectRef',
])
export const ROLLOUT_PHASE1_FUNCTION_CONFIGURATION_REVIEW_FIELDS = Object.freeze([
  'configurationEvidenceDigest', 'name', 'reviewedAt', 'reviewedBy', 'targetProjectRef',
])
const PREVIEW_EVIDENCE_KEYS = ROLLOUT_PHASE1_PREVIEW_EVIDENCE_FIELDS
const MIGRATION_EVIDENCE_KEYS = ROLLOUT_PHASE1_MIGRATION_EVIDENCE_FIELDS
const EDGE_FUNCTION_EVIDENCE_KEYS = ROLLOUT_PHASE1_EDGE_FUNCTION_EVIDENCE_FIELDS
const FUNCTION_CONFIGURATION_REVIEW_KEYS = ROLLOUT_PHASE1_FUNCTION_CONFIGURATION_REVIEW_FIELDS
const EVIDENCE_KEYS = Object.freeze([
  'changeReference', 'evidenceRecordedAt', 'evidenceRecordedBy', 'fixtureWrites', 'preparedAt', 'preparedBy', 'reviewedBy',
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

function hasExactKeys(value, expected) {
  return sameJson(Object.keys(record(value)).sort(), [...expected].sort())
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

function timeMs(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : NaN
}

function validIsoTime(value, nowMs) {
  const parsed = timeMs(value)
  return Number.isFinite(parsed) && parsed <= nowMs + 5 * 60_000
}

function inRecordedEvidenceWindow(value, preparedAtMs, recordedAtMs) {
  const observedAtMs = timeMs(value)
  return Number.isFinite(observedAtMs) &&
    Number.isFinite(preparedAtMs) &&
    Number.isFinite(recordedAtMs) &&
    observedAtMs >= preparedAtMs &&
    observedAtMs <= recordedAtMs &&
    recordedAtMs - observedAtMs <= ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS
}

function add(blockers, code, detail, pending = false) {
  blockers.push(pending ? { code, detail, pending: true } : { code, detail })
}

function validStagingOrigin(value, stagingProjectRef) {
  return text(value) === `https://${text(stagingProjectRef)}.supabase.co`
}

function isVercelPreviewOrigin(value) {
  const raw = text(value)
  try {
    const parsed = new URL(raw)
    if (raw !== parsed.origin || parsed.protocol !== 'https:' || parsed.username || parsed.password) return false
    const hostname = parsed.hostname.toLowerCase()
    if (KNOWN_PRODUCTION_HOSTS.includes(hostname)) return false
    const labels = hostname.split('.')
    const deploymentLabel = labels.length === 3 && labels[1] === 'vercel' && labels[2] === 'app' ? labels[0] : ''
    return Boolean(deploymentLabel && deploymentLabel.includes('-') && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(deploymentLabel))
  } catch {
    return false
  }
}

function pendingExecutionShape() {
  return {
    databaseRunner: PHASE1_DATABASE_RUNNER,
    databaseRunnerCliVersion: PHASE1_SUPABASE_CLI_VERSION,
    recoveryEvidenceReference: null,
    preflightLedgerEvidenceDigest: null,
    migrationEvidence: [],
    edgeFunctionEvidence: [],
    functionConfigurationReviews: [],
    previewEvidence: {
      provider: null,
      attestationVersion: null,
      attestationEvidenceDigest: null,
      deploymentId: null,
      deploymentSourceCommitSha: null,
      deploymentMetadataEvidenceDigest: null,
      previewUrl: null,
      previewReleaseId: null,
      previewReleaseManifestSha256: null,
      previewIndexHtmlSha256: null,
      previewArtifactTreeSha256: null,
      publicSupabaseOrigin: null,
      attestedAt: null,
    },
    postDeployContractEvidenceDigest: null,
  }
}

export function rolloutPhase1ManifestDigest(receipt) {
  const canonical = { ...record(receipt) }
  delete canonical.manifestDigest
  return sha256Digest(stableJson(canonical))
}

function compareExpectedArtifacts(candidateArtifacts, expectedArtifacts, blockers) {
  const expected = record(expectedArtifacts)
  if (!sameJson(candidateArtifacts.migrations, expected.migrations)) add(blockers, 'P1_MIGRATION_SOURCE_DRIFT', 'The numbered legal migration set or its hashes differ from the release source.')
  if (candidateArtifacts.migrationSetDigest !== expected.migrationSetDigest) add(blockers, 'P1_MIGRATION_SET_DIGEST_DRIFT', 'The migration-set digest differs from the release source.')
  if (candidateArtifacts.applicationManifestSha256 !== expected.applicationManifestSha256) add(blockers, 'P1_APPLICATION_MANIFEST_DRIFT', 'The reviewed migration-application manifest differs from the release source.')
  if (candidateArtifacts.applicationManifestCoverageDigest !== expected.applicationManifestCoverage?.digest) add(blockers, 'P1_APPLICATION_MANIFEST_COVERAGE_DRIFT', 'The migration-manifest coverage result differs from the release source.')
  if (candidateArtifacts.applicationManifestLinkedProjectRef !== expected.applicationManifestLinkedProjectRef) add(blockers, 'P1_APPLICATION_MANIFEST_IDENTITY_DRIFT', 'The application manifest project identity differs from the release source.')
  if (!sameJson(candidateArtifacts.edgeFunctions, expected.edgeFunctions) || candidateArtifacts.edgeFunctionSetDigest !== expected.edgeFunctionSetDigest) add(blockers, 'P1_EDGE_FUNCTION_SOURCE_DRIFT', 'The Edge Function release unit differs from the release source.')
  if (candidateArtifacts.edgeFunctionDeployUnitSha256 !== expected.edgeFunctionDeployUnitSha256) add(blockers, 'P1_EDGE_FUNCTION_DEPLOY_UNIT_DRIFT', 'The full Edge Function deploy-unit hash differs from the release source.')
  for (const field of [
    'sharedRuntimeSha256', 'sharedRuntimeFileCount', 'sharedRuntimeRequiredFileSha256', 'configTomlSha256', 'databaseRunnerSourceSha256', 'databaseRunnerProtectedProjectRef', 'databaseRunnerTargetContract', 'databaseRunnerCliVersion',
  ]) {
    if (candidateArtifacts[field] !== expected[field]) add(blockers, 'P1_SHARED_RUNTIME_OR_CONFIG_DRIFT', `${field} differs from the release source.`)
  }
  if (!sameJson(candidateArtifacts.frontend, expected.frontend)) add(blockers, 'P1_FRONTEND_SOURCE_DRIFT', 'The Vercel/Vite frontend release inputs differ from the release source.')
  if (!sameJson(candidateArtifacts.releaseOrder, expected.releaseOrder)) add(blockers, 'P1_DEPLOYMENT_ORDER_DRIFT', 'The protected function/migration deployment order differs from the release source.')
}

function validateArtifactSafety(expectedArtifacts, environment, blockers) {
  const expected = record(expectedArtifacts)
  const coverage = record(expected.applicationManifestCoverage)
  if (coverage.status !== 'complete') {
    const missing = Array.isArray(coverage.missing) ? coverage.missing.map((row) => row.version).join(', ') : ''
    add(blockers, 'P1_LEGAL_MIGRATION_MANIFEST_COVERAGE_MISSING', `The existing migration ledger has not classified every legal rollout migration${missing ? `: ${missing}` : ''}.`)
  }
  if (!validProjectRef(expected.databaseRunnerProtectedProjectRef)) add(blockers, 'P1_DATABASE_RUNNER_PRODUCTION_GUARD_MISSING', 'The reviewed staging runner must contain one explicit production project guard.')
  if (validProjectRef(environment.productionProjectRef) && expected.databaseRunnerProtectedProjectRef !== environment.productionProjectRef) add(blockers, 'P1_DATABASE_RUNNER_PRODUCTION_GUARD_DRIFT', 'The staging runner protects a different project than the Phase 0 production identity.')
  if (expected.databaseRunnerTargetContract !== PHASE1_DATABASE_TARGET_CONTRACT) add(blockers, 'P1_DATABASE_RUNNER_TARGET_GUARD_INVALID', 'The staging runner must parse and exactly bind a direct Supabase database host before any mutation is considered.')
  if (expected.databaseRunnerCliVersion !== PHASE1_SUPABASE_CLI_VERSION) add(blockers, 'P1_DATABASE_RUNNER_CLI_VERSION_INVALID', `The staging runner must pin supabase@${PHASE1_SUPABASE_CLI_VERSION}.`)
  if (!validProjectRef(expected.applicationManifestLinkedProjectRef) || expected.applicationManifestLinkedProjectRef !== expected.databaseRunnerProtectedProjectRef || expected.applicationManifestLinkedProjectRef !== environment.productionProjectRef) {
    add(blockers, 'P1_APPLICATION_MANIFEST_PRODUCTION_IDENTITY_DRIFT', 'The reviewed application manifest, staging runner, and Phase 0 must name the same production project.')
  }
  const frontend = record(expected.frontend)
  if (frontend.buildCommand !== 'npm run build:guarded' || frontend.vercelBuildCommand !== frontend.buildCommand) {
    add(blockers, 'P1_VERCEL_BUILD_COMMAND_MISMATCH', 'The Vercel deployment must use the guarded build command bound in the receipt.')
  }
  const computedDeployUnitSha256 = edgeFunctionDeployUnitDigest(expected)
  if (!validDigest(expected.edgeFunctionDeployUnitSha256) || expected.edgeFunctionDeployUnitSha256 !== computedDeployUnitSha256) {
    add(blockers, 'P1_EDGE_FUNCTION_DEPLOY_UNIT_INVALID', 'The Edge Function deploy-unit hash must cover every function tree, the complete shared runtime, and supabase/config.toml.')
  }
}

function validateMigrationEvidence(execution, expectedArtifacts, environment, preparedAtMs, recordedAtMs, blockers) {
  const expectedMigrations = Array.isArray(expectedArtifacts?.migrations) ? expectedArtifacts.migrations : []
  const evidence = Array.isArray(execution.migrationEvidence) ? execution.migrationEvidence : []
  if (evidence.length !== expectedMigrations.length) {
    add(blockers, 'P1_MIGRATION_EVIDENCE_COVERAGE_INVALID', `Record exactly ${expectedMigrations.length} ordered per-migration evidence records.`)
    return
  }
  let previousLedgerDigest = execution.preflightLedgerEvidenceDigest
  let previousLedgerAt = preparedAtMs
  const ledgerEvidenceDigests = new Set([previousLedgerDigest])
  for (let index = 0; index < expectedMigrations.length; index += 1) {
    const expected = record(expectedMigrations[index])
    const item = record(evidence[index])
    if (!hasExactKeys(item, MIGRATION_EVIDENCE_KEYS)) {
      add(blockers, 'P1_MIGRATION_EVIDENCE_SCHEMA_INVALID', `Migration evidence at position ${index + 1} has missing or unknown fields.`)
      continue
    }
    if (item.version !== expected.version || item.migrationSha256 !== expected.sha256 || item.targetProjectRef !== environment.stagingProjectRef) {
      add(blockers, 'P1_MIGRATION_EVIDENCE_BINDING_INVALID', `Migration evidence at position ${index + 1} does not bind the expected version, source hash, and staging target.`)
    }
    if (item.predecessorLedgerEvidenceDigest !== previousLedgerDigest) {
      add(blockers, 'P1_MIGRATION_EVIDENCE_ORDER_INVALID', `Migration ${expected.version} does not bind the immediately preceding ledger evidence.`)
    }
    if (!validDigest(item.applyEvidenceDigest) || !validDigest(item.predecessorLedgerEvidenceDigest) || !validDigest(item.ledgerEvidenceDigest)) add(blockers, 'P1_MIGRATION_EVIDENCE_DIGEST_INVALID', `Migration ${expected.version} requires valid apply, predecessor-ledger, and ledger evidence digests.`)
    if (item.ledgerEvidenceDigest === item.predecessorLedgerEvidenceDigest || ledgerEvidenceDigests.has(item.ledgerEvidenceDigest)) {
      add(blockers, 'P1_MIGRATION_LEDGER_EVIDENCE_REUSED', `Migration ${expected.version} must record a new ledger evidence digest, never reuse its predecessor or an earlier chain entry.`)
    }
    if (item.sqlApplied !== true || item.catalogChecks !== 'pass' || item.behaviorChecks !== 'pass' || item.rollbackOrNoResidue !== 'pass' || !text(item.reviewedBy)) {
      add(blockers, 'P1_MIGRATION_EVIDENCE_CHECK_FAILED', `Migration ${expected.version} does not record a reviewed passing controlled execution.`)
    }
    const appliedAtMs = timeMs(item.appliedAt)
    const ledgerAtMs = timeMs(item.ledgerRecordedAt)
    if (!inRecordedEvidenceWindow(item.appliedAt, preparedAtMs, recordedAtMs) || !inRecordedEvidenceWindow(item.ledgerRecordedAt, preparedAtMs, recordedAtMs) || !Number.isFinite(appliedAtMs) || !Number.isFinite(ledgerAtMs) || appliedAtMs < previousLedgerAt || ledgerAtMs < appliedAtMs) {
      add(blockers, 'P1_MIGRATION_EVIDENCE_TIME_ORDER_INVALID', `Migration ${expected.version} timestamps must be after preparation, in order, no later than evidence recording, and within 24 hours of that recording.`)
    }
    if (validDigest(item.ledgerEvidenceDigest)) ledgerEvidenceDigests.add(item.ledgerEvidenceDigest)
    previousLedgerDigest = item.ledgerEvidenceDigest
    previousLedgerAt = Number.isFinite(ledgerAtMs) ? ledgerAtMs : previousLedgerAt
  }
}

function validateEdgeFunctionEvidence(execution, expectedArtifacts, environment, preparedAtMs, recordedAtMs, blockers) {
  const expectedFunctions = Array.isArray(expectedArtifacts?.edgeFunctions) ? expectedArtifacts.edgeFunctions : []
  const expectedDeployUnitSha256 = expectedArtifacts?.edgeFunctionDeployUnitSha256
  const evidence = Array.isArray(execution.edgeFunctionEvidence) ? execution.edgeFunctionEvidence : []
  if (evidence.length !== expectedFunctions.length) {
    add(blockers, 'P1_EDGE_FUNCTION_EVIDENCE_COVERAGE_INVALID', `Record exactly ${expectedFunctions.length} ordered Edge Function deployment records.`)
    return null
  }
  let finaliserDeployedAtMs = NaN
  for (let index = 0; index < expectedFunctions.length; index += 1) {
    const expected = record(expectedFunctions[index])
    const item = record(evidence[index])
    if (!hasExactKeys(item, EDGE_FUNCTION_EVIDENCE_KEYS)) {
      add(blockers, 'P1_EDGE_FUNCTION_EVIDENCE_SCHEMA_INVALID', `Edge Function evidence at position ${index + 1} has missing or unknown fields.`)
      continue
    }
    if (item.name !== expected.name || item.targetProjectRef !== environment.stagingProjectRef || item.sourceTreeSha256 !== expected.sourceTreeSha256) {
      add(blockers, 'P1_EDGE_FUNCTION_EVIDENCE_BINDING_INVALID', `Edge Function evidence at position ${index + 1} does not bind the expected function source to staging.`)
    }
    if (item.deployUnitSha256 !== expectedDeployUnitSha256) {
      add(blockers, 'P1_EDGE_FUNCTION_DEPLOY_UNIT_DRIFT', `Edge Function ${expected.name} does not bind the complete reviewed deploy unit.`)
    }
    if (!text(item.providerRevision) || !text(item.deploymentReference)) {
      add(blockers, 'P1_EDGE_FUNCTION_PROVIDER_REFERENCE_INVALID', `Edge Function ${expected.name} requires a nonblank provider revision and deployment reference.`)
    }
    const deployedAtMs = timeMs(item.deployedAt)
    if (!inRecordedEvidenceWindow(item.deployedAt, preparedAtMs, recordedAtMs) || !Number.isFinite(deployedAtMs)) {
      add(blockers, 'P1_EDGE_FUNCTION_EVIDENCE_TIME_INVALID', `Edge Function ${expected.name} must have a deployment time after preparation, no later than evidence recording, and within 24 hours of that recording.`)
    }
    if (expected.name === 'generate-final-signed-document') finaliserDeployedAtMs = deployedAtMs
  }
  return finaliserDeployedAtMs
}

function validateFunctionConfigurationReviews(execution, expectedArtifacts, environment, preparedAtMs, recordedAtMs, blockers) {
  const expectedNames = Array.isArray(expectedArtifacts?.releaseOrder?.constrainedFunctions) ? expectedArtifacts.releaseOrder.constrainedFunctions : []
  const reviews = Array.isArray(execution.functionConfigurationReviews) ? execution.functionConfigurationReviews : []
  if (reviews.length !== expectedNames.length) {
    add(blockers, 'P1_FUNCTION_CONFIGURATION_REVIEW_COVERAGE_INVALID', `Record exactly ${expectedNames.length} configuration reviews for functions without config stanzas.`)
    return
  }
  for (let index = 0; index < expectedNames.length; index += 1) {
    const item = record(reviews[index])
    if (!hasExactKeys(item, FUNCTION_CONFIGURATION_REVIEW_KEYS)) {
      add(blockers, 'P1_FUNCTION_CONFIGURATION_REVIEW_SCHEMA_INVALID', `Function configuration review at position ${index + 1} has missing or unknown fields.`)
      continue
    }
    if (item.name !== expectedNames[index] || item.targetProjectRef !== environment.stagingProjectRef || !validDigest(item.configurationEvidenceDigest) || !text(item.reviewedBy)) {
      add(blockers, 'P1_FUNCTION_CONFIGURATION_REVIEW_INVALID', `Function configuration review for ${expectedNames[index]} is incomplete or points outside staging.`)
    }
    if (!inRecordedEvidenceWindow(item.reviewedAt, preparedAtMs, recordedAtMs)) {
      add(blockers, 'P1_FUNCTION_CONFIGURATION_REVIEW_TIME_INVALID', `Function configuration review for ${expectedNames[index]} must occur after preparation, no later than evidence recording, and within 24 hours of that recording.`)
    }
  }
}

function validatePreviewEvidence(execution, source, environment, preparedAtMs, recordedAtMs, blockers) {
  const preview = record(execution.previewEvidence)
  if (!hasExactKeys(preview, PREVIEW_EVIDENCE_KEYS)) {
    add(blockers, 'P1_PREVIEW_EVIDENCE_SCHEMA_INVALID', 'Preview evidence contains missing or unknown fields.')
    return
  }
  if (preview.provider !== 'vercel' || preview.attestationVersion !== LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION || !validDigest(preview.attestationEvidenceDigest) || !/^dpl_[A-Za-z0-9_-]{6,}$/.test(text(preview.deploymentId)) || !validDigest(preview.deploymentMetadataEvidenceDigest)) {
    add(blockers, 'P1_PREVIEW_ATTESTATION_INVALID', 'Preview evidence must bind a reviewed Vercel preview attestation and deployment metadata digest.')
  }
  if (!isVercelPreviewOrigin(preview.previewUrl) || preview.previewReleaseId !== source.commitSha || preview.deploymentSourceCommitSha !== source.commitSha || preview.publicSupabaseOrigin !== environment.stagingOrigin) {
    add(blockers, 'P1_PREVIEW_ENVIRONMENT_BINDING_INVALID', 'The preview must be a generated Vercel preview for the frozen source and exact staging Supabase origin.')
  }
  for (const field of ['previewReleaseManifestSha256', 'previewIndexHtmlSha256', 'previewArtifactTreeSha256']) {
    if (!validDigest(preview[field])) add(blockers, 'P1_PREVIEW_ARTIFACT_DIGEST_INVALID', `${field} must be a SHA-256 digest from the preview attestation.`)
  }
  const attestedAtMs = timeMs(preview.attestedAt)
  if (!inRecordedEvidenceWindow(preview.attestedAt, preparedAtMs, recordedAtMs) || !Number.isFinite(attestedAtMs)) {
    add(blockers, 'P1_PREVIEW_EVIDENCE_TIME_INVALID', 'Preview attestation must occur after preparation, no later than evidence recording, and within 24 hours of that recording.')
  }
}

function validateRecordedExecution({ execution, expectedArtifacts, source, environment, preparedAtMs, recordedAtMs, blockers }) {
  if (execution.databaseRunner !== PHASE1_DATABASE_RUNNER || execution.databaseRunnerCliVersion !== PHASE1_SUPABASE_CLI_VERSION) {
    add(blockers, 'P1_DATABASE_RUNNER_INVALID', `Use only ${PHASE1_DATABASE_RUNNER} with pinned supabase@${PHASE1_SUPABASE_CLI_VERSION}.`)
  }
  if (!text(execution.recoveryEvidenceReference) || !validDigest(execution.preflightLedgerEvidenceDigest) || !validDigest(execution.postDeployContractEvidenceDigest)) {
    add(blockers, 'P1_STAGING_EXECUTION_EVIDENCE_MISSING', 'Recovery, baseline-ledger, and post-deploy contract evidence are required.')
  }
  validateMigrationEvidence(execution, expectedArtifacts, environment, preparedAtMs, recordedAtMs, blockers)
  const finaliserDeployedAtMs = validateEdgeFunctionEvidence(execution, expectedArtifacts, environment, preparedAtMs, recordedAtMs, blockers)
  validateFunctionConfigurationReviews(execution, expectedArtifacts, environment, preparedAtMs, recordedAtMs, blockers)
  validatePreviewEvidence(execution, source, environment, preparedAtMs, recordedAtMs, blockers)
  const phase3Migration = Array.isArray(execution.migrationEvidence) ? execution.migrationEvidence.find((item) => record(item).version === '202607220006') : null
  const phase3AppliedAtMs = timeMs(record(phase3Migration).appliedAt)
  if (!Number.isFinite(finaliserDeployedAtMs) || !Number.isFinite(phase3AppliedAtMs) || finaliserDeployedAtMs > phase3AppliedAtMs) {
    add(blockers, 'P1_FINALISER_DEPLOYMENT_ORDER_INVALID', 'The canonical finaliser deployment must be evidenced before migration 202607220006 is applied.')
  }
}

/**
 * Assesses only locally supplied receipts and hashes. A successful result is
 * intentionally named STAGING_EVIDENCE_RECORDED: it proves that the full
 * ordered evidence packet is internally bound, not that this local process has
 * independently contacted Supabase or Vercel. Later live acceptance controls
 * must attest the remote state before any activation decision.
 */
export function assessLegalDocumentRolloutPhase1({ receipt, phase0Freeze, phase0Report, expectedArtifacts, phase1History = null, now = Date.now() } = {}) {
  const candidate = record(receipt)
  const environment = record(candidate.environment)
  const source = record(candidate.source)
  const artifacts = record(candidate.artifacts)
  const safety = record(candidate.safety)
  const execution = record(candidate.execution)
  const evidence = record(candidate.evidence)
  const freeze = record(phase0Freeze)
  const freezeSource = record(freeze.source)
  const freezeTemplateReview = record(freeze.templateReview)
  const blockers = []

  if (!hasExactKeys(candidate, RECEIPT_KEYS)) add(blockers, 'P1_RECEIPT_SCHEMA_INVALID', 'The staging receipt contains missing or unknown top-level fields.')
  if (candidate.version !== 2 || candidate.phase !== 'ROLL_OUT_1' || candidate.contract !== ROLLOUT_PHASE1_CONTRACT) add(blockers, 'P1_RECEIPT_CONTRACT_INVALID', 'The receipt must use the current Phase 1 staging-release contract.')
  if (!['pending_staging', 'staging_evidence_recorded'].includes(candidate.status)) add(blockers, 'P1_RECEIPT_STATUS_INVALID', 'The receipt status must be pending_staging or staging_evidence_recorded.')

  if (!hasExactKeys(environment, ['productionProjectRef', 'stagingOrigin', 'stagingProjectRef'])) add(blockers, 'P1_ENVIRONMENT_SCHEMA_INVALID', 'Record only explicit production and staging identities plus the staging origin.')
  const validProductionProjectRef = validProjectRef(environment.productionProjectRef)
  const validStagingProjectRef = validProjectRef(environment.stagingProjectRef)
  if (!validProductionProjectRef || !validStagingProjectRef) add(blockers, 'P1_ENVIRONMENT_PROJECT_REF_INVALID', 'Both production and staging project references must be explicit, valid Supabase references.')
  if (validProductionProjectRef && validStagingProjectRef && environment.productionProjectRef === environment.stagingProjectRef) add(blockers, 'P1_ENVIRONMENT_IDENTITY_COLLISION', 'Staging may never target the production project reference.')
  if (!validStagingOrigin(environment.stagingOrigin, environment.stagingProjectRef)) add(blockers, 'P1_STAGING_ORIGIN_INVALID', 'The staging origin must be exactly https://<staging-project-ref>.supabase.co.')

  if (!hasExactKeys(source, ['b1EvidenceProjectRef', 'b1ManifestDigest', 'commitSha', 'packageLockSha256', 'pendingReceiptManifestDigest', 'phase0ManifestDigest'])) add(blockers, 'P1_SOURCE_SCHEMA_INVALID', 'The receipt must bind Phase 0, source, lockfile, B1 evidence, and the pending-receipt parent fact.')
  if (!validDigest(source.phase0ManifestDigest) || !validDigest(source.packageLockSha256) || !validDigest(source.b1ManifestDigest) || !validCommit(source.commitSha) || !validProjectRef(source.b1EvidenceProjectRef)) add(blockers, 'P1_SOURCE_BINDING_INVALID', 'The source bindings are malformed.')
  if (candidate.status === 'pending_staging' && source.pendingReceiptManifestDigest !== null) {
    add(blockers, 'P1_PENDING_RECEIPT_PARENT_INVALID', 'A pending receipt may not claim an evidence-recorded parent receipt digest.')
  }
  if (candidate.status === 'staging_evidence_recorded') {
    const history = record(phase1History)
    if (!validDigest(source.pendingReceiptManifestDigest) || !validDigest(history.pendingReceiptManifestDigest) ||
      source.pendingReceiptManifestDigest !== history.pendingReceiptManifestDigest ||
      history.pendingReceiptStatus !== 'pending_staging' || history.pendingReceiptParentDigest !== null) {
      add(blockers, 'P1_PENDING_RECEIPT_PARENT_DRIFT', 'The evidence-recorded receipt must bind the exact manifest digest of its committed pending parent.')
    }
  }
  if (record(phase0Report).status !== 'FROZEN') add(blockers, 'P1_PHASE0_NOT_FROZEN', 'A current, clean Phase 0 FROZEN report is required before staging work is planned or evidenced.')
  const phase1ReceiptChangeCount = record(record(phase0Report).evidence).phase1ReceiptChangeCount
  if (record(phase0Report).status === 'FROZEN') {
    if (!Number.isInteger(phase1ReceiptChangeCount) || phase1ReceiptChangeCount < 0 || phase1ReceiptChangeCount > 2 ||
      (candidate.status === 'pending_staging' && ![0, 1].includes(phase1ReceiptChangeCount)) ||
      (candidate.status === 'staging_evidence_recorded' && phase1ReceiptChangeCount !== 2)) {
      add(blockers, 'P1_RECEIPT_HISTORY_INVALID', 'Phase 1 must be committed once as pending and once as evidence-recorded; a successful receipt may never be rewritten.')
    }
  }
  if (source.phase0ManifestDigest !== freeze.manifestDigest || source.commitSha !== freezeSource.commitSha || source.packageLockSha256 !== freezeSource.packageLockSha256 || source.b1ManifestDigest !== freezeTemplateReview.boundB1ManifestDigest || source.b1EvidenceProjectRef !== freezeTemplateReview.evidenceProjectRef) add(blockers, 'P1_PHASE0_SOURCE_DRIFT', 'The receipt must exactly bind the frozen Phase 0 source and B1 evidence.')
  if (environment.productionProjectRef !== freeze.productionProjectRef) add(blockers, 'P1_PRODUCTION_IDENTITY_DRIFT', 'The staging receipt production reference must equal the Phase 0 production reference.')
  if (environment.stagingProjectRef !== source.b1EvidenceProjectRef) add(blockers, 'P1_STAGING_B1_IDENTITY_DRIFT', 'Staging must be the exact environment that produced the bound B1 evidence, or B1 must be repeated and re-frozen.')

  if (!hasExactKeys(artifacts, ARTIFACT_KEYS)) add(blockers, 'P1_ARTIFACT_SCHEMA_INVALID', 'The receipt artifact binding contains missing or unknown fields.')
  if (!hasExactKeys(record(artifacts.frontend), FRONTEND_ARTIFACT_KEYS)) add(blockers, 'P1_FRONTEND_ARTIFACT_SCHEMA_INVALID', 'The frontend release binding must include every Vercel, Vite, package, and source fact.')
  compareExpectedArtifacts(artifacts, expectedArtifacts, blockers)
  validateArtifactSafety(expectedArtifacts, environment, blockers)

  if (!hasExactKeys(safety, ['creationPaused', 'organisationIdsSentinel', 'pilotEnabled', 'scaleEnabled']) || safety.pilotEnabled !== false || safety.organisationIdsSentinel !== '__none__' || safety.creationPaused !== true || safety.scaleEnabled !== false) add(blockers, 'P1_STAGING_SAFETY_HOLD_INVALID', 'Staging must preserve the disabled pilot, creation pause, and disabled scale posture.')
  if (!hasExactKeys(execution, EXECUTION_KEYS)) add(blockers, 'P1_EXECUTION_SCHEMA_INVALID', 'The staging execution evidence contains missing or unknown fields.')
  if (!hasExactKeys(evidence, EVIDENCE_KEYS)) add(blockers, 'P1_EVIDENCE_SCHEMA_INVALID', 'The receipt evidence contains missing or unknown fields.')
  const preparedAtMs = timeMs(evidence.preparedAt)
  if (!text(evidence.preparedBy) || !text(evidence.changeReference) || !validIsoTime(evidence.preparedAt, now)) add(blockers, 'P1_PREPARATION_ACCOUNTABILITY_MISSING', 'preparedBy, preparedAt, and changeReference are required.')
  const frozenAtMs = timeMs(freeze.frozenAt)
  if (Number.isFinite(frozenAtMs) && Number.isFinite(preparedAtMs) && preparedAtMs < frozenAtMs) add(blockers, 'P1_PREPARATION_PRECEDES_FREEZE', 'Phase 1 preparation cannot predate the Phase 0 freeze.')
  if (evidence.fixtureWrites !== 0) add(blockers, 'P1_FIXTURE_WRITES_NOT_ZERO', 'Phase 1 does not permit fixture writes, signing, email, or watchdog execution.')

  if (candidate.status === 'pending_staging') {
    if (!sameJson(execution, pendingExecutionShape())) add(blockers, 'P1_PENDING_EXECUTION_STATE_INVALID', 'A pending receipt must contain only the inert execution state; do not mix partial deployment evidence into it.')
    if (evidence.evidenceRecordedBy !== null || evidence.reviewedBy !== null || evidence.evidenceRecordedAt !== null) add(blockers, 'P1_PENDING_EVIDENCE_STATE_INVALID', 'A pending receipt must not claim recorded evidence or review.')
    add(blockers, 'P1_STAGING_EXECUTION_PENDING', 'Controlled deployment and evidence capture have not yet been recorded.', true)
  } else if (candidate.status === 'staging_evidence_recorded') {
    const recordedAtMs = timeMs(evidence.evidenceRecordedAt)
    if (!text(evidence.evidenceRecordedBy) || !text(evidence.reviewedBy) || !validIsoTime(evidence.evidenceRecordedAt, now) || !Number.isFinite(recordedAtMs) || !Number.isFinite(preparedAtMs) || recordedAtMs < preparedAtMs) {
      add(blockers, 'P1_EVIDENCE_ACCOUNTABILITY_OR_TIME_INVALID', 'Evidence recording requires accountable reviewers and a timestamp after preparation.')
    }
    if (Number.isFinite(recordedAtMs) && now - recordedAtMs > ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS) add(blockers, 'P1_EVIDENCE_STALE', 'Staging evidence is older than 24 hours and must be re-attested before it can be used.')
    validateRecordedExecution({ execution, expectedArtifacts, source, environment, preparedAtMs, recordedAtMs, blockers })
  }

  if (!validDigest(candidate.manifestDigest) || candidate.manifestDigest !== rolloutPhase1ManifestDigest(candidate)) add(blockers, 'P1_RECEIPT_DIGEST_INVALID', 'The receipt digest does not match its contents.')

  const hardBlockers = blockers.filter((blocker) => !blocker.pending)
  const status = hardBlockers.length ? 'HOLD' : candidate.status === 'staging_evidence_recorded' ? 'STAGING_EVIDENCE_RECORDED' : 'STAGING_PLANNED'
  return {
    phase: 'ROLL_OUT_1',
    contract: ROLLOUT_PHASE1_CONTRACT,
    scope: 'local_receipt_validation',
    status,
    attestationLevel: status === 'STAGING_EVIDENCE_RECORDED' ? 'locally_recorded_evidence_not_live_attestation' : 'none',
    blockerCount: hardBlockers.length,
    pendingCount: blockers.length - hardBlockers.length,
    blockers,
    evidence: {
      productionProjectRef: text(environment.productionProjectRef) || null,
      stagingProjectRef: text(environment.stagingProjectRef) || null,
      sourceCommitSha: text(source.commitSha) || null,
      phase0ManifestDigest: text(source.phase0ManifestDigest) || null,
      applicationManifestCoverage: record(expectedArtifacts).applicationManifestCoverage?.status || 'unknown',
      constrainedFunctionConfiguration: record(expectedArtifacts).releaseOrder?.constrainedFunctions || [],
    },
    doesNotVerify: [...ROLLOUT_PHASE1_DOES_NOT_VERIFY],
    doesNotAuthorize: [...ROLLOUT_PHASE1_DOES_NOT_AUTHORIZE],
    mutatedData: false,
  }
}

export function createPendingLegalDocumentRolloutPhase1Receipt({ phase0Freeze, artifacts, stagingProjectRef, stagingOrigin, preparedBy, changeReference, preparedAt = new Date().toISOString() } = {}) {
  const freeze = record(phase0Freeze)
  const source = record(freeze.source)
  const templateReview = record(freeze.templateReview)
  const artifactFacts = record(artifacts)
  const receipt = {
    version: 2,
    phase: 'ROLL_OUT_1',
    contract: ROLLOUT_PHASE1_CONTRACT,
    status: 'pending_staging',
    environment: {
      productionProjectRef: freeze.productionProjectRef ?? null,
      stagingProjectRef: stagingProjectRef || null,
      stagingOrigin: stagingOrigin || null,
    },
    source: {
      phase0ManifestDigest: freeze.manifestDigest ?? null,
      commitSha: source.commitSha ?? null,
      packageLockSha256: source.packageLockSha256 ?? null,
      b1ManifestDigest: templateReview.boundB1ManifestDigest ?? null,
      b1EvidenceProjectRef: templateReview.evidenceProjectRef ?? null,
      pendingReceiptManifestDigest: null,
    },
    artifacts: {
      migrations: artifactFacts.migrations ?? [],
      migrationSetDigest: artifactFacts.migrationSetDigest ?? null,
      applicationManifestSha256: artifactFacts.applicationManifestSha256 ?? null,
      applicationManifestCoverageDigest: record(artifactFacts.applicationManifestCoverage).digest ?? null,
      applicationManifestLinkedProjectRef: artifactFacts.applicationManifestLinkedProjectRef ?? null,
      edgeFunctions: artifactFacts.edgeFunctions ?? [],
      edgeFunctionSetDigest: artifactFacts.edgeFunctionSetDigest ?? null,
      edgeFunctionDeployUnitSha256: artifactFacts.edgeFunctionDeployUnitSha256 ?? null,
      sharedRuntimeSha256: artifactFacts.sharedRuntimeSha256 ?? null,
      sharedRuntimeFileCount: artifactFacts.sharedRuntimeFileCount ?? null,
      sharedRuntimeRequiredFileSha256: artifactFacts.sharedRuntimeRequiredFileSha256 ?? null,
      configTomlSha256: artifactFacts.configTomlSha256 ?? null,
      databaseRunnerSourceSha256: artifactFacts.databaseRunnerSourceSha256 ?? null,
      databaseRunnerProtectedProjectRef: artifactFacts.databaseRunnerProtectedProjectRef ?? null,
      databaseRunnerTargetContract: artifactFacts.databaseRunnerTargetContract ?? null,
      databaseRunnerCliVersion: artifactFacts.databaseRunnerCliVersion ?? null,
      frontend: artifactFacts.frontend ?? {},
      releaseOrder: artifactFacts.releaseOrder ?? {},
    },
    safety: {
      pilotEnabled: false,
      organisationIdsSentinel: '__none__',
      creationPaused: true,
      scaleEnabled: false,
    },
    execution: pendingExecutionShape(),
    evidence: {
      preparedBy: preparedBy || null,
      preparedAt,
      evidenceRecordedBy: null,
      reviewedBy: null,
      evidenceRecordedAt: null,
      changeReference: changeReference || null,
      fixtureWrites: 0,
    },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase1ManifestDigest(receipt)
  return stableValue(receipt)
}
