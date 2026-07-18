import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assessDraftReviewApproval, buildDraftReviewApprovalSnapshot } from '../src/core/documents/draftReviewApproval.js'

const packet = { id: '11111111-1111-4111-8111-111111111111' }
const version = { id: '22222222-2222-4222-8222-222222222222', version_number: 2, render_status: 'generated', generated_at: '2026-07-17T10:00:00.000Z', validation_summary_json: { artifact_provenance: { sha256: `sha256:${'a'.repeat(64)}`, path: 'packet/draft.docx' }, render_provenance: { contentFingerprint: 'fnv1a_12345678', generationAttemptId: '33333333-3333-4333-8333-333333333333' } } }
const snapshot = buildDraftReviewApprovalSnapshot({ packet, version, reviewerUserId: '44444444-4444-4444-8444-444444444444', reviewerRole: 'principal', approvedAt: '2026-07-17T11:00:00.000Z', approvalReference: 'draft-review:test' })
const approvedVersion = { ...version, validation_summary_json: { ...version.validation_summary_json, approval_snapshot: snapshot } }
assert.equal(assessDraftReviewApproval({ packet, version: approvedVersion }).approved, true)
assert.ok(assessDraftReviewApproval({ packet, version: { ...approvedVersion, render_status: 'draft' } }).reasons.includes('E1_VERSION_NOT_GENERATED'))
assert.ok(assessDraftReviewApproval({ packet, version: { ...approvedVersion, validation_summary_json: { ...approvedVersion.validation_summary_json, artifact_provenance: { ...approvedVersion.validation_summary_json.artifact_provenance, sha256: `sha256:${'b'.repeat(64)}` } } } }).reasons.includes('E1_ARTIFACT_SHA256_MISMATCH'))

const migration = fs.readFileSync('../supabase/migrations/202607170018_legal_draft_review_gate_e1.sql', 'utf8')
const a2RuntimeMigration = fs.readFileSync('../supabase/migrations/202607180001_legal_document_runtime_without_approval_lock_a2.sql', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const verify = fs.readFileSync('scripts/legal-document-phase-e1-verify.mjs', 'utf8')
const a2 = fs.readFileSync('scripts/legal-document-phase-a2-readiness.mjs', 'utf8')
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'))
assert.match(migration, /before insert or update of signing_token/)
assert.match(migration, /approval_snapshot/)
assert.match(migration, /artifact_provenance/)
assert.match(migration, /current_version_number <> v_version\.version_number/)
assert.doesNotMatch(api, /assertDraftReviewApproval\(\{ packet, version: targetVersion \}\)/)
assert.doesNotMatch(workspace, /buildDraftReviewApprovalSnapshot|approvedByUserId/)
assert.match(a2RuntimeMigration, /drop trigger if exists trg_legal_draft_review_before_token/)
assert.match(verify, /E1_APPROVAL_EVENT_MISSING/)
assert.match(verify, /mutatedData: false/)
assert.match(a2, /legal-document-phase-e1-verify\.mjs/)
for (const name of ['test:legal-documents-phase-e1', 'verify:legal-documents:phase-e1']) assert.ok(pkg.scripts?.[name])

console.log('Legal document E1 legacy audit/A2 runtime compatibility contract passed.')
