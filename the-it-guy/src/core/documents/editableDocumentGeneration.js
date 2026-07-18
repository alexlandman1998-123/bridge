function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function humanize(value) {
  const normalized = text(value)
  if (!normalized) return 'Field'
  const lastKey = normalized.includes('.') ? normalized.split('.').at(-1) : normalized
  return lastKey
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

export function resolveEditableSectionManifest(context = {}) {
  const source = Array.isArray(context?.editableSections)
    ? context.editableSections
    : Array.isArray(context?.documentSections)
      ? context.documentSections
      : Array.isArray(context?.sectionManifest)
        ? context.sectionManifest
        : []

  if (!source.length) return null

  return source
    .map((section, index) => {
      const tokens = Array.isArray(section?.tokens)
        ? section.tokens
        : Array.isArray(section?.placeholders)
          ? section.placeholders
          : []
      const metadata = section?.metadata && typeof section.metadata === 'object'
        ? section.metadata
        : section?.metadata_json && typeof section.metadata_json === 'object'
          ? section.metadata_json
          : {}
      const signingFields = Array.isArray(section?.signingFields)
        ? section.signingFields
        : Array.isArray(section?.signing_fields)
          ? section.signing_fields
          : []
      const content = String(section?.content ?? section?.legalText ?? section?.legal_text ?? '')

      return {
        key: text(section?.key || section?.section_key || `section_${index + 1}`),
        label: text(section?.label || section?.section_label || `Section ${index + 1}`),
        required: section?.required === undefined ? Boolean(section?.is_required) : Boolean(section.required),
        sectionType: text(section?.sectionType || section?.section_type || 'legal_text') || 'legal_text',
        sortOrder: Number.isFinite(Number(section?.sortOrder ?? section?.sort_order))
          ? Number(section?.sortOrder ?? section?.sort_order)
          : index,
        placeholders: tokens
          .map((token) => {
            if (Array.isArray(token)) return [text(token[0]), text(token[1]) || humanize(token[0])]
            const key = text(token?.token || token?.key || token?.placeholderKey)
            return [key, text(token?.label || token?.placeholderLabel) || humanize(key)]
          })
          .filter(([key]) => key),
        legalText: content,
        content,
        metadata: {
          ...metadata,
          ...(signingFields.length
            ? {
                signing: {
                  ...(metadata?.signing && typeof metadata.signing === 'object' ? metadata.signing : {}),
                  signing_fields: signingFields,
                },
                planned_signing_fields: signingFields,
              }
            : {}),
        },
        visible: section?.visible !== false,
        custom: Boolean(section?.custom),
      }
    })
    .filter((section) => section.key && section.visible !== false)
}

export function resolveVersionPlannedSigningFields(version = {}) {
  const sections = Array.isArray(version?.section_manifest_json) ? version.section_manifest_json : []
  const fields = sections.flatMap((section) => {
    const metadata = section?.metadata && typeof section.metadata === 'object'
      ? section.metadata
      : section?.metadata_json && typeof section.metadata_json === 'object'
        ? section.metadata_json
        : {}
    const signing = metadata?.signing && typeof metadata.signing === 'object' ? metadata.signing : {}
    const source = Array.isArray(section?.signingFields)
      ? section.signingFields
      : Array.isArray(section?.signing_fields)
        ? section.signing_fields
        : Array.isArray(signing?.signing_fields)
          ? signing.signing_fields
          : Array.isArray(metadata?.planned_signing_fields)
            ? metadata.planned_signing_fields
            : []

    return source.map((field) => ({
      signerRole: text(field?.signerRole || field?.signer_role).toLowerCase(),
      fieldType: text(field?.fieldType || field?.field_type).toLowerCase(),
      pageNumber: Math.max(1, Number(field?.pageNumber || field?.page_number || 1)),
      xPosition: Number(field?.xPosition ?? field?.x_position ?? 0),
      yPosition: Number(field?.yPosition ?? field?.y_position ?? 0),
      width: Math.max(1, Number(field?.width || 168)),
      height: Math.max(1, Number(field?.height || 44)),
      required: field?.required === undefined ? true : Boolean(field.required),
      label: text(field?.label),
      status: 'pending',
    }))
  })

  const seen = new Set()
  return fields.filter((field) => {
    if (!field.signerRole || !['signature', 'initial', 'date', 'text'].includes(field.fieldType)) return false
    const key = [field.signerRole, field.fieldType, field.pageNumber, field.xPosition, field.yPosition].join(':')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
