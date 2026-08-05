export const OTP_ROUTE_UNIVERSE_VERSION = 'otp_route_universe_phase2_v1'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[\s./-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function readPath(source = {}, path = '') {
  const key = normalizeText(path)
  if (!key) return undefined
  if (Object.prototype.hasOwnProperty.call(source, key)) return source[key]
  if (!key.includes('.')) return undefined
  return key.split('.').reduce((current, part) => (
    current && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, part)
      ? current[part]
      : undefined
  ), source)
}

function firstValue(sources = [], paths = []) {
  for (const path of paths) {
    for (const source of sources) {
      const value = readPath(source || {}, path)
      if (value !== null && value !== undefined && normalizeText(value) !== '') return value
    }
  }
  return ''
}

function hasTruthySignal(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  return ['true', 'yes', 'y', '1', 'development', 'development_sale', 'new_development', 'off_plan', 'developer_sale'].includes(normalized)
}

export const OTP_DOCUMENT_VARIANTS = Object.freeze([
  Object.freeze({
    key: 'resale_existing_property',
    label: 'Existing / resale property OTP',
    primary: true,
    recommendation: 'Use this as the primary resale OTP: existing seller, existing title/property facts, property disclosure, fixtures/fittings, seller bond/rates, occupation, guarantees, certificates and transfer obligations.',
    routeDimensions: Object.freeze([
      'buyer_party',
      'seller_party',
      'property_title',
      'finance',
      'occupation',
      'suspensive_conditions',
      'disclosure_defects',
      'compliance_certificates',
      'transfer_conveyancer',
      'signatures',
    ]),
    requiredSourceOwners: Object.freeze([
      'buyer_onboarding',
      'seller_onboarding',
      'listing_property_record',
      'transaction_offer_terms',
      'conveyancer_transfer_assignment',
      'organisation_agent_settings',
      'legal_template_registry',
      'signing_runtime',
    ]),
  }),
  Object.freeze({
    key: 'new_development',
    label: 'New development OTP',
    primary: true,
    recommendation: 'Use this as a distinct variant: developer seller, development/unit source data, NHBRC/occupation-certificate/building clauses, parking/storeroom/unit specifications and development-specific annexures.',
    routeDimensions: Object.freeze([
      'buyer_party',
      'developer_seller',
      'development_unit',
      'finance',
      'occupation_or_handover',
      'development_certificates',
      'body_corporate',
      'development_annexures',
      'signatures',
    ]),
    requiredSourceOwners: Object.freeze([
      'buyer_onboarding',
      'development_setup',
      'development_unit_setup',
      'transaction_offer_terms',
      'conveyancer_transfer_assignment',
      'organisation_agent_settings',
      'legal_template_registry',
      'signing_runtime',
    ]),
  }),
])

export const OTP_ROUTE_DIMENSIONS = Object.freeze({
  documentVariant: Object.freeze(['resale_existing_property', 'new_development']),
  buyerParty: Object.freeze([
    'individual_unmarried',
    'individual_married_in_community',
    'individual_married_out_of_community',
    'individual_customary_marriage',
    'individual_islamic_marriage',
    'individual_foreign_marriage',
    'co_purchasers',
    'company_or_cc',
    'trust',
    'foreign_purchaser',
  ]),
  sellerParty: Object.freeze([
    'individual_unmarried',
    'individual_married_in_community',
    'individual_married_out_of_community',
    'company_or_cc',
    'trust',
    'foreign_seller',
    'developer_seller',
  ]),
  propertyTitle: Object.freeze([
    'full_title_erf',
    'full_title_estate_or_hoa',
    'sectional_title_unit',
    'share_block_or_scheme',
    'agricultural_or_vacant_land',
    'new_development_unit',
  ]),
  finance: Object.freeze([
    'cash',
    'bond',
    'hybrid_cash_and_bond',
    'subject_to_sale_of_purchaser_property',
    'other_suspensive_condition',
  ]),
  occupation: Object.freeze([
    'on_registration',
    'before_registration_with_rent',
    'before_registration_no_rent',
    'after_registration',
    'development_handover',
  ]),
  compliance: Object.freeze([
    'electrical',
    'electric_fence',
    'gas',
    'occupancy_certificate',
    'nhbrc',
    'rates_clearance',
    'levy_clearance',
  ]),
})

