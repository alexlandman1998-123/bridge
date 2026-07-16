import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)
const repoRoot = new URL('../../', import.meta.url)
const readApp = (path) => readFile(new URL(path, appRoot), 'utf8')

const [migration, api, service, page, conversionPanel] = await Promise.all([
  readFile(new URL('supabase/migrations/202607160009_admin_intake_conversion_phase7.sql', repoRoot), 'utf8'),
  readApp('server/services/publicDemoEnquiriesApi.js'),
  readApp('src/services/adminIntakeLeadService.js'),
  readApp('src/pages/PlatformLeadsPage.jsx'),
  readApp('src/components/platform/leads/LeadConversionPanel.jsx'),
])

assert.match(migration, /create table if not exists public\.demo_enquiry_conversions/, 'Conversions need a durable audit record')
assert.match(migration, /enquiry_id uuid not null unique/, 'A lead must only convert once')
assert.match(migration, /arch9_admin_intake_conversion_context_v1/, 'Phase 7 needs a guarded preview contract')
assert.match(migration, /arch9_admin_convert_intake_lead_v1/, 'Phase 7 needs an atomic conversion contract')
assert.match(migration, /for update/, 'Conversion must lock the lead against races')
assert.match(migration, /sales_stage not in \('qualified', 'demo_scheduled', 'proposal', 'won'\)/, 'Only commercially qualified leads may convert')
assert.match(migration, /dedupe_status <> 'canonical'/, 'Duplicate review must complete before conversion')
assert.match(migration, /status,\s*settings_json,\s*created_by[\s\S]*?'pending'/, 'New customer organisations must start pending')
assert.doesNotMatch(migration, /insert into public\.organisation_users/, 'The Arch9 operator must not become the customer workspace owner')
assert.match(migration, /lower\(trim\(name\)\) = lower\(v_name\)/, 'Create mode must reject exact organisation duplicates')
assert.match(migration, /converted_organisation_id = v_org\.id/, 'The lead must retain its canonical organisation link')
assert.match(migration, /sales_stage = 'won'/, 'A completed handoff must close the commercial loop')
assert.match(migration, /bridge_is_platform_admin\(\)/, 'Conversion must remain admin-only')

assert.match(api, /action === 'convert_lead'/, 'The admin API must expose an explicit conversion action')
assert.match(api, /arch9_admin_convert_intake_lead_v1/, 'The API must use the atomic database conversion')
assert.match(api, /conversionContext/, 'The API must expose conversion preview context')
assert.match(service, /getAdminIntakeConversionContext/, 'The browser service needs conversion preview')
assert.match(service, /convertAdminIntakeLead/, 'The browser service needs the conversion action')
assert.match(page, /<LeadConversionPanel/, 'The Leads workspace must render conversion controls')
assert.match(page, /convertLead/, 'The Leads workspace must coordinate conversion state')
assert.match(conversionPanel, /Confirm onboarding handoff/, 'Conversion needs an explicit confirmation')
assert.match(conversionPanel, /Create new/, 'Operators must be able to create a pending organisation')
assert.match(conversionPanel, /Link existing/, 'Operators must be able to link a matched organisation')
assert.match(conversionPanel, /lead will be marked Won/, 'The UI must explain the workflow consequence')

console.log('Admin intake Leads Phase 7 passed')
