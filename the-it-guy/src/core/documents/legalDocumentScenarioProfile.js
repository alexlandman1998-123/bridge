import {
  classifyBuyerParty,
  classifySellerParty,
  normalizeDocumentMaritalRegime,
  normalizeDocumentPartyEntityType,
} from './documentPartyClassification.js'

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

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
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
      const value = readPath(asRecord(source), path)
      if (value !== null && value !== undefined && normalizeText(value) !== '') return value
    }
  }
  return ''
}

function normalizeBooleanSignal(value) {
  if (typeof value === 'boolean') return value
  const normalized = normalizeKey(value)
  if (!normalized) return null
  if (['true', 'yes', 'y', '1', 'required', 'consent_required'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'not_required', 'not_applicable', 'not_provided', 'n_a', 'na'].includes(normalized)) return false
  return null
}

export function normalizeLegalPartyEntityType(value = '') {
  if (!normalizeText(value)) return ''
  const normalized = normalizeDocumentPartyEntityType(value)
  return ['individual', 'company', 'trust', 'close_corporation'].includes(normalized) ? normalized : ''
}

export function normalizeLegalMaritalRegime(value = '') {
  if (!normalizeText(value)) return ''
  const normalized = normalizeDocumentMaritalRegime(value)
  return ['single', 'out_of_community', 'in_community'].includes(normalized) ? normalized : ''
}

export function normalizeLegalPropertyTitleType(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return ''
  if (['sectional', 'sectional_title', 'apartment', 'flat', 'unit', 'duet', 'scheme'].includes(normalized)) return 'sectional_title'
  if (normalized.includes('sectional') || normalized.includes('apartment') || normalized.includes('flat')) return 'sectional_title'
  if (normalized === 'share_block' || normalized.includes('share_block')) return 'share_block'
  if (['full_title', 'freehold', 'free_hold', 'house', 'estate_hoa', 'estate', 'cluster'].includes(normalized)) return 'full_title'
  if (normalized.includes('freehold') || normalized.includes('full_title')) return 'full_title'
  if (['agricultural', 'agricultural_holding', 'farm', 'smallholding', 'vacant_land', 'land'].includes(normalized)) return 'agricultural_holding'
  return ''
}

export function normalizeLegalFinanceType(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return ''
  if (['cash', 'cash_sale', 'cash_buyer', 'cash_only'].includes(normalized)) return 'cash'
  if (['bond', 'mortgage', 'home_loan', 'loan'].includes(normalized)) return 'bond'
  if (['combination', 'hybrid', 'cash_and_bond', 'bond_and_cash', 'part_cash_part_bond'].includes(normalized)) return 'combination'
  return ''
}

function resolvePartyClauseProfile(classification = {}, hasEntitySignal = false) {
  if (!hasEntitySignal) return 'party_unknown'
  if (classification.isTrust) return 'trust'
  if (classification.isCompany) return 'company'
  if (!classification.isIndividual) return 'party_unknown'
  return classification.isMarriedInCommunity ? 'individual_spouse_consent' : 'individual'
}

function resolvePropertyClauseProfile(propertyTitleType = '') {
  if (['sectional_title', 'share_block'].includes(propertyTitleType)) return 'sectional_title'
  if (['full_title', 'agricultural_holding'].includes(propertyTitleType)) return 'full_title'
  return 'property_unknown'
}

function resolveFinanceClauseProfile(financeType = '') {
  if (['cash', 'bond', 'combination'].includes(financeType)) return financeType
  return 'finance_unknown'
}

function resolvePropertyTitleType(sources = []) {
  const explicit = firstValue(sources, [
    'property_title_type',
    'property.title_type',
    'property.title_type_raw',
    'property_title_type_raw',
    'property_structure_type',
    'property.structure_type',
    'property.property_structure_type',
    'propertyStructureType',
    'property_type',
    'property.property_type',
    'propertyType',
    'property_branch',
    'flow.property_branch',
    'canonicalFacts.property.property_type',
    'canonical_facts.property.property_type',
  ])
  const normalizedExplicit = normalizeLegalPropertyTitleType(explicit)
  if (normalizedExplicit) return normalizedExplicit

  const sectionalSignal = normalizeBooleanSignal(firstValue(sources, [
    'sectional_title',
    'property.sectional_title',
    'propertySectionalTitle',
    'sectionalTitle',
  ]))
  if (sectionalSignal === true) return 'sectional_title'

  const shareBlockSignal = normalizeBooleanSignal(firstValue(sources, [
    'share_block',
    'property.share_block',
    'shareBlock',
  ]))
  if (shareBlockSignal === true) return 'share_block'

  const sectionalDetail = firstValue(sources, [
    'property_unit_number',
    'unit_number',
    'property.unit_number',
    'property_section_number',
    'section_number',
    'property.section_number',
    'sectional_title_number',
    'property.sectional_title_number',
    'property_sectional_title_scheme',
    'property.complex_name',
    'property_complex_name',
  ])
  return sectionalDetail ? 'sectional_title' : ''
}

