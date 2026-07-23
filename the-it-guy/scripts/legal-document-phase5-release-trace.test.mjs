import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(SCRIPT_DIR, '..')
const REPO_ROOT = path.resolve(APP_ROOT, '..')

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')
}

const migration = read('supabase/migrations/202607230004_phase5_pilot_release_trace_integrity.sql')
const helper = read('supabase/functions/_shared/legalDocumentPilotLifecycleTrace.ts')
const generator = read('supabase/functions/generate-mandate/index.ts')
const signingDelivery = read('supabase/functions/send-mandate-signing-email/index.ts')
const signerAction = read('supabase/functions/signer-signing-action/index.ts')
const finalDispatch = read('supabase/functions/dispatch-final-signed-document/index.ts')
const finaliser = read('supabase/functions/generate-final-signed-document/index.ts')
const finalResolver = read('supabase/functions/resolve-final-signed-document-access/index.ts')
const phase1Artifacts = fs.readFileSync(path.join(APP_ROOT, 'scripts/legal-document-rollout-phase1-artifacts.mjs'), 'utf8')
const phase1Runner = read('scripts/supabase-phase6-staging-execution.mjs')

for (const required of [
  'legal_document_pilot_release_bindings_phase5',
  'legal_document_pilot_lifecycle_traces_phase5',
  'bridge_bind_legal_document_pilot_release_phase5',
  'bridge_assert_legal_document_pilot_release_binding_phase5',
  'bridge_record_legal_document_pilot_lifecycle_trace_phase5',
  'legal-document-pilot-release-v1',
  'legal-document-pilot-lifecycle-trace-v1',
  'PHASE5_RELEASE_TRACE_BINDING_REQUIRED',
  'PHASE5_RELEASE_TRACE_ARTIFACT_MISMATCH',
  'final_access_authorized',
]) assert.match(migration, new RegExp(required))

assert.match(migration, /enable row level security/)
assert.match(migration, /append-only/i)
assert.match(migration, /v_version\.rendered_sha256[\s\S]*v_binding\.generated_artifact_sha256/, 'Every later lifecycle checkpoint must bind the certified version hash to the renderer-bound release hash.')
assert.match(migration, /revoke all on table public\.legal_document_pilot_release_bindings_phase5 from public, anon, authenticated, service_role/)
assert.match(migration, /grant execute on function public\.bridge_bind_legal_document_pilot_release_phase5[\s\S]*to service_role/)
assert.doesNotMatch(migration, /grant execute on function public\.bridge_(?:bind|assert|record)_legal_document_pilot.* to authenticated/)

