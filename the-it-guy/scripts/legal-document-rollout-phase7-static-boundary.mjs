import { spawnSync } from 'node:child_process'
import { sha256Digest, stableJson } from './legal-document-rollout-phase1-artifacts.mjs'

export const ROLLOUT_PHASE7_STATIC_BOUNDARY_CONTRACT = 'legal-document-phase7-static-boundary-facts-v1'
export const ROLLOUT_PHASE7_PHASE6_MIGRATION_ID = 'phase6_server_owned_release_epoch_integrity'
export const ROLLOUT_PHASE7_PHASE6_MIGRATION_PATH = 'supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql'
export const ROLLOUT_PHASE7_IMPLEMENTATION_CHANGE_PATHS = Object.freeze([
  'supabase/migrations/202607230005_phase6_successor_release_epoch_integrity.sql',
  'the-it-guy/config/legal-document-rollout-phase7-successor-implementation-boundary.json',
  'the-it-guy/docs/legal-document-rollout-phase7-successor-implementation-boundary.md',
  'the-it-guy/package.json',
  'the-it-guy/scripts/legal-document-phase6-release-epoch-schema.test.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase6-history.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase6-history.test.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase7-context.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase7-finalize.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase7-implementation-boundary.test.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase7-plan.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase7-policy.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase7-static-boundary.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase7-verify.mjs',
  'the-it-guy/scripts/legal-document-rollout-phase7-work-order.mjs',
])

const LEGACY_ACTIVATORS = Object.freeze([
  'the-it-guy/scripts/legal-document-phase-a3-activate.mjs',
  'the-it-guy/scripts/legal-document-phase-q2-activate-expansion.mjs',
  'the-it-guy/scripts/legal-document-phase-v2-activate-expansion.mjs',
])
const SOURCE_PREFIXES = Object.freeze([
  'supabase/functions/',
  'the-it-guy/src/',
  'the-it-guy/scripts/',
  'the-it-guy/config/',
])
const SOURCE_FILES = Object.freeze([
  'the-it-guy/package.json',
  'the-it-guy/vite.config.js',
  'supabase/config.toml',
])
const SUCCESSOR_RPC_PATTERNS = Object.freeze([
  /\bbridge_(?:prepare|register|transition|bind|record|assert)_[a-z0-9_]*successor_release[a-z0-9_]*phase6\b/i,
  /\blegal_document_successor_release_[a-z0-9_]*phase6\b/i,
  /\b(?:rpc|invoke|from)\s*\(\s*[^)]*(?:successor[_ -]?release|phase6)[^)]*\)/i,
  /\b(?:successor[_ -]?release|phase6)[a-z0-9_]*\s*[:=].*(?:rpc|invoke|supabase|service[_ -]?role)/i,
])
const APPLY_PATTERNS = Object.freeze([
  /\b(?:apply|execute|deploy)\b[^\n]{0,160}202607230005_phase6_successor_release_epoch_integrity/i,
])

function runGit(repoRoot, args, { binary = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: binary ? null : 'utf8',
    maxBuffer: 30 * 1024 * 1024,
  })
  return {
    ok: result.status === 0,
    stdout: binary ? Buffer.from(result.stdout || []) : String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  }
}

function validCommit(value) {
  return /^[0-9a-f]{40}$/i.test(String(value || '').trim())
}

function resolveCommit(repoRoot, value) {
  if (!validCommit(value)) return null
  const result = runGit(repoRoot, ['rev-parse', '--verify', `${String(value).trim()}^{commit}`])
  const resolved = result.ok ? result.stdout.trim().toLowerCase() : ''
  return validCommit(resolved) ? resolved : null
}

function treeEntries(repoRoot, commit) {
  const result = runGit(repoRoot, ['ls-tree', '-r', '-z', '--full-tree', commit], { binary: true })
  if (!result.ok) return []
  const entries = []
  for (const token of result.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const match = token.match(/^([0-7]{6})\s+(blob|tree|commit)\s+([0-9a-f]{40})\t(.+)$/)
    if (!match) return []
    entries.push({ mode: match[1], type: match[2], sha: match[3], path: match[4] })
  }
  return entries
}

