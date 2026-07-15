function normalizeText(value = '') {
  return String(value ?? '').trim()
}

function normalizeKey(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
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

export const DOCUMENT_START_INSTRUMENT_FAMILIES = Object.freeze(
  LEGAL_INSTRUMENT_FAMILY_DEFINITIONS
    .filter((definition) => definition.packetTypes.includes('otp'))
    .map((definition) => ({ value: definition.key, label: definition.label })),
)

function normalizePartyType(value = '') {
  const key = normalizeKey(value)
  if (['single', 'married'].includes(key)) return 'individual'
  if (['pty', 'organisation', 'organization'].includes(key)) return 'company'
  if (key === 'trustee') return 'trust'
  return normalizeLegalPartyEntityType(value)
}

function normalizeMaritalRegime(value = '') {
  const key = normalizeKey(value)
  if (['anc_with_accrual', 'anc_without_accrual'].includes(key)) return 'out_of_community'
  if (['icop', 'married_coc'].includes(key)) return 'in_community'
  return normalizeLegalMaritalRegime(value)
}

function normalizePropertyTitleType(value = '') {
  const normalized = normalizeLegalPropertyTitleType(value)
  if (normalized === 'share_block') return 'sectional_title'
  if (normalized === 'agricultural_holding') return 'full_title'
  return normalized
}

function normalizeFinanceType(value = '') {
  return normalizeLegalFinanceType(value)
}

function isIndividual(value = '') {
  return normalizePartyType(value) === 'individual'
}

function getPartyProfile(entityType = '', maritalRegime = '') {
  const normalizedEntityType = normalizePartyType(entityType)
  if (normalizedEntityType === 'individual' && normalizeMaritalRegime(maritalRegime) === 'in_community') {
    return 'individual_spouse_consent'
  }
  return normalizedEntityType
}

function getOptionLabel(options = [], value = '') {
  return options.find((option) => option.value === value)?.label || ''
}

export function normalizeDocumentStartLegalScenario(input = {}, packetType = '') {
  const normalizedPacketType = normalizeKey(packetType || input.packetType)
  const instrumentFamilyProfile = normalizedPacketType === 'otp'
    ? resolveLegalInstrumentFamilyProfile({
        packetType: 'otp',
        legalInstrumentFamily: input.legalInstrumentFamily || input.legal_instrument_family || LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE,
      })
    : null
  const sellerEntityType = normalizePartyType(input.sellerEntityType || input.seller_entity_type || input.sellerType || input.seller_type)
  const buyerEntityType = normalizedPacketType === 'otp'
    ? normalizePartyType(input.buyerEntityType || input.buyer_entity_type || input.buyerType || input.buyer_type || input.purchaserType || input.purchaser_type)
    : ''
  const sellerMaritalRegime = sellerEntityType === 'individual'
    ? normalizeMaritalRegime(input.sellerMaritalRegime || input.seller_marital_regime || input.sellerMaritalStatus || input.seller_marital_status)
    : ''
  const buyerMaritalRegime = buyerEntityType === 'individual'
    ? normalizeMaritalRegime(input.buyerMaritalRegime || input.buyer_marital_regime || input.buyerMaritalStatus || input.buyer_marital_status)
    : ''
  const propertyTitleType = normalizePropertyTitleType(
    input.propertyTitleType ||
      input.property_title_type ||
      input.propertyStructureType ||
      input.property_structure_type ||
      input.propertyType ||
      input.property_type,
  )
  const financeType = normalizedPacketType === 'otp'
    ? normalizeFinanceType(input.financeType || input.finance_type)
    : ''

  const missingFields = []
  if (!sellerEntityType) missingFields.push('seller_entity_type')
  if (isIndividual(sellerEntityType) && !sellerMaritalRegime) missingFields.push('seller_marital_regime')
  if (normalizedPacketType === 'otp' && !buyerEntityType) missingFields.push('buyer_entity_type')
  if (normalizedPacketType === 'otp' && isIndividual(buyerEntityType) && !buyerMaritalRegime) missingFields.push('buyer_marital_regime')
  if (!propertyTitleType) missingFields.push('property_title_type')
  if (normalizedPacketType === 'otp' && !financeType) missingFields.push('finance_type')

  const sellerProfile = getPartyProfile(sellerEntityType, sellerMaritalRegime)
  const buyerProfile = getPartyProfile(buyerEntityType, buyerMaritalRegime)
  const mandateTemplateVariant = normalizedPacketType === 'mandate' && sellerProfile && propertyTitleType
    ? `${sellerProfile}_${propertyTitleType}`
    : ''
  const summaryParts = [
    normalizedPacketType === 'otp'
      ? getOptionLabel(DOCUMENT_START_INSTRUMENT_FAMILIES, instrumentFamilyProfile?.familyKey)
      : '',
    sellerProfile ? `${getOptionLabel(DOCUMENT_START_PARTY_TYPES, sellerEntityType)} seller${sellerProfile === 'individual_spouse_consent' ? ' (married in community)' : ''}` : '',
    normalizedPacketType === 'otp' && buyerProfile
      ? `${getOptionLabel(DOCUMENT_START_PARTY_TYPES, buyerEntityType)} buyer${buyerProfile === 'individual_spouse_consent' ? ' (married in community)' : ''}`
      : '',
    getOptionLabel(DOCUMENT_START_PROPERTY_TITLE_TYPES, propertyTitleType),
    normalizedPacketType === 'otp' ? getOptionLabel(DOCUMENT_START_FINANCE_TYPES, financeType) : '',
  ].filter(Boolean)

  return {
    packetType: normalizedPacketType,
    legalInstrumentFamily: instrumentFamilyProfile?.familyKey || '',
    legalInstrumentFamilyGenerationAllowed: instrumentFamilyProfile?.generationAllowed ?? true,
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
    missingFields,
    complete: missingFields.length === 0,
    summaryLabel: summaryParts.join(' + '),
  }
}

export function getDocumentStartLegalScenarioInclusions(input = {}, packetType = '') {
  const scenario = normalizeDocumentStartLegalScenario(input, packetType)
  const inclusions = []
  const profiles = [scenario.sellerProfile, scenario.buyerProfile].filter(Boolean)
  if (scenario.legalInstrumentFamily && scenario.legalInstrumentFamily !== LEGAL_INSTRUMENT_FAMILIES.RESIDENTIAL_RESALE) {
    inclusions.push('Attorney-approved specialist agreement required')
  }
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
    legalInstrumentFamily: scenario.legalInstrumentFamily,
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
    legalInstrumentFamily: searchParams.get('legalInstrumentFamily'),
    sellerEntityType: searchParams.get('sellerEntityType'),
    sellerMaritalRegime: searchParams.get('sellerMaritalRegime'),
    buyerEntityType: searchParams.get('buyerEntityType'),
    buyerMaritalRegime: searchParams.get('buyerMaritalRegime'),
    propertyTitleType: searchParams.get('propertyTitleType'),
    financeType: searchParams.get('financeType'),
  }, packetType)
}
import {
  normalizeLegalFinanceType,
  normalizeLegalMaritalRegime,
  normalizeLegalPartyEntityType,
  normalizeLegalPropertyTitleType,
} from './legalDocumentScenarioProfile.js'
import {
  LEGAL_INSTRUMENT_FAMILIES,
  LEGAL_INSTRUMENT_FAMILY_DEFINITIONS,
  resolveLegalInstrumentFamilyProfile,
} from './legalInstrumentFamilyRouter.js'
