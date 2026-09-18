import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260918114553_listing_multi_signer_sessions_phase2.sql', import.meta.url), 'utf8')
assert.match(migration, /private_listing_documents/)
assert.match(migration, /signing_session_id/)
assert.match(migration, /'completed', 'seller_visible'/)
assert.match(migration, /private_listing_document_requirements set status = 'completed'/)
assert.match(migration, /signingGroupId/)
console.log('listing seller documents phase 5 checks passed.')
