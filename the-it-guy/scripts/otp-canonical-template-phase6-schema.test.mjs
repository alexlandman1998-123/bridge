import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(new URL('../../supabase/migrations/202607150006_canonical_otp_controlled_activation_phase6.sql', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
const settings = fs.readFileSync(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')

assert.match(migration, /create or replace function public\.activate_canonical_otp_candidate/i)
assert.match(migration, /for update/i)
assert.match(migration, /v_candidate\.status <> 'approved'/)
assert.match(migration, /document_template_approvals/)
assert.match(migration, /template_fingerprint/)
assert.match(migration, /content_hash/)
assert.match(migration, /set status = 'superseded'/)
assert.match(migration, /set status = 'published'/)
assert.match(migration, /previous_live_version_id = v_live\.id/)
assert.match(migration, /canonical_otp_candidate_activated/)
assert.match(migration, /grant execute on function public\.activate_canonical_otp_candidate/)

const supersedeAt = migration.indexOf("set status = 'superseded'")
const publishAt = migration.indexOf("set status = 'published'")
assert.ok(supersedeAt > 0 && publishAt > supersedeAt, 'the old published version must be superseded before the candidate is published')

assert.match(api, /export async function activateCanonicalOtpCandidate/)
assert.match(api, /client\.rpc\('activate_canonical_otp_candidate'/)
assert.match(api, /select\('candidate_version_id'\)/)
assert.match(settings, /await activateCanonicalOtpCandidate/)
assert.match(settings, /previous live version is retained for rollback/i)

console.log('Canonical OTP Phase 6 schema and activation wiring checks passed.')
