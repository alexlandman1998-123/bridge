import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    getTransactionPartnerRoleLabel,
    filterPartnerProspectsForSearch,
    normalizePartnerProspect,
    normalizeTransactionPartnerInvitation,
    normalizePartnerProspectRole,
    normalizeTransactionPartnerInvitationDraft,
    normalizeTransactionPartnerInvitationRole,
    validateTransactionPartnerInvitationDraft,
  } = await server.ssrLoadModule('/src/services/transactionPartnerInvitationService.js')

  {
    assert.equal(normalizeTransactionPartnerInvitationRole('attorney'), 'transfer_attorney')
    assert.equal(normalizeTransactionPartnerInvitationRole('Conveyancer'), 'transfer_attorney')
    assert.equal(normalizeTransactionPartnerInvitationRole('bond originator'), 'bond_originator')
    assert.equal(normalizeTransactionPartnerInvitationRole('developer_contact'), 'developer')
    assert.equal(normalizeTransactionPartnerInvitationRole('unexpected'), 'other')
  }

  {
    const draft = normalizeTransactionPartnerInvitationDraft({
      role_type: 'transfer_attorney',
      company_name: ' Tucker Attorneys ',
      contact_name: ' Sarah Jones ',
      email: ' SARAH@TUCKER.CO.ZA ',
      phone: ' 082 123 4567 ',
    })

    assert.deepEqual(draft, {
      roleType: 'transfer_attorney',
      companyName: 'Tucker Attorneys',
      contactName: 'Sarah Jones',
      email: 'sarah@tucker.co.za',
      phone: '082 123 4567',
    })
  }

  {
    const validation = validateTransactionPartnerInvitationDraft({
      roleType: 'bond_originator',
      companyName: 'BetterBond Sandton',
      contactName: 'Michael Naidoo',
      email: 'michael@betterbond.co.za',
    })

    assert.equal(validation.valid, true)
    assert.deepEqual(validation.errors, {})
  }

  {
    const validation = validateTransactionPartnerInvitationDraft({
      roleType: 'transfer_attorney',
      companyName: '',
      contactName: '',
      email: 'not-an-email',
    })

    assert.equal(validation.valid, false)
    assert.equal(validation.errors.companyName, 'Company name is required.')
    assert.equal(validation.errors.contactName, 'Contact name is required.')
    assert.equal(validation.errors.email, 'Enter a valid email address.')
  }

  {
    assert.equal(getTransactionPartnerRoleLabel('transfer_attorney'), 'Transfer Attorney')
    assert.equal(getTransactionPartnerRoleLabel('bond_originator'), 'Bond Originator')
    assert.equal(getTransactionPartnerRoleLabel('developer'), 'Developer')
  }

  {
    assert.equal(normalizePartnerProspectRole('transfer_attorney'), 'attorney')
    assert.equal(normalizePartnerProspectRole('bond originator'), 'bond_originator')
    assert.equal(normalizePartnerProspectRole('developer_contact'), 'developer')
    assert.equal(normalizePartnerProspectRole('mystery'), 'other')
  }

  {
    const prospect = normalizePartnerProspect({
      id: 'prospect-1',
      role_type: 'attorney',
      company_name: 'Tucker Attorneys',
      contact_name: 'Sarah Jones',
      email: 'SARAH@TUCKER.CO.ZA',
      status: 'joined',
      bridge_user_id: 'user-1',
      invitation_count: 4,
      accepted_invitation_count: 1,
      transaction_count: 7,
      duplicate_review_status: 'possible_duplicate',
    })

    assert.equal(prospect.roleType, 'attorney')
    assert.equal(prospect.transactionRoleType, 'transfer_attorney')
    assert.equal(prospect.statusLabel, 'Joined')
    assert.equal(prospect.email, 'sarah@tucker.co.za')
    assert.equal(prospect.acceptanceRate, 25)
    assert.equal(prospect.possibleDuplicateOf, null)
    assert.equal(prospect.duplicateReviewStatus, 'possible_duplicate')
  }

  {
    const invitation = normalizeTransactionPartnerInvitation({
      id: 'invite-1',
      transaction_id: 'transaction-1',
      role_type: 'bond_originator',
      company_name: 'BetterBond',
      contact_name: 'Michael Naidoo',
      email: ' MICHAEL@BETTERBOND.CO.ZA ',
      status: 'pending',
      metadata: {
        emailDeliveryCount: 2,
        linkCopyCount: 1,
        lastLinkCopiedAt: '2026-06-26T08:00:00.000Z',
      },
    })

    assert.equal(invitation.roleLabel, 'Bond Originator')
    assert.equal(invitation.statusLabel, 'Pending')
    assert.equal(invitation.email, 'michael@betterbond.co.za')
    assert.equal(invitation.isExpired, false)
    assert.equal(invitation.emailDeliveryCount, 2)
    assert.equal(invitation.linkCopyCount, 1)
    assert.equal(invitation.lastLinkCopiedAt, '2026-06-26T08:00:00.000Z')
  }

  {
    const expired = normalizeTransactionPartnerInvitation({
      id: 'invite-expired',
      role_type: 'developer',
      email: 'dev@example.com',
      status: 'pending',
      invitation_token: '00000000-0000-4000-8000-000000000000',
      expires_at: new Date(Date.now() - 60_000).toISOString(),
    })

    assert.equal(expired.status, 'expired')
    assert.equal(expired.storedStatus, 'pending')
    assert.equal(expired.statusLabel, 'Expired')
    assert.equal(expired.isExpired, true)
    assert.equal(expired.invitationLink, '')
  }

  {
    const expiringSoon = normalizeTransactionPartnerInvitation({
      id: 'invite-soon',
      role_type: 'developer',
      email: 'dev@example.com',
      status: 'pending',
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })

    assert.equal(expiringSoon.status, 'pending')
    assert.equal(expiringSoon.expiresSoon, true)
    assert.equal(expiringSoon.daysUntilExpiry, 1)
  }

  {
    const rows = [
      { id: 'pending', role_type: 'attorney', company_name: 'Tucker Attorneys', status: 'invited', transaction_count: 12 },
      { id: 'joined', role_type: 'attorney', company_name: 'Hammond Pole', status: 'joined', transaction_count: 3 },
      { id: 'originator', role_type: 'bond_originator', company_name: 'BetterBond', status: 'joined', transaction_count: 9 },
    ]

    const filtered = filterPartnerProspectsForSearch(rows, { roleType: 'transfer_attorney', query: '', limit: 5 })
    assert.deepEqual(filtered.map((item) => item.id), ['joined', 'pending'])

    const searched = filterPartnerProspectsForSearch(rows, { roleType: 'transfer_attorney', query: 'tuck', limit: 5 })
    assert.deepEqual(searched.map((item) => item.id), ['pending'])
  }

  console.log('transactionPartnerInvitationService tests passed')
} finally {
  await server.close()
}
