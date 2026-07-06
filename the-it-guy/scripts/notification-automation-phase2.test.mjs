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
  'supabase/migrations/202607050010_notification_automation_phase2_acceptance_events.sql',
)
const edgeContractPath = path.join(
  workspaceRoot,
  'supabase/functions/send-email/services/notificationAutomationContract.ts',
)

const migration = fs.readFileSync(migrationPath, 'utf8')
const edgeContract = fs.readFileSync(edgeContractPath, 'utf8')

const acceptedKeys = [
  'attorney_invite_accepted',
  'bond_originator_invite_accepted',
  'agent_invite_accepted',
]

for (const key of acceptedKeys) {
  const definition = getNotificationAutomationDefinition(key)
  assert.equal(definition?.implementationStatus, NOTIFICATION_AUTOMATION_STATUSES.ACTIVE, `${key} should be active in app contract`)
  assert.equal(definition?.defaultEnabled, true, `${key} should be enabled in app contract`)
  assert.ok(migration.includes(`'${key}'`), `phase 2 migration should reference ${key}`)
  assert.ok(edgeContract.includes(`key: NOTIFICATION_AUTOMATION_KEYS.${key.toUpperCase()}`) || edgeContract.includes(`"${key}"`), `edge contract should include ${key}`)
}

for (const expectedSql of [
  'bridge_record_notification_event_phase2',
  'bridge_insert_invite_accepted_transaction_notification_phase2',
  'bridge_record_transaction_partner_invite_accepted_notification_phase2',
  'bridge_record_canonical_transaction_invite_accepted_notification_phase2',
  'bridge_record_workspace_invite_accepted_notification_phase2',
  'trg_transaction_partner_invite_accepted_notification_phase2',
  'trg_invite_accepted_notification_phase2',
  'after insert or update of status, accepted_user_id, accepted_at',
  'after insert or update of status, accepted_by_user_id, invitee_user_id, accepted_at',
  "'transaction_partner_invitations'",
  "'canonical_invites'",
  "'workspace_invites'",
  "'participant_assigned'",
  "'ParticipantAssigned'",
  "'phase_2_acceptance_events'",
]) {
  assert.ok(migration.includes(expectedSql), `phase 2 migration missing ${expectedSql}`)
}

assert.ok(
  migration.includes("new.invite_type in ('workspace_invite', 'branch_invite', 'team_invite')"),
  'workspace, branch, and team invite accepts should be captured',
)
assert.ok(
  migration.includes("new.invite_type in ('transaction_invite', 'workspace_and_transaction_invite', 'external_collaborator_invite')"),
  'canonical transaction invite accepts should be captured',
)
assert.ok(
  migration.includes("lower(coalesce(v_invite.role_type, '')) = 'bond_originator'") &&
    migration.includes('bridge_notification_phase2_is_attorney_role(v_invite.role_type)'),
  'transaction partner invite accepts should classify bond originator and attorney roles',
)
assert.ok(
  migration.includes('transaction_notification_id = v_notification_id'),
  'notification events should link back to in-app transaction notifications',
)

console.log('notification automation phase 2 acceptance checks passed')
