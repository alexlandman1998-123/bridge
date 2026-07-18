import assert from 'node:assert/strict'
import fs from 'node:fs'

const core = fs.readFileSync('src/core/documents/finalSurfaceCompletion.js', 'utf8')
const dispatch = fs.readFileSync('../supabase/functions/dispatch-final-signed-document/index.ts', 'utf8')
const migration = fs.readFileSync('../supabase/migrations/202607180021_cross_surface_completion_f4.sql', 'utf8')

assert.match(core, /assessFinalSurfaceCompletion/)
assert.match(dispatch, /bridge_complete_final_document_surfaces_f4/)
assert.match(dispatch, /F4_SURFACE_COMPLETION_FAILED/)
assert.match(dispatch, /surfaceCompletion/)
assert.match(migration, /legal_final_completion_receipts/)
assert.match(migration, /signed_mandate/)
assert.match(migration, /signed_otp/)
assert.match(migration, /satisfied_by_document_id=v_document\.id/)
assert.match(migration, /final_document_surfaces_completed/)
assert.match(migration, /transaction_visible/)
assert.match(migration, /client_visible/)

console.log('Document generator Phase F4 cross-surface completion contract passed.')
