import { listConditionalPackDataRules } from './conditionalPackDataRules.js'
import { normalizeLegalDocumentEditorScope } from './legalDocumentCatalog.js'
import { sectionMatchesLegalDocumentEditorSituation } from './legalDocumentEditorSituations.js'

const SITUATION_KEYS_BY_PACKET_TYPE = new Map()

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s./-]+/g, '_')
}

function getMetadata(section = {}) {
  return section?.metadataJson && typeof section.metadataJson === 'object'
    ? section.metadataJson
    : section?.metadata_json && typeof section.metadata_json === 'object'
      ? section.metadata_json
      : {}
}

function hasEnabledCondition(section = {}) {
  const condition = section.conditionJson && typeof section.conditionJson === 'object'
    ? section.conditionJson
    : section.condition_json && typeof section.condition_json === 'object'
      ? section.condition_json
      : {}
  if (condition.enabled === false) return false
  return condition.enabled === true || Boolean(condition.field || condition.operator || condition.rules?.length)
}

function hasSigningConfiguration(section = {}) {
  const metadata = getMetadata(section)
  const signing = metadata.signing && typeof metadata.signing === 'object' ? metadata.signing : {}
  const fields = [
    ...(Array.isArray(section.signingFields) ? section.signingFields : []),
    ...(Array.isArray(section.signing_fields) ? section.signing_fields : []),
    ...(Array.isArray(metadata.planned_signing_fields) ? metadata.planned_signing_fields : []),
    ...(Array.isArray(signing.planned_fields) ? signing.planned_fields : []),
    ...(Array.isArray(signing.signing_fields) ? signing.signing_fields : []),
  ]
  const key = normalizeKey(section.sectionKey || section.section_key)
  const label = normalizeKey(section.sectionLabel || section.section_label || section.title)
  return fields.length > 0 || /(signature|signing|execution)/.test(`${key}_${label}`)
}

function getSituationSectionKeys(packetType = '') {
  const normalizedPacketType = normalizeKey(packetType)
  if (SITUATION_KEYS_BY_PACKET_TYPE.has(normalizedPacketType)) return SITUATION_KEYS_BY_PACKET_TYPE.get(normalizedPacketType)
  const keys = new Set(
    listConditionalPackDataRules({ packetType })
      .flatMap((rule) => rule.sectionKeys || [rule.key])
      .map(normalizeKey),
  )
  SITUATION_KEYS_BY_PACKET_TYPE.set(normalizedPacketType, keys)
  return keys
}

export function classifyLegalDocumentEditorSection(section = {}, { packetType = '' } = {}) {
  const key = normalizeKey(section.sectionKey || section.section_key)
  const isSituation = getSituationSectionKeys(packetType).has(key) || hasEnabledCondition(section)
  return {
    key,
    isSituation,
    isSigning: hasSigningConfiguration(section),
    isStandard: !isSituation,
  }
}

export function listScopedLegalDocumentSectionEntries(sections = [], {
  scope = 'all',
  packetType = '',
  situationKey = '',
} = {}) {
  const normalizedScope = normalizeLegalDocumentEditorScope(scope)
  const entries = (Array.isArray(sections) ? sections : []).map((section, index) => ({
    section,
    index,
    classification: classifyLegalDocumentEditorSection(section, { packetType }),
  }))
  if (normalizedScope === 'all') return entries
  const matches = entries.filter((entry) => {
    if (normalizedScope === 'standard') return entry.classification.isStandard
    if (normalizedScope === 'situations') return entry.classification.isSituation
    if (normalizedScope === 'signing') return entry.classification.isSigning
    return true
  })
  if (normalizedScope === 'situations') {
    if (!situationKey) return []
    return matches.filter((entry) => sectionMatchesLegalDocumentEditorSituation(entry.section, situationKey))
  }
  if (normalizedScope === 'signing' && !matches.length) return entries
  return matches
}
