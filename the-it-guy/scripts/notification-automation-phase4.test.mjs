import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')

const migrationPath = path.join(
  workspaceRoot,
  'supabase/migrations/202607060002_notification_automation_phase4_reminder_dispatch.sql',
)
const handlerPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/handlers/notificationReminderDispatch.ts',
)
const routerPath = path.join(workspaceRoot, 'supabase/functions/send-email/index.ts')
const typesPath = path.join(workspaceRoot, 'supabase/functions/send-email/types.ts')

const migration = fs.readFileSync(migrationPath, 'utf8')
const handler = fs.readFileSync(handlerPath, 'utf8')
const router = fs.readFileSync(routerPath, 'utf8')
const types = fs.readFileSync(typesPath, 'utf8')

const reminderKeys = [
  'buyer_onboarding_reminder',
  'seller_onboarding_reminder',
  'attorney_invite_reminder',
  'bond_originator_invite_reminder',
  'agent_invite_reminder',
]

for (const key of reminderKeys) {
  assert.ok(migration.includes(`'${key}'`), `phase 4 migration should reference ${key}`)
  assert.ok(handler.includes(`"${key}"`), `phase 4 handler should support ${key}`)
}

for (const expectedSql of [
  'phase_4_reminder_dispatch',
  "status in ('prepared', 'queued', 'processing', 'sent', 'delivered', 'failed', 'skipped')",
  'dispatch_attempt_count integer not null default 0',
  'last_dispatch_attempt_at timestamptz',
  'last_dispatch_error text',
  'notification_events_reminder_dispatch_queue_idx',
  'notification_events_reminder_processing_idx',
  'bridge_reset_stale_notification_reminder_processing_phase4',
  'bridge_claim_notification_reminder_events_phase4',
  'for update skip locked',
  "status = 'processing'",
  'grant execute on function public.bridge_claim_notification_reminder_events_phase4(integer, uuid) to service_role',
]) {
  assert.ok(migration.includes(expectedSql), `phase 4 migration missing ${expectedSql}`)
}

for (const expectedHandler of [
  'handleNotificationReminderDispatchEmail',
  'bridge_queue_notification_reminder_events_phase3',
  'bridge_reset_stale_notification_reminder_processing_phase4',
  'bridge_claim_notification_reminder_events_phase4',
  'sendViaResendApi',
  'renderBridgeEmailLayout',
  'renderBridgeCta',
  'sourceMetadata',
  'onboardingToken',
  'canonicalInviteLink',
  'invitationLink',
  'inviteLink',
  '.from("communication_deliveries")',
  'notification_event_id',
  'markReminderEventSent',
  'markReminderEventFailed',
  'dryRun',
]) {
  assert.ok(handler.includes(expectedHandler), `phase 4 handler missing ${expectedHandler}`)
}

for (const expectedRoute of [
  'handleNotificationReminderDispatchEmail',
  'SendNotificationReminderDispatchPayload',
  'notification_reminder_dispatch',
  'notification_reminder_dispatcher',
  'dispatch_notification_reminders',
  'notification_reminders_dispatch',
]) {
  assert.ok(router.includes(expectedRoute) || types.includes(expectedRoute), `phase 4 router/types missing ${expectedRoute}`)
}

console.log('notification automation phase 4 reminder dispatch checks passed')
