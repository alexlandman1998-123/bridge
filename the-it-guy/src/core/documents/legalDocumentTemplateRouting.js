import { resolveLegalDocumentScenarioProfile } from './legalDocumentScenarioProfile.js'

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

function uniqueKeys(values = []) {
  return Array.from(new Set(values.flatMap((value) => (
    Array.isArray(value) ? value : normalizeText(value).split(',')
  )).map(normalizeKey).filter(Boolean)))
}

function readMetadataValues(metadata = {}, keys = []) {
  return uniqueKeys(keys.map((key) => metadata?.[key]))
}

function getTemplateMetadata(template = {}) {
  return asRecord(template.metadata_json || template.metadataJson)
}

export function resolveLegalDocumentTemplateRoutingMetadata(template = {}) {
  const metadata = getTemplateMetadata(template)
  const packetType = normalizeKey(template.packet_type || template.packetType || metadata.packet_type || metadata.packetType)
  const scenarios = readMetadataValues(metadata, [
    'legal_document_scenario',
    'legalDocumentScenario',
    'supported_legal_document_scenarios',
    'supportedLegalDocumentScenarios',
    ...(packetType === 'mandate' ? [
      'mandate_template_variant',
      'mandateTemplateVariant',
      'mandate_template_variants',
      'supported_mandate_template_variants',
      'supportedMandateTemplateVariants',
    ] : []),
  ]).filter((value) => value !== 'default')
  const sellerProfiles = readMetadataValues(metadata, [
    'seller_clause_profile',
    'sellerClauseProfile',
    'seller_clause_profiles',
    'sellerClauseProfiles',
  ])
  const buyerProfiles = readMetadataValues(metadata, [
    'buyer_clause_profile',
    'buyerClauseProfile',
    'buyer_clause_profiles',
    'buyerClauseProfiles',
  ])
  const propertyProfiles = readMetadataValues(metadata, [
    'property_clause_profile',
    'propertyClauseProfile',
    'property_clause_profiles',
    'propertyClauseProfiles',
  ])
  const financeProfiles = readMetadataValues(metadata, [
    'finance_clause_profile',
    'financeClauseProfile',
    'finance_clause_profiles',
    'financeClauseProfiles',
  ])

  return {
    packetType,
    scenarios,
    sellerProfiles,
    buyerProfiles,
    propertyProfiles,
    financeProfiles,
    hasRoutingMetadata: Boolean(
      scenarios.length ||
      sellerProfiles.length ||
      buyerProfiles.length ||
      propertyProfiles.length ||
      financeProfiles.length
    ),
  }
}

function profileMatches(values = [], actual = '') {
  return !values.length || values.includes(normalizeKey(actual))
}

export function scoreLegalDocumentTemplateCandidate(template = {}, options = {}) {
  const profile = options.scenarioProfile || resolveLegalDocumentScenarioProfile(options)
  const metadata = resolveLegalDocumentTemplateRoutingMetadata(template)
  const scenarioKey = normalizeKey(profile.scenarioKey)
  const checks = [
    ['scenario', metadata.scenarios, scenarioKey, 500, 'exact_scenario_metadata'],
    ['seller', metadata.sellerProfiles, profile.sellerClauseProfile, 100, 'seller_profile_metadata'],
    ['buyer', metadata.buyerProfiles, profile.buyerClauseProfile, 100, 'buyer_profile_metadata'],
    ['property', metadata.propertyProfiles, profile.propertyClauseProfile, 100, 'property_profile_metadata'],
    ['finance', metadata.financeProfiles, profile.financeClauseProfile, 100, 'finance_profile_metadata'],
  ]
  const reasons = []
  let score = 0

  for (const [dimension, allowed, actual, weight, reason] of checks) {
    if (!allowed.length) continue
    if (!profileMatches(allowed, actual)) {
      return {
        template,
        profile,
        metadata,
        compatible: false,
        score: Number.NEGATIVE_INFINITY,
        reasons: [`${dimension}_mismatch`],
      }
    }
    score += weight
    reasons.push(reason)
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

export function selectLegalDocumentTemplateCandidate(templates = [], options = {}) {
  return (Array.isArray(templates) ? templates : [])
    .map((template) => scoreLegalDocumentTemplateCandidate(template, options))
    .filter((candidate) => candidate.compatible)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      if (Boolean(left.template?.organisation_id) !== Boolean(right.template?.organisation_id)) {
        return left.template?.organisation_id ? -1 : 1
      }
      if (Boolean(left.template?.is_default) !== Boolean(right.template?.is_default)) {
        return left.template?.is_default ? -1 : 1
      }
      const updatedDelta = String(right.template?.updated_at || '').localeCompare(String(left.template?.updated_at || ''))
      if (updatedDelta) return updatedDelta
      return normalizeText(left.template?.id).localeCompare(normalizeText(right.template?.id))
    })[0] || null
}

