import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

export const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
export const REPO_ROOT = path.resolve(APP_ROOT, '..')
export const PHASE1_DATABASE_RUNNER = 'scripts/supabase-phase6-staging-execution.mjs'
export const PHASE1_DATABASE_TARGET_CONTRACT = 'direct_supabase_host_v1'
export const PHASE1_SUPABASE_CLI_VERSION = '2.109.1'
export const PHASE1_APPLICATION_MANIFEST = 'docs/supabase-phase-5-application-manifest.json'
export const PHASE1_SHARED_RUNTIME = 'supabase/functions/_shared'
export const PHASE1_SHARED_RUNTIME_REQUIRED_FILE = 'supabase/functions/_shared/finalSignedArtifactAccess.ts'

// These files form one dependency-ordered migration release.  They are kept
// here rather than inferred from a glob so an unrelated migration can never
// enter a legal-document staging run by accident.
const PHASE1_MIGRATION_FILES = [
  ['202607220002', '202607220002_authoritative_mandate_signing_delivery_phase0.sql'],
  ['202607220003', '202607220003_signable_packet_sent_phase1.sql'],
  ['202607220004', '202607220004_canonical_otp_signing_phase2.sql'],
  ['202607220005', '202607220005_canonical_otp_seal_atomic_recovery.sql'],
  ['202607220006', '202607220006_phase3_visual_signature_evidence.sql'],
  ['202607220007', '202607220007_phase4_legal_runtime_metadata_immutability.sql'],
  ['202607220008', '202607220008_phase4_legal_template_release_integrity.sql'],
  ['202607220009', '202607220009_phase4_legal_release_provenance.sql'],
  ['202607220010', '202607220010_phase4_seller_portal_final_artifact_fence.sql'],
  ['202607220011', '202607220011_phase4_legal_release_persistence_fence.sql'],
  ['202607220012', '202607220012_phase5_legal_document_health_incident_integrity.sql'],
  ['202607230004', '202607230004_phase5_pilot_release_trace_integrity.sql'],
]

export const PHASE1_MIGRATIONS = Object.freeze(PHASE1_MIGRATION_FILES.map(([version, file], index) => Object.freeze({
  version,
  file,
  dependsOn: index === 0 ? 'reviewed_legal_runtime_preflight' : PHASE1_MIGRATION_FILES[index - 1][0],
  deployCanonicalFinaliserBefore: version === '202607220006',
})))

export const PHASE1_EDGE_FUNCTIONS = Object.freeze([
  'generate-mandate',
  'generate-otp',
  'generate-final-signed-document',
  'generate-final-signed-otp',
  'resolve-signer-token',
  'signer-signing-action',
  'send-mandate-signing-email',
  'send-email',
  'dispatch-final-signed-document',
  'retry-final-document-completion',
  'resolve-final-signed-document-access',
  'legal-document-watchdog',
  'document-conversion-health',
])

export const PHASE1_FRONTEND = Object.freeze({
  root: 'the-it-guy',
  buildCommand: 'npm run build:guarded',
  files: Object.freeze([
    'the-it-guy/vercel.json',
    'the-it-guy/package.json',
    'the-it-guy/package-lock.json',
    'the-it-guy/vite.config.js',
  ]),
  sourceRoot: 'the-it-guy/src',
})

function posixPath(value) {
  return value.split(path.sep).join('/')
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function sha256Digest(value) {
  return `sha256:${sha256(value)}`
}

export function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
}

export function stableJson(value) {
  return JSON.stringify(stableValue(value))
}

export function readFileDigest(absolutePath) {
  if (!fs.existsSync(absolutePath)) throw new Error(`Required release artifact is missing: ${absolutePath}`)
  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) throw new Error(`Expected a file release artifact: ${absolutePath}`)
  return {
    sha256: sha256Digest(fs.readFileSync(absolutePath)),
    bytes: stat.size,
  }
}

function walkFiles(root, relative = '') {
  if (!fs.existsSync(root)) throw new Error(`Required release artifact directory is missing: ${root}`)
  const entries = fs.readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))
  const result = []
  for (const entry of entries) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name
    const nextAbsolute = path.join(root, entry.name)
    if (entry.isDirectory()) result.push(...walkFiles(nextAbsolute, nextRelative))
    else if (entry.isFile()) result.push({ absolutePath: nextAbsolute, relativePath: posixPath(nextRelative) })
    else throw new Error(`Unsupported release artifact entry: ${nextAbsolute}`)
  }
  return result
}

