import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const reconciliation = await readFile(
  new URL('../../supabase/migrations/202607140026_phase8_notification_automation_security_reconciliation.sql', import.meta.url),
  'utf8',
)

assert.match(reconciliation, /insert into public\.transaction_notifications[\s\S]*transaction_id,[\s\S]*user_id,[\s\S]*role_type,[\s\S]*notification_type/i)
assert.match(reconciliation, /values \(\s*p_transaction_id,\s*p_recipient_user_id,\s*v_role,\s*'participant_assigned'/i)
assert.doesNotMatch(reconciliation, /p_transaction_id,\s*p_recipient_user_id,\s*p_recipient_user_id,\s*v_role/i)
assert.match(reconciliation, /revoke all on table public\.notification_events from public, anon, authenticated/i)
assert.match(reconciliation, /grant select on table public\.notification_events to authenticated/i)
assert.doesNotMatch(reconciliation, /grant select, insert, update on table public\.notification_events to authenticated/i)
assert.match(reconciliation, /bridge_queue_notification_reminder_events_phase6\(integer, timestamptz, boolean, boolean\)[\s\S]*to service_role/i)
assert.match(reconciliation, /bridge_notification_automation_health_phase6\(uuid, timestamptz\)[\s\S]*to authenticated, service_role/i)
assert.doesNotMatch(reconciliation, /bridge_record_transaction_partner_invite_accepted_notification_phase2\(uuid, uuid, text\) to authenticated/i)
assert.match(reconciliation, /bridge_notification_automation_set_updated_at\(\) from public, anon, authenticated, service_role/i)

console.log('Notification automation database reconciliation checks passed.')
