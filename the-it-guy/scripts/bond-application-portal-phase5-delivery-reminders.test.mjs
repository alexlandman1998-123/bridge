import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(here, '..')
const repoRoot = path.resolve(appRoot, '..')
const migration = await readFile(path.join(repoRoot, 'supabase/migrations/20260905101931_bond_application_portal_phase5_delivery_reminders.sql'), 'utf8')
const api = await readFile(path.join(appRoot, 'src/lib/api.js'), 'utf8')
const page = await readFile(path.join(appRoot, 'src/pages/bond/BondApplicationActionCentrePage.jsx'), 'utf8')
const dispatcher = await readFile(path.join(repoRoot, 'supabase/functions/send-email/handlers/notificationReminderDispatch.ts'), 'utf8')

assert.match(migration, /bond_application_portal_delivery_events/)
assert.match(migration, /bond_application_portal_completion_reminder/)
assert.match(migration, /bridge_send_bond_application_portal_delivery_for_originator/)
assert.match(migration, /bridge_queue_bond_application_portal_reminders_phase5/)
assert.match(migration, /\(1, 1\), \(2, 3\), \(3, 7\)/)
assert.match(migration, /application\.status not in \('submitted', 'cancelled'\)/)
assert.match(migration, /new\.payload_json := new\.payload_json - 'accessToken'/)
assert.match(migration, /assigned_to_profile_id = \(select auth\.uid\(\)\)/)
assert.match(api, /export async function sendBondApplicationPortalDeliveryForOriginator/)
assert.match(api, /export async function fetchBondApplicationPortalDeliveryActionCentre/)
assert.match(page, /Email link/)
assert.match(page, /Delivery history/)
assert.match(dispatcher, /"bond_application_portal_completion_reminder"/)
assert.match(dispatcher, /bondApplicationAccessToken/)
assert.match(dispatcher, /bridge_queue_bond_application_portal_reminders_phase5/)

console.log('Bond application portal Phase 5 delivery and reminder checks passed.')
