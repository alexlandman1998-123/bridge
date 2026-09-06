#!/usr/bin/env node
/**
 * Validates the release scope before any staging or production action.
 * Read-only: it never applies migrations, deploys code, or creates tags.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repositoryRoot = resolve(appRoot, '..')
const argumentIndex = args.indexOf('--manifest')
const manifestArgument = argumentIndex >= 0 ? args[argumentIndex + 1] : ''

if (args.includes('--help') || !manifestArgument) {
  console.log('Usage: node scripts/validate-api-split-release-scope.mjs --manifest release/<candidate>.json')
  if (!manifestArgument && !args.includes('--help')) process.exitCode = 1
} else {
  function git(gitArgs) {
    const result = spawnSync('git', gitArgs, { cwd: repositoryRoot, encoding: 'utf8' })
    if (result.error || result.status !== 0) {
      throw new Error(String(result.stderr || result.error?.message || 'Git command failed.').trim())
    }
    return String(result.stdout || '').trim()
  }

  const manifestPath = isAbsolute(manifestArgument)
    ? manifestArgument
    : resolve(appRoot, manifestArgument)
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.equal(manifest.version, 2, 'Release scope must use version 2.')
  assert.match(String(manifest.name || ''), /^api-split-production-baseline(?:-[a-z0-9-]+)?$/u, 'Release scope has an invalid name.')
  assert.match(String(manifest.baseCommit || ''), /^[0-9a-f]{40}$/iu, 'Release scope is missing baseCommit.')
  assert.match(String(manifest.candidateCommit || ''), /^[0-9a-f]{40}$/iu, 'Release scope is missing candidateCommit.')
  assert.match(String(manifest.environments?.stagingProjectRef || ''), /^[a-z0-9]{20}$/u, 'Release scope is missing stagingProjectRef.')
  assert.match(String(manifest.environments?.productionProjectRef || ''), /^[a-z0-9]{20}$/u, 'Release scope is missing productionProjectRef.')
  assert.ok(Array.isArray(manifest.allowedChangedPaths) && manifest.allowedChangedPaths.length > 0, 'Release scope has no allowedChangedPaths.')
  assert.match(String(manifest.approval?.owner || ''), /\S/u, 'Release scope is missing an owner.')
  assert.match(String(manifest.approval?.rollbackPlan || ''), /\S/u, 'Release scope is missing a rollback plan.')
  assert.match(String(manifest.approval?.createdAt || ''), /^\d{4}-\d{2}-\d{2}T/u, 'Release scope is missing createdAt.')

  git(['merge-base', '--is-ancestor', manifest.baseCommit, manifest.candidateCommit])
  assert.equal(git(['rev-parse', 'HEAD']), manifest.candidateCommit, 'Validate from the candidate commit checkout.')

  const changedPaths = git(['diff', '--name-only', `${manifest.baseCommit}..${manifest.candidateCommit}`]).split('\n').filter(Boolean)
  assert.deepEqual(
    [...changedPaths].sort(),
    [...manifest.allowedChangedPaths].sort(),
    'Release scope paths must exactly match the candidate commit diff.',
  )

  for (const migration of manifest.migrations || []) {
    assert.match(String(migration?.path || ''), /^supabase\/migrations\/.+\.sql$/u, 'Migration path is invalid.')
    assert.match(String(migration?.sha256 || ''), /^[0-9a-f]{64}$/iu, `Migration hash is missing for ${migration.path}.`)
    const content = await readFile(resolve(repositoryRoot, migration.path))
    const hash = createHash('sha256').update(content).digest('hex')
    assert.equal(hash, migration.sha256, `Migration hash differs for ${migration.path}.`)
  }

  console.log(JSON.stringify({
    version: 'api_split_release_scope_validation_v1',
    manifest: relative(appRoot, manifestPath),
    candidateCommit: manifest.candidateCommit,
    changedPathCount: changedPaths.length,
    migrationCount: manifest.migrations?.length || 0,
    productionProjectRef: manifest.environments.productionProjectRef,
    readyForStaging: true,
  }, null, 2))
}
