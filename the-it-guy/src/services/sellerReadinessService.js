import {
  buildSellerJourney,
  isSellerLead,
} from './sellerJourneyService.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function firstPresent(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function hasContact({ lead = {}, contact = {} } = {}) {
  return Boolean(firstPresent(contact?.phone, contact?.email, lead?.phone, lead?.email, lead?.sellerPhone, lead?.sellerEmail, lead?.seller_phone, lead?.seller_email))
}

function propertyAddress({ lead = {}, listing = {} } = {}) {
  return firstPresent(
    listing?.propertyAddress,
    listing?.property_address,
    listing?.address,
    listing?.addressLine1,
    listing?.address_line_1,
    lead?.sellerPropertyAddress,
    lead?.seller_property_address,
    lead?.propertyInterest,
    lead?.property_interest,
  )
}

function appointmentCompleted(journey = {}) {
  return journey?.valuationStatus === 'Completed'
}

function onboardingSent(journey = {}) {
  return journey?.onboardingSent === true
}

function onboardingSubmitted(journey = {}) {
  return journey?.onboardingSubmitted === true
}

function documentComplete(document = {}) {
  const status = normalizeKey(document?.status || document?.documentStatus || document?.document_status)
  return Boolean(document?.url) || ['uploaded', 'approved', 'verified', 'accepted', 'complete', 'completed'].includes(status)
}

function requiredDocumentsComplete(journey = {}) {
  const documents = Array.isArray(journey.documents) ? journey.documents : []
  if (!documents.length) return false
  return documents.every(documentComplete)
}

function listingImages(listing = {}) {
  return [
    ...(Array.isArray(listing?.galleryImages) ? listing.galleryImages : []),
    ...(Array.isArray(listing?.gallery_images) ? listing.gallery_images : []),
    ...(Array.isArray(listing?.images) ? listing.images : []),
    ...(Array.isArray(listing?.photos) ? listing.photos : []),
    ...(Array.isArray(listing?.media) ? listing.media : []),
    listing?.coverImage,
    listing?.cover_image,
    listing?.imageUrl,
    listing?.image_url,
    listing?.thumbnailUrl,
    listing?.thumbnail_url,
  ].filter(Boolean)
}

function listingExternalLinks(listing = {}) {
  return [
    ...(Array.isArray(listing?.externalLinks) ? listing.externalLinks : []),
    ...(Array.isArray(listing?.external_links) ? listing.external_links : []),
    ...(Array.isArray(listing?.listingExternalLinks) ? listing.listingExternalLinks : []),
    ...(Array.isArray(listing?.listing_external_links) ? listing.listing_external_links : []),
    ...(Array.isArray(listing?.marketing?.externalLinks) ? listing.marketing.externalLinks : []),
  ].filter(Boolean)
}

function listingDescription(listing = {}) {
  return firstPresent(
    listing?.description,
    listing?.propertyDescription,
    listing?.property_description,
    listing?.marketing?.description,
    listing?.propertyNotes,
    listing?.property_notes,
  )
}

function listingPrice(listing = {}, lead = {}) {
  return toNumber(
    listing?.askingPrice ||
      listing?.asking_price ||
      listing?.price ||
      listing?.listPrice ||
      listing?.list_price ||
      listing?.propertyDetails?.price ||
      lead?.estimatedValue ||
      lead?.estimated_value,
  )
}

function complianceDocumentComplete(journey = {}, listing = {}) {
  const documents = [
    ...(Array.isArray(journey.documents) ? journey.documents : []),
    ...(Array.isArray(listing?.documents) ? listing.documents : []),
  ]
  const complianceDocs = documents.filter((document) => {
    const signal = normalizeKey([
      document?.label,
      document?.name,
      document?.title,
      document?.documentType,
      document?.document_type,
      document?.category,
    ].join(' '))
    return /(compliance|certificate|coc|electrical|electric|gas|beetle|plumbing|rates|title_deed|hoa|body_corporate)/.test(signal)
  })
  if (complianceDocs.length) return complianceDocs.some(documentComplete)
  return requiredDocumentsComplete(journey)
}

