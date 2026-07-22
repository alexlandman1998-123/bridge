import {
  normalizeLegalMaritalRegime,
  normalizeLegalPartyEntityType,
  normalizeLegalPropertyTitleType,
  resolveCanonicalLegalDocumentScenario,
} from './legalDocumentScenarioProfile.js'

function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function readFirstNormalized(values = [], normalize = (value) => value) {
  for (const value of values) {
    if (value === null || value === undefined || normalizeText(value) === '') continue
    const normalized = normalize(value)
    if (normalizeText(normalized)) return normalized
  }
  return ''
}

export const DOCUMENT_START_PARTY_TYPES = Object.freeze([
  { value: 'individual', label: 'Individual' },
  { value: 'company', label: 'Company' },
  { value: 'trust', label: 'Trust' },
  { value: 'close_corporation', label: 'Close corporation' },
])

export const DOCUMENT_START_MARITAL_REGIMES = Object.freeze([
  { value: 'single', label: 'Single / not married' },
  { value: 'out_of_community', label: 'Married out of community' },
  { value: 'in_community', label: 'Married in community of property' },
])

export const DOCUMENT_START_PROPERTY_TITLE_TYPES = Object.freeze([
  { value: 'full_title', label: 'Full title' },
  { value: 'sectional_title', label: 'Sectional title' },
])

export const DOCUMENT_START_FINANCE_TYPES = Object.freeze([
  { value: 'cash', label: 'Cash' },
  { value: 'bond', label: 'Bond' },
  { value: 'combination', label: 'Cash and bond' },
])

function getOptionLabel(options = [], value = '') {
  return options.find((option) => option.value === value)?.label || ''
}

export function normalizeDocumentStartLegalScenario(input = {}, packetType = '') {
  const normalizedPacketType = normalizeKey(packetType || input.packetType)
  const canonical = resolveCanonicalLegalDocumentScenario({ ...input, packetType: normalizedPacketType })
  const sellerEntityType = canonical.sellerEntityType
  const buyerEntityType = canonical.buyerEntityType
  const sellerMaritalRegime = canonical.sellerMaritalRegime
  const buyerMaritalRegime = canonical.buyerMaritalRegime
  const propertyTitleType = canonical.propertyTitleType
  const financeType = canonical.financeType
  const sellerProfile = canonical.sellerClauseProfile === 'party_unknown' ? '' : canonical.sellerClauseProfile
  const buyerProfile = canonical.buyerClauseProfile === 'party_unknown' ? '' : canonical.buyerClauseProfile
  const mandateTemplateVariant = normalizedPacketType === 'mandate' && canonical.complete
    ? canonical.templateVariant
    : ''
  const summaryParts = [
    sellerProfile ? `${getOptionLabel(DOCUMENT_START_PARTY_TYPES, sellerEntityType)} seller${sellerProfile === 'individual_spouse_consent' ? ' (married in community)' : ''}` : '',
    normalizedPacketType === 'otp' && buyerProfile
      ? `${getOptionLabel(DOCUMENT_START_PARTY_TYPES, buyerEntityType)} buyer${buyerProfile === 'individual_spouse_consent' ? ' (married in community)' : ''}`
      : '',
    getOptionLabel(DOCUMENT_START_PROPERTY_TITLE_TYPES, propertyTitleType),
    normalizedPacketType === 'otp' ? getOptionLabel(DOCUMENT_START_FINANCE_TYPES, financeType) : '',
  ].filter(Boolean)

  return {
    packetType: normalizedPacketType,
    sellerEntityType,
    sellerMaritalRegime,
    sellerProfile,
    buyerEntityType,
    buyerMaritalRegime,
    buyerProfile,
    propertyTitleType,
    propertyProfile: propertyTitleType,
    financeType,
    mandateTemplateVariant,
    activePackKeys: canonical.activePackKeys,
    missingFields: canonical.missingFacts,
    conflictingFacts: canonical.conflictingFacts,
    invalidFacts: canonical.invalidFacts,
    sourceProvenance: canonical.sourceProvenance,
    resolverVersion: canonical.resolverVersion,
    complete: canonical.complete,
    summaryLabel: summaryParts.join(' + '),
  }
}

