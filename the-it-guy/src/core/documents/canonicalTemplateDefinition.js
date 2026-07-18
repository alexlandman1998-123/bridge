const TEMPLATE_DEFINITION_SCHEMA_VERSION = 1

function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function key(value, fallback = '') {
  const normalized = text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || fallback
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function mergeFieldKey(value) {
  return text(value).toLowerCase().replace(/[^a-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '')
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)))
}

function normalizeStatus(template = {}) {
  const metadata = object(template.metadata_json || template.metadataJson)
  const storedDefinition = object(template.definition_json || template.definitionJson)
  const raw = text(
    template.status ||
    template.template_status ||
    metadata.template_status ||
    metadata.lifecycle_status ||
    storedDefinition.status,
  ).toLowerCase()
  if (raw === 'active' || raw === 'live' || raw === 'published') return 'active'
  if (raw === 'archived' || template.is_active === false) return 'archived'
  if (raw === 'draft') return raw
  return template.is_default || template.is_active ? 'active' : 'draft'
}

function normalizeMergeFields(section = {}, content = '') {
  const declared = Array.isArray(section.placeholder_keys)
    ? section.placeholder_keys
    : Array.isArray(section.placeholderKeys)
      ? section.placeholderKeys
      : Array.isArray(section.mergeFields)
        ? section.mergeFields
        : []
  const inline = [...String(content || '').matchAll(/{{\s*([a-zA-Z0-9._-]+)\s*}}/g)].map((match) => match[1])
  const byKey = new Map()

  for (const item of [...declared, ...inline]) {
    const source = object(item)
    const fieldKey = mergeFieldKey(source.key || source.token || item)
    if (!fieldKey || byKey.has(fieldKey)) continue
    byKey.set(fieldKey, {
      key: fieldKey,
      label: text(source.label) || fieldKey.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
      valueType: text(source.valueType || source.value_type || 'text').toLowerCase() || 'text',
      required: Boolean(source.required),
    })
  }

  return Array.from(byKey.values())
}

function normalizeSigningFields(section = {}) {
  const metadata = object(section.metadata_json || section.metadataJson || section.metadata)
  const signing = object(metadata.signing)
  const source = Array.isArray(section.signingFields)
    ? section.signingFields
    : Array.isArray(section.signing_fields)
      ? section.signing_fields
      : Array.isArray(signing.signing_fields)
        ? signing.signing_fields
        : Array.isArray(signing.planned_fields)
          ? signing.planned_fields
          : Array.isArray(metadata.planned_signing_fields)
            ? metadata.planned_signing_fields
            : []

  return source.map((field) => ({
    signerRole: key(field?.signerRole || field?.signer_role),
    fieldType: key(field?.fieldType || field?.field_type),
    required: field?.required === undefined ? true : Boolean(field.required),
  })).filter((field) => field.signerRole && field.fieldType)
}

function normalizeSection(section = {}, index = 0) {
  const content = String(section.legal_text ?? section.legalText ?? section.content ?? '')
  const metadata = object(section.metadata_json || section.metadataJson || section.metadata)
  const condition = object(section.condition_json || section.conditionJson || section.condition)
  const signingFields = normalizeSigningFields(section)

  return {
    key: key(section.section_key || section.sectionKey || section.key, `section_${index + 1}`),
    label: text(section.section_label || section.sectionLabel || section.label) || `Section ${index + 1}`,
    type: key(section.section_type || section.sectionType || section.type, 'legal_text'),
    order: Number.isFinite(Number(section.sort_order ?? section.sortOrder ?? section.order))
      ? Math.trunc(Number(section.sort_order ?? section.sortOrder ?? section.order))
      : index,
    editable: section.editable === undefined ? metadata.editable !== false : Boolean(section.editable),
    required: section.is_required === undefined
      ? section.required === undefined ? true : Boolean(section.required)
      : Boolean(section.is_required),
    repeatable: Boolean(section.is_repeatable ?? section.isRepeatable ?? section.repeatable),
    custom: Boolean(section.custom ?? metadata.custom),
    content,
    mergeFields: normalizeMergeFields(section, content),
    condition,
    signingFields,
    metadata,
  }
}

