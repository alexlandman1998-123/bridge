import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migrationSource = readFileSync(
  new URL('../../supabase/migrations/202607150004_attorney_organisation_reconciliation_phase3.sql', import.meta.url),
  'utf8',
)
const reporterSource = readFileSync(
  new URL('./report-attorney-organisation-drift.mjs', import.meta.url),
  'utf8',
)
const settingsApiSource = readFileSync(new URL('../src/lib/settingsApi.js', import.meta.url), 'utf8')
const settingsPageSource = readFileSync(
  new URL('../src/pages/settings/SettingsOrganisationPage.jsx', import.meta.url),
  'utf8',
)
const attorneySettingsSource = readFileSync(
  new URL('../src/core/organisations/attorneyOrganisationSettings.js', import.meta.url),
  'utf8',
)

assert.match(migrationSource, /create or replace function public\.bridge_reconcile_attorney_firm_organisation/)
assert.match(migrationSource, /security definer/)
assert.match(migrationSource, /pg_advisory_xact_lock/)
assert.match(migrationSource, /bridge_ensure_attorney_firm_organisation\(target_firm_id\)/)

for (const field of [
  'registration_number',
  'vat_number',
  'company_phone',
  'website',
  'address_line_1',
  'address_line_2',
  'city',
  'province',
  'postal_code',
  'logo_url',
  'logo_dark_url',
  'primary_colour',
  'secondary_colour',
]) {
  assert.match(
    migrationSource,
    new RegExp(`${field} = coalesce\\(nullif\\(trim\\(${field}\\), ''\\),`),
    `Reconciliation must preserve a populated canonical ${field}.`,
  )
}

assert.match(
  migrationSource,
  /company_email = coalesce\(nullif\(lower\(trim\(company_email\)\), ''\),/,
  'Reconciliation must preserve a populated canonical company_email.',
)

assert.match(migrationSource, /update public\.attorney_firms[\s\S]*website = v_org\.website/)
assert.match(migrationSource, /insert into public\.attorney_firm_branding[\s\S]*v_org\.logo_dark_url/)
assert.match(migrationSource, /for firm_record in[\s\S]*select id from public\.attorney_firms[\s\S]*bridge_reconcile_attorney_firm_organisation/)
assert.match(migrationSource, /create trigger organisations_sync_attorney_identity_to_legacy/)
assert.match(migrationSource, /on public\.organisations[\s\S]*bridge_sync_attorney_organisation_to_legacy_firm/)
assert.doesNotMatch(migrationSource, /on public\.attorney_firms[\s\S]*bridge_reconcile_attorney_firm_organisation/)
assert.match(migrationSource, /revoke all on function public\.bridge_reconcile_attorney_firm_organisation\(uuid\) from public/)
assert.match(migrationSource, /grant execute on function public\.bridge_reconcile_attorney_firm_organisation\(uuid\) to authenticated/)

assert.match(reporterSource, /--fail-on-drift/)
assert.match(reporterSource, /vat_number[\s\S]*logo_dark_url[\s\S]*primary_colour/)
assert.match(settingsApiSource, /vat_number: normalizeNullableText\(input\.vatNumber\)/)
assert.match(settingsApiSource, /logo_dark_url: normalizeNullableText\(input\.logoDarkUrl\)/)
assert.match(settingsApiSource, /primary_colour: normalizeNullableText\(input\.primaryColour\)/)
assert.match(settingsApiSource, /organisationResult\.error[\s\S]*isMissingColumnError/)
assert.match(settingsPageSource, /function getCanonicalOrganisationSettingsInput/)
assert.match(attorneySettingsSource, /brandColours\.primary[\s\S]*organisation\.primaryColour/)
assert.match(settingsPageSource, /updateOrganisationSettings\(getCanonicalOrganisationSettingsInput\(state\)\)/)

console.log('attorney organisation Phase 3 reconciliation contracts passed')
