import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('scripts/document-request-canonical-phase14-portal-verification.mjs', 'utf8')

assert.match(
  source,
  /document_request_phase14_portal_verification/,
  'Phase 14 portal verification should carry a stable phase marker.',
)
assert.match(
  source,
  /buildDocumentCenter/,
  'Phase 14 should verify the actual client portal document-centre model.',
)
assert.match(
  source,
  /transaction_required_documents/,
  'Phase 14 should read committed required-document rows.',
)
assert.match(
  source,
  /document_requests/,
  'Phase 14 should verify client-facing request rows were not created.',
)
assert.match(
  source,
  /sellerWorkspaceTokenPresent/,
  'Phase 14 should report seller portal token presence without printing the token.',
)
assert.doesNotMatch(
  source,
  /token:\s*row\.seller_workspace_token|sellerWorkspaceToken:\s*row\.seller_workspace_token|\.select\([^)]*token[^)]*\)[\s\S]{0,240}return\s+\{/,
  'Phase 14 report must not return raw portal tokens.',
)
assert.doesNotMatch(
  source,
  /\.(insert|upsert|update|delete)\(/,
  'Phase 14 portal verification must be read-only.',
)
assert.match(
  source,
  /writeFile\(options\.output/,
  'Phase 14 should write an auditable output report.',
)

console.log('document request canonical phase 14 portal verification contract tests passed')
