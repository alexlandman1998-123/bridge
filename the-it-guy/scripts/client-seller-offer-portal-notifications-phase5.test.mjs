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
  path.join(workspaceRoot, 'supabase/migrations/202608030004_client_seller_offer_portal_notifications.sql'),
  'utf8',
)
const sendEmailIndex = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/index.ts'),
  'utf8',
)
const handler = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/handlers/clientSellerPortalNotification.ts'),
  'utf8',
)
const edgeContract = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/services/notificationAutomationContract.ts'),
  'utf8',
)

const keys = [
  'offer_viewed_by_seller',
  'offer_not_reviewed_reminder',
  'offer_review_overdue_escalation',
  'seller_mandate_viewed_unsigned_reminder',
  'seller_mandate_signing_overdue_escalation',
  'buyer_onboarding_opened',
  'buyer_onboarding_started_not_submitted_reminder',
  'buyer_onboarding_overdue_escalation',
  'buyer_onboarding_submitted_confirmation',
  'client_portal_message_received',
  'client_portal_document_uploaded',
  'client_portal_document_rejected',
]

for (const key of keys) {
  const definition = getNotificationAutomationDefinition(key)
  assert.equal(definition?.implementationStatus, NOTIFICATION_AUTOMATION_STATUSES.ACTIVE, `${key} should be active in app contract`)
  assert.equal(definition?.defaultEnabled, true, `${key} should be enabled by default`)
  assert.ok(migration.includes(`'${key}'`), `phase 5 migration should register ${key}`)
  assert.ok(sendEmailIndex.includes(`"${key}"`), `send-email index should route ${key}`)
  assert.ok(edgeContract.includes(`"${key}"`), `edge contract should include ${key}`)
}

for (const expectedSql of [
  'bridge_queue_client_seller_portal_event_phase5',
  'bridge_queue_client_seller_portal_due_notifications_phase5',
  'bridge_claim_client_seller_portal_notifications_phase5',
  'bridge_handle_offer_seller_review_notifications_phase5',
  'bridge_handle_buyer_onboarding_notifications_phase5',
  'bridge_handle_private_listing_document_notifications_phase5',
  'notification_events_client_seller_portal_dedupe_idx',
  'client_seller_portal_dispatch',
]) {
  assert.ok(migration.includes(expectedSql), `phase 5 migration missing ${expectedSql}`)
}

for (const expectedHandler of [
  'renderBridgeEmailLayout',
  'resolveEmailBranding',
  'formatEmailSender',
  'bridge_queue_client_seller_portal_due_notifications_phase5',
  'bridge_claim_client_seller_portal_notifications_phase5',
  'client_seller_portal_dispatch',
]) {
  assert.ok(handler.includes(expectedHandler), `client/seller portal handler missing ${expectedHandler}`)
}

console.log('client, seller, offer and portal notifications phase 5 checks passed')
