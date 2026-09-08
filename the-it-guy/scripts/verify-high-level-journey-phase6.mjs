import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { evaluateHighLevelJourneyRelease } from './high-level-journey-release-gate.mjs'

const cwd = fileURLToPath(new URL('..', import.meta.url))
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--evidence')) throw Error('Usage: node scripts/verify-high-level-journey-phase6.mjs [--evidence staging.json]')
const tests = [
  'high-level-journey-rules.test.mjs', 'high-level-journey-integration.test.mjs',
  'high-level-journey-audiences.test.mjs', 'developer-overview-journey.test.mjs',
  'developer-workspace-placement.test.mjs', 'shared-matter-journey-contract.test.mjs',
  'shared-matter-journey-views.test.mjs', 'shared-matter-journey-live-refresh.test.mjs',
  'shared-matter-journey-live-hook.test.mjs', 'shared-journey-release-gate.test.mjs',
  'high-level-journey-release-gate.test.mjs',
  'shared-matter-journey-reader.test.mjs',
]
function digest() {
  const root = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' })
  if (root.status !== 0) throw Error('Cannot resolve candidate repository')
  const repository = root.stdout.trim()
  const listing = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repository, encoding: 'utf8' })
  if (listing.status !== 0) throw Error('Cannot enumerate candidate files')
  const hash = createHash('sha256')
  for (const path of [...new Set(listing.stdout.split('\0').filter(Boolean))].sort()) {
    // Bind actual application, server, dependency, test and migration contents;
    // documentation/evidence files are excluded to avoid self-referential hashes.
    if (!/^(the-it-guy\/(src|server|scripts|api)\/|supabase\/migrations\/|the-it-guy\/(package.*\.json|vite\.config\.[^/]+)$)/.test(path)) continue
    hash.update(path).update('\0')
    try { hash.update(readFileSync(resolve(repository, path))) }
    catch (error) { if (error.code !== 'ENOENT') throw error; hash.update('DELETED') }
    hash.update('\0')
  }
  return hash.digest('hex')
}
const before = digest(), results = []
for (const test of tests) {
  const run = spawnSync(process.execPath, [`scripts/${test}`], { cwd, stdio: 'inherit' })
  results.push({ test, passed: run.status === 0 })
}
const build = spawnSync('npm', ['run', 'build'], { cwd, stdio: 'inherit' })
results.push({ test: 'production-build', passed: build.status === 0 })
const after = digest()
const local = { status: results.every(r => r.passed) && before === after ? 'passed' : 'failed', sourceDigest: after }
const staging = args.length ? JSON.parse(readFileSync(resolve(args[1]), 'utf8')) : null
const release = evaluateHighLevelJourneyRelease({ local, staging })
console.log(JSON.stringify({ local, results, release }, null, 2))
process.exitCode = release.decision === 'ready_for_controlled_release' ? 0 : 1
