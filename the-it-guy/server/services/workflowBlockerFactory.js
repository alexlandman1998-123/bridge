export function normalizeOwnerRole(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()

  if (['agent', 'attorney', 'buyer', 'seller', 'conveyancer', 'bank', 'system'].includes(normalized)) {
    return normalized
  }

  return 'system'
}

export function normalizeSeverity(value) {
  const normalized = String(value || '').trim().toLowerCase()

  if (normalized === 'soft') return 'soft'
  if (normalized === 'hard') return 'hard'
  return 'hard'
}

export function normalizeEvidenceKeys(values = []) {
  return [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))]
}

function normalizeStepLabel(step = {}) {
  return String(step.stepLabel || step.label || step.step_key || step.key || '')
    .trim()
}

function normalizeStepKey(step = {}) {
  return String(step.stepKey || step.step_key || step.key || '')
    .trim()
}

export function buildWorkflowBlocker({
  code = '',
  message = '',
  ownerRole = 'system',
  workflowKey = '',
  stepKey = '',
  requiredEvidence = [],
  severity = 'hard',
} = {}) {
  return {
    code: String(code || '').trim().toUpperCase() || 'UNKNOWN_BLOCKER',
    message: String(message || '').trim() || 'Workflow blocked.',
    severity: normalizeSeverity(severity),
    ownerRole: normalizeOwnerRole(ownerRole),
    workflowKey: String(workflowKey || '').trim(),
    stepKey: stepKey ? String(stepKey) : undefined,
    requiredEvidence: normalizeEvidenceKeys(requiredEvidence),
  }
}

export function buildBlockerFromStep(workflow = {}, step = {}, overrides = {}) {
  const stepKey = normalizeStepKey(step)
  const stepLabel = normalizeStepLabel(step) || 'workflow step'
  const workflowKey = String(overrides.workflowKey || workflow.workflowKey || workflow.workflow_key || '').trim()
  return buildWorkflowBlocker({
    code:
      overrides.code ||
      `${workflowKey || 'workflow'}_${stepKey || 'step'}_required`,
    message:
      overrides.message ||
      `${stepLabel} must be completed before this workflow can continue.`,
    ownerRole: overrides.ownerRole || step.ownerRole || step.owner_role || workflow.ownerRole || 'system',
    workflowKey,
    stepKey,
    requiredEvidence: overrides.requiredEvidence || step.requiredEvidence || [],
    severity: overrides.severity || 'hard',
  })
}

export function deriveWorkflowBlockers(workflow = {}, options = {}) {
  const steps = Array.isArray(workflow?.requiredSteps)
    ? workflow.requiredSteps
    : Array.isArray(workflow?.steps)
      ? workflow.steps
      : []

  return steps
    .filter((step) => {
      const status = String(step?.status || '').trim().toLowerCase()
      const required = step?.required !== false
      const blocking = step?.blocking !== false
      return required && blocking && !['complete', 'skipped', 'not_applicable'].includes(status)
    })
    .map((step) =>
      buildBlockerFromStep(workflow, step, {
        severity: options.severity || 'hard',
      }),
    )
}

export function buildBlockersFromMap(blockerMap = {}) {
  const list = []

  for (const [workflowKey, blockers] of Object.entries(blockerMap || {})) {
    if (!Array.isArray(blockers)) continue
    for (const item of blockers) {
      list.push(
        buildWorkflowBlocker({
          ...item,
          workflowKey: item.workflowKey || workflowKey,
        }),
      )
    }
  }

  return list
}

export function dedupeBlockers(blockers = []) {
  const seen = new Set()
  const unique = []

  for (const blocker of blockers || []) {
    const key = `${String(blocker.code || '').toUpperCase()}:${String(blocker.workflowKey || '')}:${String(blocker.stepKey || '')}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(blocker)
  }

  return unique
}
