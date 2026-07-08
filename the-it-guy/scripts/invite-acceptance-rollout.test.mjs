import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  INVITE_ACCEPTANCE_ROLLOUT_REQUIRED_MIGRATIONS,
  buildInviteAcceptanceRolloutPacket,
  renderInviteAcceptanceRolloutRunbook,
} from '../src/lib/invitationAcceptanceRollout.js'

const ids = {
  agency: '12000000-0000-4000-8000-000000000001',
  partner: '12000000-0000-4000-8000-000000000002',
  completePartner: '12000000-0000-4000-8000-000000000003',
  userPartner: '22000000-0000-4000-8000-000000000001',
  userComplete: '22000000-0000-4000-8000-000000000002',
  repairInvite: '32000000-0000-4000-8000-000000000001',
  completeInvite: '32000000-0000-4000-8000-000000000002',
  pendingInvite: '32000000-0000-4000-8000-000000000003',
}

const fixture = {
  source: 'phase_7_rollout_fixture',
  profiles: [
    { id: ids.userPartner, email: 'repair@example.test' },
    { id: ids.userComplete, email: 'complete@example.test' },
  ],
  organisationUsers: [
    { organisation_id: ids.partner, user_id: ids.userPartner, status: 'active' },
    { organisation_id: ids.completePartner, user_id: ids.userComplete, status: 'active' },
  ],
  organisationPartners: [
    {
      id: '52000000-0000-4000-8000-000000000001',
      organisation_id: ids.agency,
      partner_organisation_id: ids.completePartner,
      relationship_status: 'accepted',
    },
  ],
  partnerInvitations: [
    {
      id: ids.repairInvite,
      sender_organisation_id: ids.agency,
      recipient_organisation_id: ids.partner,
      invited_email: 'repair@example.test',
      responded_by_user_id: ids.userPartner,
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
    },
    {
      id: ids.completeInvite,
      sender_organisation_id: ids.agency,
      recipient_organisation_id: ids.completePartner,
      invited_email: 'complete@example.test',
      responded_by_user_id: ids.userComplete,
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
  ],
}

const packet = buildInviteAcceptanceRolloutPacket(fixture, {
  now: new Date('2026-07-08T00:00:00.000Z'),
  outputDir: '/tmp/invite-rollout',
})

assert.equal(packet.version, 'invite_acceptance_rollout_v1')
assert.equal(packet.status, 'blocked')
assert.equal(packet.gate.pass, false)
assert.deepEqual(packet.requiredMigrations, [...INVITE_ACCEPTANCE_ROLLOUT_REQUIRED_MIGRATIONS])
assert.equal(packet.summary.health.total, 3)
assert.equal(packet.summary.health.complete, 1)
assert.equal(packet.summary.health.repairWithoutReinvite, 1)
assert.equal(packet.summary.health.waitOrResume, 1)
assert.equal(packet.summary.reconciliation.sqlRepairCalls, 1)
assert.match(packet.repairSql, /bridge_repair_partner_invitation_acceptance/)
assert.equal(packet.artifacts.length, 6)
assert.ok(packet.operatorCommands.some((command) => command.includes('prepare:invite-acceptance-rollout')))
assert.ok(packet.checklist.some((item) => item.key === 'run_repair_sql' && item.done === false))
assert.ok(packet.checklist.some((item) => item.key === 'nudge_existing_links' && item.done === false))

const runbook = renderInviteAcceptanceRolloutRunbook(packet)
assert.match(runbook, /# Invite Acceptance Rollout Packet/)
assert.match(runbook, /202607080005_transaction_partner_invite_partner_org_binding\.sql/)
assert.match(runbook, /Do not reinvite pending or resumable rows/)
assert.match(runbook, /Rerun the health gate after every repair batch/)

const tempInput = path.join(os.tmpdir(), `invite-acceptance-rollout-${Date.now()}.json`)
const outputDir = path.join(os.tmpdir(), `invite-acceptance-rollout-output-${Date.now()}`)
fs.writeFileSync(tempInput, JSON.stringify(fixture, null, 2))

const cliOutput = execFileSync(
  process.execPath,
  ['scripts/prepare-invite-acceptance-rollout.mjs'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      INVITE_ACCEPTANCE_ROLLOUT_INPUT: tempInput,
      INVITE_ACCEPTANCE_ROLLOUT_OUTPUT_DIR: outputDir,
    },
    encoding: 'utf8',
  },
)
const cliPacket = JSON.parse(cliOutput)
assert.equal(cliPacket.version, 'invite_acceptance_rollout_v1')
assert.equal(cliPacket.summary.health.repairWithoutReinvite, 1)

for (const fileName of [
  'invite-acceptance-rollout.json',
  'invite-acceptance-audit.json',
  'invite-acceptance-reconciliation.json',
  'invite-acceptance-health.json',
  'invite-acceptance-repair.sql',
  'invite-acceptance-runbook.md',
]) {
  assert.ok(fs.existsSync(path.join(outputDir, fileName)), `Expected ${fileName} artifact`)
}

const markdownOutput = execFileSync(
  process.execPath,
  ['scripts/prepare-invite-acceptance-rollout.mjs'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      INVITE_ACCEPTANCE_ROLLOUT_INPUT: tempInput,
      INVITE_ACCEPTANCE_ROLLOUT_FORMAT: 'markdown',
    },
    encoding: 'utf8',
  },
)
assert.match(markdownOutput, /Invite Acceptance Rollout Packet/)
assert.match(markdownOutput, /Existing-link follow-up: 1/)

const packageJson = fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8')
assert.match(packageJson, /"prepare:invite-acceptance-rollout": "node scripts\/prepare-invite-acceptance-rollout\.mjs"/)
assert.match(packageJson, /"test:invite-acceptance-rollout": "node scripts\/invite-acceptance-rollout\.test\.mjs"/)

console.log('invite acceptance rollout tests passed')