export function getListingReadiness({ lead = {}, listing = {}, journey = null } = {}) {
  const resolvedJourney = journey || buildSellerJourney({ lead, listing })
  const hasListing = Boolean(resolvedJourney.listingCreated)
  const photosComplete = listingImages(listing).length > 0
  const descriptionComplete = Boolean(listingDescription(listing))
  const pricingComplete = listingPrice(listing, lead) > 0
  const complianceComplete = complianceDocumentComplete(resolvedJourney, listing)
  const visibilityComplete = resolvedJourney.listingLive || listingExternalLinks(listing).some((link) => link?.url || link?.listingUrl)
  const items = [
    { key: 'photos', label: 'Photos', complete: photosComplete, blocker: 'Missing Photos' },
    { key: 'description', label: 'Description', complete: descriptionComplete, blocker: 'Missing Description' },
    { key: 'pricing', label: 'Pricing', complete: pricingComplete, blocker: 'Missing Pricing' },
    { key: 'compliance', label: 'Compliance', complete: complianceComplete, blocker: 'Missing Compliance Docs' },
    { key: 'visibility', label: 'Visibility', complete: visibilityComplete, blocker: 'Listing In Draft' },
  ]
  const incompleteItems = hasListing ? items.filter((item) => !item.complete) : [
    { key: 'listing', label: 'Listing', complete: false, blocker: 'Listing Not Created' },
  ]
  return {
    hasListing,
    items,
    incompleteItems,
    complete: hasListing && incompleteItems.length === 0,
    completedCount: items.filter((item) => item.complete).length,
    totalCount: items.length,
    percent: items.length ? Math.round((items.filter((item) => item.complete).length / items.length) * 100) : 0,
  }
}

function blocker(id, label, category, actionId, severity = 'blocked', sellerMessage = '') {
  return {
    id,
    label,
    category,
    actionId,
    severity,
    sellerMessage: sellerMessage || label,
  }
}

export function getSellerBlockers({ lead = {}, contact = {}, appointments = [], listing = null, mandatePacketStatus = null, mandatePacket = null, documents = [], journey = null } = {}) {
  const resolvedJourney = journey || buildSellerJourney({ lead, contact, appointments, listing, mandatePacketStatus, mandatePacket, documents })
  if (!isSellerLead(lead) && !resolvedJourney.isSeller) return []
  const listingReadiness = getListingReadiness({ lead, listing: listing || {}, journey: resolvedJourney })
  const blockers = []
  const contactReady = hasContact({ lead, contact })
  const addressReady = Boolean(propertyAddress({ lead, listing: listing || {} }))
  if (!contactReady) blockers.push(blocker('missing_seller_contact', 'Missing Seller Contact', 'valuation', 'contact_seller', 'blocked', 'Your agent needs seller contact details.'))
  if (!addressReady) blockers.push(blocker('missing_property_address', 'Missing Property Address', 'valuation', 'capture_property_address', 'blocked', 'Your agent needs the property address.'))

  if (resolvedJourney.mandateStatus !== 'not_started' && resolvedJourney.mandateStatus !== 'signed') {
    if (!appointmentCompleted(resolvedJourney)) {
      blockers.push(blocker('valuation_not_completed', 'Valuation Not Completed', 'mandate', 'mark_valuation_complete', 'blocked', 'Your valuation still needs to be completed.'))
    }
  }

  if (onboardingSent(resolvedJourney) && !onboardingSubmitted(resolvedJourney) && resolvedJourney.mandateStatus === 'not_started') {
    blockers.push(blocker('seller_onboarding_not_submitted', 'Seller Onboarding Not Submitted', 'onboarding', 'open_seller_portal', 'action_required', 'Seller onboarding is still waiting to be submitted.'))
  }

  if (resolvedJourney.mandateStatus === 'sent') {
    blockers.push(blocker('mandate_signature_outstanding', 'Mandate Signature Outstanding', 'mandate', 'check_signature_status', 'action_required', 'Your mandate is waiting for signature.'))
  }

  if (resolvedJourney.stage?.key === 'mandate_sent' && resolvedJourney.mandateStatus === 'not_started') {
    blockers.push(blocker('mandate_not_generated', 'Mandate Not Generated', 'mandate', 'generate_mandate', 'blocked', 'Your mandate has not been prepared yet.'))
  }

  if ((resolvedJourney.stage?.key === 'mandate_signed' || resolvedJourney.stage?.key === 'listing_created') && resolvedJourney.mandateStatus !== 'signed') {
    blockers.push(blocker('mandate_not_signed', 'Mandate Not Signed', 'listing', 'check_signature_status', 'blocked', 'Your signed mandate is required before listing.'))
  }

  if (resolvedJourney.mandateStatus === 'signed' && !resolvedJourney.listingCreated && !requiredDocumentsComplete(resolvedJourney)) {
    blockers.push(blocker('required_documents_missing', 'Required Documents Missing', 'listing', 'open_documents', 'blocked', 'Some property documents are still outstanding.'))
  }

  if (resolvedJourney.listingCreated && !resolvedJourney.listingLive) {
    for (const item of listingReadiness.incompleteItems) {
      blockers.push(blocker(`listing_${item.key}_incomplete`, item.blocker, 'listing_live', item.key === 'visibility' ? 'activate_listing' : 'complete_listing', item.key === 'visibility' ? 'action_required' : 'blocked', item.key === 'visibility' ? 'Your listing is being prepared for publishing.' : `${item.label} still needs attention.`))
    }
  }

  return blockers
}