function rawCommitChanges(repoRoot, commit) {
  const result = runGit(repoRoot, ['diff-tree', '--no-commit-id', '--raw', '--full-index', '-r', '--no-renames', '-z', commit], { binary: true })
  if (!result.ok) return []
  const tokens = result.stdout.toString('utf8').split('\0').filter(Boolean)
  if (tokens.length % 2 !== 0) return []
  const changes = []
  for (let index = 0; index < tokens.length; index += 2) {
    const match = tokens[index].match(/^:([0-7]{6}) ([0-7]{6}) [0-9a-f]{40} [0-9a-f]{40} ([A-Z])$/)
    const file = tokens[index + 1]
    if (!match || !file) return []
    changes.push({ oldMode: match[1], newMode: match[2], status: match[3], file })
  }
  return changes
}

function blobAt(repoRoot, entry) {
  const result = runGit(repoRoot, ['cat-file', '-p', entry.sha], { binary: true })
  return result.ok ? result.stdout : null
}

function sourceFile(entry) {
  if (SOURCE_FILES.includes(entry.path)) return true
  return SOURCE_PREFIXES.some((prefix) => entry.path.startsWith(prefix))
}

function executableSourceFile(entry) {
  if (!sourceFile(entry) || entry.path === ROLLOUT_PHASE7_PHASE6_MIGRATION_PATH) return false
  if (/\.(?:test|spec)\.(?:[cm]?js|jsx|tsx?|json)$/i.test(entry.path)) return false
  if (entry.path.includes('/__tests__/')) return false
  if (LEGACY_ACTIVATORS.includes(entry.path)) return false
  // Rollout control scripts are source inspectors/finalizers, not runtime or
  // deployment writers. They are checked by their dedicated static contract.
  if (/the-it-guy\/scripts\/legal-document-rollout-phase[67]-/i.test(entry.path)) return false
  return /\.(?:[cm]?js|jsx|tsx?|json|toml)$/i.test(entry.path)
}

function successorMigrationApplyCaller(source) {
  const mentionsSuccessorMigration = /(?:202607230005_phase6_successor_release_epoch_integrity|phase6_server_owned_release_epoch_integrity|legal_document_successor_release_[a-z0-9_]*phase6)/i.test(source)
  const performsDeployment = /(?:npx\s+)?supabase\s+(?:db\s+(?:push|reset)|migration\s+(?:up|repair)|functions\s+deploy)\b/i.test(source)
  return mentionsSuccessorMigration && (performsDeployment || APPLY_PATTERNS.some((pattern) => pattern.test(source)))
}

function migrationInvariantCodes(source) {
  const beforePrepareRpc = source.split('create or replace function public.bridge_prepare_legal_document_successor_release_epoch_phase6', 1)[0]
  const checks = [
    ['PHASE6_MIGRATION_IDENTIFIER', source.includes(ROLLOUT_PHASE7_PHASE6_MIGRATION_ID)],
    ['PHASE6_INERT_INTENT', /seeds no epoch, changes no runtime guard/i.test(source)],
    ['PHASE6_EPOCH_SCOPE', /intended_organisation_count\s+smallint[^;]+check\s*\(intended_organisation_count\s*=\s*2\)/is.test(source)],
    ['PHASE6_IMMUTABLE_MEMBERSHIP_SLOTS', /unique\s*\(release_epoch_id,\s*membership_slot\)/i.test(source)],
    ['PHASE6_CURRENT_VERSION_BINDING', /unique\s*\(packet_version_id\)/i.test(source)],
    ['PHASE6_SINGLE_ACTIVE_EPOCH', /create unique index if not exists legal_document_successor_release_epochs_phase6_one_active_uq\s+on public\.legal_document_successor_release_epochs_phase6 \(state\)\s+where state = 'active'/is.test(source)],
    ['PHASE6_COMPOSITE_BINDING_SCOPE', /constraint ld_sre_p6_binding_epoch_plan_fk[\s\S]{0,500}constraint ld_sre_p6_binding_membership_scope_fk/is.test(source)],
    ['PHASE6_CURRENT_VERSION_AND_RELEASE_TIME', /v_packet\.current_version_number is distinct from v_version\.version_number[\s\S]{0,2000}PHASE6_BINDING_CURRENT_VERSION_REQUIRED[\s\S]{0,4000}PHASE6_BINDING_RELEASE_TIME_REQUIRED/is.test(source)],
    ['PHASE6_SERVICE_ROLE_GUARD', /coalesce\(auth\.role\(\),\s*''\)\s*<>\s*'service_role'/i.test(source)],
    ['PHASE6_NO_TOP_LEVEL_EPOCH_SEED', !/insert\s+into\s+public\.legal_document_successor_release_epochs_phase6\b/i.test(beforePrepareRpc)],
  ]
  return checks.filter(([, valid]) => valid).map(([code]) => code)
}

