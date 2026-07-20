import { resolveLegalDocumentScenarioProfile } from './legalDocumentScenarioProfile.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

const FIELD_DEFINITIONS = Object.freeze({
  sellerEntityType: { label: 'Seller type', group: 'Legal setup', kind: 'routing' },
  buyerEntityType: { label: 'Buyer type', group: 'Legal setup', kind: 'routing' },
  propertyTitleType: { label: 'Property title type', group: 'Legal setup', kind: 'routing' },
  financeType: { label: 'Finance type', group: 'Legal setup', kind: 'routing' },
  sellerFullName: { label: 'Seller legal name', group: 'Seller' },
  sellerIdNumber: { label: 'Seller ID or registration number', group: 'Seller' },
  sellerMaritalRegime: { label: 'Seller marital position', group: 'Seller' },
  sellerRepresentativeName: { label: 'Seller representative', group: 'Seller authority' },
  sellerRepresentativeCapacity: { label: 'Seller representative capacity', group: 'Seller authority' },
  sellerResolutionDate: { label: 'Seller resolution date', group: 'Seller authority' },
  sellerTrusteeNames: { label: 'Seller trustee names', group: 'Seller authority' },
  sellerAuthorityBasis: { label: 'Seller authority or resolution', group: 'Seller authority' },
  sellerSpouseFullName: { label: 'Seller spouse name', group: 'Seller spouse' },
  sellerSpouseIdNumber: { label: 'Seller spouse ID number', group: 'Seller spouse' },
  sellerSpouseEmail: { label: 'Seller spouse email', group: 'Seller spouse' },
  buyerFullName: { label: 'Buyer legal name', group: 'Buyer' },
  buyerIdNumber: { label: 'Buyer ID or registration number', group: 'Buyer' },
  buyerMaritalRegime: { label: 'Buyer marital position', group: 'Buyer' },
  buyerRepresentativeName: { label: 'Buyer representative', group: 'Buyer authority' },
  buyerRepresentativeCapacity: { label: 'Buyer representative capacity', group: 'Buyer authority' },
  buyerResolutionDate: { label: 'Buyer resolution date', group: 'Buyer authority' },
  buyerTrusteeNames: { label: 'Buyer trustee names', group: 'Buyer authority' },
  buyerAuthorityBasis: { label: 'Buyer authority or resolution', group: 'Buyer authority' },
  buyerSpouseFullName: { label: 'Buyer spouse name', group: 'Buyer spouse' },
  buyerSpouseIdNumber: { label: 'Buyer spouse ID number', group: 'Buyer spouse' },
  buyerSpouseEmail: { label: 'Buyer spouse email', group: 'Buyer spouse' },
  propertyAddress: { label: 'Property address', group: 'Property' },
  unitNumber: { label: 'Section or unit number', group: 'Sectional title' },
  complexName: { label: 'Scheme or complex name', group: 'Sectional title' },
  erfNumber: { label: 'Erf number', group: 'Full title' },
  purchasePrice: { label: 'Purchase price', group: 'Finance' },
  bondAmount: { label: 'Bond amount', group: 'Finance' },
  cashAmount: { label: 'Cash contribution', group: 'Finance' },
})

function requiredPartyFields(role = 'seller', clauseProfile = '') {
  const prefix = role === 'buyer' ? 'buyer' : 'seller'
  if (!clauseProfile || clauseProfile === 'party_unknown') return []
  const fields = [`${prefix}FullName`, `${prefix}IdNumber`]
  if (['individual', 'individual_spouse_consent'].includes(clauseProfile)) {
    fields.push(`${prefix}MaritalRegime`)
  }
  if (clauseProfile === 'company') {
    fields.push(`${prefix}RepresentativeName`, `${prefix}RepresentativeCapacity`, `${prefix}ResolutionDate`, `${prefix}AuthorityBasis`)
  }
  if (clauseProfile === 'trust') {
    fields.push(`${prefix}TrusteeNames`, `${prefix}RepresentativeName`, `${prefix}RepresentativeCapacity`, `${prefix}AuthorityBasis`)
  }
  if (clauseProfile === 'individual_spouse_consent') {
    fields.push(`${prefix}SpouseFullName`, `${prefix}SpouseIdNumber`, `${prefix}SpouseEmail`)
  }
  return fields
}

function requiredRoutingFields(profile = {}) {
  return unique([
    'sellerEntityType',
    profile.sellerEntityType === 'individual' ? 'sellerMaritalRegime' : '',
    profile.packetType === 'otp' ? 'buyerEntityType' : '',
    profile.packetType === 'otp' && profile.buyerEntityType === 'individual' ? 'buyerMaritalRegime' : '',
    'propertyTitleType',
    profile.packetType === 'otp' ? 'financeType' : '',
  ])
}

