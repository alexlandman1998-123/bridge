import assert from 'node:assert/strict'
import { buildAgencyLeadLandingMetrics, buildAgencyLeadListModel, buildAgencyLeadListSummary } from '../agencyLeadListModel.js'
import { isRentalCrmLead } from '../../../services/rentals/rentalCrmLeadModel.js'

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
assert.deepEqual(metrics.categoryCounts, { buyer: 3, seller: 2, development: 0, archived: 1 })

const salesLeads = [
  { leadId: 'sale-buyer', leadCategory: 'buyer', stage: 'New Lead', leadSource: 'Website' },
  { leadId: 'sale-seller', leadCategory: 'seller', stage: 'Contacted', leadSource: 'Referral' },
  { leadId: 'sale-archived', leadCategory: 'seller', stage: 'Archived' },
]
const rentalLeads = [
  { leadId: 'landlord', leadCategory: 'seller', stage: 'Mandate Signed', rawEnquiryPayload: { arch9RentalLead: true, classification: 'rental', role: 'landlord' } },
  { leadId: 'tenant', leadCategory: 'buyer', stage: 'New Lead', rawEnquiryPayload: { rentalCrm: { classification: 'rental', role: 'tenant' } } },
  { leadId: 'past-landlord', leadCategory: 'seller', stage: 'Archived', raw_enquiry_payload: { rental_crm: { lead_type: 'rental', role: 'landlord' } } },
]
const sharedRecords = [...rentalLeads, ...salesLeads]
for (const category of ['buyer', 'seller', 'development', 'archived']) {
  const result = buildAgencyLeadListModel({ leads: sharedRecords, category })
  const expected = buildAgencyLeadListModel({ leads: salesLeads, category })
  assert.deepEqual(result.rows.map(row => row.id), expected.rows.map(row => row.id))
  assert.deepEqual(result.categoryCounts, expected.categoryCounts)
}
assert.deepEqual(buildAgencyLeadLandingMetrics(sharedRecords), buildAgencyLeadLandingMetrics(salesLeads))
const salesTasks = [{ leadId: 'sale-seller', status: 'open', dueDate: '2026-01-01' }]
const rentalTasks = [{ leadId: 'landlord', status: 'open', dueDate: '2026-01-01' }]
assert.deepEqual(buildAgencyLeadListSummary({ leads: sharedRecords, tasks: [...salesTasks, ...rentalTasks] }), buildAgencyLeadListSummary({ leads: salesLeads, tasks: salesTasks }))
assert.deepEqual(sharedRecords.filter(isRentalCrmLead), rentalLeads, 'Sales filtering keeps the rental records intact for their own workspace.')

console.log('agency lead landing metrics tests passed')
