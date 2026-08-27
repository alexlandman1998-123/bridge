import { resolveTransactionSaleProfile } from '../transactions/transactionSaleProfile.js'

export const CLIENT_ACCESS_POLICY_VERSION = 'client_access_policy_phase1_v1'

export const CLIENT_ACCESS_ROLES = Object.freeze({
  buyer: 'buyer',
  seller: 'seller',
})

export const CLIENT_ACCESS_ACTIONS = Object.freeze({
  sendBuyerOnboarding: 'send_buyer_onboarding',
  captureBuyerOnboardingManually: 'capture_buyer_onboarding_manually',
  sendBuyerPortalLink: 'send_buyer_portal_link',
  uploadKingstonsSignedOtp: 'upload_kingstons_signed_otp',
  uploadSignedMandate: 'upload_signed_mandate',
  activateSellerPortal: 'activate_seller_portal',
  sendMandateSigningLink: 'send_mandate_signing_link',
})

export const CLIENT_ACCESS_REASONS = Object.freeze({
  transactionRequired: 'transaction_required',
  buyerEmailRequired: 'buyer_email_required',
  buyerOnboardingReady: 'buyer_onboarding_ready',
  buyerManualCaptureReady: 'buyer_manual_capture_ready',
  buyerPortalReady: 'buyer_portal_ready',
  buyerPortalWaitingForOnboardingOrOtp: 'buyer_portal_waiting_for_onboarding_or_otp',
  kingstonsManualOtpRequired: 'kingstons_manual_otp_required',
  kingstonsSignedOtpUploaded: 'kingstons_signed_otp_uploaded',
  signedOtpAlreadyUploaded: 'signed_otp_already_uploaded',
  signedMandateUploadReady: 'signed_mandate_upload_ready',
  signedMandateAlreadyUploaded: 'signed_mandate_already_uploaded',
  sellerEmailRequired: 'seller_email_required',
  sellerSignedMandateRequired: 'seller_signed_mandate_required',
  sellerPortalReady: 'seller_portal_ready',
  developerSellerPortalNotApplicable: 'developer_seller_portal_not_applicable',
  sellerMandateSigningLinksRetired: 'seller_mandate_signing_links_retired',
})

export const CLIENT_ACCESS_REASON_MESSAGES = Object.freeze({
  [CLIENT_ACCESS_REASONS.transactionRequired]: 'Transaction or listing data is required before sending this link.',
  [CLIENT_ACCESS_REASONS.buyerEmailRequired]: 'Capture buyer email before sending buyer onboarding.',
  [CLIENT_ACCESS_REASONS.buyerOnboardingReady]: 'Buyer onboarding is ready to send.',
  [CLIENT_ACCESS_REASONS.buyerManualCaptureReady]: 'Buyer onboarding can be captured manually by the agent.',
  [CLIENT_ACCESS_REASONS.buyerPortalReady]: 'Buyer portal link is ready to send.',
  [CLIENT_ACCESS_REASONS.buyerPortalWaitingForOnboardingOrOtp]: 'Complete buyer onboarding or upload the signed OTP before sending the buyer portal link.',
  [CLIENT_ACCESS_REASONS.kingstonsManualOtpRequired]: 'Kingstons buyers must upload the signed OTP before buyer portal access is available.',
  [CLIENT_ACCESS_REASONS.kingstonsSignedOtpUploaded]: 'Signed OTP uploaded. Buyer portal link is ready to send.',
  [CLIENT_ACCESS_REASONS.signedOtpAlreadyUploaded]: 'Signed OTP evidence is already uploaded.',
  [CLIENT_ACCESS_REASONS.signedMandateUploadReady]: 'Upload the signed mandate before activating the Seller Portal.',
  [CLIENT_ACCESS_REASONS.signedMandateAlreadyUploaded]: 'Signed mandate evidence is already uploaded.',
  [CLIENT_ACCESS_REASONS.sellerEmailRequired]: 'Add a valid seller email before sending the Seller Portal invitation.',
  [CLIENT_ACCESS_REASONS.sellerSignedMandateRequired]: 'Upload the signed mandate before activating the Seller Portal.',
  [CLIENT_ACCESS_REASONS.sellerPortalReady]: 'Signed mandate uploaded. Seller Portal invitation is ready to send.',
  [CLIENT_ACCESS_REASONS.developerSellerPortalNotApplicable]: 'Developer sale documents are collected through the transaction workspace, not the private seller portal.',
  [CLIENT_ACCESS_REASONS.sellerMandateSigningLinksRetired]: 'Mandate signing links are retired. Upload the signed mandate manually instead.',
})

