import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

async function read(path) {
  return fs.readFile(new URL(path, import.meta.url), 'utf8')
}

function includes(source, marker, message) {
  assert.ok(source.includes(marker), message || `Expected source to include ${marker}`)
}

const migration = await read('../../supabase/migrations/202606100002_commercial_organisation_modules_phase3.sql')
for (const marker of [
  'create table if not exists public.organisation_modules',
  'module_key text not null',
  'status text not null default',
  'source text not null default',
  'organisation_modules_unique_module unique (organisation_id, module_key)',
  "module_key in ('commercial')",
  "status in ('active', 'requested', 'disabled')",
  'settings_backfill',
  'organisation_modules_select_members',
  'organisation_modules_insert_admins',
  'public.bridge_is_org_admin(organisation_id)',
  'grant select, insert, update, delete on public.organisation_modules to authenticated',
]) {
  includes(migration, marker, `Commercial organisation module migration should include ${marker}`)
}

const commercialApi = await read('../src/modules/commercial/services/commercialApi.js')
for (const marker of [
  'export async function getCommercialOrganisationModuleStatus',
  'commercial organisation module entitlement',
  'organisationCommercialEnabled',
  'memberHasCommercialAccess',
  'organisationCommercialEnabled && memberHasCommercialAccess',
  'Commercial is not enabled for this workspace. Ask your principal to enable Commercial',
]) {
  includes(commercialApi, marker, `Commercial access gate should include organisation module marker ${marker}`)
}

const layout = await read('../src/modules/commercial/components/CommercialLayout.jsx')
for (const marker of [
  'organisation_module_disabled',
  'Commercial is not enabled for this workspace',
  'Ask your principal to enable Commercial for the organisation first.',
  'canSelfActivateCommercial',
]) {
  includes(layout, marker, `Commercial layout should explain organisation module state ${marker}`)
}

const settingsApi = await read('../src/lib/settingsApi.js')
for (const marker of [
  'buildCommercialOrganisationModuleMetadata',
  'activateCommercialOrganisationModuleForAgencySignup',
  ".from('organisation_modules')",
  "module_key: 'commercial'",
  "source: 'signup'",
  'commercialModuleActivation',
  'Commercial entitlement setup is not installed on this environment',
]) {
  includes(settingsApi, marker, `Commercial signup should persist organisation module state ${marker}`)
}

console.log('commercial signup phase 3 diagnostics passed')
