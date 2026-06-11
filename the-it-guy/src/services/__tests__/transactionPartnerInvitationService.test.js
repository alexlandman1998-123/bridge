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
