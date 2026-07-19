import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { evaluateMvpScaleProgression } from '../the-it-guy/src/core/transactions/mvpScaleProgression.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inputArg = process.argv.find((arg) => arg.startsWith('--input='))
if (!inputArg) throw new Error('Use --input=<production-rollout-evidence.json>.')
const input = JSON.parse(readFileSync(path.resolve(repoRoot, inputArg.slice('--input='.length)), 'utf8'))
const progression = evaluateMvpScaleProgression(input)
const maintenance = input.capacityMaintenance || {}

assert.equal(input.environment, 'production', 'Capacity-maintenance evidence must be marked production.')
assert.equal(progression.decision, 'maintain_mvp_capacity', 'Capacity-maintenance evidence is only valid at the 100-transaction MVP ceiling.')
for (const field of ['reviewedBy', 'reviewedAt', 'reviewerRole', 'decision']) {
  assert.ok(String(maintenance[field] || '').trim(), `capacityMaintenance requires ${field}.`)
}
assert.equal(['release', 'operations', 'executive'].includes(String(maintenance.reviewerRole).toLowerCase()), true, 'capacityMaintenance.reviewerRole must be release, operations, or executive.')
assert.equal(maintenance.decision, 'maintain_mvp_capacity', 'capacityMaintenance must explicitly maintain the MVP ceiling.')
assert.equal(maintenance.monthlyTransactionLimit, 100, 'The maintained monthly transaction limit must remain 100.')
assert.equal(maintenance.newProductScopeIntroduced, false, 'No new product scope may be introduced while maintaining MVP capacity.')
assert.equal(Number.isInteger(maintenance.recurringOperationalBlockerCount), true, 'recurringOperationalBlockerCount must be an integer.')
assert.equal(maintenance.recurringOperationalBlockerCount, 0, 'Recurring operational blockers must be resolved before maintaining the MVP ceiling.')
assert.equal(maintenance.productionCredentialsUsed, false, 'Capacity-maintenance evidence must not use production credentials.')
assert.equal(Number.isNaN(Date.parse(maintenance.reviewedAt)), false, 'capacityMaintenance.reviewedAt must be an ISO-compatible timestamp.')

console.log(JSON.stringify({
  version: 'arch9_mvp_capacity_maintenance_evidence_v1',
  passed: true,
  decision: maintenance.decision,
  monthlyTransactionLimit: maintenance.monthlyTransactionLimit,
  reviewedBy: maintenance.reviewedBy,
  safety: 'This validates the MVP capacity-maintenance review only; it does not expand scope or change production limits.',
}, null, 2))
