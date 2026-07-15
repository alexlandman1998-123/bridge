import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const serviceSource = readFileSync(new URL('../src/services/attorneyFirms.js', import.meta.url), 'utf8')
const migrationSource = readFileSync(
  new URL('../../supabase/migrations/202607150003_attorney_organisation_onboarding_phase2.sql', import.meta.url),
  'utf8',
)

assert.match(migrationSource, /create or replace function public\.bridge_complete_attorney_firm_onboarding_v2\(payload jsonb\)/)
assert.match(migrationSource, /security definer/)
assert.match(migrationSource, /pg_advisory_xact_lock/)
assert.match(migrationSource, /alter table if exists public\.organisations[\s\S]*vat_number text/)
assert.match(migrationSource, /alter table if exists public\.organisations[\s\S]*logo_dark_url text/)
assert.match(migrationSource, /alter table if exists public\.organisations[\s\S]*primary_colour text/)

for (const table of [
  'attorney_firms',
  'attorney_firm_members',
  'attorney_firm_branding',
  'organisations',
  'organisation_settings',
  'attorney_firm_departments',
  'profiles',
  'onboarding_states',
  'workspace_onboarding_completions',
  'onboarding_events',
]) {
  assert.match(migrationSource, new RegExp(`public\\.${table}`), `Atomic onboarding must persist ${table}.`)
}

for (const canonicalColumn of [
  'registration_number',
  'vat_number',
  'company_email',
  'company_phone',
  'website',
  'address_line_1',
  'address_line_2',
  'logo_url',
  'logo_dark_url',
  'primary_colour',
  'secondary_colour',
]) {
  assert.match(migrationSource, new RegExp(`${canonicalColumn} =`), `Organisation sync must write ${canonicalColumn}.`)
}

assert.doesNotMatch(migrationSource, /attorney_firm_invitations|inviteAttorneyFirmMember/)
assert.match(migrationSource, /revoke all on function[\s\S]*from public/)
assert.match(migrationSource, /grant execute on function[\s\S]*to authenticated/)

const rpcCallIndex = serviceSource.indexOf("client.rpc(rpcName")
const legacyCallIndex = serviceSource.indexOf('completeAttorneyFirmOnboardingLegacy({', rpcCallIndex)
const inviteCallIndex = serviceSource.indexOf('inviteAttorneyFirmMember({', rpcCallIndex)
assert.ok(rpcCallIndex > -1, 'The frontend must call the Phase 2 RPC.')
assert.ok(legacyCallIndex > rpcCallIndex, 'The legacy write path must only follow an RPC attempt.')
assert.ok(inviteCallIndex > legacyCallIndex, 'Invitations must run after core workspace completion.')
assert.match(serviceSource, /if \(!isMissingRpcError\(error, 'bridge_complete_attorney_firm_onboarding_v2'\)\) throw error/)

console.log('attorney organisation Phase 2 atomic onboarding contracts passed')
