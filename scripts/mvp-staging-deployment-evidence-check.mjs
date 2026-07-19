import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const expectedMvpVersions = ['202607180046', '202607190001']
const argument = process.argv.find((value) => value.startsWith('--evidence='))
if (!argument) throw new Error('Use --evidence=<staging-deployment-evidence.json>.')

const evidence = JSON.parse(readFileSync(path.resolve(repoRoot, argument.slice('--evidence='.length)), 'utf8'))
const projectRef = String(evidence.projectRef || '')
const appliedVersions = (evidence.postApplyLedger?.appliedVersions || []).map(String)

assert.equal(evidence.environment, 'staging', 'Deployment evidence must be from staging.')
assert.ok(/^[a-z0-9]{20}$/i.test(projectRef), 'A valid staging projectRef is required.')
assert.ok(String(evidence.deployedAt || '').trim(), 'deployedAt is required.')
assert.ok(String(evidence.verifiedBy || '').trim(), 'verifiedBy is required.')
assert.equal(evidence.productionCredentialsUsed, false, 'Deployment evidence must confirm production credentials were not used.')
assert.equal(evidence.preflight?.decision, 'ready_for_human_approved_staging_apply', 'A passing 3C preflight is required.')
assert.equal(String(evidence.preflight?.projectRef || ''), projectRef, '3C preflight projectRef must match the deployment projectRef.')
assert.deepEqual(evidence.preflight?.migrationOrder, expectedMvpVersions, '3C preflight must approve the canonical MVP migration order.')
assert.equal(String(evidence.postApplyLedger?.projectRef || ''), projectRef, 'Post-apply ledger projectRef must match the deployment projectRef.')
assert.equal(Array.isArray(evidence.postApplyLedger?.appliedVersions), true, 'Post-apply ledger must include appliedVersions.')
for (const version of expectedMvpVersions) assert.equal(appliedVersions.includes(version), true, `Post-apply ledger is missing MVP migration ${version}.`)
assert.equal(evidence.rpcCheck?.rpc, 'bridge_create_mvp_transaction', 'The deployed atomic-creation RPC must be checked.')
assert.equal(evidence.rpcCheck?.passed, true, 'The deployed RPC check must pass.')
assert.equal(evidence.rpcCheck?.result, 'deployed', 'The deployed RPC must be present.')
assert.equal(Number.isInteger(evidence.rpcCheck?.httpStatus), true, 'The RPC check must record an HTTP status.')

console.log(JSON.stringify({
  version: 'arch9_mvp_staging_deployment_evidence_v1',
  passed: true,
  projectRef,
  deployedAt: evidence.deployedAt,
  verifiedBy: evidence.verifiedBy,
  appliedMvpVersions: expectedMvpVersions,
  rpc: evidence.rpcCheck.rpc,
  rpcHttpStatus: evidence.rpcCheck.httpStatus,
}, null, 2))
