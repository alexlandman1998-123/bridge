import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../supabase/migrations/20260831144853_repair_active_user_facing_rls_gaps.sql', import.meta.url),
  'utf8',
)
const settingsApi = await readFile(
  new URL('../the-it-guy/src/lib/settingsApi.js', import.meta.url),
  'utf8',
)
const api = await readFile(
  new URL('../the-it-guy/src/lib/api.js', import.meta.url),
  'utf8',
)

const expectedPolicies = [
  'appointment_resources_member_read',
  'billing_invoices_admin_read',
  'client_portal_notifications_token_read',
  'client_portal_notifications_token_create',
  'client_portal_notifications_token_update',
  'organisation_preferred_partners_member_read',
  'transaction_financial_records_participant_read',
  'transaction_financial_records_attorney_create',
  'transaction_financial_records_attorney_update',
]

for (const policyName of expectedPolicies) {
  assert.match(migration, new RegExp(`create policy ${policyName}\\b`), `missing ${policyName}`)
}

assert.match(migration, /appointment_resources_member_read[\s\S]*bridge_is_active_member\(organisation_id\)/)
assert.match(migration, /billing_invoices_admin_read[\s\S]*bridge_is_org_admin\(organisation_id\)/)
assert.match(
  migration,
  /client_portal_notifications_token_read[\s\S]*visibility = 'client_visible'[\s\S]*bridge_has_client_portal_token_transaction_access/,
)
assert.match(
  migration,
  /transaction_financial_records_participant_read[\s\S]*bridge_has_transaction_access\(transaction_id\)/,
)
assert.match(
  migration,
  /transaction_financial_records_attorney_(?:create|update)[\s\S]*bridge_attorney_can_manage_transaction\(transaction_id\)/,
)
assert.doesNotMatch(migration, /create policy[^;]+for delete/is)
assert.doesNotMatch(migration, /(?:using|with check)\s*\(\s*true\s*\)/i)

assert.match(settingsApi, /async function savePreferredPartnerViaCanonicalRpc/)
assert.match(settingsApi, /client\.rpc\('bridge_save_organisation_partner'/)
assert.match(settingsApi, /\.eq\('is_active', true\)/)
assert.match(
  settingsApi,
  /hasExistingPartner \? normalizedInput : \{ \.\.\.normalizedInput, id: '' \}/,
  'new preferred partners must not send an unpersisted client UUID to the canonical RPC',
)
assert.match(
  settingsApi,
  /savePreferredPartnerViaCanonicalRpc\([\s\S]*isActive: false,[\s\S]*isPreferredDefault: false/,
)

const developerDefaultFunction =
  api.match(/export async function setDeveloperPartnerDefault[\s\S]*?\n}\n\nexport async function setDeveloperCanonicalPartnerDefault/)?.[0] || ''
assert.match(developerDefaultFunction, /return setDeveloperCanonicalPartnerDefault\(/)
assert.doesNotMatch(developerDefaultFunction, /\.from\('organisation_preferred_partners'\)/)

console.log('Active user-facing RLS repair contract passed.')
