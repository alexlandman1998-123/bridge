import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assessLegalDocumentRolloutPhase7,
  ROLLOUT_PHASE7_CONTRACT,
  rolloutPhase7EvidencePacketDigest,
  rolloutPhase7ManifestDigest,
} from './legal-document-rollout-phase7-policy.mjs'
import { collectLegalDocumentRolloutPhase7Context } from './legal-document-rollout-phase7-context.mjs'
import { stableValue } from './legal-document-rollout-phase1-artifacts.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const CANONICAL_RECEIPT_PATH = path.join(APP_ROOT, 'config', 'legal-document-rollout-phase7-successor-implementation-boundary.json')
const WRITE_CONFIRMATION = 'RECORD_PHASE7_IMPLEMENTATION_BOUNDARY'
const DIGEST = /^sha256:[0-9a-f]{64}$/
const INERT_TOP_LEVEL_KEYS = Object.freeze([
  'boundary', 'changeSurface', 'cohort', 'contract', 'environment', 'evidence', 'manifestDigest', 'migrationReference', 'phase', 'safety', 'source', 'status', 'version',
])
const INERT_SOURCE_KEYS = Object.freeze([
  'activationPlanDigest', 'boundaryPlanDigest', 'commitSha', 'implementationCommitDiffDigest', 'implementationCommitSha', 'implementationSourceTreeDigest', 'packageLockSha256', 'phase4ReceiptCommitSha', 'phase4ReceiptManifestDigest', 'phase5ObservationPlanDigest', 'phase5ReceiptCommitSha', 'phase5ReceiptManifestDigest', 'phase6EvidencePacketDigest', 'phase6ProposalPlanDigest', 'phase6ReceiptCommitSha', 'phase6ReceiptManifestDigest',
])
const INERT_EVIDENCE_KEYS = Object.freeze([
  'architectureReviewActorReference', 'architectureReviewEvidenceDigest', 'architectureReviewReviewedAt', 'boundaryRecordedAt', 'boundaryRecordedByReference', 'changeReference', 'evidencePacketDigest', 'nonActivationReviewActorReference', 'nonActivationReviewEvidenceDigest', 'nonActivationReviewReviewedAt', 'preparedAt', 'preparedByReference', 'reviewedByReference', 'securityReviewActorReference', 'securityReviewEvidenceDigest', 'securityReviewReviewedAt',
])
const INERT_COHORT_KEYS = Object.freeze(['cohortDigest', 'maxOrganisations', 'organisationIds', 'requiredPacketTypes'])
const INERT_MIGRATION_KEYS = Object.freeze(['migrationId', 'migrationInvariantDigest', 'migrationSourceDigest', 'state'])
const INERT_BOUNDARY_KEYS = Object.freeze(['authority', 'kind', 'requestedAction'])
const INERT_CHANGE_SURFACE_KEYS = Object.freeze(['customerEgress', 'deployment', 'membership', 'phase6Migration', 'releaseEpoch', 'runtime', 'templates'])
const INERT_SAFETY_KEYS = Object.freeze(['noActivationAuthorization', 'noCustomerDocumentAuthorization', 'noCustomerEmailAuthorization', 'noDeploymentAuthorization', 'noEpochPreparationAuthorization', 'noMembershipRegistrationAuthorization', 'noRollbackAuthorization', 'noRuntimeChangeAuthorization', 'noScaleAuthorization', 'noSecondOrganisationAuthorization'])

