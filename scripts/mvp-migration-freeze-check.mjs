import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(path.join(repoRoot, 'docs/arch9-mvp-release-manifest.json'), 'utf8'))

function runGit(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' })
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || 'Git command failed').trim())
  return result.stdout.trim()
}

function splitPaths(value) {
  return value ? value.split('\n').map((line) => line.trim()).filter(Boolean) : []
}

function parseOptions(argv) {
  const options = { base: manifest.baseBranch, branch: '', json: false }
  for (const arg of argv) {
    if (arg === '--json') options.json = true
    else if (arg.startsWith('--base=')) options.base = arg.slice('--base='.length)
    else if (arg.startsWith('--branch=')) options.branch = arg.slice('--branch='.length)
    else throw new Error(`Unknown option: ${arg}`)
  }
  return options
}

const options = parseOptions(process.argv.slice(2))
const branch = options.branch || runGit(['branch', '--show-current'])
const mergeBase = runGit(['merge-base', options.base, 'HEAD'])
const committed = splitPaths(runGit(['diff', '--name-only', `${mergeBase}..HEAD`, '--', 'supabase/migrations']))
const worktree = [
  ...splitPaths(runGit(['diff', '--name-only', '--', 'supabase/migrations'])),
  ...splitPaths(runGit(['diff', '--cached', '--name-only', '--', 'supabase/migrations'])),
  ...splitPaths(runGit(['ls-files', '--others', '--exclude-standard', '--', 'supabase/migrations'])),
]
const migrationPaths = [...new Set([...committed, ...worktree])].sort()
const onReleaseBranch = new RegExp(manifest.releaseBranchPattern).test(branch)
const unapproved = migrationPaths.filter((filePath) => !manifest.allowedPaths.includes(filePath))
const blockers = []

if (migrationPaths.length && !onReleaseBranch) blockers.push('migration_changes_outside_mvp_release_branch')
if (unapproved.length) blockers.push('migration_changes_not_in_mvp_release_manifest')

const report = {
  version: 'arch9_mvp_migration_freeze_v1',
  decision: blockers.length ? 'frozen' : 'permitted',
  branch,
  migrationPaths,
  unapprovedMigrationPaths: unapproved,
  blockers,
  policy: 'During ledger reconciliation, edit Supabase migrations only in the dedicated Arch9 MVP release branch and only after adding the migration to the release manifest.',
}

if (options.json) console.log(JSON.stringify(report, null, 2))
else {
  console.log(`Decision: ${report.decision}`)
  console.log(`Branch: ${report.branch}`)
  console.log(`Migration changes: ${migrationPaths.length ? migrationPaths.join(', ') : 'none'}`)
  console.log(`Blockers: ${blockers.length ? blockers.join(', ') : 'none'}`)
}

if (blockers.length) process.exit(1)
