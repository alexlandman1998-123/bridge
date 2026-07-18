import assert from 'node:assert/strict'
import fs from 'node:fs'

const core = fs.readFileSync('src/core/documents/controlledFinalSignedCompletion.js', 'utf8')
const action = fs.readFileSync('../supabase/functions/signer-signing-action/index.ts', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180019_controlled_final_signed_artifact_f2.sql', 'utf8')
const mandate = fs.readFileSync('../supabase/functions/generate-final-signed-document/index.ts', 'utf8')
const otp = fs.readFileSync('../supabase/functions/generate-final-signed-otp/index.ts', 'utf8')

assert.match(core, /assessControlledFinalSignedCompletion/)
assert.match(action, /bridge_complete_controlled_signer_session_f2/)
assert.match(action, /F2_CONTROLLED_SESSION_COMPLETION_FAILED/)
assert.match(migration, /controlled_signer_session_completed/)
assert.match(migration, /transaction_pdf_persisted/)
assert.match(migration, /document_signing_dispatches/)
assert.match(migration, /document_signer_sessions/)
assert.match(migration, /bridge_enforce_final_artifact_evidence_f2/)
for (const finalizer of [mandate, otp]) {
  assert.match(finalizer, /bridge_record_final_artifact_f2/)
  assert.match(finalizer, /finalArtifactSha256/)
}

console.log('Document generator Phase F2 controlled final-signed contract passed.')
