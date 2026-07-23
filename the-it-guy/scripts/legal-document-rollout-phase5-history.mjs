import { spawnSync } from 'node:child_process'
import { rolloutPhase5ManifestDigest } from './legal-document-rollout-phase5-policy.mjs'

export const ROLLOUT_PHASE5_RECEIPT_PATH = 'the-it-guy/config/legal-document-rollout-phase5-pilot-observation.json'

function gitOutput(repoRoot, args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  return result.status === 0 ? String(result.stdout || '') : ''
}

function text(value) {
  return typeof value === 'string' ? value.trim() : null
}

function normalizedIds(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(text).filter(Boolean))].sort()
    : []
}

function normalizedPacketTypes(value) {
  return Array.isArray(value)
    ? [...new Set(value.map(text).filter(Boolean))].sort()
    : []
}

function emptyHistory(receiptCommitSha = null) {
  return {
    receiptCommitSha,
    receiptManifestDigest: null,
    receiptManifestDigestValid: false,
    receiptOnlyCommit: false,
    receiptStatus: null,
    receiptPhase: null,
    receiptContract: null,
    phase4ReceiptCommitSha: null,
    phase4ReceiptManifestDigest: null,
    sourceCommitSha: null,
    packageLockSha256: null,
    activationPlanDigest: null,
    observationPlanDigest: null,
    cohortDigest: null,
    organisationIds: [],
    requiredPacketTypes: [],
    productionProjectRef: null,
    productionOrigin: null,
    productionUrl: null,
    observationRecordedAt: null,
    runtimeGuardContract: null,
    watchdogContract: null,
  }
}

function resolvedCommit(repoRoot, value) {
  const candidate = text(value)
  if (!candidate || !/^[0-9a-f]{40}$/i.test(candidate)) return null
  const resolved = text(gitOutput(repoRoot, ['rev-parse', '--verify', `${candidate}^{commit}`]))
  return resolved && /^[0-9a-f]{40}$/i.test(resolved) ? resolved.toLowerCase() : null
}

function isReceiptOnlyCommit(repoRoot, receiptCommitSha) {
  const paths = gitOutput(repoRoot, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', receiptCommitSha])
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)
  return paths.length === 1 && paths[0] === ROLLOUT_PHASE5_RECEIPT_PATH
}

/**
 * Reads one explicitly named, committed Phase 5 receipt through `git
 * cat-file`. It deliberately does not inspect an editable working-tree Phase
 * 5 document or extend the Phase 0→5 receipt chain. Phase 6 is an independent
 * local proposal record, not a successor activation mechanism.
 */
export function collectLegalDocumentRolloutPhase5History({ repoRoot, receiptCommitSha } = {}) {
  const resolved = resolvedCommit(repoRoot, receiptCommitSha)
  if (!resolved) return emptyHistory(null)
  const empty = emptyHistory(resolved)
  const content = gitOutput(repoRoot, ['cat-file', '-p', `${resolved}:${ROLLOUT_PHASE5_RECEIPT_PATH}`])
  try {
    const receipt = JSON.parse(content)
    const manifestDigest = text(receipt?.manifestDigest)
    return {
      receiptCommitSha: resolved,
      receiptManifestDigest: manifestDigest,
      receiptManifestDigestValid: Boolean(manifestDigest && manifestDigest === rolloutPhase5ManifestDigest(receipt)),
      receiptOnlyCommit: isReceiptOnlyCommit(repoRoot, resolved),
      receiptStatus: text(receipt?.status),
      receiptPhase: text(receipt?.phase),
      receiptContract: text(receipt?.contract),
      phase4ReceiptCommitSha: text(receipt?.source?.phase4ReceiptCommitSha),
      phase4ReceiptManifestDigest: text(receipt?.source?.phase4ReceiptManifestDigest),
      sourceCommitSha: text(receipt?.source?.commitSha),
      packageLockSha256: text(receipt?.source?.packageLockSha256),
      activationPlanDigest: text(receipt?.source?.activationPlanDigest),
      observationPlanDigest: text(receipt?.source?.observationPlanDigest),
      cohortDigest: text(receipt?.cohort?.cohortDigest),
      organisationIds: normalizedIds(receipt?.cohort?.organisationIds),
      requiredPacketTypes: normalizedPacketTypes(receipt?.cohort?.requiredPacketTypes),
      productionProjectRef: text(receipt?.environment?.productionProjectRef),
      productionOrigin: text(receipt?.environment?.productionOrigin),
      productionUrl: text(receipt?.environment?.productionUrl),
      observationRecordedAt: text(receipt?.evidence?.observationRecordedAt),
      runtimeGuardContract: text(receipt?.safety?.runtimeGuardContract),
      watchdogContract: text(receipt?.safety?.watchdogContract),
    }
  } catch {
    return empty
  }
}
