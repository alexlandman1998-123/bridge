import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readSource = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

function section(source, startMarker, endMarker, label) {
  const start = source.indexOf(startMarker)
  assert.notEqual(start, -1, `${label} must contain ${startMarker}`)
  const end = source.indexOf(endMarker, start)
  assert.notEqual(end, -1, `${label} must end before ${endMarker}`)
  return source.slice(start, end)
}

function assertContainsAll(source, markers, label) {
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${label} must contain ${marker}`)
  }
}

const packageJson = JSON.parse(readSource('../package.json'))
const legacyOtpRenderer = readSource('../../supabase/functions/generate-otp/index.ts')
const canonicalRenderer = readSource('../../supabase/functions/generate-mandate/index.ts')
const packetService = readSource('../src/core/documents/packetService.js')
const phase2Migration = readSource('../../supabase/migrations/202607220004_canonical_otp_signing_phase2.sql')
const atomicRecoveryMigration = readSource('../../supabase/migrations/202607220005_canonical_otp_seal_atomic_recovery.sql')
const sender = readSource('../../supabase/functions/send-mandate-signing-email/index.ts')
const signerAction = readSource('../../supabase/functions/signer-signing-action/index.ts')
const genericFinaliser = readSource('../../supabase/functions/generate-final-signed-document/index.ts')
const retiredOtpFinaliser = readSource('../../supabase/functions/generate-final-signed-otp/index.ts')
const workspacePage = readSource('../src/pages/LegalDocumentWorkspacePage.jsx')
const workspace = readSource('../src/components/documents/LegalDocumentWorkspace.jsx')
const signingDispatchAssurance = readSource('../src/core/documents/signingDispatchAssurance.js')
const packetApi = readSource('../src/lib/documentPacketsApi.js')
const settingsSigningTemplates = readSource('../src/pages/settings/SettingsSigningTemplatesPage.jsx')

assert.equal(
  packageJson.scripts?.['test:otp-phase2-staging-acceptance'],
  'node scripts/otp-phase2-staging-acceptance.test.mjs',
  'The focused Phase 2 acceptance contract must remain runnable through its package script.',
)

// The old endpoint must stay a hard retirement: it used to make an unbound
// DOCX, so no caller can use it as an alternate route into signing.
assert.match(legacyOtpRenderer, /return jsonResponse\(410,\s*\{[\s\S]*OTP_LEGACY_RENDERER_RETIRED/)
assert.match(legacyOtpRenderer, /CREATE_OR_REISSUE_CANONICAL_OTP_PDF/)
assert.doesNotMatch(legacyOtpRenderer, /\b(createClient|renderDocx|docxtemplater|PizZip)\b/i)

// Packet generation must not silently fall back to the retired endpoint.  For
// OTP, the browser accepts only a server-returned, sealed version and never
// creates or certifies a second local version after the native render.
assert.doesNotMatch(packetService, /\bgenerateOtpDocumentFromTemplate\b/)
assert.doesNotMatch(packetService, /['"`]generate-otp['"`]/)
assertContainsAll(packetService, [
  'canonicalOtpGeneration',
  'OTP_CANONICAL_PDF_SEAL_FAILED',
  'render_input_verified',
  'native_pdf_verified',
  'transaction_pdf_persisted',
], 'packetService canonical OTP generation')
assert.match(packetService, /canonicalOtpGeneration\?\.sealed\s*!==\s*true/)
assert.match(packetService, /return\s*\{\s*packet:\s*canonicalPacket,[\s\S]{0,800}canonicalOtp:\s*canonicalOtpGeneration/)
assertContainsAll(packetService, [
  'OTP_APPLIED_SIGNING_LAYOUT_REQUIRED',
  "if (normalizedPacketType !== 'otp')",
], 'OTP visual-signing-layout gate')

// A failed or ambiguous server seal must not use the browser's generic
// failure-version path. That path advances the packet current-version pointer
// and can strand the canonical candidate (or a response that already sealed).
const otpSealRecoveryClassifier = section(
  packetService,
  'function resolveOtpCanonicalSealRecovery',
  'function buildOtpCanonicalSealRecoverySignal',
  'OTP canonical-seal recovery classifier',
)
assertContainsAll(otpSealRecoveryClassifier, [
  "codes.includes('GENERATION_TIMEOUT')",
  'isRetryablePacketError(error)',
  "'reconcile_canonical_otp_pdf'",
  "'retry_canonical_otp_pdf'",
], 'OTP canonical-seal recovery classifier')
assertContainsAll(packetService, [
  'OTP_CANONICAL_PDF_SEAL_FAILED',
  'OTP_CANONICAL_PDF_RECONCILIATION_REQUIRED',
  'OTP_CANONICAL_PDF_RESULT_AMBIGUOUS',
  'EDGE_INVOCATION_FAILED',
], 'OTP canonical-seal recovery codes')

const otpSealRecoveryBranch = section(
  packetService,
  'const otpCanonicalSealRecovery = resolveOtpCanonicalSealRecovery',
  "if (failureCode === 'GENERATION_TIMEOUT')",
  'OTP canonical-seal recovery branch',
)
assertContainsAll(otpSealRecoveryBranch, [
  'deferGenerationLeaseRelease = true',
  "eventType: 'otp_canonical_seal_recovery_required'",
  'buildOtpCanonicalSealRecoverySignal',
  'preserveCurrentVersion: true',
  'canonicalOtpSealRecovery: canonicalSealRecovery',
], 'OTP canonical-seal recovery branch')
assert.doesNotMatch(
  otpSealRecoveryBranch,
  /recordGenerationFailure|releaseDocumentPacketGenerationLease|createDocumentPacketVersion/,
  'OTP seal recovery must not create or advance a browser-owned failure version.',
)
const genericFailurePersistIndex = packetService.indexOf(
  'const failedVersion = await recordGenerationFailure',
  packetService.indexOf("if (failureCode === 'GENERATION_TIMEOUT')"),
)
assert.ok(
  genericFailurePersistIndex > packetService.indexOf('const otpCanonicalSealRecovery = resolveOtpCanonicalSealRecovery'),
  'generic failure persistence must remain after the OTP recovery escape hatch.',
)

// The actual renderer—not the browser—owns C4 and D1/D2/D3 sealing.
assertContainsAll(canonicalRenderer, [
  'createAndSealCanonicalOtpVersion',
  'bridge_create_and_seal_canonical_otp_pdf_phase2',
  'canonicalOtpPdf: true',
  'phase2-canonical-otp-pdf-v1',
], 'canonical OTP renderer')
assert.match(canonicalRenderer, /sealResult\.data\?\.sealed\s*!==\s*true/)
assert.match(canonicalRenderer, /canonicalOtp:\s*canonicalOtp\s*\?\s*\{[\s\S]{0,300}sealed\s*:\s*true/)

// I1 creation and the D1/D2/D3/C4 seal are one service-only database RPC. A
// renderer retry must never strand an unsealed generated version or try to
// compensate by completing C4 as failed from application code.
const atomicSealSection = section(
  atomicRecoveryMigration,
  'create or replace function public.bridge_create_and_seal_canonical_otp_pdf_phase2',
  'revoke all on function public.bridge_create_and_seal_canonical_otp_pdf_phase2',
  'Phase 2 atomic OTP create-and-seal RPC',
)
assertContainsAll(atomicSealSection, [
  "if auth.role() <> 'service_role' then",
  'PHASE2_OTP_CANONICAL_RENDER_SERVICE_ONLY',
  'bridge_create_document_packet_version_i1',
  "p_render_status => 'generated'",
  'bridge_seal_canonical_otp_pdf_phase2',
  "'sealed', true",
], 'Phase 2 atomic OTP create-and-seal RPC')
assert.ok(
  atomicSealSection.indexOf('bridge_create_document_packet_version_i1') < atomicSealSection.indexOf('bridge_seal_canonical_otp_pdf_phase2'),
  'The atomic RPC must create the generated version before sealing it in the same transaction.',
)
assert.match(
  atomicRecoveryMigration,
  /revoke all on function public\.bridge_create_and_seal_canonical_otp_pdf_phase2\([\s\S]*?\) from public, anon, authenticated;/,
)
assert.match(
  atomicRecoveryMigration,
  /grant execute on function public\.bridge_create_and_seal_canonical_otp_pdf_phase2\([\s\S]*?\) to service_role;/,
)

const rendererAtomicSealSection = section(
  canonicalRenderer,
  'async function createAndSealCanonicalOtpVersion',
  'Deno.serve(async (req: Request) =>',
  'canonical renderer atomic OTP path',
)
assert.match(rendererAtomicSealSection, /supabase\.rpc\("bridge_create_and_seal_canonical_otp_pdf_phase2"/)
assert.doesNotMatch(rendererAtomicSealSection, /bridge_create_document_packet_version_i1/)
assert.doesNotMatch(rendererAtomicSealSection, /"bridge_seal_canonical_otp_pdf_phase2"/)
assert.doesNotMatch(rendererAtomicSealSection, /bridge_complete_editable_render_freeze_c4|p_success\s*:\s*false/)

const sealSection = section(
  phase2Migration,
  'create or replace function public.bridge_seal_canonical_otp_pdf_phase2',
  '-- The original E4 key',
  'Phase 2 canonical seal',
)
assertContainsAll(sealSection, [
  "if auth.role() <> 'service_role' then",
  'bridge_verify_frozen_render_output_d1',
  'bridge_verify_native_pdf_render_d2',
  'bridge_persist_transaction_pdf_d3',
  'bridge_complete_editable_render_freeze_c4',
  "'sealed', true",
], 'Phase 2 canonical seal')
assert.match(
  phase2Migration,
  /revoke all on function public\.bridge_seal_canonical_otp_pdf_phase2\([^)]*\) from public, anon, authenticated;/,
)
assert.match(
  phase2Migration,
  /grant execute on function public\.bridge_seal_canonical_otp_pdf_phase2\([^)]*\) to service_role;/,
)

const e4Section = section(
  phase2Migration,
  'create or replace function public.bridge_authorize_applied_envelope_dispatch_e4',
  '-- Provider-confirmed OTP delivery',
  'Phase 2 OTP E4 dispatch',
)
assertContainsAll(e4Section, [
  'p_target_signer_role text default null',
  "if v_packet_type = 'otp' and v_target is null then",
  'PHASE2_OTP_E4_TARGET_SIGNER_REQUIRED',
  'PHASE2_OTP_E4_TARGET_SIGNATURE_REQUIRED',
  'target_signer_role',
  "':initial:' || v_target",
], 'Phase 2 OTP E4 dispatch')

const deliverySection = section(
  phase2Migration,
  'create or replace function public.bridge_record_otp_signing_delivery_phase2',
  '-- F2 is shared by mandate and OTP',
  'Phase 2 OTP delivery',
)
assertContainsAll(deliverySection, [
  "if auth.role() <> 'service_role' then",
  'p_dispatch_id',
  'render_input_verified',
  'native_pdf_verified',
  'transaction_pdf_persisted',
  'target_signer_role',
  'PHASE2_E4_DISPATCH_BINDING_INVALID',
  'phase2-otp-signing-delivery-v1',
  'otpStatus',
], 'Phase 2 OTP delivery')
assert.match(
  phase2Migration,
  /revoke all on function public\.bridge_record_otp_signing_delivery_phase2\([^)]*\) from public, anon, authenticated;/,
)
assert.match(
  phase2Migration,
  /grant execute on function public\.bridge_record_otp_signing_delivery_phase2\([^)]*\) to service_role;/,
)

