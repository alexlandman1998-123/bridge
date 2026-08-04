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
  path.join(workspaceRoot, 'supabase/migrations/202608030007_commercial_enterprise_layer_notifications.sql'),
  'utf8',
)
const sendEmailIndex = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/index.ts'),
  'utf8',
)
const handler = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/handlers/commercialEnterpriseNotification.ts'),
  'utf8',
)
const edgeContract = fs.readFileSync(
  path.join(workspaceRoot, 'supabase/functions/send-email/services/notificationAutomationContract.ts'),
  'utf8',
)

const keys = [
  'agency_public_intake_received',
  'commercial_access_requested',
  'commercial_access_decision',
  'commercial_broker_assigned',
  'commercial_canvassing_prospect_created',
  'commercial_requirement_created',
  'commercial_requirement_stage_changed',
  'commercial_deal_created',
  'commercial_deal_stage_changed',
  'commercial_viewing_scheduled',
  'commercial_viewing_status_changed',
  'commercial_document_request_created',
  'commercial_document_uploaded',
  'commercial_heads_of_terms_status_changed',
  'commercial_transaction_status_changed',
  'enterprise_member_scope_changed',
  'enterprise_branch_team_assignment_changed',
]

for (const key of keys) {
  const definition = getNotificationAutomationDefinition(key)
  assert.equal(definition?.implementationStatus, NOTIFICATION_AUTOMATION_STATUSES.ACTIVE, `${key} should be active in app contract`)
  assert.equal(definition?.defaultEnabled, true, `${key} should be enabled by default`)
  assert.equal(definition?.triggerType, 'system_event', `${key} should be system-event driven`)
  assert.ok(migration.includes(`'${key}'`), `phase 8 migration should register ${key}`)
  assert.ok(sendEmailIndex.includes(`"${key}"`), `send-email index should route ${key}`)
  assert.ok(edgeContract.includes(`"${key}"`), `edge contract should include ${key}`)
}

for (const expectedSql of [
  'bridge_commercial_enterprise_keys_phase8',
  'bridge_commercial_enterprise_profile_phase8',
  'bridge_commercial_enterprise_entity_label_phase8',
  'bridge_queue_commercial_enterprise_event_phase8',
  'bridge_queue_commercial_enterprise_for_user_phase8',
  'bridge_claim_commercial_enterprise_notifications_phase8',
  'trg_agency_public_intake_notifications_phase8',
  'trg_commercial_access_notifications_phase8',
  'trg_commercial_canvassing_notifications_phase8',
  'trg_commercial_requirement_notifications_phase8',
  'trg_commercial_deal_notifications_phase8',
  'trg_commercial_viewing_notifications_phase8',
  'trg_commercial_document_notifications_phase8',
  'trg_commercial_document_request_notifications_phase8',
  'trg_commercial_heads_of_terms_notifications_phase8',
  'trg_commercial_transaction_notifications_phase8',
  'trg_enterprise_member_notifications_phase8',
  'notification_events_commercial_enterprise_dedupe_idx',
  'notification_events_commercial_enterprise_dispatch_idx',
  'commercial_enterprise_dispatch',
]) {
  assert.ok(migration.includes(expectedSql), `phase 8 migration missing ${expectedSql}`)
}

for (const expectedHandler of [
  'renderBridgeEmailLayout',
  'resolveEmailBranding',
  'formatEmailSender',
  'bridge_claim_commercial_enterprise_notifications_phase8',
  'commercial_enterprise_dispatch',
]) {
  assert.ok(handler.includes(expectedHandler), `commercial/enterprise handler missing ${expectedHandler}`)
}

console.log('commercial and enterprise notifications phase 8 checks passed')