const BUYER_MANUAL_INTAKE_MODES = new Set([
  'agent_assisted',
  'agent_capture',
  'agent_captured',
  'hard_copy',
  'manual',
  'manual_capture',
  'paper',
  'physical',
])

const READY_SIGNED_OTP_STATUSES = new Set([
  'accepted',
  'approved',
  'complete',
  'completed',
  'received',
  'signed',
  'signed_otp_received',
  'under_review',
  'uploaded',
  'verified',
])

const READY_SIGNED_MANDATE_STATUSES = new Set([
  'approved',
  'complete',
  'completed',
  'fully_signed',
  'mandate_signed',
  'signed',
  'signed_uploaded',
  'uploaded_signed',
  'verified',
])

const SIGNED_OTP_KEYS = [
  'signed_otp',
  'signed_offer_to_purchase',
  'offer_to_purchase_signed',
  'otp_signed',
  'otp_signed_reuploaded',
  'signed_final',
]

const SIGNED_MANDATE_KEYS = [
  'signed_mandate',
  'mandate_signed',
  'seller_mandate_signed',
  'signed_listing_mandate',
]

const GENERIC_MANDATE_KEYS = [
  'listing_mandate',
  'mandate',
  'seller_mandate',
]

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function booleanish(value) {
  if (value === true || value === 1) return true
  const normalized = key(value)
  return normalized === 'true' || normalized === 'yes' || normalized === 'y' || normalized === '1'
}

function values(...items) {
  return items.flatMap((item) => {
    if (Array.isArray(item)) return item
    return item ? [item] : []
  })
}

function documentRows(context = {}) {
  return values(
    context.documents,
    context.documentLibraryRows,
    context.requiredDocuments,
    context.uploadedDocuments,
    context.complianceDocuments,
    context.sellerDocuments,
    context.buyerDocuments,
  ).filter((row) => row && typeof row === 'object')
}

function asObject(value = {}) {
  return value && typeof value === 'object' ? value : {}
}

function documentSignals(row = {}) {
  const safeRow = row && typeof row === 'object' ? row : {}
  const document = safeRow.document && typeof safeRow.document === 'object' ? safeRow.document : safeRow
  const upload = safeRow.upload && typeof safeRow.upload === 'object' ? safeRow.upload : {}
  return values(
    safeRow.key,
    safeRow.id,
    safeRow.name,
    safeRow.label,
    safeRow.title,
    safeRow.category,
    safeRow.documentType,
    safeRow.document_type,
    safeRow.requiredDocumentKey,
    safeRow.required_document_key,
    document.key,
    document.id,
    document.name,
    document.document_name,
    document.category,
    document.documentType,
    document.document_type,
    document.fileName,
    document.file_name,
    upload.key,
    upload.name,
    upload.fileName,
    upload.file_name,
  ).map(key).filter(Boolean)
}

function documentStatus(row = {}) {
  const safeRow = row && typeof row === 'object' ? row : {}
  const document = safeRow.document && typeof safeRow.document === 'object' ? safeRow.document : safeRow
  return key(
    safeRow.status ||
      safeRow.reviewStatus ||
      safeRow.review_status ||
      safeRow.mandateStatus ||
      safeRow.mandate_status ||
      document.status ||
      document.reviewStatus ||
      document.review_status ||
      document.mandateStatus ||
      document.mandate_status,
  )
}