function buildPartyPacks(role = 'seller', clauseProfile = '') {
  return [
    clauseProfile === 'company' ? `${role}_company_authority_pack` : '',
    clauseProfile === 'trust' ? `${role}_trust_authority_pack` : '',
    clauseProfile === 'individual' || clauseProfile === 'individual_spouse_consent' ? `${role}_individual_capacity_pack` : '',
    clauseProfile === 'individual_spouse_consent' ? `${role}_spouse_consent_pack` : '',
  ].filter(Boolean)
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function getRoutingFacts({
  packetType = '',
  sellerEntitySignal = '',
  sellerClassification = {},
  buyerEntitySignal = '',
  buyerClassification = {},
  propertyTitleType = '',
  financeType = '',
} = {}) {
  const missing = []
  if (!sellerEntitySignal) missing.push('seller_entity_type')
  if (sellerEntitySignal && sellerClassification.isIndividual && !normalizeLegalMaritalRegime(sellerClassification.maritalRegime)) missing.push('seller_marital_regime')
  if (packetType === 'otp' && !buyerEntitySignal) missing.push('buyer_entity_type')
  if (packetType === 'otp' && buyerEntitySignal && buyerClassification.isIndividual && !normalizeLegalMaritalRegime(buyerClassification.maritalRegime)) missing.push('buyer_marital_regime')
  if (!propertyTitleType) missing.push('property_title_type')
  if (packetType === 'otp' && !financeType) missing.push('finance_type')
  return missing
}

export function resolveLegalDocumentScenarioProfile(options = {}) {
  const packetType = normalizeKey(options.packetType || options.packet_type || 'mandate') === 'otp' ? 'otp' : 'mandate'
  const placeholders = asRecord(options.placeholders)
  const seller = asRecord(options.seller)
  const buyer = asRecord(options.buyer || options.purchaser)
  const property = asRecord(options.property)
  const transaction = asRecord(options.transaction)
  const sourceContext = asRecord(options.sourceContext || options.context)
  const facts = asRecord(options.facts || sourceContext.canonicalFacts || sourceContext.canonical_facts)
  const flow = asRecord(options.flow || sourceContext.flow)
  const sources = [placeholders, seller, buyer, property, transaction, flow, facts, sourceContext, options]
  const sellerSources = [placeholders, seller, transaction, flow, facts, sourceContext, options]
  const buyerSources = [placeholders, buyer, transaction, flow, facts, sourceContext, options]

  const sellerEntitySignal = normalizeLegalPartyEntityType(firstValue(sellerSources, [
    'seller_entity_type', 'seller.entity_type_raw', 'seller.entity_type', 'sellerEntityType', 'seller_type', 'sellerType', 'ownershipType', 'entityType', 'entity_type',
  ])) || (options.assumeIndividualSeller ? 'individual' : '')
  const sellerMaritalSignal = normalizeLegalMaritalRegime(firstValue(sellerSources, [
    'seller_marital_regime', 'seller_marital_status', 'seller.marital_regime', 'seller.marital_status', 'sellerMaritalRegime', 'sellerMaritalStatus', 'maritalRegime', 'maritalStatus', 'marital_regime', 'marital_status',
  ]))
  const buyerEntitySignal = normalizeLegalPartyEntityType(firstValue(buyerSources, [
    'buyer_entity_type', 'buyer.entity_type_raw', 'buyer.entity_type', 'buyerEntityType', 'buyer_type', 'buyerType', 'purchaser_type', 'purchaserType', 'entityType', 'entity_type',
  ]))
  const buyerMaritalSignal = normalizeLegalMaritalRegime(firstValue(buyerSources, [
    'buyer_marital_regime', 'buyer_marital_status', 'buyer.marital_regime', 'buyer.marital_status', 'buyerMaritalRegime', 'buyerMaritalStatus', 'purchaser_marital_status', 'maritalRegime', 'maritalStatus', 'marital_regime', 'marital_status',
  ]))
  const propertyTitleType = resolvePropertyTitleType(sources)
  const financeType = packetType === 'otp'
    ? normalizeLegalFinanceType(firstValue(sources, [
        'finance_type', 'financeType', 'transaction.finance_type_raw', 'transaction.finance_type', 'offer.finance_type', 'offer.financeType',
      ]))
    : ''

  const classifierPlaceholders = {
    ...placeholders,
    ...(sellerEntitySignal ? { seller_entity_type: sellerEntitySignal } : {}),
    ...(sellerMaritalSignal ? { seller_marital_status: sellerMaritalSignal } : {}),
    ...(buyerEntitySignal ? { buyer_entity_type: buyerEntitySignal } : {}),
    ...(buyerMaritalSignal ? { buyer_marital_status: buyerMaritalSignal } : {}),
    ...(financeType ? { finance_type: financeType } : {}),
  }
  const classifierContext = { ...sourceContext, seller, buyer, property, transaction, flow, facts }
  const sellerClassification = classifySellerParty({ ...options, placeholders: classifierPlaceholders, context: classifierContext })
  const buyerClassification = packetType === 'otp'
    ? classifyBuyerParty({ ...options, placeholders: classifierPlaceholders, context: classifierContext })
    : null
  const sellerClauseProfile = resolvePartyClauseProfile(sellerClassification, Boolean(sellerEntitySignal))
  const buyerClauseProfile = packetType === 'otp'
    ? resolvePartyClauseProfile(buyerClassification, Boolean(buyerEntitySignal))
    : ''
  const propertyClauseProfile = resolvePropertyClauseProfile(propertyTitleType)
  const financeClauseProfile = packetType === 'otp' ? resolveFinanceClauseProfile(financeType) : ''
  const missingRoutingFacts = getRoutingFacts({
    packetType,
    sellerEntitySignal,
    sellerClassification,
    buyerEntitySignal,
    buyerClassification,
    propertyTitleType,
    financeType,
  })
  const mandateVariant = `${sellerClauseProfile}_${propertyClauseProfile}`
  const scenarioKey = packetType === 'mandate'
    ? mandateVariant
    : `${sellerClauseProfile}_seller__${buyerClauseProfile}_buyer__${propertyClauseProfile}__${financeClauseProfile}`
  const activeClausePacks = unique([
    ...buildPartyPacks('seller', sellerClauseProfile),
    ...(packetType === 'otp' ? buildPartyPacks('buyer', buyerClauseProfile) : []),
    propertyClauseProfile === 'full_title' ? 'property_full_title_pack' : '',
    propertyClauseProfile === 'sectional_title' ? 'property_sectional_title_pack' : '',
    packetType === 'otp' && financeClauseProfile === 'cash' ? 'cash_sale_pack' : '',
    packetType === 'otp' && ['bond', 'combination'].includes(financeClauseProfile) ? 'bond_finance_pack' : '',
  ])

  return {
    packetType,
    scenarioKey,
    clauseProfile: scenarioKey,
    templateVariant: packetType === 'mandate' ? mandateVariant : scenarioKey,
    sellerEntityType: sellerEntitySignal,
    sellerMaritalRegime: sellerMaritalSignal,
    sellerClauseProfile,
    sellerSpouseConsentRequired: Boolean(sellerClassification.isMarriedInCommunity),
    buyerEntityType: buyerEntitySignal,
    buyerMaritalRegime: buyerMaritalSignal,
    buyerClauseProfile,
    buyerSpouseConsentRequired: Boolean(buyerClassification?.isMarriedInCommunity),
    propertyTitleType,
    propertyClauseProfile,
    financeType,
    financeClauseProfile,
    activeClausePacks,
    missingRoutingFacts,
    complete: missingRoutingFacts.length === 0,
  }
}

export function buildLegalDocumentScenarioPlaceholders(profile = {}) {
  const activeClausePacks = Array.isArray(profile.activeClausePacks) ? profile.activeClausePacks : []
  return {
    legal_document_scenario: normalizeText(profile.scenarioKey),
    seller_clause_profile: normalizeText(profile.sellerClauseProfile),
    buyer_clause_profile: normalizeText(profile.buyerClauseProfile),
    property_clause_profile: normalizeText(profile.propertyClauseProfile),
    finance_clause_profile: normalizeText(profile.financeClauseProfile),
    property_title_type: normalizeText(profile.propertyTitleType),
    'property.title_type_raw': normalizeText(profile.propertyTitleType),
    legal_active_clause_packs: activeClausePacks.join(', '),
  }
}

export function withLegalDocumentScenarioPlaceholders(placeholders = {}, options = {}) {
  const payload = asRecord(placeholders)
  const profile = resolveLegalDocumentScenarioProfile({ ...options, placeholders: payload })
  return {
    ...payload,
    ...buildLegalDocumentScenarioPlaceholders(profile),
  }
}
