const EDITOR_SITUATIONS = Object.freeze([
  Object.freeze({ key: 'individual', label: 'Individual', description: 'Natural-person capacity wording.', match: /(individual|natural_person|private_individual)/ }),
  Object.freeze({ key: 'company', label: 'Company', description: 'Company authority and representative wording.', match: /(company|director|resolution)/ }),
  Object.freeze({ key: 'trust', label: 'Trust', description: 'Trustee authority and trust wording.', match: /(trust|trustee)/ }),
  Object.freeze({ key: 'married_in_community', label: 'Married in community', description: 'Spouse consent and marital wording.', match: /(spouse|married|in_community|community_of_property)/ }),
  Object.freeze({ key: 'sectional_title', label: 'Sectional title', description: 'Scheme, section and body corporate wording.', match: /(sectional|body_corporate|scheme)/ }),
  Object.freeze({ key: 'finance', label: 'Finance', description: 'Bond, cash and payment wording.', match: /(bond|cash|finance|mortgage|payment)/ }),
])

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s./-]+/g, '_')
}

export function listLegalDocumentEditorSituations() {
  return EDITOR_SITUATIONS
}

export function getLegalDocumentEditorSituation(value = '') {
  const key = normalizeKey(value)
  return EDITOR_SITUATIONS.find((situation) => situation.key === key) || null
}

export function sectionMatchesLegalDocumentEditorSituation(section = {}, situationKey = '') {
  const situation = getLegalDocumentEditorSituation(situationKey)
  if (!situation) return false
  const searchable = JSON.stringify({
    key: section.sectionKey || section.section_key || '',
    label: section.sectionLabel || section.section_label || section.title || '',
    condition: section.conditionJson || section.condition_json || {},
    metadata: section.metadataJson || section.metadata_json || {},
  }).toLowerCase()
  return situation.match.test(searchable)
}
