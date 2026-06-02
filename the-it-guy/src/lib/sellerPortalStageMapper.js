export const SELLER_PORTAL_STAGES = [
  {
    key: 'mandate_signed',
    label: 'Sign Mandate',
    shortLabel: 'Mandate',
    message: 'Your onboarding is submitted. The next step is to review and sign your mandate.',
    nextStepTitle: 'Sign your mandate',
    nextStepDescription: 'Your agent will prepare the mandate from your onboarding details and share it here for signature.',
    primaryAction: 'View documents',
    primaryRoute: 'documents',
  },
  {
    key: 'listed',
    label: 'Listed',
    shortLabel: 'Listed',
    message: 'Good news! Your property is live and buyer interest is being tracked.',
    nextStepTitle: 'Your property is currently being marketed to buyers.',
    nextStepDescription: 'Your agent will keep you updated on appointments, buyer interest, and listing performance.',
    primaryAction: 'View appointments',
    primaryRoute: 'appointments',
  },
  {
    key: 'offers',
    label: 'Offers',
    shortLabel: 'Offers',
    message: 'Good news! Your property is live and we are receiving buyer interest.',
    nextStepTitle: 'Review offers with your agent',
    nextStepDescription: 'Your agent will present all offers received and advise you on the best next steps.',
    primaryAction: 'View offers',
    primaryRoute: 'offers',
  },
  {
    key: 'offer_accepted',
    label: 'Offer Accepted',
    shortLabel: 'Accepted',
    message: 'An offer has been accepted and the sale is moving into the agreement and transfer process.',
    nextStepTitle: 'Your accepted offer is being processed',
    nextStepDescription: 'Your transaction team is preparing the next documents and transfer instructions.',
    primaryAction: 'View documents',
    primaryRoute: 'documents',
  },
  {
    key: 'transfer',
    label: 'Transfer',
    shortLabel: 'Transfer',
    message: 'The attorneys are progressing the legal transfer process.',
    nextStepTitle: 'The attorneys are progressing transfer',
    nextStepDescription: 'Your agent and conveyancing team will share document requests and registration updates here.',
    primaryAction: 'View documents',
    primaryRoute: 'documents',
  },
  {
    key: 'registered',
    label: 'Registered',
    shortLabel: 'Registered',
    message: 'Your sale has been registered. The transaction is complete.',
    nextStepTitle: 'Your sale is registered',
    nextStepDescription: 'Your secure workspace remains available for final documents and records.',
    primaryAction: 'View documents',
    primaryRoute: 'documents',
  },
]

const SELLER_STAGE_KEYWORDS = {
  mandate_signed: [
    'mandate_signed',
    'mandate_completed',
    'fully_signed',
    'signed_mandate',
    'seller_signed',
    'mandate',
  ],
  listed: [
    'listed',
    'marketing',
    'active_listing',
    'listing_active',
    'converted_to_listing',
    'published',
    'live',
  ],
  offers: [
    'offer_received',
    'offer_submitted',
    'offer_review',
    'seller_review',
    'agent_review',
    'negotiation',
    'countered',
    'submitted',
    'offers',
  ],
  offer_accepted: [
    'offer_accepted',
    'accepted',
    'under_offer',
    'otp_signed',
    'sale_agreement',
    'transaction_created',
    'converted_to_transaction',
  ],
  transfer: [
    'transfer',
    'transfer_in_progress',
    'lodgement',
    'lodged',
    'registration_pending',
    'attorney',
    'conveyancing',
  ],
  registered: [
    'registered',
    'registration',
    'closed',
  ],
}

const SELLER_STAGE_ORDER = SELLER_PORTAL_STAGES.map((stage) => stage.key)

function normalizeStageSignal(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_')
}

function pushSignal(signals, value) {
  const normalized = normalizeStageSignal(value)
  if (normalized) signals.push(normalized)
}

function hasSignal(signals = [], keywords = []) {
  return signals.some((signal) => keywords.some((keyword) => signal === keyword || signal.includes(keyword)))
}

function hasSignedMandateSignal(signals = []) {
  return hasSignal(signals, [
    'all_signers_completed',
    'fully_signed',
    'mandate_signed_by_seller',
    'manual_signed_document_uploaded',
    'signed_physical_mandate_uploaded',
    'signer_completed_signing',
    'uploaded_signed',
  ]) || signals.some((signal) => ['signed', 'signed_uploaded'].includes(signal))
}

function hasExplicitSignedMandateEvidence(transaction = {}, context = {}, mandatePacket = {}) {
  const dedicatedMandateSignals = [
    transaction.mandateStatus,
    transaction.mandate_status,
    transaction.mandatePacketState,
    transaction.mandate_packet_state,
    context.mandateStatus,
    context.mandate_status,
    context.mandatePacketState,
    context.mandate_packet_state,
    mandatePacket.state,
    mandatePacket.status,
    mandatePacket.packet?.status,
  ].map(normalizeStageSignal)

  if (dedicatedMandateSignals.some((signal) => ['signed', 'completed', 'fully_signed', 'uploaded_signed'].includes(signal))) {
    return true
  }

  return Boolean(
    mandatePacket.finalSignedFilePath ||
      mandatePacket.final_signed_file_path ||
      mandatePacket.finalSignedDownloadUrl ||
      mandatePacket.final_signed_file_url ||
      mandatePacket.version?.final_signed_file_path ||
      mandatePacket.version?.final_signed_file_url,
  )
}

