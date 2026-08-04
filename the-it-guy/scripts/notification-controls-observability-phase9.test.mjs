import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')

const migration = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/migrations/202608030008_notification_controls_preferences_observability.sql'),
  'utf8',
)
const service = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/services/notificationControls.ts'),
  'utf8',
)
const handler = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/handlers/notificationControlsOperations.ts'),
  'utf8',
)
const sendEmailIndex = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/index.ts'),
  'utf8',
)
const types = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/types.ts'),
  'utf8',
)
const dispatchHandlers = [
  'transactionOperationsNotification.ts',
  'clientSellerPortalNotification.ts',
  'bondAttorneyLegalNotification.ts',
  'weeklyDigestNotification.ts',
  'commercialEnterpriseNotification.ts',
  'notificationReminderDispatch.ts',
  'transactionProgressDispatch.ts',
].map((file) => [
  file,
  fs.readFileSync(path.join(workspaceRoot, 'supabase/functions/send-email/handlers', file), 'utf8'),
])

for (const table of [
  'notification_recipient_preferences',
  'notification_suppression_list',
  'notification_delivery_attempts',
  'notification_observability_daily_rollups',
]) {
  assert.ok(migration.includes(`create table if not exists public.${table}`), `phase 9 migration should create ${table}`)
  assert.ok(migration.includes(`alter table public.${table} enable row level security`), `${table} should have RLS enabled`)
}

for (const fn of [
  'bridge_notification_is_quiet_hours_phase9',
  'bridge_resolve_notification_recipient_control_phase9',
  'bridge_record_notification_delivery_attempt_phase9',
  'bridge_apply_notification_preferences_to_queue_phase9',
  'bridge_notification_observability_snapshot_phase9',
]) {
  assert.ok(migration.includes(`function public.${fn}`), `phase 9 migration missing ${fn}`)
}

for (const fn of [
  'bridge_resolve_notification_recipient_control_phase9',
  'bridge_record_notification_delivery_attempt_phase9',
  'bridge_apply_notification_preferences_to_queue_phase9',
  'bridge_notification_observability_snapshot_phase9',
]) {
  assert.ok(service.includes(fn), `notification controls service should call ${fn}`)
}

for (const routeType of [
  'notification_controls_apply_queue',
  'notification_preferences_apply_queue',
  'notification_queue_controls',
  'notification_observability_snapshot',
  'notification_controls_snapshot',
  'notification_health_snapshot',
]) {
  assert.ok(handler.includes(routeType), `notification controls handler missing ${routeType}`)
  assert.ok(sendEmailIndex.includes(`"${routeType}"`), `send-email index should route ${routeType}`)
  assert.ok(types.includes(`"${routeType}"`), `payload type should include ${routeType}`)
}

for (const expectedServiceToken of [
  'resolveNotificationRecipientControl',
  'recordNotificationDeliveryAttempt',
  'applyNotificationQueueControls',
  'getNotificationObservabilitySnapshot',
  'control_plane_lookup_failed',
  'bridge_record_notification_delivery_attempt_phase9',
  'p_event_id',
]) {
  assert.ok(service.includes(expectedServiceToken), `notification controls service missing ${expectedServiceToken}`)
}

for (const expectedSql of [
  'notification_recipient_preferences_scope_idx',
  'notification_recipient_preferences_member_insert',
  'notification_suppression_list_active_scope_idx',
  'notification_delivery_attempts_org_status_idx',
  'notification_observability_daily_rollups_scope_idx',
  'An organisationId is required for authenticated notification observability snapshots.',
  'p_event_id uuid default null',
  "'deliveryStatusCounts'",
  "'sentDeliveries'",
  "'failedDeliveries'",
  "'suppressed'",
  "'deferred'",
  "'quiet_hours'",
  "'muted_until'",
  "'preference_disabled'",
]) {
  assert.ok(migration.includes(expectedSql), `phase 9 migration missing ${expectedSql}`)
}

assert.ok(handler.includes('Service role authorization is required for notification controls'), 'controls operations should be service-role only')

for (const [file, content] of dispatchHandlers) {
  assert.ok(content.includes('applyNotificationQueueControls'), `${file} should apply Phase 9 controls before claiming queued notifications`)
  assert.ok(content.includes('eventId'), `${file} should pass an event id into Phase 9 controls when available`)
}

console.log('notification controls, preferences, and observability phase 9 checks passed')
