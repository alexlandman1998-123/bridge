import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  INVITE_ACCEPTANCE_AUDIT_CATEGORIES,
  buildInviteAcceptanceAudit,
} from '../src/lib/invitationAcceptanceAudit.js'

const CATEGORIES = INVITE_ACCEPTANCE_AUDIT_CATEGORIES

function categoryOf(report, id) {
  const item = report.items.find((entry) => entry.id === id)
  assert.ok(item, `Expected audit item ${id}`)
  return item.category
}

const fixture = {
  source: 'phase_2_fixture',
  profiles: [
    { id: 'user-signed', email: 'signed@example.test' },
    { id: 'user-accepted', email: 'accepted@example.test' },
    { id: 'user-access', email: 'access@example.test' },
    { id: 'user-wrong', email: 'other@example.test' },
    { id: 'user-complete', email: 'complete@example.test' },
    { id: 'user-tx-complete', email: 'tx-complete@example.test' },
  ],
  organisationUsers: [
    { organisation_id: 'org-signed', user_id: 'user-signed', status: 'active' },
    { organisation_id: 'org-accepted', user_id: 'user-accepted', status: 'active' },
    { organisation_id: 'org-access', user_id: 'user-access', status: 'active' },
    { organisation_id: 'org-wrong', user_id: 'user-wrong', status: 'active' },
    { organisation_id: 'org-complete', user_id: 'user-complete', status: 'active' },
    { organisation_id: 'org-tx-complete', user_id: 'user-tx-complete', status: 'active' },
  ],
  organisationPartners: [
    {
      id: 'rel-complete',
      organisation_id: 'org-agency',
      partner_organisation_id: 'org-complete',
      relationship_status: 'accepted',
    },
    {
      id: 'rel-tx-complete',
      organisation_id: 'org-agency',
      partner_organisation_id: 'org-tx-complete',
      status: 'accepted',
    },
  ],
  transactions: [
    { id: 'tx-access', organisation_id: 'org-agency' },
    { id: 'tx-complete', organisation_id: 'org-agency' },
  ],
  partnerInvitations: [
    {
      id: 'partner-pending-no-signup',
      sender_organisation_id: 'org-agency',
      recipient_email: 'pending@example.test',
      status: 'pending',
      expires_at: '2099-01-01T00:00:00.000Z',
    },
    {
      id: 'partner-signed-no-relationship',
      sender_organisation_id: 'org-agency',
      recipient_organisation_id: 'org-signed',
      recipient_email: 'signed@example.test',
      status: 'pending',
      expires_at: '2099-01-01T00:00:00.000Z',
    },
    {
      id: 'partner-accepted-missing-relationship',
      sender_organisation_id: 'org-agency',
      recipient_organisation_id: 'org-accepted',
      recipient_email: 'accepted@example.test',
      accepted_user_id: 'user-accepted',
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
    },
    {
      id: 'partner-expired',
      sender_organisation_id: 'org-agency',
      recipient_email: 'expired@example.test',
      status: 'expired',
    },
    {
      id: 'partner-wrong-email',
      sender_organisation_id: 'org-agency',
      recipient_organisation_id: 'org-wrong',
      recipient_email: 'wrong@example.test',
      accepted_user_id: 'user-wrong',
      status: 'accepted',
    },
    {
      id: 'partner-complete',
      sender_organisation_id: 'org-agency',
      recipient_organisation_id: 'org-complete',
      recipient_email: 'complete@example.test',
      accepted_user_id: 'user-complete',
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
    },
  ],
  transactionPartnerInvitations: [
    {
      id: 'tx-access-no-partner',
      transaction_id: 'tx-access',
      organisation_id: 'org-access',
      role_type: 'transfer_attorney',
      email: 'access@example.test',
      accepted_user_id: 'user-access',
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
    },
    {
      id: 'tx-complete',
      transaction_id: 'tx-complete',
      organisation_id: 'org-tx-complete',
      role_type: 'bond_attorney',
      email: 'tx-complete@example.test',
      accepted_user_id: 'user-tx-complete',
      status: 'accepted',
      accepted_at: '2026-07-01T10:00:00.000Z',
    },
  ],
  transactionUserAccess: [
    {
      id: 'access-1',
      transaction_id: 'tx-access',
      user_id: 'user-access',
      access_role: 'transfer_attorney',
      created_by_invitation_id: 'tx-access-no-partner',
    },
    {
      id: 'access-2',
      transaction_id: 'tx-complete',
      user_id: 'user-tx-complete',
      access_role: 'bond_attorney',
      created_by_invitation_id: 'tx-complete',
    },
  ],
  transactionParticipants: [
    {
      id: 'participant-complete',
      transaction_id: 'tx-complete',
      user_id: 'user-tx-complete',
      participant_email: 'tx-complete@example.test',
      transaction_partner_invitation_id: 'tx-complete',
    },
  ],
  transactionRolePlayers: [
    {
      id: 'role-player-complete',
      transaction_id: 'tx-complete',
      partner_organisation_id: 'org-tx-complete',
      transaction_partner_invitation_id: 'tx-complete',
    },
  ],
}

const report = buildInviteAcceptanceAudit(fixture, { source: 'unit_test' })

assert.equal(report.version, 'invite_acceptance_audit_v1')
assert.equal(report.summary.total, 8)
assert.equal(categoryOf(report, 'partner-pending-no-signup'), CATEGORIES.pendingInviteNoSignup)
assert.equal(categoryOf(report, 'partner-signed-no-relationship'), CATEGORIES.signedUpButNoPartnerConnection)
assert.equal(categoryOf(report, 'partner-accepted-missing-relationship'), CATEGORIES.acceptedInviteButMissingOrganisationPartners)
assert.equal(categoryOf(report, 'partner-expired'), CATEGORIES.expiredOrRevoked)
assert.equal(categoryOf(report, 'partner-wrong-email'), CATEGORIES.wrongEmailOrWrongWorkspace)
assert.equal(categoryOf(report, 'partner-complete'), CATEGORIES.complete)
assert.equal(categoryOf(report, 'tx-access-no-partner'), CATEGORIES.transactionAccessExistsButNoPartnerConnection)
assert.equal(categoryOf(report, 'tx-complete'), CATEGORIES.complete)
assert.equal(report.summary.repairable, 3)
assert.equal(report.summary.reinviteRequired, 2)

const tempInput = path.join(os.tmpdir(), `invite-acceptance-audit-${Date.now()}.json`)
fs.writeFileSync(tempInput, JSON.stringify(fixture, null, 2))

const output = execSync(
  `INVITE_ACCEPTANCE_AUDIT_INPUT=${tempInput} node scripts/report-invite-acceptance-audit.mjs`,
  { encoding: 'utf8', cwd: process.cwd() },
)
const scriptReport = JSON.parse(output)
assert.equal(scriptReport.summary.total, 8)
assert.equal(scriptReport.summary.byCategory[CATEGORIES.transactionAccessExistsButNoPartnerConnection], 1)
assert.equal(scriptReport.summary.byCategory[CATEGORIES.complete], 2)

console.log('invite acceptance audit tests passed')
