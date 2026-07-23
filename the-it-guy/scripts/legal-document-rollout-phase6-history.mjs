import { spawnSync } from 'node:child_process'
import {
  assessLegalDocumentRolloutPhase6,
  ROLLOUT_PHASE6_CONTRACT,
  rolloutPhase6ManifestDigest,
} from './legal-document-rollout-phase6-policy.mjs'
import {
  ROLLOUT_PHASE5_CONTRACT,
  rolloutPhase5ManifestDigest,
} from './legal-document-rollout-phase5-policy.mjs'
import { collectLegalDocumentRolloutPhase5History, ROLLOUT_PHASE5_RECEIPT_PATH } from './legal-document-rollout-phase5-history.mjs'
import { collectRolloutSourceContinuity } from './legal-document-rollout-source-continuity.mjs'
import { sha256Digest, stableJson } from './legal-document-rollout-phase1-artifacts.mjs'

export const ROLLOUT_PHASE6_RECEIPT_PATH = 'the-it-guy/config/legal-document-rollout-phase6-successor-proposal.json'
const PACKAGE_LOCK_PATH = 'the-it-guy/package-lock.json'
const P5_RECEIPT_KEYS = Object.freeze([
  'cohort', 'contract', 'environment', 'evidence', 'execution', 'manifestDigest', 'observation', 'phase', 'safety', 'source', 'status', 'version',
])
const P5_ENVIRONMENT_KEYS = Object.freeze(['productionOrigin', 'productionProjectRef', 'productionUrl'])
const P5_SOURCE_KEYS = Object.freeze([
  'activationPlanDigest', 'commitSha', 'observationPlanDigest', 'packageLockSha256', 'phase0ManifestDigest', 'phase1ReceiptManifestDigest', 'phase2ReceiptCommitSha', 'phase2ReceiptManifestDigest', 'phase3ReceiptCommitSha', 'phase3ReceiptManifestDigest', 'phase4ReceiptCommitSha', 'phase4ReceiptManifestDigest',
])
const P5_COHORT_KEYS = Object.freeze(['cohortDigest', 'maxOrganisations', 'organisationIds', 'requiredPacketTypes'])
const P5_SAFETY_KEYS = Object.freeze(['creationPaused', 'customerDeliveryPolicy', 'noScaleAuthorization', 'rollbackToDarkLaunchRequired', 'runtimeGuardContract', 'scaleEnabled', 'watchdogContract'])
const P5_OBSERVATION_KEYS = Object.freeze(['maximumBlockers', 'maximumCriticalSnapshots', 'maximumSnapshotGapMinutes', 'maximumWarningSnapshots', 'minimumHealthyScopedSnapshots', 'minimumObservationHours'])
const P5_EVIDENCE_KEYS = Object.freeze(['changeReference', 'observationRecordedAt', 'observationRecordedBy', 'preparedAt', 'preparedBy', 'reviewedBy'])
const P5_EXECUTION_KEYS = Object.freeze(['evidencePacketDigest', 'lifecycleProofs', 'monitoring', 'overallEvidenceDigest', 'reconciliation', 'rollbackReadiness'])

function runGit(repoRoot, args, { binary = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: binary ? null : 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  })
  return {
    ok: result.status === 0,
    stdout: binary ? Buffer.from(result.stdout || []) : String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  }
}

function text(value) {
  return typeof value === 'string' ? value.trim() : null
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

function validCommit(value) {
  return /^[0-9a-f]{40}$/i.test(text(value) || '')
}

function validDigest(value) {
  return /^sha256:[0-9a-f]{64}$/.test(text(value) || '')
}

function validUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value) || '')
}

function normalizedIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(text).filter(Boolean))].sort()
}

function resolvedCommit(repoRoot, value) {
  if (!validCommit(value)) return null
  const result = runGit(repoRoot, ['rev-parse', '--verify', `${text(value)}^{commit}`])
  const resolved = result.ok ? text(result.stdout) : null
  return validCommit(resolved) ? resolved.toLowerCase() : null
}

function readBlob(repoRoot, objectPath, { binary = false } = {}) {
  const result = runGit(repoRoot, ['cat-file', '-p', objectPath], { binary })
  return result.ok ? result.stdout : null
}

function readJsonBlob(repoRoot, objectPath) {
  const content = readBlob(repoRoot, objectPath)
  if (typeof content !== 'string') return null
  try {
    return JSON.parse(content)
  } catch {
    return null
  }
}

function treeEntry(repoRoot, commit, relativePath) {
  const result = runGit(repoRoot, ['ls-tree', '-z', commit, '--', relativePath], { binary: true })
  if (!result.ok) return null
  const token = result.stdout.toString('utf8').split('\0').filter(Boolean)
  if (token.length !== 1) return null
  const match = token[0].match(/^([0-7]{6})\s+(blob|tree|commit)\s+([0-9a-f]{40})\t(.+)$/)
  if (!match || match[4] !== relativePath) return null
  return { mode: match[1], type: match[2], sha: match[3], path: match[4] }
}

