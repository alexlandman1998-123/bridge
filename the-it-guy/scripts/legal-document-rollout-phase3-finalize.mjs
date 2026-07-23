import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROLLOUT_PHASE3_MAX_EVIDENCE_AGE_MS,
  rolloutPhase3ManifestDigest,
} from './legal-document-rollout-phase3-policy.mjs'
import { stableValue } from './legal-document-rollout-phase1-artifacts.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const CANONICAL_RECEIPT_PATH = path.join(APP_ROOT, 'config', 'legal-document-rollout-phase3-production-preflight.json')
const WRITE_CONFIRMATION = 'RECORD_PHASE3_PRODUCTION_PREFLIGHT'
const DIGEST = /^sha256:[0-9a-f]{64}$/

export const ROLLOUT_PHASE3_FINALIZATION_INPUT_FIELDS = Object.freeze([
  'operationsReadiness',
  'overallEvidenceDigest',
  'preflightRecordedAt',
  'preflightRecordedBy',
  'productionDatabase',
  'productionDeployment',
  'productionFunctions',
  'reviewedBy',
  'runtimeHold',
  'templateRelease',
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
  throw new Error(`Phase 3 production-preflight finalizer blocked: ${message}`)
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

function findSensitiveKey(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitiveKey(value[index], `${path}[${index}]`)
      if (found) return found
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:credential|password|secret|token|authorization|signedurl|emailaddress|rawlog|documentbytes)/i.test(key)) return `${path}.${key}`
    const found = findSensitiveKey(nested, `${path}.${key}`)
    if (found) return found
  }
  return null
}

function validatePendingPlan(plan) {
  expect(record(plan).status === 'pending_preflight', 'Only a pending_preflight plan can be finalized.')
  expect(validDigest(plan.manifestDigest) && plan.manifestDigest === rolloutPhase3ManifestDigest(plan), 'The pending plan digest does not match its contents.')
  expect(record(plan.safety).pilotEnabled === false && record(plan.safety).scaleEnabled === false && record(plan.safety).creationPaused === true &&
    record(plan.safety).organisationIdsSentinel === '__none__' && record(plan.safety).generationEnabled === false && record(plan.safety).customerDeliveryEnabled === false,
  'The pending plan must retain the disabled dark-launch posture.')
  expect(record(plan.execution).overallEvidenceDigest === null && record(plan.execution.productionDeployment).status === 'not_run' &&
    record(plan.execution.productionDatabase).status === 'not_run' && record(plan.execution.productionFunctions).status === 'not_run' &&
    record(plan.execution.runtimeHold).status === 'not_run' && record(plan.execution.templateRelease).status === 'not_run' && record(plan.execution.operationsReadiness).status === 'not_run',
  'A pending Phase 3 plan may not claim partial production evidence.')
}

function validateEvidenceInput(input, plan, nowMs) {
  expect(exactKeys(input, ROLLOUT_PHASE3_FINALIZATION_INPUT_FIELDS), 'Evidence input has missing or unknown fields.')
  expect(text(input.preflightRecordedBy) && text(input.reviewedBy), 'preflightRecordedBy and reviewedBy are required.')
  expect(validDigest(input.overallEvidenceDigest), 'overallEvidenceDigest must be a SHA-256 digest.')
  const preparedAt = time(plan.evidence?.preparedAt)
  const recordedAt = time(input.preflightRecordedAt)
  expect(Number.isFinite(preparedAt) && Number.isFinite(recordedAt) && recordedAt >= preparedAt, 'preflightRecordedAt must be after plan preparation.')
  expect(recordedAt <= nowMs + 5 * 60_000, 'preflightRecordedAt may not be materially in the future.')
  expect(nowMs - recordedAt <= ROLLOUT_PHASE3_MAX_EVIDENCE_AGE_MS, 'Production preflight evidence is older than 24 hours; re-run the preflight rather than finalizing stale evidence.')
  for (const name of ['productionDeployment', 'productionDatabase', 'productionFunctions', 'runtimeHold', 'templateRelease', 'operationsReadiness']) {
    expect(record(input[name]).status === 'attested', `${name} must be an attested production-preflight evidence object.`)
  }
  const sensitive = findSensitiveKey(input)
  expect(!sensitive, `Evidence input includes a forbidden sensitive field at ${sensitive}; record redacted SHA-256 evidence only.`)
}

/**
 * Produces a recorded Phase 3 receipt from an off-tree pending plan and a
 * redacted evidence packet. This writes no production state. The CLI writes
 * only the local canonical receipt after an explicit confirmation.
 */
export function finalizeLegalDocumentRolloutPhase3Receipt({ pendingPlan, evidenceInput, now = Date.now() } = {}) {
  const plan = clone(pendingPlan)
  const input = clone(evidenceInput)
  const nowMs = typeof now === 'number' ? now : Date.parse(now)
  expect(Number.isFinite(nowMs), 'now must be a valid timestamp.')
  validatePendingPlan(plan)
  validateEvidenceInput(input, plan, nowMs)
  const receipt = {
    ...plan,
    status: 'production_preflight_recorded',
    execution: {
      productionDeployment: input.productionDeployment,
      productionDatabase: input.productionDatabase,
      productionFunctions: input.productionFunctions,
      runtimeHold: input.runtimeHold,
      templateRelease: input.templateRelease,
      operationsReadiness: input.operationsReadiness,
      overallEvidenceDigest: input.overallEvidenceDigest,
    },
    evidence: {
      ...plan.evidence,
      preflightRecordedBy: input.preflightRecordedBy,
      reviewedBy: input.reviewedBy,
      preflightRecordedAt: input.preflightRecordedAt,
    },
    manifestDigest: null,
  }
  receipt.manifestDigest = rolloutPhase3ManifestDigest(receipt)
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

function invokedDirectly() {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
}

function main() {
  assertKnownOptions()
  const planArg = option('plan')
  const evidenceArg = option('evidence')
  if (!planArg || !evidenceArg) fail('--plan and --evidence are required.')
  const finalized = finalizeLegalDocumentRolloutPhase3Receipt({
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
  fs.writeFileSync(outputPath, serialized, 'utf8')
  console.log(JSON.stringify({ action: 'wrote_phase3_production_preflight_receipt', outputPath, manifestDigest: finalized.manifestDigest }, null, 2))
}

if (invokedDirectly()) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 3 production-preflight finalizer blocked.')
    process.exitCode = 1
  }
}
