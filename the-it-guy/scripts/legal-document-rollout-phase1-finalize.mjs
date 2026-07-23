import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { sha256Digest, stableValue } from './legal-document-rollout-phase1-artifacts.mjs'
import {
  LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION,
} from './legal-document-rollout-phase1-preview-attestation.mjs'
import {
  ROLLOUT_PHASE1_EDGE_FUNCTION_EVIDENCE_FIELDS,
  ROLLOUT_PHASE1_FUNCTION_CONFIGURATION_REVIEW_FIELDS,
  ROLLOUT_PHASE1_MIGRATION_EVIDENCE_FIELDS,
  ROLLOUT_PHASE1_PREVIEW_EVIDENCE_FIELDS,
  ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS,
  rolloutPhase1ManifestDigest,
} from './legal-document-rollout-phase1-policy.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const CANONICAL_RECEIPT_PATH = path.join(APP_ROOT, 'config', 'legal-document-rollout-phase1-staging.json')
const WRITE_CONFIRMATION = 'RECORD_PHASE1_EVIDENCE'
const DIGEST = /^sha256:[0-9a-f]{64}$/

export const ROLLOUT_PHASE1_FINALIZATION_INPUT_FIELDS = Object.freeze([
  'edgeFunctionEvidence',
  'evidenceRecordedAt',
  'evidenceRecordedBy',
  'functionConfigurationReviews',
  'migrationEvidence',
  'postDeployContractEvidenceDigest',
  'preflightLedgerEvidenceDigest',
  'recoveryEvidenceReference',
  'reviewedBy',
])

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function fail(message) {
  throw new Error(`Phase 1 receipt finalizer blocked: ${message}`)
}

function exactKeys(value, fields) {
  const actual = Object.keys(record(value)).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length && actual.every((item, index) => item === expected[index])
}

function validDigest(value) {
  return DIGEST.test(text(value))
}

function time(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : NaN
}

function validEvidenceTime(value, preparedAtMs, recordedAtMs) {
  const observed = time(value)
  return Number.isFinite(observed) && Number.isFinite(preparedAtMs) && Number.isFinite(recordedAtMs) &&
    observed >= preparedAtMs && observed <= recordedAtMs && recordedAtMs - observed <= ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS
}

function expect(condition, message) {
  if (!condition) fail(message)
}

function validatePendingReceipt(pending) {
  expect(record(pending).status === 'pending_staging', 'Only a pending_staging receipt can be finalized.')
  expect(validDigest(pending?.manifestDigest) && pending.manifestDigest === rolloutPhase1ManifestDigest(pending), 'The pending receipt digest does not match its contents.')
  expect(record(pending?.safety).pilotEnabled === false && record(pending?.safety).scaleEnabled === false &&
    record(pending?.safety).creationPaused === true && record(pending?.safety).organisationIdsSentinel === '__none__',
  'The pending receipt must retain the disabled rollout posture.')
  expect(record(pending?.evidence).fixtureWrites === 0, 'The pending receipt must record zero fixture writes.')
  expect(Array.isArray(pending.execution?.migrationEvidence) && pending.execution.migrationEvidence.length === 0 &&
    Array.isArray(pending.execution?.edgeFunctionEvidence) && pending.execution.edgeFunctionEvidence.length === 0 &&
    Array.isArray(pending.execution?.functionConfigurationReviews) && pending.execution.functionConfigurationReviews.length === 0,
  'A pending receipt may not contain partial controlled-execution evidence.')
}

function validateFinalizationInput(input, pending, nowMs) {
  expect(exactKeys(input, ROLLOUT_PHASE1_FINALIZATION_INPUT_FIELDS), 'Evidence input has missing or unknown fields.')
  const preparedAtMs = time(pending.evidence?.preparedAt)
  const recordedAtMs = time(input.evidenceRecordedAt)
  expect(text(input.recoveryEvidenceReference), 'recoveryEvidenceReference is required.')
  expect(validDigest(input.preflightLedgerEvidenceDigest), 'preflightLedgerEvidenceDigest must be a SHA-256 digest.')
  expect(validDigest(input.postDeployContractEvidenceDigest), 'postDeployContractEvidenceDigest must be a SHA-256 digest.')
  expect(text(input.evidenceRecordedBy) && text(input.reviewedBy), 'evidenceRecordedBy and reviewedBy are required.')
  expect(Number.isFinite(preparedAtMs) && Number.isFinite(recordedAtMs) && recordedAtMs >= preparedAtMs, 'evidenceRecordedAt must be a valid timestamp after preparation.')
  expect(recordedAtMs <= nowMs + 5 * 60_000, 'evidenceRecordedAt may not be materially in the future.')
  expect(nowMs - recordedAtMs <= ROLLOUT_PHASE1_MAX_EVIDENCE_AGE_MS, 'evidenceRecordedAt is older than 24 hours; re-attest instead of finalizing stale evidence.')
  return { preparedAtMs, recordedAtMs }
}