function regularBlobDigestAtCommit(repoRoot, commit, relativePath) {
  const entry = treeEntry(repoRoot, commit, relativePath)
  if (!entry || entry.mode !== '100644' || entry.type !== 'blob') return null
  const content = readBlob(repoRoot, `${commit}:${relativePath}`, { binary: true })
  return Buffer.isBuffer(content) ? sha256Digest(content) : null
}

function rawCommitChanges(repoRoot, commit) {
  const result = runGit(repoRoot, ['diff-tree', '--no-commit-id', '--raw', '--full-index', '-r', '--no-renames', '-z', commit], { binary: true })
  if (!result.ok) return []
  const tokens = result.stdout.toString('utf8').split('\0').filter(Boolean)
  if (tokens.length % 2 !== 0) return []
  const changes = []
  for (let index = 0; index < tokens.length; index += 2) {
    const header = tokens[index]
    const file = tokens[index + 1]
    const match = header.match(/^:([0-7]{6}) ([0-7]{6}) [0-9a-f]{40} [0-9a-f]{40} ([A-Z])$/)
    if (!match || !file) return []
    changes.push({ oldMode: match[1], newMode: match[2], status: match[3], file })
  }
  return changes
}

function receiptCommitShape(repoRoot, receiptCommitSha) {
  const parentResult = runGit(repoRoot, ['show', '-s', '--format=%P', receiptCommitSha])
  const parents = parentResult.ok ? parentResult.stdout.trim().split(/\s+/).filter(Boolean).map((value) => value.toLowerCase()) : []
  const changes = rawCommitChanges(repoRoot, receiptCommitSha)
  const receiptOnlyCommit = parents.length === 1 && changes.length === 1 &&
    changes[0].file === ROLLOUT_PHASE6_RECEIPT_PATH && changes[0].status === 'M' &&
    changes[0].oldMode === '100644' && changes[0].newMode === '100644'
  return { directParentSha: parents.length === 1 ? parents[0] : null, receiptOnlyCommit }
}

function validPhase5RecordedBlob(receipt) {
  const candidate = record(receipt)
  const source = record(candidate.source)
  const cohort = record(candidate.cohort)
  const ids = normalizedIds(cohort.organisationIds)
  return exactKeys(candidate, P5_RECEIPT_KEYS) && candidate.version === 1 && candidate.phase === 'ROLL_OUT_5' &&
    candidate.contract === ROLLOUT_PHASE5_CONTRACT && candidate.status === 'pilot_observation_recorded' &&
    exactKeys(candidate.environment, P5_ENVIRONMENT_KEYS) && exactKeys(source, P5_SOURCE_KEYS) &&
    exactKeys(cohort, P5_COHORT_KEYS) && exactKeys(candidate.safety, P5_SAFETY_KEYS) &&
    exactKeys(candidate.observation, P5_OBSERVATION_KEYS) && exactKeys(candidate.evidence, P5_EVIDENCE_KEYS) &&
    exactKeys(candidate.execution, P5_EXECUTION_KEYS) && validCommit(source.commitSha) &&
    validCommit(source.phase2ReceiptCommitSha) && validCommit(source.phase3ReceiptCommitSha) && validCommit(source.phase4ReceiptCommitSha) &&
    ['packageLockSha256', 'phase0ManifestDigest', 'phase1ReceiptManifestDigest', 'phase2ReceiptManifestDigest', 'phase3ReceiptManifestDigest', 'phase4ReceiptManifestDigest', 'activationPlanDigest', 'observationPlanDigest'].every((field) => validDigest(source[field])) &&
    ids.length === 1 && validUuid(ids[0]) && cohort.maxOrganisations === 1 &&
    sameJson(cohort.organisationIds, ids) && cohort.cohortDigest === sha256Digest(ids.join(',')) && sameJson(cohort.requiredPacketTypes, ['mandate', 'otp']) &&
    validDigest(cohort.cohortDigest) && validDigest(candidate.manifestDigest) &&
    candidate.manifestDigest === rolloutPhase5ManifestDigest(candidate)
}

function terminalPhase5ContinuityValid(receipt, phase5CommitSha, continuity) {
  const source = record(receipt?.source)
  const current = record(continuity)
  return current.status === 'RECEIPT_ONLY_DESCENDANT' && current.sourceCommitSha === text(source.commitSha)?.toLowerCase() &&
    current.currentCommitSha === phase5CommitSha && current.phase0FreezeChangeCount === 1 &&
    current.phase1ReceiptChangeCount === 2 && current.phase2ReceiptChangeCount === 1 &&
    current.phase3ReceiptChangeCount === 1 && current.phase4ReceiptChangeCount === 1 &&
    current.phase5ReceiptChangeCount === 1
}

