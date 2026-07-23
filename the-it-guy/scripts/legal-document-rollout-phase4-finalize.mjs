import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS,
  rolloutPhase4ManifestDigest,
} from './legal-document-rollout-phase4-policy.mjs'
import { stableValue } from './legal-document-rollout-phase1-artifacts.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const CANONICAL_RECEIPT_PATH = path.join(APP_ROOT, 'config', 'legal-document-rollout-phase4-pilot-activation.json')
const WRITE_CONFIRMATION = 'RECORD_PHASE4_PILOT_ACTIVATION'
const DIGEST = /^sha256:[0-9a-f]{64}$/

export const ROLLOUT_PHASE4_FINALIZATION_INPUT_FIELDS = Object.freeze([
  'activation',
  'activationRecordedAt',
  'activationRecordedBy',
  'candidateReadiness',
  'monitoring',
  'overallEvidenceDigest',
  'preActivation',
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
  throw new Error(`Phase 4 pilot-activation finalizer blocked: ${message}`)
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
    if (/(?:credential|password|secret|token|authorization|signedurl|emailaddress|rawlog|documentbytes)/i.test(key)) return `${currentPath}.${key}`
    const found = findSensitiveKey(nested, `${currentPath}.${key}`)
    if (found) return found
  }
  return null
}

function validatePendingPlan(plan) {
  expect(record(plan).status === 'pending_activation', 'Only a pending_activation plan can be finalized.')
  expect(validDigest(plan.manifestDigest) && plan.manifestDigest === rolloutPhase4ManifestDigest(plan), 'The pending plan digest does not match its contents.')
  expect(record(plan.cohort).maxOrganisations === 1 && Array.isArray(plan.cohort?.organisationIds) && plan.cohort.organisationIds.length === 1,
    'The pending plan must retain the single-organisation pilot scope.')
  expect(record(plan.safety).scaleEnabled === false && record(plan.safety).creationPaused === true && record(plan.safety).rollbackToDarkLaunchRequired === true,
    'The pending plan must retain no-scale, creation-pause, and dark-launch rollback safeguards.')
  expect(record(plan.execution).overallEvidenceDigest === null && record(plan.execution.preActivation).status === 'not_run' &&
    record(plan.execution.candidateReadiness).status === 'not_run' && record(plan.execution.activation).status === 'not_run' &&
    record(plan.execution.monitoring).status === 'not_run' && record(plan.execution.rollbackReadiness).status === 'not_run',
  'A pending Phase 4 plan may not claim partial production activation evidence.')
}

function validateEvidenceInput(input, plan, nowMs) {
  expect(exactKeys(input, ROLLOUT_PHASE4_FINALIZATION_INPUT_FIELDS), 'Evidence input has missing or unknown fields.')
  expect(text(input.activationRecordedBy) && text(input.reviewedBy), 'activationRecordedBy and reviewedBy are required.')
  expect(validDigest(input.overallEvidenceDigest), 'overallEvidenceDigest must be a SHA-256 digest.')
  const preparedAt = time(plan.evidence?.preparedAt)
  const activatedAt = time(input.activation?.activatedAt)
  const recordedAt = time(input.activationRecordedAt)
  expect(Number.isFinite(preparedAt) && Number.isFinite(activatedAt) && Number.isFinite(recordedAt) && activatedAt >= preparedAt && recordedAt >= activatedAt,
    'activation and recording timestamps must follow plan preparation.')
  expect(recordedAt <= nowMs + 5 * 60_000, 'activationRecordedAt may not be materially in the future.')
  expect(activatedAt - preparedAt <= ROLLOUT_PHASE4_MAX_ACTIVATION_WINDOW_MS, 'Activation is outside the 30-minute sealed-plan window; create a new plan rather than finalizing stale authority.')
  expect(record(input.preActivation).status === 'attested' && record(input.candidateReadiness).status === 'attested' &&
    record(input.activation).status === 'attested' && record(input.monitoring).status === 'armed' && record(input.rollbackReadiness).status === 'attested',
  'Every Phase 4 activation evidence component must be attested before finalization.')
  const sensitive = findSensitiveKey(input)
  expect(!sensitive, `Evidence input includes a forbidden sensitive field at ${sensitive}; record redacted SHA-256 evidence only.`)
}

/**
 * Creates the immutable local receipt for a remote activation that has already
 * been explicitly authorised and verified. It does not contact a provider or
 * change pilot runtime secrets.
 */
export function finalizeLegalDocumentRolloutPhase4Receipt({ pendingPlan, evidenceInput, now = Date.now() } = {}) {
  const plan = clone(pendingPlan)
  const input = clone(evidenceInput)
  const nowMs = typeof now === 'number' ? now : Date.parse(now)
  expect(Number.isFinite(nowMs), 'now must be a valid timestamp.')
  validatePendingPlan(plan)
  validateEvidenceInput(input, plan, nowMs)
  const receipt = {
    ...plan,
    status: 'pilot_activation_recorded',
    execution: {
      preActivation: input.preActivation,
      candidateReadiness: input.candidateReadiness,
      activation: input.activation,
      monitoring: input.monitoring,
      rollbackReadiness: input.rollbackReadiness,
      overallEvidenceDigest: input.overallEvidenceDigest,
    },
    evidence: {
      ...plan.evidence,
      activationRecordedBy: input.activationRecordedBy,
      reviewedBy: input.reviewedBy,
      activationRecordedAt: input.activationRecordedAt,
    },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase4ManifestDigest(receipt)
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
  if (!fs.existsSync(outputPath)) fail('The canonical Phase 4 receipt placeholder is missing; it must have been present in the frozen source.')
  let current
  try {
    current = readJson(outputPath)
  } catch (error) {
    fail(`The canonical Phase 4 receipt placeholder is unreadable: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
  if (record(current).status !== 'not_recorded') {
    fail('The canonical Phase 4 receipt is no longer an inert not_recorded placeholder and may not be overwritten.')
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
  const finalized = finalizeLegalDocumentRolloutPhase4Receipt({
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
  console.log(JSON.stringify({ action: 'wrote_phase4_pilot_activation_receipt', outputPath, manifestDigest: finalized.manifestDigest }, null, 2))
}

if (invokedDirectly()) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 4 pilot-activation finalizer blocked.')
    process.exitCode = 1
  }
}
