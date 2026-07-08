import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  INVITE_ACCEPTANCE_RECONCILIATION_ACTIONS,
  buildInviteAcceptanceReconciliationPlan,
  renderInviteAcceptanceReconciliationSql,
} from '../src/lib/invitationAcceptanceReconciliation.js'

const ACTIONS = INVITE_ACCEPTANCE_RECONCILIATION_ACTIONS

const ids = {
  agency: '10000000-0000-4000-8000-000000000001',
  partner: '10000000-0000-4000-8000-000000000002',
  txPartner: '10000000-0000-4000-8000-000000000003',
  wrongPartner: '10000000-0000-4000-8000-000000000004',
  userPartner: '20000000-0000-4000-8000-000000000001',
  userTxPartner: '20000000-0000-4000-8000-000000000002',
  userWrong: '20000000-0000-4000-8000-000000000003',
  partnerInviteRepair: '30000000-0000-4000-8000-000000000001',
  txInviteRepair: '30000000-0000-4000-8000-000000000002',
  pendingInvite: '30000000-0000-4000-8000-000000000003',
  expiredInvite: '30000000-0000-4000-8000-000000000004',
  wrongInvite: '30000000-0000-4000-8000-000000000005',
  tx: '40000000-0000-4000-8000-000000000001',
}

const fixture = {
  source: 'phase_5_fixture',
  profiles: [
    { id: ids.userPartner, email: 'partner@example.test' },
    { id: ids.userTxPartner, email: 'tx-partner@example.test' },
    { id: ids.userWrong, email: 'actual@example.test' },
  ],
  organisationUsers: [
    { organisation_id: ids.partner, user_id: ids.userPartner, status: 'active' },
    { organisation_id: ids.txPartner, user_id: ids.userTxPartner, status: 'active' },
    { organisation_id: ids.wrongPartner, user_id: ids.userWrong, status: 'active' },
  ],
  partnerInvitations: [
    {
      id: ids.partnerInviteRepair,
      sender_organisation_id: ids.agency,
      recipient_organisation_id: ids.partner,
      invited_email: 'partner@example.test',
      responded_by_user_id: ids.userPartner,
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
    },
    {
      id: ids.pendingInvite,
      sender_organisation_id: ids.agency,
      recipient_email: 'pending@example.test',
      status: 'pending',
      expires_at: '2099-01-01T00:00:00.000Z',
    },
    {
      id: ids.expiredInvite,
      sender_organisation_id: ids.agency,
      recipient_email: 'expired@example.test',
      status: 'expired',
    },
    {
      id: ids.wrongInvite,
      sender_organisation_id: ids.agency,
      recipient_organisation_id: ids.wrongPartner,
      invited_email: 'wrong@example.test',
      responded_by_user_id: ids.userWrong,
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
    },
  ],
  transactions: [
    { id: ids.tx, organisation_id: ids.agency },
  ],
  transactionPartnerInvitations: [
    {
      id: ids.txInviteRepair,
      transaction_id: ids.tx,
      organisation_id: ids.txPartner,
      role_type: 'transfer_attorney',
      email: 'tx-partner@example.test',
      accepted_user_id: ids.userTxPartner,
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
    },
  ],
  transactionUserAccess: [
    {
      id: '50000000-0000-4000-8000-000000000001',
      transaction_id: ids.tx,
      user_id: ids.userTxPartner,
      access_role: 'transfer_attorney',
      created_by_invitation_id: ids.txInviteRepair,
    },
  ],
}

function actionFor(plan, id) {
  const item = plan.actions.find((entry) => entry.id === id)
  assert.ok(item, `Expected reconciliation item ${id}`)
  return item
}

const plan = buildInviteAcceptanceReconciliationPlan(fixture, { now: new Date('2026-07-08T00:00:00.000Z') })

assert.equal(plan.version, 'invite_acceptance_reconciliation_v1')
assert.equal(plan.migrationRequired, '202607080006_invite_acceptance_reconciliation_phase5.sql')
assert.equal(plan.summary.total, 5)
assert.equal(plan.summary.repairWithoutReinvite, 2)
assert.equal(plan.summary.sqlRepairCalls, 2)
assert.equal(plan.summary.waitOrResendExistingLink, 1)
assert.equal(plan.summary.reinviteRequired, 1)
assert.equal(plan.summary.manualReviewRequired, 1)

