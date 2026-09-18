import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [edge, signingPage, completionMigration] = await Promise.all([
  readFile(new URL('../../supabase/functions/listing-mandate-signing/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/ListingMandateSigning.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../../supabase/migrations/20260918114553_listing_multi_signer_sessions_phase2.sql', import.meta.url), 'utf8'),
])

assert.match(completionMigration, /where signing_group_id = v_session\.signing_group_id and status <> 'signed'/)
assert.match(completionMigration, /if v_session\.selected_documents \? 'mandate' and v_group_complete then/)
assert.match(edge, /groupComplete: completion\.groupComplete === true/)
assert.match(edge, /if \(session\.signing_group_id\) \{[\s\S]*This signing pack must be completed together/)
assert.match(signingPage, /groupComplete: result\.data\?\.groupComplete === true/)

console.log('listing seller portal completion trigger phase 1 checks passed.')
