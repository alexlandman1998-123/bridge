import { listConditionalPackDataRules } from './conditionalPackDataRules.js'
import { listLegalDocumentDefinitions } from './legalDocumentCatalog.js'
import { classifyLegalDocumentEditorSection } from './legalDocumentEditorScope.js'
import { buildLegalDocumentTemplateCoverageAudit } from './legalDocumentTemplateRouting.js'
import { SOUTH_AFRICAN_LEGAL_CLAUSE_PACK_DEFINITIONS } from './southAfricanLegalClausePacks.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s./-]+/g, '_')
}

function getMetadata(template = {}) {
  return template?.metadata_json && typeof template.metadata_json === 'object'
    ? template.metadata_json
    : template?.metadataJson && typeof template.metadataJson === 'object'
      ? template.metadataJson
      : {}
}

function getTemplateStatus(template = {}) {
  const metadata = getMetadata(template)
  const status = normalizeKey(
    template.template_status ||
      template.status ||
      template.lifecycle_status ||
      metadata.lifecycle_status ||
      metadata.template_status,
  )
  if (status) return status
  if (template.is_active === false) return 'archived'
  return template.is_default ? 'active' : 'draft'
}

function isLiveTemplate(template = {}) {
  return template.is_active !== false && (
    Boolean(template.is_default) ||
    ['active', 'published', 'approved', 'live'].includes(getTemplateStatus(template))
  )
}

function getDocumentKind(template = {}) {
  const metadata = getMetadata(template)
  return normalizeKey(metadata.document_kind || metadata.documentKind || 'standard') || 'standard'
}

function getAddendumType(template = {}) {
  const metadata = getMetadata(template)
  return normalizeKey(
    metadata.addendum_type ||
      metadata.addendumType ||
      metadata.starter_template ||
      metadata.starterTemplate,
  )
}

function isAddendumTemplate(template = {}) {
  const metadata = getMetadata(template)
  const family = normalizeKey(metadata.template_family || metadata.templateFamily)
  return getDocumentKind(template) === 'addendum' || family === 'general_addendum' || Boolean(getAddendumType(template))
}

function templateMatchesDefinition(template = {}, definition = {}) {
  const packetType = normalizeKey(template.packet_type || template.packetType)
  if (packetType && packetType !== definition.packetType) return false
  if (definition.kind === 'addendum') return isAddendumTemplate(template) && getAddendumType(template) === definition.addendumType
  return !isAddendumTemplate(template)
}

function compareTemplates(left = {}, right = {}) {
  if (Boolean(left.organisation_id) !== Boolean(right.organisation_id)) return left.organisation_id ? -1 : 1
  if (Boolean(left.is_default) !== Boolean(right.is_default)) return left.is_default ? -1 : 1
  if (isLiveTemplate(left) !== isLiveTemplate(right)) return isLiveTemplate(left) ? -1 : 1
  return String(right.updated_at || '').localeCompare(String(left.updated_at || ''))
}

function getSections(template = {}) {
  return Array.isArray(template?.sections) ? template.sections : []
}

function getSectionKey(section = {}) {
  return normalizeKey(section.section_key || section.sectionKey)
}

