import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assessLegalDocumentRolloutPhase6,
  rolloutPhase6EvidencePacketDigest,
  rolloutPhase6ManifestDigest,
} from './legal-document-rollout-phase6-policy.mjs'
import { collectLegalDocumentRolloutPhase6Context } from './legal-document-rollout-phase6-context.mjs'
import { stableValue } from './legal-document-rollout-phase1-artifacts.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const CANONICAL_RECEIPT_PATH = path.join(APP_ROOT, 'config', 'legal-document-rollout-phase6-successor-proposal.json')
const WRITE_CONFIRMATION = 'RECORD_PHASE6_SUCCESSOR_PROPOSAL'
const DIGEST = /^sha256:[0-9a-f]{64}$/

export const ROLLOUT_PHASE6_FINALIZATION_INPUT_FIELDS = Object.freeze([
  'inventory', 'legalApproval', 'proposalRecordedAt', 'proposalRecordedByReference', 'releaseApproval', 'releaseEpochReadiness', 'reviewedByReference',
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
  throw new Error(`Phase 6 successor-proposal finalizer blocked: ${message}`)
}

function exactKeys(value, fields) {
  const actual = Object.keys(record(value)).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length && actual.every((item, index) => item === expected[index])
}

function validDigest(value) {
  return DIGEST.test(text(value))
}

function validReference(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(text(value)) && !/[\/@\s]/.test(text(value))
}

function time(value) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) ? parsed : NaN
}

function expect(condition, message) {
  if (!condition) fail(message)
}

function findSensitiveContent(value, currentPath = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitiveContent(value[index], `${currentPath}[${index}]`)
      if (found) return found
    }
    return null
  }
  if (typeof value === 'string') {
    if (/(?:@|https?:\/\/|bearer\s|-----begin|eyJ[a-zA-Z0-9_-]{10,})/i.test(value)) return `${currentPath} (sensitive-looking value)`
    return null
  }
  if (!value || typeof value !== 'object') return null
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:credential|password|secret|token|authorization|signedurl|email|phone|address|rawlog|documentbytes|storagepath|artifactpath|signer|customer|organisationid|candidateid)/i.test(key)) return `${currentPath}.${key}`
    const found = findSensitiveContent(nested, `${currentPath}.${key}`)
    if (found) return found
  }
  return null
}

function validatePendingPlan(plan, phase5History, nowMs) {
  expect(record(plan).status === 'pending_proposal', 'Only a pending_proposal plan can be finalized.')
  expect(validDigest(plan.manifestDigest) && plan.manifestDigest === rolloutPhase6ManifestDigest(plan), 'The pending proposal digest does not match its contents.')
  const report = assessLegalDocumentRolloutPhase6({ receipt: plan, phase5History, now: nowMs })
  expect(report.status === 'SUCCESSOR_PROPOSAL_READY', 'The pending proposal no longer binds a valid committed Phase 5 receipt and non-authority boundary.')
}

function validateEvidenceInput(input, plan, nowMs) {
  expect(exactKeys(input, ROLLOUT_PHASE6_FINALIZATION_INPUT_FIELDS), 'Evidence input has missing or unknown fields.')
  expect(exactKeys(input.inventory, ['candidateCount', 'candidateInventoryDigest']), 'inventory must contain only candidateCount and candidateInventoryDigest.')
  expect(Number.isInteger(input.inventory?.candidateCount) && input.inventory.candidateCount >= 0 && validDigest(input.inventory?.candidateInventoryDigest), 'The inventory must contain only a non-negative aggregate count and SHA-256 digest.')
  for (const key of ['legalApproval', 'releaseApproval']) {
    expect(exactKeys(input[key], ['actorReference', 'approvedAt', 'evidenceDigest']), `${key} must contain only actorReference, approvedAt, and evidenceDigest.`)
    expect(validReference(input[key]?.actorReference) && validDigest(input[key]?.evidenceDigest) && Number.isFinite(time(input[key]?.approvedAt)), `${key} must contain a safe opaque actor reference, timestamp, and SHA-256 digest.`)
  }
  expect(exactKeys(input.releaseEpochReadiness, [
    'legacyA3Q2V2MutatorRetirementEvidenceDigest', 'releaseEpochMigrationEvidenceDigest', 'v1AllowlistPreservationEvidenceDigest',
  ]), 'releaseEpochReadiness must contain only the required redacted readiness evidence digests.')
  for (const value of Object.values(record(input.releaseEpochReadiness))) expect(validDigest(value), 'Every release-epoch readiness field must be a SHA-256 digest.')
  expect(validReference(input.proposalRecordedByReference) && validReference(input.reviewedByReference), 'proposalRecordedByReference and reviewedByReference must be safe opaque references.')
  const preparedAt = time(plan.evidence?.preparedAt)
  const recordedAt = time(input.proposalRecordedAt)
  expect(Number.isFinite(preparedAt) && Number.isFinite(recordedAt) && recordedAt >= preparedAt && recordedAt <= nowMs + 5 * 60_000,
    'proposalRecordedAt must be after plan preparation and may not be materially in the future.')
  const sensitive = findSensitiveContent(input)
  expect(!sensitive, `Evidence input includes a forbidden sensitive field or value at ${sensitive}; use redacted SHA-256 evidence only.`)
}

