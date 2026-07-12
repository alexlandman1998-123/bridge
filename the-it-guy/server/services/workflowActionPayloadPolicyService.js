import {
  WORKFLOW_COMPLETION_MODES,
  normalizeWorkflowCompletionMode,
} from '../../src/core/workflows/overrideContract.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function readPayloadText(payload = {}, keys = []) {
  for (const key of keys) {
    const value = normalizeText(payload?.[key])
    if (value) return value
  }
  return ''
}

function buildPolicyBlocker({
  code = '',
  message = '',
  descriptor = {},
} = {}) {
  return {
    code,
    message,
    severity: 'hard',
    ownerRole: descriptor.ownerRole || 'agent',
    workflowKey: descriptor.workflowKey || '',
    stepKey: descriptor.stepKey || undefined,
    requiredEvidence: [],
  }
}

function resolveExpectedCompletionMode(descriptor = {}) {
  const actionContext = normalizeKey(descriptor.actionContext)
  if (actionContext.includes('agent_assisted')) {
    return WORKFLOW_COMPLETION_MODES.agentAssistedCompleted
  }
  if (
    actionContext.includes('manual') ||
    actionContext.includes('paper') ||
    actionContext.includes('physical') ||
    actionContext.includes('upload')
  ) {
    return WORKFLOW_COMPLETION_MODES.manualUploaded
  }
  return ''
}

export function isNonDigitalWorkflowAction(descriptor = {}) {
  return Boolean(resolveExpectedCompletionMode(descriptor))
}

export function buildNonDigitalWorkflowActionPayloadBlockers(descriptor = {}, payload = {}) {
  const expectedCompletionMode = resolveExpectedCompletionMode(descriptor)
  if (!expectedCompletionMode) return []

  const blockers = []
  const ownerRole = descriptor.ownerRole || 'agent'
  const workflowKey = descriptor.workflowKey || ''
  const stepKey = descriptor.stepKey || undefined

  if (!readPayloadText(payload, ['reason', 'auditReason', 'audit_reason'])) {
    blockers.push(buildPolicyBlocker({
      code: 'WORKFLOW_ACTION_AUDIT_REASON_REQUIRED',
      message: 'A reason is required when recording a manual or agent-assisted workflow action.',
      descriptor: { ownerRole, workflowKey, stepKey },
    }))
  }

  if (!readPayloadText(payload, ['captureMethod', 'capture_method'])) {
    blockers.push(buildPolicyBlocker({
      code: 'WORKFLOW_ACTION_CAPTURE_METHOD_REQUIRED',
      message: 'Capture method is required when recording a manual or agent-assisted workflow action.',
      descriptor: { ownerRole, workflowKey, stepKey },
    }))
  }

  if (!readPayloadText(payload, ['clientConsentMethod', 'client_consent_method', 'consentMethod', 'consent_method'])) {
    blockers.push(buildPolicyBlocker({
      code: 'WORKFLOW_ACTION_CLIENT_CONSENT_METHOD_REQUIRED',
      message: 'Client consent method is required when recording a manual or agent-assisted workflow action.',
      descriptor: { ownerRole, workflowKey, stepKey },
    }))
  }

  const completionMode = normalizeWorkflowCompletionMode(
    readPayloadText(payload, ['completionMode', 'completion_mode']),
  )
  if (!completionMode) {
    blockers.push(buildPolicyBlocker({
      code: 'WORKFLOW_ACTION_COMPLETION_MODE_REQUIRED',
      message: 'Completion mode is required when recording a manual or agent-assisted workflow action.',
      descriptor: { ownerRole, workflowKey, stepKey },
    }))
  } else if (completionMode !== expectedCompletionMode) {
    blockers.push(buildPolicyBlocker({
      code: 'WORKFLOW_ACTION_COMPLETION_MODE_INVALID',
      message: `Completion mode must be ${expectedCompletionMode} for this workflow action.`,
      descriptor: { ownerRole, workflowKey, stepKey },
    }))
  }

  return blockers
}

export function buildWorkflowActionWaiverSeparationBlockers(descriptor = {}, payload = {}) {
  const completionMode = normalizeWorkflowCompletionMode(
    readPayloadText(payload, ['completionMode', 'completion_mode']),
  )
  if (
    completionMode !== WORKFLOW_COMPLETION_MODES.waived &&
    completionMode !== WORKFLOW_COMPLETION_MODES.skipped
  ) {
    return []
  }

  return [
    buildPolicyBlocker({
      code: 'WORKFLOW_ACTION_WAIVER_REQUIRES_OVERRIDE',
      message: 'Waivers must be recorded through the manual override waiver path, not as workflow action completion.',
      descriptor,
    }),
  ]
}
