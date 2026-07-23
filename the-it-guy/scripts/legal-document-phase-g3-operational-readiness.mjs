import { spawnSync } from 'node:child_process'

// Keep the historical legal-document command as an alias, but never let it
// diverge from the stricter document-generator F2–F4 operational evaluator
// used by the Phase 4 release gate.
const result = spawnSync(process.execPath, ['scripts/document-generator-phase-g3-operational-readiness.mjs'], {
  cwd: process.cwd(),
  env: process.env,
  encoding: 'utf8',
  timeout: 360_000,
  maxBuffer: 20 * 1024 * 1024,
})
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
process.exitCode = Number.isInteger(result.status) ? result.status : 1