function emptyHistory(receiptCommitSha = null) {
  return {
    receiptCommitSha,
    receipt: null,
    receiptManifestDigest: null,
    receiptManifestDigestValid: false,
    receiptOnlyCommit: false,
    directParentSha: null,
    directParentMatchesDeclaredPhase5: false,
    parentPhase5BlobSchemaValid: false,
    parentPhase5BlobManifestValid: false,
    parentPhase5PackageLockValid: false,
    phase6PackageLockValid: false,
    receiptStatus: null,
    receiptPhase: null,
    receiptContract: null,
    phase6AssessmentStatus: null,
    phase6AssessmentBlockerCount: null,
    phase5History: null,
    phase5TerminalContinuity: null,
    parentPhase5TerminalContinuityValid: false,
  }
}

/**
 * Reads an explicitly named Phase 6 receipt strictly through Git blobs. The
 * receipt must be a single regular-file amendment directly on top of the
 * declared committed Phase 5 receipt. It never reads a mutable P5/P6 working
 * tree and separately validates the terminal P0→P5 chain and frozen lockfile.
 */
export function collectLegalDocumentRolloutPhase6History({ repoRoot, receiptCommitSha } = {}) {
  const resolved = resolvedCommit(repoRoot, receiptCommitSha)
  if (!resolved) return emptyHistory(null)
  const empty = emptyHistory(resolved)
  const receipt = readJsonBlob(repoRoot, `${resolved}:${ROLLOUT_PHASE6_RECEIPT_PATH}`)
  if (!receipt) return empty

  const shape = receiptCommitShape(repoRoot, resolved)
  const declaredPhase5CommitSha = resolvedCommit(repoRoot, receipt?.source?.phase5ReceiptCommitSha)
  const parentPhase5Receipt = shape.directParentSha
    ? readJsonBlob(repoRoot, `${shape.directParentSha}:${ROLLOUT_PHASE5_RECEIPT_PATH}`)
    : null
  const phase5History = collectLegalDocumentRolloutPhase5History({
    repoRoot,
    receiptCommitSha: declaredPhase5CommitSha,
  })
  const phase5TerminalContinuity = collectRolloutSourceContinuity({
    repoRoot,
    sourceCommit: parentPhase5Receipt?.source?.commitSha,
    currentCommit: declaredPhase5CommitSha,
  })
  const phase6Report = assessLegalDocumentRolloutPhase6({ receipt, phase5History })
  const manifestDigest = text(receipt?.manifestDigest)
  const p5SourceCommit = parentPhase5Receipt?.source?.commitSha
  const p5LockDigest = regularBlobDigestAtCommit(repoRoot, p5SourceCommit, PACKAGE_LOCK_PATH)
  const p6LockDigest = regularBlobDigestAtCommit(repoRoot, receipt?.source?.commitSha, PACKAGE_LOCK_PATH)
  const parentPhase5BlobSchemaValid = validPhase5RecordedBlob(parentPhase5Receipt)

  return {
    receiptCommitSha: resolved,
    receipt,
    receiptManifestDigest: manifestDigest,
    receiptManifestDigestValid: Boolean(manifestDigest && manifestDigest === rolloutPhase6ManifestDigest(receipt)),
    receiptOnlyCommit: shape.receiptOnlyCommit,
    directParentSha: shape.directParentSha,
    directParentMatchesDeclaredPhase5: Boolean(declaredPhase5CommitSha && shape.directParentSha === declaredPhase5CommitSha),
    parentPhase5BlobSchemaValid,
    parentPhase5BlobManifestValid: Boolean(parentPhase5BlobSchemaValid && parentPhase5Receipt?.manifestDigest === phase5History.receiptManifestDigest && phase5History.receiptManifestDigestValid),
    parentPhase5PackageLockValid: Boolean(p5LockDigest && p5LockDigest === parentPhase5Receipt?.source?.packageLockSha256),
    phase6PackageLockValid: Boolean(p6LockDigest && p6LockDigest === receipt?.source?.packageLockSha256 && receipt?.source?.packageLockSha256 === parentPhase5Receipt?.source?.packageLockSha256),
    receiptStatus: text(receipt?.status),
    receiptPhase: text(receipt?.phase),
    receiptContract: text(receipt?.contract),
    phase6AssessmentStatus: phase6Report.status,
    phase6AssessmentBlockerCount: phase6Report.blockerCount,
    phase5History,
    phase5TerminalContinuity,
    parentPhase5TerminalContinuityValid: terminalPhase5ContinuityValid(parentPhase5Receipt, declaredPhase5CommitSha, phase5TerminalContinuity),
  }
}
