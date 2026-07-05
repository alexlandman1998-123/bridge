function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export const DOCUMENT_START_PACKET_TYPES = Object.freeze({
  mandate: 'mandate',
  otp: 'otp',
})

export const DOCUMENT_START_DOCUMENT_KINDS = Object.freeze({
  standard: 'standard',
  addendum: 'addendum',
  amendment: 'amendment',
  annexure: 'annexure',
})

export const DOCUMENT_START_SOURCE_MODES = Object.freeze({
  saved: 'saved_details',
  manual: 'manual_details',
  onboarding: 'send_onboarding',
})

export const DOCUMENT_START_ENTRY_POINTS = Object.freeze({
  sellerLeadMandate: 'seller_lead_mandate',
  listingMandate: 'listing_mandate',
  transactionOtp: 'transaction_otp',
  acceptedOfferOtp: 'accepted_offer_otp',
  legalWorkspaceDocument: 'legal_workspace_document',
  documentLibraryDocument: 'document_library_document',
})

export const DOCUMENT_START_CONTEXT_TYPES = Object.freeze({
  sellerLead: 'seller_lead',
  listing: 'listing',
  transaction: 'transaction',
  acceptedOffer: 'accepted_offer',
  documentPacket: 'document_packet',
  manual: 'manual',
})

export const DOCUMENT_START_MODE_OPTIONS = Object.freeze([
  {
    key: DOCUMENT_START_SOURCE_MODES.saved,
    label: 'Use saved details',
    shortLabel: 'Saved',
    description: 'Start from an existing lead, client, listing, transaction, or document.',
    helperText: 'Best when the record already exists and only a few details need checking.',
    tone: 'primary',
  },
  {
    key: DOCUMENT_START_SOURCE_MODES.manual,
    label: 'Enter details manually',
    shortLabel: 'Manual',
    description: 'Capture only the information needed for this document.',
    helperText: 'Use this when the client is not tech-savvy or the paperwork must go out now.',
    tone: 'neutral',
  },
  {
    key: DOCUMENT_START_SOURCE_MODES.onboarding,
    label: 'Ask client to complete',
    shortLabel: 'Onboarding',
    description: 'Send the seller or buyer an onboarding link to collect details.',
    helperText: 'Best data quality, but it depends on the client responding.',
    tone: 'guided',
  },
])

