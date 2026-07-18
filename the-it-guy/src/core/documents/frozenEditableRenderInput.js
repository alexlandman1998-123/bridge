function text(value) {
  return value === null || value === undefined ? '' : String(value).trim()
}

function failure(message, details = {}) {
  const error = new Error(message)
  error.code = 'FROZEN_EDITABLE_RENDER_INPUT_INVALID'
  error.details = details
  return error
}

export function resolveFrozenEditableRenderInput(context = {}) {
  const freeze = context?.editableRenderFreeze
  if (!freeze) return null
  if (!freeze || typeof freeze !== 'object') throw failure('Editable render freeze is malformed.')
  if (text(freeze.contract) !== 'c4-v1') throw failure('Editable render freeze contract is unsupported.')
  for (const key of ['freezeId', 'sourceVersionId', 'contentFingerprint']) {
    if (!text(freeze[key])) throw failure(`Editable render freeze is missing ${key}.`, { key })
  }

  const contentSections = Array.isArray(freeze?.editableContent?.sections) ? freeze.editableContent.sections : []
  const manifest = Array.isArray(freeze?.sectionManifest) ? freeze.sectionManifest : []
  if (!contentSections.length || !manifest.length) {
    throw failure('Frozen editable render input contains no document sections.')
  }
  if (contentSections.length !== manifest.length) {
    throw failure('Frozen editable content and section manifest have different section counts.', {
      contentSectionCount: contentSections.length,
      manifestSectionCount: manifest.length,
    })
  }

  const contentByKey = new Map(contentSections.map((section) => [text(section?.key), section]))
  const editableSections = manifest.map((section, index) => {
    const key = text(section?.key || `section_${index + 1}`)
    const contentSection = contentByKey.get(key)
    if (!contentSection) throw failure(`Frozen section ${key} is missing from editable content.`, { key })
    const manifestContent = String(section?.content ?? section?.legalText ?? section?.legal_text ?? '')
    const editableContent = String(contentSection?.content ?? '')
    if (manifestContent !== editableContent) {
      throw failure(`Frozen section ${key} content does not match its manifest.`, { key })
    }
    return {
      ...section,
      key,
      content: manifestContent,
      legalText: manifestContent,
      sortOrder: Number.isFinite(Number(section?.sortOrder)) ? Number(section.sortOrder) : index,
      tokens: Array.isArray(section?.placeholders)
        ? section.placeholders.map((placeholder) => ({
            token: text(Array.isArray(placeholder) ? placeholder[0] : placeholder?.token || placeholder?.key),
            label: text(Array.isArray(placeholder) ? placeholder[1] : placeholder?.label),
          })).filter((placeholder) => placeholder.token)
        : [],
    }
  })

  return {
    contract: 'd1-v1',
    freezeId: text(freeze.freezeId),
    sourceVersionId: text(freeze.sourceVersionId),
    sourceVersionNumber: Number(freeze.sourceVersionNumber || 0) || null,
    editSequence: Number(freeze.editSequence || 0),
    contentFingerprint: text(freeze.contentFingerprint),
    frozenAt: text(freeze.frozenAt) || null,
    editableSections,
    placeholders: freeze.placeholders && typeof freeze.placeholders === 'object' ? freeze.placeholders : {},
  }
}

export function applyFrozenEditableRenderInput(context = {}) {
  const frozen = resolveFrozenEditableRenderInput(context)
  if (!frozen) return context
  return {
    ...context,
    editableSections: frozen.editableSections,
    frozenEditableRenderInput: frozen,
  }
}
