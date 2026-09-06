import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['scripts/api-split-phase1-inventory.mjs', '--strict'], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
})
assert.equal(result.status, 0, result.stderr)
const inventory = JSON.parse(result.stdout)

assert.equal(inventory.version, 'api_split_phase1_inventory_v1')
assert.ok(inventory.exportCount >= 370, 'the public API inventory unexpectedly lost exports')
assert.equal(inventory.exportSurfaceMatchesBaseline, true, 'the public API surface changed without an intentional baseline update')
assert.ok(inventory.directCallerCount >= 50, 'the import graph was not discovered')
assert.equal(inventory.blockers.missingCriticalExports.length, 0)
assert.equal(inventory.blockers.missingEvidence.length, 0)
assert.ok(inventory.criticalContracts.length >= 12)
assert.ok(inventory.sourceCoupledTestCount > 0, 'source-coupled tests should be tracked before they are retired')

console.log('API-split Phase 1 inventory tests passed.')
