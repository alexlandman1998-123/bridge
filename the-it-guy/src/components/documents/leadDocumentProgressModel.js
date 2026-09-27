export function summarizeLeadDocumentCategory(items = [], { getStatusMeta, partyType = 'seller' } = {}) {
  const requiredItems = (Array.isArray(items) ? items : []).filter((row) => row?.required !== false)
  const completed = requiredItems.filter((row) => {
    const state = getStatusMeta?.(row)?.state
    return state === 'complete' || (partyType !== 'buyer' && state === 'review')
  }).length
  const total = requiredItems.length
  return { completed, total, progress: total ? Math.round((completed / total) * 100) : 0 }
}