export function buildCanonicalTemplateDefinition(template = {}, sectionsOverride = null) {
  const metadata = object(template.metadata_json || template.metadataJson)
  const storedDefinition = object(template.definition_json || template.definitionJson)
  const storedBranding = object(storedDefinition.branding)
  const sections = Array.isArray(sectionsOverride)
    ? sectionsOverride
    : Array.isArray(template.sections)
      ? template.sections
      : Array.isArray(storedDefinition.sections)
        ? storedDefinition.sections
        : []
  const normalizedSections = sections
    .map(normalizeSection)
    .sort((left, right) => left.order - right.order)
    .map((section, order) => ({ ...section, order }))
  const declaredRoles = Array.isArray(metadata.default_signer_roles)
    ? metadata.default_signer_roles
    : Array.isArray(metadata.defaultSignerRoles)
      ? metadata.defaultSignerRoles
      : Array.isArray(storedDefinition.defaultSignerRoles)
        ? storedDefinition.defaultSignerRoles
        : []
  const signerRoles = unique([
    ...declaredRoles.map((role) => key(role?.key || role?.role || role)),
    ...normalizedSections.flatMap((section) => section.signingFields.map((field) => field.signerRole)),
  ]).map((role, order) => ({
    role,
    label: text(declaredRoles.find((item) => key(item?.key || item?.role || item) === role)?.label) ||
      role.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()),
    order,
  }))
  const templateFormat = text(template.template_format || template.templateFormat || storedDefinition.sourceMode).toLowerCase()
  const versionTag = text(template.version_tag || template.versionTag || storedDefinition.version?.tag) || 'v1'
  const inferredVersionNumber = Number(versionTag.match(/\d+/)?.[0] || 1)

  return {
    schemaVersion: TEMPLATE_DEFINITION_SCHEMA_VERSION,
    templateId: text(template.id || storedDefinition.templateId) || null,
    templateKey: key(template.template_key || template.templateKey || storedDefinition.templateKey, 'template'),
    name: text(template.template_label || template.templateLabel || template.name || storedDefinition.name) || 'Untitled template',
    documentType: key(template.packet_type || template.packetType || storedDefinition.documentType),
    moduleType: key(template.module_type || template.moduleType || storedDefinition.moduleType, 'agency'),
    organisationId: text(template.organisation_id || template.organisationId || storedDefinition.organisationId) || null,
    version: {
      tag: versionTag,
      number: Number.isFinite(Number(template.version_number ?? template.versionNumber ?? storedDefinition.version?.number))
        ? Number(template.version_number ?? template.versionNumber ?? storedDefinition.version?.number)
        : inferredVersionNumber,
    },
    status: normalizeStatus(template),
    sourceMode: ['structured', 'json', 'native_structured'].includes(templateFormat) ? 'native' : 'legacy_docx',
    sections: normalizedSections,
    mergeFields: unique(normalizedSections.flatMap((section) => section.mergeFields.map((field) => field.key))),
    defaultSignerRoles: signerRoles,
    branding: {
      ...storedBranding,
      ...object(metadata.branding || metadata.branding_defaults || metadata.company_branding),
      inheritOrganisationBranding: metadata.inherit_organisation_branding === undefined
        ? storedBranding.inheritOrganisationBranding !== false
        : metadata.inherit_organisation_branding !== false,
    },
  }
}

export function validateCanonicalTemplateDefinition(definition = {}) {
  const blockers = []
  if (Number(definition.schemaVersion) !== TEMPLATE_DEFINITION_SCHEMA_VERSION) blockers.push('Unsupported template schema version.')
  if (!text(definition.name)) blockers.push('Template name is required.')
  if (!['mandate', 'otp', 'addendum'].includes(key(definition.documentType))) blockers.push('A supported document type is required.')
  if (!['draft', 'active', 'archived'].includes(text(definition.status))) blockers.push('Template status must be draft, active, or archived.')
  if (!Array.isArray(definition.sections)) blockers.push('Template sections must be an ordered list.')

  const sectionKeys = new Set()
  for (const section of Array.isArray(definition.sections) ? definition.sections : []) {
    if (!text(section?.key)) blockers.push('Every template section requires a key.')
    if (sectionKeys.has(section?.key)) blockers.push(`Duplicate template section key: ${section.key}.`)
    sectionKeys.add(section?.key)
    if (!text(section?.label)) blockers.push(`Section ${section?.key || 'unknown'} requires a label.`)
    if (typeof section?.content !== 'string') blockers.push(`Section ${section?.key || 'unknown'} requires editable text.`)
  }

  return { valid: blockers.length === 0, blockers }
}

export { TEMPLATE_DEFINITION_SCHEMA_VERSION }