function hasUploadedFileEvidence(row = {}) {
  const safeRow = row && typeof row === 'object' ? row : {}
  const document = safeRow.document && typeof safeRow.document === 'object' ? safeRow.document : safeRow
  const upload = safeRow.upload && typeof safeRow.upload === 'object' ? safeRow.upload : {}
  return Boolean(
    firstText(
      safeRow.fileUrl,
      safeRow.file_url,
      safeRow.filePath,
      safeRow.file_path,
      safeRow.storagePath,
      safeRow.storage_path,
      safeRow.sourceDocumentId,
      safeRow.source_document_id,
      document.fileUrl,
      document.file_url,
      document.filePath,
      document.file_path,
      document.storagePath,
      document.storage_path,
      document.sourceDocumentId,
      document.source_document_id,
      upload.fileUrl,
      upload.file_url,
      upload.filePath,
      upload.file_path,
      upload.storagePath,
      upload.storage_path,
    ) ||
      safeRow.uploaded === true ||
      safeRow.hasUpload === true ||
      safeRow.has_upload === true ||
      document.uploaded === true ||
      document.hasUpload === true ||
      document.has_upload === true ||
      upload.uploaded === true,
  )
}

function hasMatchingEvidence(context = {}, aliases = [], readyStatuses = new Set()) {
  return documentRows(context).some((row) => {
    const signals = documentSignals(row)
    const status = documentStatus(row)
    const matchesAlias = aliases.some((alias) =>
      signals.some((signal) => signal === alias || signal.includes(alias)),
    )
    if (!matchesAlias) return false
    return hasUploadedFileEvidence(row) || readyStatuses.has(status)
  })
}

function buyerContextId(context = {}) {
  return firstText(
    context.transactionId,
    context.transaction_id,
    context.leadId,
    context.lead_id,
    context.offerId,
    context.offer_id,
    context.listingId,
    context.listing_id,
    context.id,
  )
}

function sellerContextId(context = {}) {
  return firstText(
    context.listingId,
    context.listing_id,
    context.propertyId,
    context.property_id,
    context.sellerLeadId,
    context.seller_lead_id,
    context.transactionId,
    context.transaction_id,
    context.id,
  )
}

function buyerEmail(context = {}) {
  return firstText(
    context.buyerEmail,
    context.buyer_email,
    context.clientEmail,
    context.client_email,
    context.email,
    context.buyer?.email,
    context.client?.email,
  )
}

function sellerEmail(context = {}) {
  return firstText(
    context.sellerEmail,
    context.seller_email,
    context.ownerEmail,
    context.owner_email,
    context.email,
    context.seller?.email,
    context.owner?.email,
  )
}

function resolveSellerSaleProfile(context = {}) {
  return resolveTransactionSaleProfile({
    transaction: {
      ...(context.transaction || {}),
      ...context,
    },
    setup: context.setup || context.transactionSetup || context.transaction_setup || {},
    sourceContext: context.sourceContext || context.source_context || context.lead || {},
    unit: context.unit || context.propertyUnit || context.property_unit || {},
  })
}

function isKingstonsBuyer(context = {}) {
  return Boolean(
    booleanish(context.isKingstons) ||
      booleanish(context.kingstons) ||
      booleanish(context.kingstonsBuyer) ||
      booleanish(context.kingstons_buyer) ||
      booleanish(context.selectedLeadUsesKingstonsInPersonOtpFlow) ||
      booleanish(context.selected_lead_uses_kingstons_in_person_otp_flow) ||
      key(context.agencySlug) === 'kingstons' ||
      key(context.agency_slug) === 'kingstons' ||
      key(context.organisationSlug) === 'kingstons' ||
      key(context.organisation_slug) === 'kingstons',
  )
}

