import assert from 'node:assert/strict'
import fs from 'node:fs'

const signerAction = fs.readFileSync('../supabase/functions/signer-signing-action/index.ts', 'utf8')
const otpFinaliser = fs.readFileSync('../supabase/functions/generate-final-signed-otp/index.ts', 'utf8')
const finaliser = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')
const mandateEmail = fs.readFileSync('../supabase/functions/send-mandate-signing-email/index.ts', 'utf8')
const genericEmail = fs.readFileSync('../supabase/functions/send-email/index.ts', 'utf8')
const deliveryMigration = fs.readFileSync('../supabase/migrations/202607220002_authoritative_mandate_signing_delivery_phase0.sql', 'utf8')
const supabaseConfig = fs.readFileSync('../supabase/config.toml', 'utf8')

assert.match(signerAction, /const FINALISER_SERVICE_ROLE_KEY = SUPABASE_SERVICE_ROLE_KEY/)
assert.match(signerAction, /"apikey": FINALISER_SERVICE_ROLE_KEY/)
assert.match(signerAction, /"Authorization": `Bearer \$\{FINALISER_SERVICE_ROLE_KEY\}`/)
assert.doesNotMatch(signerAction, /SUPABASE_FUNCTION_AUTH_KEY|SUPABASE_ANON_KEY|VITE_SUPABASE_ANON_KEY|FUNCTION_AUTH_KEY/)
assert.doesNotMatch(signerAction, /generate-final-signed-otp/)
assert.match(signerAction, /const retryFinaliser = "generate-final-signed-document"/)
assert.match(signerAction, /const finaliserFunction = "generate-final-signed-document"/)
assert.doesNotMatch(signerAction, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION|otp_finalisation_blocked_unsafe_reconstruction/)
assert.match(signerAction, /OTP_CANONICAL_PDF_REQUIRED/)
assert.match(signerAction, /REISSUE_CANONICAL_OTP_PDF/)
assert.match(signerAction, /bridge_record_mandate_signing_delivery_phase0/)
assert.match(signerAction, /status: "ready_to_send"/)

assert.match(otpFinaliser, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)
assert.match(otpFinaliser, /REISSUE_CANONICAL_OTP_PDF/)
assert.match(otpFinaliser, /return response\(503/)
assert.doesNotMatch(otpFinaliser, /buildPdf|loadSignatureImages|bridge_record_final_artifact_f2|dispatchFinalDelivery|final_signed_otp_generated/)

assert.doesNotMatch(finaliser, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)
assert.doesNotMatch(finaliser, /generate-final-signed-otp/)
for (const marker of [
  'FINAL_SOURCE_PDF_REQUIRED',
  'FINAL_SOURCE_PDF_LINK_INVALID',
  'FINAL_SOURCE_PDF_INTEGRITY_MISMATCH',
  'FINAL_SOURCE_PDF_UNREADABLE',
  'FINAL_SOURCE_PDF_INVALID',
  'rendered_file_bucket',
]) {
  assert.match(finaliser, new RegExp(marker))
}
assert.ok(finaliser.includes('supabase.storage.from(renderedFileBucket).download(renderedFilePath)'))
assert.match(finaliser, /sourcePdfCertified/)
assert.doesNotMatch(finaliser, /await convertDocxToPdfBytes\(|sourcePdfBytes = await buildFallbackMandatePdfBytes|sourcePdfBytes = lower\(packet\.packet_type\)/)

for (const marker of [
  'resolveInvocationAuthority',
  'canManagePacket',
  'extractSigningToken',
  'versionHasCertifiedPdf',
  'document_packet_signers',
  'rendered_file_path',
  'ready_to_send',
  'bridge_record_mandate_signing_delivery_phase0',
  'MANDATE_EMAIL_DELIVERY_RECORD_FAILED',
  'MANDATE_EMAIL_CERTIFIED_PDF_INTEGRITY_MISMATCH',
  'sha256Hex',
  'document_signing_dispatches',
  'MANDATE_EMAIL_AUTH_REQUIRED',
  'MANDATE_EMAIL_PACKET_FORBIDDEN',
  'MANDATE_EMAIL_SIGNER_BINDING_INVALID',
  '"signing_prep", "signing_prepared", "ready_to_send", "sent", "partially_signed"',
]) {
  assert.match(mandateEmail, new RegExp(marker))
}
assert.match(mandateEmail, /portalLink: `\$\{resolveAppBaseUrl\(\)\}\/sign\/\$\{signingToken\}`/)
assert.match(genericEmail, /MANDATE_SIGNING_DELIVERY_ROUTE_RETIRED/)
assert.match(supabaseConfig, /\[functions\.send-mandate-signing-email\][\s\S]*?verify_jwt = true/)

for (const marker of [
  'bridge_record_mandate_signing_delivery_phase0',
  "auth.role() <> 'service_role'",
  'for update',
  "status = case when v_signer.status = 'viewed' then 'viewed' else 'sent' end",
  'seller_signing_email_sent',
  'transaction_pdf_persisted',
  'native_pdf_verified',
  'revoke all on function public.bridge_complete_applied_envelope_dispatch_e4',
  'trg_authoritative_signing_delivery_phase0',
  'PHASE0_SIGNER_STATUS_SERVICE_ONLY',
  'PHASE0_PACKET_SENT_SERVICE_ONLY',
  'bridge_enforce_private_listing_mandate_completion_phase0',
  'bridge_require_canonical_completed_mandate_phase0',
  'trg_private_listing_mandate_completion_phase0',
  'trg_listing_publication_mandate_completion_phase0',
  'trg_listing_external_publication_mandate_completion_phase0',
  'trg_active_listing_mandate_integrity_phase0',
  'revoke all on function public.bridge_require_canonical_completed_mandate_phase0(uuid, uuid)',
  'PHASE0_PRIVATE_LISTING_CANONICAL_MANDATE_REQUIRED',
  'PHASE0_ACTIVE_LISTING_MANDATE_IMMUTABLE',
  'legal_final_artifact_evidence',
  "'listing_active', 'in_progress', 'live', 'published'",
  "lower(coalesce(new.mandate_status, '')) = 'signed'",
  'v_new_operationally_active',
  'bridge_listing_status',
  'property24_status',
  'private_property_status',
  'listing_publication_data',
  'listing_external_links',
  'current_version_number',
  'new.mandate_packet_id is distinct from old.mandate_packet_id',
  'new.organisation_id is distinct from old.organisation_id',
  "lower(coalesce(v_packet.status, '')) <> 'completed'",
  "coalesce(auth.role(), 'unknown')",
]) {
  assert.match(deliveryMigration, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
assert.doesNotMatch(
  deliveryMigration,
  /lower\(coalesce\(new\.mandate_status, ''\)\) in \('signed', 'signed_uploaded', 'signed_external_pending_upload'\)/,
)

console.log('Document finalisation Phase 0 containment contract passed.')
