import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const migration = await readFile(new URL('../../supabase/migrations/202607160008_attorney_lead_notifications_sla_phase9.sql', import.meta.url), 'utf8')
const page = await readFile(new URL('src/pages/AttorneyLeadsPage.jsx', root), 'utf8')
const header = await readFile(new URL('src/components/HeaderBar.jsx', root), 'utf8')
const notes = await readFile(new URL('docs/attorney-public-intake-leads-phase-9-notes.md', root), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Phase 9 registers canonical in-app automation definitions', () => {
  for (const key of [
    'attorney_lead_created',
    'attorney_lead_assigned',
    'attorney_lead_follow_up_due',
    'attorney_lead_first_contact_overdue',
  ]) assert.match(migration, new RegExp(`'${key}'`))
  assert.match(migration, /notification_automation_definitions/)
  assert.match(migration, /array\['in_app'\]/)
  assert.doesNotMatch(migration, /array\['email'\]|send-email|send_email|whatsapp|sms/i)
})

test('Lead events use the canonical audit ledger and existing in-app bell', () => {
  assert.match(migration, /bridge_record_notification_event_phase2/)
  assert.match(migration, /bridge_insert_invite_accepted_transaction_notification_phase2/)
  assert.match(migration, /'actionRoute', '\/attorney\/leads'/)
  assert.match(migration, /'notificationDomain', 'attorney_lead'/)
  assert.match(header, /eventData\?\.actionRoute/)
})

test('Lead bell access is recipient-only and derived from the visible parent Lead', () => {
  assert.match(migration, /create policy attorney_lead_notifications_select_phase9/)
  assert.match(migration, /create policy attorney_lead_notifications_update_phase9/)
  assert.match(migration, /transaction_id is null/)
  assert.match(migration, /user_id = auth\.uid\(\)/)
  assert.match(migration, /event_data ->> 'notificationDomain' = 'attorney_lead'/)
  assert.match(migration, /bridge_attorney_lead_can_access\([\s\S]*'view'/)
  assert.doesNotMatch(migration, /for (?:select|update) to (?:public|anon)/i)
})

test('recipient resolution prefers the owner and falls back to active firm leadership', () => {
  assert.match(migration, /p_preferred_user_id/)
  assert.match(migration, /member\.user_id = p_preferred_user_id/)
  assert.match(migration, /'owner', 'principal', 'partner', 'director', 'firm_admin', 'director_partner'/)
  assert.match(migration, /attorney_firm_members/)
  assert.match(migration, /join public\.profiles profile/)
})

test('creation and reassignment notifications are trigger-driven and deduplicated', () => {
  assert.match(migration, /after insert or update of assigned_user_id on public\.leads/)
  assert.match(migration, /new\.lead_domain <> 'attorney'/)
  assert.match(migration, /attorney_lead_created:' \|\| new\.lead_id/)
  assert.match(migration, /new\.assigned_user_id is distinct from old\.assigned_user_id/)
  assert.match(migration, /attorney_lead_assigned:' \|\| new\.lead_id[\s\S]*new\.assigned_user_id/)
})

test('reminder sweep covers due follow-ups and the 24-hour first-contact SLA', () => {
  assert.match(migration, /bridge_queue_attorney_lead_follow_up_reminders/)
  assert.match(migration, /lead\.next_follow_up_at <= p_now/)
  assert.match(migration, /lead\.created_at <= p_now - interval '24 hours'/)
  assert.match(migration, /lead\.first_contacted_at is null/)
  assert.match(migration, /lead\.status = 'open'/)
  assert.match(migration, /not exists \([\s\S]*public\.notification_events event[\s\S]*event\.dedupe_key = due\.dedupe_key/)
})

test('reminder execution is bounded and service-role only', () => {
  assert.match(migration, /p_limit < 1 or p_limit > 500/)
  assert.match(migration, /limit p_limit/)
  assert.match(migration, /revoke all on function public\.bridge_queue_attorney_lead_follow_up_reminders\(integer, timestamptz\) from public, anon, authenticated/)
  assert.match(migration, /grant execute on function public\.bridge_queue_attorney_lead_follow_up_reminders\(integer, timestamptz\) to service_role/)
})

test('Leads workspace exposes first-contact SLA visibility and attention filtering', () => {
  assert.match(page, /function isFirstContactOverdue/)
  assert.match(page, /First Contact SLA/)
  assert.match(page, /first_contact_overdue/)
  assert.match(page, /First contact overdue/)
  assert.match(page, /follow_up_due/)
})

test('Phase 9 remains internal and preserves Incoming Matters', () => {
  assert.match(notes, /No email, SMS, WhatsApp/)
  assert.match(notes, /Incoming Matters is unchanged/)
  assert.doesNotMatch(migration, /transaction_attorney_assignments|attorney_instruction_responses|submit_attorney_public_intake/)
})

console.log('attorney Leads notifications and SLA Phase 9 tests passed')
