import {
  buildLegalDocumentScenarioPlaceholders,
  normalizeLegalPropertyTitleType,
  resolveLegalDocumentScenarioProfile,
} from './legalDocumentScenarioProfile.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function asRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

export function normalizeMandatePropertyTitleType(value = '') {
  return normalizeLegalPropertyTitleType(value)
}

export function resolveMandateScenarioProfile(options = {}) {
  return resolveLegalDocumentScenarioProfile({
    ...options,
    packetType: 'mandate',
  })
}

export function buildMandateScenarioPlaceholders(profile = {}) {
  const shared = buildLegalDocumentScenarioPlaceholders(profile)
  const activeClausePacks = Array.isArray(profile.activeClausePacks) ? profile.activeClausePacks : []
  return {
    ...shared,
    mandate_template_variant: normalizeText(profile.templateVariant),
    mandate_clause_profile: normalizeText(profile.clauseProfile || profile.templateVariant),
    mandate_active_clause_packs: activeClausePacks.join(', '),
  }
}

export function withMandateScenarioPlaceholders(placeholders = {}, options = {}) {
  const payload = asRecord(placeholders)
  const profile = resolveMandateScenarioProfile({ ...options, placeholders: payload })
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