export function treeDigest(absolutePath) {
  const files = walkFiles(absolutePath).map(({ absolutePath: file, relativePath }) => {
    const digest = readFileDigest(file)
    return { path: relativePath, ...digest }
  })
  return {
    sha256: sha256Digest(files.map((file) => `${file.path}\u0000${file.sha256}\u0000${file.bytes}`).join('\n')),
    fileCount: files.length,
  }
}

/**
 * Produces the immutable unit that every Edge Function deployment record must
 * name.  A per-function source hash is not enough on its own: the deployed
 * behavior also depends on the complete shared runtime and function config.
 *
 * Deliberately retain the ordered function list (rather than a set) so a
 * renamed, omitted, or re-ordered deployment target cannot produce the same
 * release unit.
 */
export function edgeFunctionDeployUnitDigest({
  edgeFunctions,
  sharedRuntimeSha256,
  sharedRuntimeFileCount,
  sharedRuntimeRequiredFileSha256,
  configTomlSha256,
} = {}) {
  const functions = Array.isArray(edgeFunctions)
    ? edgeFunctions.map(({ name, sourceTreeSha256, sourceFileCount }) => ({ name, sourceTreeSha256, sourceFileCount }))
    : []
  return sha256Digest(stableJson({
    contract: 'legal_document_phase1_edge_function_deploy_unit_v1',
    functions,
    sharedRuntime: {
      sha256: sharedRuntimeSha256 ?? null,
      fileCount: sharedRuntimeFileCount ?? null,
      requiredFileSha256: sharedRuntimeRequiredFileSha256 ?? null,
    },
    configTomlSha256: configTomlSha256 ?? null,
  }))
}

