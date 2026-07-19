import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))
if (!options.evidence || !options['deployment-evidence']) {
  throw new Error('Use --evidence=<staging-rollback-evidence.json> --deployment-evidence=<staging-deployment-evidence.json>.')
}

const evidence = JSON.parse(readFileSync(path.resolve(repoRoot, options.evidence), 'utf8'))
const deployment = JSON.parse(readFileSync(path.resolve(repoRoot, options['deployment-evidence']), 'utf8'))

assert.equal(evidence.environment, 'staging', 'Rollback drill evidence must be from staging.')
assert.equal(evidence.projectRef, deployment.projectRef, 'Rollback drill must use the verified staging project.')
for (const field of ['performedBy', 'performedAt', 'runbookReference', 'resultSummary']) {
  assert.ok(String(evidence[field] || '').trim(), `Rollback drill evidence requires ${field}.`)
}
assert.equal(evidence.drillType, 'forward_fix_or_feature_disable', 'The rollback drill must use the forward-fix or feature-disable recovery path.')
assert.equal(evidence.restoredOperationalState, true, 'Rollback drill must restore an operational state.')
assert.equal(evidence.dataDestructive, false, 'Rollback drill must not be destructive.')
assert.equal(evidence.productionCredentialsUsed, false, 'Rollback drill must not use production credentials.')
assert.equal(Number.isNaN(Date.parse(evidence.performedAt)), false, 'performedAt must be an ISO-compatible timestamp.')

console.log(JSON.stringify({
  version: 'arch9_mvp_staging_rollback_evidence_v1',
  passed: true,
  projectRef: evidence.projectRef,
  performedBy: evidence.performedBy,
  performedAt: evidence.performedAt,
  drillType: evidence.drillType,
  safety: 'This validates a recorded staging drill only; it does not execute a rollback or connect to production.',
}, null, 2))
