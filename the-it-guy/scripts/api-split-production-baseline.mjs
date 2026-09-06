#!/usr/bin/env node
/**
 * Read-only release gate for the API-split baseline. It intentionally does
 * not apply migrations, deploy code, write to production, or create Git tags.
 *
 * Usage:
 *   node scripts/api-split-production-baseline.mjs --report
 *   node scripts/api-split-production-baseline.mjs --strict --linked --advisors
 */
import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = new Set(process.argv.slice(2))
const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const appDirectory = resolve(scriptDirectory, '..')
const repositoryDirectory = resolve(appDirectory, '..')
const migrationsDirectory = resolve(repositoryDirectory, 'supabase/migrations')
const strict = args.has('--strict')

function run(command, commandArgs, cwd = repositoryDirectory) {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 30_000,
  })
  return {
    command: [command, ...commandArgs].join(' '),
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || result.error?.message || '').trim(),
  }
}

function check(label, passed, detail, blocking = true) {
  return { label, passed: Boolean(passed), detail, blocking }
}

async function localChecks() {
  const checks = []
  const migrationNames = (await readdir(migrationsDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  // The project has both legacy minute-resolution (12 digit) and current
  // second-resolution (14 digit) Supabase migration timestamps.
  const migrationVersions = migrationNames.map((name) => name.match(/^(\d{12}|\d{14})_/u)?.[1] || '')
  const duplicateVersions = migrationVersions.filter((version, index) => version && migrationVersions.indexOf(version) !== index)

  checks.push(check(
    'migration filenames',
    migrationNames.length > 0 && migrationVersions.every(Boolean) && duplicateVersions.length === 0,
    `${migrationNames.length} migrations; ${duplicateVersions.length} duplicate timestamp version(s).`,
  ))

  const projectRef = await readFile(resolve(repositoryDirectory, 'supabase/.temp/project-ref'), 'utf8')
    .then((value) => value.trim())
    .catch(() => '')
  checks.push(check('linked Supabase project', /^[a-z0-9]{20}$/u.test(projectRef), projectRef || 'No linked project ref found.'))

  const containment = run('git', ['status', '--porcelain=v1', '--untracked-files=all'])
  const dirtyEntries = containment.stdout.split('\n').filter(Boolean)
  checks.push(check(
    'clean release source',
    containment.ok && dirtyEntries.length === 0,
    containment.ok ? `${dirtyEntries.length} changed or untracked path(s).` : containment.stderr,
  ))

  const head = run('git', ['rev-parse', 'HEAD'])
  checks.push(check('release commit', head.ok && /^[0-9a-f]{40}$/iu.test(head.stdout), head.stdout || head.stderr))

  const releaseContract = run('npm', ['run', 'test:release-integrity-contract', '--silent'], appDirectory)
  checks.push(check(
    'release integrity contract',
    releaseContract.ok,
    releaseContract.ok ? 'passed' : (releaseContract.stderr || releaseContract.stdout),
  ))

  return { checks, projectRef, headCommit: head.stdout || null }
}

function optionalLinkedChecks(projectRef) {
  const checks = []
  if (args.has('--linked')) {
    const migrations = run('supabase', ['migration', 'list', '--linked', '--project-ref', projectRef])
    checks.push(check('linked migration ledger', migrations.ok, migrations.ok ? 'retrieved' : (migrations.stderr || migrations.stdout)))
  }
  if (args.has('--advisors')) {
    const advisors = run('supabase', ['db', 'advisors', '--linked', '--project-ref', projectRef, '--type', 'security', '--fail-on', 'error'])
    checks.push(check('linked security advisors', advisors.ok, advisors.ok ? 'no error-level findings' : (advisors.stderr || advisors.stdout)))
  }
  return checks
}

const local = await localChecks()
const checks = [...local.checks, ...optionalLinkedChecks(local.projectRef)]
const blockingFailures = checks.filter((item) => item.blocking && !item.passed)
const result = {
  version: 'api_split_production_baseline_v1',
  mode: strict ? 'strict' : 'report',
  commit: local.headCommit,
  projectRef: local.projectRef || null,
  checks,
  ready: blockingFailures.length === 0,
  next: blockingFailures.length === 0
    ? 'Run staging workflow certification, then obtain explicit production deployment approval.'
    : 'Resolve every blocking check before declaring the API-split production baseline.',
}

console.log(JSON.stringify(result, null, 2))
if (strict && !result.ready) process.exitCode = 1
