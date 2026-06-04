import assert from 'node:assert/strict'
import { createServer } from 'vite'

const leads = [
  {
    leadId: 'lead-contact-only',
    contactId: 'contact-one',
    leadSource: '',
    stage: 'New Lead',
    status: 'New Lead',
    assignedAgentName: 'Alex Agent',
    createdAt: '2026-05-01T08:00:00.000Z',
  },
  {
    leadId: 'lead-viewing-offer',
    contactId: 'contact-two',
    leadSource: 'Property24',
    stage: 'Offer Submitted',
    status: 'Offer Submitted',
    listingId: 'listing-one',
    createdAt: '2026-05-02T08:00:00.000Z',
  },
  {
    leadId: 'lead-converted',
    contactId: 'contact-three',
    leadSource: 'Referral',
    stage: 'Converted to Transaction',
    status: 'Converted to Transaction',
    convertedTransactionId: 'tx-one',
    createdAt: '2026-05-03T08:00:00.000Z',
  },
  {
    leadId: 'seller-listing-link',
    contactId: 'contact-four',
    leadSource: 'Canvassing',
    leadCategory: 'seller',
    stage: 'Listing Created',
    status: 'Listing Created',
    listingId: 'listing-two',
    createdAt: '2026-05-04T08:00:00.000Z',
  },
]

const contacts = [
  { contactId: 'contact-one', firstName: 'Missing', lastName: 'Details', phone: '', email: '' },
  { contactId: 'contact-two', firstName: 'Buyer', lastName: 'Viewing', phone: '+27820000000', email: 'buyer@example.test' },
  { contactId: 'contact-three', firstName: 'Converted', lastName: 'Client', phone: '+27821111111', email: 'converted@example.test' },
  { contactId: 'contact-four', firstName: 'Seller', lastName: 'Linked', phone: '+27822222222', email: 'seller@example.test' },
]

const leadActivities = [
  {
    activityId: 'activity-one',
    leadId: 'lead-viewing-offer',
    activityType: 'WhatsApp',
    activityNote: 'Buyer asked for offer link.',
    activityDate: '2026-05-04T10:00:00.000Z',
  },
]

const tasks = [
  { taskId: 'task-one', leadId: 'lead-contact-only', title: 'Call missing details lead', status: 'Pending', dueDate: '2026-05-05' },
  { taskId: 'task-two', leadId: 'lead-viewing-offer', title: 'Send OTP pack', status: 'Completed', dueDate: '2026-05-06' },
]

const appointments = [
  { appointmentId: 'appt-one', leadId: 'lead-viewing-offer', contactId: 'contact-two', listingId: 'listing-one', title: 'Viewing', status: 'confirmed' },
  { appointmentId: 'appt-two', contactId: 'contact-three', title: 'Converted client check-in', status: 'completed' },
]

const offers = [
  { id: 'offer-one', buyer_lead_id: 'lead-viewing-offer', buyer_contact_id: 'contact-two', listing_id: 'listing-one', viewing_appointment_id: 'appt-one', status: 'submitted', offer_amount: 2500000 },
]

const transactions = [
  { id: 'tx-one', originating_buyer_lead_id: 'lead-converted', buyer_contact_id: 'contact-three', status: 'Finance' },
]

const listings = [
  { id: 'listing-one', originating_crm_lead_id: 'lead-viewing-offer', listing_status: 'active', suburb: 'Sandton' },
  { id: 'listing-two', listing_status: 'seller_lead', suburb: 'Claremont' },
]

const listingInterests = [
  { interest_id: 'interest-one', lead_id: 'lead-contact-only', listing_id: 'missing-listing', status: 'interested', source: 'manual' },
  { interest_id: 'interest-two', lead_id: 'lead-viewing-offer', listing_id: 'listing-one', status: 'sent', source: 'manual' },
]

const requirements = [
  {
    requirement_id: 'requirement-one',
    lead_id: 'lead-contact-only',
    intent_type: 'buy',
    property_types: ['house'],
    suburbs: ['Bartlett'],
    budget_max: 2200000,
    bedrooms_min: 3,
    status: 'active',
    is_primary: true,
  },
]

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildAgentLeadRows,
    filterAgentLeadRows,
    getLeadFilterOptions,
  } = await server.ssrLoadModule('/src/services/agentLeadWorkspaceService.js')

  const rows = buildAgentLeadRows({ leads, contacts, leadActivities, tasks, appointments, offers, transactions, listings, listingInterests, requirements })

  assert.equal(rows.length, 4, 'all leads should remain visible')

  const contactOnly = rows.find((row) => row.leadId === 'lead-contact-only')
  assert.equal(contactOnly.name, 'Missing Details')
  assert.equal(contactOnly.phone, '')
  assert.equal(contactOnly.email, '')
  assert.equal(contactOnly.source, 'Unknown', 'unknown source should not hide the lead')
  assert.equal(contactOnly.nextTask.title, 'Call missing details lead')
  assert.equal(contactOnly.listingCount, 1, 'missing listing details should still count the relationship')
  assert.equal(contactOnly.requirements.length, 1)
  assert.match(contactOnly.requirementSummary, /3-bed/)
  assert.match(contactOnly.requirementSummary, /Bartlett/)

  const viewingLead = rows.find((row) => row.leadId === 'lead-viewing-offer')
  assert.equal(viewingLead.appointmentCount, 1)
  assert.equal(viewingLead.offerCount, 1)
  assert.equal(viewingLead.listingCount, 1)
  assert.equal(viewingLead.listingInterests.length, 1)
  assert.equal(viewingLead.latestActivity.activityType, 'WhatsApp')

  const converted = rows.find((row) => row.leadId === 'lead-converted')
  assert.equal(converted.appointmentCount, 1, 'contact-linked appointments should resolve')
  assert.equal(converted.transactionCount, 1)

  const sellerLinkedByListingId = rows.find((row) => row.leadId === 'seller-listing-link')
  assert.equal(sellerLinkedByListingId.listings.length, 1, 'seller leads should keep listings linked by listing id')
  assert.equal(sellerLinkedByListingId.listings[0].id, 'listing-two')
  assert.equal(sellerLinkedByListingId.listings[0].listingId, 'listing-two')

  const options = getLeadFilterOptions(rows)
  assert.ok(options.stages.includes('Offer Submitted'))
  assert.ok(options.sources.includes('Property24'))
  assert.ok(options.sources.includes('Unknown'))

  assert.equal(filterAgentLeadRows(rows, { search: 'buyer@example.test' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { stage: 'Converted to Transaction' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { source: 'Unknown' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { agent: 'Alex Agent' }).length, 1)
  assert.equal(filterAgentLeadRows(rows, { createdFrom: '2026-05-02', createdTo: '2026-05-03' }).length, 2)

  console.log('agent lead workspace smoke tests passed')
} finally {
  await server.close()
}
