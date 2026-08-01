function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeUnderscoreKey(value = '') {
  return normalizeText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function readPath(source = {}, path = '') {
  const parts = String(path || '').split('.').filter(Boolean)
  let current = source
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    current = current[part]
  }
  return current
}

function hasUsableValue(value) {
  if (Array.isArray(value)) return value.length > 0
  if (value && typeof value === 'object') return false
  if (typeof value === 'boolean') return true
  return value !== null && value !== undefined && normalizeText(value) !== ''
}

function definitionSupportsPacketType(definition = {}, packetType = '') {
  const normalizedPacketType = normalizeText(packetType).toLowerCase()
  if (!normalizedPacketType) return true
  return Array.isArray(definition.packetTypes) ? definition.packetTypes.includes(normalizedPacketType) : true
}

function freezeDefinition(definition = {}) {
  return Object.freeze({
    ...definition,
    canonicalMergeField: normalizeUnderscoreKey(definition.canonicalMergeField),
    domain: normalizeText(definition.domain),
    sourcePaths: Object.freeze([...(definition.sourcePaths || [])]),
    compositeSourcePaths: Object.freeze((definition.compositeSourcePaths || []).map((group) => Object.freeze([...group]))),
    packetTypes: Object.freeze([...(definition.packetTypes || [])]),
    requiredIn: Object.freeze([...(definition.requiredIn || [])]),
  })
}