// F2 must not stamp an OTP with a mandate-only status while finalising the
// shared, certified-PDF flow.
const f2Section = section(
  phase2Migration,
  'create or replace function public.bridge_record_final_artifact_f2',
  'commit;',
  'Phase 2 F2 status finalisation',
)
assertContainsAll(f2Section, [
  "if auth.role() <> 'service_role' then",
  "lower(coalesce(v_packet.packet_type, '')) = 'otp'",
  "v_context := v_context - 'mandateStatus'",
  "'otpStatus', 'completed'",
], 'Phase 2 F2 status finalisation')

// The controlled sender explicitly accepts OTP signing, requires the current
// packet version plus a role-targeted E4 dispatch, and records provider proof
// through the service-only Phase 2 RPC.
assert.match(sender, /\["seller_mandate_sent", "seller_mandate", "otp_signing"\]/)
assert.match(sender, /const isOtpSigning = type === "otp_signing"/)
assert.match(sender, /if \(isOtpSigning && \(!requestedPacketVersionId \|\| !dispatchId\)\)/)
assert.match(sender, /const expectedPacketType = isOtpSigning \? "otp" : "mandate"/)
assert.match(sender, /OTP_EMAIL_PACKET_NOT_DELIVERABLE/)
assert.match(sender, /const deliveryRpc = isOtpSigning\s*\?\s*"bridge_record_otp_signing_delivery_phase2"/)
assert.match(sender, /supabase\.rpc\(deliveryRpc,/)
assert.doesNotMatch(sender, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)

// Signers may proceed for OTP only after the exact certified PDF exists; they
// must use the generic finaliser rather than the retired OTP reconstruction.
assertContainsAll(signerAction, [
  'canonicalOtpPdfReady',
  'render_input_verified',
  'native_pdf_verified',
  'transaction_pdf_persisted',
  'OTP_CANONICAL_PDF_REQUIRED',
  'const finaliserFunction = "generate-final-signed-document"',
  'otpStatus',
], 'signer action canonical OTP guard')
assert.doesNotMatch(signerAction, /OTP_FINALISATION_DISABLED(?:_UNSAFE_RECONSTRUCTION)?/)
assert.doesNotMatch(signerAction, /generate-final-signed-otp/)
const otpGateIndex = signerAction.indexOf('const canonicalOtpPdfReady')
const firstAssetMutationIndex = signerAction.indexOf('if (action === "upsert_asset")')
assert.ok(otpGateIndex >= 0 && firstAssetMutationIndex > otpGateIndex, 'OTP canonical-PDF guard must run before signer asset mutation.')

// The generic finaliser starts from the exact D1/D2/D3-certified PDF, checks
// its database/document/storage linkage, then records F2.  It must never
// rebuild OTP bytes from a DOCX or from structured data.
assertContainsAll(genericFinaliser, [
  'sourcePdfCertified',
  'render_input_verified',
  'native_pdf_verified',
  'transaction_pdf_persisted',
  'FINAL_SOURCE_PDF_REQUIRED',
  'FINAL_SOURCE_PDF_LINK_INVALID',
  'FINAL_SOURCE_PDF_UNREADABLE',
  'FINAL_SOURCE_PDF_INTEGRITY_MISMATCH',
  'bridge_record_final_artifact_f2',
  'PDFDocument.load(sourcePdfBytes)',
], 'generic finaliser certified-PDF gate')
assert.ok(genericFinaliser.includes('supabase.storage.from(renderedFileBucket).download(renderedFilePath)'))
assert.doesNotMatch(genericFinaliser, /OTP_FINALISATION_DISABLED(?:_UNSAFE_RECONSTRUCTION)?/)
assert.doesNotMatch(genericFinaliser, /buildOtpStructuredFinalPdfBytes/)
assert.doesNotMatch(genericFinaliser, /sourcePdfBytes\s*=\s*await\s+convertDocxToPdfBytes\(/)
assert.doesNotMatch(genericFinaliser, /sourcePdfBytes\s*=\s*await\s+buildFallbackMandatePdfBytes\(/)
assert.doesNotMatch(genericFinaliser, /sourcePdfBytes\s*=\s*lower\(packet\.packet_type\)/)

// The retired compatibility endpoint stays unavailable; the active signer
// path above cannot call it.
assert.match(retiredOtpFinaliser, /return response\(503,/)
assert.match(retiredOtpFinaliser, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)
assert.doesNotMatch(retiredOtpFinaliser, /bridge_record_final_artifact_f2|buildPdf|loadSignatureImages/)

// The workspace must expose the server certificate as the delivery readiness
// condition and must only accept an attested Phase 2 delivery response.
assertContainsAll(workspacePage, [
  'getCanonicalOtpSigningReadiness',
  'render_input_verified',
  'native_pdf_verified',
  'transaction_pdf_persisted',
  "renderedMediaType === 'application/pdf'",
  'OTP_SIGNING_PDF_NOT_CERTIFIED',
  "type: 'otp_signing'",
  "packetType: 'otp'",
  'phase2-otp-signing-delivery-v1',
], 'OTP workspace readiness')
assert.match(workspacePage, /const signingDeliveryEnabled = packetType !== 'otp' \|\| otpSigningReadiness\.ready/)
assert.match(workspacePage, /invokeEdgeFunction\('send-mandate-signing-email',\s*\{[\s\S]{0,800}type: 'otp_signing'/)
assert.doesNotMatch(workspacePage, /['"`]generate-otp['"`]/)

// An initial OTP invite is staged one signer at a time.  Targeted dispatch
// validation must not demand tokens for other still-unsent signers, and a
// browser must not regress a delivered signer while refreshing its token.
assertContainsAll(signingDispatchAssurance, [
  'targetSignerRole = \'\'',
  'E4_TARGET_SIGNER_NOT_ACTIVE',
  'targetSignerRole: normalizedTargetSignerRole || null',
], 'targeted dispatch assurance')
assertContainsAll(packetApi, [
  'const activeDeliveryStatus = [\'sent\', \'viewed\'].includes(signerStatus)',
  'targetSignerRole: normalizedTargetSignerRole',
], 'signer-token delivery-state preservation')
assertContainsAll(workspace, [
  'hasConfirmedOtpSigningDelivery',
  'OTP_REMINDER_DISPATCH_REQUIRED',
  'OTP_RESEND_TARGET_REQUIRED',
  'OTP_SIGNING_DISPATCH_NOT_UNIQUE',
  'otpSignerSpecificDispatches: true',
  'targetSignerRole: stagedDispatch.signerRole',
], 'workspace signer-specific OTP delivery')

// A failed atomic OTP seal leaves C4 frozen. Retrying from the workspace must
// reuse that exact immutable revision rather than freezing a second revision
// or attempting browser-owned C4 compensation.
assertContainsAll(workspace, [
  'existingFrozenOtpRevision',
  "normalizeKey(renderSourceVersion?.render_freeze_status) === 'frozen'",
  'normalizeText(renderSourceVersion?.render_freeze_id)',
  'normalizeText(renderSourceVersion?.render_content_fingerprint)',
  'Retrying the frozen canonical OTP revision…',
], 'workspace frozen OTP retry')
const frozenOtpRetrySection = section(
  workspace,
  'if (existingFrozenOtpRevision) {',
  '} else {',
  'workspace frozen OTP retry branch',
)
assertContainsAll(frozenOtpRetrySection, [
  "contract: 'c4-v1'",
  'freezeId: normalizeText(renderSourceVersion.render_freeze_id)',
  'sourceVersionId: normalizeText(renderSourceVersion.id)',
  'contentFingerprint: normalizeText(renderSourceVersion.render_content_fingerprint)',
], 'workspace frozen OTP retry branch')
assert.doesNotMatch(frozenOtpRetrySection, /freezeEditableDocumentRevisionForRender|completeEditableDocumentRenderFreeze/)
assert.match(
  workspace,
  /if \(!isOtpPacket && renderFreeze\?\.freezeId\) \{\s*await completeEditableDocumentRenderFreeze\([\s\S]{0,500}success:\s*false/,
)

// A generic template-library action cannot mint an untargeted OTP dispatch.
assertContainsAll(settingsSigningTemplates, [
  'selectedLibraryPacketIsOtp',
  'This template library does not send OTP invitations.',
  'Use Legal Workspace for OTP',
], 'template-library OTP send guard')

console.log('OTP Phase 2 canonical PDF source-contract tests passed.')
