import { EDITABLE_DOCUMENT_SCHEMA_VERSION } from './transactionDocumentDraft.js'

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

export function buildEditableDocumentRevision({
  baseDocument = {},
  sections = [],
  reviewState = 'draft',
  updatedAt = new Date().toISOString(),
} = {}) {
  const sourceSections = Array.isArray(sections) ? sections : []
  if (!sourceSections.length) {
    const error = new Error('An editable document must contain at least one section.')
    error.code = 'EDITABLE_DOCUMENT_EMPTY'
    throw error
  }

  const keys = new Set()
  const normalizedSections = sourceSections.map((section, index) => {
    const key = text(section?.key || `section_${index + 1}`)
    if (keys.has(key)) {
      const error = new Error(`Duplicate editable section key: ${key}`)
      error.code = 'EDITABLE_DOCUMENT_DUPLICATE_SECTION'
      throw error
    }
    keys.add(key)
    return {
      id: text(section?.id || `section:${key}`),
      key,
      label: text(section?.label || `Section ${index + 1}`),
      type: text(section?.type || section?.sectionType || 'legal_text'),
      sortOrder: index,
      required: Boolean(section?.required),
      repeatable: Boolean(section?.repeatable),
      editable: section?.editable !== false,
      custom: Boolean(section?.custom),
      content: String(section?.content || section?.legalText || ''),
      condition: section?.condition && typeof section.condition === 'object' ? section.condition : {},
      mergeFields: (section?.mergeFields || section?.tokens || [])
        .map((field) => text(field?.key || field?.token || field))
        .filter(Boolean),
      signingFields: Array.isArray(section?.signingFields) ? section.signingFields : [],
      metadata: section?.metadata && typeof section.metadata === 'object' ? section.metadata : {},
      sourceTemplateSectionKey: text(section?.sourceTemplateSectionKey || key),
    }
  })

  const normalizedReviewState = text(reviewState).toLowerCase() || 'draft'
  if (!['draft', 'in_review'].includes(normalizedReviewState)) {
    throw new Error('Editable document review state must be draft or in_review.')
  }

  return {
    ...(baseDocument && typeof baseDocument === 'object' ? baseDocument : {}),
    schemaVersion: Number(baseDocument?.schemaVersion || EDITABLE_DOCUMENT_SCHEMA_VERSION),
    status: 'draft',
    editable: true,
    reviewState: normalizedReviewState,
    sections: normalizedSections,
    mergeFields: Array.from(new Set(normalizedSections.flatMap((section) => section.mergeFields))),
    updatedAt,
  }
}

export function buildEditableRevisionManifest(revision = {}) {
  return (Array.isArray(revision.sections) ? revision.sections : []).map((section, index) => ({
    key: section.key,
    label: section.label,
    sectionType: section.type,
    sortOrder: index,
    required: Boolean(section.required),
    editable: section.editable !== false,
    custom: Boolean(section.custom),
    placeholders: (section.mergeFields || []).map((key) => [key, key]),
    content: String(section.content || ''),
    legalText: String(section.content || ''),
    condition: section.condition || {},
    metadata: section.metadata || {},
    signingFields: section.signingFields || [],
  }))
}