export const CANONICAL_FIELD_SOURCE_DEFINITIONS = Object.freeze([
  // Buyer identity and capacity.
  {
    canonicalMergeField: 'buyer_full_name',
    domain: 'buyer',
    packetTypes: ['otp'],
    requiredIn: ['buyer_onboarding', 'otp'],
    sourcePaths: [
      'buyer.full_name',
      'buyer.name',
      'buyer.display_name',
      'buyer.person.full_name',
      'buyer.person.name',
      'buyer.company.name',
      'buyer.company.company_name',
      'buyer.trust.name',
      'buyer.trust.trust_name',
    ],
    compositeSourcePaths: [
      ['buyer.person.first_name', 'buyer.person.last_name'],
    ],
  },
  {
    canonicalMergeField: 'buyer_id_number',
    domain: 'buyer',
    packetTypes: ['otp'],
    requiredIn: ['buyer_onboarding', 'otp'],
    sourcePaths: [
      'buyer.id_number',
      'buyer.registration_or_id',
      'buyer.person.identity_number_or_passport_number',
      'buyer.person.identity_number',
      'buyer.person.passport_number',
    ],
  },
  {
    canonicalMergeField: 'buyer_email',
    domain: 'buyer',
    packetTypes: ['otp'],
    requiredIn: ['buyer_onboarding', 'otp'],
    sourcePaths: [
      'buyer.email',
      'buyer.person.email',
      'buyer.company.authorised_signatory.email',
      'buyer.company.authorized_signatory.email',
      'buyer.trust.authorised_trustee.email',
      'buyer.trust.authorized_trustee.email',
    ],
  },
  {
    canonicalMergeField: 'buyer_phone',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.phone',
      'buyer.person.phone',
      'buyer.company.authorised_signatory.phone',
      'buyer.company.authorized_signatory.phone',
      'buyer.trust.authorised_trustee.phone',
      'buyer.trust.authorized_trustee.phone',
    ],
  },
  {
    canonicalMergeField: 'buyer_entity_type',
    domain: 'buyer',
    packetTypes: ['otp'],
    requiredIn: ['buyer_onboarding', 'otp'],
    sourcePaths: [
      'buyer.entity_type',
      'buyer.entity_type_raw',
      'buyer.legal_type',
      'buyer.purchaser_type',
      'buyer.branch',
    ],
  },
  {
    canonicalMergeField: 'buyer_marital_status',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.marital_status',
      'buyer.person.marital_status',
    ],
  },
  {
    canonicalMergeField: 'buyer_marital_regime',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.marital_regime',
      'buyer.person.marital_regime',
    ],
  },
  {
    canonicalMergeField: 'buyer_spouse_full_name',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.spouse_full_name',
      'buyer.spouse.name',
      'buyer.person.spouse_full_name',
    ],
  },
  {
    canonicalMergeField: 'buyer_spouse_id_number',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.spouse_id_number',
      'buyer.spouse.id_number',
      'buyer.person.spouse_identity_number',
      'buyer.person.spouse_id_number',
    ],
  },
  {
    canonicalMergeField: 'buyer_spouse_email',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.spouse_email',
      'buyer.spouse.email',
      'buyer.person.spouse_email',
    ],
  },
  {
    canonicalMergeField: 'buyer_spouse_consent_required',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.spouse_consent_required',
      'buyer.spouse.consent_required',
      'buyer.person.spouse_consent_required',
    ],
  },
  {
    canonicalMergeField: 'buyer_company_registration_number',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.company.registration_number',
      'buyer.company.company_registration_number',
    ],
  },
  {
    canonicalMergeField: 'buyer_representative_name',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.company.authorised_signatory.name',
      'buyer.company.authorized_signatory.name',
      'buyer.trust.authorised_trustee.name',
      'buyer.trust.authorized_trustee.name',
    ],
  },
  {
    canonicalMergeField: 'buyer_representative_capacity',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.company.authorised_signatory.capacity',
      'buyer.company.authorized_signatory.capacity',
      'buyer.trust.authorised_trustee.capacity',
      'buyer.trust.authorized_trustee.capacity',
    ],
  },
  {
    canonicalMergeField: 'buyer_resolution_date',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.company.resolution_date',
      'buyer.trust.resolution_date',
    ],
  },
  {
    canonicalMergeField: 'buyer_authority_basis',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.company.authority_basis',
      'buyer.trust.authority_basis',
    ],
  },
  {
    canonicalMergeField: 'buyer_trust_registration_number',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.trust.registration_number',
      'buyer.trust.trust_registration_number',
    ],
  },
  {
    canonicalMergeField: 'buyer_trustee_names',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.trust.trustees',
    ],
  },
  {
    canonicalMergeField: 'buyer_domicilium_address',
    domain: 'buyer',
    packetTypes: ['otp'],
    sourcePaths: [
      'buyer.domicilium_address',
      'buyer.person.residential_address',
      'buyer.person.residential_address.line_1',
      'buyer.person.physical_address',
    ],
  },

  // Seller identity and capacity.
  {
    canonicalMergeField: 'seller_full_name',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    requiredIn: ['seller_onboarding', 'mandate', 'otp'],
    sourcePaths: [
      'seller.full_name',
      'seller.name',
      'seller.display_name',
      'seller.company.name',
      'seller.trust.name',
    ],
    compositeSourcePaths: [
      ['seller.first_name', 'seller.surname'],
      ['seller.first_name', 'seller.last_name'],
    ],
  },
  {
    canonicalMergeField: 'seller_id_number',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    requiredIn: ['seller_onboarding', 'mandate', 'otp'],
    sourcePaths: [
      'seller.id_number',
      'seller.registration_or_id',
      'seller.identity_number',
      'seller.passport_number',
    ],
  },
  {
    canonicalMergeField: 'seller_email',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.email',
      'seller.company.authorised_signatory.email',
      'seller.company.authorized_signatory.email',
      'seller.trust.authorised_trustee.email',
      'seller.trust.authorized_trustee.email',
    ],
  },
  {
    canonicalMergeField: 'seller_phone',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.phone',
      'seller.company.authorised_signatory.phone',
      'seller.company.authorized_signatory.phone',
      'seller.trust.authorised_trustee.phone',
      'seller.trust.authorized_trustee.phone',
    ],
  },
  {
    canonicalMergeField: 'seller_entity_type',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.entity_type',
      'seller.entity_type_raw',
      'seller.legal_type',
      'seller.seller_type',
      'seller.branch',
      'seller.owner_entity_type',
      'seller.owner_structure_type',
    ],
  },
  {
    canonicalMergeField: 'seller_marital_status',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.marital_status',
    ],
  },
  {
    canonicalMergeField: 'seller_marital_regime',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.marital_regime',
    ],
  },
  {
    canonicalMergeField: 'seller_spouse_full_name',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.spouse_full_name',
      'seller.spouse.name',
    ],
  },
  {
    canonicalMergeField: 'seller_spouse_id_number',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.spouse_id_number',
      'seller.spouse.id_number',
    ],
  },
  {
    canonicalMergeField: 'seller_spouse_email',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.spouse_email',
      'seller.spouse.email',
    ],
  },
  {
    canonicalMergeField: 'seller_spouse_consent_required',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.spouse_consent_required',
      'seller.spouse.consent_required',
    ],
  },
  {
    canonicalMergeField: 'seller_company_registration_number',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.company.registration_number',
    ],
  },
  {
    canonicalMergeField: 'seller_representative_name',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.company.authorised_signatory.name',
      'seller.company.authorized_signatory.name',
      'seller.trust.authorised_trustee.name',
      'seller.trust.authorized_trustee.name',
      'seller.power_of_attorney.representative_name',
      'seller.deceased_estate.executor_name',
    ],
  },
  {
    canonicalMergeField: 'seller_representative_capacity',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.company.authorised_signatory.capacity',
      'seller.company.authorized_signatory.capacity',
      'seller.trust.authorised_trustee.capacity',
      'seller.trust.authorized_trustee.capacity',
    ],
  },
  {
    canonicalMergeField: 'seller_resolution_date',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.company.resolution_date',
      'seller.trust.resolution_date',
    ],
  },
  {
    canonicalMergeField: 'seller_authority_basis',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.company.authority_basis',
      'seller.trust.authority_basis',
      'seller.power_of_attorney.authority_details',
      'seller.deceased_estate.authority_details',
    ],
  },
  {
    canonicalMergeField: 'seller_trust_registration_number',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.trust.registration_number',
    ],
  },
  {
    canonicalMergeField: 'seller_trustee_names',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.trust.trustees',
    ],
  },
  {
    canonicalMergeField: 'seller_domicilium_address',
    domain: 'seller',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'seller.domicilium_address',
      'seller.residential_address',
      'seller.company.registered_address',
      'seller.trust.registered_address',
      'seller.company.authorised_signatory.residential_address',
      'seller.trust.authorised_trustee.residential_address',
    ],
  },

  // Property facts.
  {
    canonicalMergeField: 'property_address',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    requiredIn: ['seller_onboarding', 'mandate', 'otp'],
    sourcePaths: [
      'property.address',
      'property.full_address',
      'property.display_address',
      'property.address.formatted',
      'property.address.line_1',
      'property.address.line1',
      'property.address_details.line_1',
      'property.address_details.line1',
    ],
  },
  {
    canonicalMergeField: 'property_suburb',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'property.suburb',
      'property.address.suburb',
      'property.address_details.suburb',
    ],
  },
  {
    canonicalMergeField: 'property_city',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'property.city',
      'property.address.city',
      'property.address_details.city',
    ],
  },
  {
    canonicalMergeField: 'property_postal_code',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'property.postal_code',
      'property.postalCode',
      'property.address.postal_code',
      'property.address.postalCode',
      'property.address_details.postal_code',
      'property.address_details.postalCode',
    ],
  },
  {
    canonicalMergeField: 'property_type',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'property.property_type',
      'property.type',
      'property.category',
      'property.property_category',
    ],
  },
  {
    canonicalMergeField: 'property_title_type',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    requiredIn: ['seller_onboarding', 'mandate', 'otp'],
    sourcePaths: [
      'property.property_title_type',
      'property.title_type',
      'property.title_type_raw',
      'property.structure_type',
      'property.property_structure_type',
    ],
  },
  {
    canonicalMergeField: 'property_unit_number',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'property.unit_number',
      'property.unitNumber',
      'property.scheme.unit_number',
      'property.scheme.unitNumber',
    ],
  },
  {
    canonicalMergeField: 'property_section_number',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'property.section_number',
      'property.sectionNumber',
      'property.scheme.section_number',
      'property.scheme.sectionNumber',
    ],
  },
  {
    canonicalMergeField: 'property_complex_name',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'property.complex_name',
      'property.scheme_name',
      'property.scheme.name',
    ],
  },
  {
    canonicalMergeField: 'property_estate_name',
    domain: 'property',
    packetTypes: ['mandate', 'otp'],
    sourcePaths: [
      'property.estate_name',
      'property.estate.name',
    ],
  },

  // Finance facts.
  {
    canonicalMergeField: 'purchase_price',
    domain: 'finance',
    packetTypes: ['otp', 'mandate'],
    requiredIn: ['buyer_onboarding', 'otp'],
    sourcePaths: [
      'finance.purchase_price',
      'transaction.purchase_price',
    ],
  },
  {
    canonicalMergeField: 'finance_type',
    domain: 'finance',
    packetTypes: ['otp'],
    requiredIn: ['buyer_onboarding', 'otp'],
    sourcePaths: [
      'finance.finance_type',
      'finance.purchase_finance_type',
      'finance.type',
    ],
  },
  {
    canonicalMergeField: 'bond_amount',
    domain: 'finance',
    packetTypes: ['otp'],
    sourcePaths: [
      'finance.bond_amount',
      'transaction.bond_amount',
    ],
  },
  {
    canonicalMergeField: 'cash_amount',
    domain: 'finance',
    packetTypes: ['otp'],
    sourcePaths: [
      'finance.cash_amount',
      'transaction.cash_amount',
    ],
  },
].map(freezeDefinition))

