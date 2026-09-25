import { buildLeadListingLinkPatch, resolveListingPropertyAddress } from '../../lib/agencyLeadSelection.js'

export const LISTING_BUYER_LEAD_SOURCES = [
  'Property24', 'Private Property', 'Website', 'Referral', 'Show Day', 'Walk-In',
  'WhatsApp', 'Facebook', 'Google', 'Cold Call', 'Door Knock', 'Manual Entry', 'Other',
]

export const LISTING_BUYER_LEAD_PRIORITIES = ['Low', 'Medium', 'High', 'Urgent']

export function listingBuyerActionText(value = '') {
  return String(value ?? '').trim()
}

export function listingBuyerActionEmail(value = '') {
  return listingBuyerActionText(value).toLowerCase()
}

function validEmail(value = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(listingBuyerActionEmail(value))
}

export function listingBuyerActionId(value = '') {
  return listingBuyerActionText(value)
}

export function buildListingBuyerActorSnapshot(actor = {}) {
  const actorId = listingBuyerActionId(actor.id || actor.userId || actor.user_id)
  return {
    id: actorId,
    userId: actorId,
    name: listingBuyerActionText(actor.name || actor.fullName || [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email || 'Agent'),
    fullName: listingBuyerActionText(actor.fullName || actor.name || [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.email || 'Agent'),
    email: listingBuyerActionEmail(actor.email),
    branchId: listingBuyerActionId(actor.branchId || actor.branch_id),
  }
}

export function getListingBuyerActionListingId(listing = {}) {
  return listingBuyerActionId(listing.id || listing.listingId || listing.listing_id)
}

export function getListingBuyerActionPropertyAddress(listing = {}) {
  return resolveListingPropertyAddress(listing)
}

function listingLabel(listing = {}) {
  return getListingBuyerActionPropertyAddress(listing)
    || listingBuyerActionText(listing.listingTitle || listing.title || 'Listing')
}

export function getListingBuyerActionLeadId(lead = {}) {
  return listingBuyerActionId(lead.leadId || lead.lead_id || lead.id)
}

export function getListingBuyerActionContactId(lead = {}) {
  return listingBuyerActionId(lead.contactId || lead.contact_id)
}

export function createListingBuyerLeadDraft(overrides = {}) {
  return { firstName: '', lastName: '', phone: '', email: '', leadSource: 'Manual Entry', priority: 'Medium', notes: '', ...overrides }
}

export function createListingViewingDraft(overrides = {}) {
  return {
    buyerLeadId: '', firstName: '', lastName: '', phone: '', email: '', proposedDate: '', proposedTime: '', notes: '',
    mode: 'request', sellerName: '', sellerEmail: '', sellerPhone: '',
    bookingConfirmedWithAll: false, bookingConfirmationNote: '',
    sendToBuyer: true, sendToSeller: true, ...overrides,
  }
}

export function validateListingBuyerLeadDraft(draft = {}) {
  const errors = []
  if (!listingBuyerActionText(draft.firstName)) errors.push('Add the buyer name.')
  if (!listingBuyerActionText(draft.lastName)) errors.push('Add the buyer surname.')
  if (!listingBuyerActionText(draft.phone)) errors.push('Add the buyer phone number.')
  if (!validEmail(draft.email)) errors.push('Add a valid buyer email address.')
  if (!listingBuyerActionText(draft.leadSource)) errors.push('Choose the lead source.')
  return errors
}

export function validateListingViewingDraft(draft = {}, seller = {}, { now = Date.now(), agent = {} } = {}) {
  const errors = validateListingBuyerLeadDraft({ ...draft, leadSource: draft.leadSource || 'Manual Entry' })
  const mode = listingBuyerActionText(draft.mode || 'request')
  if (!['request', 'book'].includes(mode)) errors.push('Choose Request Viewing or Book Viewing.')
  if (!listingBuyerActionText(draft.proposedDate)) errors.push('Choose the proposed viewing date.')
  if (!listingBuyerActionText(draft.proposedTime)) errors.push('Choose the proposed viewing time.')
  if (draft.proposedDate && draft.proposedTime) {
    // Listing viewings are always entered in South African local time, not the browser's timezone.
    const proposed = new Date(`${draft.proposedDate}T${draft.proposedTime}:00+02:00`)
    if (Number.isNaN(proposed.getTime()) || proposed.getTime() <= Number(now)) errors.push('Choose a viewing time in the future.')
  }
  if (draft.sendToBuyer === false || draft.sendToSeller === false) errors.push('Buyer, seller and agent must all receive the viewing request.')
  if (!validEmail(draft.email)) errors.push('A valid buyer email is required to send the buyer RSVP.')
  if (!listingBuyerActionText(seller.name)) errors.push('Add the designated seller name for this viewing.')
  if (!validEmail(seller.email)) errors.push('Add the designated seller email before requesting a viewing.')
  if (!listingBuyerActionText(seller.phone)) errors.push('Add the designated seller phone number for this viewing.')
  if (agent.email !== undefined && !validEmail(agent.email)) errors.push('Add the assigned agent email before requesting a viewing.')
  const recipientEmails = [draft.email, seller.email, agent.email].map(listingBuyerActionEmail).filter(Boolean)
  if (recipientEmails.length === 3 && new Set(recipientEmails).size !== 3) {
    errors.push('Buyer, seller and agent need separate email addresses to approve independently.')
  }
  if (mode === 'book') {
    if (draft.bookingConfirmedWithAll !== true) errors.push('Confirm that buyer, seller and agent have all agreed to this viewing.')
    const note = listingBuyerActionText(draft.bookingConfirmationNote)
    if (note.length < 10 || note.length > 1000) errors.push('Record how all three parties confirmed the viewing (10–1000 characters).')
  }
  return [...new Set(errors)]
}

export function buildListingBuyerLeadPayload({ listing = {}, buyer = {}, actor = {} } = {}) {
  const assignedAgent = buildListingBuyerActorSnapshot(actor)
  const linkPatch = buildLeadListingLinkPatch(listing)
  return {
    contact: {
      firstName: listingBuyerActionText(buyer.firstName), lastName: listingBuyerActionText(buyer.lastName),
      phone: listingBuyerActionText(buyer.phone), email: listingBuyerActionEmail(buyer.email),
      notes: listingBuyerActionText(buyer.notes), contactType: 'Buyer',
    },
    assignedAgent,
    branchId: assignedAgent.branchId,
    assignedUserId: assignedAgent.userId,
    createdBy: assignedAgent.userId,
    leadCategory: 'buyer',
    leadDirection: 'Inbound',
    leadSource: listingBuyerActionText(buyer.leadSource) || 'Manual Entry',
    stage: 'Lead',
    priority: listingBuyerActionText(buyer.priority) || 'Medium',
    listingId: linkPatch.listingId,
    enquiredListingId: linkPatch.enquiredListingId,
    enquiredPropertyTitle: linkPatch.enquiredPropertyTitle,
    enquiredPropertyAddress: linkPatch.enquiredPropertyAddress,
    enquiredPropertyPrice: linkPatch.enquiredPropertyPrice,
    propertyInterest: linkPatch.enquiredPropertyAddress || linkPatch.enquiredPropertyTitle,
    notes: listingBuyerActionText(buyer.notes),
  }
}

export function buildListingViewingAppointmentPayload({ listing = {}, buyer = {}, seller = {}, lead = {}, actor = {} } = {}) {
  const assignedAgent = buildListingBuyerActorSnapshot(actor)
  const participants = []
  participants.push({
    name: [listingBuyerActionText(buyer.firstName), listingBuyerActionText(buyer.lastName)].filter(Boolean).join(' '),
    email: listingBuyerActionEmail(buyer.email), phone: listingBuyerActionText(buyer.phone), participantRole: 'Buyer', isRequired: true, rsvpStatus: 'Pending',
  })
  participants.push({
    name: listingBuyerActionText(seller.name) || 'Seller', email: listingBuyerActionEmail(seller.email),
    phone: listingBuyerActionText(seller.phone), participantRole: 'Seller', isRequired: true, rsvpStatus: 'Pending',
  })
  participants.push({ name: assignedAgent.name, email: assignedAgent.email, participantRole: 'Agent', isRequired: true, rsvpStatus: 'Pending' })
  return {
    appointmentType: 'viewing', title: `Viewing: ${listingLabel(listing)}`,
    date: listingBuyerActionText(buyer.proposedDate), startTime: listingBuyerActionText(buyer.proposedTime), timezone: 'Africa/Johannesburg',
    locationType: 'physical_address',
    location: listingLabel(listing),
    status: 'requested', leadId: getListingBuyerActionLeadId(lead), contactId: getListingBuyerActionContactId(lead) || null,
    listingId: getListingBuyerActionListingId(listing), relatedEntityType: 'lead', relatedEntityId: getListingBuyerActionLeadId(lead),
    notes: listingBuyerActionText(buyer.notes), participants, assignedAgent,
    listingViewingMode: buyer.mode === 'book' ? 'three_party_book' : 'three_party_request',
    bookingConfirmationNote: buyer.mode === 'book' ? listingBuyerActionText(buyer.bookingConfirmationNote) : '',
    // The round notification worker owns all three invites and subsequent emails.
    sendInviteEmails: false,
    attachCalendarInvite: true, notifyCreatorOnRsvp: true,
  }
}
