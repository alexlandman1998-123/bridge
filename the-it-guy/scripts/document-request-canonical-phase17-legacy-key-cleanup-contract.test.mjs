import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync('scripts/document-request-canonical-phase17-legacy-key-cleanup.mjs', 'utf8')
const verifier = readFileSync('scripts/document-request-canonical-phase14-portal-verification.mjs', 'utf8')

assert.match(
  script,
  /document_request_phase17_legacy_key_cleanup/,
  'Phase 17 cleanup should carry a stable phase marker.',
)
assert.match(script, /document-request-canonical-phase15-operational-rollout\.mjs/, 'Phase 17 should use Phase 15 precheck evidence.')
assert.match(script, /document-request-canonical-phase16-automation\.mjs/, 'Phase 17 should run Phase 16 postcheck after commit.')
assert.match(script, /precheckPortalOutput/, 'Phase 17 should read the full portal precheck output for per-transaction legacy keys.')
assert.match(script, /--confirm-legacy-cleanup/, 'Phase 17 writes should require explicit cleanup confirmation.')
assert.match(script, /options\.commit\s*!==\s*true/, 'Phase 17 should default to dry-run unless commit is explicit.')
assert.match(script, /PRESERVED_REQUIRED_DOCUMENT_STATUSES/, 'Phase 17 should guard uploaded and reviewed rows.')
assert.match(script, /is_required:\s*false/, 'Phase 17 cleanup should disable legacy rows from required-document surfaces.')
assert.match(script, /enabled:\s*false/, 'Phase 17 cleanup should disable legacy rows.')
assert.match(script, /status:\s*'not_required'/, 'Phase 17 cleanup should mark legacy rows not required.')
assert.match(script, /visibility_scope:\s*'internal'/, 'Phase 17 cleanup should hide legacy rows from portals.')
assert.match(script, /deletesRows:\s*false/, 'Phase 17 cleanup should preserve rows instead of deleting them.')
assert.doesNotMatch(
  script,
  /\.from\('document_requests'\)[\s\S]{0,180}\.(insert|upsert|update|delete)\(/,
  'Phase 17 cleanup must not write client-facing document_requests rows.',
)
assert.match(verifier, /function isActiveRequiredRow/, 'Phase 14 verifier should distinguish inactive cleanup rows.')
assert.match(verifier, /\.filter\(isActiveRequiredRow\)/, 'Phase 14 non-canonical key count should only include active rows.')

console.log('document request canonical phase 17 legacy key cleanup contract tests passed')