export const NON_MERGE_CANONICAL_SOURCE_PATHS = Object.freeze([
  'buyer.company.board_resolution_available',
  'buyer.company.directors',
  'buyer.company.registered_address',
  'buyer.person.spouse_phone',
  'buyer.person.spouse_residential_address',
  'buyer.trust.letters_of_authority_available',
  'buyer.trust.registered_address',
  'buyer.trust.resolution_available',
  'buyer.trust.trust_deed_available',
  'finance.affordability_confirmed',
  'finance.bank_statements_available',
  'finance.bond_assistance_contact_consent',
  'finance.bond_assistance_selection',
  'finance.bond_bank_name',
  'finance.bond_current_status',
  'finance.bond_originator_name',
  'finance.bond_process_started',
  'finance.bond_readiness_consent',
  'finance.buyer_banks',
  'finance.cash_contribution_available',
  'finance.deposit_source',
  'finance.proof_of_funds_available',
  'finance.source_of_funds',
  'property.category_other',
  'property.province',
  'property.rates_taxes',
  'seller.company.directors',
  'seller.company.resolution_available',
  'seller.spouse.phone',
  'seller.spouse.residential_address',
  'seller.trust.resolution_available',
])

export function listCanonicalFieldSourceDefinitions({ packetType = null, mergeFieldKey = '', domain = '' } = {}) {
  const normalizedMergeFieldKey = normalizeUnderscoreKey(mergeFieldKey)
  const normalizedDomain = normalizeText(domain)
  return CANONICAL_FIELD_SOURCE_DEFINITIONS.filter((definition) => {
    if (normalizedMergeFieldKey && definition.canonicalMergeField !== normalizedMergeFieldKey) return false
    if (normalizedDomain && definition.domain !== normalizedDomain) return false
    return definitionSupportsPacketType(definition, packetType)
  })
}

