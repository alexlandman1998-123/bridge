import { evaluateMvpLaunchScope, formatMvpLaunchScopeIssue } from './mvpLaunchScope.js'

export const ACCEPTED_OFFER_CONVERSION_PREFLIGHT_VERSION = 'arch9_accepted_offer_conversion_preflight_v1'

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function positiveNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
}

function check(key, label, status, detail, action = '') {
  return { key, label, status, detail, action }
}

function isAcceptedOrConverted(offer = {}) {
  return ['accepted', 'converted_to_transaction'].includes(lower(offer.status))
}

function isReusableConversion(offer = {}) {
  return Boolean(
    firstText(offer.transactionId, offer.transaction_id) ||
      lower(offer.status) === 'converted_to_transaction',
  )
}

function routingAction(issue = {}) {
  if (issue.code === 'outside_mvp_launch_scope' || issue.code === 'developer_seller_requires_development_sale') {
    return 'Route this one manually or update the transaction facts to a supported MVP scenario.'
  }
  if (issue.field === 'financeType') return 'Capture cash, bond, or hybrid finance on the offer or buyer qualification.'
  if (issue.field === 'propertyTenure') return 'Capture freehold, sectional title, or estate HOA on the listing/seller onboarding.'
  if (issue.field === 'buyerEntityType') return 'Capture whether the buyer is an individual, company, or trust.'
  if (issue.field === 'sellerEntityType') return 'Capture whether the seller is an individual, company, trust, or developer.'
  if (issue.field === 'transactionType') return 'Confirm whether this is a resale, private sale, or development sale.'
  return 'Complete the missing transaction routing fact.'
}

function routingChecks(routingProfile = {}, { allowIncompleteRoutingFacts = false } = {}) {
  const launchScope = routingProfile.launchScope || evaluateMvpLaunchScope(routingProfile)
  if (launchScope.supported) {
    return [
      check(
        'routing_scope',
        'MVP routing facts',
        'complete',
        [
          routingProfile.transactionType,
          routingProfile.financeType,
          routingProfile.propertyTenure,
          routingProfile.buyerEntityType,
          routingProfile.sellerEntityType,
        ].map(text).filter(Boolean).join(' + '),
      ),
    ]
  }
  return launchScope.issues.map((issue) => check(
    `routing_${issue.field}`,
    issue.label || issue.field,
    issue.code === 'missing_required_routing_fact' && allowIncompleteRoutingFacts ? 'warning' : issue.code === 'missing_required_routing_fact' ? 'blocked' : 'out_of_scope',
    formatMvpLaunchScopeIssue(issue),
    routingAction(issue),
  ))
}

