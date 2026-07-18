import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildDraftReviewApprovalSnapshot } from '../src/core/documents/draftReviewApproval.js'
import { assessDraftLock, buildDraftLockSnapshot } from '../src/core/documents/draftLockAssurance.js'

const packet = { id: '11111111-1111-4111-8111-111111111111', current_version_number: 2 }
const version = { id: '22222222-2222-4222-8222-222222222222', packet_id: packet.id, version_number: 2, render_status: 'generated', generated_at: '2026-07-17T10:00:00.000Z', validation_summary_json: { review_state: 'approved', artifact_provenance: { sha256: `sha256:${'a'.repeat(64)}`, path: 'packet/draft.docx' }, render_provenance: { contentFingerprint: 'fnv1a_12345678', generationAttemptId: '33333333-3333-4333-8333-333333333333' } } }
const approval = buildDraftReviewApprovalSnapshot({ packet, version, reviewerUserId: '44444444-4444-4444-8444-444444444444', reviewerRole: 'principal', approvedAt: '2026-07-17T11:00:00.000Z', approvalReference: 'draft-review:test' })
const approvedVersion = { ...version, validation_summary_json: { ...version.validation_summary_json, approval_snapshot: approval } }
const lock = buildDraftLockSnapshot({ packet, version: approvedVersion, lockedByUserId: '55555555-5555-4555-8555-555555555555', lockedByRole: 'principal', lockedAt: '2026-07-17T12:00:00.000Z', lockReference: 'draft-lock:test' })
const lockedVersion = { ...approvedVersion, validation_summary_json: { ...approvedVersion.validation_summary_json, review_state: 'locked', content_locked: true, lock_snapshot: lock } }
assert.equal(assessDraftLock({ packet, version: lockedVersion }).locked, true)
assert.ok(assessDraftLock({ packet: { ...packet, current_version_number: 3 }, version: lockedVersion }).reasons.includes('E2_CURRENT_VERSION_POINTER_MISMATCH'))
assert.ok(assessDraftLock({ packet, version: { ...lockedVersion, render_status: 'draft' } }).reasons.includes('E2_E1_APPROVAL_INVALID'))
assert.ok(assessDraftLock({ packet, version: { ...lockedVersion, validation_summary_json: { ...lockedVersion.validation_summary_json, review_state: 'approved' } } }).reasons.includes('E2_REVIEW_STATE_NOT_LOCKED'))
assert.ok(assessDraftLock({ packet, version: { ...lockedVersion, validation_summary_json: { ...lockedVersion.validation_summary_json, artifact_provenance: { ...lockedVersion.validation_summary_json.artifact_provenance, sha256: `sha256:${'b'.repeat(64)}` } } } }).reasons.includes('E2_ARTIFACT_SHA256_MISMATCH'))

const migration = fs.readFileSync('../supabase/migrations/202607170019_legal_draft_immutable_lock_e2.sql', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-e2-verify.mjs', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.match(migration, /trg_prevent_locked_legal_draft_mutation/)
assert.match(migration, /trg_prevent_locked_legal_draft_pointer_change/)
assert.match(migration, /before insert or update of signing_token/)
assert.match(migration, /locked legal draft content or provenance is immutable/)
assert.match(api, /assertDraftLock\(\{ packet, version: targetVersion \}\)/)
assert.match(workspace, /buildDraftLockSnapshot/)
assert.match(workspace, /lockedByUserId/)
assert.match(workspace, /latestVersion\?\.id && target !== 'sent'/)
assert.match(verify, /E2_LOCK_EVENT_MISSING/)
assert.match(verify, /mutatedData: false/)
assert.match(a2, /legal-document-phase-e2-verify\.mjs/)
for (const name of ['test:legal-documents-phase-e2', 'verify:legal-documents:phase-e2']) assert.ok(pkg.scripts?.[name])

console.log('Legal document E2 immutable draft-lock contract passed.')
