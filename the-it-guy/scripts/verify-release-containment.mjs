#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, '..')
const repositoryDirectory = resolve(appDirectory, '..')

function option(name) {
  const index = args.indexOf(name)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}

function runGit(argumentsList) {
  const result = spawnSync('git', argumentsList, {
    cwd: repositoryDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) {
    const detail = String(result.stderr || result.error?.message || '').trim()
    throw new Error(
      `Release containment requires a Git checkout at ${repositoryDirectory}. `
      + `Use a clean checkout with \`vercel build\` and \`vercel deploy --prebuilt\`; direct source uploads are blocked. ${detail}`.trim(),
    )
  }
  return String(result.stdout || '').trim()
}

function releaseIdentifier() {
  return String(
    process.env.VITE_RELEASE_ID
    || process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.GIT_COMMIT_SHA
    || '',
  ).trim()
}

function isVercelGitDeployment() {
  return String(process.env.VERCEL || '').trim() === '1'
    && Boolean(String(process.env.VERCEL_GIT_COMMIT_SHA || '').trim())
}

async function verifyReleaseScope(manifestArgument, headCommit) {
  if (!manifestArgument) return null

  const manifestPath = isAbsolute(manifestArgument)
    ? manifestArgument
    : resolve(appDirectory, manifestArgument)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.version, 1, 'Release-scope manifest has an unsupported version.')
  assert.match(String(manifest.baseCommit || ''), /^[0-9a-f]{40}$/i, 'Release-scope manifest is missing its base commit.')
  assert.ok(Array.isArray(manifest.allowedChangedPaths) && manifest.allowedChangedPaths.length > 0, 'Release-scope manifest has no allowed changed paths.')
  assert.ok(Array.isArray(manifest.migrations) && manifest.migrations.length > 0, 'Release-scope manifest has no migration attestations.')

  runGit(['merge-base', '--is-ancestor', manifest.baseCommit, headCommit])
  const changedPaths = runGit(['diff', '--name-only', `${manifest.baseCommit}..${headCommit}`])
    .split('\n')
    .filter(Boolean)
  const allowedPaths = new Set(manifest.allowedChangedPaths)
  const unexpectedPaths = changedPaths.filter((changedPath) => !allowedPaths.has(changedPath))
  assert.deepEqual(
    unexpectedPaths,
    [],
    `Release commit contains paths outside the declared scope: ${unexpectedPaths.join(', ')}`,
  )

  for (const migration of manifest.migrations) {
    assert.match(String(migration?.path || ''), /^supabase\/migrations\/.+\.sql$/, 'Release-scope manifest has an invalid migration path.')
    assert.match(String(migration?.sha256 || ''), /^[0-9a-f]{64}$/i, `Migration attestation is missing a SHA-256 for ${migration.path}.`)
    const content = await readFile(resolve(repositoryDirectory, migration.path))
    const actualHash = createHash('sha256').update(content).digest('hex')
    assert.equal(actualHash, migration.sha256, `Migration checksum does not match for ${migration.path}.`)
  }

  return {
    name: String(manifest.name || 'unnamed-release'),
    baseCommit: manifest.baseCommit,
    changedPathCount: changedPaths.length,
    migrationCount: manifest.migrations.length,
    manifestPath: relative(repositoryDirectory, manifestPath),
  }
}

const declaredRepositoryDirectory = runGit(['rev-parse', '--show-toplevel'])
assert.equal(declaredRepositoryDirectory, repositoryDirectory, 'Release verifier is not running against its expected repository root.')

const headCommit = runGit(['rev-parse', 'HEAD'])
const declaredReleaseId = releaseIdentifier()
if (declaredReleaseId) {
  assert.equal(
    declaredReleaseId.toLowerCase(),
    headCommit.toLowerCase(),
    `Release identifier ${declaredReleaseId} does not match checked-out commit ${headCommit}.`,
  )
}

const dirtyEntries = runGit(['status', '--porcelain=v1', '--untracked-files=all'])
  .split('\n')
  .filter(Boolean)
// Vercel's Git builder may remove paths covered by .vercelignore and update
// generated deployment metadata before the configured build command runs.
// In that one environment, the checked-out Git SHA above is the containment
// proof. Everywhere else, a dirty tree remains a hard release failure.
if (!isVercelGitDeployment()) {
  assert.deepEqual(
    dirtyEntries,
    [],
    `Release source is not contained: commit or remove every changed/untracked path before building.\n${dirtyEntries.join('\n')}`,
  )
}

const scope = await verifyReleaseScope(option('--release-manifest'), headCommit)

console.log(JSON.stringify({
  version: 'arch9_release_containment_v1',
  clean: true,
  commit: headCommit,
  releaseIdentifier: declaredReleaseId || headCommit,
  scope,
}, null, 2))
