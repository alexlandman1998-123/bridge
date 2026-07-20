import { resolveCanonicalLegalDocumentScenario } from './legalDocumentScenarioProfile.js'

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
