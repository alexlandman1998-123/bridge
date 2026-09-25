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
assert.equal(appointment.title, 'Viewing: 12 Test Street, Johannesburg')
assert.equal(appointment.location, '12 Test Street, Johannesburg')
assert.equal(appointment.listingId, listing.id)
assert.equal(appointment.leadId, lead.leadId)
assert.equal(appointment.sendInviteEmails, false)
assert.equal(appointment.attachCalendarInvite, true)
assert.equal(appointment.notifyCreatorOnRsvp, true)
assert.equal(appointment.listingViewingMode, 'three_party_request')

const buyerParticipant = appointment.participants.find((participant) => participant.participantRole === 'Buyer')
const sellerParticipant = appointment.participants.find((participant) => participant.participantRole === 'Seller')
const agentParticipant = appointment.participants.find((participant) => participant.participantRole === 'Agent')
assert.equal(buyerParticipant.isRequired, true)
assert.equal(buyerParticipant.rsvpStatus, 'Pending')
assert.equal(sellerParticipant.isRequired, true)
assert.equal(sellerParticipant.rsvpStatus, 'Pending')
assert.equal(agentParticipant.isRequired, true)
assert.equal(agentParticipant.rsvpStatus, 'Pending')

assert.deepEqual(validateListingViewingDraft(buyer, seller), [])
assert.match(validateListingViewingDraft({ ...buyer, sendToSeller: true }, { ...seller, email: '' })[0], /seller email/i)
assert.match(validateListingViewingDraft({ ...buyer, sendToBuyer: false, sendToSeller: false }, seller)[0], /buyer, seller and agent/i)
assert.match(validateListingViewingDraft(buyer, seller, { agent: { email: '' } })[0], /agent email/i)
assert.match(validateListingViewingDraft(buyer, { ...seller, email: buyer.email }, { agent: actor })[0], /separate email addresses/i)
const phoneBooking = { ...buyer, mode: 'book', bookingConfirmedWithAll: true, bookingConfirmationNote: 'Buyer, seller and agent confirmed by phone.' }
assert.deepEqual(validateListingViewingDraft(phoneBooking, seller, { agent: actor }), [])
assert.match(validateListingViewingDraft({ ...phoneBooking, bookingConfirmedWithAll: false }, seller, { agent: actor })[0], /confirm/i)
assert.match(validateListingViewingDraft({ ...phoneBooking, bookingConfirmationNote: '' }, seller, { agent: actor })[0], /record how/i)
const bookingPayload = buildListingViewingAppointmentPayload({ listing, buyer: phoneBooking, seller, lead, actor })
assert.equal(bookingPayload.listingViewingMode, 'three_party_book')
assert.equal(bookingPayload.bookingConfirmationNote, phoneBooking.bookingConfirmationNote)
assert.equal(bookingPayload.sendInviteEmails, false)

const headlineOnlyListing = { ...listing, propertyAddress: '', listingTitle: 'Lovely family home' }
assert.equal(buildListingViewingAppointmentPayload({ listing: headlineOnlyListing, buyer, seller, lead, actor }).title,
  'Viewing: Lovely family home')

const migration = await readFile(new URL('../../supabase/migrations/20260925073026_listing_viewing_three_party_rounds.sql', import.meta.url), 'utf8')
const deliveryMigration = await readFile(new URL('../../supabase/migrations/20260925074012_listing_viewing_notification_delivery.sql', import.meta.url), 'utf8')
const bookingMigration = await readFile(new URL('../../supabase/migrations/20260925075351_listing_viewing_agent_booking_override.sql', import.meta.url), 'utf8')
assert.match(migration, /create table public\.listing_viewing_rounds/)
assert.match(migration, /create table public\.listing_viewing_round_responses/)
assert.match(migration, /v_accepted = 3/)
assert.match(migration, /rsvp_token = gen_random_uuid\(\)::text/)
assert.match(migration, /guard_listing_viewing_status_before_update/)
assert.match(deliveryMigration, /create table public\.listing_viewing_notification_jobs/)
assert.match(deliveryMigration, /queue_listing_viewing_notification_jobs/)
assert.match(deliveryMigration, /claim_listing_viewing_notification_jobs/)
assert.match(deliveryMigration, /arch9-listing-viewing-emails-1m/)
assert.match(deliveryMigration, /guard_listing_viewing_time_change/)
assert.match(bookingMigration, /create function public\.book_listing_viewing_by_agent/)
assert.match(bookingMigration, /agent_phone_override/)
assert.match(bookingMigration, /v_emails <> 3 or v_pending <> 3/)

const listingDetailSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const rsvpPageSource = await readFile(new URL('../src/pages/AppointmentRsvpPage.jsx', import.meta.url), 'utf8')
const pipelineSource = await readFile(new URL('../src/lib/agencyPipelineService.js', import.meta.url), 'utf8')
const modalSource = await readFile(new URL('../src/components/listings/ListingBuyerActionModals.jsx', import.meta.url), 'utf8')
assert.match(listingDetailSource, /onClick=\{\(\) => openViewingRequestModal\(\)\}/)
assert.match(listingDetailSource, /onClick=\{openBuyerLeadModal\}/)
assert.doesNotMatch(listingDetailSource, /setActiveTab\('pipeline'\); setShowViewingForm\(true\)/)
assert.doesNotMatch(listingDetailSource, /Manual seller-facing stats are active/)
assert.match(rsvpPageSource, /Accept proposed time/)
assert.match(rsvpPageSource, /Decline/)
assert.match(rsvpPageSource, /Request another time/)
assert.match(rsvpPageSource, /is_managed_listing_viewing_rsvp/)
assert.match(pipelineSource, /initialize_listing_viewing_request/)
assert.match(pipelineSource, /book_listing_viewing_by_agent/)
assert.match(pipelineSource, /managedViewing\.data\?\.listing_viewing_round_number/)
assert.match(pipelineSource, /participant\.data\.participant_role\) !== 'agent'/)
assert.match(pipelineSource, /!suppressNotifications && !managedListingViewing/)
assert.match(modalSource, /Required participants/)
assert.match(modalSource, /Book Viewing/)
assert.match(modalSource, /Viewing details/)
assert.match(listingDetailSource, /respondToSelectedViewing/)
assert.match(listingDetailSource, /managed_round_number/)
assert.doesNotMatch(modalSource, /RecipientToggle/)

console.log('Listing Overview Phase 2 buyer actions contract passed')
