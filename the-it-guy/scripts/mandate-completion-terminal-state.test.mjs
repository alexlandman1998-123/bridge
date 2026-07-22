import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('../supabase/migrations/202607210002_final_mandate_completion_terminal_state.sql', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const statusModel = fs.readFileSync('src/core/documents/signingOperationalStatus.js', 'utf8')

for (const token of [
  'bridge_mark_final_completion_packet_terminal',
  'trg_mark_final_completion_packet_terminal',
  "'signing_status', 'completed'",
  "'signingStatus', 'completed'",
  "'mandateStatus', 'completed'",
  "'lifecycle_state', 'completed'",
  'bridge_get_final_completion_status_f5',
  "'deliveryReady'",
  "'deliveryRetryable'",
]) {
  assert.ok(migration.includes(token), `terminal completion migration should include ${token}`)
}

assert.match(
  migration,
  /v_ready := v_version\.final_signed_file_path is not null[\s\S]*v_publication\.id is not null[\s\S]*v_receipt\.id is not null/,
  'F5 readiness must be based on immutable artifact plus transaction/portal completion receipt.',
)
assert.doesNotMatch(
  migration,
  /v_ready :=[\s\S]*v_delivered_count=v_signer_count/,
  'F5 legal readiness must not be blocked by final email delivery.',
)
assert.match(workspace, /Final email delivery pending/)
assert.match(statusModel, /Final email delivery is pending/)

console.log('mandate completion terminal-state contract passed')
