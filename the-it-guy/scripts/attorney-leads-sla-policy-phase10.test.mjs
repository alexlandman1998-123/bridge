import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { getAttorneyLeadSlaSettings, updateAttorneyLeadSlaSettings } from '../src/services/attorneyLeadsService.js'

const root = new URL('../', import.meta.url)
const migration = await readFile(new URL('../../supabase/migrations/202607160009_attorney_lead_sla_policy_phase10.sql', import.meta.url), 'utf8')
const page = await readFile(new URL('src/pages/AttorneyLeadsPage.jsx', root), 'utf8')
const notes = await readFile(new URL('docs/attorney-public-intake-leads-phase-10-notes.md', root), 'utf8')

function test(name, fn) {
  try {
    return Promise.resolve(fn()).then(() => console.log(`ok - ${name}`))
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

await test('one tenant-consistent Attorney Lead SLA policy owns firm operations', () => {
  assert.match(migration, /create table if not exists public\.attorney_lead_sla_settings/)
  assert.match(migration, /organisation_id uuid primary key/)
  assert.match(migration, /foreign key \(attorney_firm_id, organisation_id\)[\s\S]*references public\.attorney_firms\(id, organisation_id\)/)
  assert.match(migration, /on conflict \(organisation_id\) do nothing/)
})

await test('policy bounds every duration and validates operating windows', () => {
  assert.match(migration, /first_contact_sla_hours between 1 and 168/)
  assert.match(migration, /follow_up_grace_minutes between 0 and 1440/)
  assert.match(migration, /escalation_after_hours between 1 and 168/)
  assert.match(migration, /business_days <@ array\[1,2,3,4,5,6,7\]/)
  assert.match(migration, /business_hours_start < business_hours_end/)
  assert.match(migration, /pg_timezone_names/)
})

await test('settings are readable by firm members and mutable only through leadership command', () => {
  assert.match(migration, /create policy attorney_lead_sla_settings_select/)
  assert.match(migration, /bridge_attorney_lead_can_access\(organisation_id, null, null, 'view_link'\)/)
  assert.match(migration, /revoke all on table public\.attorney_lead_sla_settings from public, anon, authenticated/)
  assert.match(migration, /grant select on table public\.attorney_lead_sla_settings to authenticated/)
  assert.match(migration, /bridge_attorney_lead_can_access\(p_organisation_id, null, null, 'manage_link'\)/)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all) on table public\.attorney_lead_sla_settings to authenticated/i)
})

await test('escalation recipients must be active same-firm leadership', () => {
  assert.match(migration, /Escalation recipient must be active Attorney firm leadership/)
  assert.match(migration, /member\.organisation_id = p_organisation_id/)
  assert.match(migration, /member\.firm_id = v_firm_id/)
  assert.match(migration, /'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner', 'branch_manager'/)
})

await test('Phase 9 sweep is upgraded for policy timing, quiet hours, and escalation', () => {
  assert.match(migration, /create or replace function public\.bridge_queue_attorney_lead_follow_up_reminders/)
  assert.match(migration, /make_interval\(mins => lead\.follow_up_grace_minutes\)/)
  assert.match(migration, /make_interval\(hours => lead\.first_contact_sla_hours\)/)
  assert.match(migration, /first_contact_sla_hours \+ lead\.escalation_after_hours/)
  assert.match(migration, /extract\(isodow from p_now at time zone configured\.timezone_name\)/)
  assert.match(migration, /configured\.quiet_hours_enabled = false/)
  assert.match(migration, /attorney_lead_first_contact_escalated/)
  assert.match(migration, /policy_version', 'attorney_lead_sla_v1'/)
  assert.match(migration, /where row\([\s\S]*is distinct from row\(/)
})

await test('service reads and writes normalized SLA policy through dedicated RPCs', async () => {
  const calls = []
  const client = { rpc: async (name, args) => {
    calls.push({ name, args })
    return { data: { reminders_enabled: true, first_contact_sla_hours: 12, follow_up_grace_minutes: 30, escalation_enabled: true, escalation_after_hours: 3, timezone_name: 'Africa/Johannesburg', business_days: [1, 2, 3, 4, 5], business_hours_start: '08:00', business_hours_end: '17:00', quiet_hours_enabled: true }, error: null }
  } }
  const loaded = await getAttorneyLeadSlaSettings({ organisationId: 'org-1', client })
  assert.equal(loaded.firstContactSlaHours, 12)
  const saved = await updateAttorneyLeadSlaSettings({ organisationId: 'org-1', values: loaded, client })
  assert.equal(saved.escalationAfterHours, 3)
  assert.deepEqual(calls.map((call) => call.name), ['bridge_get_attorney_lead_sla_settings', 'bridge_update_attorney_lead_sla_settings'])
  assert.equal(calls[1].args.p_payload.first_contact_sla_hours, 12)
})

await test('workspace exposes policy management and policy-aware SLA visibility', () => {
  assert.match(page, /Lead SLA & Escalation/)
  assert.match(page, /SLA policy/)
  assert.match(page, /BUSINESS_DAY_OPTIONS/)
  assert.match(page, /firstContactSlaHours/)
  assert.match(page, /quietHoursEnabled/)
  assert.match(page, /permissions\.canManageFirmSettings/)
  assert.match(page, /isFirstContactOverdue\(lead, firstContactSlaHours\)/)
  assert.match(page, /isFollowUpDue\(lead\.nextFollowUpAt, followUpGraceMinutes\)/)
})

await test('Phase 10 remains internal and preserves product boundaries', () => {
  assert.match(notes, /does not change Lead lifecycle rules, Incoming Matters, external messaging, or assignment/)
  assert.doesNotMatch(migration, /transaction_attorney_assignments|attorney_instruction_responses|send-email|whatsapp|sms/i)
})

console.log('attorney Leads SLA policy Phase 10 tests passed')
