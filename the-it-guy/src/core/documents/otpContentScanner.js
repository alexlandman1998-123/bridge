import {
  OTP_CONTENT_RULE_VERSION,
  getOtpContentRule,
  getOtpContentSignalGroup,
  listOtpContentSignalGroups,
  resolveOtpContentRuleProfile,
} from './otpContentRules.js'
import {
  normalizeOtpDocumentVariant,
} from './otpRouteUniverse.js'

export const OTP_CONTENT_SCANNER_VERSION = 'otp_content_scanner_phase7_v1'

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

function splitValues(value) {
  if (Array.isArray(value)) return value.flatMap((item) => splitValues(item))
  if (value && typeof value === 'object') return Object.values(value).flatMap((item) => splitValues(item))
  return normalizeText(value)
    .split(',')
    .map((item) => normalizeKey(item))
    .filter(Boolean)
}

function normalizeSearchText(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function extractPlaceholderTokens(text = '') {
  return [...String(text || '').matchAll(/{{\s*([^{}]+?)\s*}}/g)]
    .map((match) => normalizeKey(match[1]))
    .filter(Boolean)
}

function normalizePlaceholderKeys(section = {}, legalText = '') {
  const raw = [
    ...(Array.isArray(section.placeholder_keys) ? section.placeholder_keys : []),
    ...(Array.isArray(section.placeholderKeys) ? section.placeholderKeys : []),
    ...splitValues(section.placeholderKeysText || section.placeholder_keys_text),
    ...extractPlaceholderTokens(legalText),
  ]
  return Array.from(new Set(raw.map((item) => normalizeKey(item)).filter(Boolean)))
}

function resolveSectionMetadata(section = {}) {
  return section?.metadata_json && typeof section.metadata_json === 'object'
    ? section.metadata_json
    : section?.metadataJson && typeof section.metadataJson === 'object'
      ? section.metadataJson
      : {}
}

function resolveSectionCondition(section = {}) {
  const metadata = resolveSectionMetadata(section)
  return asRecord(
    section.conditionJson ||
      section.condition_json ||
      section.visibilityRules ||
      section.visibility_rules ||
      metadata.conditionJson ||
      metadata.condition_json ||
      metadata.visibilityRules ||
      metadata.visibility_rules,
  )
}

function hasConditionSignal(condition = {}) {
  const source = asRecord(condition)
  if (!Object.keys(source).length) return false
  if (normalizeText(source.field || source.fact || source.path || source.key)) return true
  const rule = asRecord(source.rule)
  if (normalizeText(rule.field || rule.fact || rule.path || rule.key || rule.placeholder || rule.placeholderKey || rule.placeholder_key)) return true
  if (Array.isArray(source.all) && source.all.length) return true
  if (Array.isArray(source.any) && source.any.length) return true
  if (Array.isArray(source.conditions) && source.conditions.length) return true
  return false
}

function issueKey(issue = {}) {
  return [
    issue.code,
    issue.sectionKey,
    issue.signalGroupKey,
    normalizeText(issue.message).toLowerCase(),
  ].join('|')
}

function dedupeIssues(issues = []) {
  const seen = new Set()
  const rows = []
  for (const issue of issues) {
    const key = issueKey(issue)
    if (seen.has(key)) continue
    seen.add(key)
    rows.push(issue)
  }
  return rows
}

export function resolveOtpContentScannerRouteKey(template = {}, fallback = 'resale_existing_property') {
  const metadata = templateMetadata(template)
  return normalizeOtpDocumentVariant(
    template?.otpDocumentVariant ||
      template?.otp_document_variant ||
      template?.documentVariant ||
      template?.document_variant ||
      metadata.otp_document_variant ||
      metadata.otpDocumentVariant ||
      metadata.document_variant ||
      metadata.documentVariant ||
      fallback,
  ) || 'resale_existing_property'
}

export function normalizeOtpContentSectionForScan(section = {}, index = 0) {
  const metadata = resolveSectionMetadata(section)
  const legalText = normalizeText(
    section.legalText ??
      section.legal_text ??
      section.content ??
      section.body ??
      metadata.legalText ??
      metadata.legal_text,
  )
  const sectionKey = normalizeKey(section.sectionKey || section.section_key || section.key || `section_${index + 1}`)
  const conditionJson = resolveSectionCondition(section)
  return {
    id: normalizeText(section.id) || null,
    sectionKey,
    sectionLabel: normalizeText(section.sectionLabel || section.section_label || section.label || sectionKey || `Section ${index + 1}`),
    sectionType: normalizeKey(section.sectionType || section.section_type || section.type || 'legal_text') || 'legal_text',
    legalText,
    searchText: normalizeSearchText(legalText),
    placeholderKeys: normalizePlaceholderKeys(section, legalText),
    conditionJson,
    hasCondition: hasConditionSignal(conditionJson),
    metadataJson: metadata,
    sortOrder: Number.isFinite(Number(section.sortOrder ?? section.sort_order)) ? Number(section.sortOrder ?? section.sort_order) : index,
  }
}

export function normalizeOtpContentSectionsForScan(templateOrSections = null) {
  const sections = Array.isArray(templateOrSections)
    ? templateOrSections
    : Array.isArray(templateOrSections?.sections)
      ? templateOrSections.sections
      : Array.isArray(templateOrSections?.templateSections)
        ? templateOrSections.templateSections
        : []
  return sections
    .map((section, index) => normalizeOtpContentSectionForScan(section, index))
    .sort((left, right) => left.sortOrder - right.sortOrder)
}

export function detectOtpContentSectionSignals(section = {}, signalGroups = listOtpContentSignalGroups()) {
  const normalizedSection = section?.searchText
    ? section
    : normalizeOtpContentSectionForScan(section)
  return signalGroups
    .map((group) => {
      const fieldHits = (group.fieldKeys || [])
        .map((fieldKey) => normalizeKey(fieldKey))
        .filter((fieldKey) => normalizedSection.placeholderKeys.includes(fieldKey))
      const phraseHits = (group.phrases || [])
        .map((phrase) => normalizeSearchText(phrase))
        .filter((phrase) => phrase && normalizedSection.searchText.includes(phrase))
      const hits = [
        ...fieldHits.map((value) => ({ type: 'field', value })),
        ...phraseHits.map((value) => ({ type: 'phrase', value })),
      ]
      if (!hits.length) return null
      return {
        signalGroupKey: group.key,
        signalGroupLabel: group.label,
        severity: group.severity || 'warning',
        remediation: group.remediation || '',
        sectionKey: normalizedSection.sectionKey,
        sectionLabel: normalizedSection.sectionLabel,
        conditionalSectionKey: normalizedSection.hasCondition ? normalizedSection.sectionKey : '',
        hasCondition: normalizedSection.hasCondition,
        hits,
      }
    })
    .filter(Boolean)
}

function buildMissingRequiredIssue(group = {}, rule = {}) {
  return {
    severity: group.severity === 'warning' ? 'warning' : 'blocking',
    code: 'OTP_MISSING_REQUIRED_SIGNAL_GROUP',
    routeKey: rule.key,
    routeLabel: rule.label,
    signalGroupKey: group.key,
    signalGroupLabel: group.label,
    sectionKey: '',
    sectionLabel: '',
    message: `${rule.label} template is missing ${group.label}.`,
    remediation: group.remediation || `Add ${group.label} before publishing this OTP route.`,
  }
}

function buildForbiddenIssue(signal = {}, rule = {}) {
  const group = getOtpContentSignalGroup(signal.signalGroupKey) || {}
  return {
    severity: 'blocking',
    code: 'OTP_FORBIDDEN_ROUTE_SIGNAL',
    routeKey: rule.key,
    routeLabel: rule.label,
    signalGroupKey: signal.signalGroupKey,
    signalGroupLabel: signal.signalGroupLabel,
    sectionKey: signal.sectionKey,
    sectionLabel: signal.sectionLabel,
    conditionalSectionKey: signal.conditionalSectionKey || '',
    hits: signal.hits || [],
    message: `${rule.label} template contains ${signal.signalGroupLabel} in "${signal.sectionLabel}" outside the allowed OTP route.`,
    remediation: group.remediation || 'Move this wording into the correct OTP route template.',
  }
}

function buildMissingConditionIssue(signal = {}, rule = {}) {
  return {
    severity: 'blocking',
    code: 'OTP_CONDITIONAL_ROUTE_SECTION_MISSING_CONDITION',
    routeKey: rule.key,
    routeLabel: rule.label,
    signalGroupKey: signal.signalGroupKey,
    signalGroupLabel: signal.signalGroupLabel,
    sectionKey: signal.sectionKey,
    sectionLabel: signal.sectionLabel,
    conditionalSectionKey: signal.conditionalSectionKey || '',
    message: `${rule.label} template has optional ${signal.signalGroupLabel} in "${signal.sectionLabel}", but that section has no visibility condition.`,
    remediation: 'Add a visibility condition so optional OTP wording appears only when the matching offer term exists.',
  }
}

function routeAllowsSignal(rule = {}, signal = {}) {
  if ((rule.requiredSignalGroups || []).includes(signal.signalGroupKey)) return true
  return !(rule.forbiddenUnconditionalSignalGroups || []).includes(signal.signalGroupKey)
}

function routeRequiresOptionalCondition(signal = {}) {
  return signal.signalGroupKey === 'subject_to_sale'
}

export function scanOtpContent(template = {}, options = {}) {
  const routeKey = normalizeOtpDocumentVariant(options.routeKey || resolveOtpContentScannerRouteKey(template))
  const rule = getOtpContentRule(routeKey || 'resale_existing_property')
  const ruleProfile = resolveOtpContentRuleProfile(rule.key)
  const sections = normalizeOtpContentSectionsForScan(options.sections || template)
  const signalGroups = listOtpContentSignalGroups()
  const sectionAnalyses = sections.map((section) => ({
    ...section,
    signals: detectOtpContentSectionSignals(section, signalGroups),
  }))
  const signalHits = sectionAnalyses.flatMap((section) => section.signals)
  const issues = []

  if (!sections.length) {
    issues.push({
      severity: 'blocking',
      code: 'OTP_NO_TEMPLATE_SECTIONS',
      routeKey: rule.key,
      routeLabel: rule.label,
      message: `${rule.label} template has no sections to scan.`,
      remediation: 'Add OTP legal-content sections before publishing this route.',
    })
  }

  for (const group of ruleProfile.requiredSignalGroups) {
    const present = signalHits.some((signal) => signal.signalGroupKey === group.key && routeAllowsSignal(rule, signal))
    if (!present) issues.push(buildMissingRequiredIssue(group, rule))
  }

  for (const signal of signalHits) {
    if (!routeAllowsSignal(rule, signal)) {
      issues.push(buildForbiddenIssue(signal, rule))
      continue
    }
    if (routeRequiresOptionalCondition(signal) && !signal.hasCondition) {
      issues.push(buildMissingConditionIssue(signal, rule))
    }
  }

  const blockers = dedupeIssues(issues.filter((issue) => issue.severity !== 'warning'))
  const warnings = dedupeIssues(issues.filter((issue) => issue.severity === 'warning'))
  const presentSignalGroupKeys = Array.from(new Set(signalHits.map((signal) => signal.signalGroupKey))).sort()
  const presentSectionKeys = Array.from(new Set(sectionAnalyses.map((section) => section.sectionKey))).sort()
  const missingRecommendedSectionKeys = (rule.recommendedSectionKeys || [])
    .filter((sectionKey) => !presentSectionKeys.includes(sectionKey))

  return {
    scannerVersion: OTP_CONTENT_SCANNER_VERSION,
    ruleVersion: OTP_CONTENT_RULE_VERSION,
    routeKey: rule.key,
    routeLabel: rule.label,
    isValidForPublish: blockers.length === 0,
    blockingCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    signalHits,
    presentSignalGroupKeys,
    presentSectionKeys,
    missingRecommendedSectionKeys,
    sectionAnalyses,
    remediation: rule.remediation || [],
  }
}

export function scanOtpContentSections(sections = [], options = {}) {
  return scanOtpContent({ sections }, options)
}

