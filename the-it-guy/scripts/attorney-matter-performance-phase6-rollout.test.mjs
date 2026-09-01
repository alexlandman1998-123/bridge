import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const migration = readFileSync(resolve(root, '../supabase/migrations/20260830133536_attorney_matter_snapshot_phase6_controlled_rollout.sql'), 'utf8')
const canaryMigration = readFileSync(resolve(root, '../supabase/migrations/20260831185212_canary_attorney_matter_snapshot_one_firm.sql'), 'utf8')
const service = readFileSync(resolve(root, 'src/services/attorneyMatterSnapshotRolloutService.js'), 'utf8')
const page = readFileSync(resolve(root, 'src/pages/AttorneyMattersPage.jsx'), 'utf8')
const verifier = readFileSync(resolve(root, 'scripts/verify-attorney-matter-performance-phase6.mjs'), 'utf8')
const runbook = readFileSync(resolve(root, 'docs/attorney-matter-performance-phase6-rollout.md'), 'utf8')

for (const token of [
  'attorney_matter_snapshot_rollout_config',
  "('production', false, 0",
  'get_attorney_matter_snapshot_rollout_status',
  'security invoker',
  'firm_access_required',
  'rollout_disabled',
]) {
  assert.ok(migration.includes(token), `Phase 6 rollout migration should include ${token}`)
}
assert.doesNotMatch(migration, /security definer/i)

for (const token of [
  'canary_firm_id',
  'explicit_firm_canary',
  'rollout_percentage = 0',
  'eligible_firm_count <> 1',
  "assignment.scope_metadata ->> 'source' = 'canonical_attorney_assignment_backfill'",
]) {
  assert.ok(canaryMigration.includes(token), `One-firm canary migration should include ${token}`)
}
assert.match(canaryMigration, /security invoker/i)
assert.doesNotMatch(canaryMigration, /security definer/i)

assert.match(service, /getAttorneyMatterSnapshotRolloutStatus/)
assert.match(service, /client\.rpc\('get_attorney_matter_snapshot_rollout_status'/)
assert.match(service, /rollout_status_unavailable/)

assert.match(page, /getAttorneyMatterSnapshotRolloutStatus\(attorneyFirmId\)/)
assert.match(page, /usesSnapshotReadModel && snapshotRollout\.enabled/)
assert.doesNotMatch(page, /usesSnapshotReadModel && !snapshotRollout\.checked/)

assert.match(verifier, /bridge_attorney_matter_list_snapshot/)
assert.match(verifier, /Production must remain disabled until explicit approval/)
for (const token of ['EXPLAIN (ANALYZE, BUFFERS)', '5%', '25%', '50%', '100%', 'Roll back immediately']) {
  assert.ok(runbook.includes(token), `Phase 6 runbook should include ${token}`)
}

console.log('Attorney matter performance Phase 6 controlled rollout contract passed.')