function validateMigrations(pending, input, preparedAtMs, recordedAtMs) {
  const expected = Array.isArray(pending.artifacts?.migrations) ? pending.artifacts.migrations : []
  const actual = Array.isArray(input.migrationEvidence) ? input.migrationEvidence : []
  expect(actual.length === expected.length && expected.length > 0, `Record exactly ${expected.length} migration evidence entries.`)
  let predecessorDigest = input.preflightLedgerEvidenceDigest
  let predecessorTime = preparedAtMs
  const seenLedgerDigests = new Set([predecessorDigest])
  return actual.map((item, index) => {
    const expectedMigration = record(expected[index])
    expect(exactKeys(item, ROLLOUT_PHASE1_MIGRATION_EVIDENCE_FIELDS), `Migration evidence ${index + 1} has an invalid schema.`)
    expect(item.version === expectedMigration.version && item.migrationSha256 === expectedMigration.sha256 && item.targetProjectRef === pending.environment?.stagingProjectRef,
      `Migration evidence ${index + 1} does not bind the expected staged migration.`)
    expect(item.predecessorLedgerEvidenceDigest === predecessorDigest, `Migration ${expectedMigration.version} does not bind its immediate predecessor ledger digest.`)
    expect(validDigest(item.applyEvidenceDigest) && validDigest(item.predecessorLedgerEvidenceDigest) && validDigest(item.ledgerEvidenceDigest),
      `Migration ${expectedMigration.version} requires valid evidence digests.`)
    expect(item.ledgerEvidenceDigest !== item.predecessorLedgerEvidenceDigest && !seenLedgerDigests.has(item.ledgerEvidenceDigest),
      `Migration ${expectedMigration.version} reuses a ledger evidence digest.`)
    expect(item.sqlApplied === true && item.catalogChecks === 'pass' && item.behaviorChecks === 'pass' && item.rollbackOrNoResidue === 'pass' && text(item.reviewedBy),
      `Migration ${expectedMigration.version} lacks passing reviewed checks.`)
    const appliedAt = time(item.appliedAt)
    const ledgerAt = time(item.ledgerRecordedAt)
    expect(validEvidenceTime(item.appliedAt, preparedAtMs, recordedAtMs) && validEvidenceTime(item.ledgerRecordedAt, preparedAtMs, recordedAtMs) &&
      appliedAt >= predecessorTime && ledgerAt >= appliedAt, `Migration ${expectedMigration.version} has invalid evidence timestamps.`)
    predecessorDigest = item.ledgerEvidenceDigest
    predecessorTime = ledgerAt
    seenLedgerDigests.add(item.ledgerEvidenceDigest)
    return clone(item)
  })
}

function validateEdgeFunctions(pending, input, preparedAtMs, recordedAtMs) {
  const expected = Array.isArray(pending.artifacts?.edgeFunctions) ? pending.artifacts.edgeFunctions : []
  const actual = Array.isArray(input.edgeFunctionEvidence) ? input.edgeFunctionEvidence : []
  const deployUnit = pending.artifacts?.edgeFunctionDeployUnitSha256
  expect(validDigest(deployUnit), 'The pending receipt has no valid Edge deploy-unit digest.')
  expect(actual.length === expected.length && expected.length > 0, `Record exactly ${expected.length} Edge Function evidence entries.`)
  return actual.map((item, index) => {
    const expectedFunction = record(expected[index])
    expect(exactKeys(item, ROLLOUT_PHASE1_EDGE_FUNCTION_EVIDENCE_FIELDS), `Edge Function evidence ${index + 1} has an invalid schema.`)
    expect(item.name === expectedFunction.name && item.sourceTreeSha256 === expectedFunction.sourceTreeSha256 &&
      item.targetProjectRef === pending.environment?.stagingProjectRef && item.deployUnitSha256 === deployUnit,
    `Edge Function evidence ${index + 1} does not bind the reviewed deploy unit.`)
    expect(text(item.providerRevision) && text(item.deploymentReference), `Edge Function ${expectedFunction.name} lacks provider deployment identifiers.`)
    expect(validEvidenceTime(item.deployedAt, preparedAtMs, recordedAtMs), `Edge Function ${expectedFunction.name} has an invalid deployment timestamp.`)
    return clone(item)
  })
}

