import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./agency-production-release-gate.mjs', import.meta.url), 'utf8')

for (const token of [
  "phase: '6'",
  "environment: 'production'",
  'APPROVED_RUNTIME_PROJECTS.production',
  '--allow-production-read-only',
  '--confirm-production-readiness',
  '--release-ref=',
  "runGit(['status', '--porcelain'])",
  'workingTreeClean',
  'runRuntimeReadiness({',
  'allowProductionReadOnly: true',
  'mutatedData: false',
]) {
  assert.ok(source.includes(token), `Production release gate must include ${token}`)
}

const acknowledgementGuard = source.indexOf('if (!options.allowProductionReadOnly || !options.confirmProductionReadiness)')
const runtimeProbe = source.indexOf('const runtime = await runRuntimeReadiness')
assert.ok(acknowledgementGuard >= 0 && runtimeProbe > acknowledgementGuard, 'Production runtime probes must be guarded by explicit acknowledgement.')

console.log('Agency production release gate contract passed.')
