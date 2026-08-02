import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('scripts/document-request-canonical-phase13-commit-pilot.mjs', 'utf8')

assert.match(
  source,
  /document_request_phase13_commit_pilot/,
  'Phase 13 pilot report should carry a stable phase marker.',
)
assert.match(source, /--commit/, 'Phase 13 writes should require an explicit --commit flag.')
assert.match(
  source,
  /options\.dryRun\s*=\s*options\.commit\s*!==\s*true/,
  'Phase 13 should default to dry-run unless commit is explicit.',
)
assert.match(
  source,
  /syncCanonicalRequiredDocumentsForTransactionContext/,
  'Phase 13 should use the canonical transaction sync service.',
)
assert.match(
  source,
  /dryRun:\s*!options\.commit/,
  'Phase 13 should pass dryRun true until commit is explicit.',
)
assert.match(
  source,
  /MAX_PILOT_TRANSACTIONS\s*=\s*5/,
  'Phase 13 should cap the pilot transaction count by default.',
)
assert.match(
  source,
  /writeFile\(options\.output/,
  'Phase 13 should write an auditable output report.',
)
assert.doesNotMatch(
  source,
  /\.from\('document_requests'\)[\s\S]{0,160}\.(insert|upsert|update|delete)\(/,
  'Phase 13 must not write client-facing document_requests rows.',
)

console.log('document request canonical phase 13 commit pilot contract tests passed')
