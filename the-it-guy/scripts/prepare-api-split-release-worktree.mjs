#!/usr/bin/env node
/**
 * Creates an isolated, detached checkout for a reviewed release candidate.
 * It never alters the caller's current worktree or deploys anything.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const repositoryRoot = resolve(appRoot, '..')
const option = (name) => {
  const index = args.indexOf(name)
  return index >= 0 ? String(args[index + 1] || '').trim() : ''
}
const candidate = option('--commit')
const requestedDestination = option('--destination')
const execute = args.includes('--execute')

function git(gitArgs, cwd = repositoryRoot) {
  const result = spawnSync('git', gitArgs, { cwd, encoding: 'utf8' })
  if (result.error || result.status !== 0) {
    throw new Error(String(result.stderr || result.error?.message || 'Git command failed.').trim())
  }
  return String(result.stdout || '').trim()
}

if (args.includes('--help') || !candidate) {
  console.log('Usage: node scripts/prepare-api-split-release-worktree.mjs --commit <sha> [--destination <absolute-path>] --execute')
  if (!candidate && !args.includes('--help')) process.exitCode = 1
} else {
  const commit = git(['rev-parse', '--verify', `${candidate}^{commit}`])
  const destination = requestedDestination
    ? resolve(requestedDestination)
    : resolve(tmpdir(), `api-split-release-${commit.slice(0, 12)}`)

  assert.notEqual(destination, repositoryRoot, 'Release checkout must not replace the active repository worktree.')
  assert.notEqual(destination, resolve('/'), 'Release checkout destination is too broad.')
  assert.equal(existsSync(destination), false, `Release checkout destination already exists: ${destination}`)

  if (!execute) {
    console.log(JSON.stringify({
      version: 'api_split_release_worktree_v1',
      action: 'dry_run',
      commit,
      destination,
      next: 'Review the candidate, then rerun with --execute to create the isolated checkout.',
    }, null, 2))
  } else {
    git(['worktree', 'add', '--detach', destination, commit])
    const checkedOutCommit = git(['rev-parse', 'HEAD'], destination)
    const dirtyEntries = git(['status', '--porcelain=v1', '--untracked-files=all'], destination)
    assert.equal(checkedOutCommit, commit, 'Release checkout does not match the requested commit.')
    assert.equal(dirtyEntries, '', 'New release checkout is unexpectedly dirty.')
    console.log(JSON.stringify({
      version: 'api_split_release_worktree_v1',
      action: 'created',
      commit,
      destination,
      clean: true,
      next: 'Run the release-scope and production-baseline gates from this checkout.',
    }, null, 2))
  }
}
