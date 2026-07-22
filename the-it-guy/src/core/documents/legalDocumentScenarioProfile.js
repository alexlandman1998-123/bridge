import {
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
  if (normalized === 'share_block' || normalized.includes('share_block')) return 'sectional_title'
  if (['full_title', 'freehold', 'free_hold', 'house', 'estate_hoa', 'estate', 'cluster'].includes(normalized)) return 'full_title'
  if (normalized.includes('freehold') || normalized.includes('full_title')) return 'full_title'
  if (['agricultural', 'agricultural_holding', 'farm', 'smallholding', 'vacant_land', 'land'].includes(normalized)) return 'full_title'
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

function buildCandidateSources(options = {}) {
  const sourceContext = asRecord(options.sourceContext || options.context)
  return {
    placeholders: asRecord(options.placeholders),
    seller: asRecord(options.seller),
    buyer: asRecord(options.buyer || options.purchaser),
    property: asRecord(options.property),
    transaction: asRecord(options.transaction),
    flow: asRecord(options.flow || sourceContext.flow),
    facts: asRecord(options.facts || sourceContext.canonicalFacts || sourceContext.canonical_facts),
    source_context: sourceContext,
    input: asRecord(options),
  }
}

function collectFactCandidates(sourceDefinitions = [], normalize = (value) => value) {
  const candidates = []
  const invalid = []

  for (const definition of sourceDefinitions) {
    const source = asRecord(definition.source)
    for (const path of definition.paths || []) {
      const rawValue = readPath(source, path)
      if (rawValue === null || rawValue === undefined || normalizeText(rawValue) === '') continue
      const value = normalize(rawValue)
      const candidate = {
        source: definition.key,
        path,
        rawValue,
        value: normalizeText(value),
      }
      if (candidate.value) candidates.push(candidate)
      else invalid.push(candidate)
    }
  }

  const selected = candidates[0] || null
  const values = new Map()
  for (const candidate of candidates) {
    const entries = values.get(candidate.value) || []
    entries.push(candidate)
    values.set(candidate.value, entries)
  }

  return {
    value: selected?.value || '',
    selected,
    candidates,
    invalid,
    conflict: values.size > 1
      ? {
          selectedValue: selected?.value || '',
          selectedSource: selected?.source || null,
          values: Array.from(values.entries()).map(([value, entries]) => ({
            value,
            sources: entries.map(({ source, path }) => ({ source, path })),
          })),
        }
      : null,
  }
}

function resolveCanonicalFact(field, sourceDefinitions, normalize) {
  const result = collectFactCandidates(sourceDefinitions, normalize)
  return {
    field,
    ...result,
    provenance: {
      value: result.value,
      source: result.selected?.source || null,
      path: result.selected?.path || null,
      rawValue: result.selected?.rawValue ?? null,
      candidates: result.candidates.map(({ source, path, rawValue, value }) => ({ source, path, rawValue, value })),
      rejectedCandidates: result.invalid.map(({ source, path, rawValue }) => ({ source, path, rawValue })),
    },
  }
}

function sourceDefinition(key, source, paths) {
  return { key, source, paths }
}

function partyFactSources(sources, role = 'seller', field = 'entity') {
  const isBuyer = role === 'buyer'
  const roleSource = isBuyer ? sources.buyer : sources.seller
  const rolePrefix = isBuyer ? 'buyer' : 'seller'
  const partyAlias = isBuyer ? 'purchaser' : 'seller'
  const directPaths = field === 'entity'
    ? ['entityType', 'entity_type', 'sellerType', 'seller_type', 'buyerType', 'buyer_type', 'purchaserType', 'purchaser_type', 'ownershipType', 'ownership_type', 'ownershipStructure', 'ownership_structure']
    : ['maritalRegime', 'marital_regime', 'maritalStatus', 'marital_status', 'marriageRegime', 'marriage_regime']
  const scopedPaths = field === 'entity'
    ? [
        `${rolePrefix}_entity_type`, `${rolePrefix}.entity_type_raw`, `${rolePrefix}.entity_type`, `${rolePrefix}EntityType`,
        `${rolePrefix}_type`, `${rolePrefix}Type`, `${partyAlias}_entity_type`, `${partyAlias}.entity_type`, `${partyAlias}Type`,
      ]
    : [
        `${rolePrefix}_marital_regime`, `${rolePrefix}_marital_status`, `${rolePrefix}.marital_regime`, `${rolePrefix}.marital_status`,
        `${rolePrefix}MaritalRegime`, `${rolePrefix}MaritalStatus`, `${partyAlias}_marital_regime`, `${partyAlias}_marital_status`,
      ]
  return [
    sourceDefinition('placeholders', sources.placeholders, scopedPaths),
    sourceDefinition(rolePrefix, roleSource, directPaths),
    sourceDefinition('transaction', sources.transaction, scopedPaths),
    sourceDefinition('flow', sources.flow, scopedPaths),
    sourceDefinition('canonical_facts', sources.facts, scopedPaths),
    sourceDefinition('source_context', sources.source_context, scopedPaths),
    sourceDefinition('input', sources.input, scopedPaths),
  ]
}

function propertyFactSources(sources) {
  const scopedPaths = [
    'property_title_type', 'property.title_type_raw', 'property.title_type', 'propertyTitleType',
    'property_structure_type', 'property.structure_type', 'propertyStructureType',
    'property_type', 'property.property_type', 'propertyType',
  ]
  return [
    sourceDefinition('placeholders', sources.placeholders, scopedPaths),
    sourceDefinition('property', sources.property, ['titleType', 'title_type', 'propertyTitleType', 'property_title_type', 'structureType', 'structure_type', 'propertyType', 'property_type']),
    sourceDefinition('transaction', sources.transaction, scopedPaths),
    sourceDefinition('flow', sources.flow, scopedPaths),
    sourceDefinition('canonical_facts', sources.facts, scopedPaths),
    sourceDefinition('source_context', sources.source_context, scopedPaths),
    sourceDefinition('input', sources.input, scopedPaths),
  ]
}

function financeFactSources(sources) {
  const paths = ['finance_type', 'transaction.finance_type_raw', 'transaction.finance_type', 'financeType', 'offer.finance_type', 'offer.financeType']
  return [
    sourceDefinition('placeholders', sources.placeholders, paths),
    sourceDefinition('transaction', sources.transaction, ['financeType', 'finance_type']),
    sourceDefinition('flow', sources.flow, paths),
    sourceDefinition('canonical_facts', sources.facts, paths),
    sourceDefinition('source_context', sources.source_context, paths),
    sourceDefinition('input', sources.input, paths),
  ]
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

export function resolveCanonicalLegalDocumentScenario(options = {}) {
  const packetType = normalizeKey(options.packetType || options.packet_type || 'mandate') === 'otp' ? 'otp' : 'mandate'
  const sources = buildCandidateSources(options)
  const resolvedFacts = {
    seller_entity_type: resolveCanonicalFact('seller_entity_type', partyFactSources(sources, 'seller', 'entity'), normalizeLegalPartyEntityType),
    seller_marital_regime: resolveCanonicalFact('seller_marital_regime', partyFactSources(sources, 'seller', 'marital'), normalizeLegalMaritalRegime),
    property_title_type: resolveCanonicalFact('property_title_type', propertyFactSources(sources), normalizeLegalPropertyTitleType),
    ...(packetType === 'otp'
      ? {
          buyer_entity_type: resolveCanonicalFact('buyer_entity_type', partyFactSources(sources, 'buyer', 'entity'), normalizeLegalPartyEntityType),
          buyer_marital_regime: resolveCanonicalFact('buyer_marital_regime', partyFactSources(sources, 'buyer', 'marital'), normalizeLegalMaritalRegime),
          finance_type: resolveCanonicalFact('finance_type', financeFactSources(sources), normalizeLegalFinanceType),
        }
      : {}),
  }
  const sellerEntitySignal = resolvedFacts.seller_entity_type.value
  const sellerMaritalSignal = sellerEntitySignal === 'individual' ? resolvedFacts.seller_marital_regime.value : ''
  const buyerEntitySignal = packetType === 'otp' ? resolvedFacts.buyer_entity_type.value : ''
  const buyerMaritalSignal = buyerEntitySignal === 'individual' ? resolvedFacts.buyer_marital_regime.value : ''
  const propertyTitleType = resolvedFacts.property_title_type.value
  const financeType = packetType === 'otp' ? resolvedFacts.finance_type.value : ''
  const sellerClassification = {
    isCompany: ['company', 'close_corporation'].includes(sellerEntitySignal),
    isTrust: sellerEntitySignal === 'trust',
    isIndividual: sellerEntitySignal === 'individual',
    isMarriedInCommunity: sellerEntitySignal === 'individual' && sellerMaritalSignal === 'in_community',
    maritalRegime: sellerMaritalSignal,
  }
  const buyerClassification = packetType === 'otp'
    ? {
        isCompany: ['company', 'close_corporation'].includes(buyerEntitySignal),
        isTrust: buyerEntitySignal === 'trust',
        isIndividual: buyerEntitySignal === 'individual',
        isMarriedInCommunity: buyerEntitySignal === 'individual' && buyerMaritalSignal === 'in_community',
        maritalRegime: buyerMaritalSignal,
      }
    : null
  const sellerClauseProfile = resolvePartyClauseProfile(sellerClassification, Boolean(sellerEntitySignal))
  const buyerClauseProfile = packetType === 'otp' ? resolvePartyClauseProfile(buyerClassification, Boolean(buyerEntitySignal)) : ''
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
  const relevantFields = new Set([
    'seller_entity_type',
    ...(sellerEntitySignal === 'individual' ? ['seller_marital_regime'] : []),
    'property_title_type',
    ...(packetType === 'otp' ? ['buyer_entity_type', 'finance_type'] : []),
    ...(packetType === 'otp' && buyerEntitySignal === 'individual' ? ['buyer_marital_regime'] : []),
  ])
  const conflictingFacts = Object.values(resolvedFacts)
    .filter((fact) => relevantFields.has(fact.field) && fact.conflict)
    .map((fact) => ({ field: fact.field, ...fact.conflict }))
  const invalidFacts = Object.values(resolvedFacts)
    .filter((fact) => relevantFields.has(fact.field) && fact.invalid.length)
    .map((fact) => ({
      field: fact.field,
      candidates: fact.invalid.map(({ source, path, rawValue }) => ({ source, path, rawValue })),
    }))
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
    packetType === 'otp' && financeClauseProfile === 'combination' ? 'cash_contribution_pack' : '',
  ])

  return {
    resolverVersion: 'canonical_legal_document_scenario_v1',
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
    activePackKeys: activeClausePacks,
    facts: {
      sellerEntityType: sellerEntitySignal,
      sellerMaritalRegime: sellerMaritalSignal,
      buyerEntityType: buyerEntitySignal,
      buyerMaritalRegime: buyerMaritalSignal,
      propertyTitleType,
      financeType,
    },
    sourceProvenance: Object.fromEntries(Object.entries(resolvedFacts).map(([field, fact]) => [field, fact.provenance])),
    conflictingFacts,
    invalidFacts,
    missingFacts: missingRoutingFacts,
    missingRoutingFacts,
    complete: missingRoutingFacts.length === 0 && conflictingFacts.length === 0 && invalidFacts.length === 0,
  }
}

