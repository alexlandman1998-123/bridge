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
  path.join(workspaceRoot, 'supabase/migrations/202608030003_transaction_roleplayer_notifications.sql'),
  'utf8',
)
const sendEmailIndex = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/index.ts'),
  'utf8',
)
const handler = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/handlers/transactionOperationsNotification.ts'),
  'utf8',
)
const edgeContract = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/services/notificationAutomationContract.ts'),
  'utf8',
)

const keys = [
  'transaction_created',
  'transaction_owner_changed',
  'transaction_roleplayer_assigned',
  'transaction_roleplayer_reassigned',
  'transaction_partner_accepted',
  'transaction_partner_declined',
  'transaction_stage_changed',
  'transaction_stalled',
  'transaction_cancelled',
  'transaction_archived',
  'transaction_reactivated',
]

for (const key of keys) {
  const definition = getNotificationAutomationDefinition(key)
  assert.equal(definition?.implementationStatus, NOTIFICATION_AUTOMATION_STATUSES.ACTIVE, `${key} should be active in app contract`)
  assert.equal(definition?.defaultEnabled, true, `${key} should be enabled by default`)
  assert.ok(migration.includes(`'${key}'`), `phase 4 migration should register ${key}`)
  assert.ok(sendEmailIndex.includes(`"${key}"`), `send-email index should route ${key}`)
  assert.ok(edgeContract.includes(`"${key}"`), `edge contract should include ${key}`)
}

for (const expectedSql of [
  'bridge_handle_transaction_operation_notifications_phase4',
  'bridge_handle_transaction_partner_action_notifications_phase4',
  'bridge_handle_transaction_roleplayer_notifications_phase4',
  'bridge_queue_transaction_stalled_notifications_phase4',
  'bridge_claim_transaction_operations_notifications_phase4',
  'notification_events_transaction_ops_dedupe_idx',
  'transaction_operations_dispatch',
]) {
  assert.ok(migration.includes(expectedSql), `phase 4 migration missing ${expectedSql}`)
}

for (const expectedHandler of [
  'renderBridgeEmailLayout',
  'resolveEmailBranding',
  'formatEmailSender',
  'bridge_queue_transaction_stalled_notifications_phase4',
  'bridge_claim_transaction_operations_notifications_phase4',
  'transaction_operations_dispatch',
]) {
  assert.ok(handler.includes(expectedHandler), `transaction operations handler missing ${expectedHandler}`)
}

console.log('transaction roleplayer notifications phase 4 checks passed')