function validateConfigurationReviews(pending, input, preparedAtMs, recordedAtMs) {
  const expectedNames = Array.isArray(pending.artifacts?.releaseOrder?.constrainedFunctions) ? pending.artifacts.releaseOrder.constrainedFunctions : []
  const actual = Array.isArray(input.functionConfigurationReviews) ? input.functionConfigurationReviews : []
  expect(actual.length === expectedNames.length, `Record exactly ${expectedNames.length} function configuration reviews.`)
  return actual.map((item, index) => {
    expect(exactKeys(item, ROLLOUT_PHASE1_FUNCTION_CONFIGURATION_REVIEW_FIELDS), `Function configuration review ${index + 1} has an invalid schema.`)
    expect(item.name === expectedNames[index] && item.targetProjectRef === pending.environment?.stagingProjectRef &&
      validDigest(item.configurationEvidenceDigest) && text(item.reviewedBy), `Function configuration review ${index + 1} is not bound to staging.`)
    expect(validEvidenceTime(item.reviewedAt, preparedAtMs, recordedAtMs), `Function configuration review ${index + 1} has an invalid timestamp.`)
    return clone(item)
  })
}

function buildPreviewEvidence(pending, previewAttestation, previewAttestationDigest, preparedAtMs, recordedAtMs) {
  expect(validDigest(previewAttestationDigest), 'The saved preview-attestation digest must be SHA-256.')
  expect(record(previewAttestation).version === LEGAL_DOCUMENT_ROLLOUT_PHASE1_PREVIEW_ATTESTATION_VERSION,
    'The preview attestation version is not the current provider-bound contract.')
  expect(previewAttestation.expectedReleaseId === pending.source?.commitSha && previewAttestation.expectedSupabaseOrigin === pending.environment?.stagingOrigin,
    'The preview attestation is not bound to the pending receipt source and staging origin.')
  const automatic = record(previewAttestation.receiptPreviewEvidence)
  const automaticFields = ROLLOUT_PHASE1_PREVIEW_EVIDENCE_FIELDS.filter((field) => ![
    'attestationEvidenceDigest', 'deploymentMetadataEvidenceDigest', 'deploymentSourceCommitSha',
  ].includes(field))
  expect(exactKeys(automatic, automaticFields), 'The preview attestation has an unexpected receiptPreviewEvidence shape.')
  const provider = record(record(previewAttestation).providerMetadata)
  const observed = record(provider.observed)
  expect(validDigest(provider.sha256) && observed.id === automatic.deploymentId && observed.url === automatic.previewUrl &&
    observed.sourceCommitSha === pending.source?.commitSha && observed.state === 'READY' && observed.target === 'preview',
  'The preview attestation is missing an authenticated Vercel deployment binding.')
  const previewEvidence = {
    ...automatic,
    deploymentSourceCommitSha: observed.sourceCommitSha,
    deploymentMetadataEvidenceDigest: provider.sha256,
    attestationEvidenceDigest: previewAttestationDigest,
  }
  expect(exactKeys(previewEvidence, ROLLOUT_PHASE1_PREVIEW_EVIDENCE_FIELDS), 'The finalized preview evidence has an invalid schema.')
  expect(previewEvidence.provider === 'vercel' && previewEvidence.previewReleaseId === pending.source?.commitSha &&
    previewEvidence.publicSupabaseOrigin === pending.environment?.stagingOrigin && validEvidenceTime(previewEvidence.attestedAt, preparedAtMs, recordedAtMs),
  'The finalized preview evidence does not bind the source, staging origin, and evidence window.')
  return previewEvidence
}

/**
 * Produces a canonical evidence-recorded receipt from a pending receipt,
 * structured controlled-execution evidence, and the provider-bound preview
 * attestation. This is deliberately local-only: it does not deploy, query,
 * or write external state.
 */