export const ROLLOUT_PHASE7_FINALIZATION_INPUT_FIELDS = Object.freeze([
  'architectureReview', 'boundaryRecordedAt', 'boundaryRecordedByReference', 'nonActivationReview', 'reviewedByReference', 'securityReview',
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
  throw new Error(`Phase 7 implementation-boundary finalizer blocked: ${message}`)
}

function exactKeys(value, fields) {
  const actual = Object.keys(record(value)).sort()
  const expected = [...fields].sort()
  return actual.length === expected.length && actual.every((item, index) => item === expected[index])
}

function inertPlaceholderShape(value) {
  const receipt = record(value)
  const source = record(receipt.source)
  const evidence = record(receipt.evidence)
  const cohort = record(receipt.cohort)
  const migration = record(receipt.migrationReference)
  const boundary = record(receipt.boundary)
  const changeSurface = record(receipt.changeSurface)
  const safety = record(receipt.safety)
  return exactKeys(receipt, INERT_TOP_LEVEL_KEYS) && exactKeys(source, INERT_SOURCE_KEYS) && exactKeys(evidence, INERT_EVIDENCE_KEYS) &&
    exactKeys(cohort, INERT_COHORT_KEYS) && exactKeys(migration, INERT_MIGRATION_KEYS) && exactKeys(boundary, INERT_BOUNDARY_KEYS) &&
    exactKeys(changeSurface, INERT_CHANGE_SURFACE_KEYS) && exactKeys(safety, INERT_SAFETY_KEYS) && receipt.version === 1 && receipt.phase === 'ROLL_OUT_7' &&
    receipt.contract === ROLLOUT_PHASE7_CONTRACT && receipt.status === 'not_recorded' && receipt.manifestDigest === null &&
    Object.values(source).every((item) => item === null) && Object.values(evidence).every((item) => item === null) &&
    Array.isArray(cohort.organisationIds) && cohort.organisationIds.length === 0 && cohort.cohortDigest === null && cohort.maxOrganisations === 1 &&
    Array.isArray(cohort.requiredPacketTypes) && cohort.requiredPacketTypes.length === 0 &&
    migration.migrationId === 'phase6_server_owned_release_epoch_integrity' && migration.migrationSourceDigest === null && migration.migrationInvariantDigest === null && migration.state === 'unapplied_reference_only' &&
    boundary.kind === 'successor_implementation_boundary_only' && boundary.authority === 'non_authoritative' && boundary.requestedAction === 'separately_authorised_future_implementation_review_only' &&
    changeSurface.phase6Migration === 'unapplied_reference_only' && changeSurface.releaseEpoch === 'absent_no_epoch_id' && changeSurface.membership === 'no_candidate_or_membership_assignment' &&
    changeSurface.runtime === 'no_runtime_hook_or_allowlist_change' && changeSurface.deployment === 'no_deployment_or_production_activation' && changeSurface.customerEgress === 'no_customer_document_or_email_delivery' && changeSurface.templates === 'unchanged' &&
    Object.values(safety).every((item) => item === true)
}

function validDigest(value) {
  return DIGEST.test(text(value))
}

// Human-readable names are deliberately not valid evidence actors. These
// identifiers must be opaque, lower-case, and structured for redacted review.
function validOpaqueReference(value) {
  return /^[a-z][a-z0-9]{2,31}(?:_[a-z0-9]{2,31}){1,3}$/.test(text(value))
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
    if (/(?:@|https?:\/\/|bearer\s|-----begin|eyJ[a-zA-Z0-9_-]{10,}|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b)/i.test(value)) return `${currentPath} (sensitive-looking value)`
    return null
  }
  if (!value || typeof value !== 'object') return null
  for (const [key, nested] of Object.entries(value)) {
    if (/(?:credential|password|secret|token|authorization|signedurl|email|phone|address|rawlog|documentbytes|storagepath|artifactpath|signer|customer|organisationid|candidate|membership|epochid|name)/i.test(key)) return `${currentPath}.${key}`
    const found = findSensitiveContent(nested, `${currentPath}.${key}`)
    if (found) return found
  }
  return null
}

function validatePendingPlan(plan, context, nowMs) {
  expect(record(plan).status === 'pending_boundary', 'Only a pending_boundary plan can be finalized.')
  expect(validDigest(plan.manifestDigest) && plan.manifestDigest === rolloutPhase7ManifestDigest(plan), 'The pending boundary digest does not match its contents.')
  const report = assessLegalDocumentRolloutPhase7({
    receipt: plan,
    phase6History: context.phase6History,
    staticBoundaryFacts: context.staticBoundaryFacts,
    now: nowMs,
  })
  expect(report.status === 'IMPLEMENTATION_BOUNDARY_READY', 'The pending boundary no longer binds valid committed Phase 6 history and immutable implementation-source facts.')
}

