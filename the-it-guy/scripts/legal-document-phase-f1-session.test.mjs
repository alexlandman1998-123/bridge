import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildDraftReviewApprovalSnapshot } from '../src/core/documents/draftReviewApproval.js'
import { buildDraftLockSnapshot } from '../src/core/documents/draftLockAssurance.js'
import { assessSignerSession } from '../src/core/documents/signerSessionAssurance.js'

const packet = { id: '11111111-1111-4111-8111-111111111111', organisation_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', packet_type: 'custom', current_version_number: 2 }
const version = { id: '22222222-2222-4222-8222-222222222222', packet_id: packet.id, organisation_id: packet.organisation_id, version_number: 2, render_status: 'generated', generated_at: '2026-07-17T10:00:00.000Z', validation_summary_json: { review_state: 'approved', artifact_provenance: { sha256: `sha256:${'a'.repeat(64)}`, path: 'packet/draft.docx' }, render_provenance: { contentFingerprint: 'fnv1a_12345678', generationAttemptId: '33333333-3333-4333-8333-333333333333' } } }
const approval = buildDraftReviewApprovalSnapshot({ packet, version, reviewerUserId: '44444444-4444-4444-8444-444444444444', reviewerRole: 'principal', approvedAt: '2026-07-17T11:00:00.000Z', approvalReference: 'review:test' })
const approved = { ...version, validation_summary_json: { ...version.validation_summary_json, approval_snapshot: approval } }
const lock = buildDraftLockSnapshot({ packet, version: approved, lockedByUserId: '55555555-5555-4555-8555-555555555555', lockedByRole: 'principal', lockedAt: '2026-07-17T12:00:00.000Z', lockReference: 'lock:test' })
const locked = { ...approved, validation_summary_json: { ...approved.validation_summary_json, review_state: 'locked', content_locked: true, lock_snapshot: lock } }
const signer = { id: '66666666-6666-4666-8666-666666666666', organisation_id: packet.organisation_id, packet_id: packet.id, packet_version_id: version.id, signer_role: 'seller', signer_name: 'Seller', signer_email: 'seller@example.com', signing_order: 1, status: 'viewed', signing_token: 'a'.repeat(64), token_expires_at: '2026-07-20T12:30:00.000Z' }
const field = { id: '77777777-7777-4777-8777-777777777777', organisation_id: packet.organisation_id, packet_id: packet.id, packet_version_id: version.id, signer_role: 'seller', signer_email: signer.signer_email, field_type: 'signature', page_number: 3, x_position: 10, y_position: 10, width: 100, height: 30, required: true }
assert.equal(assessSignerSession({ packet, version: locked, signers: [signer], fields: [field], signer, issuedAt: '2026-07-17T12:30:00.000Z' }).ready, true)
assert.ok(assessSignerSession({ packet, version: locked, signers: [signer], fields: [field], signer: { ...signer, packet_version_id: '88888888-8888-4888-8888-888888888888' }, issuedAt: '2026-07-17T12:30:00.000Z' }).reasons.includes('F1_SIGNER_VERSION_BINDING_INVALID'))
assert.ok(assessSignerSession({ packet, version: locked, signers: [signer], fields: [{ ...field, signer_role: 'agent' }], signer, issuedAt: '2026-07-17T12:30:00.000Z' }).reasons.includes('F1_SIGNER_FIELDS_MISSING'))

const resolveFn = fs.readFileSync('../supabase/functions/resolve-signer-token/index.ts', 'utf8')
const actionFn = fs.readFileSync('../supabase/functions/signer-signing-action/index.ts', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607170022_legal_signer_session_integrity_f1.sql', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.match(resolveFn, /SIGNER_SESSION_BINDING_INVALID/)
assert.match(resolveFn, /LOCKED_SIGNING_PREVIEW_UNAVAILABLE/)
assert.match(resolveFn, /!\["sent", "viewed"\]\.includes/)
assert.doesNotMatch(resolveFn, /latestPreviewVersionQuery/)
assert.doesNotMatch(resolveFn, /ensureSignerSignatureField/)
assert.doesNotMatch(resolveFn, /field_type\)\.toLowerCase\(\) !== "initial"/)
assert.match(resolveFn, /if \(!fields\.length\)/)
assert.match(actionFn, /SIGNER_SESSION_BINDING_INVALID/)
assert.match(actionFn, /signerSessionActive/)
assert.doesNotMatch(actionFn, /field_type\)\.toLowerCase\(\) !== "initial"/)
assert.match(migration, /trg_signer_field_completion_scope/)
assert.match(migration, /trg_signer_completion_scope/)
assert.doesNotMatch(migration, /field\.field_type <> 'initial'/)
assert.match(migration, /current_version_number is distinct from v_version\.version_number/)
assert.match(migration, /document-signatures\//)
for (const name of ['test:legal-documents-phase-f1', 'verify:legal-documents:phase-f1']) assert.ok(pkg.scripts?.[name])
console.log('Legal document F1 signer-session integrity contract passed.')