export function finalizeLegalDocumentRolloutPhase1Receipt({
  pendingReceipt,
  evidenceInput,
  previewAttestation,
  previewAttestationDigest,
  now = Date.now(),
} = {}) {
  const pending = clone(pendingReceipt)
  const input = clone(evidenceInput)
  const nowMs = typeof now === 'number' ? now : Date.parse(now)
  expect(Number.isFinite(nowMs), 'now must be a valid timestamp.')
  validatePendingReceipt(pending)
  const { preparedAtMs, recordedAtMs } = validateFinalizationInput(input, pending, nowMs)
  const migrationEvidence = validateMigrations(pending, input, preparedAtMs, recordedAtMs)
  const edgeFunctionEvidence = validateEdgeFunctions(pending, input, preparedAtMs, recordedAtMs)
  const functionConfigurationReviews = validateConfigurationReviews(pending, input, preparedAtMs, recordedAtMs)
  const previewEvidence = buildPreviewEvidence(pending, previewAttestation, previewAttestationDigest, preparedAtMs, recordedAtMs)

  const phase3Migration = migrationEvidence.find((item) => item.version === '202607220006')
  const finaliser = edgeFunctionEvidence.find((item) => item.name === 'generate-final-signed-document')
  if (phase3Migration && finaliser) {
    expect(time(finaliser.deployedAt) <= time(phase3Migration.appliedAt), 'The canonical finaliser must be deployed before migration 202607220006 is applied.')
  }

  const receipt = {
    ...pending,
    status: 'staging_evidence_recorded',
    source: {
      ...pending.source,
      pendingReceiptManifestDigest: pending.manifestDigest,
    },
    execution: {
      databaseRunner: pending.execution?.databaseRunner,
      databaseRunnerCliVersion: pending.execution?.databaseRunnerCliVersion,
      recoveryEvidenceReference: input.recoveryEvidenceReference,
      preflightLedgerEvidenceDigest: input.preflightLedgerEvidenceDigest,
      migrationEvidence,
      edgeFunctionEvidence,
      functionConfigurationReviews,
      previewEvidence,
      postDeployContractEvidenceDigest: input.postDeployContractEvidenceDigest,
    },
    evidence: {
      ...pending.evidence,
      evidenceRecordedBy: input.evidenceRecordedBy,
      reviewedBy: input.reviewedBy,
      evidenceRecordedAt: input.evidenceRecordedAt,
      fixtureWrites: 0,
    },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase1ManifestDigest(receipt)
  return stableValue(receipt)
}

export function parsePhase1FinalizerArgs(argv = process.argv.slice(2)) {
  const result = {}
  const allowed = new Set(['receipt', 'evidence', 'preview-attestation', 'out', 'confirm-write'])
  for (const argument of argv) {
    if (!argument.startsWith('--') || !argument.includes('=')) fail(`Use --name=value form for every argument; received ${argument}.`)
    const separator = argument.indexOf('=')
    const name = argument.slice(2, separator)
    const value = argument.slice(separator + 1)
    if (!allowed.has(name) || Object.hasOwn(result, name)) fail(`Unknown or duplicate argument --${name}.`)
    result[name] = value
  }
  for (const name of ['receipt', 'evidence', 'preview-attestation']) {
    if (!text(result[name])) fail(`--${name} is required.`)
  }
  if (result.out && result['confirm-write'] !== WRITE_CONFIRMATION) {
    fail(`Writing requires --confirm-write=${WRITE_CONFIRMATION}.`)
  }
  if (!result.out && result['confirm-write']) fail('--confirm-write is only valid with --out.')
  return result
}

function readJsonWithDigest(file) {
  const bytes = fs.readFileSync(file)
  return { value: JSON.parse(bytes.toString('utf8')), digest: sha256Digest(bytes) }
}

function invokedDirectly() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

function main() {
  const options = parsePhase1FinalizerArgs()
  const receiptPath = path.resolve(process.cwd(), options.receipt)
  const evidencePath = path.resolve(process.cwd(), options.evidence)
  const previewPath = path.resolve(process.cwd(), options['preview-attestation'])
  const pending = readJsonWithDigest(receiptPath).value
  const evidence = readJsonWithDigest(evidencePath).value
  const preview = readJsonWithDigest(previewPath)
  const finalized = finalizeLegalDocumentRolloutPhase1Receipt({
    pendingReceipt: pending,
    evidenceInput: evidence,
    previewAttestation: preview.value,
    previewAttestationDigest: preview.digest,
  })
  const serialized = `${JSON.stringify(finalized, null, 2)}\n`
  if (!options.out) {
    console.log(serialized)
    return
  }
  const outputPath = path.resolve(process.cwd(), options.out)
  if (outputPath !== CANONICAL_RECEIPT_PATH) fail(`--out may only be the canonical receipt ${path.relative(process.cwd(), CANONICAL_RECEIPT_PATH)}.`)
  fs.writeFileSync(outputPath, serialized, 'utf8')
  console.log(JSON.stringify({ action: 'wrote_phase1_evidence_receipt', outputPath, manifestDigest: finalized.manifestDigest }, null, 2))
}

if (invokedDirectly()) {
  try {
    main()
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : 'Phase 1 receipt finalizer blocked.')
    process.exitCode = 1
  }
}