export function canScheduleValuation(args = {}) {
  const blockers = getSellerBlockers(args)
  return !blockers.some((item) => ['missing_seller_contact', 'missing_property_address'].includes(item.id))
}

export function canSendMandate(args = {}) {
  const journey = args.journey || buildSellerJourney(args)
  const blockers = getSellerBlockers({ ...args, journey })
  return journey.mandateStatus === 'draft' && appointmentCompleted(journey) && onboardingSubmitted(journey) && !blockers.some((item) => item.category === 'valuation' || item.category === 'onboarding')
}

export function canCreateListing(args = {}) {
  const journey = args.journey || buildSellerJourney(args)
  const blockers = getSellerBlockers({ ...args, journey })
  return journey.mandateStatus === 'signed' && !journey.listingCreated && !blockers.some((item) => item.category === 'listing')
}

export function canActivateListing(args = {}) {
  const journey = args.journey || buildSellerJourney(args)
  const listingReadiness = getListingReadiness({ lead: args.lead, listing: args.listing || {}, journey })
  const blockers = getSellerBlockers({ ...args, journey })
  return journey.listingCreated && !journey.listingLive && journey.mandateStatus === 'signed' && listingReadiness.complete && !blockers.some((item) => item.severity === 'blocked')
}

function action(id, label, enabled = true, reason = '', meta = {}) {
  return {
    id,
    label,
    enabled,
    disabled: !enabled,
    reason: enabled ? '' : reason || 'Not available yet',
    ...meta,
  }
}

export function getNextSellerAction(args = {}) {
  const journey = args.journey || buildSellerJourney(args)
  const blockers = getSellerBlockers({ ...args, journey })
  const blocking = blockers.find((item) => item.severity === 'blocked') || blockers[0] || null
  if (blocking?.id === 'missing_seller_contact') return action('contact_seller', 'Contact Seller', true, '', { blocker: blocking })
  if (blocking?.id === 'missing_property_address') return action('capture_property_address', 'Capture Property Address', true, '', { blocker: blocking })
  if (blocking?.id === 'seller_onboarding_not_submitted') return action('open_seller_portal', 'Track Seller Onboarding', true, '', { blocker: blocking })
  if (blocking?.id === 'valuation_not_completed') return action('mark_valuation_complete', 'Complete Valuation', true, '', { blocker: blocking })
  if (blocking?.id === 'required_documents_missing') return action('open_documents', 'Open Documents', true, '', { blocker: blocking })
  if (blocking?.category === 'listing_live') return action(blocking.actionId || 'complete_listing', blocking.actionId === 'activate_listing' ? 'Activate Listing' : 'Complete Listing', true, '', { blocker: blocking })
  if (journey.listingLive) return action('monitor_performance', 'Monitor Performance')
  if (journey.listingCreated) return action('activate_listing', 'Activate Listing', canActivateListing({ ...args, journey }), blockers.find((item) => item.category === 'listing_live')?.label || '', { blocker: blockers.find((item) => item.category === 'listing_live') || null })
  if (journey.mandateStatus === 'signed') return action('create_listing', 'Create Listing', canCreateListing({ ...args, journey }), blocking?.label || '', { blocker: blocking })
  if (journey.mandateStatus === 'sent') return action('check_signature_status', 'Track Signature', true, '', { blocker: blockers.find((item) => item.id === 'mandate_signature_outstanding') || null })
  if (appointmentCompleted(journey) && !onboardingSent(journey)) return action('open_seller_portal', 'Send Seller Onboarding')
  if (appointmentCompleted(journey) && !onboardingSubmitted(journey)) return action('open_seller_portal', 'Track Seller Onboarding')
  if (journey.mandateStatus === 'draft') return action('send_mandate', 'Send Mandate', canSendMandate({ ...args, journey }), blocking?.label || '', { blocker: blocking })
  if (appointmentCompleted(journey)) return action('generate_mandate', 'Generate Mandate')
  if (journey.valuationAppointment) return action('mark_valuation_complete', 'Complete Valuation')
  return action('schedule_valuation', 'Schedule Valuation', canScheduleValuation({ ...args, journey }), blocking?.label || '', { blocker: blocking })
}

