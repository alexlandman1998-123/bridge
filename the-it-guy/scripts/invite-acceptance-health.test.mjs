import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  INVITE_ACCEPTANCE_HEALTH_STATUSES,
  buildInviteAcceptanceHealthReport,
  renderInviteAcceptanceHealthText,
} from '../src/lib/invitationAcceptanceHealth.js'
import { buildInviteAcceptanceReconciliationPlan } from '../src/lib/invitationAcceptanceReconciliation.js'

const STATUSES = INVITE_ACCEPTANCE_HEALTH_STATUSES

const ids = {
  agency: '11000000-0000-4000-8000-000000000001',
  partner: '11000000-0000-4000-8000-000000000002',
  txPartner: '11000000-0000-4000-8000-000000000003',
  wrongPartner: '11000000-0000-4000-8000-000000000004',
  userPartner: '21000000-0000-4000-8000-000000000001',
  userTxPartner: '21000000-0000-4000-8000-000000000002',
  userWrong: '21000000-0000-4000-8000-000000000003',
  healthyInvite: '31000000-0000-4000-8000-000000000001',
  repairInvite: '31000000-0000-4000-8000-000000000002',
  txRepairInvite: '31000000-0000-4000-8000-000000000003',
  pendingInvite: '31000000-0000-4000-8000-000000000004',
  expiredInvite: '31000000-0000-4000-8000-000000000005',
  wrongInvite: '31000000-0000-4000-8000-000000000006',
  tx: '41000000-0000-4000-8000-000000000001',
}

const healthyPayload = {
  source: 'phase_6_healthy_fixture',
  profiles: [
    { id: ids.userPartner, email: 'partner@example.test' },
  ],
  organisationUsers: [
    { organisation_id: ids.partner, user_id: ids.userPartner, status: 'active' },
  ],
  organisationPartners: [
    {
      id: '51000000-0000-4000-8000-000000000001',
      organisation_id: ids.agency,
      partner_organisation_id: ids.partner,
      relationship_status: 'accepted',
    },
  ],
  partnerInvitations: [
    {
      id: ids.healthyInvite,
      sender_organisation_id: ids.agency,
      recipient_organisation_id: ids.partner,
      invited_email: 'partner@example.test',
      responded_by_user_id: ids.userPartner,
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
    },
  ],
}

const attentionPayload = {
  source: 'phase_6_attention_fixture',
  partnerInvitations: [
    {
      id: ids.pendingInvite,
      sender_organisation_id: ids.agency,
      recipient_email: 'pending@example.test',
      status: 'pending',
      expires_at: '2099-01-01T00:00:00.000Z',
    },
  ],
}

const blockedPayload = {
  source: 'phase_6_blocked_fixture',
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
      id: ids.repairInvite,
      sender_organisation_id: ids.agency,
      recipient_organisation_id: ids.partner,
      invited_email: 'partner@example.test',
      responded_by_user_id: ids.userPartner,
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
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
      id: ids.txRepairInvite,
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
      id: '61000000-0000-4000-8000-000000000001',
      transaction_id: ids.tx,
      user_id: ids.userTxPartner,
      access_role: 'transfer_attorney',
      created_by_invitation_id: ids.txRepairInvite,
    },
  ],
}

function writeFixture(payload) {
  const filePath = path.join(os.tmpdir(), `invite-acceptance-health-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2))
  return filePath
}

const healthy = buildInviteAcceptanceHealthReport(healthyPayload, { now: new Date('2026-07-08T00:00:00.000Z') })
assert.equal(healthy.version, 'invite_acceptance_health_v1')
assert.equal(healthy.status, STATUSES.healthy)
assert.equal(healthy.gate.pass, true)
assert.equal(healthy.totals.total, 1)
assert.equal(healthy.totals.unresolved, 0)

const attention = buildInviteAcceptanceHealthReport(attentionPayload, { now: new Date('2026-07-08T00:00:00.000Z') })
assert.equal(attention.status, STATUSES.attention)
assert.equal(attention.gate.pass, true)
assert.equal(attention.totals.waitOrResume, 1)
assert.match(attention.nextActions.join('\n'), /existing invite link/)

const blocked = buildInviteAcceptanceHealthReport(blockedPayload, { now: new Date('2026-07-08T00:00:00.000Z') })
assert.equal(blocked.status, STATUSES.blocked)
assert.equal(blocked.gate.pass, false)
assert.equal(blocked.gate.exitCode, 1)
assert.equal(blocked.totals.repairWithoutReinvite, 2)
assert.equal(blocked.totals.reinviteRequired, 1)
assert.equal(blocked.totals.manualReviewRequired, 1)
assert.equal(blocked.sections.repairNow.length, 2)
assert.equal(blocked.sections.reinvite.length, 1)
assert.equal(blocked.sections.manualReview.length, 1)

const reportFromPlan = buildInviteAcceptanceHealthReport(
  buildInviteAcceptanceReconciliationPlan(blockedPayload, { now: new Date('2026-07-08T00:00:00.000Z') }),
  { now: new Date('2026-07-08T00:00:00.000Z') },
)
assert.equal(reportFromPlan.status, STATUSES.blocked)
assert.equal(reportFromPlan.totals.repairWithoutReinvite, 2)

const text = renderInviteAcceptanceHealthText(blocked)
assert.match(text, /Invite acceptance health: blocked/)
assert.match(text, /repair: 2/)
assert.match(text, /Gate: fail/)

const healthyInput = writeFixture(healthyPayload)
const healthyOutput = execFileSync(
  process.execPath,
  ['scripts/verify-invite-acceptance-health.mjs'],
  {
    cwd: process.cwd(),
    env: { ...process.env, INVITE_ACCEPTANCE_HEALTH_INPUT: healthyInput, INVITE_ACCEPTANCE_HEALTH_FORMAT: 'text' },
    encoding: 'utf8',
  },
)
assert.match(healthyOutput, /Invite acceptance health: healthy/)
assert.match(healthyOutput, /Gate: pass/)

const blockedInput = writeFixture(blockedPayload)
const blockedRun = spawnSync(
  process.execPath,
  ['scripts/verify-invite-acceptance-health.mjs'],
  {
    cwd: process.cwd(),
    env: { ...process.env, INVITE_ACCEPTANCE_HEALTH_INPUT: blockedInput },
    encoding: 'utf8',
  },
)
assert.equal(blockedRun.status, 1)
const blockedCliReport = JSON.parse(blockedRun.stdout)
assert.equal(blockedCliReport.status, STATUSES.blocked)
assert.equal(blockedCliReport.totals.repairWithoutReinvite, 2)

const softBlockedRun = spawnSync(
  process.execPath,
  ['scripts/verify-invite-acceptance-health.mjs'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      INVITE_ACCEPTANCE_HEALTH_INPUT: blockedInput,
      INVITE_ACCEPTANCE_HEALTH_FAIL_ON_BLOCKED: 'false',
    },
    encoding: 'utf8',
  },
)
assert.equal(softBlockedRun.status, 0)

const packageJson = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
assert.match(packageJson, /"verify:invite-acceptance-health": "node scripts\/verify-invite-acceptance-health\.mjs"/)
assert.match(packageJson, /"test:invite-acceptance-health": "node scripts\/invite-acceptance-health\.test\.mjs"/)

console.log('invite acceptance health tests passed')
