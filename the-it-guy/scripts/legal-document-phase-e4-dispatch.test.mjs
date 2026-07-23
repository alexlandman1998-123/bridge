import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessSigningDispatch } from '../src/core/documents/signingDispatchAssurance.js'

const packet = { id: '11111111-1111-4111-8111-111111111111', organisation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', packet_type: 'custom', current_version_number: 2, status: 'sent' }
const version = { id: '22222222-2222-4222-8222-222222222222', packet_id: packet.id, organisation_id: packet.organisation_id, version_number: 2, render_status: 'generated', rendered_file_path: 'document-packets/packet-1/generated.pdf', generated_at: '2026-07-17T10:00:00.000Z', validation_summary_json: {} }
const issuedAt = '2026-07-17T12:30:00.000Z'
const signer = { organisation_id: packet.organisation_id, packet_id: packet.id, packet_version_id: version.id, signer_role: 'seller', signer_name: 'Seller', signer_email: 'seller@example.com', signing_order: 1, status: 'sent', signing_token: 'a'.repeat(64), token_expires_at: '2026-07-20T12:30:00.000Z' }
const field = { organisation_id: packet.organisation_id, packet_id: packet.id, packet_version_id: version.id, signer_role: 'seller', signer_email: signer.signer_email, field_type: 'signature', page_number: 3, x_position: 10, y_position: 10, width: 100, height: 30, required: true }
assert.equal(assessSigningDispatch({ packet, version, signers: [signer], fields: [field], issuedAt }).ready, true)
assert.ok(assessSigningDispatch({ packet, version, signers: [{ ...signer, signing_token: 'weak' }], fields: [field], issuedAt }).reasons.includes('E4_TOKEN_FORMAT_INVALID'))
assert.ok(assessSigningDispatch({ packet, version, signers: [{ ...signer, token_expires_at: '2027-07-20T12:30:00.000Z' }], fields: [field], issuedAt }).reasons.includes('E4_TOKEN_EXPIRY_INVALID'))
assert.equal(assessSigningDispatch({ packet, version, signers: [{ ...signer, status: 'ready_to_send' }], fields: [field], issuedAt }).ready, true)
assert.ok(assessSigningDispatch({ packet, version, signers: [{ ...signer, status: 'pending' }], fields: [field], issuedAt }).reasons.includes('E4_ACTIVE_DISPATCH_MISSING'))

const migration = fs.readFileSync('../supabase/migrations/202607170021_secure_legal_signing_dispatch_e4.sql', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const page = fs.readFileSync('src/pages/LegalDocumentWorkspacePage.jsx', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-e4-verify.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.match(migration, /document_packet_signers_signing_token_unique/)
assert.match(migration, /\^\[0-9a-f\]\{64\}\$/)
assert.match(api, /assertSigningDispatchReady/)
assert.doesNotMatch(api, /Math\.random/)
assert.match(page, /mandateType: 'Offer to Purchase'/)
assert.match(verify, /E4_DELIVERY_CONFIRMATION_MISSING/)
for (const name of ['test:legal-documents-phase-e4', 'verify:legal-documents:phase-e4']) assert.ok(pkg.scripts?.[name])
console.log('Legal document E4 secure signing-dispatch contract passed.')