export function getSellerReadiness(args = {}) {
  const journey = args.journey || buildSellerJourney(args)
  const blockers = getSellerBlockers({ ...args, journey })
  const listingReadiness = getListingReadiness({ lead: args.lead, listing: args.listing || journey.listing || {}, journey })
  const nextAction = getNextSellerAction({ ...args, journey })
  const readinessStatus = journey.listingLive
    ? 'completed'
    : blockers.some((item) => item.severity === 'blocked')
      ? 'blocked'
      : blockers.length
        ? 'action_required'
        : 'ready'
  const readinessLabel = readinessStatus === 'completed'
    ? 'Listing Live'
    : readinessStatus === 'blocked'
      ? blockers[0]?.label || 'Blocked'
      : readinessStatus === 'action_required'
        ? blockers[0]?.label || nextAction.label
        : `Ready To ${nextAction.label}`
  const actions = getStageAwareSellerActions({ ...args, journey, blockers, nextAction, listingReadiness })
  return {
    journey,
    stage: journey.stage,
    readinessStatus,
    readinessLabel,
    blockers,
    listingReadiness,
    nextAction,
    actions,
    canScheduleValuation: canScheduleValuation({ ...args, journey }),
    canSendMandate: canSendMandate({ ...args, journey }),
    canCreateListing: canCreateListing({ ...args, journey }),
    canActivateListing: canActivateListing({ ...args, journey }),
  }
}