function isManualBuyerIntake(context = {}) {
  return Boolean(
    BUYER_MANUAL_INTAKE_MODES.has(key(context.intakeMode || context.intake_mode || context.clientIntakePreference || context.client_intake_preference)) ||
      booleanish(context.agentAssisted) ||
      booleanish(context.agent_assisted) ||
      booleanish(context.hardCopy) ||
      booleanish(context.hard_copy) ||
      booleanish(context.manualCapture) ||
      booleanish(context.manual_capture),
  )
}

function buyerOnboardingComplete(context = {}) {
  context = asObject(context)
  return Boolean(
    booleanish(context.onboardingComplete) ||
      booleanish(context.onboarding_complete) ||
      booleanish(context.clientOnboardingComplete) ||
      booleanish(context.client_onboarding_complete) ||
      key(context.onboardingStatus || context.onboarding_status || context.clientOnboardingStatus || context.client_onboarding_status) === 'complete' ||
      key(context.onboardingStatus || context.onboarding_status || context.clientOnboardingStatus || context.client_onboarding_status) === 'completed',
  )
}

export function hasSignedOtpEvidence(context = {}) {
  context = asObject(context)
  return Boolean(
    booleanish(context.signedOtpUploaded) ||
      booleanish(context.signed_otp_uploaded) ||
      booleanish(context.otpUploaded) ||
      booleanish(context.otp_uploaded) ||
      READY_SIGNED_OTP_STATUSES.has(key(context.otpStatus || context.otp_status || context.signedOtpStatus || context.signed_otp_status)) ||
      hasMatchingEvidence(context, SIGNED_OTP_KEYS, READY_SIGNED_OTP_STATUSES),
  )
}

export function hasSignedMandateEvidence(context = {}) {
  context = asObject(context)
  const mandate = asObject(context.mandate)
  const mandatePacket = asObject(context.mandatePacket || context.mandate_packet)
  const mandatePacketVersion = asObject(mandatePacket.version)
  const explicitStatus = key(context.mandateStatus || context.mandate_status || context.signedMandateStatus || context.signed_mandate_status)
  const mandateStatus = key(mandate.status || mandate.mandateStatus || mandate.mandate_status)
  const mandatePacketStatus = key(mandatePacket.status || mandatePacket.packetStatus || mandatePacket.packet_status || mandatePacketVersion.status)
  return Boolean(
    booleanish(context.signedMandateUploaded) ||
      booleanish(context.signed_mandate_uploaded) ||
      firstText(
        context.mandateSignedAt,
        context.mandate_signed_at,
        context.mandateSignedDate,
        context.mandate_signed_date,
        mandate.signedAt,
        mandate.signed_at,
        mandate.finalisedAt,
        mandate.finalised_at,
        mandate.finalizedAt,
        mandate.finalized_at,
        mandate.finalSignedFilePath,
        mandate.final_signed_file_path,
        mandate.finalSignedFileUrl,
        mandate.final_signed_file_url,
        mandatePacket.finalSignedFilePath,
        mandatePacket.final_signed_file_path,
        mandatePacket.finalSignedFileUrl,
        mandatePacket.final_signed_file_url,
        mandatePacketVersion.finalSignedFilePath,
        mandatePacketVersion.final_signed_file_path,
        mandatePacketVersion.finalSignedFileUrl,
        mandatePacketVersion.final_signed_file_url,
      ) ||
      READY_SIGNED_MANDATE_STATUSES.has(explicitStatus) ||
      READY_SIGNED_MANDATE_STATUSES.has(mandateStatus) ||
      READY_SIGNED_MANDATE_STATUSES.has(mandatePacketStatus) ||
      hasMatchingEvidence(context, SIGNED_MANDATE_KEYS, READY_SIGNED_MANDATE_STATUSES) ||
      documentRows(context).some((row) => {
        const signals = documentSignals(row)
        const status = documentStatus(row)
        const matchesGenericMandate = GENERIC_MANDATE_KEYS.some((alias) =>
          signals.some((signal) => signal === alias || signal.includes(alias) || alias.includes(signal)),
        )
        return matchesGenericMandate && READY_SIGNED_MANDATE_STATUSES.has(status)
      }),
  )
}

