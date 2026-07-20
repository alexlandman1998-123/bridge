function metadata(section = {}) {
  if (section.metadataJson && typeof section.metadataJson === 'object') return section.metadataJson
  if (section.metadata_json && typeof section.metadata_json === 'object') return section.metadata_json
  return {}
}

export const CONDITIONAL_PACK_PROTECTED_SECTION_FIELDS = new Set([
  'conditionJson',
  'condition_json',
  'sectionKey',
  'section_key',
  'sectionLabel',
  'section_label',
  'sectionType',
  'section_type',
  'sortOrder',
  'sort_order',
  'placeholderKeys',
  'placeholder_keys',
  'placeholderKeysText',
  'isRequired',
  'is_required',
])

export function isCoreConditionRuleLocked(section = {}) {
  const source = metadata(section)
  return source.condition_rule_locked === true || source.conditionRuleLocked === true
}

export function isConditionalMasterPackSection(section = {}) {
  return metadata(section).conditional_pack === true
}

export function sanitizeLegalDocumentSectionPatch(section = {}, patch = {}) {
  if (isConditionalMasterPackSection(section)) {
    return Object.fromEntries(
      Object.entries(patch).filter(([field]) => !CONDITIONAL_PACK_PROTECTED_SECTION_FIELDS.has(field)),
    )
  }
  if (isCoreConditionRuleLocked(section)) {
    return Object.fromEntries(
      Object.entries(patch).filter(([field]) => !['conditionJson', 'condition_json'].includes(field)),
    )
  }
  return patch
}

export function canRemoveLegalDocumentSection(section = {}) {
  return !isConditionalMasterPackSection(section)
}

export function canMoveLegalDocumentSection(sections = [], index = -1, targetIndex = -1) {
  if (index < 0 || targetIndex < 0 || index >= sections.length || targetIndex >= sections.length) return false
  return !isConditionalMasterPackSection(sections[index]) && !isConditionalMasterPackSection(sections[targetIndex])
}
