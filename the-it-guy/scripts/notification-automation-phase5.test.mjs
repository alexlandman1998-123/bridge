import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')

const migrationPath = path.join(
  workspaceRoot,
  'supabase/migrations/202607060003_notification_automation_phase5_observability.sql',
)
const servicePath = path.join(
  appRoot,
  'src/services/notificationAutomationOperationsService.js',
)
const diagnosticsPagePath = path.join(appRoot, 'src/pages/PlatformDiagnosticsPage.jsx')

const migration = fs.readFileSync(migrationPath, 'utf8')
const service = fs.readFileSync(servicePath, 'utf8')
const diagnosticsPage = fs.readFileSync(diagnosticsPagePath, 'utf8')

const automationKeys = [
  'buyer_onboarding_sent',
  'seller_onboarding_sent',
  'buyer_portal_sent',
  'seller_portal_sent',
  'attorney_invite_sent',
  'bond_originator_invite_sent',
  'agent_invite_sent',
  'buyer_onboarding_submitted',
  'seller_onboarding_submitted',
  'attorney_invite_accepted',
  'bond_originator_invite_accepted',
  'agent_invite_accepted',
  'buyer_onboarding_reminder',
  'seller_onboarding_reminder',
  'attorney_invite_reminder',
  'bond_originator_invite_reminder',
  'agent_invite_reminder',
]

for (const key of automationKeys) {
  assert.ok(migration.includes(`'${key}'`), `phase 5 migration should reference ${key}`)
}

for (const expectedSql of [
  'phase_5_observability',
  'bridge_notification_automation_health_phase5',
  'security definer',
  'public.bridge_is_active_member',
  'countsByStatus',
  'countsByCategory',
  'countsByAutomation',
  'recentEvents',
  'recentFailures',
  'recentRuns',
  'planned_automations_remaining',
  'stale_processing_reminders',
  'failed_reminders',
  'queued_reminders_pending_dispatch',
  'grant execute on function public.bridge_notification_automation_health_phase5(uuid, timestamptz) to authenticated, service_role',
]) {
  assert.ok(migration.includes(expectedSql), `phase 5 migration missing ${expectedSql}`)
}

for (const expectedService of [
  'getNotificationAutomationHealth',
  'dispatchNotificationReminders',
  'bridge_notification_automation_health_phase5',
  'notification_reminder_dispatch',
  'phase_5_migration_missing',
  'supabase_not_configured',
  'invokeEdgeFunction',
]) {
  assert.ok(service.includes(expectedService), `phase 5 service missing ${expectedService}`)
}

for (const expectedPage of [
  'getNotificationAutomationHealth',
  'dispatchNotificationReminders',
  'loadNotificationAutomationDiagnostics',
  'runNotificationReminderDryRun',
  'runNotificationReminderDispatch',
  'notificationHealth',
  'notificationDispatchResult',
  'Notification automation diagnostics',
  'Dry-run reminders',
  'Dispatch reminders',
  'Automation health',
  'Recent dispatch runs',
  'Recent failures',
]) {
  assert.ok(diagnosticsPage.includes(expectedPage), `diagnostics page missing ${expectedPage}`)
}

console.log('notification automation phase 5 observability checks passed')
