const AUTOMATION_STATUSES = Object.freeze({
  AUTOMATED: 'automated',
  ATTORNEY_REVIEW_REQUIRED: 'attorney_review_required',
})

export const LEGAL_INSTRUMENT_FAMILIES = Object.freeze({
  RESIDENTIAL_RESALE: 'residential_resale',
  DEVELOPER_SALE: 'developer_sale',
  PLOT_AND_PLAN: 'plot_and_plan',
  INSTALMENT_SALE: 'instalment_sale',
  AUCTION_SALE: 'auction_sale',
  AGRICULTURAL_SALE: 'agricultural_sale',
  SHARE_BLOCK_LIFE_RIGHT: 'share_block_life_right',
  COMMERCIAL_SALE: 'commercial_sale',
  RESIDENTIAL_MANDATE: 'residential_mandate',
  UNKNOWN: 'unknown',
})

export const LEGAL_INSTRUMENT_FAMILY_DEFINITIONS = Object.freeze([
  {
    key: LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE,
    label: 'Residential resale',
    packetTypes: ['otp'],
    automationStatus: AUTOMATION_STATUSES.AUTOMATED,
    aliases: [
      'residential', 'residential_sale', 'residential_resale', 'resale', 'private_treaty', 'sale',
      'private', 'private_sale', 'private_property', 'private_property_sale',
    ],
  },
  {
    key: LEGAL_INSTRUMENT_FAMILIES.DEVELOPER_SALE,
    label: 'Developer / off-plan sale',
    packetTypes: ['otp'],
    automationStatus: AUTOMATION_STATUSES.ATTORNEY_REVIEW_REQUIRED,
    aliases: [
      'developer', 'development', 'developer_sale', 'development_sale', 'off_plan', 'off_plan_sale', 'new_development',
    ],
  },
  {
    key: LEGAL_INSTRUMENT_FAMILIES.PLOT_AND_PLAN,
    label: 'Plot-and-plan sale',
    packetTypes: ['otp'],
    automationStatus: AUTOMATION_STATUSES.ATTORNEY_REVIEW_REQUIRED,
    aliases: ['plot_and_plan', 'plot_plan', 'land_and_build', 'building_package'],
  },
  {
    key: LEGAL_INSTRUMENT_FAMILIES.INSTALMENT_SALE,
    label: 'Instalment sale',
    packetTypes: ['otp'],
    automationStatus: AUTOMATION_STATUSES.ATTORNEY_REVIEW_REQUIRED,
    aliases: ['instalment', 'installment', 'instalment_sale', 'installment_sale', 'alienation_of_land'],
  },
  {
    key: LEGAL_INSTRUMENT_FAMILIES.AUCTION_SALE,
    label: 'Auction sale',
    packetTypes: ['otp'],
    automationStatus: AUTOMATION_STATUSES.ATTORNEY_REVIEW_REQUIRED,
    aliases: ['auction', 'auction_sale', 'sale_by_auction'],
  },
  {
    key: LEGAL_INSTRUMENT_FAMILIES.AGRICULTURAL_SALE,
    label: 'Agricultural / farm sale',
    packetTypes: ['otp'],
    automationStatus: AUTOMATION_STATUSES.ATTORNEY_REVIEW_REQUIRED,
    aliases: ['agricultural', 'agricultural_sale', 'farm', 'farm_sale', 'smallholding', 'agricultural_holding'],
  },
  {
    key: LEGAL_INSTRUMENT_FAMILIES.SHARE_BLOCK_LIFE_RIGHT,
    label: 'Share block / life right',
    packetTypes: ['otp'],
    automationStatus: AUTOMATION_STATUSES.ATTORNEY_REVIEW_REQUIRED,
    aliases: ['share_block', 'share_block_sale', 'life_right', 'life_right_sale', 'retirement_life_right'],
  },
  {
    key: LEGAL_INSTRUMENT_FAMILIES.COMMERCIAL_SALE,
    label: 'Commercial property sale',
    packetTypes: ['otp', 'commercial_sale'],
    automationStatus: AUTOMATION_STATUSES.ATTORNEY_REVIEW_REQUIRED,
    aliases: ['commercial', 'commercial_sale', 'business_property_sale', 'industrial_sale', 'retail_sale'],
  },
  {
    key: LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_MANDATE,
    label: 'Residential mandate',
    packetTypes: ['mandate'],
    automationStatus: AUTOMATION_STATUSES.AUTOMATED,
    aliases: ['residential_mandate', 'mandate'],
  },
])

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== null && value !== undefined && normalizeText(value)) return value
  }
  return ''
}

