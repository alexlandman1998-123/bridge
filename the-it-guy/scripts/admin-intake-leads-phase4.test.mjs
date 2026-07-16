import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)
const repoRoot = new URL('../../', import.meta.url)
const readApp = (path) => readFile(new URL(path, appRoot), 'utf8')
const [migration, api, service, page, governance] = await Promise.all([
  readFile(new URL('supabase/migrations/202607160005_admin_intake_lead_governance_phase4.sql', repoRoot), 'utf8'),
  readApp('server/services/publicDemoEnquiriesApi.js'),
  readApp('src/services/adminIntakeLeadService.js'),
  readApp('src/pages/PlatformLeadsPage.jsx'),
  readApp('src/components/platform/leads/LeadGovernancePanel.jsx'),
])

assert.match(migration, /create table if not exists public\.demo_enquiry_activity_events/, 'Phase 4 needs a dedicated lead event ledger')
assert.match(migration, /after update on public\.demo_enquiries/, 'Workflow changes must be captured by a database trigger')
assert.match(migration, /auth\.uid\(\)/, 'Audit events must retain the authenticated actor')
assert.match(migration, /changed_fields text\[\]/, 'Audit events must record changed workflow fields')
assert.match(migration, /enable row level security/, 'The event ledger must use RLS')
assert.match(migration, /revoke all on table public\.demo_enquiry_activity_events from public, anon, authenticated/, 'The event ledger must not expose direct browser reads')
assert.match(migration, /arch9_admin_intake_lead_context_v1/, 'Admin context RPC is required')
assert.match(migration, /arch9_admin_review_intake_lead_duplicate_v1/, 'Duplicate review RPC is required')
assert.match(migration, /bridge_is_platform_admin\(\)/, 'Both RPCs must enforce platform-admin access')
assert.match(migration, /candidate\.normalized_email = v_lead\.normalized_email/, 'Candidates must match normalized email')
assert.match(migration, /candidate\.normalized_phone = v_lead\.normalized_phone/, 'Candidates must match normalized phone')
assert.match(migration, /candidate\.normalized_company = v_lead\.normalized_company/, 'Candidates must match normalized company')
assert.match(migration, /A lead cannot be its own canonical record/, 'Duplicate review must reject self-linking')
assert.match(migration, /Select the canonical lead for this duplicate/, 'Confirmed duplicates must identify the canonical lead')

assert.match(api, /action === 'review_duplicate'/, 'The admin API must route duplicate reviews explicitly')
assert.match(api, /rpc\('arch9_admin_review_intake_lead_duplicate_v1'/, 'Duplicate writes must use the guarded RPC')
assert.match(api, /rpc\('arch9_admin_intake_lead_context_v1'/, 'Governance reads must use the guarded RPC')
assert.match(api, /error\?\.code === '22023'/, 'Database validation errors must be returned as operator-safe validation responses')
assert.match(service, /getAdminIntakeLeadContext/, 'The client service must load governance context')
assert.match(service, /reviewAdminIntakeLeadDuplicate/, 'The client service must submit duplicate decisions')
assert.match(page, /<LeadGovernancePanel/, 'The Leads page must render governance controls')
assert.match(page, /reviewDuplicate/, 'The Leads page must coordinate duplicate decisions')
assert.match(governance, /Potential matches/, 'Operators need to see candidate records')
assert.match(governance, /Mark canonical/, 'Operators need a false-positive resolution')
assert.match(governance, /Confirm duplicate/, 'Operators need a confirmed-duplicate resolution')
assert.match(governance, /Mark merged/, 'Operators need a merged resolution')
assert.match(governance, /Activity/, 'Operators need an audit timeline')

console.log('Admin intake Leads Phase 4 passed')

