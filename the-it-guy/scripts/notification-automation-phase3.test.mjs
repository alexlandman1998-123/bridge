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

const migrationPath = path.join(
  workspaceRoot,
  'supabase/migrations/202607060001_notification_automation_phase3_reminder_queue.sql',
)
const edgeContractPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/services/notificationAutomationContract.ts',
)

const migration = fs.readFileSync(migrationPath, 'utf8')
const edgeContract = fs.readFileSync(edgeContractPath, 'utf8')

const reminderKeys = [
  'buyer_onboarding_reminder',
  'seller_onboarding_reminder',
  'attorney_invite_reminder',
  'bond_originator_invite_reminder',
  'agent_invite_reminder',
]

const stopKeys = [
  'buyer_onboarding_submitted',
  'seller_onboarding_submitted',
  'attorney_invite_accepted',
  'bond_originator_invite_accepted',
  'agent_invite_accepted',
]

for (const key of reminderKeys) {
  const definition = getNotificationAutomationDefinition(key)
  assert.equal(definition?.implementationStatus, NOTIFICATION_AUTOMATION_STATUSES.ACTIVE, `${key} should be active in app contract`)
  assert.equal(definition?.defaultEnabled, true, `${key} should be enabled in app contract`)
  assert.deepEqual(definition?.reminderPolicy?.cadenceDays, [2, 5, 9], `${key} should keep the phase 3 cadence`)
  assert.ok(migration.includes(`'${key}'`), `phase 3 migration should reference ${key}`)
  assert.ok(edgeContract.includes(`"${key}"`), `edge contract should include ${key}`)
}

for (const key of stopKeys) {
  assert.ok(migration.includes(`'${key}'`), `phase 3 migration should stop on ${key}`)
}

for (const expectedSql of [
  'phase_3_reminder_queue',
  'notification_reminder_runs',
  'bridge_queue_notification_reminder_events_phase3',
  'reminder_run_id uuid references public.notification_reminder_runs',
  'source_notification_event_id uuid references public.notification_events',
  'cross join lateral unnest(array[2, 5, 9])',
  "'queued'",
  "'scheduled_reminder'",
  "'notification_automation_phase3'",
  "status in ('sent', 'delivered')",
  'definition.implementation_status = ',
  'definition.default_enabled = true',
  'sourceDeliveryId',
  'sendEmailType',
  'dedupe_key',
]) {
  assert.ok(migration.includes(expectedSql), `phase 3 migration missing ${expectedSql}`)
}

for (const expectedStop of [
  'tx.onboarding_completed_at is not null',
  'tx.external_onboarding_submitted_at is not null',
  'private_listing_seller_onboarding',
  'transaction_partner_invitations',
  'public.invites',
  "invite.status = 'accepted'",
]) {
  assert.ok(migration.includes(expectedStop), `phase 3 stop condition missing ${expectedStop}`)
}

console.log('notification automation phase 3 reminder queue checks passed')
