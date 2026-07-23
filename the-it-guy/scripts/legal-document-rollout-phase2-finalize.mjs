import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ROLLOUT_PHASE2_REQUIRED_SCENARIOS,
  ROLLOUT_PHASE2_MAX_EVIDENCE_AGE_MS,
  rolloutPhase2ManifestDigest,
} from './legal-document-rollout-phase2-policy.mjs'
import { stableValue } from './legal-document-rollout-phase1-artifacts.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const CANONICAL_RECEIPT_PATH = path.join(APP_ROOT, 'config', 'legal-document-rollout-phase2-staging-acceptance.json')
const WRITE_CONFIRMATION = 'RECORD_PHASE2_ACCEPTANCE'
const DIGEST = /^sha256:[0-9a-f]{64}$/

export const ROLLOUT_PHASE2_FINALIZATION_INPUT_FIELDS = Object.freeze([
  'acceptanceRecordedAt',
  'acceptanceRecordedBy',
  'browserEvidence',
  'cleanupEvidence',
  'fixtureWrites',
  'overallEvidenceDigest',
  'reviewedBy',
  'scenarios',
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
  throw new Error(`Phase 2 receipt finalizer blocked: ${message}`)
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

function validatePendingPlan(plan) {
  expect(record(plan).status === 'pending_acceptance', 'Only a pending_acceptance plan can be finalized.')
  expect(validDigest(plan.manifestDigest) && plan.manifestDigest === rolloutPhase2ManifestDigest(plan), 'The pending plan digest does not match its contents.')
  expect(record(plan.safety).pilotEnabled === false && record(plan.safety).scaleEnabled === false && record(plan.safety).creationPaused === true,
    'The pending plan must retain the disabled rollout posture.')
  expect(record(plan.safety).externalRecipientPolicy === 'controlled_test_mailbox_only' && record(plan.safety).physicalSigningRequired === true,
    'The pending plan must retain the controlled-mailbox and required physical-signature safeguards.')
  expect(Number(plan.evidence?.fixtureWrites) === 0 && Array.isArray(plan.execution?.scenarios) && plan.execution.scenarios.length === 0,
    'A pending plan may not claim fixture or acceptance evidence.')
}

function validateEvidenceInput(input, plan, nowMs) {
  expect(exactKeys(input, ROLLOUT_PHASE2_FINALIZATION_INPUT_FIELDS), 'Evidence input has missing or unknown fields.')
  expect(text(input.acceptanceRecordedBy) && text(input.reviewedBy), 'acceptanceRecordedBy and reviewedBy are required.')
  expect(validDigest(input.overallEvidenceDigest), 'overallEvidenceDigest must be a SHA-256 digest.')
  expect(Number.isInteger(input.fixtureWrites) && input.fixtureWrites >= 0 && input.fixtureWrites <= plan.safety.fixtureWriteLimit,
    'fixtureWrites must be within the pending plan bound.')
  expect(Array.isArray(input.scenarios) && input.scenarios.length === ROLLOUT_PHASE2_REQUIRED_SCENARIOS.length &&
    input.scenarios.map((item) => record(item).scenario).every((scenario, index) => scenario === ROLLOUT_PHASE2_REQUIRED_SCENARIOS[index]),
  'Evidence input must contain the exact ordered Phase 2 scenario matrix.')
  expect(record(input.browserEvidence).previewUrl === plan.environment?.previewUrl && record(input.browserEvidence).previewReleaseId === plan.environment?.previewReleaseId,
    'Browser evidence must bind the pending plan’s Phase 1-attested preview and release.')
  const preparedAt = time(plan.evidence?.preparedAt)
  const recordedAt = time(input.acceptanceRecordedAt)
  expect(Number.isFinite(preparedAt) && Number.isFinite(recordedAt) && recordedAt >= preparedAt, 'acceptanceRecordedAt must be after plan preparation.')
  expect(recordedAt <= nowMs + 5 * 60_000, 'acceptanceRecordedAt may not be materially in the future.')
  expect(nowMs - recordedAt <= ROLLOUT_PHASE2_MAX_EVIDENCE_AGE_MS, 'Acceptance evidence is older than 24 hours; rerun acceptance rather than finalizing stale evidence.')
}

export function finalizeLegalDocumentRolloutPhase2Receipt({ pendingPlan, evidenceInput, now = Date.now() } = {}) {
  validatePendingPlan(pendingPlan)
  validateEvidenceInput(evidenceInput, pendingPlan, now)
  const receipt = clone(pendingPlan)
  receipt.status = 'acceptance_evidence_recorded'
  receipt.execution = {
    scenarios: clone(evidenceInput.scenarios),
    browserEvidence: clone(evidenceInput.browserEvidence),
    cleanupEvidence: clone(evidenceInput.cleanupEvidence),
    overallEvidenceDigest: evidenceInput.overallEvidenceDigest,
  }
  receipt.evidence = {
    ...receipt.evidence,
    fixtureWrites: evidenceInput.fixtureWrites,
    acceptanceRecordedBy: evidenceInput.acceptanceRecordedBy,
    reviewedBy: evidenceInput.reviewedBy,
    acceptanceRecordedAt: evidenceInput.acceptanceRecordedAt,
  }
  receipt.manifestDigest = rolloutPhase2ManifestDigest(receipt)
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
  const finalized = finalizeLegalDocumentRolloutPhase2Receipt({
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
  console.log(JSON.stringify({ action: 'wrote_phase2_acceptance_receipt', outputPath, manifestDigest: finalized.manifestDigest }, null, 2))
}

if (invokedDirectly()) {
  try {
    main()
  } catch (cause) {
    console.error(cause instanceof Error ? cause.message : 'Phase 2 receipt finalizer blocked.')
    process.exitCode = 1
  }
}
