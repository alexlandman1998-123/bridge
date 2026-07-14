import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const foundation = await readFile(
  new URL('../../supabase/migrations/202607140024_phase7_referral_foundation.sql', import.meta.url),
  'utf8',
)
const reconciliation = await readFile(
  new URL('../../supabase/migrations/202607140025_phase7_developer_referral_security_reconciliation.sql', import.meta.url),
  'utf8',
)
const referralSqlMirror = await readFile(
  new URL('../sql/20260704_lead_referrals.sql', import.meta.url),
  'utf8',
)

for (const table of [
  'lead_referrals', 'referral_clients', 'referral_agreements',
  'referral_status_events', 'referral_invites', 'referral_commission_events',
]) {
  assert.match(foundation, new RegExp(`create table if not exists public\\.${table}`, 'i'))
}
assert.doesNotMatch(foundation, /references public\.crm_deals/i)
assert.doesNotMatch(referralSqlMirror, /references public\.crm_deals/i)
assert.match(reconciliation, /developer organisation cannot be changed/i)
assert.match(reconciliation, /partner organisation cannot be changed after binding/i)
assert.match(reconciliation, /bridge_get_developer_partner_invitation\(text\)[\s\S]*set search_path = public, extensions/i)
assert.match(reconciliation, /revoke all on table public\.lead_referrals from public, anon/i)
assert.match(reconciliation, /revoke all on function public\.bridge_accept_developer_partner_invitation\(text, text, text, uuid\) from public, anon, authenticated, service_role/i)
assert.match(reconciliation, /grant execute on function public\.bridge_accept_developer_partner_invitation\(text, text, text, uuid\) to authenticated, service_role/i)
assert.doesNotMatch(reconciliation, /grant execute on function public\.bridge_accept_developer_partner_invitation\(text, text, text, uuid\) to anon/i)
assert.match(reconciliation, /grant execute on function public\.bridge_respond_referral_invite\(text, text, text, text, text\) to anon, authenticated, service_role/i)
assert.doesNotMatch(reconciliation, /grant execute on function public\.bridge_respond_referral_terms\(uuid, text, text, text, jsonb\) to anon/i)
assert.match(reconciliation, /bridge_referral_status_event_to_lead_activity\(\) from public, anon, authenticated, service_role/i)

console.log('Developer/referral database reconciliation checks passed.')
