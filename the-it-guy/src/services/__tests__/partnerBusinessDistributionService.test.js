import assert from 'node:assert/strict'

import {
  FINANCE_MIX_BUCKETS,
  buildPartnerBusinessDistribution,
  getPartnerBusinessFinanceBucket,
} from '../partnerBusinessDistributionService.js'

const transactions = [
  {
    id: 'tx-cash-role-player',
    finance_type: 'cash',
    sales_price: 1000000,
    transaction_role_players: [
      {
        transaction_id: 'tx-cash-role-player',
        role_type: 'transfer_attorney',
        partner_relationship_id: 'attorney-rel-1',
        partner_name: 'Smith Attorneys',
      },
    ],
  },
  {
    id: 'tx-bond-role-player',
    finance_type: 'bond',
    purchase_price: 1500000,
    attorney: 'Botha Conveyancers',
  },
  {
    transaction: {
      id: 'tx-hybrid-fallback',
      finance_type: 'hybrid',
      sales_price: 1750000,
      attorney: 'Botha Conveyancers',
      bond_originator: 'Originator Two',
    },
  },
  {
    id: 'tx-bond-unassigned',
    finance_type: 'bond',
    purchase_price: 1200000,
  },
  {
    id: 'tx-unknown-with-originator',
    finance_type: '',
    purchase_price: 900000,
    attorney: 'Zulu Transfers',
    assigned_bond_originator_email: 'originator-three@example.test',
  },
  {
    id: 'tx-hybrid-by-amount',
    cash_amount: 250000,
    bond_amount: 950000,
    attorney: 'Zulu Transfers',
  },
  {
    id: 'tx-cash-fallback',
    finance_type: 'cash',
    attorney: 'Ndlovu Law',
  },
]

const rolePlayers = [
  {
    transaction_id: 'tx-bond-role-player',
    role_type: 'bond_originator',
    partner_relationship_id: 'originator-rel-1',
    partner_name: 'Originator One',
  },
  {
    transaction_id: 'tx-bond-unassigned',
    role_type: 'bond_originator',
    partner_name: 'Removed Originator',
    status: 'removed',
  },
  {
    transaction_id: 'tx-cash-fallback',
    role_type: 'transfer_attorney',
    partner_name: 'Ignored Removed Attorney',
    status: 'inactive',
  },
]

const distribution = buildPartnerBusinessDistribution({
  transactions,
  rolePlayers,
  maxItems: 3,
})

assert.equal(distribution.meta.totalTransactions, 7)

assert.equal(distribution.attorneys.totalDeals, 7)
assert.equal(distribution.attorneys.assignedDeals, 6)
assert.equal(distribution.attorneys.unassignedDeals, 1)
assert.equal(distribution.attorneys.uniquePartners, 4)
assert.equal(distribution.attorneys.assignmentCoveragePercent, 86)
assert.equal(distribution.attorneys.unassignedPercent, 14)
assert.equal(distribution.attorneys.totalDealValue, 6350000)
assert.equal(distribution.attorneys.unassignedDealValue, 1200000)
assert.equal(distribution.attorneys.averageDealValue, 907143)
assert.equal(distribution.attorneys.topPartnerSharePercent, 29)
assert.equal(distribution.attorneys.topPartner.label, 'Botha Conveyancers')
assert.equal(distribution.attorneys.topPartner.count, 2)
assert.equal(distribution.attorneys.rawItems.find((item) => item.label === 'Smith Attorneys').source, 'role_player')
assert.equal(distribution.attorneys.rawItems.find((item) => item.label === 'Ndlovu Law').source, 'transaction')
assert.ok(distribution.attorneys.items.some((item) => item.key === 'other' && item.isOther))

assert.equal(distribution.bondOriginators.totalDeals, 5)
assert.equal(distribution.bondOriginators.assignedDeals, 3)
assert.equal(distribution.bondOriginators.unassignedDeals, 2)
assert.equal(distribution.bondOriginators.uniquePartners, 3)
assert.equal(distribution.bondOriginators.assignmentCoveragePercent, 60)
assert.equal(distribution.bondOriginators.unassignedPercent, 40)
assert.equal(distribution.bondOriginators.totalDealValue, 5350000)
assert.equal(distribution.bondOriginators.assignedDealValue, 4150000)
assert.equal(distribution.bondOriginators.unassignedDealValue, 1200000)
assert.equal(distribution.bondOriginators.topPartnerSharePercent, 20)
assert.equal(distribution.bondOriginators.rawItems.find((item) => item.label === 'Originator One').source, 'role_player')
assert.equal(distribution.bondOriginators.rawItems.find((item) => item.label === 'Originator Two').source, 'transaction')
assert.ok(distribution.bondOriginators.rawItems.some((item) => item.label === 'Unassigned Bond Originator' && item.count === 2))

assert.equal(distribution.financeMix.totalDeals, 7)
assert.equal(distribution.financeMix.cashDeals, 2)
assert.equal(distribution.financeMix.bondDeals, 2)
assert.equal(distribution.financeMix.hybridDeals, 2)
assert.equal(distribution.financeMix.unknownDeals, 1)
assert.equal(distribution.financeMix.cashSharePercent, 29)
assert.equal(distribution.financeMix.bondSharePercent, 29)
assert.equal(distribution.financeMix.hybridSharePercent, 29)
assert.equal(distribution.financeMix.unknownSharePercent, 14)
assert.equal(distribution.financeMix.totalDealValue, 6350000)
assert.equal(distribution.financeMix.averageDealValue, 907143)
assert.equal(distribution.financeMix.dominantBucket.label, 'Bond')
assert.equal(distribution.financeMix.dominantBucketSharePercent, 29)
assert.equal(getPartnerBusinessFinanceBucket({ finance_type: 'cash and bond' }), FINANCE_MIX_BUCKETS.hybrid)
assert.equal(getPartnerBusinessFinanceBucket({ cash_amount: 1, bond_amount: 1 }), FINANCE_MIX_BUCKETS.hybrid)

console.log('partnerBusinessDistributionService tests passed')
