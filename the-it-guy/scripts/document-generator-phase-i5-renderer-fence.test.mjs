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

const renderer = fs.readFileSync('../supabase/functions/generate-mandate/index.ts', 'utf8')
const preRender = renderer.indexOf(
  'assertGenerationLeaseFenceI5(supabase, packetId, generationAttemptId, "pre_render")',
)
const prePersist = renderer.indexOf(
  'assertGenerationLeaseFenceI5(supabase, packetId, generationAttemptId, "pre_persist")',
  preRender,
)
const upload = renderer.indexOf('.upload(', prePersist)
assert.ok(
  preRender > 0 && prePersist > preRender && upload > prePersist,
  'renderer must fence before rendering and immediately before upload',
)
assert.match(renderer, /GENERATION_LEASE_FENCE_REJECTED/)
assert.match(renderer, /generationFence:/)

const packetService = fs.readFileSync('src/core/documents/packetService.js', 'utf8')
const timeout = packetService.indexOf("if (failureCode === 'GENERATION_TIMEOUT')")
const fenceFailure = packetService.indexOf("if (failureCode === 'GENERATION_LEASE_FENCE_REJECTED')", timeout)
const preflightFailure = packetService.indexOf("if (failureCode === 'GENERATION_PREFLIGHT_BLOCKED')", fenceFailure)
const failedRenderHandling = packetService.indexOf('// A failed render is never a generated legal document.', preflightFailure)
const failedRenderPersistence = packetService.indexOf('const failedVersion = await recordGenerationFailure', failedRenderHandling)
const timeoutBranch = packetService.slice(timeout, fenceFailure)
assert.match(timeoutBranch, /deferGenerationLeaseRelease = true/)
assert.match(timeoutBranch, /generation_result_ambiguous/)
assert.doesNotMatch(timeoutBranch, /recordGenerationFailure|releaseDocumentPacketGenerationLease/)
assert.ok(
  fenceFailure > timeout &&
    preflightFailure > fenceFailure &&
    failedRenderHandling > preflightFailure &&
    failedRenderPersistence > failedRenderHandling,
  'renderer fence rejection must stop generation before failed-render persistence',
)
assert.match(packetService.slice(fenceFailure, preflightFailure), /safeToRetry: false/)
assert.match(packetService.slice(failedRenderHandling), /recordGenerationFailure/)
assert.doesNotMatch(packetService, /previewOnlyGeneration/)
assert.doesNotMatch(packetService, /continuing with a generated preview-only draft/)
assert.match(packetService, /This generation attempt is no longer active\. Refresh the packet before trying again\./)
assert.match(packetService, /!deferGenerationLeaseRelease/)

const api = fs.readFileSync('src/lib/api.js', 'utf8')
const mandateApi = api.slice(api.indexOf('export async function generateMandateDocumentFromTemplate'))
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