function scenarioValue(profile = {}, key = '') {
  const values = {
    sellerEntityType: profile.sellerEntityType,
    sellerMaritalRegime: profile.sellerMaritalRegime,
    buyerEntityType: profile.buyerEntityType,
    buyerMaritalRegime: profile.buyerMaritalRegime,
    propertyTitleType: profile.propertyTitleType,
    financeType: profile.financeType,
  }
  return values[key]
}

export function getLegalDocumentScenarioDependentFieldClears(field = '', value = '') {
  const normalizedValue = normalizeText(value).toLowerCase()
  const role = field === 'buyerEntityType' ? 'buyer' : field === 'sellerEntityType' ? 'seller' : ''
  const fields = []

  if (role) {
    if (normalizedValue !== 'individual') {
      fields.push(`${role}MaritalRegime`, `${role}SpouseFullName`, `${role}SpouseIdNumber`, `${role}SpouseEmail`)
    }
    if (normalizedValue !== 'trust') fields.push(`${role}TrusteeNames`)
    if (!['company', 'close_corporation'].includes(normalizedValue)) fields.push(`${role}ResolutionDate`)
    if (normalizedValue === 'individual' || !normalizedValue) {
      fields.push(`${role}RepresentativeName`, `${role}RepresentativeCapacity`, `${role}AuthorityBasis`)
    }
  }

  if (field === 'buyerMaritalRegime' && normalizedValue !== 'in_community') {
    fields.push('buyerSpouseFullName', 'buyerSpouseIdNumber', 'buyerSpouseEmail')
  }
  if (field === 'sellerMaritalRegime' && normalizedValue !== 'in_community') {
    fields.push('sellerSpouseFullName', 'sellerSpouseIdNumber', 'sellerSpouseEmail')
  }
  if (field === 'propertyTitleType') {
    if (normalizedValue !== 'sectional_title') fields.push('unitNumber', 'complexName')
    if (normalizedValue !== 'full_title') fields.push('erfNumber')
  }
  if (field === 'financeType') {
    if (!['bond', 'combination'].includes(normalizedValue)) fields.push('bondAmount')
    if (!['cash', 'combination'].includes(normalizedValue)) fields.push('cashAmount')
  }

  return unique(fields)
}

export function sanitizeLegalDocumentScenarioDraft(draft = {}, options = {}) {
  const source = { ...asRecord(draft) }
  const profile = options.scenarioProfile || resolveLegalDocumentScenarioProfile({
    packetType: options.packetType || options.packet_type || 'otp',
    seller: {
      entityType: source.sellerEntityType,
      maritalRegime: source.sellerMaritalRegime,
    },
    buyer: {
      entityType: source.buyerEntityType,
      maritalRegime: source.buyerMaritalRegime,
    },
    property: { titleType: source.propertyTitleType },
    transaction: { financeType: source.financeType },
  })
  const answers = [
    ['sellerEntityType', profile.sellerEntityType],
    ['sellerMaritalRegime', profile.sellerMaritalRegime],
    ...(profile.packetType === 'otp'
      ? [
          ['buyerEntityType', profile.buyerEntityType],
          ['buyerMaritalRegime', profile.buyerMaritalRegime],
        ]
      : []),
    ['propertyTitleType', profile.propertyTitleType],
    ...(profile.packetType === 'otp' ? [['financeType', profile.financeType]] : []),
  ]

  for (const [field, value] of answers) {
    for (const dependentField of getLegalDocumentScenarioDependentFieldClears(field, value)) {
      source[dependentField] = ''
    }
  }
  return source
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function firstValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== null && value !== undefined && normalizeText(value) !== '') return value
  }
  return ''
}