/**
 * Produces an immutable local Phase 6 proposal receipt. It has no client,
 * provider, deployment, email, database, runtime, or rollback capability.
 */
export function finalizeLegalDocumentRolloutPhase6Receipt({ pendingPlan, evidenceInput, phase5History, now = Date.now() } = {}) {
  const plan = clone(pendingPlan)
  const input = clone(evidenceInput)
  const nowMs = typeof now === 'number' ? now : Date.parse(now)
  expect(Number.isFinite(nowMs), 'now must be a valid timestamp.')
  validatePendingPlan(plan, phase5History, nowMs)
  validateEvidenceInput(input, plan, nowMs)
  const receipt = {
    ...plan,
    status: 'successor_proposal_recorded',
    inventory: {
      ...plan.inventory,
      candidateCount: input.inventory.candidateCount,
      candidateInventoryDigest: input.inventory.candidateInventoryDigest,
    },
    releaseEpochReadiness: {
      ...plan.releaseEpochReadiness,
      releaseEpochMigrationEvidenceDigest: input.releaseEpochReadiness.releaseEpochMigrationEvidenceDigest,
      legacyA3Q2V2MutatorRetirementEvidenceDigest: input.releaseEpochReadiness.legacyA3Q2V2MutatorRetirementEvidenceDigest,
      v1AllowlistPreservationEvidenceDigest: input.releaseEpochReadiness.v1AllowlistPreservationEvidenceDigest,
    },
    evidence: {
      ...plan.evidence,
      legalApprovalEvidenceDigest: input.legalApproval.evidenceDigest,
      legalApprovalApprovedAt: input.legalApproval.approvedAt,
      legalApprovalActorReference: input.legalApproval.actorReference,
      releaseApprovalEvidenceDigest: input.releaseApproval.evidenceDigest,
      releaseApprovalApprovedAt: input.releaseApproval.approvedAt,
      releaseApprovalActorReference: input.releaseApproval.actorReference,
      proposalRecordedAt: input.proposalRecordedAt,
      proposalRecordedByReference: input.proposalRecordedByReference,
      reviewedByReference: input.reviewedByReference,
      evidencePacketDigest: null,
    },
    manifestDigest: null,
  }
  receipt.evidence.evidencePacketDigest = rolloutPhase6EvidencePacketDigest(receipt)
  receipt.manifestDigest = rolloutPhase6ManifestDigest(receipt)
  const report = assessLegalDocumentRolloutPhase6({ receipt, phase5History, now: nowMs })
  expect(report.status === 'SUCCESSOR_PROPOSAL_RECORDED', 'The supplied evidence cannot produce a valid non-authoritative successor proposal receipt.')
  return stableValue(receipt)
}

function option(name) {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || ''
}

function assertKnownOptions() {
  const allowed = new Set(['plan', 'evidence', 'out', 'confirm-write'])
  for (const value of process.argv.slice(2)) {
    if (!value.startsWith('--')) throw new Error(`Unknown argument: ${value}`)
    if (!allowed.has(value.slice(2).split('=')[0])) throw new Error(`Unknown argument: ${value}`)
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function assertCanonicalReceiptIsStillPlaceholder(outputPath) {
  if (!fs.existsSync(outputPath)) fail('The canonical Phase 6 receipt placeholder is missing; it must have been pre-provisioned as an inert file.')
  let current
  try {
    current = readJson(outputPath)
  } catch (error) {
    fail(`The canonical Phase 6 receipt placeholder is unreadable: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
  if (record(current).status !== 'not_recorded') {
    fail('The canonical Phase 6 receipt is no longer an inert not_recorded placeholder and may not be overwritten.')
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
  const pendingPlan = readJson(path.resolve(process.cwd(), planArg))
  const context = collectLegalDocumentRolloutPhase6Context({ phase5ReceiptCommitSha: pendingPlan.source?.phase5ReceiptCommitSha })
  const finalized = finalizeLegalDocumentRolloutPhase6Receipt({
    pendingPlan,
    evidenceInput: readJson(path.resolve(process.cwd(), evidenceArg)),
    phase5History: context.phase5History,
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
  console.log(JSON.stringify({
    action: 'wrote_non_authoritative_phase6_successor_proposal_receipt',
    outputPath,
    manifestDigest: finalized.manifestDigest,
    authority: 'none',
  }, null, 2))
}

if (invokedDirectly()) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 6 successor-proposal finalizer blocked.')
    process.exitCode = 1
  }
}
