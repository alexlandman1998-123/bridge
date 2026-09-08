import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, relative } from 'node:path'
import { evaluateJourneyRelease } from './shared-journey-release-gate.mjs'
const cwd = fileURLToPath(new URL('../', import.meta.url))
const suites = [
  'shared-matter-journey-contract', 'shared-matter-journey-plan',
  'shared-matter-journey-atomic', 'shared-matter-journey-reader',
  'shared-matter-journey-views', 'shared-matter-journey-live-refresh',
  'shared-matter-journey-live-hook', 'shared-matter-conversation',
  'shared-matter-conversation-ui', 'shared-matter-reconciliation',
  'shared-matter-reconciliation-service', 'shared-journey-release-gate',
]
const args = process.argv.slice(2)
if (args.length && (args.length !== 2 || args[0] !== '--staging-evidence')) throw new Error('Usage: node scripts/shared-journey-acceptance.mjs [--staging-evidence evidence.json]')
const files = []
function walk(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.isFile()) files.push(full)
  }
}
for (const path of ['src', 'server', '../supabase/migrations']) walk(resolve(cwd, path))
files.push(...suites.map(name => resolve(cwd, `scripts/${name}.test.mjs`)), ...['scripts/shared-journey-acceptance.mjs','scripts/shared-journey-release-gate.mjs','package.json','package-lock.json','vite.config.js'].map(path => resolve(cwd,path)))
function digest() {
  const checksum = createHash('sha256')
  for (const path of [...files].sort()) checksum.update(relative(cwd,path)+'\0').update(readFileSync(path)).update('\0')
  return checksum.digest('hex')
}
const sourceDigest = digest(), results = []
for (const name of suites) {
  process.stderr.write(`Checking ${name}…\n`)
  const started = Date.now(), run = spawnSync(process.execPath, [`scripts/${name}.test.mjs`], { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
  results.push({ name, status: run.status === 0 ? 'passed' : 'failed', durationMs: Date.now()-started })
  if (run.status !== 0) process.stderr.write(`${name} failed; run it individually for diagnostic output.\n`)
}
process.stderr.write('Checking production build…\n')
const build = spawnSync('npm', ['run','build'], { cwd, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024 })
results.push({ name: 'production-build', status: build.status === 0 ? 'passed' : 'failed' })
const local = { sourceDigest, status: results.every(r=>r.status==='passed') && digest()===sourceDigest ? 'passed' : 'failed', results }
const staging = args.length ? JSON.parse(readFileSync(resolve(process.cwd(),args[1]),'utf8')) : null
const gate = evaluateJourneyRelease({local,staging})
console.log(JSON.stringify({schemaVersion:1,recordedAt:new Date().toISOString(),local,gate},null,2))
process.exitCode = gate.decision === 'ready_for_controlled_release' ? 0 : 1
