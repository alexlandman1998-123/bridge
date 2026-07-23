import assert from 'node:assert/strict'
import fs from 'node:fs'

const retiredOtpFinaliser = fs.readFileSync('../supabase/functions/generate-final-signed-otp/index.ts', 'utf8')
const canonicalFinaliser = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')
const phase3Migration = fs.readFileSync('../supabase/migrations/202607220006_phase3_visual_signature_evidence.sql', 'utf8')
const readiness = fs.readFileSync('scripts/legal-document-phase3-launch-readiness.mjs', 'utf8')
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))

// The legacy endpoint must stay a deterministic retirement response. Phase 3
// evidence belongs to the exact-source generic finaliser below, never to a
// reconstructed OTP document.
assert.match(retiredOtpFinaliser, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)
assert.match(retiredOtpFinaliser, /REISSUE_CANONICAL_OTP_PDF/)
assert.match(retiredOtpFinaliser, /return response\(503/)
assert.doesNotMatch(retiredOtpFinaliser, /buildPdf|loadSignatureImages|bridge_record_final_artifact_f2|final_signed_otp_generated/,
  'Phase 3 must not re-enable the reconstructed OTP final-PDF path.')

// The generic finaliser starts from D1/D2/D3-certified PDF bytes and carries
// the visual signature evidence in its one canonical F2 event.
for (const marker of [
  'sourcePdfCertified',
  'PDFDocument.load(sourcePdfBytes)',
  'bridge_record_final_artifact_f2',
  'p_event_type: "final_signed_document_generated"',
  'signatureEvidenceContract',
  'phase3-visual-signature-evidence-v1',
  'signatureEvidenceMode',
  'visual_and_audit',
  'embeddedSignatureCount',
  'signatureAssetFingerprints',
  'signatureAssetEvidenceSha256',
  'imageFormat',
  'SIGNATURE_ASSET_EMBED_FAILED',
  'readCommittedFinalArtifact',
  'cleanupUncommittedFinalisation',
  'publishFinalSignedDocument',
  'linkFinalSignedDocumentToVersion',
  'f2FinalArtifactAttempted',
  'crypto.randomUUID()',
  'file_bucket: bucket',
  'FINAL_SIGNED_F2_RECORDING_UNCONFIRMED',
  'FINAL_SIGNED_DOCUMENT_PUBLICATION_PENDING',
  'final_signed_uncommitted_cleanup_deferred',
]) {
  assert.ok(canonicalFinaliser.includes(marker), `Canonical finaliser must retain Phase 3 marker: ${marker}.`)
}
assert.doesNotMatch(canonicalFinaliser, /generate-final-signed-otp|buildOtpStructuredFinalPdfBytes/,
  'The active finaliser must not fall back to the retired OTP reconstruction endpoint or renderer.')
assert.match(
  canonicalFinaliser,
  /visibility_scope: "internal",\s+is_client_visible: false,[\s\S]*?stage_key: "final_signed_pending",[\s\S]*?bridge_record_final_artifact_f2/,
  'The supporting Documents row must remain internal until the F2 record call starts.',
)
assert.match(
  canonicalFinaliser,
  /bridge_record_final_artifact_f2[\s\S]*?f2FinalArtifactRecorded = true;[\s\S]*?publishFinalSignedDocument/,
  'Only a successfully recorded F2 artifact may publish the supporting Documents row.',
)
assert.match(
  canonicalFinaliser,
  /updateVersionResult\.error[\s\S]*?readCommittedFinalArtifact[\s\S]*?final_signed_uncommitted_cleanup_deferred/,
  'An ambiguous F2 failure must preserve the private artifact for retry/reconciliation.',
)

// F2 independently rejects a completion record without a canonical generic
// event and a one-to-one visual asset fingerprint for every required signing
// field. Application code cannot bypass this service-only database boundary.
for (const marker of [
  'create or replace function public.bridge_record_final_artifact_f2',
  "auth.role() <> 'service_role'",
  "'final_signed_document_generated'",
  'PHASE3_FINAL_EVENT_TYPE_REQUIRED',
  'phase3-visual-signature-evidence-v1',
  'PHASE3_VISUAL_SIGNATURE_EVIDENCE_REQUIRED',
  'PHASE3_VISUAL_SIGNATURE_EVIDENCE_INCOMPLETE',
  'signatureAssetFingerprints',
  'signatureAssetEvidenceSha256',
  'imageFormat',
  'embeddedSignatureCount',
  'lower(trim(coalesce(field.field_type',
  'signature_evidence_contract',
  'signature_evidence_mode',
  'embedded_signature_count',
  'signature_asset_evidence_sha256',
  'signature_asset_fingerprints_json',
  'bridge_enforce_phase3_final_event_evidence',
  'PHASE3_FINAL_EVENT_EVIDENCE_MISMATCH',
  'PHASE3_FINAL_EVENT_IMMUTABLE',
  'PHASE3_LEGACY_OTP_FINAL_EVENT_RETIRED',
  "generatedFileBucket', '') <> v_evidence.bucket",
  "generatedFilePath', '') <> v_evidence.path",
]) {
  assert.ok(phase3Migration.includes(marker), `Phase 3 F2 migration must retain ${marker}.`)
}
assert.match(
  phase3Migration,
  /revoke all on function public\.bridge_record_final_artifact_f2\([\s\S]*?\) from public, anon, authenticated;/,
)
assert.match(
  phase3Migration,
  /grant execute on function public\.bridge_record_final_artifact_f2\([\s\S]*?\) to service_role;/,
)
assert.match(phase3Migration, /new\.event_type = 'final_signed_otp_generated'[\s\S]*?PHASE3_LEGACY_OTP_FINAL_EVENT_RETIRED/,
  'The migration must reject obsolete OTP-specific finalisation events.')

// The staging gate is read-only and accepts only the exact current completed
// OTP version, its generic F2 event, matching immutable F2 evidence, and a
// byte-for-byte readable PDF. Legal approval values remain external input.
for (const marker of [
  'OTP_TEMPLATE_LEGAL_APPROVAL_PENDING',
  'SALES_MANDATE_TEMPLATE_LEGAL_APPROVAL_PENDING',
  'OTP_CANONICAL_TEMPLATE_REQUIRED',
  'OTP_CURRENT_FINAL_VERSION_MISSING',
  'OTP_CANONICAL_SOURCE_CERTIFICATION_MISSING',
  'OTP_FINAL_ARTIFACT_EVIDENCE_MISSING',
  'OTP_FINAL_ARTIFACT_EVIDENCE_MISMATCH',
  'OTP_FINAL_ARTIFACT_PHASE3_EVIDENCE_MISMATCH',
  'OTP_VISUAL_SIGNATURE_EVIDENCE_MISSING',
  'PHASE3_SCHEMA_NOT_DEPLOYED',
  'CONTROLLED_PARTIAL_PACKET_REMAINS',
  'final_signed_document_generated',
  "eq('version_number', currentVersionNumber)",
  'legal_final_artifact_evidence',
  'signatureEvidenceContract',
  'signatureAssetFingerprints',
  'signatureAssetEvidenceSha256',
  'canonicalSignatureAssetFingerprints',
  'signatureAssetEvidenceMatches',
  'signature_evidence_contract',
  'signature_evidence_mode',
  'embedded_signature_count',
  'signature_asset_evidence_sha256',
  'signature_asset_fingerprints_json',
  'durablePhase3EvidenceMatchesEvent',
  'MAX_SIGNATURE_ASSET_BYTES',
  'render_input_verified',
  'native_pdf_verified',
  'transaction_pdf_persisted',
  "webcrypto.subtle.digest('SHA-256'",
  "pdfHeader === '%PDF-'",
  "pdfTail.includes('%%EOF')",
  'isdowlnollckzvltkasn',
]) {
  assert.ok(readiness.includes(marker), `Phase 3 launch gate must retain ${marker}.`)
}
assert.doesNotMatch(readiness, /final_signed_otp_generated/,
  'The launch gate must not treat an obsolete OTP-specific event as canonical evidence.')
assert.match(
  readiness,
  /JSON\.stringify\(canonicalPersistedFingerprints\) === JSON\.stringify\(canonicalFingerprints\)/,
  'The launch gate must require the persisted F2 fingerprints to equal the event evidence.',
)
assert.match(
  readiness,
  /persistedEmbeddedSignatureCount === Number\(payload\.embeddedSignatureCount\)/,
  'The launch gate must require the persisted F2 embedded-signature count to equal the event evidence.',
)
assert.match(
  readiness,
  /normalize\(finalArtifactEvidence\.signature_evidence_contract\) === normalize\(payload\.signatureEvidenceContract\)/,
  'The launch gate must require the persisted F2 evidence contract to equal the event evidence.',
)
assert.match(
  readiness,
  /normalize\(finalArtifactEvidence\.signature_evidence_mode\) === normalize\(payload\.signatureEvidenceMode\)/,
  'The launch gate must require the persisted F2 evidence mode to equal the event evidence.',
)
assert.match(
  readiness,
  /normalizedSha256\(finalArtifactEvidence\.signature_asset_evidence_sha256\) === normalizedSha256\(payload\.signatureAssetEvidenceSha256\)/,
  'The launch gate must require the persisted F2 evidence digest to equal the event evidence.',
)
for (const forbidden of ['.insert(', '.update(', '.upsert(', '.delete(']) {
  assert.equal(readiness.includes(forbidden), false, `Phase 3 readiness gate must remain read-only (${forbidden}).`)
}

assert.equal(packageJson.scripts['test:otp-phase3-launch-hardening'], 'node scripts/otp-phase3-launch-hardening.test.mjs')
assert.equal(packageJson.scripts['verify:legal-documents:phase3-launch-readiness'], 'node scripts/legal-document-phase3-launch-readiness.mjs')

console.log('OTP Phase 3 launch-hardening contract passed')