function legacyRetirementState(repoRoot, byPath) {
  const legacyActivators = LEGACY_ACTIVATORS.map((filename) => {
    const entry = byPath.get(filename)
    const source = entry?.mode === '100644' && entry.type === 'blob' ? blobAt(repoRoot, entry)?.toString('utf8') || '' : ''
    const guardIndex = source.indexOf('LEGAL_DOCUMENT_LEGACY_EXPANSION_RETIRED')
    const exitIndex = source.indexOf('process.exit(1)')
    const legacyWriteIndex = source.indexOf("'secrets', 'set'")
    return { filename, retired: guardIndex >= 0 && exitIndex > guardIndex && legacyWriteIndex > exitIndex }
  })
  return {
    legacyActivators,
    legacyActivatorsRetired: legacyActivators.every((item) => item.retired),
  }
}

function implementationAncestor(repoRoot, parentCommit, implementationCommit) {
  if (!parentCommit || !implementationCommit) return false
  return runGit(repoRoot, ['merge-base', '--is-ancestor', parentCommit, implementationCommit]).ok
}

function implementationDiff(repoRoot, phase6ReceiptCommit, implementationCommit) {
  if (!implementationAncestor(repoRoot, phase6ReceiptCommit, implementationCommit) || phase6ReceiptCommit === implementationCommit) {
    return { valid: false, commits: [], paths: [], digest: null }
  }
  const merges = runGit(repoRoot, ['rev-list', '--merges', `${phase6ReceiptCommit}..${implementationCommit}`])
  const listed = runGit(repoRoot, ['rev-list', '--reverse', `${phase6ReceiptCommit}..${implementationCommit}`])
  if (!merges.ok || !listed.ok || merges.stdout.trim()) return { valid: false, commits: [], paths: [], digest: null }
  const commits = []
  for (const sha of listed.stdout.split('\n').map((value) => value.trim()).filter(Boolean)) {
    const parents = runGit(repoRoot, ['show', '-s', '--format=%P', sha])
    const parentShas = parents.ok ? parents.stdout.trim().split(/\s+/).filter(Boolean) : []
    const changes = rawCommitChanges(repoRoot, sha)
    const validChanges = parentShas.length === 1 && changes.length > 0 && changes.every((change) =>
      ROLLOUT_PHASE7_IMPLEMENTATION_CHANGE_PATHS.includes(change.file) &&
      ['A', 'M'].includes(change.status) && change.newMode === '100644' &&
      (change.status === 'A' ? change.oldMode === '000000' : change.oldMode === '100644'))
    if (!validChanges) return { valid: false, commits, paths: [], digest: null }
    commits.push({ sha, changedPaths: changes.map((change) => change.file).sort() })
  }
  const paths = [...new Set(commits.flatMap((commit) => commit.changedPaths))].sort()
  const digest = sha256Digest(stableJson({ phase6ReceiptCommit, implementationCommit, commits }))
  return { valid: commits.length > 0, commits, paths, digest }
}

/**
 * Collects source facts from one explicit immutable Git tree. It never reads
 * the workspace, calls a provider, applies a migration, or invokes an RPC.
 */
