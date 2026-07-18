import { buildCanonicalTemplateDefinition, validateCanonicalTemplateDefinition } from './canonicalTemplateDefinition.js'

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function safeKey(value, fallback = 'template') {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback
}

export function getTemplateRevisionNumber(template = {}) {
  const explicit = Number(template.revision_number ?? template.revisionNumber)
  if (Number.isInteger(explicit) && explicit > 0) return explicit
  const match = text(template.version_tag || template.versionTag).match(/(\d+)/)
  return match ? Math.max(1, Number(match[1])) : 1
}

export function nextTemplateVersionTag(template = {}) {
  return `v${getTemplateRevisionNumber(template) + 1}`
}

export function isImmutableTemplateRevision(template = {}) {
  const status = text(template.status || template.templateStatus || template.metadata_json?.template_status).toLowerCase()
  return ['published', 'archived', 'superseded'].includes(status) ||
    ['active', 'approved', 'live'].includes(status) ||
    Boolean(template.is_default)
}

function mapCanonicalSections(definition) {
  return definition.sections.map((section, index) => ({
    sectionKey: section.key,
    sectionLabel: section.label,
    sectionType: section.type,
    sortOrder: index,
    isRequired: Boolean(section.required),
    isRepeatable: Boolean(section.repeatable),
    conditionJson: section.condition || {},
    placeholderKeys: (section.mergeFields || []).map((field) => field.key).filter(Boolean),
    legalText: String(section.content || ''),
    metadataJson: {
      ...(section.metadata && typeof section.metadata === 'object' ? section.metadata : {}),
      editable: section.editable !== false,
      custom: Boolean(section.custom),
      planned_signing_fields: Array.isArray(section.signingFields) ? section.signingFields : [],
    },
  }))
}

export function buildTemplateRevisionInput(sourceTemplate = {}, overrides = {}, { now = Date.now() } = {}) {
  const definition = buildCanonicalTemplateDefinition(sourceTemplate)
  const validation = validateCanonicalTemplateDefinition(definition)
  if (!validation.valid) {
    const error = new Error(`Source template is invalid: ${validation.blockers[0]}`)
    error.code = 'INVALID_TEMPLATE_REVISION_SOURCE'
    error.blockers = validation.blockers
    throw error
  }

  const sourceId = text(sourceTemplate.id || definition.templateId)
  if (!sourceId) throw new Error('A persisted source template is required to create a revision.')
  const sourceMetadata = sourceTemplate.metadata_json && typeof sourceTemplate.metadata_json === 'object'
    ? { ...sourceTemplate.metadata_json }
    : {}
  const revisionRootId = text(
    sourceTemplate.revision_root_template_id || sourceMetadata.revision_root_template_id || sourceId,
  )
  const revisionNumber = getTemplateRevisionNumber(sourceTemplate) + 1
  const timestamp = Number.isFinite(Number(now)) ? Math.trunc(Number(now)) : Date.now()
  const versionTag = `v${revisionNumber}`
  const metadataOverride = overrides.metadataJson && typeof overrides.metadataJson === 'object'
    ? overrides.metadataJson
    : {}

  return {
    packetType: definition.documentType,
    moduleType: definition.moduleType || 'agency',
    templateKey: safeKey(overrides.templateKey, `${definition.templateKey}_v${revisionNumber}_${timestamp}`),
    templateLabel: text(overrides.templateLabel) || definition.name,
    description: text(overrides.description) || text(sourceTemplate.description),
    versionTag,
    templateStatus: 'draft',
    templateFormat: text(overrides.templateFormat) || text(sourceTemplate.template_format) || 'structured',
    templateStorageBucket: overrides.templateStorageBucket ?? sourceTemplate.template_storage_bucket ?? null,
    templateStoragePath: overrides.templateStoragePath ?? sourceTemplate.template_storage_path ?? null,
    templateFileName: overrides.templateFileName ?? sourceTemplate.template_file_name ?? null,
    isDefault: false,
    isActive: false,
    revisionRootTemplateId: revisionRootId,
    revisionParentTemplateId: sourceId,
    revisionNumber,
    metadataJson: {
      ...sourceMetadata,
      ...metadataOverride,
      lifecycle_status: 'draft',
      template_status: 'draft',
      revision_root_template_id: revisionRootId,
      revision_parent_template_id: sourceId,
      revision_number: revisionNumber,
      revision_created_at: new Date(timestamp).toISOString(),
    },
    sections: Array.isArray(overrides.sections) ? overrides.sections : mapCanonicalSections(definition),
  }
}
