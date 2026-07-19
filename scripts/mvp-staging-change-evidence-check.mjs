import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const option = process.argv.find((arg) => arg.startsWith('--evidence='))
if (!option) throw new Error('Use --evidence=<staging-change-evidence.json>.')
const evidence = JSON.parse(readFileSync(path.resolve(repoRoot, option.slice('--evidence='.length)), 'utf8'))

assert.ok(/^[a-z0-9]{20}$/i.test(String(evidence.projectRef || '')), 'A valid staging projectRef is required.')
assert.ok(String(evidence.migrationListCapturedAt || '').trim(), 'migrationListCapturedAt is required.')
assert.ok(String(evidence.ledgerEvidencePath || '').trim(), 'ledgerEvidencePath is required.')
assert.ok(String(evidence.releaseOwner || '').trim(), 'releaseOwner is required.')
assert.ok(String(evidence.databaseOwner || '').trim(), 'databaseOwner is required.')
assert.ok(String(evidence.rollbackOwner || '').trim(), 'rollbackOwner is required.')
assert.equal(evidence.backupDecision, 'backup_or_recovery_plan_confirmed', 'backupDecision must explicitly confirm a backup or recovery plan.')
assert.equal(evidence.rollbackDecision, 'forward_fix_or_feature_disable_only', 'Rollback must use a forward fix or feature disable; never an applied-migration rewrite.')
assert.equal(evidence.productionCredentialsUsed, false, 'Staging evidence must confirm production credentials were not used.')
assert.equal(evidence.approvedForStagingApply, true, 'Explicit staging-apply approval is required.')

console.log(JSON.stringify({
  version: 'arch9_mvp_staging_change_evidence_v1',
  passed: true,
  projectRef: evidence.projectRef,
  releaseOwner: evidence.releaseOwner,
  databaseOwner: evidence.databaseOwner,
  rollbackOwner: evidence.rollbackOwner,
  rollbackDecision: evidence.rollbackDecision,
}, null, 2))
