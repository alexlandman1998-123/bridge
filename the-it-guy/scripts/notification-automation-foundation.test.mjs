import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  NOTIFICATION_AUTOMATION_DEFINITIONS,
  resolveNotificationAutomationKey,
} from '../src/services/notificationAutomationContract.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const appRoot = path.resolve(__dirname, '..')
const workspaceRoot = path.resolve(appRoot, '..')

const requiredKeys = [
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

const migrationPath = path.join(
  workspaceRoot,
  'supabase/migrations/202607050009_notification_automation_foundation.sql',
)
const edgeContractPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/services/notificationAutomationContract.ts',
)
const deliveryLoggerPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/services/communicationDeliveryLogging.ts',
)
const eventLoggerPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/services/notificationEventLogging.ts',
)
const transactionInviteHandlerPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/handlers/transactionPartnerInvitation.ts',
)
const workspaceInviteHandlerPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/handlers/workspaceInvite.ts',
)
const workspaceUserInviteServicePath = path.join(
  appRoot,
  'src/services/workspaceUserInviteService.js',
)

const migration = fs.readFileSync(migrationPath, 'utf8')
const edgeContract = fs.readFileSync(edgeContractPath, 'utf8')
const deliveryLogger = fs.readFileSync(deliveryLoggerPath, 'utf8')
const eventLogger = fs.readFileSync(eventLoggerPath, 'utf8')
const transactionInviteHandler = fs.readFileSync(transactionInviteHandlerPath, 'utf8')
const workspaceInviteHandler = fs.readFileSync(workspaceInviteHandlerPath, 'utf8')
const workspaceUserInviteService = fs.readFileSync(workspaceUserInviteServicePath, 'utf8')

const definitionsByKey = new Map(
  NOTIFICATION_AUTOMATION_DEFINITIONS.map((definition) => [definition.key, definition]),
)

assert.equal(
  NOTIFICATION_AUTOMATION_DEFINITIONS.length,
  requiredKeys.length,
  'app contract should define exactly the phase 1 notification keys',
)

for (const key of requiredKeys) {
  assert.ok(definitionsByKey.has(key), `app contract missing ${key}`)
  assert.ok(migration.includes(`'${key}'`), `migration seed missing ${key}`)
  assert.ok(edgeContract.includes(`"${key}"`), `edge contract missing ${key}`)
}

for (const expectedSql of [
  'create table if not exists public.notification_automation_definitions',
  'create table if not exists public.notification_events',
  'notification_event_id uuid references public.notification_events',
  'automation_key text references public.notification_automation_definitions',
  'notification_events_select_member',
]) {
  assert.ok(migration.includes(expectedSql), `migration missing ${expectedSql}`)
}

for (const expectedRuntime of [
  'resolveNotificationAutomation',
  'prepareNotificationEvent',
  'linkNotificationEventDelivery',
  'markNotificationEventSent',
  'markNotificationEventFailed',
  'notification_event_id',
  'automation_key',
]) {
  assert.ok(deliveryLogger.includes(expectedRuntime), `delivery logger missing ${expectedRuntime}`)
}

for (const expectedEventLogger of [
  '.from("notification_events")',
  'automation_key',
  'payload_json',
  'metadata_json',
  'provider_message_id',
]) {
  assert.ok(eventLogger.includes(expectedEventLogger), `event logger missing ${expectedEventLogger}`)
}

assert.ok(
  transactionInviteHandler.includes('prepareEmailDelivery') &&
    transactionInviteHandler.includes('transaction_partner_invitation'),
  'transaction partner invite handler should be logged through communication deliveries',
)
assert.ok(
  workspaceInviteHandler.includes('prepareEmailDelivery') &&
    workspaceInviteHandler.includes('agent_invite'),
  'workspace invite handler should be logged through communication deliveries',
)
assert.ok(
  workspaceUserInviteService.includes('organisationId: invite.organisationId') &&
    workspaceUserInviteService.includes('branchId: invite.branchId'),
  'workspace invite sender should pass org context for audit logging',
)

assert.equal(
  resolveNotificationAutomationKey({ communicationType: 'client_onboarding' }),
  'buyer_onboarding_sent',
)
assert.equal(
  resolveNotificationAutomationKey({ communicationType: 'seller_onboarding_link_seller' }),
  'seller_onboarding_sent',
)
assert.equal(
  resolveNotificationAutomationKey({ communicationType: 'client_portal_link' }),
  'buyer_portal_sent',
)
assert.equal(
  resolveNotificationAutomationKey({ communicationType: 'seller_portal_link_seller' }),
  'seller_portal_sent',
)
assert.equal(
  resolveNotificationAutomationKey({
    communicationType: 'transaction_partner_invitation',
    roleType: 'transfer_attorney',
  }),
  'attorney_invite_sent',
)
assert.equal(
  resolveNotificationAutomationKey({
    communicationType: 'transaction_partner_invitation',
    roleType: 'bond_originator',
  }),
  'bond_originator_invite_sent',
)
assert.equal(
  resolveNotificationAutomationKey({
    communicationType: 'agent_invite',
    workspaceRole: 'agent',
  }),
  'agent_invite_sent',
)
assert.equal(
  resolveNotificationAutomationKey({
    communicationType: 'workspace_invite',
    workspaceRole: 'admin',
  }),
  '',
)

const plannedKeys = requiredKeys.filter((key) => definitionsByKey.get(key)?.implementationStatus === 'planned')
assert.deepEqual(plannedKeys.sort(), [])

console.log('notification automation foundation contract checks passed')
