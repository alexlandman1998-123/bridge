import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('scripts/document-request-canonical-phase15-operational-rollout.mjs', 'utf8')

assert.match(
  source,
  /document_request_phase15_operational_rollout/,
  'Phase 15 rollout should carry a stable phase marker.',
)
assert.match(source, /--commit/, 'Phase 15 should support explicit commit mode.')
assert.match(
  source,
  /--confirm-operational-rollout/,
  'Phase 15 writes should require an operational confirmation flag.',
)
assert.match(
  source,
  /options\.dryRun\s*=\s*options\.commit\s*!==\s*true/,
  'Phase 15 should default to dry-run unless commit is explicit.',
)
assert.match(
  source,
  /syncCanonicalRequiredDocumentsForTransactionContext/,
  'Phase 15 should use the canonical transaction sync service.',
)
assert.match(
  source,
  /dryRun:\s*!options\.commit/,
  'Phase 15 should pass dryRun true until commit is explicit.',
)
assert.match(
  source,
  /document-request-canonical-phase14-portal-verification\.mjs/,
  'Phase 15 should run Phase 14 portal verification as the rollout post-check.',
)
assert.match(
  source,
  /MAX_OPERATIONAL_ROLLOUT_TRANSACTIONS\s*=\s*25/,
  'Phase 15 should cap operational rollout size by default.',
)
assert.match(
  source,
  /hasActivePortalAccess/,
  'Phase 15 should gate or report active portal access readiness.',
)
assert.doesNotMatch(
  source,
  /\.from\('document_requests'\)[\s\S]{0,180}\.(insert|upsert|update|delete)\(/,
  'Phase 15 must not write client-facing document_requests rows.',
)
assert.doesNotMatch(
  source,
  /token:\s*row\.seller_workspace_token|sellerWorkspaceToken:\s*row\.seller_workspace_token/,
  'Phase 15 report must not return raw seller workspace tokens.',
)

console.log('document request canonical phase 15 operational rollout contract tests passed')
