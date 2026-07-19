import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const options = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=')
  return [key, value || '']
}))
for (const required of ['ledger', 'decisions', 'output']) {
  if (!options[required]) throw new Error(`Use --${required}=<path>.`)
}

const classify = spawnSync(process.execPath, ['scripts/mvp-migration-ledger-classify.mjs', `--ledger=${options.ledger}`, '--json'], {
  cwd: repoRoot,
  encoding: 'utf8',
})
let classification
try { classification = JSON.parse(classify.stdout) } catch { throw new Error(`Unable to classify the ledger: ${classify.stderr || classify.stdout}`) }

const decisions = JSON.parse(readFileSync(path.resolve(repoRoot, options.decisions), 'utf8'))
assert.ok(String(decisions.approvedBy || '').trim(), 'Reconciliation decisions require approvedBy.')
assert.ok(String(decisions.approvedAt || '').trim(), 'Reconciliation decisions require approvedAt.')
const byVersion = new Map((decisions.collisions || []).map((decision) => [String(decision.version), decision]))
const requiredCollisionVersions = classification.classifications.timestampCollisions.map((item) => item.version)
const missingDecisions = requiredCollisionVersions.filter((version) => !byVersion.has(version))
if (missingDecisions.length) throw new Error(`Missing reconciliation decisions for: ${missingDecisions.join(', ')}`)

const collisionPlan = classification.classifications.timestampCollisions.map((collision) => {
  const decision = byVersion.get(collision.version)
  if (decision.disposition !== 'forward_only_reconciliation') {
    throw new Error(`${collision.version} must use disposition forward_only_reconciliation; applied history may not be rewritten.`)
  }
  if (!String(decision.owner || '').trim() || !String(decision.rationale || '').trim()) {
    throw new Error(`${collision.version} requires an owner and rationale.`)
  }
  return {
    ...collision,
    disposition: decision.disposition,
    owner: decision.owner,
    rationale: decision.rationale,
    nextStep: 'Create and review a new uniquely timestamped forward-only reconciliation migration after the staging ledger mapping is approved.',
  }
})

const plan = {
  version: 'arch9_mvp_canonical_migration_plan_v1',
  status: 'manual_forward_only_reconciliation_required',
  projectRef: classification.projectRef,
  ledgerCapturedAt: classification.capturedAt,
  approvedBy: decisions.approvedBy,
  approvedAt: decisions.approvedAt,
  preserveAppliedRemoteVersions: classification.classifications.alreadyAppliedRemotely,
  investigateRemoteOnlyVersions: classification.classifications.remoteOnly,
  pendingLocalOnlyVersions: classification.classifications.localOnly,
  collisionPlan,
  arch9MvpMigrationOrder: ['202607180046', '202607190001'],
  safety: 'This is a plan only. Do not rename, delete, modify, repair, or apply migrations until each forward-only reconciliation migration has separate review and staging approval.',
}

writeFileSync(path.resolve(repoRoot, options.output), `${JSON.stringify(plan, null, 2)}\n`)
console.log(JSON.stringify({ passed: true, output: options.output, status: plan.status, collisionCount: collisionPlan.length }, null, 2))