function configStanzaDeclared(configToml, functionName) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\[functions\\.${escaped}\\]$`, 'm').test(configToml)
}

function expectedMigrationArtifacts(repoRoot) {
  return PHASE1_MIGRATIONS.map((migration) => {
    const relativePath = `supabase/migrations/${migration.file}`
    const digest = readFileDigest(path.join(repoRoot, relativePath))
    return { ...migration, path: relativePath, sha256: digest.sha256, bytes: digest.bytes }
  })
}

function applicationManifestCoverage(applicationManifest, migrations) {
  const rows = Array.isArray(applicationManifest?.rows) ? applicationManifest.rows : []
  const missing = []
  const ambiguous = []
  const notExecutable = []
  const covered = []

  for (const migration of migrations) {
    const matches = rows.filter((row) => row?.version === migration.version || row?.file === migration.file)
    const exact = matches.filter((row) => row?.version === migration.version && row?.file === migration.file)
    if (exact.length === 0) {
      missing.push({ version: migration.version, file: migration.file })
      continue
    }
    if (matches.length !== 1 || exact.length !== 1) {
      ambiguous.push({ version: migration.version, file: migration.file, matchCount: matches.length, exactMatchCount: exact.length })
      continue
    }
    const row = exact[0]
    if (row.action !== 'apply_original_after_dependency_check') {
      notExecutable.push({ version: migration.version, file: migration.file, action: row.action || null })
      continue
    }
    covered.push({ version: migration.version, file: migration.file, stream: row.stream || null, action: row.action })
  }

  const canonical = { expected: migrations.map(({ version, file }) => ({ version, file })), covered, missing, ambiguous, notExecutable }
  return {
    ...canonical,
    status: missing.length || ambiguous.length || notExecutable.length ? 'incomplete' : 'complete',
    digest: sha256Digest(stableJson(canonical)),
  }
}

/**
 * Captures only local source facts.  It does not contact Supabase, Vercel, or
 * any URL, and it never reads deployment credentials.
 */
export function collectLegalDocumentRolloutPhase1Artifacts({ repoRoot = REPO_ROOT } = {}) {
  const configTomlPath = path.join(repoRoot, 'supabase/config.toml')
  const configToml = fs.readFileSync(configTomlPath, 'utf8')
  const databaseRunnerText = fs.readFileSync(path.join(repoRoot, PHASE1_DATABASE_RUNNER), 'utf8')
  const databaseRunnerProductionMatch = databaseRunnerText.match(/^const PRODUCTION_PROJECT_REF = '([a-z0-9]{8,64})'$/m)
  const databaseRunnerTargetContractMatch = databaseRunnerText.match(/^const DATABASE_TARGET_CONTRACT = '([^']+)'$/m)
  const databaseRunnerCliVersionMatch = databaseRunnerText.match(/^const SUPABASE_CLI_VERSION = '([0-9]+\.[0-9]+\.[0-9]+)'$/m)
  const databaseRunnerTargetContract = databaseRunnerTargetContractMatch?.[1] === PHASE1_DATABASE_TARGET_CONTRACT &&
    databaseRunnerText.includes('new URL(dbUrl)') &&
    databaseRunnerText.includes('parsed.hostname.toLowerCase() !== expectedHost') &&
    databaseRunnerText.includes("parsed.port !== '5432'") &&
    databaseRunnerText.includes("parsed.pathname !== '/postgres'") &&
    databaseRunnerText.includes("/^[a-z0-9]{8,64}$/.test(projectRef)") &&
    databaseRunnerText.includes("parsed.searchParams.getAll('sslmode')") &&
    databaseRunnerText.includes("queryNames.length !== 1") &&
    databaseRunnerText.includes("['require', 'verify-ca', 'verify-full'].includes(sslMode)")
    ? PHASE1_DATABASE_TARGET_CONTRACT
    : 'unverified'
  const migrations = expectedMigrationArtifacts(repoRoot)
  const applicationManifestPath = path.join(repoRoot, PHASE1_APPLICATION_MANIFEST)
  const applicationManifestText = fs.readFileSync(applicationManifestPath, 'utf8')
  const applicationManifest = JSON.parse(applicationManifestText)
  const coverage = applicationManifestCoverage(applicationManifest, migrations)
  const edgeFunctions = PHASE1_EDGE_FUNCTIONS.map((name) => {
    const source = treeDigest(path.join(repoRoot, 'supabase/functions', name))
    return {
      name,
      sourceTreeSha256: source.sha256,
      sourceFileCount: source.fileCount,
      configStanzaDeclared: configStanzaDeclared(configToml, name),
    }
  })
  const sharedRuntime = treeDigest(path.join(repoRoot, PHASE1_SHARED_RUNTIME))
  const sharedRequired = readFileDigest(path.join(repoRoot, PHASE1_SHARED_RUNTIME_REQUIRED_FILE))
  const configTomlSha256 = sha256Digest(configToml)
  const edgeFunctionDeployUnitSha256 = edgeFunctionDeployUnitDigest({
    edgeFunctions,
    sharedRuntimeSha256: sharedRuntime.sha256,
    sharedRuntimeFileCount: sharedRuntime.fileCount,
    sharedRuntimeRequiredFileSha256: sharedRequired.sha256,
    configTomlSha256,
  })
  const frontendFiles = Object.fromEntries(PHASE1_FRONTEND.files.map((relativePath) => [
    relativePath,
    readFileDigest(path.join(repoRoot, relativePath)).sha256,
  ]))
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'the-it-guy/vercel.json'), 'utf8'))
  const frontendSource = treeDigest(path.join(repoRoot, PHASE1_FRONTEND.sourceRoot))

  return {
    migrations,
    migrationSetDigest: sha256Digest(stableJson(migrations)),
    applicationManifestSha256: sha256Digest(applicationManifestText),
    applicationManifestLinkedProjectRef: typeof applicationManifest.linkedProjectRef === 'string' ? applicationManifest.linkedProjectRef.trim() : null,
    applicationManifestCoverage: coverage,
    edgeFunctions,
    edgeFunctionSetDigest: sha256Digest(stableJson(edgeFunctions)),
    edgeFunctionDeployUnitSha256,
    sharedRuntimeSha256: sharedRuntime.sha256,
    sharedRuntimeFileCount: sharedRuntime.fileCount,
    sharedRuntimeRequiredFileSha256: sharedRequired.sha256,
    configTomlSha256,
    databaseRunnerSourceSha256: sha256Digest(databaseRunnerText),
    databaseRunnerProtectedProjectRef: databaseRunnerProductionMatch?.[1] || null,
    databaseRunnerTargetContract,
    databaseRunnerCliVersion: databaseRunnerCliVersionMatch?.[1] || null,
    frontend: {
      root: PHASE1_FRONTEND.root,
      buildCommand: PHASE1_FRONTEND.buildCommand,
      vercelBuildCommand: typeof vercelConfig.buildCommand === 'string' ? vercelConfig.buildCommand.trim() : null,
      vercelConfigSha256: frontendFiles['the-it-guy/vercel.json'],
      packageJsonSha256: frontendFiles['the-it-guy/package.json'],
      packageLockSha256: frontendFiles['the-it-guy/package-lock.json'],
      viteConfigSha256: frontendFiles['the-it-guy/vite.config.js'],
      sourceTreeSha256: frontendSource.sha256,
      sourceFileCount: frontendSource.fileCount,
    },
    releaseOrder: {
      edgeFunctionsBeforeMigration: '202607220006',
      migrations: migrations.map((migration) => migration.version),
      constrainedFunctions: edgeFunctions.filter((functionArtifact) => !functionArtifact.configStanzaDeclared).map((functionArtifact) => functionArtifact.name),
    },
  }
}
