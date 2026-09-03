function text(value) {
  return String(value || '').trim()
}

function unitLabelKeys(value) {
  const source = text(value).toLowerCase().replace(/^unit\s*/i, '')
  const compact = source.replace(/[^a-z0-9]/g, '')
  const numeric = compact.match(/\d+/)?.[0] || ''
  return [...new Set([compact, numeric ? String(Number(numeric)) : ''].filter(Boolean))]
}

function hasCoordinates(position) {
  return Number.isFinite(Number(position?.x)) && Number.isFinite(Number(position?.y))
}

function unitNumber(unit = {}) {
  return text(unit.unitNumber || unit.unit_number || unit.unitLabel || unit.unit_label)
}

/**
 * Suggest placements from text labels embedded in a vector/digital PDF.
 * Suggestions deliberately remain separate from the persisted canonical map
 * until a user applies them.
 */
export function buildPdfSitePlanUnitSuggestions({ units = [], textAnchors = [], sitePlanMap = {} } = {}) {
  const anchorByLabel = new Map()
  textAnchors.forEach((anchor) => {
    if (!hasCoordinates(anchor)) return
    unitLabelKeys(anchor.label).forEach((key) => {
      if (!anchorByLabel.has(key)) anchorByLabel.set(key, anchor)
    })
  })

  return units.reduce((suggestions, unit) => {
    const id = text(unit?.id)
    if (!id || hasCoordinates(sitePlanMap?.[id])) return suggestions
    const label = unitNumber(unit)
    const match = unitLabelKeys(label).map((key) => anchorByLabel.get(key)).find(Boolean)
    if (!match) return suggestions
    suggestions[id] = {
      x: Math.round(Number(match.x) * 10) / 10,
      y: Math.round(Number(match.y) * 10) / 10,
      sourceLabel: text(match.label),
    }
    return suggestions
  }, {})
}