function titleFromKey(value = '') {
  return normalizeText(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function buildSectionSummary(section = {}, conditionalRule = null) {
  const metadata = getMetadata(section)
  const key = getSectionKey(section)
  return {
    key,
    title: normalizeText(
      section.title ||
        section.section_title ||
        section.sectionTitle ||
        section.label ||
        metadata.title ||
        conditionalRule?.label,
    ) || titleFromKey(key) || 'Untitled section',
    description: normalizeText(section.description || metadata.description),
    isRequired: section.is_required !== false && section.isRequired !== false,
    ruleLabel: normalizeText(conditionalRule?.label),
    activation: normalizeText(conditionalRule?.activation),
  }
}

function getPlannedSigningRoles(sections = []) {
  const roles = new Set()
  for (const section of sections) {
    const metadata = section?.metadata_json && typeof section.metadata_json === 'object'
      ? section.metadata_json
      : section?.metadataJson && typeof section.metadataJson === 'object'
        ? section.metadataJson
        : {}
    const signing = metadata.signing && typeof metadata.signing === 'object' ? metadata.signing : {}
    const fields = [
      ...(Array.isArray(section.signing_fields) ? section.signing_fields : []),
      ...(Array.isArray(section.signingFields) ? section.signingFields : []),
      ...(Array.isArray(metadata.planned_signing_fields) ? metadata.planned_signing_fields : []),
      ...(Array.isArray(signing.planned_fields) ? signing.planned_fields : []),
      ...(Array.isArray(signing.signing_fields) ? signing.signing_fields : []),
    ]
    for (const field of fields) {
      const role = normalizeKey(field?.signer_role || field?.signerRole || field?.role)
      if (role) roles.add(role)
    }
  }
  return [...roles]
}

function buildDocumentModel(definition = {}, templates = []) {
  const matchingTemplates = templates.filter((template) => templateMatchesDefinition(template, definition)).sort(compareTemplates)
  const primaryTemplate = matchingTemplates[0] || null
  const liveTemplate = matchingTemplates.find(isLiveTemplate) || null
  const draftTemplates = matchingTemplates.filter((template) => !isLiveTemplate(template) && getTemplateStatus(template) !== 'archived')
  const sections = getSections(primaryTemplate)
  const conditionalRules = [
    ...listConditionalPackDataRules({ packetType: definition.packetType }),
    ...(definition.packetType === 'otp'
      ? SOUTH_AFRICAN_LEGAL_CLAUSE_PACK_DEFINITIONS.filter((pack) => pack.category !== 'core')
      : []),
  ]
  const conditionalRuleBySectionKey = new Map(
    conditionalRules.flatMap((rule) => (rule.sectionKeys || [rule.key]).map((key) => [normalizeKey(key), rule])),
  )
  const situationSections = sections
    .filter((section) => classifyLegalDocumentEditorSection(section, { packetType: definition.packetType }).isSituation)
    .map((section) => buildSectionSummary(section, conditionalRuleBySectionKey.get(getSectionKey(section))))
  const standardSections = sections
    .filter((section) => classifyLegalDocumentEditorSection(section, { packetType: definition.packetType }).isStandard)
    .map((section) => buildSectionSummary(section))
  const signingRoles = getPlannedSigningRoles(sections)
  const routingAudit = definition.key === 'otp'
    ? buildLegalDocumentTemplateCoverageAudit(matchingTemplates.filter((template) => isLiveTemplate(template)), { packetType: 'otp' })
    : null
  const coverageReady = definition.kind === 'addendum'
    ? Boolean(liveTemplate)
    : definition.key === 'otp'
      ? Boolean(routingAudit?.hasGenericFallback) && routingAudit.conflictCount === 0
      : Boolean(liveTemplate)

  return {
    ...definition,
    templates: matchingTemplates,
    templateCount: matchingTemplates.length,
    primaryTemplate,
    primaryTemplateId: primaryTemplate?.id || null,
    liveTemplate,
    liveTemplateId: liveTemplate?.id || null,
    draftTemplates,
    draftCount: draftTemplates.length,
    hasLiveTemplate: Boolean(liveTemplate),
    status: liveTemplate ? 'live' : primaryTemplate ? 'draft' : 'missing',
    versionLabel: normalizeText(liveTemplate?.version_tag || primaryTemplate?.version_tag) || null,
    publishedAt: liveTemplate?.updated_at || liveTemplate?.created_at || null,
    standardSectionCount: standardSections.length,
    situationClauseCount: situationSections.length,
    standardSections,
    situationSections,
    signerRuleCount: signingRoles.length,
    signingRoles,
    coverageReady,
    routingAudit,
  }
}

export function buildLegalDocumentLibraryModel({ templatesByType = {}, packetTypes = [] } = {}) {
  const definitions = listLegalDocumentDefinitions({ packetTypes })
  const documents = definitions.map((definition) => buildDocumentModel(
    definition,
    Array.isArray(templatesByType[definition.packetType]) ? templatesByType[definition.packetType] : [],
  ))
  const liveCount = documents.filter((document) => document.hasLiveTemplate).length
  const draftCount = documents.reduce((total, document) => total + document.draftCount, 0)
  const coveredCount = documents.filter((document) => document.coverageReady).length
  return {
    documents,
    documentsByKey: Object.fromEntries(documents.map((document) => [document.key, document])),
    summary: {
      documentCount: documents.length,
      liveCount,
      draftCount,
      coveredCount,
      allCovered: documents.length > 0 && coveredCount === documents.length,
    },
  }
}
