import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROLLOUT_PHASE5_MAX_SNAPSHOT_GAP_MINUTES,
  ROLLOUT_PHASE5_MIN_HEALTHY_SCOPED_SNAPSHOTS,
  ROLLOUT_PHASE5_MIN_OBSERVATION_HOURS,
  rolloutPhase5EvidencePacketDigest,
  rolloutPhase5ManifestDigest,
} from './legal-document-rollout-phase5-policy.mjs'
import { stableValue } from './legal-document-rollout-phase1-artifacts.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const CANONICAL_RECEIPT_PATH = path.join(APP_ROOT, 'config', 'legal-document-rollout-phase5-pilot-observation.json')
const WRITE_CONFIRMATION = 'RECORD_PHASE5_PILOT_OBSERVATION'
const DIGEST = /^sha256:[0-9a-f]{64}$/

export const ROLLOUT_PHASE5_FINALIZATION_INPUT_FIELDS = Object.freeze([
  'lifecycleProofs',
  'monitoring',
  'observationRecordedAt',
  'observationRecordedBy',
  'overallEvidenceDigest',
  'reconciliation',
  'reviewedBy',
  'rollbackReadiness',
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
  throw new Error(`Phase 5 pilot-observation finalizer blocked: ${message}`)
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

function expect(condition, message) {
  if (!condition) fail(message)
}

function findSensitiveKey(value, currentPath = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitiveKey(value[index], `${currentPath}[${index}]`)
      if (found) return found
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:credential|password|secret|token|authorization|signedurl|email|phone|address|rawlog|documentbytes|storagepath|artifactpath|signer)/i.test(key)) return `${currentPath}.${key}`
    const found = findSensitiveKey(nested, `${currentPath}.${key}`)
    if (found) return found
  }
  return null
}

function validatePendingPlan(plan) {
  expect(record(plan).status === 'pending_observation', 'Only a pending_observation plan can be finalized.')
  expect(validDigest(plan.manifestDigest) && plan.manifestDigest === rolloutPhase5ManifestDigest(plan), 'The pending plan digest does not match its contents.')
  expect(record(plan.cohort).maxOrganisations === 1 && Array.isArray(plan.cohort?.organisationIds) && plan.cohort.organisationIds.length === 1,
    'The pending plan must retain the single-organisation pilot scope.')
  expect(record(plan.safety).scaleEnabled === false && record(plan.safety).creationPaused === true && record(plan.safety).noScaleAuthorization === true &&
    record(plan.safety).rollbackToDarkLaunchRequired === true,
  'The pending plan must retain no-scale, creation-pause, and dark-launch rollback safeguards.')
  expect(record(plan.observation).minimumObservationHours === ROLLOUT_PHASE5_MIN_OBSERVATION_HOURS &&
    record(plan.observation).minimumHealthyScopedSnapshots === ROLLOUT_PHASE5_MIN_HEALTHY_SCOPED_SNAPSHOTS &&
    record(plan.observation).maximumSnapshotGapMinutes === ROLLOUT_PHASE5_MAX_SNAPSHOT_GAP_MINUTES,
  'The pending plan must retain the fixed 144-hour, seven-snapshot, 90-minute-gap observation acceptance policy.')
  expect(record(plan.execution).overallEvidenceDigest === null && record(plan.execution).evidencePacketDigest === null &&
    Array.isArray(plan.execution.lifecycleProofs) && plan.execution.lifecycleProofs.length === 0 && record(plan.execution.monitoring).status === 'not_run' &&
    record(plan.execution.reconciliation).status === 'not_run' && record(plan.execution.rollbackReadiness).status === 'not_run',
  'A pending Phase 5 plan may not claim partial lifecycle, monitoring, reconciliation, or rollback evidence.')
}

function validateEvidenceInput(input, plan, nowMs) {
  expect(exactKeys(input, ROLLOUT_PHASE5_FINALIZATION_INPUT_FIELDS), 'Evidence input has missing or unknown fields.')
  expect(text(input.observationRecordedBy) && text(input.reviewedBy), 'observationRecordedBy and reviewedBy are required.')
  expect(validDigest(input.overallEvidenceDigest), 'overallEvidenceDigest must be a SHA-256 digest.')
  const preparedAt = time(plan.evidence?.preparedAt)
  const recordedAt = time(input.observationRecordedAt)
  expect(Number.isFinite(preparedAt) && Number.isFinite(recordedAt) && recordedAt >= preparedAt,
    'observationRecordedAt must be after plan preparation.')
  expect(recordedAt <= nowMs + 5 * 60_000, 'observationRecordedAt may not be materially in the future.')
  expect(Array.isArray(input.lifecycleProofs) && input.lifecycleProofs.length === 2,
    'Evidence input must include exactly the mandate and OTP lifecycle proof objects.')
  for (const name of ['monitoring', 'reconciliation', 'rollbackReadiness']) {
    expect(record(input[name]).status === 'attested', `${name} must be an attested read-only evidence object.`)
  }
  const sensitive = findSensitiveKey(input)
  expect(!sensitive, `Evidence input includes a forbidden sensitive field at ${sensitive}; record redacted SHA-256 evidence only.`)
}