function validateReview(value, name) {
  expect(exactKeys(value, ['actorReference', 'evidenceDigest', 'reviewedAt']), `${name} must contain only actorReference, evidenceDigest, and reviewedAt.`)
  expect(validOpaqueReference(value?.actorReference) && validDigest(value?.evidenceDigest) && Number.isFinite(time(value?.reviewedAt)), `${name} must contain a redacted SHA-256 digest, opaque actor reference, and timestamp.`)
}

function validateEvidenceInput(input, plan, nowMs) {
  expect(exactKeys(input, ROLLOUT_PHASE7_FINALIZATION_INPUT_FIELDS), 'Evidence input has missing or unknown fields.')
  validateReview(input.architectureReview, 'architectureReview')
  validateReview(input.securityReview, 'securityReview')
  validateReview(input.nonActivationReview, 'nonActivationReview')
  expect(validOpaqueReference(input.boundaryRecordedByReference) && validOpaqueReference(input.reviewedByReference), 'boundaryRecordedByReference and reviewedByReference must be safe opaque references.')
  const preparedAt = time(plan.evidence?.preparedAt)
  const recordedAt = time(input.boundaryRecordedAt)
  expect(Number.isFinite(preparedAt) && Number.isFinite(recordedAt) && recordedAt >= preparedAt && recordedAt <= nowMs + 5 * 60_000,
    'boundaryRecordedAt must be after plan preparation and may not be materially in the future.')
  const sensitive = findSensitiveContent(input)
  expect(!sensitive, `Evidence input includes a forbidden sensitive field or value at ${sensitive}; use redacted SHA-256 evidence only.`)
}

/**
 * Produces a local, immutable Phase 7 boundary receipt. It has no provider,
 * database, migration, deployment, runtime, email, customer, or rollback
 * capability; it only validates redacted local evidence against Git blobs.
 */
export function finalizeLegalDocumentRolloutPhase7Receipt({ pendingPlan, evidenceInput, phase6History, staticBoundaryFacts, now = Date.now() } = {}) {
  const plan = clone(pendingPlan)
  const input = clone(evidenceInput)
  const nowMs = typeof now === 'number' ? now : Date.parse(now)
  expect(Number.isFinite(nowMs), 'now must be a valid timestamp.')
  const context = { phase6History, staticBoundaryFacts }
  validatePendingPlan(plan, context, nowMs)
  validateEvidenceInput(input, plan, nowMs)
  const receipt = {
    ...plan,
    status: 'implementation_boundary_recorded',
    evidence: {
      ...plan.evidence,
      architectureReviewEvidenceDigest: input.architectureReview.evidenceDigest,
      architectureReviewReviewedAt: input.architectureReview.reviewedAt,
      architectureReviewActorReference: input.architectureReview.actorReference,
      securityReviewEvidenceDigest: input.securityReview.evidenceDigest,
      securityReviewReviewedAt: input.securityReview.reviewedAt,
      securityReviewActorReference: input.securityReview.actorReference,
      nonActivationReviewEvidenceDigest: input.nonActivationReview.evidenceDigest,
      nonActivationReviewReviewedAt: input.nonActivationReview.reviewedAt,
      nonActivationReviewActorReference: input.nonActivationReview.actorReference,
      boundaryRecordedAt: input.boundaryRecordedAt,
      boundaryRecordedByReference: input.boundaryRecordedByReference,
      reviewedByReference: input.reviewedByReference,
      evidencePacketDigest: null,
    },
    manifestDigest: null,
  }
  receipt.evidence.evidencePacketDigest = rolloutPhase7EvidencePacketDigest(receipt)
  receipt.manifestDigest = rolloutPhase7ManifestDigest(receipt)
  const report = assessLegalDocumentRolloutPhase7({
    receipt,
    phase6History,
    staticBoundaryFacts,
    now: nowMs,
  })
  expect(report.status === 'IMPLEMENTATION_BOUNDARY_RECORDED', 'The supplied evidence cannot produce a valid non-executable implementation-boundary receipt.')
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

function assertRegularFile(filePath, label) {
  const stat = fs.lstatSync(filePath)
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o644) fail(`${label} must be a regular non-symlink mode-0644 file.`)
}