export function buildLegalDocumentTemplateRoutingAudit(selection = null, options = {}) {
  const profile = selection?.profile || options.profile || resolveLegalDocumentScenarioProfile(options)
  return {
    packetType: profile.packetType,
    legalDocumentScenarioKey: profile.scenarioKey,
    scenarioComplete: Boolean(profile.complete),
    missingRoutingFacts: [...(profile.missingRoutingFacts || [])],
    sellerClauseProfile: profile.sellerClauseProfile,
    buyerClauseProfile: profile.buyerClauseProfile,
    propertyClauseProfile: profile.propertyClauseProfile,
    financeClauseProfile: profile.financeClauseProfile,
    selectedTemplateId: selection?.template?.id || null,
    selectedTemplateKey: selection?.template?.template_key || selection?.template?.templateKey || null,
    selectedTemplateLabel: selection?.template?.template_label || selection?.template?.templateLabel || null,
    matchedSpecificScenario: Boolean(selection?.metadata?.hasRoutingMetadata),
    matchReasons: [...(selection?.reasons || [])],
    score: Number.isFinite(selection?.score) ? selection.score : null,
  }
}

function getTemplateIdentity(template = {}) {
  return {
    id: normalizeText(template.id) || null,
    key: normalizeText(template.template_key || template.templateKey) || null,
    label: normalizeText(template.template_label || template.templateLabel) || 'Untitled template',
  }
}

export function buildLegalDocumentTemplateRouteSignature(template = {}) {
  const metadata = resolveLegalDocumentTemplateRoutingMetadata(template)
  const segment = (values = []) => values.length ? [...values].sort().join(',') : '*'
  return [
    `scenario:${segment(metadata.scenarios)}`,
    `seller:${segment(metadata.sellerProfiles)}`,
    `buyer:${segment(metadata.buyerProfiles)}`,
    `property:${segment(metadata.propertyProfiles)}`,
    `finance:${segment(metadata.financeProfiles)}`,
  ].join('|')
}

export function buildLegalDocumentTemplateCoverageAudit(templates = [], options = {}) {
  const packetType = normalizeKey(options.packetType || 'otp') || 'otp'
  const entries = (Array.isArray(templates) ? templates : [])
    .filter((template) => {
      const templatePacketType = normalizeKey(template?.packet_type || template?.packetType || packetType)
      return !templatePacketType || templatePacketType === packetType
    })
    .map((template) => {
      const metadata = resolveLegalDocumentTemplateRoutingMetadata(template)
      const identity = getTemplateIdentity(template)
      return {
        ...identity,
        signature: buildLegalDocumentTemplateRouteSignature(template),
        isGeneric: !metadata.hasRoutingMetadata,
        isExactScenario: Boolean(metadata.scenarios.length),
        metadata,
      }
    })

  const entriesBySignature = new Map()
  for (const entry of entries) {
    const matches = entriesBySignature.get(entry.signature) || []
    matches.push(entry)
    entriesBySignature.set(entry.signature, matches)
  }
  const conflicts = Array.from(entriesBySignature.entries())
    .filter(([, matches]) => matches.length > 1)
    .map(([signature, matches]) => ({
      signature,
      isGeneric: matches.every((entry) => entry.isGeneric),
      templates: matches.map(({ id, key, label }) => ({ id, key, label })),
    }))

  const genericEntries = entries.filter((entry) => entry.isGeneric)
  const targetedEntries = entries.filter((entry) => !entry.isGeneric)
  return {
    packetType,
    templateCount: entries.length,
    genericCount: genericEntries.length,
    targetedCount: targetedEntries.length,
    exactScenarioCount: targetedEntries.filter((entry) => entry.isExactScenario).length,
    hasGenericFallback: genericEntries.length > 0,
    conflictCount: conflicts.length,
    conflicts,
    entries,
  }
}
