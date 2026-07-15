import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(new URL('../../supabase/migrations/202607150007_canonical_otp_atomic_recovery_phase7.sql', import.meta.url), 'utf8')
const api = fs.readFileSync(new URL('../src/lib/documentPacketsApi.js', import.meta.url), 'utf8')
const settings = fs.readFileSync(new URL('../src/pages/settings/SettingsSigningTemplatesPage.jsx', import.meta.url), 'utf8')
const packetService = fs.readFileSync(new URL('../src/core/documents/packetService.js', import.meta.url), 'utf8')

assert.match(migration, /create or replace function public\.rollback_canonical_otp_version/i)
assert.match(migration, /for update/i)
assert.match(migration, /char_length\(v_reason\) < 12/)
assert.match(migration, /v_live\.status <> 'published' or v_previous\.status <> 'superseded'/)
assert.match(migration, /set status = 'superseded'/)
assert.match(migration, /set status = 'published'/)
assert.match(migration, /live_version_id = v_previous\.id/)
assert.match(migration, /previous_live_version_id = v_live\.id/)
assert.match(migration, /canonical_otp_version_rolled_back/)
assert.match(migration, /grant execute on function public\.rollback_canonical_otp_version/)

const supersedeAt = migration.indexOf("set status = 'superseded'")
const publishAt = migration.indexOf("set status = 'published'")
assert.ok(supersedeAt > 0 && publishAt > supersedeAt, 'the current live version must be superseded before restoring its predecessor')

assert.match(api, /async function resolveCanonicalLiveTemplateVersion/)
assert.match(api, /\.eq\('id', liveVersionId\)/)
assert.match(api, /normalizeText\(version\.status\)\.toLowerCase\(\) !== 'published'/)
assert.match(api, /without using a fallback template/i)
assert.match(api, /export async function rollbackCanonicalOtpVersion/)
assert.match(api, /client\.rpc\('rollback_canonical_otp_version'/)

assert.match(settings, /buildCanonicalOtpRecoveryReadiness/)
assert.match(settings, /await rollbackCanonicalOtpVersion/)
assert.match(settings, /Existing generated documents were not changed/i)

assert.match(packetService, /resolved_live_version_id \|\| effectiveTemplate\?\.template_version_id/)
assert.match(packetService, /templateVersionId,/)
assert.match(packetService, /templateContentHash/)

console.log('Canonical OTP Phase 7 recovery and exact-version generation checks passed.')
