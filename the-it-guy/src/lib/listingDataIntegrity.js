import { isBuyerStyleLead } from './agencyLeadSelection.js'

function text(value) {
  return String(value || '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function result(issues) {
  return {
    ok: issues.length === 0,
    issues,
    message: issues.map((issue) => issue.message).join(' '),
  }
}

function issue(code, message) {
  return { code, message }
}

function listingId(listing = {}) {
  return firstText(listing.id, listing.listingId, listing.listing_id)
}

function organisationId(record = {}) {
  return firstText(record.organisationId, record.organisation_id, record.agencyId, record.agency_id)
}

function leadId(lead = {}) {
  return firstText(lead.leadId, lead.lead_id, lead.id)
}

function contactId(lead = {}) {
  return firstText(lead.contactId, lead.contact_id)
}

/**
 * Validates the CRM record created from guided seller capture before it is
 * allowed to become the source record for a listing.
 */
export function assessSellerLeadPersistence({ organisationId: expectedOrganisationId = '', sellerLead = {}, expectedSeller = {} } = {}) {
  const issues = []
  const expectedOrganisation = text(expectedOrganisationId)
  const actualOrganisation = organisationId(sellerLead)
  const persistedLeadId = leadId(sellerLead)
  const persistedContactId = contactId(sellerLead)
  const expectedEmail = lower(expectedSeller.email)
  const expectedPhone = text(expectedSeller.phone)
  const persistedEmail = lower(firstText(sellerLead.sellerEmail, sellerLead.email))
  const persistedPhone = firstText(sellerLead.sellerPhone, sellerLead.phone)

  if (!expectedOrganisation) issues.push(issue('organisation_missing', 'Organisation context is missing. Reload the workspace and try again.'))
  if (!persistedLeadId) issues.push(issue('seller_lead_missing', 'The seller lead was not persisted. The listing was not created.'))
  if (!persistedContactId) issues.push(issue('seller_contact_missing', 'The seller contact was not persisted. The listing was not created.'))
  if (expectedOrganisation && !actualOrganisation) {
    issues.push(issue('seller_lead_organisation_missing', 'The saved seller lead is missing its organisation. The listing was not created.'))
  }
  if (expectedOrganisation && actualOrganisation && actualOrganisation !== expectedOrganisation) {
    issues.push(issue('seller_lead_organisation_mismatch', 'The seller lead belongs to a different organisation. The listing was not created.'))
  }
  if (expectedEmail && persistedEmail && expectedEmail !== persistedEmail) {
    issues.push(issue('seller_email_mismatch', 'The saved seller email does not match the captured email. Review the seller contact before continuing.'))
  }
  if (expectedPhone && persistedPhone && expectedPhone !== persistedPhone) {
    issues.push(issue('seller_phone_mismatch', 'The saved seller phone does not match the captured phone. Review the seller contact before continuing.'))
  }

  return result(issues)
}

/** Ensures the newly-created listing remains linked to its canonical seller lead. */
export function assessListingSellerLink({ organisationId: expectedOrganisationId = '', listing = {}, sellerLead = {} } = {}) {
  const issues = []
  const expectedOrganisation = text(expectedOrganisationId)
  const actualListingId = listingId(listing)
  const actualOrganisation = organisationId(listing)
  const persistedLeadId = leadId(sellerLead)
  const linkedSellerLeadId = firstText(listing.sellerLeadId, listing.seller_lead_id)
  const linkedOriginatingLeadId = firstText(listing.originatingCrmLeadId, listing.originating_crm_lead_id)

  if (!actualListingId) issues.push(issue('listing_missing', 'The listing record could not be verified after creation.'))
  if (!persistedLeadId) issues.push(issue('seller_lead_missing', 'The listing has no persisted seller lead to link.'))
  if (expectedOrganisation && !actualOrganisation) {
    issues.push(issue('listing_organisation_missing', 'The listing is missing its organisation.'))
  }
  if (!linkedSellerLeadId || !linkedOriginatingLeadId) {
    issues.push(issue('seller_link_missing', 'The listing is missing its seller lead link.'))
  }
  if (persistedLeadId && linkedSellerLeadId && linkedSellerLeadId !== persistedLeadId) {
    issues.push(issue('seller_link_mismatch', 'The listing is linked to a different seller lead.'))
  }
  if (persistedLeadId && linkedOriginatingLeadId && linkedOriginatingLeadId !== persistedLeadId) {
    issues.push(issue('originating_lead_mismatch', 'The listing has a different originating seller lead.'))
  }
  if (expectedOrganisation && actualOrganisation && actualOrganisation !== expectedOrganisation) {
    issues.push(issue('listing_organisation_mismatch', 'The listing belongs to a different organisation.'))
  }

  return result(issues)
}

/** Validates that the buyer selected for an offer can be traced to a real contact and listing. */
export function assessBuyerOfferIntegrity({ organisationId: expectedOrganisationId = '', listing = {}, buyerLead = {} } = {}) {
  const issues = []
  const expectedOrganisation = text(expectedOrganisationId)
  const buyerOrganisation = organisationId(buyerLead)
  const selectedLeadId = leadId(buyerLead)
  const selectedContactId = contactId(buyerLead)
  const contactEmail = lower(firstText(buyerLead.email, buyerLead.buyerEmail))
  const contactPhone = firstText(buyerLead.phone, buyerLead.buyerPhone)

  if (!listingId(listing)) issues.push(issue('listing_missing', 'This listing is not persisted yet. Reload it before creating an offer link.'))
  if (!expectedOrganisation) issues.push(issue('organisation_missing', 'Organisation context is missing. Reload the workspace and try again.'))
  if (!selectedLeadId) issues.push(issue('buyer_lead_missing', 'Select a persisted buyer lead before generating an offer link.'))
  if (!selectedContactId) issues.push(issue('buyer_contact_missing', 'The selected buyer lead has no linked contact. Repair the buyer lead before generating an offer link.'))
  if (!contactEmail && !contactPhone) issues.push(issue('buyer_contact_channel_missing', 'Add a buyer email or phone number before generating an offer link.'))
  if (expectedOrganisation && !buyerOrganisation) {
    issues.push(issue('buyer_organisation_missing', 'The selected buyer is missing its organisation. Repair the buyer lead before generating an offer link.'))
  }
  if (expectedOrganisation && buyerOrganisation && buyerOrganisation !== expectedOrganisation) {
    issues.push(issue('buyer_organisation_mismatch', 'The selected buyer belongs to a different organisation.'))
  }

  return result(issues)
}

/**
 * A small, operational offer gate for the pilot. It prevents an agent from
 * creating an offer against the wrong/inactive CRM record, but leaves finance
 * and affordability information as explicit follow-up warnings rather than
 * blocking legitimate agent-assisted offers.
 */
export function assessBuyerOfferEligibility({ organisationId: expectedOrganisationId = '', listing = {}, buyerLead = {} } = {}) {
  const integrity = assessBuyerOfferIntegrity({
    organisationId: expectedOrganisationId,
    listing,
    buyerLead,
  })
  const blockers = [...integrity.issues]
  const warnings = []
  const stage = lower(firstText(buyerLead.stage, buyerLead.buyerStage, buyerLead.leadStage, buyerLead.status))
  const budget = Number(buyerLead.budget || buyerLead.buyerBudget || buyerLead.maximumBudget || buyerLead.maxBudget || 0)
  const listingPrice = Number(listing.askingPrice || listing.estimatedValue || 0)

  if (leadId(buyerLead) && !isBuyerStyleLead(buyerLead)) {
    blockers.push(issue('buyer_type_invalid', 'The selected lead is not marked as a buyer or investor. Update the lead type before creating an offer.'))
  }
  if (['lost', 'withdrawn', 'archived', 'inactive'].some((value) => stage.includes(value))) {
    blockers.push(issue('buyer_inactive', 'The selected buyer lead is inactive. Reactivate or select an active buyer before creating an offer.'))
  }
  if (!isLeadLinkedToListingRecord(buyerLead, listing)) {
    warnings.push(issue('buyer_not_linked_to_listing', 'This buyer is not yet linked to the listing. Arch9 will link the buyer when the offer is created.'))
  }
  if (!budget) {
    warnings.push(issue('buyer_budget_unknown', 'Buyer budget has not been recorded. Confirm affordability before accepting an offer.'))
  } else if (listingPrice && budget < listingPrice) {
    warnings.push(issue('buyer_budget_below_listing', 'Recorded buyer budget is below the asking price. Confirm funding before accepting an offer.'))
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    warnings,
    integrity,
    message: blockers.map((item) => item.message).join(' '),
  }
}

function isLeadLinkedToListingRecord(lead = {}, listing = {}) {
  const targetListingId = listingId(listing)
  if (!targetListingId) return false
  return [lead.listingId, lead.listing_id, lead.enquiredListingId, lead.enquired_listing_id, lead.unitId, lead.unit_id]
    .map(text)
    .includes(targetListingId)
}

/** Validates the minimum persisted context before creating or sending seller onboarding. */
export function assessSellerOnboardingIntegrity({ organisationId: expectedOrganisationId = '', listing = {} } = {}) {
  const issues = []
  const expectedOrganisation = text(expectedOrganisationId)
  const actualOrganisation = organisationId(listing)

  if (!listingId(listing)) issues.push(issue('listing_missing', 'This listing is not persisted yet. Save the listing before sending onboarding.'))
  if (!expectedOrganisation) issues.push(issue('organisation_missing', 'Organisation context is missing. Reload the workspace and try again.'))
  if (expectedOrganisation && !actualOrganisation) {
    issues.push(issue('listing_organisation_missing', 'This listing is missing its organisation.'))
  }
  if (expectedOrganisation && actualOrganisation && actualOrganisation !== expectedOrganisation) {
    issues.push(issue('listing_organisation_mismatch', 'This listing belongs to a different organisation.'))
  }

  return result(issues)
}
