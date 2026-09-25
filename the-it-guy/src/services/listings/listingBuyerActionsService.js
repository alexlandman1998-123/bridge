import { createAgencyCrmLeadRecord } from '../../lib/agencyCrmRepository.js'
import { createAppointmentAsync } from '../../lib/agencyPipelineService.js'
import { upsertLeadListingInterest } from '../leadListingInterestService.js'
import {
  buildListingBuyerActorSnapshot,
  buildListingBuyerLeadPayload,
  buildListingViewingAppointmentPayload,
  getListingBuyerActionContactId,
  getListingBuyerActionLeadId,
  getListingBuyerActionListingId,
  listingBuyerActionId,
  listingBuyerActionText,
  validateListingBuyerLeadDraft,
  validateListingViewingDraft,
} from './listingBuyerActionsModel.js'

export {
  LISTING_BUYER_LEAD_PRIORITIES,
  LISTING_BUYER_LEAD_SOURCES,
  buildListingBuyerLeadPayload,
  buildListingViewingAppointmentPayload,
  createListingBuyerLeadDraft,
  createListingViewingDraft,
  getListingBuyerActionPropertyAddress,
  validateListingBuyerLeadDraft,
  validateListingViewingDraft,
} from './listingBuyerActionsModel.js'

async function linkBuyerToListing({ organisationId, listing, lead, status = 'interested', source = 'manual', notes = '', actor = {} }) {
  try {
    const interest = await upsertLeadListingInterest({
      organisationId,
      leadId: getListingBuyerActionLeadId(lead),
      contactId: getListingBuyerActionContactId(lead),
      listingId: getListingBuyerActionListingId(listing),
      source,
      status,
      notes,
      isOriginalEnquiry: true,
      isAgentSelected: true,
      createdBy: listingBuyerActionId(actor.id || actor.userId || actor.user_id),
    }, { actor: buildListingBuyerActorSnapshot(actor) })
    return { interest, warning: '' }
  } catch (error) {
    return { interest: null, warning: error?.message || 'The buyer was saved, but the listing-interest link could not be refreshed.' }
  }
}

export async function createListingBuyerLead({ organisationId = '', listing = {}, buyer = {}, actor = {} } = {}) {
  const errors = validateListingBuyerLeadDraft(buyer)
  if (errors.length) throw new Error(errors[0])
  if (!listingBuyerActionId(organisationId) || !getListingBuyerActionListingId(listing)) {
    throw new Error('A saved listing and organisation are required before adding a buyer lead.')
  }
  const lead = await createAgencyCrmLeadRecord(
    organisationId,
    buildListingBuyerLeadPayload({ listing, buyer, actor }),
    { actor: buildListingBuyerActorSnapshot(actor) },
  )
  const link = await linkBuyerToListing({
    organisationId,
    listing,
    lead,
    status: 'interested',
    source: 'listing_workspace_manual',
    notes: listingBuyerActionText(buyer.notes),
    actor,
  })
  return { lead, interest: link.interest, warning: link.warning }
}

export async function createListingViewingRequest({ organisationId = '', listing = {}, buyer = {}, seller = {}, existingLead = null, actor = {} } = {}) {
  const errors = validateListingViewingDraft(buyer, seller)
  if (errors.length) throw new Error(errors[0])
  if (!listingBuyerActionId(organisationId) || !getListingBuyerActionListingId(listing)) {
    throw new Error('A saved listing and organisation are required before requesting a viewing.')
  }

  let lead = existingLead && getListingBuyerActionLeadId(existingLead) ? existingLead : null
  let leadWarning = ''
  if (!lead) {
    const created = await createListingBuyerLead({
      organisationId,
      listing,
      buyer: { ...buyer, leadSource: buyer.leadSource || 'Manual Entry', priority: buyer.priority || 'Medium' },
      actor,
    })
    lead = created.lead
    leadWarning = created.warning
  }

  const appointment = await createAppointmentAsync(
    organisationId,
    buildListingViewingAppointmentPayload({ listing, buyer, seller, lead, actor }),
    { actor: buildListingBuyerActorSnapshot(actor) },
  )
  const link = await linkBuyerToListing({
    organisationId,
    listing,
    lead,
    status: 'viewing_scheduled',
    source: 'listing_workspace_viewing',
    notes: listingBuyerActionText(buyer.notes),
    actor,
  })
  return { lead, appointment, warning: [leadWarning, link.warning].filter(Boolean).join(' ') }
}