function hasActiveListingSignal(signals = []) {
  return hasSignal(signals, [
    'active_listing',
    'active_market',
    'converted_to_listing',
    'listed',
    'listing_active',
    'live',
    'marketing',
    'published',
  ])
}

function collectStageSignals(transaction = {}) {
  const signals = []
  const context = transaction.context || transaction.activeSellingContext || transaction.sellingContext || {}
  const portal = transaction.portal || {}
  const portalTransaction = portal.transaction || {}
  const mandatePacket = context.mandatePacket || portal.mandate?.packet || {}
  const sellerOnboardingStatus = normalizeStageSignal(
    transaction.sellerOnboardingStatus ||
      transaction.seller_onboarding_status ||
      context.sellerOnboardingStatus ||
      context.seller_onboarding_status ||
      portal.onboarding?.status ||
      portal.onboardingFormData?.status,
  )

  ;[
    transaction.status,
    transaction.stage,
    transaction.lifecycle_state,
    transaction.current_main_stage,
    transaction.current_sub_stage,
    transaction.current_sub_stage_summary,
    transaction.mandateStatus,
    transaction.mandate_status,
    transaction.mandatePacketState,
    transaction.listingStatus,
    transaction.listing_status,
    context.status,
    context.mandateStatus,
    context.mandate_status,
    context.listingStatus,
    context.listing_status,
    context.listingVisibility,
    context.listing_visibility,
    transaction.listingVisibility,
    transaction.listing_visibility,
    mandatePacket.state,
    portalTransaction.status,
    portalTransaction.stage,
    portalTransaction.current_main_stage,
    portalTransaction.current_sub_stage,
    portalTransaction.current_sub_stage_summary,
    portal.stage,
    portal.mainStage,
    portal.unit?.status,
  ].forEach((value) => pushSignal(signals, value))

  ;[
    transaction.listingStatus,
    transaction.listing_status,
    context.listingStatus,
    context.listing_status,
    portal.unit?.status,
  ].forEach((value) => {
    if (normalizeStageSignal(value) === 'active') pushSignal(signals, 'active_listing')
  })

  if (hasExplicitSignedMandateEvidence(transaction, context, mandatePacket) || hasSignedMandateSignal(signals)) {
    pushSignal(signals, 'listed')
  }

  if (['completed', 'submitted', 'under_review', 'in_progress', 'sent'].includes(sellerOnboardingStatus)) {
    pushSignal(signals, 'mandate_signed')
  }

  if (transaction.hasMandate || context.mandatePacketId || context.mandate_packet_id) {
    pushSignal(signals, 'mandate_signed')
  }

  if (transaction.hasActiveListing || transaction.hasMarketListing || (transaction.hasListing && hasActiveListingSignal(signals))) {
    pushSignal(signals, 'listed')
  }

  const offers = Array.isArray(transaction.offers) ? transaction.offers : []
  offers.forEach((offer) => {
    pushSignal(signals, offer?.status || offer?.workflowStatus || offer?.workflow_status)
  })

  if (transaction.hasOffers || Number(transaction.sellerOfferCount || 0) > 0 || offers.length > 0) {
    pushSignal(signals, 'offers')
  }

  return signals
}

function resolveStageKeyFromSignals(signals = []) {
  for (const stageKey of [...SELLER_STAGE_ORDER].reverse()) {
    const keywords = SELLER_STAGE_KEYWORDS[stageKey] || []
    if (hasSignal(signals, keywords)) {
      return stageKey
    }
  }

  return 'mandate_signed'
}

export function getSellerPortalStage(transaction = {}) {
  return resolveStageKeyFromSignals(collectStageSignals(transaction))
}

export function getSellerPortalProgress(transaction = {}) {
  const stageKey = getSellerPortalStage(transaction)
  const index = Math.max(SELLER_STAGE_ORDER.indexOf(stageKey), 0)
  const maxIndex = Math.max(SELLER_STAGE_ORDER.length - 1, 1)
  return Math.round((index / maxIndex) * 100)
}

export function getSellerPortalStageMeta(transaction = {}) {
  const currentStageKey = getSellerPortalStage(transaction)
  const currentIndex = Math.max(SELLER_STAGE_ORDER.indexOf(currentStageKey), 0)
  const currentStage = SELLER_PORTAL_STAGES[currentIndex] || SELLER_PORTAL_STAGES[0]
  const nextStage = SELLER_PORTAL_STAGES[currentIndex + 1] || null

  return {
    currentStage,
    currentStageKey,
    nextStage,
    progressPercent: getSellerPortalProgress(transaction),
    stages: SELLER_PORTAL_STAGES.map((stage, index) => ({
      ...stage,
      state: index < currentIndex ? 'completed' : index === currentIndex ? 'current' : 'upcoming',
    })),
  }
}
