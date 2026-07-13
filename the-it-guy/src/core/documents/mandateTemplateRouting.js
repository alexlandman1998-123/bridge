import {
  resolveMandateScenarioProfile,
} from './mandateScenarioProfile.js'

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

function templateMetadata(template = {}) {
  return template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
}

function splitMetadataValues(value) {
  if (Array.isArray(value)) return value.flatMap((item) => splitMetadataValues(item))
  if (value && typeof value === 'object') return Object.values(value).flatMap((item) => splitMetadataValues(item))
  return normalizeText(value)
    .split(',')
    .map((item) => normalizeKey(item))
    .filter(Boolean)
}

function metadataValues(template = {}, keys = []) {
  const metadata = templateMetadata(template)
  const values = []
  for (const key of keys) {
    if (template?.[key] !== undefined) values.push(...splitMetadataValues(template[key]))
    if (metadata?.[key] !== undefined) values.push(...splitMetadataValues(metadata[key]))
  }
  return Array.from(new Set(values))
}

function includesAny(values = [], targets = []) {
  const valueSet = new Set(values.map((item) => normalizeKey(item)).filter(Boolean))
  return targets.some((target) => valueSet.has(normalizeKey(target)))
}

function isWildcard(values = []) {
  return includesAny(values, ['all', 'any', 'default', 'standard', 'fallback'])
}

function textContainsVariant(template = {}, variant = '') {
  const normalizedVariant = normalizeKey(variant)
  if (!normalizedVariant) return false
  const text = normalizeKey([
    template?.template_key,
    template?.templateKey,
    template?.key,
    template?.template_label,
    template?.templateLabel,
    template?.label,
  ].filter(Boolean).join(' '))
  return Boolean(text && text.includes(normalizedVariant))
}

export function normalizeMandateTemplateVariant(value = '') {
  return normalizeKey(value)
}

export function resolveMandateTemplateRoutingProfile(options = {}) {
  const profile = options.scenarioProfile && typeof options.scenarioProfile === 'object'
    ? options.scenarioProfile
    : resolveMandateScenarioProfile(options)
  return {
    ...profile,
    templateVariant: normalizeMandateTemplateVariant(profile.templateVariant || profile.clauseProfile),
    clauseProfile: normalizeMandateTemplateVariant(profile.clauseProfile || profile.templateVariant),
    sellerClauseProfile: normalizeMandateTemplateVariant(profile.sellerClauseProfile),
    propertyClauseProfile: normalizeMandateTemplateVariant(profile.propertyClauseProfile),
    propertyTitleType: normalizeMandateTemplateVariant(profile.propertyTitleType),
  }
}

export function resolveMandateTemplateRoutingMetadata(template = {}) {
  const variants = metadataValues(template, [
    'mandate_template_variant',
    'mandateTemplateVariant',
    'mandate_template_variants',
    'mandateTemplateVariants',
    'supported_mandate_template_variants',
    'supportedMandateTemplateVariants',
    'template_variant',
    'templateVariant',
  ])
  const clauseProfiles = metadataValues(template, [
    'mandate_clause_profile',
    'mandateClauseProfile',
    'mandate_clause_profiles',
    'mandateClauseProfiles',
  ])
  const sellerProfiles = metadataValues(template, [
    'seller_clause_profile',
    'sellerClauseProfile',
    'seller_clause_profiles',
    'sellerClauseProfiles',
    'mandate_seller_clause_profile',
    'mandateSellerClauseProfile',
  ])
  const propertyProfiles = metadataValues(template, [
    'property_clause_profile',
    'propertyClauseProfile',
    'property_clause_profiles',
    'propertyClauseProfiles',
    'mandate_property_clause_profile',
    'mandatePropertyClauseProfile',
  ])

  return {
    variants,
    clauseProfiles,
    sellerProfiles,
    propertyProfiles,
    hasRoutingMetadata: Boolean(
      variants.length ||
      clauseProfiles.length ||
      sellerProfiles.length ||
      propertyProfiles.length
    ),
  }
}

