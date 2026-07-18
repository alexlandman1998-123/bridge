import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildDraftReviewApprovalSnapshot } from '../src/core/documents/draftReviewApproval.js'
import { buildDraftLockSnapshot } from '../src/core/documents/draftLockAssurance.js'
import { assessSigningEnvelope } from '../src/core/documents/signingEnvelopeAssurance.js'

const packet = { id: '11111111-1111-4111-8111-111111111111', organisation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', packet_type: 'custom', current_version_number: 2 }
const version = { id: '22222222-2222-4222-8222-222222222222', packet_id: packet.id, organisation_id: packet.organisation_id, version_number: 2, render_status: 'generated', generated_at: '2026-07-17T10:00:00.000Z', validation_summary_json: { review_state: 'approved', artifact_provenance: { sha256: `sha256:${'a'.repeat(64)}`, path: 'packet/draft.docx' }, render_provenance: { contentFingerprint: 'fnv1a_12345678', generationAttemptId: '33333333-3333-4333-8333-333333333333' } } }
const approval = buildDraftReviewApprovalSnapshot({ packet, version, reviewerUserId: '44444444-4444-4444-8444-444444444444', reviewerRole: 'principal', approvedAt: '2026-07-17T11:00:00.000Z', approvalReference: 'draft-review:test' })
const approvedVersion = { ...version, validation_summary_json: { ...version.validation_summary_json, approval_snapshot: approval } }
const lock = buildDraftLockSnapshot({ packet, version: approvedVersion, lockedByUserId: '55555555-5555-4555-8555-555555555555', lockedByRole: 'principal', lockedAt: '2026-07-17T12:00:00.000Z', lockReference: 'draft-lock:test' })
const lockedVersion = { ...approvedVersion, validation_summary_json: { ...approvedVersion.validation_summary_json, review_state: 'locked', content_locked: true, lock_snapshot: lock } }
const signer = { id: '66666666-6666-4666-8666-666666666666', organisation_id: packet.organisation_id, packet_id: packet.id, packet_version_id: version.id, signer_role: 'seller', signer_name: 'Seller Example', signer_email: 'seller@example.com', signing_order: 1 }
const field = { id: '77777777-7777-4777-8777-777777777777', organisation_id: packet.organisation_id, packet_id: packet.id, packet_version_id: version.id, signer_role: 'seller', signer_name: signer.signer_name, signer_email: signer.signer_email, field_type: 'signature', page_number: 3, x_position: 440, y_position: 692, width: 168, height: 44, required: true }

assert.equal(assessSigningEnvelope({ packet, version: lockedVersion, signers: [signer], fields: [field] }).ready, true)
assert.ok(assessSigningEnvelope({ packet, version: lockedVersion, signers: [{ ...signer, signer_email: 'pending+seller@bridge.local' }], fields: [field] }).reasons.includes('E3_SIGNER_EMAIL_INVALID'))
assert.ok(assessSigningEnvelope({ packet, version: lockedVersion, signers: [signer], fields: [{ ...field, packet_version_id: '88888888-8888-4888-8888-888888888888' }] }).reasons.includes('E3_FIELD_VERSION_BINDING_INVALID'))
assert.ok(assessSigningEnvelope({ packet, version: lockedVersion, signers: [signer], fields: [{ ...field, width: 0 }] }).reasons.includes('E3_FIELD_GEOMETRY_INVALID'))
assert.ok(assessSigningEnvelope({ packet, version: lockedVersion, signers: [signer], fields: [{ ...field, required: false }] }).reasons.includes('E3_REQUIRED_SIGNATURE_FIELD_MISSING'))
assert.ok(assessSigningEnvelope({ packet: { ...packet, packet_type: 'mandate' }, version: lockedVersion, signers: [signer], fields: [field] }).reasons.includes('E3_REQUIRED_SIGNER_MISSING'))

const migration = fs.readFileSync('../supabase/migrations/202607170020_legal_signing_envelope_assurance_e3.sql', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-e3-verify.mjs', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.match(migration, /trg_legal_signing_envelope_before_token/)
assert.match(migration, /trg_freeze_dispatched_signer_envelope/)
assert.match(migration, /trg_freeze_dispatched_signing_fields/)
assert.match(migration, /@bridge\.local/)
assert.match(api, /assertSigningEnvelopeReady\(\{ packet, version: targetVersion, signers, fields: signingFields \}\)/)
assert.match(verify, /E3_PREPARATION_EVENT_MISSING/)
assert.match(verify, /mutatedData: false/)
assert.match(a2, /legal-document-phase-e3-verify\.mjs/)
for (const name of ['test:legal-documents-phase-e3', 'verify:legal-documents:phase-e3']) assert.ok(pkg.scripts?.[name])

console.log('Legal document E3 signing-envelope assurance contract passed.')