export function buildDocumentStartLegalScenarioFromSellerOnboarding(input = {}) {
  const source = asRecord(input)
  const packetType = source.packetType || source.packet_type || 'mandate'
  const listing = asRecord(source.listing || source.privateListing || source.private_listing)
  const lead = asRecord(source.lead || source.row)
  const sellerProfile = asRecord(source.sellerProfile || source.seller_profile)
  const property = asRecord(source.property)
  const onboarding = asRecord(
    source.onboarding ||
      source.sellerOnboarding ||
      listing.sellerOnboarding ||
      listing.seller_onboarding ||
      lead.sellerOnboarding ||
      lead.seller_onboarding,
  )
  const formData = asRecord(
    source.formData ||
      source.form_data ||
      onboarding.formData ||
      onboarding.form_data ||
      listing.sellerOnboardingFormData ||
      listing.seller_onboarding_form_data ||
      lead.sellerOnboardingFormData ||
      lead.seller_onboarding_form_data,
  )
  const canonicalFacts = asRecord(
    source.canonicalFacts ||
      source.canonical_facts ||
      listing.sellerCanonicalFacts ||
      listing.seller_canonical_facts_json ||
      lead.sellerCanonicalFacts ||
      lead.seller_canonical_facts_json ||
      onboarding.canonicalFacts ||
      onboarding.canonical_facts_json ||
      formData.canonicalSellerFacts ||
      formData.canonical_facts,
  )
  const canonicalSeller = asRecord(canonicalFacts.seller)
  const canonicalProperty = asRecord(canonicalFacts.property)
  const canonicalTransaction = asRecord(canonicalFacts.transaction)

  const sellerEntityType = readFirstNormalized([
    formData.sellerEntityType,
    formData.seller_entity_type,
    formData.entityType,
    formData.entity_type,
    formData.sellerType,
    formData.seller_type,
    onboarding.sellerType,
    onboarding.seller_type,
    sellerProfile.entityType,
    sellerProfile.sellerType,
    listing.sellerEntityType,
    listing.seller_entity_type,
    listing.sellerType,
    listing.seller_type,
    lead.sellerEntityType,
    lead.seller_entity_type,
    lead.sellerType,
    lead.seller_type,
    formData.ownershipType,
    formData.ownership_type,
    formData.ownershipStructure,
    formData.ownership_structure,
    onboarding.ownershipStructure,
    onboarding.ownership_structure,
    canonicalSeller.entity_type,
    canonicalSeller.seller_type,
  ], normalizeLegalPartyEntityType)

  const sellerMaritalRegime = readFirstNormalized([
    formData.sellerMaritalRegime,
    formData.seller_marital_regime,
    formData.maritalRegime,
    formData.marital_regime,
    formData.marriageRegime,
    formData.marriage_regime,
    formData.marriageType,
    formData.marriage_type,
    formData.maritalStatus,
    formData.marital_status,
    onboarding.maritalRegime,
    onboarding.marital_regime,
    listing.sellerMaritalRegime,
    listing.seller_marital_regime,
    listing.sellerMaritalStatus,
    listing.seller_marital_status,
    lead.sellerMaritalRegime,
    lead.seller_marital_regime,
    lead.sellerMaritalStatus,
    lead.seller_marital_status,
    formData.ownershipType,
    formData.ownership_type,
    formData.ownershipStructure,
    formData.ownership_structure,
    onboarding.ownershipStructure,
    onboarding.ownership_structure,
    canonicalSeller.marital_regime,
    canonicalSeller.marital_status,
  ], normalizeLegalMaritalRegime)

  const propertyTitleType = readFirstNormalized([
    formData.propertyTitleType,
    formData.property_title_type,
    formData.titleType,
    formData.title_type,
    formData.propertyStructureType,
    formData.property_structure_type,
    formData.propertyType,
    formData.property_type,
    listing.propertyTitleType,
    listing.property_title_type,
    listing.propertyStructureType,
    listing.property_structure_type,
    listing.propertyType,
    listing.property_type,
    lead.propertyTitleType,
    lead.property_title_type,
    lead.propertyStructureType,
    lead.property_structure_type,
    lead.propertyType,
    lead.property_type,
    property.titleType,
    property.title_type,
    property.propertyTitleType,
    property.property_title_type,
    property.propertyStructureType,
    property.property_structure_type,
    property.propertyType,
    property.property_type,
    canonicalProperty.title_type,
    canonicalProperty.property_title_type,
    canonicalProperty.property_structure_type,
    canonicalProperty.property_type,
    canonicalTransaction.property_title_type,
    canonicalTransaction.property_structure_type,
  ], normalizeLegalPropertyTitleType)

  return normalizeDocumentStartLegalScenario({
    packetType,
    sellerEntityType,
    sellerMaritalRegime,
    propertyTitleType,
    seller: {
      entityType: sellerEntityType,
      maritalRegime: sellerMaritalRegime,
    },
    property: {
      titleType: propertyTitleType,
    },
    sourceContext: {
      seller_onboarding_used: Object.keys(formData).length > 0 || Object.keys(onboarding).length > 0,
      canonicalFacts,
    },
  }, packetType)
}