const partnerRepair = actionFor(plan, ids.partnerInviteRepair)
assert.equal(partnerRepair.action, ACTIONS.repairPartnerConnection)
assert.equal(partnerRepair.safeToRepair, true)
assert.match(partnerRepair.sql, /bridge_repair_partner_invitation_acceptance/)

const transactionRepair = actionFor(plan, ids.txInviteRepair)
assert.equal(transactionRepair.action, ACTIONS.repairTransactionConnection)
assert.equal(transactionRepair.safeToRepair, true)
assert.match(transactionRepair.sql, /bridge_repair_transaction_partner_invitation_acceptance/)

const pending = actionFor(plan, ids.pendingInvite)
assert.equal(pending.action, ACTIONS.waitOrResendExistingLink)
assert.equal(pending.requiresReinvite, false)
assert.equal(pending.sql, '')

const expired = actionFor(plan, ids.expiredInvite)
assert.equal(expired.action, ACTIONS.reinvite)
assert.equal(expired.requiresReinvite, true)

const wrong = actionFor(plan, ids.wrongInvite)
assert.equal(wrong.action, ACTIONS.manualReview)
assert.equal(wrong.safeToRepair, false)

const sql = renderInviteAcceptanceReconciliationSql(plan)
assert.match(sql, /begin;/)
assert.match(sql, /commit;/)
assert.match(sql, /bridge_repair_partner_invitation_acceptance/)
assert.match(sql, /bridge_repair_transaction_partner_invitation_acceptance/)
assert.match(sql, /Do not reinvite yet/)

const tempInput = path.join(os.tmpdir(), `invite-acceptance-reconciliation-${Date.now()}.json`)
fs.writeFileSync(tempInput, JSON.stringify(fixture, null, 2))

const cliJsonOutput = execFileSync(
  process.execPath,
  ['scripts/reconcile-invite-acceptance.mjs'],
  {
    cwd: process.cwd(),
    env: { ...process.env, INVITE_ACCEPTANCE_RECONCILE_INPUT: tempInput },
    encoding: 'utf8',
  },
)
const cliPlan = JSON.parse(cliJsonOutput)
assert.equal(cliPlan.summary.sqlRepairCalls, 2)

const cliSqlOutput = execFileSync(
  process.execPath,
  ['scripts/reconcile-invite-acceptance.mjs'],
  {
    cwd: process.cwd(),
    env: { ...process.env, INVITE_ACCEPTANCE_RECONCILE_INPUT: tempInput, INVITE_ACCEPTANCE_RECONCILE_FORMAT: 'sql' },
    encoding: 'utf8',
  },
)
assert.match(cliSqlOutput, /bridge_repair_partner_invitation_acceptance/)
assert.match(cliSqlOutput, /Review before running/)

const migration = fs.readFileSync(path.resolve(process.cwd(), '../supabase/migrations/202607080006_invite_acceptance_reconciliation_phase5.sql'), 'utf8')
assert.match(migration, /bridge_repair_partner_invitation_acceptance/)
assert.match(migration, /bridge_repair_transaction_partner_invitation_acceptance/)
assert.match(migration, /revoke all on function public\.bridge_repair_partner_invitation_acceptance\(uuid\) from public, anon, authenticated;/)
assert.match(migration, /grant execute on function public\.bridge_repair_transaction_partner_invitation_acceptance\(uuid\) to service_role;/)
assert.match(migration, /ambiguous_accepting_organisation/)
assert.match(migration, /resume_acceptance_required/)

const packageJson = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
assert.match(packageJson, /"reconcile:invite-acceptance": "node scripts\/reconcile-invite-acceptance\.mjs"/)
assert.match(packageJson, /"test:invite-acceptance-reconciliation": "node scripts\/invite-acceptance-reconciliation\.test\.mjs"/)

console.log('invite acceptance reconciliation tests passed')
