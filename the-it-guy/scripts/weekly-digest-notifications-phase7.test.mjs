import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getNotificationAutomationDefinition,
  NOTIFICATION_AUTOMATION_STATUSES,
} from '../src/services/notificationAutomationContract.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')

const migration = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/migrations/202608030006_weekly_digest_notifications.sql'),
  'utf8',
)
const sendEmailIndex = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/index.ts'),
  'utf8',
)
const handler = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/handlers/weeklyDigestNotification.ts'),
  'utf8',
)
const edgeContract = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/services/notificationAutomationContract.ts'),
  'utf8',
)

const keys = [
  'agent_weekly_lead_digest',
  'agent_weekly_transaction_digest',
  'agent_weekly_task_digest',
  'manager_weekly_team_digest',
  'principal_weekly_business_digest',
  'seller_weekly_listing_digest',
  'buyer_weekly_transaction_digest',
  'attorney_weekly_matter_digest',
  'bond_originator_weekly_pipeline_digest',
  'commercial_weekly_pipeline_digest',
]

for (const key of keys) {
  const definition = getNotificationAutomationDefinition(key)
  assert.equal(definition?.implementationStatus, NOTIFICATION_AUTOMATION_STATUSES.ACTIVE, `${key} should be active in app contract`)
  assert.equal(definition?.defaultEnabled, true, `${key} should be enabled by default`)
  assert.equal(definition?.triggerType, 'scheduled_reminder', `${key} should be scheduled`)
  assert.ok(migration.includes(`'${key}'`), `phase 7 migration should register ${key}`)
  assert.ok(sendEmailIndex.includes(`"${key}"`), `send-email index should route ${key}`)
  assert.ok(edgeContract.includes(`"${key}"`), `edge contract should include ${key}`)
}

for (const expectedSql of [
  'bridge_weekly_digest_keys_phase7',
  'bridge_weekly_digest_week_key_phase7',
  'bridge_weekly_digest_profile_recipient_phase7',
  'bridge_queue_weekly_digest_event_phase7',
  'bridge_queue_weekly_digest_notifications_phase7',
  'bridge_claim_weekly_digest_notifications_phase7',
  'notification_events_weekly_digest_dedupe_idx',
  'notification_events_weekly_digest_dispatch_idx',
  'weekly_digest_dispatch',
]) {
  assert.ok(migration.includes(expectedSql), `phase 7 migration missing ${expectedSql}`)
}

for (const expectedHandler of [
  'renderBridgeEmailLayout',
  'resolveEmailBranding',
  'formatEmailSender',
  'bridge_queue_weekly_digest_notifications_phase7',
  'bridge_claim_weekly_digest_notifications_phase7',
  'weekly_digest_dispatch',
]) {
  assert.ok(handler.includes(expectedHandler), `weekly digest handler missing ${expectedHandler}`)
}

console.log('weekly digest notifications phase 7 checks passed')