for (const required of [
  'bindLegalDocumentPilotReleaseTrace',
  'assertLegalDocumentPilotLifecycleBinding',
  'recordLegalDocumentPilotLifecycleTrace',
  'bridge_bind_legal_document_pilot_release_phase5',
  'bridge_assert_legal_document_pilot_release_binding_phase5',
  'bridge_record_legal_document_pilot_lifecycle_trace_phase5',
]) assert.match(helper, new RegExp(required))
assert.doesNotMatch(helper, /Deno\.env|get\("LEGAL_DOCUMENT_PILOT_PLAN_DIGEST"/)
assert.match(helper, /PHASE5_RELEASE_TRACE_ACTIVE_RELEASE_MISMATCH/, 'The lifecycle helper must reject a stale binding from a different active release plan.')
assert.match(helper, /bindingPlanDigest !== activePlanDigest/, 'The lifecycle helper must exact-match the immutable binding digest to the active server release digest.')
assert.match(helper, /activeRelease\?\.contract !== LEGAL_DOCUMENT_PILOT_RELEASE_CONTRACT/, 'The lifecycle helper must require the active production release contract.')

assert.match(generator, /bindLegalDocumentPilotReleaseTrace/)
assert.match(generator, /pilotReleaseDecision\?\.planDigest/)
assert.match(generator, /generatedArtifactSha256: `sha256:\$\{outputSha256\}`/)
assert.match(signingDelivery, /assertLegalDocumentPilotLifecycleBinding/)
assert.match(signingDelivery, /const activeRelease = assertLegalDocumentPilotRelease\([\s\S]*?activeRelease,/, 'New signing delivery must give the lifecycle assertion the current server release decision.')
assert.match(signingDelivery, /stage: "signing_invite_delivered"/)
assert.match(signerAction, /assertLegalDocumentPilotLifecycleBinding/)
assert.match(signerAction, /activeRelease: pilotRelease/, 'Optional next-signer delivery must bind to the same active release decision it assessed.')
assert.match(signerAction, /stage: "signing_invite_delivered"/)
assert.match(finalDispatch, /assertLegalDocumentPilotLifecycleBinding/)
assert.match(finalDispatch, /historicalCompletedArtifact/, 'The final dispatcher must name its narrow read-only historical-artifact exception explicitly.')
assert.match(finalDispatch, /activeRelease,/, 'New final delivery must give the lifecycle assertion the current server release decision.')
assert.match(finalDispatch, /stage: "final_delivery_completed"/)
assert.match(finalDispatch, /downloadLink: `\$\{resolveAppBaseUrl\(\)\}\/sign\/\$\{encodeURIComponent\(signerToken\)\}`/)
assert.doesNotMatch(finalDispatch, /createSignedUrl\(/)
assert.match(finalResolver, /recordLegalDocumentPilotLifecycleTrace/)
assert.match(finalResolver, /action === "download"/)
assert.match(finalResolver, /stage: "final_access_authorized"/)
assert.match(finalResolver, /lifecycle trace unavailable/)

const finalDispatchHistoricalIndex = finalDispatch.indexOf('const historicalCompletedArtifact')
const finalDispatchGuardIndex = finalDispatch.indexOf('const activeRelease = assertLegalDocumentPilotRelease')
const finalDispatchF3Index = finalDispatch.indexOf('const transactionPublication = await supabase.rpc("bridge_publish_final_artifact_to_transaction_f3"')
const finalDispatchF4Index = finalDispatch.indexOf('const surfaceCompletion = await supabase.rpc("bridge_complete_final_document_surfaces_f4"')
const finalDispatchPublicationIndex = finalDispatch.indexOf('const publication = await supabase.rpc("bridge_record_final_publication_f3"')
assert.ok(
  finalDispatchHistoricalIndex >= 0 &&
    finalDispatchGuardIndex > finalDispatchHistoricalIndex &&
    finalDispatchF3Index > finalDispatchGuardIndex &&
    finalDispatchF4Index > finalDispatchF3Index &&
    finalDispatchPublicationIndex > finalDispatchF4Index,
  'The dispatcher may return only an explicitly completed historical artifact before the release guard; every F3/F4/customer-visible write must follow it.',
)

assert.match(finaliser, /assertLegalDocumentPilotRelease/)
assert.match(finaliser, /assertLegalDocumentPilotLifecycleBinding/)
assert.match(finaliser, /Historical completed[\s\S]*signer-bound resolver/i, 'The finaliser must preserve historical documents only through the read-only resolver route.')
const finaliserGuardIndex = finaliser.indexOf('const activeRelease = assertLegalDocumentPilotRelease')
const finaliserF2Index = finaliser.indexOf('const updateVersionResult = await supabase.rpc("bridge_record_final_artifact_f2"')
const finaliserListingIndex = finaliser.indexOf('const listingConversion = await ensureListingFromSignedMandate')
assert.ok(
  finaliserGuardIndex >= 0 && finaliserF2Index > finaliserGuardIndex && finaliserListingIndex > finaliserGuardIndex,
  'The finaliser must assert current release/binding identity before F2, customer publication, or listing conversion.',
)

assert.match(phase1Artifacts, /202607230004_phase5_pilot_release_trace_integrity\.sql/)
assert.match(phase1Runner, /202607230004/)

console.log('Phase 5 immutable pilot release-trace contract passed.')
