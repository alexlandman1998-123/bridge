import assert from 'node:assert/strict'
import {
  TRANSACTION_PARTNER_HANDOFF_CONTRACT_VERSION,
  assertTransactionPartnerHandoffContract,
  buildTransactionPartnerHandoffContract,
  isCanonicalTransactionPartnerHandoffSelection,
} from '../transactionPartnerHandoffContract.js'

const canonicalBondDeal = buildTransactionPartnerHandoffContract({
  financeType: 'bond',
  financeManagedBy: 'bond_originator',
  requiredPartnerRoleTypes: ['transfer_attorney', 'bond_originator'],
  rolePlayers: [
    {
      roleType: 'transfer_attorney',
      partnerOrganisationId: 'attorney-org-1',
      partnerName: 'Transfer Attorneys Inc',
    },
    {
      roleType: 'bond_originator',
      partnerOrganisationId: 'bond-org-1',
      partnerName: 'Bond Originator One',
    },
  ],
})

assert.equal(canonicalBondDeal.version, TRANSACTION_PARTNER_HANDOFF_CONTRACT_VERSION)
assert.equal(canonicalBondDeal.status, 'ready')
assert.equal(canonicalBondDeal.checks.every((check) => check.status === 'complete'), true)
assert.equal(
  isCanonicalTransactionPartnerHandoffSelection({
    roleType: 'bond_originator',
    partnerOrganisationId: 'bond-org-1',
  }),
  true,
)

const displayOnlyAttorney = buildTransactionPartnerHandoffContract({
  financeType: 'cash',
  requiredPartnerRoleTypes: ['transfer_attorney'],
  rolePlayers: [
    {
      roleType: 'transfer_attorney',
      partnerName: 'Typed Attorney Name',
      email: 'typed@example.test',
    },
  ],
})

assert.equal(displayOnlyAttorney.status, 'needs_attention')
assert.equal(displayOnlyAttorney.issues.length, 1)
assert.match(displayOnlyAttorney.issues[0].detail, /no partner organisation/i)

assert.throws(
  () =>
    assertTransactionPartnerHandoffContract({
      financeType: 'bond',
      financeManagedBy: 'bond_originator',
      requiredPartnerRoleTypes: ['transfer_attorney', 'bond_originator'],
      rolePlayers: [
        {
          roleType: 'transfer_attorney',
          partnerOrganisationId: 'attorney-org-1',
          partnerName: 'Transfer Attorneys Inc',
        },
        {
          roleType: 'bond_originator',
          partnerName: 'Typed Bond Originator',
        },
      ],
    }),
  /Select a connected bond originator partner/i,
)

const buyerManagedBond = buildTransactionPartnerHandoffContract({
  financeType: 'bond',
  financeManagedBy: 'client',
  rolePlayers: [{ roleType: 'transfer_attorney', partnerOrganisationId: 'attorney-org-1' }],
})

assert.equal(buyerManagedBond.requiredRoles.includes('bond_originator'), false)
assert.equal(buyerManagedBond.status, 'ready')

console.log('transaction partner handoff contract tests passed')
