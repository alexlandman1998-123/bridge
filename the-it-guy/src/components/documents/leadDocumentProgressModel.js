export function summarizeLeadDocumentCategory(items = [], { getStatusMeta } = {}) {
  const requiredItems = (Array.isArray(items) ? items : []).filter((row) => row?.required !== false)
  const completed = requiredItems.filter((row) => {
    const state = getStatusMeta?.(row)?.state
    return state === 'complete'
  }).length
  const total = requiredItems.length
  return { completed, total, progress: total ? Math.round((completed / total) * 100) : 0 }
}