export const DOCUMENT_START_ENTRY_POINT_RULES = Object.freeze({
  [DOCUMENT_START_ENTRY_POINTS.sellerLeadMandate]: {
    packetType: DOCUMENT_START_PACKET_TYPES.mandate,
    defaultDocumentKind: DOCUMENT_START_DOCUMENT_KINDS.standard,
    contextType: DOCUMENT_START_CONTEXT_TYPES.sellerLead,
    preferredSourceMode: DOCUMENT_START_SOURCE_MODES.saved,
    allowedSourceModes: [
      DOCUMENT_START_SOURCE_MODES.saved,
      DOCUMENT_START_SOURCE_MODES.manual,
      DOCUMENT_START_SOURCE_MODES.onboarding,
    ],
    title: 'Create Mandate',
    bestPracticeLabel: 'Send seller onboarding',
  },
  [DOCUMENT_START_ENTRY_POINTS.listingMandate]: {
    packetType: DOCUMENT_START_PACKET_TYPES.mandate,
    defaultDocumentKind: DOCUMENT_START_DOCUMENT_KINDS.standard,
    contextType: DOCUMENT_START_CONTEXT_TYPES.listing,
    preferredSourceMode: DOCUMENT_START_SOURCE_MODES.saved,
    allowedSourceModes: [
      DOCUMENT_START_SOURCE_MODES.saved,
      DOCUMENT_START_SOURCE_MODES.manual,
      DOCUMENT_START_SOURCE_MODES.onboarding,
    ],
    title: 'Create Mandate',
    bestPracticeLabel: 'Send seller onboarding',
  },
  [DOCUMENT_START_ENTRY_POINTS.transactionOtp]: {
    packetType: DOCUMENT_START_PACKET_TYPES.otp,
    defaultDocumentKind: DOCUMENT_START_DOCUMENT_KINDS.standard,
    contextType: DOCUMENT_START_CONTEXT_TYPES.transaction,
    preferredSourceMode: DOCUMENT_START_SOURCE_MODES.saved,
    allowedSourceModes: [
      DOCUMENT_START_SOURCE_MODES.saved,
      DOCUMENT_START_SOURCE_MODES.manual,
      DOCUMENT_START_SOURCE_MODES.onboarding,
    ],
    title: 'Create OTP',
    bestPracticeLabel: 'Send buyer onboarding',
  },
  [DOCUMENT_START_ENTRY_POINTS.acceptedOfferOtp]: {
    packetType: DOCUMENT_START_PACKET_TYPES.otp,
    defaultDocumentKind: DOCUMENT_START_DOCUMENT_KINDS.standard,
    contextType: DOCUMENT_START_CONTEXT_TYPES.acceptedOffer,
    preferredSourceMode: DOCUMENT_START_SOURCE_MODES.saved,
    allowedSourceModes: [
      DOCUMENT_START_SOURCE_MODES.saved,
      DOCUMENT_START_SOURCE_MODES.manual,
      DOCUMENT_START_SOURCE_MODES.onboarding,
    ],
    title: 'Create OTP',
    bestPracticeLabel: 'Send buyer onboarding',
  },
  [DOCUMENT_START_ENTRY_POINTS.legalWorkspaceDocument]: {
    packetType: '',
    defaultDocumentKind: DOCUMENT_START_DOCUMENT_KINDS.addendum,
    contextType: DOCUMENT_START_CONTEXT_TYPES.documentPacket,
    preferredSourceMode: DOCUMENT_START_SOURCE_MODES.saved,
    allowedSourceModes: [
      DOCUMENT_START_SOURCE_MODES.saved,
      DOCUMENT_START_SOURCE_MODES.manual,
    ],
    title: 'Create Addendum',
    bestPracticeLabel: '',
  },
  [DOCUMENT_START_ENTRY_POINTS.documentLibraryDocument]: {
    packetType: '',
    defaultDocumentKind: DOCUMENT_START_DOCUMENT_KINDS.addendum,
    contextType: DOCUMENT_START_CONTEXT_TYPES.documentPacket,
    preferredSourceMode: DOCUMENT_START_SOURCE_MODES.saved,
    allowedSourceModes: [
      DOCUMENT_START_SOURCE_MODES.saved,
      DOCUMENT_START_SOURCE_MODES.manual,
    ],
    title: 'Create Addendum',
    bestPracticeLabel: '',
  },
})

export const DOCUMENT_START_REQUIRED_FIELDS = Object.freeze({
  mandate: Object.freeze({
    saved_details: ['seller', 'property', 'mandate_terms'],
    manual_details: ['seller_name', 'seller_contact', 'property_address', 'mandate_type', 'commission_terms'],
    send_onboarding: ['seller_contact'],
  }),
  otp: Object.freeze({
    saved_details: ['buyer', 'seller', 'property', 'commercial_terms'],
    manual_details: ['buyer_details', 'seller_details', 'property_address', 'purchase_price', 'signature_parties'],
    send_onboarding: ['buyer_contact'],
  }),
  related_document: Object.freeze({
    saved_details: ['original_document', 'change_summary'],
    manual_details: ['original_document_reference', 'change_summary', 'changed_terms'],
  }),
})

export function getDocumentStartEntryPointRule(entryPoint = '') {
  const normalized = normalizeKey(entryPoint)
  return DOCUMENT_START_ENTRY_POINT_RULES[normalized] || null
}

export function getDocumentStartModeOption(sourceMode = DOCUMENT_START_SOURCE_MODES.saved) {
  const normalized = normalizeKey(sourceMode) || DOCUMENT_START_SOURCE_MODES.saved
  return DOCUMENT_START_MODE_OPTIONS.find((option) => option.key === normalized) || DOCUMENT_START_MODE_OPTIONS[0]
}

export function getDocumentStartModeOptions({
  entryPoint = '',
  documentKind = '',
  hasExistingContext = true,
  hasClientContact = true,
  hasParentDocument = true,
} = {}) {
  const rule = getDocumentStartEntryPointRule(entryPoint)
  const normalizedDocumentKind = normalizeKey(documentKind || rule?.defaultDocumentKind || DOCUMENT_START_DOCUMENT_KINDS.standard)
  const isRelatedDocument = [
    DOCUMENT_START_DOCUMENT_KINDS.addendum,
    DOCUMENT_START_DOCUMENT_KINDS.amendment,
    DOCUMENT_START_DOCUMENT_KINDS.annexure,
  ].includes(normalizedDocumentKind)
  const allowedModes = rule?.allowedSourceModes || [
    DOCUMENT_START_SOURCE_MODES.saved,
    DOCUMENT_START_SOURCE_MODES.manual,
    DOCUMENT_START_SOURCE_MODES.onboarding,
  ]

  return allowedModes.map((mode) => {
    const option = getDocumentStartModeOption(mode)
    const disabledReason =
      mode === DOCUMENT_START_SOURCE_MODES.saved && !hasExistingContext
        ? 'No saved record is available yet.'
        : mode === DOCUMENT_START_SOURCE_MODES.onboarding && !hasClientContact
          ? 'Add a client email or phone before sending onboarding.'
          : isRelatedDocument && !hasParentDocument
            ? 'Choose the original document before creating an addendum.'
            : ''

    return {
      ...option,
      disabled: Boolean(disabledReason),
      disabledReason,
      recommended: mode === (rule?.preferredSourceMode || DOCUMENT_START_SOURCE_MODES.saved),
    }
  })
}