export function assertCanonicalPhase7ReceiptPlaceholder(outputPath) {
  if (!fs.existsSync(outputPath)) fail('The canonical Phase 7 receipt placeholder is missing; it must have been pre-provisioned as an inert regular file.')
  assertRegularFile(outputPath, 'The canonical Phase 7 receipt placeholder')
  let current
  try {
    current = readJson(outputPath)
  } catch (error) {
    fail(`The canonical Phase 7 receipt placeholder is unreadable: ${error instanceof Error ? error.message : 'unknown error'}`)
  }
  if (!inertPlaceholderShape(current)) fail('The canonical Phase 7 receipt is not the exact inert placeholder preimage and may not be overwritten.')
}

export function writeCanonicalPhase7ReceiptAtomically(outputPath, serialized) {
  const lockPath = `${outputPath}.phase7.lock`
  const temporaryPath = `${outputPath}.phase7-${process.pid}.tmp`
  let lockFd = null
  try {
    lockFd = fs.openSync(lockPath, 'wx', 0o600)
    fs.writeFileSync(lockFd, 'Phase 7 receipt finalization lock\n', 'utf8')
    fs.fsyncSync(lockFd)
    fs.closeSync(lockFd)
    lockFd = null
    assertCanonicalPhase7ReceiptPlaceholder(outputPath)
    const temporaryFd = fs.openSync(temporaryPath, 'wx', 0o600)
    try {
      fs.writeFileSync(temporaryFd, serialized, 'utf8')
      fs.fsyncSync(temporaryFd)
      fs.fchmodSync(temporaryFd, 0o644)
    } finally {
      fs.closeSync(temporaryFd)
    }
    assertRegularFile(temporaryPath, 'The temporary Phase 7 receipt')
    fs.renameSync(temporaryPath, outputPath)
    assertRegularFile(outputPath, 'The written Phase 7 receipt')
  } finally {
    try {
      if (lockFd !== null) fs.closeSync(lockFd)
    } catch {}
    try {
      if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath)
    } catch {}
    try {
      if (fs.existsSync(lockPath)) {
        const lockStat = fs.lstatSync(lockPath)
        if (lockStat.isFile() && !lockStat.isSymbolicLink()) fs.unlinkSync(lockPath)
      }
    } catch {}
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
  const context = collectLegalDocumentRolloutPhase7Context({
    phase6ReceiptCommitSha: pendingPlan.source?.phase6ReceiptCommitSha,
    implementationCommitSha: pendingPlan.source?.implementationCommitSha,
  })
  const finalized = finalizeLegalDocumentRolloutPhase7Receipt({
    pendingPlan,
    evidenceInput: readJson(path.resolve(process.cwd(), evidenceArg)),
    phase6History: context.phase6History,
    staticBoundaryFacts: context.staticBoundaryFacts,
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
  assertCanonicalPhase7ReceiptPlaceholder(outputPath)
  writeCanonicalPhase7ReceiptAtomically(outputPath, serialized)
  console.log(JSON.stringify({
    action: 'wrote_non_executable_phase7_implementation_boundary_receipt',
    outputPath,
    manifestDigest: finalized.manifestDigest,
    authority: 'none',
    followUp: 'A separately committed receipt-only Git commit is required before any later control may treat this local file as immutable input.',
  }, null, 2))
}

if (invokedDirectly()) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Phase 7 implementation-boundary finalizer blocked.')
    process.exitCode = 1
  }
}
