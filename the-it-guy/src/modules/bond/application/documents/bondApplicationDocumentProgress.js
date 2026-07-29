export function calculateBondApplicationDocumentProgress(checklist = {}) {
  const items = Array.isArray(checklist.items) ? checklist.items : []
  const requiredItems = items.filter((item) => item.requirement?.required)
  const completeItems = requiredItems.filter((item) => item.complete && Number(item.uploadedCount || 0) >= Number(item.requiredCount || 1))
  const blockingMissing = requiredItems.filter((item) => item.blocking)
  const percent = requiredItems.length ? Math.round((completeItems.length / requiredItems.length) * 100) : 0
  return {
    completedRequired: completeItems.length,
    totalRequired: requiredItems.length,
    missingRequired: Math.max(requiredItems.length - completeItems.length, 0),
    blockingMissing,
    canContinue: blockingMissing.length === 0,
    percent,
  }
}
