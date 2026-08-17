import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appRoot = resolve(import.meta.dirname, '..')
const repoRoot = resolve(appRoot, '..')

const packageJson = JSON.parse(readFileSync(resolve(appRoot, 'package.json'), 'utf8'))
const migration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260816092532_developer_leads_phase10_foundation.sql'),
  'utf8',
)
const statusNormalizationMigration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260816223000_developer_lead_status_normalization.sql'),
  'utf8',
)
const statusCompatibilityMigration = readFileSync(
  resolve(repoRoot, 'supabase/migrations/20260817045901_developer_lead_status_compatibility_aliases.sql'),
  'utf8',
)
const contract = readFileSync(resolve(appRoot, 'src/core/developerLeads/developerLeadContract.js'), 'utf8')
const contractTest = readFileSync(resolve(appRoot, 'src/core/developerLeads/__tests__/developerLeadContract.test.js'), 'utf8')
const service = readFileSync(resolve(appRoot, 'src/services/developerLeadService.js'), 'utf8')
const page = readFileSync(resolve(appRoot, 'src/pages/DeveloperLeadsPage.jsx'), 'utf8')
const doc = readFileSync(resolve(appRoot, 'docs/developer-leads-phase10-foundation.md'), 'utf8')
const phase5 = readFileSync(resolve(appRoot, 'scripts/developer-module-phase5-release-readiness.test.mjs'), 'utf8')
const phase6 = readFileSync(resolve(appRoot, 'scripts/developer-module-phase6-post-rollout-monitoring.mjs'), 'utf8')

const scripts = packageJson.scripts || {}

assert.equal(
  scripts['test:developer-module-phase10'],
  'node scripts/developer-leads-phase10-foundation.test.mjs && node src/core/developerLeads/__tests__/developerLeadContract.test.js',
)
assert.match(scripts['verify:developer-module'] || '', /test:developer-module-phase10/)

for (const table of [
  'developer_leads',
  'developer_lead_private_details',
  'developer_lead_development_interests',
  'developer_lead_activity',
]) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, 'i'))
  assert.match(migration, new RegExp(`alter table if exists public\\.${table} enable row level security`, 'i'))
}

for (const token of [
  "lead_owner in ('developer', 'agency')",
  "ownership_model in ('developer_direct', 'developer_assigned', 'agency_introduced')",
  "selling_model in ('developer_led', 'agent_led')",
  "visibility_state in ('full', 'limited', 'consent_pending', 'handed_over')",
  "reservation_state in ('none', 'provisional', 'reserved', 'expired', 'converted')",
  "lead_status in ('new', 'contacted', 'qualified', 'viewing', 'reserved', 'onboarding_sent', 'onboarding_submitted', 'otp', 'converted', 'lost')",
]) {
  assert.match(migration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
}

assert.match(migration, /developer_leads_agency_visibility_check/i)
assert.match(migration, /lead_owner = 'agency'[\s\S]*?visibility_state in \('limited', 'consent_pending', 'handed_over'\)/i)
assert.match(migration, /lead_owner = 'developer'[\s\S]*?visibility_state = 'full'/i)
assert.match(migration, /developer_lead_private_details_select_scoped[\s\S]*?visibility_state = 'handed_over'/i)
assert.match(migration, /source_agency_org_id is not null[\s\S]*?public\.bridge_is_active_member\(source_agency_org_id\)/i)
assert.match(migration, /primary_development_id is not null[\s\S]*?public\.bridge_can_manage_development_record\(primary_development_id\)/i)
assert.match(migration, /grant select, insert, update on table public\.developer_leads to authenticated/i)
assert.match(migration, /grant select, insert, update on table public\.developer_lead_private_details to authenticated/i)
assert.match(migration, /notify pgrst, 'reload schema'/i)
assert.equal(/\bauth\.role\s*\(/i.test(migration), false)
assert.equal(/security\s+definer/i.test(migration), false)
assert.equal(/buyer_email|buyer_phone|buyer_full_name|buyer_id_number/i.test(migration.match(/create table if not exists public\.developer_leads[\s\S]*?\);/i)?.[0] || ''), false)

for (const token of [
  'normalize_developer_lead_status_before_write',
  'trg_developer_leads_normalize_status',
  "when 'captured' then 'new'",
  "when 'lead_captured' then 'new'",
  "when 'buyer_onboarding_sent' then 'onboarding_sent'",
  "when 'signed_otp_uploaded' then 'otp'",
  "when 'transaction_created' then 'converted'",
  'before insert or update of lead_status',
  "notify pgrst, 'reload schema'",
]) {
  assert.match(statusNormalizationMigration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
}
assert.equal(/security\s+definer/i.test(statusNormalizationMigration), false)
assert.equal(/\bauth\.role\s*\(/i.test(statusNormalizationMigration), false)

for (const token of [
  'qualification_note text',
  'next_action_note text',
  "lead_status in (",
  "'captured'",
  "'buyer_onboarding_sent'",
  "'signed_otp_uploaded'",
  "notify pgrst, 'reload schema'",
]) {
  assert.match(statusCompatibilityMigration, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
}
assert.equal(/security\s+definer/i.test(statusCompatibilityMigration), false)
assert.equal(/\bauth\.role\s*\(/i.test(statusCompatibilityMigration), false)

assert.match(contract, /DEVELOPER_LEAD_PHASE10_CONTRACT/)
assert.match(contract, /DEVELOPER_LEAD_STATUS_ALIASES/)
assert.match(contract, /captured:\s*'new'/)
assert.match(contract, /signed_otp_uploaded:\s*'otp'/)
assert.match(contract, /AGENCY_FED_LIMITED_DEVELOPER_FIELDS/)
assert.match(contract, /AGENCY_FED_REDACTED_FIELDS/)
assert.match(contract, /buildDeveloperLeadAccessProfile/)
assert.match(contract, /maskDeveloperLeadForDeveloper/)
assert.match(contractTest, /normalizeDeveloperLeadStatus\('captured'\), 'new'/)
assert.match(contractTest, /developer lead Phase 10 domain contract passed/)
assert.match(service, /normalizeDeveloperLeadStatus\(value\)/)
assert.match(service, /\{ key: 'new', label: 'Captured' \}/)
assert.match(service, /qualification_note/)
assert.match(service, /next_action_note/)
assert.match(page, /Qualification note/)
assert.match(page, /Next action/)
assert.match(page, /Save & Mark Qualified/)

for (const pattern of [
  /Developer Leads Phase 10 Foundation/i,
  /developer_direct/i,
  /developer_assigned/i,
  /agency_introduced/i,
  /multi-development/i,
  /private buyer details/i,
  /visibility_state = 'handed_over'/i,
  /must not expose/i,
]) {
  assert.match(doc, pattern)
}

assert.match(phase5, /test:developer-module-phase10/)
assert.match(phase6, /test:developer-module-phase10/)

console.log(JSON.stringify({
  version: 'developer_leads_phase10_foundation_v1',
  ready: true,
  coveredSurfaces: [
    'developer lead ownership model',
    'developer-led versus agent-led selling model',
    'agency-fed limited visibility',
    'private buyer detail separation',
    'multi-development interest model',
    'reservation state foundation',
    'RLS and Data API grants',
  ],
}, null, 2))
