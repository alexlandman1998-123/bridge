import assert from 'node:assert/strict'
import fs from 'node:fs'

const lifecycle = fs.readFileSync('src/core/documents/documentLifecycle.js', 'utf8')
const api = fs.readFileSync('src/lib/documentPacketsApi.js', 'utf8')
const workspace = fs.readFileSync('src/components/documents/LegalDocumentWorkspace.jsx', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180002_canonical_document_lifecycle_persistence_a3.sql', 'utf8')

for (const state of ['draft', 'pdf_generated', 'ready_to_send', 'sent', 'partially_signed', 'completed', 'archived']) {
  assert.match(lifecycle, new RegExp(`'${state}'`))
  assert.match(migration, new RegExp(`'${state}'`))
}

assert.match(api, /export async function transitionDocumentPacketLifecycle/)
assert.match(api, /assertDocumentLifecycleTransition\(currentState, nextState\)/)
assert.match(api, /eventType: 'document_lifecycle_transitioned'/)
assert.match(api, /lifecycle_previous_state: currentState/)
assert.match(workspace, /transitionDocumentPacketLifecycle\(/)
assert.doesNotMatch(workspace, /toDocumentPacketStorageStatus/)

assert.match(migration, /trg_sync_canonical_document_lifecycle_a3/)
assert.match(migration, /before insert or update of status, source_context_json/)
assert.match(migration, /A3 invalid document lifecycle transition/)
assert.match(migration, /where packet_type in \('mandate', 'otp'\)/)
assert.match(migration, /'lifecycle_state', v_next_state/)

console.log('Document generator Phase A3 canonical persistence contract passed.')