export function getDocumentStartRequiredFields({
  packetType = '',
  sourceMode = DOCUMENT_START_SOURCE_MODES.saved,
  documentKind = DOCUMENT_START_DOCUMENT_KINDS.standard,
} = {}) {
  const normalizedDocumentKind = normalizeKey(documentKind)
  const normalizedSourceMode = normalizeKey(sourceMode) || DOCUMENT_START_SOURCE_MODES.saved
  if ([
    DOCUMENT_START_DOCUMENT_KINDS.addendum,
    DOCUMENT_START_DOCUMENT_KINDS.amendment,
    DOCUMENT_START_DOCUMENT_KINDS.annexure,
  ].includes(normalizedDocumentKind)) {
    return DOCUMENT_START_REQUIRED_FIELDS.related_document[normalizedSourceMode] || []
  }
  return DOCUMENT_START_REQUIRED_FIELDS[normalizeKey(packetType)]?.[normalizedSourceMode] || []
}

export function validateDocumentStartRequest({
  packetType = '',
  documentKind = DOCUMENT_START_DOCUMENT_KINDS.standard,
  sourceMode = DOCUMENT_START_SOURCE_MODES.saved,
  entryPoint = '',
  hasExistingContext = false,
  hasClientContact = false,
  hasParentDocument = false,
} = {}) {
  const normalizedPacketType = normalizeKey(packetType)
  const normalizedDocumentKind = normalizeKey(documentKind || DOCUMENT_START_DOCUMENT_KINDS.standard)
  const normalizedSourceMode = normalizeKey(sourceMode || DOCUMENT_START_SOURCE_MODES.saved)
  const rule = getDocumentStartEntryPointRule(entryPoint)
  const isRelatedDocument = [
    DOCUMENT_START_DOCUMENT_KINDS.addendum,
    DOCUMENT_START_DOCUMENT_KINDS.amendment,
    DOCUMENT_START_DOCUMENT_KINDS.annexure,
  ].includes(normalizedDocumentKind)
  const issues = []

  if (!Object.values(DOCUMENT_START_SOURCE_MODES).includes(normalizedSourceMode)) {
    issues.push('Choose how to start this document.')
  }

  if (!isRelatedDocument && !Object.values(DOCUMENT_START_PACKET_TYPES).includes(normalizedPacketType)) {
    issues.push('Choose Mandate or OTP before starting.')
  }

  if (rule?.packetType && normalizedPacketType && rule.packetType !== normalizedPacketType) {
    issues.push(`This workflow starts a ${rule.packetType.toUpperCase()} document.`)
  }

  if (rule?.allowedSourceModes && !rule.allowedSourceModes.includes(normalizedSourceMode)) {
    issues.push('This start option is not available in this workflow.')
  }

  if (normalizedSourceMode === DOCUMENT_START_SOURCE_MODES.saved && !hasExistingContext) {
    issues.push('Select an existing record or switch to manual details.')
  }

  if (normalizedSourceMode === DOCUMENT_START_SOURCE_MODES.onboarding && !hasClientContact) {
    issues.push('Add a client email or phone before sending onboarding.')
  }

  if (isRelatedDocument && !hasParentDocument) {
    issues.push('Choose the original document before creating an addendum.')
  }

  return {
    canStart: issues.length === 0,
    issues,
    requiredFields: getDocumentStartRequiredFields({
      packetType: normalizedPacketType,
      sourceMode: normalizedSourceMode,
      documentKind: normalizedDocumentKind,
    }),
    sourceMode: normalizedSourceMode,
    documentKind: normalizedDocumentKind,
    packetType: normalizedPacketType,
  }
}
