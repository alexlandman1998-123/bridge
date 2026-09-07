function clampPercent(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

// Legal lane progress is deliberately completion-only. An in-progress step
// identifies the active task, but does not advance the matter percentage.
// Prefer the persisted lane summary; the step fallback keeps initial/loading
// states deterministic without inventing partial completion.
export function getCanonicalLegalWorkflowProgressPercent({ lane = null, steps = [] } = {}) {
  const persisted = Number(lane?.summary?.completionPercent)
  if (Number.isFinite(persisted)) return clampPercent(persisted)

  const normalizedSteps = Array.isArray(steps) ? steps : []
  if (!normalizedSteps.length) return 0
  const completed = normalizedSteps.filter((step) => step?.displayStatus === 'completed' || step?.status === 'completed').length
  return clampPercent((completed / normalizedSteps.length) * 100)
}
