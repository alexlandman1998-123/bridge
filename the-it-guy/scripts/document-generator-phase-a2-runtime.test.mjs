import assert from 'node:assert/strict'
import fs from 'node:fs'

const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const envelope = fs.readFileSync('src/core/documents/signingEnvelopeAssurance.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const resolver = fs.readFileSync('../supabase/functions/resolve-signer-token/index.ts', 'utf8')
const signingAction = fs.readFileSync('../supabase/functions/signer-signing-action/index.ts', 'utf8')
const mandateFinalizer = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')
const otpFinalizer = fs.readFileSync('../supabase/functions/generate-final-signed-otp/index.ts', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180001_legal_document_runtime_without_approval_lock_a2.sql', 'utf8')

assert.doesNotMatch(api, /assertDraftReviewApproval|assertDraftLock/)
assert.doesNotMatch(envelope, /assessDraftLock|E3_E2_LOCK_INVALID/)
assert.match(envelope, /E3_VERSION_BINDING_INVALID/)
assert.match(envelope, /E3_PACKET_NOT_READY_TO_SEND/)
assert.doesNotMatch(workspace, /canApprove|canLock|approve_draft|lock_document|requireApprovalValidation/)

for (const source of [resolver, signingAction, mandateFinalizer, otpFinalizer]) {
  assert.doesNotMatch(source, /lock_snapshot|lockDecision|content_locked/)
  assert.match(source, /render_status/)
  assert.match(source, /current_version_number/)
}

assert.match(migration, /drop trigger if exists trg_legal_draft_review_before_token/)
assert.match(migration, /drop trigger if exists trg_legal_draft_lock_before_token/)
assert.match(migration, /trg_current_generated_version_before_token_a2/)
assert.match(migration, /v_packet\.current_version_number is distinct from v_version\.version_number/)
assert.match(migration, /v_version\.render_status <> 'generated'/)
assert.match(migration, /v_packet\.status not in \('sent', 'partially_signed', 'completed'\)/)
assert.doesNotMatch(migration, /v_lock|lock_snapshot|lockDecision/)

console.log('Document generator Phase A2 runtime-gate removal contract passed.')