export function buildLegalDocumentRequirementDraftFromPlaceholders(placeholders = {}) {
  const source = asRecord(placeholders)
  return {
    sellerFullName: firstValue(source, ['seller_full_name', 'seller_name']),
    sellerIdNumber: firstValue(source, ['seller_id_number', 'seller_company_registration_number', 'seller_trust_registration_number']),
    sellerMaritalRegime: firstValue(source, ['seller_marital_status', 'seller_marital_regime']),
    sellerRepresentativeName: firstValue(source, ['seller_representative_name']),
    sellerRepresentativeCapacity: firstValue(source, ['seller_representative_capacity']),
    sellerResolutionDate: firstValue(source, ['seller_resolution_date']),
    sellerTrusteeNames: firstValue(source, ['seller_trustee_names']),
    sellerAuthorityBasis: firstValue(source, ['seller_authority_basis']),
    sellerSpouseFullName: firstValue(source, ['seller_spouse_full_name']),
    sellerSpouseIdNumber: firstValue(source, ['seller_spouse_id_number']),
    sellerSpouseEmail: firstValue(source, ['seller_spouse_email']),
    buyerFullName: firstValue(source, ['buyer_full_name', 'buyer_name']),
    buyerIdNumber: firstValue(source, ['buyer_id_number', 'buyer_company_registration_number', 'buyer_trust_registration_number']),
    buyerMaritalRegime: firstValue(source, ['buyer_marital_status', 'buyer_marital_regime']),
    buyerRepresentativeName: firstValue(source, ['buyer_representative_name']),
    buyerRepresentativeCapacity: firstValue(source, ['buyer_representative_capacity']),
    buyerResolutionDate: firstValue(source, ['buyer_resolution_date']),
    buyerTrusteeNames: firstValue(source, ['buyer_trustee_names']),
    buyerAuthorityBasis: firstValue(source, ['buyer_authority_basis']),
    buyerSpouseFullName: firstValue(source, ['buyer_spouse_full_name']),
    buyerSpouseIdNumber: firstValue(source, ['buyer_spouse_id_number']),
    buyerSpouseEmail: firstValue(source, ['buyer_spouse_email']),
    propertyAddress: firstValue(source, ['property_address', 'property_full_address']),
    propertyTitleType: firstValue(source, ['property_title_type', 'property.title_type_raw']),
    unitNumber: firstValue(source, ['property_unit_number', 'unit_number', 'property_section_number']),
    complexName: firstValue(source, ['property_complex_name', 'property_sectional_title_scheme', 'complex_name']),
    erfNumber: firstValue(source, ['property_erf_number', 'erf_number']),
    purchasePrice: firstValue(source, ['purchase_price']),
    bondAmount: firstValue(source, ['bond_amount']),
    cashAmount: firstValue(source, ['cash_amount']),
  }
}

export function resolveLegalDocumentScenarioRequirements(options = {}) {
  const draft = asRecord(options.draft)
  const profile = options.scenarioProfile || resolveLegalDocumentScenarioProfile(options)
  const routingFieldKeys = requiredRoutingFields(profile)
  const requiredKeys = unique([
    ...routingFieldKeys,
    ...requiredPartyFields('seller', profile.sellerClauseProfile),
    ...(profile.packetType === 'otp' ? requiredPartyFields('buyer', profile.buyerClauseProfile) : []),
    profile.propertyClauseProfile !== 'property_unknown' ? 'propertyAddress' : '',
    profile.propertyClauseProfile === 'sectional_title' ? 'unitNumber' : '',
    profile.propertyClauseProfile === 'sectional_title' ? 'complexName' : '',
    profile.propertyClauseProfile === 'full_title' ? 'erfNumber' : '',
    profile.packetType === 'otp' && profile.financeClauseProfile !== 'finance_unknown' ? 'purchasePrice' : '',
    profile.financeClauseProfile === 'bond' ? 'bondAmount' : '',
    profile.financeClauseProfile === 'cash' ? 'cashAmount' : '',
    profile.financeClauseProfile === 'combination' ? 'bondAmount' : '',
    profile.financeClauseProfile === 'combination' ? 'cashAmount' : '',
  ])
  const fields = requiredKeys.map((key) => {
    const definition = FIELD_DEFINITIONS[key] || { label: key, group: 'Legal details' }
    const value = firstValue(draft, [key]) || scenarioValue(profile, key)
    const complete = normalizeText(value) !== ''
    return { key, ...definition, value, complete, missing: !complete }
  })
  const missingFields = fields.filter((field) => field.missing)
  const groups = Array.from(new Set(fields.map((field) => field.group))).map((group) => {
    const groupFields = fields.filter((field) => field.group === group)
    return {
      key: group.toLowerCase().replace(/\s+/g, '_'),
      label: group,
      fields: groupFields,
      complete: groupFields.every((field) => field.complete),
      missingCount: groupFields.filter((field) => field.missing).length,
    }
  })

  return {
    packetType: profile.packetType,
    scenarioProfile: profile,
    fields,
    groups,
    missingFields,
    requiredFieldKeys: requiredKeys,
    routingFieldKeys,
    dataFieldKeys: requiredKeys.filter((key) => !routingFieldKeys.includes(key)),
    activePackKeys: [...(profile.activePackKeys || [])],
    phase: !profile.complete ? 'routing' : missingFields.length ? 'details' : 'complete',
    nextMissingGroup: groups.find((group) => !group.complete)?.key || '',
    complete: profile.complete && missingFields.length === 0,
    completionCount: fields.length - missingFields.length,
    fieldCount: fields.length,
  }
}