export const OTP_SHARED_ROUTE_PACKS = Object.freeze([
  'buyer_individual_capacity_pack',
  'buyer_company_authority_pack',
  'buyer_trust_authority_pack',
  'buyer_spouse_consent_pack',
  'buyer_co_purchaser_pack',
  'buyer_foreign_purchaser_pack',
  'seller_individual_capacity_pack',
  'seller_company_authority_pack',
  'seller_trust_authority_pack',
  'seller_spouse_consent_pack',
  'developer_seller_pack',
  'property_full_title_pack',
  'property_sectional_title_pack',
  'property_new_development_unit_pack',
  'finance_cash_pack',
  'finance_bond_pack',
  'finance_hybrid_pack',
  'condition_subject_to_sale_pack',
  'condition_other_suspensive_pack',
  'occupation_rent_pack',
  'fixtures_fittings_pack',
  'disclosure_defects_pack',
  'compliance_certificates_pack',
  'transfer_conveyancer_pack',
  'commission_pack',
  'route_aware_signature_pack',
])

export const OTP_DATA_SOURCE_OWNERS = Object.freeze([
  Object.freeze({
    key: 'buyer_onboarding',
    label: 'Buyer onboarding / buyer offer link',
    owns: Object.freeze([
      'buyer identity',
      'buyer capacity',
      'buyer finance readiness',
      'buyer-side conditions',
      'buyer acknowledgements',
    ]),
    mustNotOwn: Object.freeze([
      'seller facts',
      'developer facts',
      'conveyancer facts',
      'agent FFC',
      'commission',
      'title facts',
    ]),
  }),
  Object.freeze({
    key: 'seller_onboarding',
    label: 'Seller onboarding',
    owns: Object.freeze([
      'seller identity',
      'seller capacity',
      'seller disclosure',
      'defects',
      'seller bond and rates',
      'seller-side fixtures',
      'seller-side certificates',
    ]),
    mustNotOwn: Object.freeze(['buyer finance', 'buyer conditions']),
  }),
  Object.freeze({
    key: 'listing_property_record',
    label: 'Listing / property record',
    owns: Object.freeze([
      'property address',
      'erf or unit facts',
      'title type',
      'HOA or sectional facts',
      'seller-approved fixtures metadata',
    ]),
    mustNotOwn: Object.freeze(['legal wording']),
  }),
  Object.freeze({
    key: 'development_setup',
    label: 'Development setup',
    owns: Object.freeze([
      'developer seller',
      'development',
      'contractor',
      'scheme',
      'VAT basis',
      'body corporate',
      'NHBRC',
      'rules and specifications',
    ]),
    mustNotOwn: Object.freeze(['buyer identity', 'buyer finance']),
  }),
  Object.freeze({
    key: 'development_unit_setup',
    label: 'Development unit setup',
    owns: Object.freeze([
      'unit',
      'parking',
      'garage',
      'exclusive-use areas',
      'participation quota',
      'levy and rates estimates',
      'utility deposits and connection charges',
    ]),
    mustNotOwn: Object.freeze(['buyer identity', 'seller disclosure']),
  }),
  Object.freeze({
    key: 'transaction_offer_terms',
    label: 'Transaction / offer terms',
    owns: Object.freeze([
      'purchase price',
      'deposit',
      'irrevocable offer expiry',
      'guarantee deadline',
      'occupation',
      'occupational rent',
      'structured suspensive conditions',
      'accepted commercial terms',
    ]),
    mustNotOwn: Object.freeze(['long-lived party profile facts']),
  }),
  Object.freeze({
    key: 'conveyancer_transfer_assignment',
    label: 'Conveyancer / transfer assignment',
    owns: Object.freeze([
      'transfer attorney',
      'trust account recipient',
      'guarantee requirements',
      'transfer mechanics',
    ]),
    mustNotOwn: Object.freeze(['buyer onboarding facts']),
  }),
  Object.freeze({
    key: 'organisation_agent_settings',
    label: 'Organisation / agent settings',
    owns: Object.freeze([
      'branding',
      'agency details',
      'agent details',
      'FFC',
      'commission defaults',
    ]),
    mustNotOwn: Object.freeze(['buyer legal status', 'seller legal status']),
  }),
  Object.freeze({
    key: 'legal_template_registry',
    label: 'Legal template registry',
    owns: Object.freeze([
      'definitions',
      'approved wording',
      'route rules',
      'fallback policy',
      'content scan status',
    ]),
    mustNotOwn: Object.freeze(['raw deal facts']),
  }),
  Object.freeze({
    key: 'signing_runtime',
    label: 'Signing runtime',
    owns: Object.freeze([
      'signer roles',
      'signature fields',
      'initial fields',
      'spouse routing',
      'representative routing',
      'witness routing',
    ]),
    mustNotOwn: Object.freeze(['clause selection without route metadata']),
  }),
  Object.freeze({
    key: 'rendering_runtime',
    label: 'Rendering runtime',
    owns: Object.freeze([
      'page numbers',
      'total page count',
      'generated PDF chrome',
      'render-only layout marks',
    ]),
    mustNotOwn: Object.freeze(['party facts', 'commercial terms', 'legal wording']),
  }),
])

