import {
  classifySellerParty,
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
      const payload = asRecord(source)
      const value = readPath(payload, path)
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

export function normalizeMandatePropertyTitleType(value = '') {
  const normalized = normalizeKey(value)
  if (!normalized) return ''
  if (['sectional', 'sectional_title', 'apartment', 'flat', 'unit', 'duet', 'scheme'].includes(normalized)) return 'sectional_title'
  if (normalized.includes('sectional') || normalized.includes('apartment') || normalized.includes('flat')) return 'sectional_title'
  if (normalized === 'share_block' || normalized.includes('share_block')) return 'share_block'
  if (['full_title', 'freehold', 'free_hold', 'house', 'estate_hoa', 'estate', 'cluster'].includes(normalized)) return 'full_title'
  if (normalized.includes('freehold') || normalized.includes('full_title')) return 'full_title'
  if (['agricultural', 'agricultural_holding', 'farm', 'smallholding', 'vacant_land', 'land'].includes(normalized)) return 'agricultural_holding'
  return normalized
}

function resolvePropertyTitleType(options = {}) {
  const placeholders = asRecord(options.placeholders)
  const property = asRecord(options.property)
  const sourceContext = asRecord(options.sourceContext || options.context)
  const facts = asRecord(options.facts || sourceContext.canonicalFacts || sourceContext.canonical_facts)
  const flow = asRecord(options.flow || sourceContext.flow)
  const sources = [placeholders, property, flow, facts, sourceContext, options]
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
  const normalizedExplicit = normalizeMandatePropertyTitleType(explicit)
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
  return sectionalDetail ? 'sectional_title' : 'unknown'
}

function resolveSellerClauseProfile(sellerClassification = {}) {
  if (sellerClassification.isTrust) return 'trust'
  if (sellerClassification.isCompany) return 'company'
  return sellerClassification.isMarriedInCommunity ? 'individual_spouse_consent' : 'individual'
}

function resolvePropertyClauseProfile(propertyTitleType = '') {
  if (['sectional_title', 'share_block'].includes(propertyTitleType)) return 'sectional_title'
  if (['full_title', 'agricultural_holding'].includes(propertyTitleType)) return 'full_title'
  return 'property_unknown'
}

function resolveActiveClausePacks({ sellerClauseProfile = '', propertyClauseProfile = '' } = {}) {
  return [
    sellerClauseProfile === 'company' ? 'seller_company_authority_pack' : '',
    sellerClauseProfile === 'trust' ? 'seller_trust_authority_pack' : '',
    sellerClauseProfile === 'individual' || sellerClauseProfile === 'individual_spouse_consent' ? 'seller_individual_capacity_pack' : '',
    sellerClauseProfile === 'individual_spouse_consent' ? 'seller_spouse_consent_pack' : '',
    propertyClauseProfile === 'full_title' ? 'property_full_title_pack' : '',
    propertyClauseProfile === 'sectional_title' ? 'property_sectional_title_pack' : '',
  ].filter(Boolean)
}

export function resolveMandateScenarioProfile(options = {}) {
  const placeholders = asRecord(options.placeholders)
  const seller = asRecord(options.seller)
  const sourceContext = asRecord(options.sourceContext || options.context)
  const sellerClassification = classifySellerParty({
    ...options,
    seller,
    placeholders,
    context: {
      ...sourceContext,
      seller,
    },
  })
  const sellerEntityType = normalizeDocumentPartyEntityType(
    sellerClassification.entityType || seller.entityType || placeholders.seller_entity_type || placeholders['seller.entity_type_raw'] || 'individual',
  )
  const propertyTitleType = resolvePropertyTitleType(options)
  const sellerClauseProfile = resolveSellerClauseProfile({
    ...sellerClassification,
    entityType: sellerEntityType,
    isCompany: sellerEntityType === 'company' || sellerEntityType === 'close_corporation',
    isTrust: sellerEntityType === 'trust',
  })
  const propertyClauseProfile = resolvePropertyClauseProfile(propertyTitleType)
  const templateVariant = `${sellerClauseProfile}_${propertyClauseProfile}`
  const activeClausePacks = resolveActiveClausePacks({ sellerClauseProfile, propertyClauseProfile })

  return {
    sellerEntityType,
    sellerClauseProfile,
    sellerSpouseConsentRequired: Boolean(sellerClassification.isMarriedInCommunity),
    propertyTitleType,
    propertyClauseProfile,
    clauseProfile: templateVariant,
    templateVariant,
    activeClausePacks,
  }
}

export function buildMandateScenarioPlaceholders(profile = {}) {
  const activeClausePacks = Array.isArray(profile.activeClausePacks) ? profile.activeClausePacks : []
  return {
    mandate_template_variant: normalizeText(profile.templateVariant),
    mandate_clause_profile: normalizeText(profile.clauseProfile || profile.templateVariant),
    seller_clause_profile: normalizeText(profile.sellerClauseProfile),
    property_clause_profile: normalizeText(profile.propertyClauseProfile),
    property_title_type: normalizeText(profile.propertyTitleType),
    'property.title_type_raw': normalizeText(profile.propertyTitleType),
    mandate_active_clause_packs: activeClausePacks.join(', '),
  }
}

export function withMandateScenarioPlaceholders(placeholders = {}, options = {}) {
  const payload = asRecord(placeholders)
  const profile = resolveMandateScenarioProfile({
    ...options,
    placeholders: payload,
  })
  return {
    ...payload,
    ...buildMandateScenarioPlaceholders(profile),
  }
}

export function isSectionalMandateProperty(input = {}) {
  const profile = input?.propertyTitleType
    ? { propertyTitleType: normalizeMandatePropertyTitleType(input.propertyTitleType) }
    : resolveMandateScenarioProfile(input)
  return ['sectional_title', 'share_block'].includes(profile.propertyTitleType)
}

export function isFullTitleMandateProperty(input = {}) {
  const profile = input?.propertyTitleType
    ? { propertyTitleType: normalizeMandatePropertyTitleType(input.propertyTitleType) }
    : resolveMandateScenarioProfile(input)
  return ['full_title', 'agricultural_holding'].includes(profile.propertyTitleType)
}
