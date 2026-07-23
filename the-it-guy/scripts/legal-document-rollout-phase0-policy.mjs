import { createHash } from 'node:crypto'
import { ROLLOUT_CONTROL_RECEIPT_PATHS } from './legal-document-rollout-source-continuity.mjs'

export const ROLLOUT_PHASE0_CONTRACT = 'legal-document-rollout-freeze-v1'
export const ROLLOUT_PHASE0_AUTHORITY_STATES = Object.freeze({
  'legal-document-release-receipt.json': 'not_issued',
  'legal-document-release-claim.json': 'not_claimed',
  'legal-document-expanded-release-receipt.json': 'not_issued',
  'legal-document-expanded-release-claim.json': 'not_claimed',
  'legal-document-pending-expansion.json': 'not_staged',
  'legal-document-expansion-approval.json': 'not_approved',
  'legal-document-expansion-activation.json': 'not_activated',
  'legal-document-cohort-continuation.json': 'not_recorded',
  'legal-document-expanded-cohort-continuation.json': 'not_recorded',
  'legal-document-next-expansion-approval.json': 'not_approved',
  'legal-document-next-pending-expansion.json': 'not_staged',
  'legal-document-next-expansion-activation.json': 'not_activated',
  'legal-document-next-expansion-activation-plan.json': 'not_planned',
  'legal-document-expansion-activation-plan.json': 'not_planned',
})

export const ROLLOUT_PHASE0_DOES_NOT_VERIFY = Object.freeze([
  'deployed_functions',
  'database_migrations',
  'vercel_artifact',
  'runtime_secrets',
  'live_pilot_state',
  'template_or_storage_drift',
  'legal_approval_currency',
])

// These receipt placeholders are deliberately pre-provisioned in the frozen
// source tree. Their reviewed contents are then committed in later,
// receipt-only commits; allowing a later add would smuggle a new control
// surface into an otherwise immutable release. Any source/runtime change
// outside this short allowlist invalidates the freeze.
export { ROLLOUT_CONTROL_RECEIPT_PATHS as ROLLOUT_PHASE0_CONTROL_RECEIPT_PATHS }

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizedIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].sort()
}

function sameJson(left, right) {
  return stableJson(left) === stableJson(right)
}

function hasExactKeys(value, expected) {
  const actual = Object.keys(record(value)).sort()
  return sameJson(actual, [...expected].sort())
}

function validIsoTime(value, nowMs) {
  const parsed = Date.parse(text(value))
  return Number.isFinite(parsed) && parsed <= nowMs + 5 * 60_000
}

function validSha256(value) {
  return /^sha256:[0-9a-f]{64}$/.test(text(value))
}

function validCommit(value) {
  return /^[0-9a-f]{40}$/i.test(text(value))
}

function validProjectRef(value) {
  return /^[a-z0-9]{8,64}$/.test(text(value))
}