export function collectLegalDocumentRolloutPhase7StaticBoundaryFacts({ repoRoot, implementationCommitSha, phase6ReceiptCommitSha } = {}) {
  const implementationCommit = resolveCommit(repoRoot, implementationCommitSha)
  const phase6ReceiptCommit = resolveCommit(repoRoot, phase6ReceiptCommitSha)
  if (!implementationCommit) {
    return {
      contract: ROLLOUT_PHASE7_STATIC_BOUNDARY_CONTRACT,
      implementationCommitSha: null,
      implementationCommitDescendsFromPhase6: false,
      implementationCommitDiffDigest: null,
      implementationCommitDiffValid: false,
      implementationCommitDiffPaths: [],
      migrationId: ROLLOUT_PHASE7_PHASE6_MIGRATION_ID,
      migrationPath: ROLLOUT_PHASE7_PHASE6_MIGRATION_PATH,
      migrationSourceDigest: null,
      migrationInvariantDigest: null,
      migrationInvariantCodes: [],
      migrationInvariantsValid: false,
      sourceTreeDigest: null,
      sourcePathsRegular: false,
      successorRpcRuntimeCallers: [],
      migrationApplyCallers: [],
      noSuccessorRpcRuntimeCallers: false,
      noMigrationApplyCallers: false,
      legacyActivators: [],
      legacyActivatorsRetired: false,
      staticBoundaryValid: false,
    }
  }
  const entries = treeEntries(repoRoot, implementationCommit)
  const byPath = new Map(entries.map((entry) => [entry.path, entry]))
  const migrationEntry = byPath.get(ROLLOUT_PHASE7_PHASE6_MIGRATION_PATH)
  const migrationSource = migrationEntry?.mode === '100644' && migrationEntry.type === 'blob' ? blobAt(repoRoot, migrationEntry) : null
  const migrationText = Buffer.isBuffer(migrationSource) ? migrationSource.toString('utf8') : ''
  const scopedEntries = entries.filter(sourceFile)
  const sourcePathsRegular = scopedEntries.length > 0 && scopedEntries.every((entry) => entry.mode === '100644' && entry.type === 'blob')
  const sourceDigestRows = scopedEntries
    .filter((entry) => entry.mode === '100644' && entry.type === 'blob')
    .map((entry) => ({ path: entry.path, sha256: sha256Digest(blobAt(repoRoot, entry) || Buffer.alloc(0)) }))
    .sort((left, right) => left.path.localeCompare(right.path))
  const successorRpcRuntimeCallers = []
  const migrationApplyCallers = []
  for (const entry of scopedEntries.filter(executableSourceFile)) {
    if (entry.mode !== '100644' || entry.type !== 'blob') continue
    const source = (blobAt(repoRoot, entry) || Buffer.alloc(0)).toString('utf8')
    if (SUCCESSOR_RPC_PATTERNS.some((pattern) => pattern.test(source))) successorRpcRuntimeCallers.push(entry.path)
    if (successorMigrationApplyCaller(source)) migrationApplyCallers.push(entry.path)
  }
  const invariantCodes = migrationInvariantCodes(migrationText)
  const migrationSourceDigest = Buffer.isBuffer(migrationSource) ? sha256Digest(migrationSource) : null
  const migrationInvariantDigest = migrationSourceDigest ? sha256Digest(stableJson({
    migrationId: ROLLOUT_PHASE7_PHASE6_MIGRATION_ID,
    migrationPath: ROLLOUT_PHASE7_PHASE6_MIGRATION_PATH,
    migrationSourceDigest,
    invariantCodes,
  })) : null
  const retirement = legacyRetirementState(repoRoot, byPath)
  const migrationInvariantsValid = invariantCodes.length === 10
  const noSuccessorRpcRuntimeCallers = successorRpcRuntimeCallers.length === 0
  const noMigrationApplyCallers = migrationApplyCallers.length === 0
  const implementationCommitDescendsFromPhase6 = implementationAncestor(repoRoot, phase6ReceiptCommit, implementationCommit)
  const diff = implementationDiff(repoRoot, phase6ReceiptCommit, implementationCommit)
  return {
    contract: ROLLOUT_PHASE7_STATIC_BOUNDARY_CONTRACT,
    implementationCommitSha: implementationCommit,
    implementationCommitDescendsFromPhase6,
    implementationCommitDiffDigest: diff.digest,
    implementationCommitDiffValid: diff.valid,
    implementationCommitDiffPaths: diff.paths,
    migrationId: ROLLOUT_PHASE7_PHASE6_MIGRATION_ID,
    migrationPath: ROLLOUT_PHASE7_PHASE6_MIGRATION_PATH,
    migrationSourceDigest,
    migrationInvariantDigest,
    migrationInvariantCodes: invariantCodes,
    migrationInvariantsValid,
    sourceTreeDigest: sha256Digest(stableJson(sourceDigestRows)),
    sourcePathsRegular,
    successorRpcRuntimeCallers: successorRpcRuntimeCallers.sort(),
    migrationApplyCallers: migrationApplyCallers.sort(),
    noSuccessorRpcRuntimeCallers,
    noMigrationApplyCallers,
    ...retirement,
    staticBoundaryValid: Boolean(migrationSource) && sourcePathsRegular && migrationInvariantsValid &&
      noSuccessorRpcRuntimeCallers && noMigrationApplyCallers && retirement.legacyActivatorsRetired &&
      implementationCommitDescendsFromPhase6 && diff.valid,
  }
}