export function scoreMandateTemplateCandidate(template = {}, options = {}) {
  const profile = resolveMandateTemplateRoutingProfile(options)
  const metadata = resolveMandateTemplateRoutingMetadata(template)
  const targetVariant = profile.templateVariant
  const targetClause = profile.clauseProfile || targetVariant
  const targetSeller = profile.sellerClauseProfile
  const targetProperty = profile.propertyClauseProfile
  const reasons = []
  let score = 5

  const variantValues = metadata.variants
  const clauseValues = metadata.clauseProfiles
  const sellerValues = metadata.sellerProfiles
  const propertyValues = metadata.propertyProfiles

  if (variantValues.length && !isWildcard(variantValues) && !includesAny(variantValues, [targetVariant, targetClause])) {
    return { template, profile, metadata, compatible: false, score: Number.NEGATIVE_INFINITY, reasons: ['variant_mismatch'] }
  }
  if (clauseValues.length && !isWildcard(clauseValues) && !includesAny(clauseValues, [targetClause, targetVariant])) {
    return { template, profile, metadata, compatible: false, score: Number.NEGATIVE_INFINITY, reasons: ['clause_profile_mismatch'] }
  }
  if (sellerValues.length && !isWildcard(sellerValues) && !includesAny(sellerValues, [targetSeller])) {
    return { template, profile, metadata, compatible: false, score: Number.NEGATIVE_INFINITY, reasons: ['seller_profile_mismatch'] }
  }
  if (propertyValues.length && !isWildcard(propertyValues) && !includesAny(propertyValues, [targetProperty])) {
    return { template, profile, metadata, compatible: false, score: Number.NEGATIVE_INFINITY, reasons: ['property_profile_mismatch'] }
  }

  if (includesAny(variantValues, [targetVariant])) {
    score += 1000
    reasons.push('exact_variant_metadata')
  }
  if (includesAny(clauseValues, [targetClause, targetVariant])) {
    score += 900
    reasons.push('clause_profile_metadata')
  }
  if (sellerValues.length && includesAny(sellerValues, [targetSeller])) {
    score += 300
    reasons.push('seller_profile_metadata')
  }
  if (propertyValues.length && includesAny(propertyValues, [targetProperty])) {
    score += 300
    reasons.push('property_profile_metadata')
  }
  if (textContainsVariant(template, targetVariant)) {
    score += metadata.hasRoutingMetadata ? 150 : 500
    reasons.push('template_name_variant_match')
  }
  if (isWildcard(variantValues) || isWildcard(clauseValues) || isWildcard(sellerValues) || isWildcard(propertyValues)) {
    reasons.push('wildcard_route')
  }
  if (!metadata.hasRoutingMetadata) reasons.push('generic_fallback')

  return {
    template,
    profile,
    metadata,
    compatible: true,
    score,
    reasons,
  }
}

export function selectMandateTemplateCandidate(templates = [], options = {}) {
  const rows = (Array.isArray(templates) ? templates : [])
    .map((template) => scoreMandateTemplateCandidate(template, options))
    .filter((row) => row.compatible)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (Boolean(right.template?.is_default) !== Boolean(left.template?.is_default)) {
        return right.template?.is_default ? 1 : -1
      }
      return normalizeText(right.template?.updated_at).localeCompare(normalizeText(left.template?.updated_at))
    })

  return rows[0] || null
}

export function buildMandateTemplateRoutingAudit(selection = null, fallback = {}) {
  const selected = selection || {}
  const profile = asRecord(selected.profile || fallback.profile)
  return {
    selectedTemplateId: normalizeText(selected.template?.id || fallback.template?.id) || null,
    selectedTemplateKey: normalizeText(selected.template?.template_key || selected.template?.key || fallback.template?.template_key || fallback.template?.key) || null,
    selectedTemplateLabel: normalizeText(selected.template?.template_label || selected.template?.label || fallback.template?.template_label || fallback.template?.label) || null,
    mandateTemplateVariant: normalizeText(profile.templateVariant || fallback.mandateTemplateVariant) || null,
    sellerClauseProfile: normalizeText(profile.sellerClauseProfile || fallback.sellerClauseProfile) || null,
    propertyClauseProfile: normalizeText(profile.propertyClauseProfile || fallback.propertyClauseProfile) || null,
    propertyTitleType: normalizeText(profile.propertyTitleType || fallback.propertyTitleType) || null,
    matchScore: Number.isFinite(Number(selected.score)) ? Number(selected.score) : null,
    matchReasons: Array.isArray(selected.reasons) ? selected.reasons : [],
  }
}
