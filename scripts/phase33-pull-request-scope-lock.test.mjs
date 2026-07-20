#!/usr/bin/env node

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const scope = JSON.parse(readFileSync('docs/phase-33-pull-request-scope-lock.json', 'utf8'))

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

const release = scope.releaseBoundary
assert.equal(scope.status, 'PULL_REQUEST_SCOPE_LOCKED')
assert.equal(scope.pullRequest.number, 1)
assert.equal(scope.pullRequest.base, 'main')
assert.equal(scope.pullRequest.head, 'codex/mvp-pilot-readiness')
assert.equal(scope.included.productionLedgerRows, 511)
assert.equal(scope.controls.newRuntimeFeaturesAllowed, false)
assert.equal(scope.controls.newMigrationsAllowed, false)
assert.equal(scope.controls.previewBaselineMigrationAllowed, true)
assert.equal(scope.controls.migrationPrecisionNormalizationAllowed, true)
assert.equal(scope.controls.scopeAmendmentRequiresExplicitApproval, true)
assert.equal(scope.approvedRuntimeCorrections.status, 'APPROVED_FOR_RELEASE_CANDIDATE')
assert.equal(scope.approvedRuntimeCorrections.productionPromotionRequiredAfterMerge, true)
assert.equal(scope.approvedRuntimeCorrections.paths.length, 8)
for (const path of scope.approvedRuntimeCorrections.paths) {
  assert.ok(scope.allowedAfterIsolationPaths.includes(path), `${path} must be present in the locked allowlist.`)
}
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202605090000_production_schema_baseline.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202605110003_organisation_branches_foundation.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202605110004_organisation_branding_foundation.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202605250020_bond_rls_scoped_policy_rollout_phase5b.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202606020060_transaction_finance_command_centre_phase1.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202606020070_restore_seller_portal_appointments_payload.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202606280002_development_financials_rls.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202607090001_agency_tasks_foundation.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202607140009_private_listing_transfer_attorney_allocation_phase1.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202607140018_legacy_demo_rls_scoped_replacement.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202607160012_attorney_client_financial_documents_phase1.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/202607170012_seller_document_transaction_continuity_p0_6.sql'))
assert.ok(scope.allowedAfterIsolationPaths.includes('supabase/migrations/20260719201000_mvp_atomic_transaction_creation_grant_hardening.sql'))

for (const commit of [
  release.productionApplicationCommit,
  release.phase32GovernanceCommit,
  release.excludedConcurrentCommit,
  release.scopeIsolationCommit,
  release.postLockDriftCommit,
  release.postLockIsolationCommit,
]) assert.doesNotThrow(() => git(['cat-file', '-e', `${commit}^{commit}`]))

assert.equal(git(['rev-parse', `${release.scopeIsolationCommit}^`]), release.excludedConcurrentCommit)
assert.equal(
  git(['rev-parse', `${release.scopeIsolationCommit}^{tree}`]),
  git(['rev-parse', `${release.phase32GovernanceCommit}^{tree}`]),
  'The isolation commit must restore the exact Phase 32 tree.',
)
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', release.productionApplicationCommit, release.phase32GovernanceCommit]))
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', release.scopeIsolationCommit, 'HEAD']))
assert.equal(git(['rev-parse', `${release.postLockIsolationCommit}^`]), release.postLockDriftCommit)
assert.equal(
  git(['rev-parse', `${release.postLockIsolationCommit}^{tree}`]),
  git(['rev-parse', `${release.postLockDriftCommit}^^{tree}`]),
  'The post-lock isolation commit must restore the tree that existed before the drift commit.',
)
assert.doesNotThrow(() => git(['merge-base', '--is-ancestor', release.postLockIsolationCommit, 'HEAD']))

for (const migration of scope.excluded.deferredMigrations) {
  assert.equal(existsSync(`supabase/migrations/${migration}`), false, `${migration} must remain outside PR #1`)
}

const changedAfterIsolation = [...new Set([
  git(['diff', '--name-only', `${release.scopeIsolationCommit}..HEAD`]),
  git(['diff', '--name-only']),
  git(['ls-files', '--others', '--exclude-standard']),
].flatMap((value) => value.split('\n')).filter(Boolean))].sort()
assert.deepEqual(changedAfterIsolation, [...scope.allowedAfterIsolationPaths].sort())

const excludedDiff = git(['diff', '--name-only', `${release.excludedConcurrentCommit}^`, release.excludedConcurrentCommit])
assert.match(excludedDiff, /202607200014_attorney_matter_module_activation\.sql/)
assert.match(excludedDiff, /202607209904_attorney_workflow_transfer_controller_guard_phase4\.sql/)
assert.match(excludedDiff, /legalDocumentEditor/)
assert.match(excludedDiff, /send-email/)

console.log('Phase 33 pull-request scope lock passed: certified release retained and concurrent feature work excluded without history loss.')
