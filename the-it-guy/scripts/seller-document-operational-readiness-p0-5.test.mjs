import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerDocumentOperationalReadinessReport } from '../src/lib/sellerDocumentOperationalReadiness.js'

const healthy = {
  private_listing_id: 'listing-healthy',
  organisation_id: 'organisation-1',
  required_count: 4,
  satisfied_count: 4,
  received_pending_approval_count: 0,
  missing_count: 0,
  rejected_count: 0,
  overdue_count: 0,
  unissued_request_count: 0,
  false_completion_count: 0,
  cross_listing_link_count: 0,
  canonical_mismatch_count: 0,
  blocking_issue_count: 0,
  attention_issue_count: 0,
  lifecycle_health: 'healthy',
}
const attention = {
  ...healthy,
  private_listing_id: 'listing-attention',
  satisfied_count: 3,
  received_pending_approval_count: 1,
  missing_count: 1,
  attention_issue_count: 1,
  lifecycle_health: 'attention',
  lifecycle_issue: 'uploaded_document_waiting_for_review',
  required_action: 'review_received_seller_document',
}
const blocked = {
  ...healthy,
  private_listing_id: 'listing-blocked',
  satisfied_count: 3,
  missing_count: 1,
  false_completion_count: 1,
  blocking_issue_count: 1,
  lifecycle_health: 'blocked',
  lifecycle_issue: 'false_completion',
  required_action: 'reconcile_false_completions',
}

const pass = buildSellerDocumentOperationalReadinessReport([healthy], { generatedAt: '2026-07-17T12:00:00Z' })
assert.equal(pass.version, 'seller_document_operational_readiness_p0_5_v1')
assert.equal(pass.gate.status, 'pass')
assert.equal(pass.gate.releaseRecommended, true)
assert.equal(pass.summary.required, 4)
assert.equal(pass.summary.satisfied, 4)

const warning = buildSellerDocumentOperationalReadinessReport([healthy, attention])
assert.equal(warning.gate.status, 'warning')
assert.deepEqual(warning.attentionListingIds, ['listing-attention'])
assert.equal(warning.summary.receivedPendingApproval, 1)

const failure = buildSellerDocumentOperationalReadinessReport([healthy, attention, blocked])
assert.equal(failure.gate.status, 'blocked')
assert.equal(failure.gate.releaseRecommended, false)
assert.deepEqual(failure.blockingListingIds, ['listing-blocked'])
assert.equal(failure.summary.falseCompletions, 1)
assert.equal(failure.summary.lifecycleIssueCounts.false_completion, 1)

const empty = buildSellerDocumentOperationalReadinessReport([])
assert.equal(empty.gate.status, 'warning')
assert.match(empty.gate.reason, /No seller document readiness rows/)

const migration = await readFile(
  new URL('../../supabase/migrations/202607170011_seller_document_operational_readiness_p0_5.sql', import.meta.url),
  'utf8',
)
for (const marker of [
  'private_listing_seller_document_operational_readiness_v1',
  'seller_document_reconciliation_runs',
  'bridge_reconcile_seller_document_operations_p0_5',
  'completed_onboarding_without_requirements',
  'required_request_not_issued',
  'cross_listing_document_link',
  'canonical_requirement_mismatch',
  'false_completion',
  "'mode', 'dry_run', 'mutated', false",
  'falseCompletionsReopened',
  'p_apply boolean default false',
  'bridge_is_active_member',
  'Seller document repair apply mode requires the service role',
]) {
  assert.ok(migration.includes(marker), `P0-5 migration must include ${marker}`)
}

const cli = await readFile(new URL('./audit-seller-document-operational-readiness.mjs', import.meta.url), 'utf8')
assert.match(cli, /--confirm-apply/)
assert.match(cli, /Apply mode requires --organisation-id or --listing-id/)
assert.match(cli, /--strict/)

const runbook = await readFile(new URL('../docs/seller-document-operations-p0-5.md', import.meta.url), 'utf8')
assert.match(runbook, /uploaded document is received, not satisfied/i)
assert.match(runbook, /seller_document_reconciliation_runs/)
assert.match(runbook, /Rerun the strict audit/)

const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8')
assert.match(packageSource, /test:seller-document-operations-p0-5/)
assert.match(packageSource, /verify:seller-document-automation/)
assert.match(packageSource, /audit:seller-document-operations/)

console.log('seller document operational readiness P0-5 tests passed')
