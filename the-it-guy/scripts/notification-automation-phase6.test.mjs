import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOTIFICATION_AUTOMATION_DEFINITIONS } from '../src/services/notificationAutomationContract.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')

const migrationPath = path.join(
  workspaceRoot,
  'supabase/migrations/202607060004_notification_automation_phase6_premium_controls.sql',
)
const handlerPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/handlers/notificationReminderDispatch.ts',
)
const edgeContractPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/services/notificationAutomationContract.ts',
)
const servicePath = path.join(
  appRoot,
  'src/services/notificationAutomationOperationsService.js',
)
const diagnosticsPagePath = path.join(appRoot, 'src/pages/PlatformDiagnosticsPage.jsx')

const migration = fs.readFileSync(migrationPath, 'utf8')
const handler = fs.readFileSync(handlerPath, 'utf8')
const edgeContract = fs.readFileSync(edgeContractPath, 'utf8')
const service = fs.readFileSync(servicePath, 'utf8')
const diagnosticsPage = fs.readFileSync(diagnosticsPagePath, 'utf8')

const reminderKeys = [
  'buyer_onboarding_reminder',
  'seller_onboarding_reminder',
  'attorney_invite_reminder',
  'bond_originator_invite_reminder',
  'agent_invite_reminder',
]

for (const key of reminderKeys) {
  assert.ok(migration.includes(`'${key}'`), `phase 6 migration should reference ${key}`)
}

for (const expectedSql of [
  'phase_6_premium_controls',
  'bridge_queue_notification_reminder_events_phase6',
  'bridge_notification_automation_health_phase6',
  'p_respect_quiet_hours boolean default true',
  'dynamicCadence',
  'quietHoursAware',
  'quietHoursDeferredCount',
  'premiumControls',
  'reminderPolicies',
  'premium_reminder_controls_missing',
  'grant execute on function public.bridge_queue_notification_reminder_events_phase6(integer, timestamptz, boolean, boolean) to service_role',
  'grant execute on function public.bridge_notification_automation_health_phase6(uuid, timestamptz) to authenticated, service_role',
]) {
  assert.ok(migration.includes(expectedSql), `phase 6 migration missing ${expectedSql}`)
}

for (const expectedHandler of [
  'bridge_queue_notification_reminder_events_phase6',
  'bridge_queue_notification_reminder_events_phase3',
  'isMissingPhase6QueueRpc',
  'phase6Fallback',
  'p_respect_quiet_hours: true',
  'asRecord(queued.data).success === false',
]) {
  assert.ok(handler.includes(expectedHandler), `phase 6 dispatch handler missing ${expectedHandler}`)
}

for (const expectedContract of [
  'reminderPolicy',
  'quietHours',
  'Africa/Johannesburg',
  'escalation',
  'afterDay: 9',
]) {
  assert.ok(edgeContract.includes(expectedContract), `edge contract missing ${expectedContract}`)
}

for (const expectedService of [
  'bridge_notification_automation_health_phase6',
  'bridge_notification_automation_health_phase5',
  'premiumControls',
  'reminderPolicies',
  'missingControls',
  'response?.data?.ok === false',
]) {
  assert.ok(service.includes(expectedService), `phase 6 operations service missing ${expectedService}`)
}

for (const expectedPage of [
  'Premium controls',
  'Premium reminder controls',
  'Quiet-hour deferred',
  'Cadence policies',
  'Escalations',
  'notificationReminderPolicies',
]) {
  assert.ok(diagnosticsPage.includes(expectedPage), `diagnostics page missing ${expectedPage}`)
}

const reminderDefinitions = NOTIFICATION_AUTOMATION_DEFINITIONS.filter((definition) =>
  reminderKeys.includes(definition.key)
)
assert.equal(reminderDefinitions.length, reminderKeys.length, 'app contract should expose all reminder policies')

for (const definition of reminderDefinitions) {
  assert.deepEqual(definition.reminderPolicy?.cadenceDays, [2, 5, 9], `${definition.key} cadence should remain premium baseline`)
  assert.equal(definition.reminderPolicy?.quietHours?.enabled, true, `${definition.key} should enable quiet hours`)
  assert.equal(definition.reminderPolicy?.quietHours?.timezone, 'Africa/Johannesburg', `${definition.key} should use ZA quiet-hour timezone`)
  assert.equal(definition.reminderPolicy?.escalation?.enabled, true, `${definition.key} should enable escalation`)
  assert.equal(definition.reminderPolicy?.escalation?.afterDay, 9, `${definition.key} escalation should align with final cadence day`)
}

console.log('notification automation phase 6 premium controls checks passed')