export function resolveLegalDocumentScenarioProfile(options = {}) {
  return resolveCanonicalLegalDocumentScenario(options)
}

export function buildLegalDocumentScenarioPlaceholders(profile = {}) {
  const activeClausePacks = Array.isArray(profile.activeClausePacks) ? profile.activeClausePacks : []
  return {
    legal_document_scenario: normalizeText(profile.scenarioKey),
    seller_entity_type: normalizeText(profile.sellerEntityType),
    'seller.entity_type_raw': normalizeText(profile.sellerEntityType),
    seller_marital_regime: normalizeText(profile.sellerMaritalRegime),
    seller_marital_status: normalizeText(profile.sellerMaritalRegime),
    seller_spouse_consent_required: profile.sellerEntityType === 'individual'
      ? profile.sellerSpouseConsentRequired ? 'Yes' : 'No'
      : '',
    buyer_entity_type: normalizeText(profile.buyerEntityType),
    'buyer.entity_type_raw': normalizeText(profile.buyerEntityType),
    buyer_marital_regime: normalizeText(profile.buyerMaritalRegime),
    buyer_marital_status: normalizeText(profile.buyerMaritalRegime),
    buyer_spouse_consent_required: profile.buyerEntityType === 'individual'
      ? profile.buyerSpouseConsentRequired ? 'Yes' : 'No'
      : '',
    finance_type: normalizeText(profile.financeType),
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
