import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessFinalSignedCompletion } from '../src/core/documents/finalSignedCompletionAssurance.js'

const packet = { id: '11111111-1111-4111-8111-111111111111', organisation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_version_number: 2, status: 'completed', completed_at: '2026-07-17T14:00:00Z' }
const version = { id: '22222222-2222-4222-8222-222222222222', packet_id: packet.id, organisation_id: packet.organisation_id, version_number: 2, render_status: 'generated', final_signed_file_path: 'signed-documents/final.pdf', final_signed_file_bucket: 'documents', finalised_at: '2026-07-17T14:00:00Z', validation_summary_json: {} }
const signer = { id: '33333333-3333-4333-8333-333333333333', packet_version_id: version.id, status: 'signed', signed_at: '2026-07-17T13:59:00Z' }
const field = { id: '44444444-4444-4444-8444-444444444444', packet_version_id: version.id, required: true, status: 'completed', field_type: 'initial', signature_asset_path: `document-signatures/${packet.id}/${signer.id}/initial.png` }
const events = ['signer_link_viewed', 'signer_completed_signing'].map((event_type) => ({ version_id: version.id, event_type, event_payload_json: { signerId: signer.id } })).concat({ version_id: version.id, event_type: 'all_signers_completed', event_payload_json: {} })
const evidence = { packet_id: packet.id, packet_version_id: version.id, bucket: 'documents', path: version.final_signed_file_path, media_type: 'application/pdf', sha256: 'a'.repeat(64), byte_length: 1024 }
assert.equal(assessFinalSignedCompletion({ packet, version, signers: [signer], fields: [field], events, evidence }).ready, true)
assert.ok(assessFinalSignedCompletion({ packet, version, signers: [{ ...signer, status: 'viewed' }], fields: [field], events, evidence }).reasons.includes('F2_SIGNERS_INCOMPLETE'))
assert.ok(assessFinalSignedCompletion({ packet, version, signers: [signer], fields: [{ ...field, signature_asset_path: '' }], events, evidence }).reasons.includes('F2_SIGNATURE_ASSET_MISSING'))
assert.ok(assessFinalSignedCompletion({ packet, version, signers: [signer], fields: [field], events, evidence: { ...evidence, sha256: 'bad' } }).reasons.includes('F2_FINAL_EVIDENCE_INVALID'))
assert.ok(assessFinalSignedCompletion({ packet, version: { ...version, organisation_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, signers: [signer], fields: [field], events, evidence }).reasons.includes('F2_GENERATED_VERSION_BINDING_INVALID'))

const mandate = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')
const otp = fs.readFileSync('../supabase/functions/generate-final-signed-otp/index.ts', 'utf8')
const action = fs.readFileSync('../supabase/functions/signer-signing-action/index.ts', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607170023_legal_final_signed_assurance_f2.sql', 'utf8')
assert.match(mandate, /FINAL_VERSION_ID_REQUIRED/)
assert.doesNotMatch(mandate, /field_type\) !== "initial"/)
for (const source of [mandate]) {
  assert.match(source, /legal_final_artifact_evidence/)
  assert.match(source, /finalArtifactSha256/)
  assert.match(source, /FINAL_VERSION_BINDING_INVALID/)
  assert.match(source, /SIGNATURE_ASSET_SCOPE_INVALID/)
}
assert.match(otp, /OTP_FINALISATION_DISABLED_UNSAFE_RECONSTRUCTION/)
assert.doesNotMatch(otp, /bridge_record_final_artifact_f2|finalArtifactSha256|buildPdf/)
assert.match(migration, /trg_final_artifact_evidence_f2/)
assert.match(migration, /trg_prevent_final_artifact_evidence_mutation_f2/)
assert.match(migration, /trg_completed_packet_artifact_f2/)
assert.match(migration, /bridge_record_final_artifact_f2/)
assert.match(action, /finalisationRetried/)
assert.match(action, /progressSigningStatus/)
assert.match(mandate, /fieldType === "signature" \|\| fieldType === "initial"/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-f2', 'verify:legal-documents:phase-f2']) assert.ok(pkg.scripts?.[name])
console.log('Legal document F2 final signed completion contract passed.')
