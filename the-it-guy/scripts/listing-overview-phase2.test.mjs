import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  buildListingBuyerLeadPayload,
  buildListingViewingAppointmentPayload,
  createListingBuyerLeadDraft,
  createListingViewingDraft,
  validateListingViewingDraft,
} from '../src/services/listings/listingBuyerActionsModel.js'

const listing = {
  id: 'de953aba-9901-48c6-aa31-c24671e50c4e',
  listingTitle: '12 Test Street',
  propertyAddress: '12 Test Street, Johannesburg',
  askingPrice: 2500000,
}
const actor = { id: 'a5d086c3-f39d-4d91-aeed-2ed1ee89c001', name: 'Alex Agent', email: 'alex@example.com' }
const buyer = createListingViewingDraft({
  firstName: 'Buyer',
  lastName: 'Person',
  phone: '0820000000',
  email: 'buyer@example.com',
  proposedDate: '2099-09-25',
  proposedTime: '10:00',
})
const seller = { name: 'Seller Person', phone: '0830000000', email: 'seller@example.com' }
const lead = { leadId: '93eea425-7a5d-4fae-893d-9a69b91baf01', contactId: '3a9f01a2-508b-4c96-b639-1a925c1aae02' }

const leadPayload = buildListingBuyerLeadPayload({
  listing,
  buyer: createListingBuyerLeadDraft({ ...buyer, leadSource: 'Manual Entry' }),
  actor,
})
assert.equal(leadPayload.leadCategory, 'buyer')
assert.equal(leadPayload.listingId, listing.id)
assert.equal(leadPayload.enquiredListingId, listing.id)
assert.equal(leadPayload.contact.contactType, 'Buyer')

const appointment = buildListingViewingAppointmentPayload({ listing, buyer, seller, lead, actor })
assert.equal(appointment.appointmentType, 'viewing')
assert.equal(appointment.listingId, listing.id)
assert.equal(appointment.leadId, lead.leadId)
assert.equal(appointment.sendInviteEmails, true)
assert.equal(appointment.attachCalendarInvite, true)
assert.equal(appointment.notifyCreatorOnRsvp, true)

const buyerParticipant = appointment.participants.find((participant) => participant.participantRole === 'Buyer')
const sellerParticipant = appointment.participants.find((participant) => participant.participantRole === 'Seller')
const agentParticipant = appointment.participants.find((participant) => participant.participantRole === 'Agent')
assert.equal(buyerParticipant.isRequired, true)
assert.equal(buyerParticipant.rsvpStatus, 'Pending')
assert.equal(sellerParticipant.isRequired, true)
assert.equal(sellerParticipant.rsvpStatus, 'Pending')
assert.equal(agentParticipant.isRequired, false)
assert.equal(agentParticipant.rsvpStatus, 'Accepted')

assert.deepEqual(validateListingViewingDraft(buyer, seller), [])
assert.match(validateListingViewingDraft({ ...buyer, sendToSeller: true }, { ...seller, email: '' })[0], /seller email/i)
assert.match(validateListingViewingDraft({ ...buyer, sendToBuyer: false, sendToSeller: false }, seller)[0], /recipient/i)

const listingDetailSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const rsvpPageSource = await readFile(new URL('../src/pages/AppointmentRsvpPage.jsx', import.meta.url), 'utf8')
assert.match(listingDetailSource, /onClick=\{\(\) => openViewingRequestModal\(\)\}/)
assert.match(listingDetailSource, /onClick=\{openBuyerLeadModal\}/)
assert.doesNotMatch(listingDetailSource, /setActiveTab\('pipeline'\); setShowViewingForm\(true\)/)
assert.doesNotMatch(listingDetailSource, /Manual seller-facing stats are active/)
assert.match(rsvpPageSource, /Accept proposed time/)
assert.match(rsvpPageSource, /Decline/)
assert.match(rsvpPageSource, /Request another time/)

console.log('Listing Overview Phase 2 buyer actions contract passed')