export const OTP_VARIANT_ALIASES = Object.freeze({
  resale: 'resale_existing_property',
  existing: 'resale_existing_property',
  existing_property: 'resale_existing_property',
  normal_sale: 'resale_existing_property',
  standard_sale: 'resale_existing_property',
  resale_existing_property: 'resale_existing_property',
  development: 'new_development',
  development_sale: 'new_development',
  new_development: 'new_development',
  off_plan: 'new_development',
  developer_sale: 'new_development',
})

export function normalizeOtpDocumentVariant(value = '') {
  const normalized = normalizeKey(value)
  return OTP_VARIANT_ALIASES[normalized] || ''
}

export function resolveOtpDocumentVariant(options = {}) {
  const sources = [
    options.placeholders,
    options.transaction,
    options.property,
    options.development,
    options.flow,
    options.facts,
    options.sourceContext,
    options,
  ].filter(Boolean)
  const explicit = normalizeOtpDocumentVariant(firstValue(sources, [
    'otp_document_variant',
    'otpDocumentVariant',
    'document_variant',
    'documentVariant',
    'invite.otp_document_variant',
    'invite.otpDocumentVariant',
    'listing.otp_document_variant',
    'listing.otpDocumentVariant',
    'transaction_type',
    'transactionType',
    'sale_type',
    'saleType',
    'property.transaction_type',
    'property.transactionType',
    'listing.transaction_type',
    'listing.transactionType',
    'canonicalFacts.transaction.transaction_type',
    'canonical_facts.transaction.transaction_type',
  ]))
  if (explicit) return explicit

  const developmentFlagSignal = firstValue(sources, [
    'is_new_development',
    'isNewDevelopment',
  ])
  if (hasTruthySignal(developmentFlagSignal)) return 'new_development'

  const developmentIdentitySignal = firstValue(sources, [
    'development_id',
    'developmentId',
    'development.id',
    'listing.development_id',
    'listing.developmentId',
    'property.development_id',
    'property.developmentId',
    'unit.development_id',
    'unit.developmentId',
  ])
  if (normalizeText(developmentIdentitySignal)) return 'new_development'

  const propertyTitleSignal = normalizeKey(firstValue(sources, [
    'property_title_type',
    'property.title_type',
    'propertyTitle',
    'propertyTitleType',
  ]))
  if (propertyTitleSignal === 'new_development_unit') return 'new_development'

  return 'resale_existing_property'
}

export function getOtpVariantDefinition(variantKey = '') {
  const normalized = normalizeOtpDocumentVariant(variantKey) || normalizeKey(variantKey)
  return OTP_DOCUMENT_VARIANTS.find((variant) => variant.key === normalized) || null
}

export function buildOtpRouteUniverseAudit({ checkedAt = new Date().toISOString() } = {}) {
  const ownerKeys = new Set(OTP_DATA_SOURCE_OWNERS.map((owner) => owner.key))
  const variantOwnerGaps = OTP_DOCUMENT_VARIANTS.flatMap((variant) => (
    variant.requiredSourceOwners
      .filter((ownerKey) => !ownerKeys.has(ownerKey))
      .map((ownerKey) => ({ variant: variant.key, ownerKey }))
  ))
  const blockerCodes = [
    OTP_DOCUMENT_VARIANTS.length < 2 ? 'OTP_VARIANTS_NOT_FIRST_CLASS' : '',
    !OTP_ROUTE_DIMENSIONS.documentVariant.includes('resale_existing_property') ? 'RESALE_VARIANT_MISSING' : '',
    !OTP_ROUTE_DIMENSIONS.documentVariant.includes('new_development') ? 'NEW_DEVELOPMENT_VARIANT_MISSING' : '',
    variantOwnerGaps.length ? 'VARIANT_SOURCE_OWNER_GAPS' : '',
  ].filter(Boolean)

  return {
    version: OTP_ROUTE_UNIVERSE_VERSION,
    checkedAt,
    mutatedData: false,
    status: blockerCodes.length ? 'OTP_ROUTE_UNIVERSE_REMEDIATION_REQUIRED' : 'OTP_ROUTE_UNIVERSE_READY_FOR_INTAKE_DESIGN',
    blockerCodes,
    documentVariants: OTP_DOCUMENT_VARIANTS,
    routeDimensions: OTP_ROUTE_DIMENSIONS,
    sharedRoutePacks: OTP_SHARED_ROUTE_PACKS,
    dataSourceOwners: OTP_DATA_SOURCE_OWNERS,
    variantOwnerGaps,
  }
}
