import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const script = readFileSync('scripts/document-request-canonical-phase16-automation.mjs', 'utf8')
const cron = readFileSync('api/cron/document-request-canonical-automation.js', 'utf8')
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'))

assert.match(
  script,
  /document_request_phase16_automation/,
  'Phase 16 automation should carry a stable phase marker.',
)
assert.match(script, /document-request-canonical-phase15-operational-rollout\.mjs/, 'Phase 16 should reuse Phase 15 rollout logic.')
assert.match(script, /--commit/, 'Phase 16 should support explicit commit mode.')
assert.match(script, /--confirm-automation/, 'Phase 16 writes should require explicit automation confirmation.')
assert.match(script, /options\.commit\s*!==\s*true/, 'Phase 16 should default to dry-run unless commit is explicit.')
assert.match(script, /legacy_non_canonical_keys_present/, 'Phase 16 should block scheduled automation on legacy keys by default.')
assert.match(script, /--allow-legacy-keys/, 'Phase 16 should require an explicit override for legacy-key automation.')
assert.match(script, /--scheduling-enabled/, 'Phase 16 should record when the automation is running from a scheduled path.')
assert.match(script, /process\.exitCode\s*=\s*2/, 'Phase 16 should fail blocked commit requests distinctly.')

assert.match(cron, /CRON_SECRET/, 'Phase 16 cron endpoint should require CRON_SECRET authorization.')
assert.match(
  cron,
  /DOCUMENT_REQUEST_CANONICAL_AUTOMATION_COMMIT/,
  'Phase 16 cron endpoint should only write when the commit env flag is enabled.',
)
assert.match(
  cron,
  /DOCUMENT_REQUEST_CANONICAL_AUTOMATION_ALLOW_LEGACY_KEYS/,
  'Phase 16 cron endpoint should require an explicit env override for legacy keys.',
)
assert.match(cron, /sanitizeReport/, 'Phase 16 cron endpoint should return a sanitized report.')
assert.doesNotMatch(
  cron,
  /seller_workspace_token|portal_token|access_token/i,
  'Phase 16 cron endpoint should not expose raw portal tokens.',
)
assert.doesNotMatch(
  script,
  /\.from\('document_requests'\)[\s\S]{0,180}\.(insert|upsert|update|delete)\(/,
  'Phase 16 automation must not write client-facing document_requests rows directly.',
)
assert.ok(
  Array.isArray(vercel.crons) &&
    vercel.crons.some((job) => job.path === '/api/cron/document-request-canonical-automation'),
  'Phase 18 should schedule the Phase 16 cron-compatible endpoint.',
)

console.log('document request canonical phase 16 automation contract tests passed')
