import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const plan = JSON.parse(readFileSync(fileURLToPath(new URL('../release/production-migration-ledger-rehearsal-plan-2026-09-06.json', import.meta.url)), 'utf8'))
assert.equal(plan.mode, 'dry_run_only')
assert.equal(plan.status, 'blocked')
assert.equal(plan.guarantees.includes('No SQL was applied.'), true)
assert.equal(plan.blockedRequirements.some(({ id }) => id === 'production-source-recovery'), true)
assert.equal(plan.scope.staging.observedMigrationCount > 0, true)
assert.equal(plan.scope.productionToStaging.timestampAliases.length > 0, true)
console.log('migration-ledger-rehearsal-plan: passed')
