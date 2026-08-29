import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const baseline = readFileSync(resolve(root, 'src/services/observability/buyerLeadsPerformanceBaseline.js'), 'utf8')
const gate = readFileSync(resolve(root, 'src/services/observability/buyerLeadsReleaseGate.js'), 'utf8')
const gateScript = readFileSync(resolve(root, 'scripts/buyer-leads-performance-gate.mjs'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

assert.match(gate, /arch9-buyer-leads-release-gate-v1/)
assert.match(gate, /workspaceReadyMs: 2500/)
assert.match(gate, /duplicateSupabaseRequestCount: 0/)
assert.match(gate, /inactiveSpecialistRequestCount: 0/)
assert.match(gate, /longTaskDurationMs: 200/)
assert.match(gate, /routeChunkTransferBytes: 350_000/)
assert.match(baseline, /evaluateBuyerLeadsReleaseGate\(\{ durationMs, \.\.\.resourceSummary }\)/)
assert.match(baseline, /releaseGateStatus: releaseGate\.status/)
assert.match(baseline, /releaseGateBreaches: releaseGate\.breaches\.map/)
assert.match(gateScript, /seller-leads-performance-budget\.mjs/)
assert.match(gateScript, /BuyerLeadAppointmentsWorkspace\.jsx/)

assert.equal(
  packageJson.scripts['verify:buyer-leads-release-gate'],
  'node scripts/buyer-leads-performance-gate.mjs',
)
assert.match(
  packageJson.scripts['verify:buyer-leads-performance'],
  /test:buyer-leads-release-gate-phase9$/,
)

const verification = spawnSync(process.execPath, ['scripts/buyer-leads-performance-gate.mjs'], {
  cwd: root,
  encoding: 'utf8',
})
assert.equal(verification.status, 0, verification.stderr || verification.stdout)
const report = JSON.parse(verification.stdout)
assert.equal(report.status, 'within_budget')
assert.equal(report.contract, 'arch9-buyer-leads-release-gate-v1')
report.routes.forEach((route) => {
  assert.ok(route.rawBytes <= route.rawBudgetBytes)
  assert.ok(route.gzipBytes <= route.gzipBudgetBytes)
})
report.deferredSpecialistAssets.forEach((asset) => {
  assert.ok(asset.rawBytes <= asset.rawBudgetBytes)
  assert.ok(asset.gzipBytes <= asset.gzipBudgetBytes)
})

console.log('buyer leads Phase 9 release and performance gate passed')
