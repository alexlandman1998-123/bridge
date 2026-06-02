export const WORKFLOW_PROGRESS_WEIGHTS = Object.freeze({
  sales_otp: 20,
  finance: 25,
  transfer: 35,
  registration: 20,
})

const STEP_COMPLETE_STATES = new Set(['complete', 'skipped', 'not_applicable'])

function toFinitePercent(value = 0) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

export function filterRequiredWorkflowSteps(requiredSteps = []) {
  return (Array.isArray(requiredSteps) ? requiredSteps : []).filter((step) => {
    if (!step || typeof step !== 'object') return false
    if (step.required === false) return false
    return String(step.status || '').trim().toLowerCase() !== 'not_applicable'
  })
}

export function calculateWorkflowCompletionRatio(requiredSteps = []) {
  const steps = filterRequiredWorkflowSteps(requiredSteps)
  if (steps.length === 0) return 1

  const completed = steps.filter((step) => STEP_COMPLETE_STATES.has(String(step?.status || '').trim().toLowerCase())).length
  return completed / steps.length
}

export function calculateWorkflowCompletion(workflow = {}) {
  return calculateWorkflowCompletionRatio(workflow.requiredSteps || workflow.steps || [])
}

export function calculateProgressPercent(workflows = {}) {
  const normalized = {
    sales_otp: workflows?.sales_otp || workflows?.sales || null,
    finance: workflows?.finance || workflows?.finance_cash || workflows?.finance_bond || workflows?.finance_hybrid || null,
    transfer: workflows?.transfer || null,
    registration: workflows?.registration || null,
  }

  let weightedTotal = 0

  for (const [workflowKey, { ratio, status } = {}] of Object.entries(normalized)) {
    const weight = WORKFLOW_PROGRESS_WEIGHTS[workflowKey] || 0
    if (!weight || !normalized[workflowKey]) {
      weightedTotal += 0
      continue
    }

    const normalizedStatus = String(status || '').trim().toLowerCase()
    const normalizedRatio =
      ['skipped', 'ready_for_handoff', 'complete'].includes(normalizedStatus)
        ? 1
        : Number.isFinite(ratio)
          ? ratio
          : calculateWorkflowCompletionRatio(normalized[workflowKey].requiredSteps || [])
    weightedTotal += weight * normalizedRatio
  }

  return toFinitePercent(weightedTotal)
}

export function buildWorkflowCompletionSnapshot(workflows = {}) {
  const result = {}
  for (const [key, workflow] of Object.entries(workflows)) {
    result[key] = {
      requiredSteps: Array.isArray(workflow?.requiredSteps) ? workflow.requiredSteps.length : 0,
      completionRatio: Number((workflow?.completionRatio || calculateWorkflowCompletion(workflow)).toFixed(4)),
    }
  }
  return result
}