export function getCanonicalSourceAliasesForMergeField(mergeFieldKey = '', options = {}) {
  return listCanonicalFieldSourceDefinitions({ ...options, mergeFieldKey })
    .flatMap((definition) => definition.sourcePaths)
    .filter(Boolean)
}

export function resolveCanonicalMergeFieldFromSourcePath(sourcePath = '', options = {}) {
  const normalizedSourcePath = normalizeText(sourcePath)
  if (!normalizedSourcePath) return ''
  const normalizedSourceAlias = normalizeUnderscoreKey(normalizedSourcePath)

  for (const definition of listCanonicalFieldSourceDefinitions(options)) {
    if (definition.sourcePaths.some((path) => path === normalizedSourcePath || normalizeUnderscoreKey(path) === normalizedSourceAlias)) {
      return definition.canonicalMergeField
    }
  }
  return ''
}

export function isNonMergeCanonicalSourcePath(sourcePath = '') {
  const normalizedSourcePath = normalizeText(sourcePath)
  const normalizedSourceAlias = normalizeUnderscoreKey(normalizedSourcePath)
  return NON_MERGE_CANONICAL_SOURCE_PATHS.some((path) => path === normalizedSourcePath || normalizeUnderscoreKey(path) === normalizedSourceAlias)
}

export function resolveCanonicalFieldValue(source = {}, mergeFieldKey = '', options = {}) {
  const definitions = listCanonicalFieldSourceDefinitions({ ...options, mergeFieldKey })
  for (const definition of definitions) {
    for (const path of definition.sourcePaths) {
      const value = readPath(source, path)
      if (hasUsableValue(value)) return value
    }
    for (const group of definition.compositeSourcePaths) {
      const parts = group.map((path) => readPath(source, path)).filter(hasUsableValue).map((value) => normalizeText(value))
      if (parts.length === group.length) return parts.join(' ')
    }
  }
  return undefined
}

export function buildCanonicalMergeFieldPayload(sources = [], options = {}) {
  const sourceList = Array.isArray(sources) ? sources : [sources]
  const payload = {}
  for (const definition of listCanonicalFieldSourceDefinitions(options)) {
    for (const source of sourceList) {
      const value = resolveCanonicalFieldValue(source, definition.canonicalMergeField, options)
      if (!hasUsableValue(value)) continue
      payload[definition.canonicalMergeField] = value
      break
    }
  }
  return payload
}

export function mergeCanonicalMergeFieldPayload(primary = {}, fallback = {}) {
  const primaryPayload = primary && typeof primary === 'object' && !Array.isArray(primary) ? primary : {}
  const fallbackPayload = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {}
  const merged = { ...primaryPayload }
  for (const [key, value] of Object.entries(fallbackPayload)) {
    if (hasUsableValue(merged[key])) continue
    if (!hasUsableValue(value)) continue
    merged[key] = value
  }
  return merged
}