const FAMILY_BY_KEY = new Map(LEGAL_INSTRUMENT_FAMILY_DEFINITIONS.map((definition) => [definition.key, definition]))
const FAMILY_BY_ALIAS = new Map(
  LEGAL_INSTRUMENT_FAMILY_DEFINITIONS.flatMap((definition) => (
    [definition.key, ...(definition.aliases || [])].map((alias) => [normalizeKey(alias), definition])
  )),
)

export function normalizeLegalInstrumentFamily(value = '') {
  return FAMILY_BY_ALIAS.get(normalizeKey(value))?.key || ''
}

export function getLegalInstrumentFamilyDefinition(value = '') {
  return FAMILY_BY_KEY.get(normalizeLegalInstrumentFamily(value) || normalizeKey(value)) || null
}

function resolveSpecificPropertyFamily(sources = []) {
  const propertySignal = normalizeKey(sources.map((source) => readValue(source, [
    'property_title_type', 'propertyTitleType', 'property_type', 'propertyType', 'asset_category', 'assetCategory',
  ])).find(Boolean))
  if (!propertySignal) return null
  if (propertySignal.includes('share_block') || propertySignal.includes('life_right')) {
    return getLegalInstrumentFamilyDefinition(LEGAL_INSTRUMENT_FAMILIES.SHARE_BLOCK_LIFE_RIGHT)
  }
  if (
    propertySignal.includes('agricultur') ||
    propertySignal.includes('farm') ||
    propertySignal.includes('smallholding')
  ) {
    return getLegalInstrumentFamilyDefinition(LEGAL_INSTRUMENT_FAMILIES.AGRICULTURAL_SALE)
  }
  return null
}

function buildProfile(definition, {
  packetType = 'otp',
  source = 'unknown',
  rawSignal = '',
  explicit = false,
  recognized = true,
  compatibilityMode = false,
} = {}) {
  const resolved = definition || {
    key: LEGAL_INSTRUMENT_FAMILIES.UNKNOWN,
    label: 'Unclassified legal instrument',
    packetTypes: [packetType],
    automationStatus: AUTOMATION_STATUSES.ATTORNEY_REVIEW_REQUIRED,
  }
  const packetCompatible = (resolved.packetTypes || []).includes(packetType)
  const automated = resolved.automationStatus === AUTOMATION_STATUSES.AUTOMATED && packetCompatible
  return {
    familyKey: resolved.key,
    label: resolved.label,
    packetType,
    source,
    rawSignal: normalizeText(rawSignal) || null,
    explicit,
    recognized,
    compatibilityMode,
    packetCompatible,
    automationStatus: resolved.automationStatus,
    automated,
    requiresAttorneyReview: !automated,
    generationAllowed: automated,
    blockingCode: automated
      ? null
      : recognized
        ? 'LEGAL_INSTRUMENT_FAMILY_REVIEW_REQUIRED'
        : 'LEGAL_INSTRUMENT_FAMILY_UNKNOWN',
  }
}

/**
 * Resolves the agreement family before any party/property clause routing occurs.
 * Existing OTP records without a family signal remain residential resale for
 * backwards compatibility. Any non-empty unknown or specialist signal fails safe.
 */