export function getClientAccessPolicyMessage(reason = '', fallback = '') {
  return CLIENT_ACCESS_REASON_MESSAGES[reason] || fallback || 'This portal action is not available yet.'
}

function action(name, enabled, reason, label) {
  return Object.freeze({
    name,
    enabled: Boolean(enabled),
    reason,
    label,
  })
}

export function resolveBuyerAccessPolicy(context = {}) {
  const hasContext = Boolean(buyerContextId(context))
  const kingstons = isKingstonsBuyer(context)
  const signedOtpUploaded = hasSignedOtpEvidence(context)
  const manualIntake = isManualBuyerIntake(context)
  const hasBuyerEmail = Boolean(buyerEmail(context))
  const onboardingComplete = buyerOnboardingComplete(context)

  let sendOnboarding
  if (!hasContext) {
    sendOnboarding = action(CLIENT_ACCESS_ACTIONS.sendBuyerOnboarding, false, CLIENT_ACCESS_REASONS.transactionRequired, 'Send buyer onboarding')
  } else if (kingstons) {
    sendOnboarding = action(CLIENT_ACCESS_ACTIONS.sendBuyerOnboarding, false, CLIENT_ACCESS_REASONS.kingstonsManualOtpRequired, 'Send buyer onboarding')
  } else if (!manualIntake && !hasBuyerEmail) {
    sendOnboarding = action(CLIENT_ACCESS_ACTIONS.sendBuyerOnboarding, false, CLIENT_ACCESS_REASONS.buyerEmailRequired, 'Send buyer onboarding')
  } else {
    sendOnboarding = action(CLIENT_ACCESS_ACTIONS.sendBuyerOnboarding, true, CLIENT_ACCESS_REASONS.buyerOnboardingReady, 'Send buyer onboarding')
  }

  const manualCapture = action(
    CLIENT_ACCESS_ACTIONS.captureBuyerOnboardingManually,
    hasContext,
    hasContext ? CLIENT_ACCESS_REASONS.buyerManualCaptureReady : CLIENT_ACCESS_REASONS.transactionRequired,
    'Capture buyer onboarding manually',
  )

  let sendPortalLink
  if (!hasContext) {
    sendPortalLink = action(CLIENT_ACCESS_ACTIONS.sendBuyerPortalLink, false, CLIENT_ACCESS_REASONS.transactionRequired, 'Send buyer portal link')
  } else if (kingstons && !signedOtpUploaded) {
    sendPortalLink = action(CLIENT_ACCESS_ACTIONS.sendBuyerPortalLink, false, CLIENT_ACCESS_REASONS.kingstonsManualOtpRequired, 'Send buyer portal link')
  } else if (kingstons && signedOtpUploaded) {
    sendPortalLink = action(CLIENT_ACCESS_ACTIONS.sendBuyerPortalLink, true, CLIENT_ACCESS_REASONS.kingstonsSignedOtpUploaded, 'Send buyer portal link')
  } else if (onboardingComplete || signedOtpUploaded) {
    sendPortalLink = action(CLIENT_ACCESS_ACTIONS.sendBuyerPortalLink, true, CLIENT_ACCESS_REASONS.buyerPortalReady, 'Send buyer portal link')
  } else {
    sendPortalLink = action(CLIENT_ACCESS_ACTIONS.sendBuyerPortalLink, false, CLIENT_ACCESS_REASONS.buyerPortalWaitingForOnboardingOrOtp, 'Send buyer portal link')
  }

  const uploadSignedOtp = action(
    CLIENT_ACCESS_ACTIONS.uploadKingstonsSignedOtp,
    Boolean(hasContext && kingstons && !signedOtpUploaded),
    signedOtpUploaded ? CLIENT_ACCESS_REASONS.signedOtpAlreadyUploaded : CLIENT_ACCESS_REASONS.kingstonsManualOtpRequired,
    'Upload signed OTP',
  )

  return Object.freeze({
    version: CLIENT_ACCESS_POLICY_VERSION,
    role: CLIENT_ACCESS_ROLES.buyer,
    isKingstons: kingstons,
    manualIntake,
    signedOtpUploaded,
    onboardingComplete,
    actions: Object.freeze({
      sendOnboarding,
      manualCapture,
      sendPortalLink,
      uploadSignedOtp,
    }),
  })
}

