import assert from 'node:assert/strict'
import { buildAgencyLeadLandingMetrics } from '../agencyLeadListModel.js'

const metrics = buildAgencyLeadLandingMetrics([
  { leadCategory: 'buyer', stage: 'New Lead', leadSource: 'Property24', createdAt: '2026-09-02T10:00:00Z' },
  { leadCategory: 'seller', stage: 'New Lead', leadSource: 'Website', createdAt: '2026-09-03T10:00:00Z' },
  { leadCategory: 'buyer', stage: 'Transaction', leadSource: 'Property24', convertedTransactionId: 'transaction-1', updatedAt: '2026-09-10T10:00:00Z' },
  { leadCategory: 'seller', stage: 'Mandate Signed', leadSource: 'Private Property', mandatePacketId: 'mandate-1', updatedAt: '2026-09-11T10:00:00Z' },
  { leadCategory: 'buyer', stage: 'Archived', leadSource: 'Property24', updatedAt: '2026-09-12T10:00:00Z' },
  { leadCategory: 'buyer', stage: 'Transaction', leadSource: 'Referral', convertedTransactionId: 'transaction-old', updatedAt: '2026-08-31T10:00:00Z' },
], { now: new Date('2026-09-25T10:00:00Z') })

assert.equal(metrics.newLeads, 2)
assert.equal(metrics.convertedMtd, 2)
assert.equal(metrics.buyerConvertedMtd, 1)
assert.equal(metrics.sellerMandatesMtd, 1)
assert.equal(metrics.topSource, 'Property24')
assert.equal(metrics.topSourceCount, 3)
assert.equal(metrics.lostLeads, 1)
assert.equal(metrics.lostRate, 17)
assert.deepEqual(metrics.categoryCounts, { buyer: 3, seller: 2, archived: 1 })

console.log('agency lead landing metrics tests passed')