export function resolveLegalInstrumentFamilyProfile(options = {}) {
  const packetType = normalizeKey(options.packetType || options.packet_type || 'otp') || 'otp'
  if (packetType === 'mandate') {
    return buildProfile(getLegalInstrumentFamilyDefinition(LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_MANDATE), {
      packetType,
      source: 'packet_type',
      rawSignal: packetType,
      explicit: true,
    })
  }
  if (packetType !== 'otp') return null

  const context = asRecord(options.context)
  const transaction = asRecord(options.transaction || context.transaction)
  const listing = asRecord(options.listing || options.privateListing || context.listing || context.privateListing)
  const property = asRecord(options.property || context.property || context.unit)
  const sourceContext = asRecord(options.sourceContext || context.sourceContext)
  const sources = [options, transaction, listing, property, sourceContext, context]

  const explicitSignal = sources.map((source) => readValue(source, [
    'legalInstrumentFamily', 'legal_instrument_family', 'instrumentFamily', 'instrument_family',
  ])).find(Boolean)
  if (explicitSignal) {
    const definition = FAMILY_BY_ALIAS.get(normalizeKey(explicitSignal)) || null
    return buildProfile(definition, {
      packetType,
      source: 'explicit_instrument_family',
      rawSignal: explicitSignal,
      explicit: true,
      recognized: Boolean(definition),
    })
  }

  const transactionSignal = sources.map((source) => readValue(source, [
    'transactionType', 'transaction_type', 'propertyTransactionType', 'property_transaction_type',
    'saleType', 'sale_type', 'agreementType', 'agreement_type',
  ])).find(Boolean)
  if (transactionSignal) {
    const definition = FAMILY_BY_ALIAS.get(normalizeKey(transactionSignal)) || null
    if (definition && definition.key !== LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE) {
      return buildProfile(definition, {
        packetType,
        source: 'transaction_type',
        rawSignal: transactionSignal,
        explicit: true,
      })
    }
    if (!definition) {
      return buildProfile(null, {
        packetType,
        source: 'transaction_type',
        rawSignal: transactionSignal,
        explicit: true,
        recognized: false,
      })
    }
  }

  const propertyFamily = resolveSpecificPropertyFamily(sources)
  if (propertyFamily) {
    return buildProfile(propertyFamily, {
      packetType,
      source: 'property_type',
      rawSignal: propertyFamily.key,
      explicit: true,
    })
  }

  if (transactionSignal) {
    return buildProfile(getLegalInstrumentFamilyDefinition(LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE), {
      packetType,
      source: 'transaction_type',
      rawSignal: transactionSignal,
      explicit: true,
    })
  }

  return buildProfile(getLegalInstrumentFamilyDefinition(LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE), {
    packetType,
    source: 'legacy_otp_default',
    rawSignal: '',
    explicit: false,
    compatibilityMode: true,
  })
}

export function resolveTemplateLegalInstrumentFamily(template = {}, packetType = 'otp') {
  const metadata = asRecord(template.metadata_json || template.metadataJson)
  const rawFamily = readValue(template, ['instrument_family', 'instrumentFamily', 'legal_instrument_family']) ||
    readValue(metadata, ['instrument_family', 'instrumentFamily', 'legal_instrument_family', 'legalInstrumentFamily'])
  if (rawFamily) {
    return {
      familyKey: normalizeLegalInstrumentFamily(rawFamily) || LEGAL_INSTRUMENT_FAMILIES.UNKNOWN,
      explicit: true,
      source: 'template_metadata',
      rawSignal: normalizeText(rawFamily),
    }
  }
  const normalizedPacketType = normalizeKey(template.packet_type || template.packetType || packetType)
  return {
    familyKey: normalizedPacketType === 'mandate'
      ? LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_MANDATE
      : normalizedPacketType === 'commercial_sale'
        ? LEGAL_INSTRUMENT_FAMILIES.COMMERCIAL_SALE
        : LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE,
    explicit: false,
    source: 'legacy_template_default',
    rawSignal: null,
  }
}

export function buildLegalInstrumentFamilyIssue(profile = null) {
  if (!profile || profile.generationAllowed) return null
  return {
    source: 'legal_instrument_family',
    sectionKey: 'legal_instrument_family',
    sectionLabel: 'Agreement type',
    placeholderKey: 'legal_instrument_family',
    placeholderLabel: 'Agreement type',
    message: profile.recognized
      ? `${profile.label} requires an attorney-approved template before it can be generated.`
      : `The agreement type “${profile.rawSignal || 'unknown'}” is not configured. Select a supported agreement family or request attorney review.`,
    required: true,
    code: profile.blockingCode,
  }
}

export function buildLegalInstrumentFamilyAudit(profile = null) {
  if (!profile) return null
  return {
    familyKey: profile.familyKey,
    label: profile.label,
    source: profile.source,
    rawSignal: profile.rawSignal,
    explicit: profile.explicit,
    recognized: profile.recognized,
    compatibilityMode: profile.compatibilityMode,
    automationStatus: profile.automationStatus,
    generationAllowed: profile.generationAllowed,
    blockingCode: profile.blockingCode,
  }
}
