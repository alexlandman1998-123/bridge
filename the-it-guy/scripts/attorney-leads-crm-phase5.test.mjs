import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeAttorneyLeadRow } from '../src/services/attorneyLeadsService.js'

const root = new URL('../', import.meta.url)
const app = await readFile(new URL('src/App.jsx', root), 'utf8')
const roles = await readFile(new URL('src/lib/roles.js', root), 'utf8')
const sidebar = await readFile(new URL('src/components/Sidebar.jsx', root), 'utf8')
const page = await readFile(new URL('src/pages/AttorneyLeadsPage.jsx', root), 'utf8')
const service = await readFile(new URL('src/services/attorneyLeadsService.js', root), 'utf8')
const migration = await readFile(
  new URL('../../supabase/migrations/202607160003_attorney_leads_crm_phase5.sql', import.meta.url),
  'utf8',
)

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Leads is an Attorney-only workspace beside Incoming Matters with a compact page header', () => {
  assert.match(app, /const AttorneyLeadsPage = lazy/)
  assert.match(app, /path="\/attorney\/leads"[\s\S]*?<RoleRoute allowedRoles=\{\['attorney'\]\}>[\s\S]*?<AttorneyFirmRoute>[\s\S]*?<AttorneyLeadsPage \/>/)
  assert.match(roles, /label: 'Pipeline'[\s\S]*label: 'Incoming Matters'[\s\S]*label: 'Leads', to: '\/attorney\/leads'/)
  assert.match(sidebar, /attorney_leads: Users/)
  assert.doesNotMatch(page, />Pipeline<|>Leads<|Potential future work from public enquiries/)
})

test('workspace provides the Phase 5 KPIs, filters, responsive queue, and detail history', () => {
  for (const label of ['New Leads', 'Open Pipeline', 'Follow-Ups Due', 'label="Won"']) {
    assert.match(page, new RegExp(label))
  }
  for (const filter of ['Filter by stage', 'Filter by service', 'Filter by source']) {
    assert.match(page, new RegExp(filter))
  }
  for (const column of ['Date', 'Lead', 'Service Required', 'Source', 'Status', 'Assigned To', 'Last Contact', 'Next Follow-Up']) {
    assert.match(page, new RegExp(`<th>${column}</th>`))
  }
  assert.match(page, /Activity history/)
  assert.match(page, /ManualLeadDrawer/)
  assert.match(page, /LeadDetailDrawer/)
  assert.match(page, /PublicLinkDrawer/)
})

test('all CRM reads are tenant scoped and Lead-domain scoped', () => {
  assert.match(service, /from\('leads'\)[\s\S]*eq\('organisation_id', scopedOrganisationId\)[\s\S]*eq\('lead_domain', 'attorney'\)/)
  assert.match(service, /from\('contacts'\)[\s\S]*eq\('organisation_id', scopedOrganisationId\)/)
  assert.match(service, /from\('attorney_lead_details'\)[\s\S]*eq\('organisation_id', scopedOrganisationId\)/)
  assert.match(service, /from\('lead_activities'\)[\s\S]*eq\('organisation_id', scopedOrganisationId\)[\s\S]*eq\('lead_id', scopedLeadId\)/)
})

test('manual capture and lifecycle changes cross authenticated atomic commands', () => {
  assert.match(service, /rpc\('bridge_create_attorney_lead'/)
  assert.match(service, /rpc\('bridge_update_attorney_lead_lifecycle'/)
  assert.match(migration, /create or replace function public\.bridge_create_attorney_lead/)
  assert.match(migration, /create or replace function public\.bridge_update_attorney_lead_lifecycle/)
  assert.match(migration, /security definer/g)
  assert.match(migration, /bridge_attorney_lead_can_access\([\s\S]*'create'/)
  assert.match(migration, /bridge_attorney_lead_can_access\([\s\S]*'edit'/)
  assert.match(migration, /lead_domain,[\s\S]*'attorney'/)
  assert.match(migration, /insert into public\.lead_activities/)
  assert.match(migration, /pg_advisory_xact_lock/)
})

test('manual capture performs exact tenant contact matching and bounded validation', () => {
  assert.match(migration, /contact\.organisation_id = p_organisation_id/)
  assert.match(migration, /lower\(trim\(contact\.email\)\) = v_email/)
  assert.match(migration, /regexp_replace\(coalesce\(contact\.phone/)
  assert.match(migration, /Invalid Attorney Lead property value/)
  assert.match(migration, /v_priority not in \('Low', 'Medium', 'High', 'Urgent'\)/)
  assert.doesNotMatch(migration, /ilike|similarity\(/i)
})

test('public-link management is leadership-only and preserves one firm link', () => {
  assert.match(service, /rpc\('bridge_ensure_attorney_public_intake_link'/)
  assert.match(page, /permissions\.canManageFirmSettings/)
  assert.match(migration, /bridge_attorney_lead_can_access\(p_organisation_id, null, null, 'manage_link'\)/)
  assert.match(migration, /status <> 'archived'/)
  assert.match(migration, /Active Attorney firm not found/)
})

test('database commands are authenticated-only and do not mutate Incoming Matter contracts', () => {
  assert.match(migration, /revoke all on function public\.bridge_create_attorney_lead\(uuid, jsonb\) from public, anon/)
  assert.match(migration, /grant execute on function public\.bridge_create_attorney_lead\(uuid, jsonb\) to authenticated/)
  assert.match(migration, /revoke all on function public\.bridge_update_attorney_lead_lifecycle\(uuid, uuid, text, text\) from public, anon/)
  assert.doesNotMatch(migration, /transaction_attorney_assignments|attorney_instruction_responses|transactions\s+set/i)
  assert.doesNotMatch(service, /incomingMatter|transaction_attorney_assignments|attorney_instruction_responses/)
})

test('Lead normalization produces a stable UI aggregate', () => {
  const lead = normalizeAttorneyLeadRow(
    {
      lead_id: 'lead-1',
      organisation_id: 'org-1',
      stage: 'quote_sent',
      source_channel: 'Instagram Bio',
      priority: 'High',
    },
    { contact_id: 'contact-1', first_name: 'Alex', last_name: 'Smith', email: 'ALEX@example.com' },
    { service_type: 'transfer_quote', property_value: '2500000.00' },
  )
  assert.equal(lead.id, 'lead-1')
  assert.equal(lead.stage, 'quote_sent')
  assert.equal(lead.status, 'open')
  assert.equal(lead.sourceChannel, 'instagram')
  assert.equal(lead.contact.firstName, 'Alex')
  assert.equal(lead.detail.serviceType, 'transfer_quote')
  assert.equal(lead.detail.propertyValue, 2500000)
})

console.log('attorney Leads CRM Phase 5 tests passed')
