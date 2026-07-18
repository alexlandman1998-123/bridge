import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessFinalDelivery } from '../src/core/documents/finalDeliveryAssurance.js'

const packet = { id: '11111111-1111-4111-8111-111111111111', packet_type: 'otp' }
const version = { id: '22222222-2222-4222-8222-222222222222', final_signed_file_path: 'signed-documents/final.pdf' }
const signer = { id: '33333333-3333-4333-8333-333333333333', signer_email: 'buyer@example.com' }
const artifactEvidence = { packet_version_id: version.id, path: version.final_signed_file_path, sha256: 'a'.repeat(64) }
const delivery = { packet_version_id: version.id, signer_id: signer.id, recipient_email: signer.signer_email, artifact_sha256: artifactEvidence.sha256, artifact_path: artifactEvidence.path, attempt_number: 1, status: 'sent', provider_message_id: 'resend_123' }
const publication = { packet_version_id: version.id, artifact_sha256: artifactEvidence.sha256, artifact_path: artifactEvidence.path, portal_surface: 'client_portal', verified_at: '2026-07-17T15:00:00Z' }
const events = [{ version_id: version.id, event_type: 'final_signed_delivery_completed', event_payload_json: { artifactSha256: artifactEvidence.sha256, recipientCount: 1, sentCount: 1, portalSurface: 'client_portal' } }]
assert.equal(assessFinalDelivery({ packet, version, signers: [signer], artifactEvidence, deliveries: [delivery], publication, events }).ready, true)
assert.ok(assessFinalDelivery({ packet, version, signers: [signer], artifactEvidence, deliveries: [{ ...delivery, status: 'failed', provider_message_id: null }], publication, events }).reasons.includes('F3_RECIPIENT_DELIVERY_INCOMPLETE'))
assert.ok(assessFinalDelivery({ packet, version, signers: [signer], artifactEvidence, deliveries: [delivery], publication: { ...publication, portal_surface: 'seller_portal' }, events }).reasons.includes('F3_PORTAL_PUBLICATION_INVALID'))

const dispatch = fs.readFileSync('../supabase/functions/dispatch-final-signed-document/index.ts', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607170024_legal_final_delivery_assurance_f3.sql', 'utf8')
const email = fs.readFileSync('../supabase/functions/send-email/handlers/sellerMandateSigned.ts', 'utf8')
const portal = fs.readFileSync('src/pages/ClientPortal.jsx', 'utf8')
for (const token of ['bridge_record_final_delivery_f3', 'bridge_record_final_publication_f3', 'final_signed_delivery_completed', 'providerMessageId']) assert.match(dispatch, new RegExp(token))
assert.match(dispatch, /bridge_claim_final_delivery_f3/)
assert.match(dispatch, /idempotencyKey/)
assert.match(dispatch, /FINAL_DELIVERY_FORBIDDEN/)
assert.match(migration, /legal_final_artifact_deliveries/)
assert.match(migration, /legal_final_artifact_publications/)
assert.match(migration, /legal_final_delivery_claims/)
assert.match(email, /Offer to Purchase/)
assert.match(portal, /Download Signed Mandate/)
assert.match(portal, /Download Signed OTP/)
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
for (const name of ['test:legal-documents-phase-f3', 'verify:legal-documents:phase-f3']) assert.ok(pkg.scripts?.[name])
console.log('Legal document F3 final delivery contract passed.')
