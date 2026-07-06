import { resolveConditionalPackDataRequirements } from './conditionalPackDataRules.js'
import {
  getCanonicalMergeFieldDefinition,
  normalizeMergeFieldPayload,
} from './mergeFieldRegistry.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function humanizePlaceholderKey(value) {
  const normalized = normalizeText(value)
  if (!normalized) return 'Field'
  const lastKey = normalized.includes('.') ? normalized.split('.').slice(-1)[0] : normalized
  return lastKey
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function isMissingConditionalPackGenerationValue(value) {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') {
    const text = normalizeText(value)
    if (!text) return true
    const lowered = text.toLowerCase()
    if (lowered.startsWith('[missing:') || lowered.startsWith('missing:')) return true
    const normalized = lowered.replace(/[\s._-]+/g, '_')
    return ['missing', 'na', 'n_a', 'n/a', 'none', 'unknown', 'tbc', 'not_applicable', 'not_provided', 'no_spouse'].includes(normalized)
  }
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value).length === 0
  return false
}

function dedupeIssues(issues = []) {
  const seen = new Set()
  const rows = []

  for (const issue of issues) {
    const placeholderKey = normalizeText(issue?.placeholderKey || issue?.placeholder_key || issue?.field || issue?.key).toLowerCase()
    const sectionKey = normalizeText(issue?.sectionKey || issue?.section_key || issue?.groupKey || issue?.source).toLowerCase()
    const message = normalizeText(issue?.message).toLowerCase()
    const key = placeholderKey
      ? `placeholder|${placeholderKey}`
      : `message|${sectionKey}|${message}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(issue)
  }

  return rows
}

export function buildConditionalPackMissingPlaceholderIssues({
  packetType,
  placeholders = {},
  dataRequirements = [],
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'otp'
  const missingIssues = []

  for (const requirement of dataRequirements) {
    for (const placeholderKey of requirement.requiredMergeFields || []) {
      const canonicalKey = normalizeText(placeholderKey)
      if (!canonicalKey) continue
      const definition = getCanonicalMergeFieldDefinition(canonicalKey, {
        packetType: normalizedPacketType,
      })
      const resolvedKey = normalizeText(definition?.key || canonicalKey)
      const value = placeholders?.[resolvedKey] ?? placeholders?.[canonicalKey]
      if (!isMissingConditionalPackGenerationValue(value)) continue
      const placeholderLabel = normalizeText(definition?.label) || humanizePlaceholderKey(resolvedKey)
      const packLabel = normalizeText(requirement.label) || 'the active conditional clause pack'
      missingIssues.push({
        sectionKey: requirement.key || requirement.packKey || 'conditional_pack',
        sectionLabel: packLabel,
        placeholderKey: resolvedKey,
        placeholderLabel,
        message: `${placeholderLabel} is required for ${packLabel}.`,
        source: 'conditional_pack',
        required: true,
        packKey: requirement.key || requirement.packKey || '',
        packLabel,
      })
    }
  }

  return dedupeIssues(missingIssues)
}

export function resolveConditionalPackPreflight({
  packetType,
  placeholders = {},
  ...options
} = {}) {
  const normalizedPacketType = normalizeText(packetType).toLowerCase() || 'otp'
  const normalizedPayload = normalizeMergeFieldPayload(placeholders, {
    packetType: normalizedPacketType,
    includeAliasKeys: true,
  }).payload
  const dataRequirements = resolveConditionalPackDataRequirements({
    ...options,
    packetType: normalizedPacketType,
    placeholders: normalizedPayload,
  })
  const missingPlaceholders = buildConditionalPackMissingPlaceholderIssues({
    packetType: normalizedPacketType,
    placeholders: normalizedPayload,
    dataRequirements,
  })
  const missingKeys = new Set(
    missingPlaceholders
      .map((issue) => normalizeText(issue?.placeholderKey || issue?.placeholder_key).toLowerCase())
      .filter(Boolean),
  )

  return {
    dataRequirements,
    missingPlaceholders,
    missingKeys,
    canProceed: missingPlaceholders.length === 0,
  }
}