/**
 * Creates the immutable local Phase 5 observation receipt from a sealed
 * pending plan and a redacted evidence packet. It never calls a provider,
 * activates a pilot, changes a secret, sends a document, or changes customer
 * data. The evidence packet digest is derived here so it cannot omit any
 * submitted lifecycle, monitoring, reconciliation, or reviewer field.
 */
export function finalizeLegalDocumentRolloutPhase5Receipt({ pendingPlan, evidenceInput, now = Date.now() } = {}) {
  const plan = clone(pendingPlan)
  const input = clone(evidenceInput)
  const nowMs = typeof now === 'number' ? now : Date.parse(now)
  expect(Number.isFinite(nowMs), 'now must be a valid timestamp.')
  validatePendingPlan(plan)
  validateEvidenceInput(input, plan, nowMs)
  const evidencePacketDigest = rolloutPhase5EvidencePacketDigest(input)
  const receipt = {
    ...plan,
    status: 'pilot_observation_recorded',
    execution: {
      lifecycleProofs: input.lifecycleProofs,
      monitoring: input.monitoring,
      reconciliation: input.reconciliation,
      rollbackReadiness: input.rollbackReadiness,
      overallEvidenceDigest: input.overallEvidenceDigest,
      evidencePacketDigest,
    },
    evidence: {
      ...plan.evidence,
      observationRecordedBy: input.observationRecordedBy,
      reviewedBy: input.reviewedBy,
      observationRecordedAt: input.observationRecordedAt,
    },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase5ManifestDigest(receipt)
  return stableValue(receipt)
}

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function assertKnownOptions() {
  const allowed = new Set(['plan', 'evidence', 'out', 'confirm-write'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`)
    const name = value.slice(2).split('=')[0]
    if (!allowed.has(name)) throw new Error(`Unknown argument: ${value}`)
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function assertCanonicalReceiptIsStillPlaceholder(outputPath) {
  if (!fs.existsSync(outputPath)) fail('The canonical Phase 5 receipt placeholder is missing; it must have been present in the frozen source.')
  let current
  try {
    current = readJson(outputPath)
  } catch (error) {
    fail(`The canonical Phase 5 receipt placeholder is unreadable: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
  if (record(current).status !== 'not_recorded') {
    fail('The canonical Phase 5 receipt is no longer an inert not_recorded placeholder and may not be overwritten.')
  }
}

function invokedDirectly() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

function main() {
  assertKnownOptions()
  const planArg = option('plan')
  const evidenceArg = option('evidence')
  if (!planArg || !evidenceArg) fail('--plan and --evidence are required.')
  const finalized = finalizeLegalDocumentRolloutPhase5Receipt({
    pendingPlan: readJson(path.resolve(process.cwd(), planArg)),
    evidenceInput: readJson(path.resolve(process.cwd(), evidenceArg)),
  })
  const serialized = `${JSON.stringify(finalized, null, 2)}\n`
  const outputArg = option('out')
  if (!outputArg) {
    console.log(serialized)
    return
  }
  const outputPath = path.resolve(process.cwd(), outputArg)
  if (outputPath !== CANONICAL_RECEIPT_PATH) fail(`--out may only be the canonical receipt ${path.relative(process.cwd(), CANONICAL_RECEIPT_PATH)}.`)
  if (option('confirm-write') !== WRITE_CONFIRMATION) fail(`Writing requires --confirm-write=${WRITE_CONFIRMATION}.`)
  assertCanonicalReceiptIsStillPlaceholder(outputPath)
  fs.writeFileSync(outputPath, serialized, 'utf8')
  console.log(JSON.stringify({ action: 'wrote_phase5_pilot_observation_receipt', outputPath, manifestDigest: finalized.manifestDigest }, null, 2))
}

if (invokedDirectly()) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 5 pilot-observation finalizer blocked.')
    process.exitCode = 1
  }
}
