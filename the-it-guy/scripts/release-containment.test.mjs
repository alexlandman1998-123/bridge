import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [guard, packageJson, releaseScope] = await Promise.all([
  readFile('scripts/verify-release-containment.mjs', 'utf8'),
  readFile('package.json', 'utf8'),
  readFile('release/transaction-spine-20260723.json', 'utf8'),
])
const packageDefinition = JSON.parse(packageJson)
const scope = JSON.parse(releaseScope)

assert.match(guard, /\['status', '--porcelain=v1', '--untracked-files=all'\]/)
assert.match(guard, /direct source uploads are blocked/i)
assert.match(guard, /VERCEL_GIT_COMMIT_SHA/)
assert.match(guard, /Release identifier.*does not match checked-out commit/i)
assert.match(guard, /Migration checksum does not match/i)
assert.match(guard, /Release commit contains paths outside the declared scope/i)
assert.equal(packageDefinition.scripts['verify:release-containment'], 'node scripts/verify-release-containment.mjs')
assert.equal(
  packageDefinition.scripts['verify:transaction-spine-release'],
  'node scripts/verify-release-containment.mjs --release-manifest release/transaction-spine-20260723.json',
)
assert.match(packageDefinition.scripts['build:guarded'], /verify:release-containment/)
assert.equal(scope.version, 1)
assert.equal(scope.baseCommit, '64a2a7c041e621be40c87f7a7eee47cadffc4757')
assert.ok(scope.allowedChangedPaths.includes('supabase/migrations/202607230010_transaction_progress_scheduler_proof_phase8.sql'))
assert.ok(scope.allowedChangedPaths.includes('supabase/migrations/202607230011_bond_bank_outcome_originator_rls_repair.sql'))
assert.equal(scope.migrations.length, 2)

console.log('Release containment contract checks passed.')
