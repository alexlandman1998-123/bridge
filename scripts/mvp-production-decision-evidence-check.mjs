import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))
if (!options.evidence) throw new Error('Use --evidence=<production-pilot-decision.json>.')

const decision = JSON.parse(readFileSync(path.resolve(repoRoot, options.evidence), 'utf8'))
for (const field of ['releaseOwner', 'pilotOwner', 'supportOwner', 'rollbackOwner', 'approvedBy', 'approvedAt', 'approvedByRole', 'stagingProjectRef']) {
  assert.ok(String(decision[field] || '').trim(), `decision-evidence requires ${field}.`)
}
assert.equal(decision.decision, 'approved_for_controlled_production_pilot', 'The decision must explicitly approve a controlled production pilot.')
assert.equal(['release', 'operations', 'executive'].includes(String(decision.approvedByRole).toLowerCase()), true, 'approvedByRole must be release, operations, or executive.')
assert.equal(Number.isInteger(decision.initialBatchSize), true, 'initialBatchSize must be an integer.')
assert.equal(decision.initialBatchSize, 10, 'The initial production batch is fixed at 10 transactions.')
assert.equal(decision.pilotScope, 'controlled_production_pilot', 'pilotScope must be controlled_production_pilot.')
assert.equal(decision.stagingAcceptanceDecision, 'accepted_for_pilot_consideration', 'The decision must acknowledge Phase 5 staging acceptance.')
assert.equal(decision.rollbackProcedureReviewed, true, 'Rollback procedure must be reviewed.')
assert.equal(decision.knownMvpLimitationsAccepted, true, 'Known MVP limitations must be accepted.')
assert.equal(decision.productionCredentialsUsed, false, 'Decision evidence must not use production credentials.')
assert.equal(Number.isNaN(Date.parse(decision.approvedAt)), false, 'approvedAt must be an ISO-compatible timestamp.')
assert.ok(/^[a-z0-9]{20}$/i.test(decision.stagingProjectRef), 'stagingProjectRef must be a valid Supabase project reference.')

if (options['deployment-evidence']) {
  const deployment = JSON.parse(readFileSync(path.resolve(repoRoot, options['deployment-evidence']), 'utf8'))
  assert.equal(decision.stagingProjectRef, deployment.projectRef, 'Decision evidence must reference the verified staging deployment project.')
}

console.log(JSON.stringify({
  version: 'arch9_mvp_production_decision_evidence_v1',
  passed: true,
  decision: decision.decision,
  approvedBy: decision.approvedBy,
  approvedByRole: decision.approvedByRole,
  owners: {
    releaseOwner: decision.releaseOwner,
    pilotOwner: decision.pilotOwner,
    supportOwner: decision.supportOwner,
    rollbackOwner: decision.rollbackOwner,
  },
  initialBatchSize: decision.initialBatchSize,
  stagingProjectRef: decision.stagingProjectRef,
  safety: 'This is a decision-evidence check only; it does not access production or start a pilot.',
}, null, 2))