function add(blockers, code, detail) {
  blockers.push({ code, detail })
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function authorityStateDigest(states) {
  return `sha256:${sha256(stableJson(states))}`
}

export function freezeManifestDigest(freeze) {
  const canonical = { ...record(freeze) }
  delete canonical.manifestDigest
  return `sha256:${sha256(stableJson(canonical))}`
}

export function b1ManifestDigest(manifest) {
  const canonical = { ...record(manifest), generatedAt: undefined, manifestDigest: undefined }
  return `sha256:${sha256(stableJson(canonical))}`
}

export function assessLegalDocumentRolloutPhase0Freeze({
  freeze,
  pilot,
  scale,
  reviewManifest,
  authorityStates,
  currentCommit = '',
  sourceContinuity,
  currentPackageLockDigest = '',
  worktreeClean = false,
  creationPaused = true,
  now = Date.now(),
} = {}) {
  const candidate = record(freeze)
  const candidateSource = record(candidate.source)
  const candidateRuntime = record(candidate.runtime)
  const candidateCreation = record(candidate.creation)
  const candidateTemplateReview = record(candidate.templateReview)
  const candidateAuthority = record(candidate.releaseAuthority)
  const candidateExceptions = record(candidate.exceptions)
  const livePilot = record(pilot)
  const liveScale = record(scale)
  const b1 = record(reviewManifest)
  const suppliedAuthorityStates = record(authorityStates)
  const blockers = []

  if (!hasExactKeys(candidate, [
    'allowedPilotOrganisationIds',
    'changeReference',
    'contract',
    'creation',
    'environment',
    'exceptions',
    'frozenAt',
    'frozenBy',
    'legalOwner',
    'manifestDigest',
    'operationsOwner',
    'phase',
    'releaseAuthority',
    'releaseOwner',
    'runtime',
    'source',
    'status',
    'productionProjectRef',
    'templateReview',
    'version',
  ])) add(blockers, 'P0_FREEZE_SCHEMA_INVALID', 'The freeze manifest contains missing or unknown top-level fields.')
  if (candidate.version !== 1 || candidate.phase !== 'ROLL_OUT_0' || candidate.contract !== ROLLOUT_PHASE0_CONTRACT) {
    add(blockers, 'P0_FREEZE_CONTRACT_INVALID', 'The freeze manifest must use the current Phase 0 contract.')
  }
  if (candidate.status !== 'frozen') add(blockers, 'P0_FREEZE_NOT_RECORDED', 'A reviewed frozen manifest is required before release work can continue.')
  if (candidate.environment !== 'production') add(blockers, 'P0_ENVIRONMENT_INVALID', 'Phase 0 is the production-rollout freeze and must explicitly name production.')
  if (!validProjectRef(candidate.productionProjectRef)) add(blockers, 'P0_PRODUCTION_PROJECT_REF_INVALID', 'Record the exact production project reference.')
  if (!validCommit(candidateSource.commitSha)) add(blockers, 'P0_SOURCE_COMMIT_INVALID', 'The freeze must bind one immutable 40-character Git commit SHA.')
  if (!validSha256(candidateSource.packageLockSha256)) add(blockers, 'P0_LOCKFILE_DIGEST_INVALID', 'The freeze must bind the package lockfile digest.')
  if (!validIsoTime(candidate.frozenAt, now)) add(blockers, 'P0_FREEZE_TIMESTAMP_INVALID', 'Record a valid, non-future freeze timestamp.')
  for (const [field, value] of Object.entries({
    frozenBy: candidate.frozenBy,
    releaseOwner: candidate.releaseOwner,
    legalOwner: candidate.legalOwner,
    operationsOwner: candidate.operationsOwner,
    changeReference: candidate.changeReference,
  })) {
    if (!text(value)) add(blockers, 'P0_ACCOUNTABILITY_MISSING', `${field} must be recorded in the freeze manifest.`)
  }
  if (normalizedIds(candidate.allowedPilotOrganisationIds).length || !sameJson(candidate.allowedPilotOrganisationIds, normalizedIds(candidate.allowedPilotOrganisationIds))) {
    add(blockers, 'P0_ALLOWED_COHORT_INVALID', 'The rollout freeze must bind an empty, sorted pilot allowlist.')
  }
  if (!hasExactKeys(candidateRuntime, ['organisationIdsSentinel', 'pilotEnabled']) || candidateRuntime.pilotEnabled !== false || candidateRuntime.organisationIdsSentinel !== '__none__') {
    add(blockers, 'P0_RUNTIME_HOLD_INVALID', 'The manifest must require the disabled pilot kill-switch values.')
  }
  if (!hasExactKeys(candidateCreation, ['paused']) || candidateCreation.paused !== true) {
    add(blockers, 'P0_CREATION_HOLD_INVALID', 'The manifest must keep new pilot creation paused.')
  }
  if (!hasExactKeys(candidateExceptions, ['allowExistingSignerCompletion', 'allowFinalArtifactDownload']) ||
    candidateExceptions.allowExistingSignerCompletion !== true || candidateExceptions.allowFinalArtifactDownload !== true) {
    add(blockers, 'P0_EXISTING_DOCUMENT_EXCEPTION_INVALID', 'Existing signer completion and final-PDF access must remain explicitly preserved.')
  }
  if (!hasExactKeys(candidateTemplateReview, ['boundB1ManifestDigest', 'evidenceProjectRef']) || !validSha256(candidateTemplateReview.boundB1ManifestDigest)) {
    add(blockers, 'P0_B1_BINDING_INVALID', 'The freeze must bind the B1 review-manifest digest.')
  }
  if (!validProjectRef(candidateTemplateReview.evidenceProjectRef)) {
    add(blockers, 'P0_B1_EVIDENCE_PROJECT_INVALID', 'The freeze must name the project that produced the bound B1 evidence.')
  }
  if (text(candidate.productionProjectRef) === text(candidateTemplateReview.evidenceProjectRef)) {
    add(blockers, 'P0_ENVIRONMENT_IDENTITY_COLLISION', 'Production and B1 evidence projects must be recorded as distinct environments.')
  }
  if (!hasExactKeys(candidateAuthority, ['stateDigest', 'states']) || !sameJson(candidateAuthority.states, ROLLOUT_PHASE0_AUTHORITY_STATES) ||
    candidateAuthority.stateDigest !== authorityStateDigest(ROLLOUT_PHASE0_AUTHORITY_STATES)) {
    add(blockers, 'P0_RELEASE_AUTHORITY_HOLD_INVALID', 'The freeze must bind every initial and expansion authority to its inert state.')
  }
  if (!validSha256(candidate.manifestDigest) || candidate.manifestDigest !== freezeManifestDigest(candidate)) {
    add(blockers, 'P0_MANIFEST_DIGEST_INVALID', 'The manifest digest does not match the frozen content.')
  }

  if (livePilot.enabled !== false) add(blockers, 'P0_PILOT_ENABLED', 'The repository pilot must remain disabled during the freeze.')
  if (normalizedIds(livePilot.organisationIds).length) add(blockers, 'P0_PILOT_COHORT_NOT_EMPTY', 'The effective repository pilot cohort must remain empty during the freeze.')
  if (normalizedIds(livePilot.releasePreparation?.organisationIds).length) add(blockers, 'P0_RELEASE_COHORT_NOT_EMPTY', 'The release-preparation cohort must remain empty during the freeze.')
  if (!['inactive', 'deactivated'].includes(text(livePilot.activation?.status))) add(blockers, 'P0_PILOT_ACTIVATION_NOT_INERT', 'The repository pilot activation must be inactive or deactivated.')
  if (liveScale.enabled !== false) add(blockers, 'P0_SCALE_ENABLED', 'Scale-up must remain disabled during the freeze.')
  if (text(b1.phase) !== 'B1' || text(b1.status) !== 'frozen_for_counsel_review' || !validSha256(b1.manifestDigest) || b1.manifestDigest !== b1ManifestDigest(b1)) {
    add(blockers, 'P0_B1_MANIFEST_INVALID', 'The bound B1 manifest is malformed or its self-digest does not match.')
  }
  if (candidateTemplateReview.boundB1ManifestDigest !== text(b1.manifestDigest)) {
    add(blockers, 'P0_B1_MANIFEST_DRIFT', 'The current B1 manifest differs from the freeze binding.')
  }
  if (text(candidateTemplateReview.evidenceProjectRef) !== text(b1.projectRef)) {
    add(blockers, 'P0_B1_EVIDENCE_PROJECT_DRIFT', 'The B1 evidence project reference no longer matches the bound manifest.')
  }
  if (!sameJson(suppliedAuthorityStates, ROLLOUT_PHASE0_AUTHORITY_STATES)) {
    add(blockers, 'P0_RELEASE_AUTHORITY_ACTIVE', 'A release or expansion authority record is no longer inert.')
  }
  const continuity = record(sourceContinuity)
  const sourceCommitMatches = text(currentCommit).toLowerCase() === text(candidateSource.commitSha).toLowerCase()
  const continuityBindsSource = text(continuity.sourceCommitSha).toLowerCase() === text(candidateSource.commitSha).toLowerCase() &&
    text(continuity.currentCommitSha).toLowerCase() === text(currentCommit).toLowerCase()
  const continuityExact = sourceCommitMatches && continuity.status === 'EXACT' && continuityBindsSource
  const controlReceiptOnly = !sourceCommitMatches && continuity.status === 'RECEIPT_ONLY_DESCENDANT' && continuityBindsSource &&
    continuity.phase0FreezeChangeCount === 1 && Array.isArray(continuity.commits) && continuity.commits.length > 0
  if (!continuityExact && !controlReceiptOnly) {
    add(blockers, 'P0_SOURCE_COMMIT_DRIFT', 'The checked-out source differs from the frozen candidate outside a verified linear receipt-only commit chain.')
  }
  if (text(currentPackageLockDigest) !== text(candidateSource.packageLockSha256)) {
    add(blockers, 'P0_LOCKFILE_DRIFT', 'The package lockfile no longer matches the frozen release candidate.')
  }
  if (!worktreeClean) add(blockers, 'P0_WORKTREE_DIRTY', 'The release workspace must be clean, including untracked files.')
  if (creationPaused !== true) add(blockers, 'P0_CREATION_PAUSE_CLEARED', 'New pilot creation has been explicitly enabled locally.')

  return {
    phase: 'ROLL_OUT_0',
    contract: ROLLOUT_PHASE0_CONTRACT,
    scope: 'local_repository',
    status: blockers.length ? 'HOLD' : 'FROZEN',
    blockerCount: blockers.length,
    blockers,
    evidence: {
      productionProjectRef: text(candidate.productionProjectRef) || null,
      sourceCommitSha: text(candidateSource.commitSha) || null,
      boundB1ManifestDigest: text(candidateTemplateReview.boundB1ManifestDigest) || null,
      b1EvidenceProjectRef: text(candidateTemplateReview.evidenceProjectRef) || null,
      authorityStateDigest: text(candidateAuthority.stateDigest) || null,
      worktreeClean: Boolean(worktreeClean),
      controlReceiptOnly,
      sourceContinuity: continuity.status || null,
      phase1ReceiptChangeCount: Number.isInteger(continuity.phase1ReceiptChangeCount) ? continuity.phase1ReceiptChangeCount : null,
      phase2ReceiptChangeCount: Number.isInteger(continuity.phase2ReceiptChangeCount) ? continuity.phase2ReceiptChangeCount : null,
      phase3ReceiptChangeCount: Number.isInteger(continuity.phase3ReceiptChangeCount) ? continuity.phase3ReceiptChangeCount : null,
      phase4ReceiptChangeCount: Number.isInteger(continuity.phase4ReceiptChangeCount) ? continuity.phase4ReceiptChangeCount : null,
      phase5ReceiptChangeCount: Number.isInteger(continuity.phase5ReceiptChangeCount) ? continuity.phase5ReceiptChangeCount : null,
      currentCommitSha: text(currentCommit) || null,
    },
    doesNotVerify: [...ROLLOUT_PHASE0_DOES_NOT_VERIFY],
    mutatedData: false,
  }
}