export function resolveSellerAccessPolicy(context = {}) {
  const hasContext = Boolean(sellerContextId(context))
  const hasSellerEmail = Boolean(sellerEmail(context))
  const signedMandateUploaded = hasSignedMandateEvidence(context)
  const saleProfile = resolveSellerSaleProfile(context)
  const isDeveloperSale = saleProfile.isDeveloperSale === true

  let activatePortal
  if (!hasContext) {
    activatePortal = action(CLIENT_ACCESS_ACTIONS.activateSellerPortal, false, CLIENT_ACCESS_REASONS.transactionRequired, 'Activate seller portal')
  } else if (isDeveloperSale) {
    activatePortal = action(CLIENT_ACCESS_ACTIONS.activateSellerPortal, false, CLIENT_ACCESS_REASONS.developerSellerPortalNotApplicable, 'Activate seller portal')
  } else if (!signedMandateUploaded) {
    activatePortal = action(CLIENT_ACCESS_ACTIONS.activateSellerPortal, false, CLIENT_ACCESS_REASONS.sellerSignedMandateRequired, 'Activate seller portal')
  } else if (!hasSellerEmail) {
    activatePortal = action(CLIENT_ACCESS_ACTIONS.activateSellerPortal, false, CLIENT_ACCESS_REASONS.sellerEmailRequired, 'Activate seller portal')
  } else {
    activatePortal = action(CLIENT_ACCESS_ACTIONS.activateSellerPortal, true, CLIENT_ACCESS_REASONS.sellerPortalReady, 'Activate seller portal')
  }

  const uploadSignedMandate = action(
    CLIENT_ACCESS_ACTIONS.uploadSignedMandate,
    Boolean(hasContext && !signedMandateUploaded && !isDeveloperSale),
    isDeveloperSale
      ? CLIENT_ACCESS_REASONS.developerSellerPortalNotApplicable
      : signedMandateUploaded ? CLIENT_ACCESS_REASONS.signedMandateAlreadyUploaded : CLIENT_ACCESS_REASONS.signedMandateUploadReady,
    'Upload signed mandate',
  )

  const sendMandateSigningLink = action(
    CLIENT_ACCESS_ACTIONS.sendMandateSigningLink,
    false,
    isDeveloperSale ? CLIENT_ACCESS_REASONS.developerSellerPortalNotApplicable : CLIENT_ACCESS_REASONS.sellerMandateSigningLinksRetired,
    'Send mandate signing link',
  )

  return Object.freeze({
    version: CLIENT_ACCESS_POLICY_VERSION,
    role: CLIENT_ACCESS_ROLES.seller,
    isDeveloperSale,
    sellerPartyType: saleProfile.sellerPartyType,
    saleChannel: saleProfile.saleChannel,
    signedMandateUploaded,
    actions: Object.freeze({
      uploadSignedMandate,
      activatePortal,
      sendMandateSigningLink,
    }),
  })
}

export function resolveClientAccessPolicy(context = {}) {
  return Object.freeze({
    version: CLIENT_ACCESS_POLICY_VERSION,
    buyer: resolveBuyerAccessPolicy(context.buyer || context),
    seller: resolveSellerAccessPolicy(context.seller || context),
  })
}