export function getDocumentStartLegalScenarioInclusions(input = {}, packetType = '') {
  const scenario = normalizeDocumentStartLegalScenario(input, packetType)
  const inclusions = []
  const profiles = [scenario.sellerProfile, scenario.buyerProfile].filter(Boolean)
  if (profiles.includes('company') || profiles.includes('close_corporation')) inclusions.push('Company authority and representative wording')
  if (profiles.includes('trust')) inclusions.push('Trustee authority and signature wording')
  if (profiles.includes('individual_spouse_consent')) inclusions.push('Spouse consent and signature wording')
  if (scenario.propertyTitleType === 'sectional_title') inclusions.push('Sectional-title property wording')
  if (scenario.propertyTitleType === 'full_title') inclusions.push('Full-title property wording')
  if (scenario.financeType === 'bond') inclusions.push('Bond finance wording')
  if (scenario.financeType === 'combination') inclusions.push('Cash and bond finance wording')
  if (scenario.financeType === 'cash') inclusions.push('Cash purchase wording')
  return inclusions
}

export function appendDocumentStartLegalScenarioParams(params, input = {}, packetType = '') {
  if (!params || typeof params.set !== 'function') return params
  const scenario = normalizeDocumentStartLegalScenario(input, packetType)
  const values = {
    sellerEntityType: scenario.sellerEntityType,
    sellerMaritalRegime: scenario.sellerMaritalRegime,
    buyerEntityType: scenario.buyerEntityType,
    buyerMaritalRegime: scenario.buyerMaritalRegime,
    propertyTitleType: scenario.propertyTitleType,
    financeType: scenario.financeType,
  }
  Object.entries(values).forEach(([key, value]) => {
    if (value) params.set(key, value)
  })
  return params
}

export function readDocumentStartLegalScenarioParams(searchParams, packetType = '') {
  if (!searchParams || typeof searchParams.get !== 'function') return normalizeDocumentStartLegalScenario({}, packetType)
  return normalizeDocumentStartLegalScenario({
    sellerEntityType: searchParams.get('sellerEntityType'),
    sellerMaritalRegime: searchParams.get('sellerMaritalRegime'),
    buyerEntityType: searchParams.get('buyerEntityType'),
    buyerMaritalRegime: searchParams.get('buyerMaritalRegime'),
    propertyTitleType: searchParams.get('propertyTitleType'),
    financeType: searchParams.get('financeType'),
  }, packetType)
}