export function buildAcceptedOfferConversionPreflight({
  organisationId = '',
  offer = {},
  lead = {},
  listing = {},
  actor = {},
  routingProfile = {},
  allowIncompleteRoutingFacts = false,
} = {}) {
  const offerId = firstText(offer.id, offer.offerId, offer.offer_id)
  const listingId = firstText(offer.listingId, offer.listing_id, listing.id, listing.listingId, lead.listingId, lead.listing_id)
  const leadId = firstText(offer.buyerLeadId, offer.buyer_lead_id, lead.leadId, lead.lead_id)
  const buyerContactId = firstText(offer.buyerContactId, offer.buyer_contact_id, lead.contactId, lead.contact_id)
  const offerSelected = Boolean(offerId)
  const accepted = isAcceptedOrConverted(offer)
  const reusable = isReusableConversion(offer)
  const assignedAgent = firstText(
    offer.agentId,
    offer.agent_id,
    lead.assignedAgentId,
    lead.assigned_agent_id,
    actor.id,
    offer.agentEmail,
    offer.agent_email,
    lead.assignedAgentEmail,
    lead.assigned_agent_email,
    actor.email,
  )

  const baseChecks = [
    check(
      'organisation',
      'Organisation context',
      firstText(organisationId, offer.organisationId, offer.organisation_id) ? 'complete' : 'blocked',
      firstText(organisationId, offer.organisationId, offer.organisation_id) ? 'Organisation found.' : 'No organisation id found.',
      'Refresh inside the correct agency workspace.',
    ),
    check(
      'accepted_offer',
      'Accepted offer',
      offerId && accepted ? 'complete' : offerId ? 'blocked' : 'pending',
      offerId && accepted ? 'Offer is accepted and can be converted.' : offerId ? 'Offer must be accepted before conversion.' : 'No accepted offer selected.',
      'Accept the seller-approved offer before creating a transaction.',
    ),
    check(
      'buyer_lead',
      'Buyer lead',
      !offerSelected ? 'pending' : leadId || buyerContactId ? 'complete' : 'blocked',
      !offerSelected ? 'Waiting for accepted offer.' : leadId || buyerContactId ? 'Buyer lead/contact is linked.' : 'No buyer lead or buyer contact is linked to the offer.',
      'Link the offer back to the buyer lead/contact.',
    ),
    check(
      'listing',
      'Listing/property',
      !offerSelected ? 'pending' : listingId ? 'complete' : 'blocked',
      !offerSelected ? 'Waiting for accepted offer.' : listingId ? 'Listing id is available.' : 'No listing/property id is linked to the offer.',
      'Select the listing/property before converting.',
    ),
    check(
      'offer_amount',
      'Offer amount',
      !offerSelected ? 'pending' : positiveNumber(offer.offerAmount || offer.offer_amount) || reusable ? 'complete' : 'blocked',
      !offerSelected ? 'Waiting for accepted offer.' : positiveNumber(offer.offerAmount || offer.offer_amount) ? 'Purchase price is available.' : reusable ? 'Existing transaction can be reused.' : 'Offer amount is missing.',
      'Capture the accepted purchase price on the offer.',
    ),
    check(
      'assigned_agent',
      'Assigned agent',
      !offerSelected ? 'pending' : assignedAgent || routingProfile.transactionType === 'development_sale' || reusable ? 'complete' : 'blocked',
      !offerSelected ? 'Waiting for accepted offer.' : assignedAgent ? 'Assigned agent found.' : reusable ? 'Existing transaction can be reused.' : 'Assigned agent id/email is missing.',
      'Assign the buyer lead or offer to an agent before conversion.',
    ),
  ]

  const checks = reusable
    ? [
        ...baseChecks,
        check('existing_transaction', 'Existing transaction', 'complete', 'Offer is already linked to a transaction.'),
      ]
    : accepted && offerId
      ? [
        ...baseChecks,
        ...routingChecks(routingProfile, { allowIncompleteRoutingFacts }),
      ]
      : baseChecks
  const blockers = checks.filter((item) => item.status === 'blocked' || item.status === 'out_of_scope')
  const pending = checks.filter((item) => item.status === 'pending')
  const nextFix = blockers[0] || pending[0] || null

  return {
    version: ACCEPTED_OFFER_CONVERSION_PREFLIGHT_VERSION,
    status: blockers.length ? 'blocked' : pending.length ? 'pending' : reusable ? 'reusable' : 'ready',
    canConvert: blockers.length === 0 && pending.length === 0,
    reusable,
    checks,
    blockers,
    nextFix,
    summary: {
      completeCount: checks.filter((item) => item.status === 'complete').length,
      total: checks.length,
      blockerCount: blockers.length,
      pendingCount: pending.length,
    },
    routingProfile,
  }
}

export function formatAcceptedOfferConversionPreflightMessage(preflight = {}) {
  if (preflight.canConvert) return ''
  const nextFix = preflight.nextFix || preflight.blockers?.[0]
  if (!nextFix) return 'Accepted offer conversion needs attention before the transaction can be created.'
  return `${nextFix.detail || nextFix.label} ${nextFix.action || ''}`.trim()
}
