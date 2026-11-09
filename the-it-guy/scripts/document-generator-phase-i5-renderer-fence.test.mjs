import { assertRetiredDocumentEndpoint } from './helpers/retiredDocumentContracts.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(
  '../supabase/migrations/202607180034_document_generator_renderer_fence_i5.sql',
  'utf8',
)
for (const token of [
  'bridge_assert_generation_lease_i5',
  'I5_GENERATION_LEASE_FENCE_REJECTED',
  'I5_PACKET_LOCKED_DURING_RENDER',
  "('pre_render','pre_persist')",
  "'i5-generator-v1'",
  'bridge_probe_renderer_fence_i5',
  "'i5-generator-diagnostic-v1'",
  'serviceExecute',
  'authenticatedExecute',
  "'mutatedData',false",
])
  assert.match(migration, new RegExp(token.replace(/[()]/g, '\\$&')))
assert.match(migration, /revoke all[\s\S]+from public,anon,authenticated/i)

// The old renderer is now unreachable; its stronger boundary is HTTP 410.
await assertRetiredDocumentEndpoint('generate-mandate')

const mandateApi = fs.readFileSync('src/lib/generateMandateDocument.js', 'utf8')
assert.match(mandateApi, /invocationError\.code = String\(error\.code \|\| 'EDGE_INVOCATION_FAILED'\)/)
const supabaseClient = fs.readFileSync('src/lib/supabaseClient.js', 'utf8')
assert.match(supabaseClient, /payload\?\.errorCode \|\| payload\?\.error_code \|\| payload\?\.code/)

const i4 = fs.readFileSync('scripts/document-generator-phase-i4-attempt-observability.mjs', 'utf8')
assert.match(i4, /READY_FOR_I5/)
const verifier = fs.readFileSync('scripts/document-generator-phase-i5-renderer-fence.mjs', 'utf8')
for (const token of [
  'STAGING_PROJECT_REF',
  'SAFE_MISMATCH_ATTEMPT_ID',
  'document-generator-phase-i4-attempt-observability.mjs',
  'document-generator-phase-g1-verify.mjs',
  'createHash',
  'stateDigest',
  'bridge_probe_renderer_fence_i5',
  'bridge_assert_generation_lease_i5',
  'rendererCheckpointsCovered',
  'ambiguousTimeoutFenced',
  'beforeSnapshots',
  'afterSnapshots',
  'mutatedData: false',
])
  assert.match(verifier, new RegExp(token))
assert.doesNotMatch(verifier, /\.insert\(|\.upsert\(|\.delete\(|service[^;\n]*\.update\(/)

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.ok(pkg.scripts?.['test:document-generator-phase-i5'])
assert.ok(pkg.scripts?.['verify:document-generator:phase-i5'])
console.log('Document generator I5 renderer-fence contract passed.')
