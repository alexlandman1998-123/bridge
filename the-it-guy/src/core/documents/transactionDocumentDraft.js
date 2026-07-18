import { buildCanonicalTemplateDefinition, validateCanonicalTemplateDefinition } from './canonicalTemplateDefinition.js'

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function unique(values = []) {
  return Array.from(new Set(values.map((value) => text(value)).filter(Boolean)))
}

export const EDITABLE_DOCUMENT_SCHEMA_VERSION = 1

export function buildEditableTransactionDocumentDraft(template = {}, {
  title = '',
  packetType = '',
  createdAt = new Date().toISOString(),
} = {}) {
  const definition = buildCanonicalTemplateDefinition(template)
  const validation = validateCanonicalTemplateDefinition(definition)
  if (!validation.valid) {
    const error = new Error(`Template cannot create an editable document: ${validation.blockers[0]}`)
    error.code = 'INVALID_EDITABLE_DRAFT_TEMPLATE'
    error.blockers = validation.blockers
    throw error
  }
  if (definition.sourceMode !== 'native') {
    const error = new Error('Only native structured templates can create an editable transaction document.')
    error.code = 'EDITABLE_DRAFT_REQUIRES_NATIVE_TEMPLATE'
    throw error
  }

  const templateRevisionId = text(template.id || definition.templateId)
  if (!templateRevisionId) throw new Error('A persisted template revision is required.')
  const resolvedPacketType = text(packetType || definition.documentType).toLowerCase()
  const resolvedTitle = text(title) || definition.name

  const sections = definition.sections.map((section, index) => ({
    id: `section:${section.key}`,
    key: section.key,
    label: section.label,
    type: section.type,
    sortOrder: index,
    required: Boolean(section.required),
    repeatable: Boolean(section.repeatable),
    editable: section.editable !== false,
    custom: Boolean(section.custom),
    content: String(section.content || ''),
    condition: section.condition || {},
    mergeFields: unique((section.mergeFields || []).map((field) => field.key)),
    signingFields: Array.isArray(section.signingFields) ? section.signingFields : [],
    metadata: section.metadata && typeof section.metadata === 'object' ? section.metadata : {},
    sourceTemplateSectionKey: section.key,
  }))

  return {
    schemaVersion: EDITABLE_DOCUMENT_SCHEMA_VERSION,
    documentId: null,
    title: resolvedTitle,
    packetType: resolvedPacketType,
    status: 'draft',
    editable: true,
    templateRevision: {
      id: templateRevisionId,
      rootId: text(template.revision_root_template_id || template.metadata_json?.revision_root_template_id || templateRevisionId),
      versionTag: text(template.version_tag || definition.version?.tag || 'v1') || 'v1',
      revisionNumber: Math.max(1, Number(template.revision_number || definition.version?.number || 1)),
      definitionSchemaVersion: Number(template.definition_schema_version || definition.schemaVersion || 1),
    },
    sections,
    mergeFields: unique(sections.flatMap((section) => section.mergeFields)),
    createdAt,
    updatedAt: createdAt,
  }
}

export function buildEditableDraftSectionManifest(editableDraft = {}) {
  return (Array.isArray(editableDraft.sections) ? editableDraft.sections : []).map((section, index) => ({
    key: text(section.key || `section_${index + 1}`),
    label: text(section.label || `Section ${index + 1}`),
    sectionType: text(section.type || 'legal_text'),
    sortOrder: Number.isFinite(Number(section.sortOrder)) ? Number(section.sortOrder) : index,
    required: Boolean(section.required),
    editable: section.editable !== false,
    custom: Boolean(section.custom),
    content: String(section.content || ''),
    legalText: String(section.content || ''),
    placeholders: (section.mergeFields || []).map((key) => [key, key]),
    condition: section.condition || {},
    signingFields: Array.isArray(section.signingFields) ? section.signingFields : [],
    metadata: section.metadata && typeof section.metadata === 'object' ? section.metadata : {},
  }))
}