export function getStageAwareSellerActions({ lead = {}, contact = {}, appointments = [], listing = null, mandatePacketStatus = null, mandatePacket = null, documents = [], journey = null, blockers = null, nextAction = null } = {}) {
  const resolvedJourney = journey || buildSellerJourney({ lead, contact, appointments, listing, mandatePacketStatus, mandatePacket, documents })
  const resolvedBlockers = blockers || getSellerBlockers({ lead, contact, appointments, listing, mandatePacketStatus, mandatePacket, documents, journey: resolvedJourney })
  const resolvedNextAction = nextAction || getNextSellerAction({ lead, contact, appointments, listing, mandatePacketStatus, mandatePacket, documents, journey: resolvedJourney })
  const blockedReason = (actionId) => resolvedBlockers.find((item) => item.actionId === actionId)?.label || ''
  const make = (id, label, enabled = true, meta = {}) => action(id, label, enabled, blockedReason(id), meta)
  const always = [
    make('contact_seller', 'Contact Seller', hasContact({ lead, contact })),
    make('open_timeline', 'Open Timeline'),
  ]
  const stageKey = resolvedJourney.stage?.key || 'contacted'
  const stageActions = stageKey === 'contacted'
    ? [make('schedule_valuation', 'Schedule Valuation', canScheduleValuation({ lead, contact, appointments, listing, mandatePacketStatus, mandatePacket, documents, journey: resolvedJourney })), ...always]
    : stageKey === 'appointment_valuation'
      ? [
        make('open_appointment', 'Open Appointment', Boolean(resolvedJourney.valuationAppointment)),
        make('mark_valuation_complete', 'Mark Valuation Complete', Boolean(resolvedJourney.valuationAppointment)),
        make('generate_mandate', 'Generate Mandate', appointmentCompleted(resolvedJourney)),
      ]
      : stageKey === 'seller_onboarding_sent'
        ? [
          make('open_seller_portal', 'Open Seller Portal', true),
          make('contact_seller', 'Contact Seller', hasContact({ lead, contact })),
          make('generate_mandate', 'Generate Mandate', false),
        ]
        : stageKey === 'seller_onboarding_submitted'
          ? [
            make('open_seller_portal', 'Open Seller Portal', true),
            make('generate_mandate', 'Generate Mandate', true),
            make('send_mandate', 'Send Mandate', canSendMandate({ lead, contact, appointments, listing, mandatePacketStatus, mandatePacket, documents, journey: resolvedJourney })),
          ]
      : stageKey === 'mandate_sent'
        ? resolvedJourney.mandateStatus === 'draft'
          ? [
            make('view_mandate', 'View Mandate', true),
            make('send_mandate', 'Send Mandate', canSendMandate({ lead, contact, appointments, listing, mandatePacketStatus, mandatePacket, documents, journey: resolvedJourney })),
            make('open_seller_portal', 'Open Seller Portal', Boolean(firstPresent(lead?.sellerOnboardingToken, lead?.seller_onboarding_token, listing?.sellerOnboarding?.token))),
          ]
          : [
            make('view_mandate', 'View Mandate', true),
            make('check_signature_status', 'Check Signature Status', true),
            make('resend_mandate', 'Resend Mandate', true),
          ]
        : stageKey === 'mandate_signed'
          ? [
            make('create_listing', 'Create Listing', canCreateListing({ lead, contact, appointments, listing, mandatePacketStatus, mandatePacket, documents, journey: resolvedJourney })),
            make('open_documents', 'Open Documents', true),
            make('open_seller_portal', 'Open Seller Portal', Boolean(firstPresent(lead?.sellerOnboardingToken, lead?.seller_onboarding_token, listing?.sellerOnboarding?.token))),
          ]
          : stageKey === 'listing_created'
            ? [
              make('open_listing', 'Open Listing', resolvedJourney.listingCreated),
              make('complete_listing', 'Complete Listing', resolvedJourney.listingCreated),
              make('activate_listing', 'Activate Listing', canActivateListing({ lead, contact, appointments, listing, mandatePacketStatus, mandatePacket, documents, journey: resolvedJourney })),
            ]
            : [
              make('open_listing', 'Open Listing', resolvedJourney.listingCreated),
              make('view_enquiries', 'View Enquiries', resolvedJourney.listingLive),
              make('view_performance', 'View Performance', resolvedJourney.listingLive),
            ]
  return stageActions.map((item) => ({
    ...item,
    primary: item.id === resolvedNextAction.id,
  }))
}

export function buildSellerReadinessSummary(args = {}) {
  const readiness = getSellerReadiness(args)
  return {
    currentStage: readiness.stage?.label || 'Contacted',
    readiness: readiness.readinessStatus,
    readinessLabel: readiness.readinessLabel,
    nextAction: readiness.nextAction,
    blockers: readiness.blockers,
    listingReadiness: readiness.listingReadiness,
    actions: readiness.actions,
    kpis: [
      { key: 'current_stage', label: 'Current Stage', value: readiness.stage?.label || 'Contacted' },
      { key: 'readiness', label: 'Readiness', value: readiness.readinessLabel, status: readiness.readinessStatus },
      { key: 'next_action', label: 'Next Action', value: readiness.nextAction?.label || 'Review seller journey' },
      { key: 'days_in_stage', label: 'Days In Stage', value: readiness.journey?.daysInCurrentStage || 0, suffix: 'days' },
    ],
  }
}

export const __sellerReadinessServiceTestUtils = {
  complianceDocumentComplete,
  documentComplete,
  getListingReadiness,
  hasContact,
  propertyAddress,
  requiredDocumentsComplete,
}
