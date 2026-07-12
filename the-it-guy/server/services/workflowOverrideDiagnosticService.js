import {
  WORKFLOW_COMPLETION_MODES,
  WORKFLOW_OVERRIDE_ACTIONS,
  normalizeWorkflowCompletionMode,
} from '../../src/core/workflows/overrideContract.js'
import {
  getTransactionWorkflowDefinition,
  listTransactionWorkflowKeys,
  resolveWorkflowKeysForTransaction,
} from '../workflows/transactionWorkflowDefinitions.js'
import {
  resolveWorkflowEvidenceMappings,
  workflowEvidenceMappings,
} from '../workflows/workflowEvidenceMappings.js'
import { listWorkflowActionDescriptors } from './workflowActionAvailabilityService.js'

export const WORKFLOW_OVERRIDE_DIAGNOSTIC_VERSION = 'workflow_override_diagnostic_v1'
export const WORKFLOW_OVERRIDE_HEALTH_REPORT_VERSION = 'workflow_override_health_report_v1'

export const WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES = Object.freeze({
  digital: 'digital',
  manualUploaded: WORKFLOW_COMPLETION_MODES.manualUploaded,
  agentAssisted: 'agent_assisted',
  waived: WORKFLOW_COMPLETION_MODES.waived,
  reopened: WORKFLOW_COMPLETION_MODES.reopened,
  replaced: 'replaced',
})

export const WORKFLOW_OVERRIDE_HEALTH_RISK_CODES = Object.freeze({
  diagnosticMissingOverridePath: 'DIAGNOSTIC_MISSING_OVERRIDE_PATH',
  waiverActionCompletionEvent: 'WAIVER_ACTION_COMPLETION_EVENT',
  waiverOverrideMissingAuditMetadata: 'WAIVER_OVERRIDE_MISSING_AUDIT_METADATA',
  waiverAuditMissingMetadata: 'WAIVER_AUDIT_MISSING_METADATA',
})

const MODE_KEYS = Object.freeze(Object.values(WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES))
const UPLOAD_STATUS_KEYS = new Set(['uploaded', 'received', 'under_review'])
const REPLACEMENT_STATUS_KEYS = new Set(['removed', 'expired', 'rejected', 'superseded'])
const WAIVER_OVERRIDE_TYPES = new Set([
  WORKFLOW_OVERRIDE_ACTIONS.forceWaive,
  WORKFLOW_OVERRIDE_ACTIONS.forceNotApplicable,
])
const WORKFLOW_ACTION_EXCEPTION_COMPLETION_MODES = new Set([
  WORKFLOW_COMPLETION_MODES.waived,
  WORKFLOW_COMPLETION_MODES.skipped,
])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))]
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function stepMapKey(workflowKey = '', stepKey = '') {
  return `${normalizeText(workflowKey)}.${normalizeText(stepKey)}`
}

function includesAny(values = [], candidates = new Set()) {
  return (values || []).map(normalizeKey).some((value) => candidates.has(value))
}

function createModeSupport() {
  return MODE_KEYS.reduce((accumulator, mode) => {
    accumulator[mode] = {
      supported: false,
      sources: [],
    }
    return accumulator
  }, {})
}

function addSupport(support = {}, mode = '', source = {}) {
  if (!support[mode]) return
  support[mode].supported = true
  support[mode].sources.push(source)
}

function slimActionDescriptor(descriptor = {}) {
  return {
    type: 'workflow_action',
    actionKey: descriptor.actionKey,
    label: descriptor.label,
    actionContext: descriptor.actionContext || null,
    executionMode: descriptor.executionMode || 'workflow',
    targetStatus: descriptor.targetStatus || null,
    targetParentStage: descriptor.targetParentStage || null,
  }
}

function slimEvidenceMapping(mapping = {}) {
  return {
    type: 'evidence_mapping',
    evidenceKey: mapping.evidenceKey,
    completeOn: mapping.completeOn || [],
    pendingOn: mapping.pendingOn || [],
    blockedOn: mapping.blockedOn || [],
    reopenOn: mapping.reopenOn || [],
  }
}

function buildSyntheticWorkflowMap(workflowKeys = []) {
  return workflowKeys.reduce((accumulator, workflowKey) => {
    const definition = getTransactionWorkflowDefinition(workflowKey)
    if (!definition) return accumulator
    accumulator[workflowKey] = {
      workflowKey,
      parentStage: definition.parentStage,
      requiredSteps: (definition.steps || []).map((step) => ({
        key: step.key,
        stepKey: step.key,
        label: step.label,
        stepLabel: step.label,
        ownerRole: step.ownerRole,
        status: 'pending',
        required: step.required !== false,
        blocking: step.blocking !== false,
      })),
    }
    return accumulator
  }, {})
}

function resolveDiagnosticWorkflowKeys(transaction = {}, workflowKeys = null) {
  const explicitKeys = Array.isArray(workflowKeys) ? workflowKeys.map(normalizeText).filter(Boolean) : []
  if (explicitKeys.length) return unique(explicitKeys)

  if (transaction && Object.keys(transaction).length) {
    return unique(resolveWorkflowKeysForTransaction(transaction))
  }

  return listTransactionWorkflowKeys()
}

function resolveEvidenceCoverageByStep(transaction = {}) {
  const coverage = new Map()

  for (const evidenceKey of Object.keys(workflowEvidenceMappings)) {
    const rules = resolveWorkflowEvidenceMappings({ evidenceKey, transaction })
    for (const rule of rules) {
      if (!rule?.workflowKey || !rule?.stepKey) continue
      const key = stepMapKey(rule.workflowKey, rule.stepKey)
      if (!coverage.has(key)) coverage.set(key, [])
      coverage.get(key).push({
        evidenceKey,
        workflowKey: rule.workflowKey,
        stepKey: rule.stepKey,
        completeOn: rule.completeOn || [],
        pendingOn: rule.pendingOn || [],
        blockedOn: rule.blockedOn || [],
        reopenOn: rule.reopenOn || [],
      })
    }
  }

  return coverage
}

function resolveActionCoverageByStep(transaction = {}, workflowKeys = []) {
  const workflows = buildSyntheticWorkflowMap(workflowKeys)
  const descriptors = new Map()

  for (const workflowKey of workflowKeys) {
    const definition = getTransactionWorkflowDefinition(workflowKey)
    if (!definition) continue
    const state = {
      transaction,
      parentStage: definition.parentStage,
      activeWorkflowKey: workflowKey,
      activeWorkflow: { workflowKey },
      rollup: {
        activeWorkflowKey: workflowKey,
        parentStage: definition.parentStage,
      },
      workflows,
    }

    for (const descriptor of listWorkflowActionDescriptors(state)) {
      if (!descriptor?.workflowKey || !descriptor?.stepKey || descriptor.transactionOnly) continue
      const descriptorKey = [
        descriptor.actionKey,
        descriptor.workflowKey,
        descriptor.stepKey,
        descriptor.targetStatus,
      ].join(':')
      descriptors.set(descriptorKey, descriptor)
    }
  }

  const coverage = new Map()
  for (const descriptor of descriptors.values()) {
    const key = stepMapKey(descriptor.workflowKey, descriptor.stepKey)
    if (!coverage.has(key)) coverage.set(key, [])
    coverage.get(key).push(descriptor)
  }

  return coverage
}

function applyEvidenceSupport(support = {}, mappings = []) {
  for (const mapping of mappings) {
    const source = slimEvidenceMapping(mapping)
    if ((mapping.completeOn || []).length) {
      addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.digital, source)
    }
    if (includesAny([...(mapping.completeOn || []), ...(mapping.pendingOn || [])], UPLOAD_STATUS_KEYS)) {
      addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.manualUploaded, source)
    }
    if ((mapping.completeOn || []).map(normalizeKey).some((status) => ['waived', 'not_applicable'].includes(status))) {
      addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.waived, source)
    }
    if ((mapping.reopenOn || []).length) {
      addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.reopened, source)
    }
    if (includesAny([...(mapping.reopenOn || []), ...(mapping.blockedOn || [])], REPLACEMENT_STATUS_KEYS)) {
      addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.replaced, source)
    }
  }
}

function applyActionSupport(support = {}, actions = []) {
  for (const descriptor of actions) {
    const source = slimActionDescriptor(descriptor)
    const actionContext = normalizeKey(descriptor.actionContext)
    const actionKey = normalizeKey(descriptor.actionKey)
    const executionMode = normalizeKey(descriptor.executionMode)
    const targetStatus = normalizeKey(descriptor.targetStatus)

    if (
      executionMode === 'external' ||
      actionContext === 'task_update' ||
      Boolean(descriptor.targetParentStage) ||
      actionKey.startsWith('record_signed')
    ) {
      addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.digital, source)
    }
    if (
      actionContext.includes('manual') ||
      actionContext.includes('paper') ||
      actionContext.includes('physical') ||
      actionContext.includes('upload')
    ) {
      addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.manualUploaded, source)
    }
    if (actionContext.includes('agent_assisted')) {
      addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.agentAssisted, source)
    }
    if (targetStatus === 'pending' || actionKey.startsWith('reopen')) {
      addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.reopened, source)
    }
  }
}

function applyOverrideFallbackSupport(support = {}) {
  addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.waived, {
    type: 'workflow_override',
    overrideType: WORKFLOW_OVERRIDE_ACTIONS.forceWaive,
  })
  addSupport(support, WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.reopened, {
    type: 'workflow_override',
    overrideType: WORKFLOW_OVERRIDE_ACTIONS.forceReopen,
  })
}

function readEventPayload(event = {}) {
  return event.payload_json || event.payloadJson || event.payload || {}
}

function readAuditMetadata(audit = {}) {
  return audit.derived_from_json?.auditMetadata || audit.derivedFromJson?.auditMetadata || audit.auditMetadata || {}
}

function readTransactionId(row = {}, payload = {}) {
  return normalizeText(row.transaction_id || row.transactionId || payload.transactionId || payload.transaction_id) || null
}

function readWorkflowKey(row = {}, payload = {}) {
  return normalizeText(row.workflow_key || row.workflowKey || payload.workflowKey || payload.workflow_key)
}

function readStepKey(row = {}, payload = {}) {
  return normalizeText(row.step_key || row.stepKey || payload.stepKey || payload.step_key)
}

function isTruthy(value) {
  return value === true || normalizeKey(value) === 'true'
}

function readActionPayload(payload = {}) {
  return payload.payload && typeof payload.payload === 'object' && !Array.isArray(payload.payload)
    ? payload.payload
    : payload
}

function readOverrideType(payload = {}, row = {}) {
  return normalizeKey(payload.overrideType || payload.override_type || row.action_key || row.actionKey)
}

function readOverrideIntent(payload = {}) {
  return normalizeKey(payload.overrideIntent || payload.override_intent)
}

function readCompletionMode(payload = {}) {
  return normalizeWorkflowCompletionMode(payload.completionMode || payload.completion_mode)
}

function readWorkflowActionCompletionMode(payload = {}) {
  return readCompletionMode(readActionPayload(payload))
}

function isWorkflowOverrideEvent(event = {}, payload = readEventPayload(event)) {
  const eventType = normalizeKey(event.event_type || event.eventType)
  const source = normalizeKey(event.source)
  const overrideType = readOverrideType(payload, event)
  return (
    eventType === 'workflow_override_applied' ||
    source === 'workflow_override' ||
    Object.values(WORKFLOW_OVERRIDE_ACTIONS).includes(overrideType)
  )
}

function isWaiverOverridePayload(payload = {}, row = {}) {
  const overrideType = readOverrideType(payload, row)
  const overrideIntent = readOverrideIntent(payload)
  const completionMode = readCompletionMode(payload)
  return (
    WAIVER_OVERRIDE_TYPES.has(overrideType) ||
    overrideIntent === 'waiver_override' ||
    isTruthy(payload.waiver) ||
    completionMode === WORKFLOW_COMPLETION_MODES.waived
  )
}

function hasWaiverAuditMetadata(payload = {}) {
  return (
    readOverrideIntent(payload) === 'waiver_override' &&
    readCompletionMode(payload) === WORKFLOW_COMPLETION_MODES.waived &&
    isTruthy(payload.waiver)
  )
}

function isWaiverActionBlockedEvent(event = {}, payload = readEventPayload(event)) {
  if (normalizeKey(event.event_type || event.eventType) !== 'workflow_action_blocked') return false
  return toArray(payload.blockers).some((blocker) => blocker?.code === 'WORKFLOW_ACTION_WAIVER_REQUIRES_OVERRIDE')
}

function getHealthTransactionBucket(buckets = {}, transactionId = null) {
  const key = transactionId || 'unknown'
  if (!buckets[key]) {
    buckets[key] = {
      transactionId,
      diagnosticCount: 0,
      workflowCount: 0,
      stepCount: 0,
      requiredBlockingStepCount: 0,
      missingOverridePathCount: 0,
      manualCompletionGapCount: 0,
      replacementGapCount: 0,
      overrideEventCount: 0,
      waiverOverrideCount: 0,
      waiverOverrideMissingMetadataCount: 0,
      normalActionWaiverCompletionCount: 0,
      blockedWaiverActionAttemptCount: 0,
      waiverAuditCount: 0,
      waiverAuditMissingMetadataCount: 0,
      risks: [],
    }
  }
  return buckets[key]
}

function getHealthStepBucket(buckets = {}, workflowKey = '', stepKey = '') {
  const key = stepMapKey(workflowKey || 'unknown', stepKey || 'unknown')
  if (!buckets[key]) {
    buckets[key] = {
      workflowKey: workflowKey || null,
      stepKey: stepKey || null,
      overrideEventCount: 0,
      waiverOverrideCount: 0,
      reopenOverrideCount: 0,
      blockOverrideCount: 0,
      skipOverrideCount: 0,
      completionOverrideCount: 0,
      normalActionWaiverCompletionCount: 0,
      blockedWaiverActionAttemptCount: 0,
      waiverAuditCount: 0,
    }
  }
  return buckets[key]
}

function buildHealthRisk({
  code = '',
  severity = 'hard',
  transactionId = null,
  workflowKey = '',
  stepKey = '',
  message = '',
  source = '',
  actionKey = '',
  overrideType = '',
} = {}) {
  return {
    code,
    severity,
    transactionId,
    workflowKey: workflowKey || null,
    stepKey: stepKey || null,
    actionKey: actionKey || null,
    overrideType: overrideType || null,
    source: source || null,
    message,
  }
}

function buildStepDiagnostic({ workflowKey = '', workflow = {}, step = {}, evidenceMappings = [], actions = [] } = {}) {
  const support = createModeSupport()
  applyEvidenceSupport(support, evidenceMappings)
  applyActionSupport(support, actions)
  applyOverrideFallbackSupport(support)

  const supportedModes = MODE_KEYS.filter((mode) => support[mode].supported)
  const required = step.required !== false
  const blocking = step.blocking !== false
  const hasOverridePath = [
    WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.manualUploaded,
    WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.agentAssisted,
    WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.waived,
    WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.reopened,
    WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.replaced,
  ].some((mode) => support[mode].supported)
  const hasManualCompletionPath = [
    WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.manualUploaded,
    WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.agentAssisted,
  ].some((mode) => support[mode].supported)

  return {
    workflowKey,
    workflowLabel: workflow.label || workflowKey,
    parentStage: workflow.parentStage || null,
    stepKey: step.key,
    label: step.label || step.key,
    ownerRole: step.ownerRole || 'system',
    required,
    blocking,
    sortOrder: step.sortOrder || 0,
    supportedModes,
    support,
    evidenceMappings: evidenceMappings.map(slimEvidenceMapping),
    actions: actions.map(slimActionDescriptor),
    gaps: {
      missingOverridePath: required && blocking && !hasOverridePath,
      manualCompletionMissing: required && blocking && !hasManualCompletionPath,
      replacementMissing: required && blocking && !support[WORKFLOW_OVERRIDE_DIAGNOSTIC_MODES.replaced].supported,
    },
  }
}

export function buildWorkflowOverrideDiagnostic({
  transaction = {},
  workflowKeys = null,
  includeOptional = false,
} = {}) {
  const resolvedWorkflowKeys = resolveDiagnosticWorkflowKeys(transaction, workflowKeys)
  const evidenceCoverage = resolveEvidenceCoverageByStep(transaction)
  const actionCoverage = resolveActionCoverageByStep(transaction, resolvedWorkflowKeys)
  const workflows = []
  const steps = []

  for (const workflowKey of resolvedWorkflowKeys) {
    const workflow = getTransactionWorkflowDefinition(workflowKey)
    if (!workflow) continue
    const workflowSteps = []
    for (const step of workflow.steps || []) {
      if (!includeOptional && step.required === false && step.blocking === false) continue
      const key = stepMapKey(workflowKey, step.key)
      const diagnostic = buildStepDiagnostic({
        workflowKey,
        workflow,
        step,
        evidenceMappings: evidenceCoverage.get(key) || [],
        actions: actionCoverage.get(key) || [],
      })
      workflowSteps.push(diagnostic)
      steps.push(diagnostic)
    }
    workflows.push({
      workflowKey,
      label: workflow.label || workflowKey,
      parentStage: workflow.parentStage || null,
      steps: workflowSteps,
    })
  }

  const requiredBlockingSteps = steps.filter((step) => step.required && step.blocking)
  const missingOverridePath = requiredBlockingSteps.filter((step) => step.gaps.missingOverridePath)
  const manualCompletionMissing = requiredBlockingSteps.filter((step) => step.gaps.manualCompletionMissing)
  const replacementMissing = requiredBlockingSteps.filter((step) => step.gaps.replacementMissing)

  return {
    version: WORKFLOW_OVERRIDE_DIAGNOSTIC_VERSION,
    transactionId: normalizeText(transaction.id || transaction.transaction_id) || null,
    workflowKeys: resolvedWorkflowKeys,
    workflows,
    steps,
    summary: {
      workflowCount: workflows.length,
      stepCount: steps.length,
      requiredBlockingStepCount: requiredBlockingSteps.length,
      missingOverridePathCount: missingOverridePath.length,
      manualCompletionGapCount: manualCompletionMissing.length,
      replacementGapCount: replacementMissing.length,
      supportedModeCounts: MODE_KEYS.reduce((accumulator, mode) => {
        accumulator[mode] = steps.filter((step) => step.support[mode]?.supported).length
        return accumulator
      }, {}),
    },
    gaps: {
      missingOverridePath: missingOverridePath.map(({ workflowKey, stepKey, label }) => ({ workflowKey, stepKey, label })),
      manualCompletionMissing: manualCompletionMissing.map(({ workflowKey, stepKey, label }) => ({ workflowKey, stepKey, label })),
      replacementMissing: replacementMissing.map(({ workflowKey, stepKey, label }) => ({ workflowKey, stepKey, label })),
    },
  }
}

export function assertWorkflowOverrideDiagnosticCoverage(diagnostic = {}) {
  const missing = diagnostic.gaps?.missingOverridePath || []
  if (!missing.length) return true

  const formatted = missing.map((step) => `${step.workflowKey}.${step.stepKey}`).join(', ')
  throw new Error(`Required workflow steps are missing override/manual coverage: ${formatted}`)
}

export function buildWorkflowOverrideHealthReport({
  diagnostics = [],
  events = [],
  audits = [],
} = {}) {
  const transactionBuckets = {}
  const workflowStepBuckets = {}
  const risks = []
  const supportedModeCounts = MODE_KEYS.reduce((accumulator, mode) => {
    accumulator[mode] = 0
    return accumulator
  }, {})

  const summary = {
    diagnosticCount: 0,
    transactionCount: 0,
    workflowCount: 0,
    stepCount: 0,
    requiredBlockingStepCount: 0,
    missingOverridePathCount: 0,
    manualCompletionGapCount: 0,
    replacementGapCount: 0,
    supportedModeCounts,
    eventCount: toArray(events).length,
    overrideEventCount: 0,
    waiverOverrideCount: 0,
    reopenOverrideCount: 0,
    blockOverrideCount: 0,
    skipOverrideCount: 0,
    completionOverrideCount: 0,
    waiverOverrideMissingMetadataCount: 0,
    normalActionWaiverCompletionCount: 0,
    blockedWaiverActionAttemptCount: 0,
    auditCount: toArray(audits).length,
    waiverAuditCount: 0,
    waiverAuditMissingMetadataCount: 0,
    riskCount: 0,
    hardRiskCount: 0,
  }

  for (const diagnostic of toArray(diagnostics)) {
    summary.diagnosticCount += 1
    const transactionId = normalizeText(diagnostic.transactionId || diagnostic.transaction_id) || null
    const transactionBucket = getHealthTransactionBucket(transactionBuckets, transactionId)
    transactionBucket.diagnosticCount += 1
    transactionBucket.workflowCount += Number(diagnostic.summary?.workflowCount || 0)
    transactionBucket.stepCount += Number(diagnostic.summary?.stepCount || 0)
    transactionBucket.requiredBlockingStepCount += Number(diagnostic.summary?.requiredBlockingStepCount || 0)
    transactionBucket.missingOverridePathCount += Number(diagnostic.summary?.missingOverridePathCount || 0)
    transactionBucket.manualCompletionGapCount += Number(diagnostic.summary?.manualCompletionGapCount || 0)
    transactionBucket.replacementGapCount += Number(diagnostic.summary?.replacementGapCount || 0)

    summary.workflowCount += Number(diagnostic.summary?.workflowCount || 0)
    summary.stepCount += Number(diagnostic.summary?.stepCount || 0)
    summary.requiredBlockingStepCount += Number(diagnostic.summary?.requiredBlockingStepCount || 0)
    summary.missingOverridePathCount += Number(diagnostic.summary?.missingOverridePathCount || 0)
    summary.manualCompletionGapCount += Number(diagnostic.summary?.manualCompletionGapCount || 0)
    summary.replacementGapCount += Number(diagnostic.summary?.replacementGapCount || 0)

    for (const mode of MODE_KEYS) {
      summary.supportedModeCounts[mode] += Number(diagnostic.summary?.supportedModeCounts?.[mode] || 0)
    }

    for (const gap of toArray(diagnostic.gaps?.missingOverridePath)) {
      const risk = buildHealthRisk({
        code: WORKFLOW_OVERRIDE_HEALTH_RISK_CODES.diagnosticMissingOverridePath,
        transactionId,
        workflowKey: gap.workflowKey,
        stepKey: gap.stepKey,
        source: 'workflow_override_diagnostic',
        message: `${gap.workflowKey}.${gap.stepKey} has no override or manual recovery path.`,
      })
      risks.push(risk)
      transactionBucket.risks.push(risk)
    }
  }

  for (const event of toArray(events)) {
    const payload = readEventPayload(event)
    const transactionId = readTransactionId(event, payload)
    const workflowKey = readWorkflowKey(event, payload)
    const stepKey = readStepKey(event, payload)
    const transactionBucket = getHealthTransactionBucket(transactionBuckets, transactionId)
    const stepBucket = getHealthStepBucket(workflowStepBuckets, workflowKey, stepKey)
    const eventType = normalizeKey(event.event_type || event.eventType)

    if (isWaiverActionBlockedEvent(event, payload)) {
      summary.blockedWaiverActionAttemptCount += 1
      transactionBucket.blockedWaiverActionAttemptCount += 1
      stepBucket.blockedWaiverActionAttemptCount += 1
    }

    if (eventType === 'workflow_action_completed') {
      const completionMode = readWorkflowActionCompletionMode(payload)
      if (WORKFLOW_ACTION_EXCEPTION_COMPLETION_MODES.has(completionMode)) {
        const risk = buildHealthRisk({
          code: WORKFLOW_OVERRIDE_HEALTH_RISK_CODES.waiverActionCompletionEvent,
          transactionId,
          workflowKey,
          stepKey,
          actionKey: normalizeText(event.action_key || event.actionKey),
          source: 'transaction_workflow_events',
          message: 'Waived or skipped completion modes must not be recorded through normal workflow action completion.',
        })
        risks.push(risk)
        transactionBucket.risks.push(risk)
        summary.normalActionWaiverCompletionCount += 1
        transactionBucket.normalActionWaiverCompletionCount += 1
        stepBucket.normalActionWaiverCompletionCount += 1
      }
    }

    if (!isWorkflowOverrideEvent(event, payload)) continue

    summary.overrideEventCount += 1
    transactionBucket.overrideEventCount += 1
    stepBucket.overrideEventCount += 1

    const overrideType = readOverrideType(payload, event)
    const overrideIntent = readOverrideIntent(payload)
    if (isWaiverOverridePayload(payload, event)) {
      summary.waiverOverrideCount += 1
      transactionBucket.waiverOverrideCount += 1
      stepBucket.waiverOverrideCount += 1
      if (!hasWaiverAuditMetadata(payload)) {
        const risk = buildHealthRisk({
          code: WORKFLOW_OVERRIDE_HEALTH_RISK_CODES.waiverOverrideMissingAuditMetadata,
          transactionId,
          workflowKey,
          stepKey,
          actionKey: normalizeText(event.action_key || event.actionKey),
          overrideType,
          source: 'transaction_workflow_events',
          message: 'Waiver override event is missing overrideIntent, waived completionMode, or waiver marker metadata.',
        })
        risks.push(risk)
        transactionBucket.risks.push(risk)
        summary.waiverOverrideMissingMetadataCount += 1
        transactionBucket.waiverOverrideMissingMetadataCount += 1
      }
    }

    if (overrideIntent === 'reopen_override' || overrideType === WORKFLOW_OVERRIDE_ACTIONS.forceReopen) {
      summary.reopenOverrideCount += 1
      stepBucket.reopenOverrideCount += 1
    } else if (overrideIntent === 'block_override' || overrideType === WORKFLOW_OVERRIDE_ACTIONS.forceBlock) {
      summary.blockOverrideCount += 1
      stepBucket.blockOverrideCount += 1
    } else if (overrideIntent === 'skip_override' || overrideType === WORKFLOW_OVERRIDE_ACTIONS.forceSkip) {
      summary.skipOverrideCount += 1
      stepBucket.skipOverrideCount += 1
    } else if (overrideIntent === 'completion_override' || overrideType === WORKFLOW_OVERRIDE_ACTIONS.forceComplete) {
      summary.completionOverrideCount += 1
      stepBucket.completionOverrideCount += 1
    }
  }

  for (const audit of toArray(audits)) {
    const metadata = readAuditMetadata(audit)
    const transactionId = readTransactionId(audit, metadata)
    const workflowKey = readWorkflowKey(audit, metadata)
    const stepKey = readStepKey(audit, metadata)
    const transactionBucket = getHealthTransactionBucket(transactionBuckets, transactionId)
    const stepBucket = getHealthStepBucket(workflowStepBuckets, workflowKey, stepKey)
    const reasonCode = normalizeKey(audit.reason_code || audit.reasonCode)

    if (reasonCode !== 'step_waived' && !isWaiverOverridePayload(metadata, audit)) continue

    summary.waiverAuditCount += 1
    transactionBucket.waiverAuditCount += 1
    stepBucket.waiverAuditCount += 1

    if (!hasWaiverAuditMetadata(metadata)) {
      const risk = buildHealthRisk({
        code: WORKFLOW_OVERRIDE_HEALTH_RISK_CODES.waiverAuditMissingMetadata,
        transactionId,
        workflowKey,
        stepKey,
        overrideType: readOverrideType(metadata, audit),
        source: 'transaction_rollup_audit',
        message: 'Waiver rollup audit is missing overrideIntent, waived completionMode, or waiver marker metadata.',
      })
      risks.push(risk)
      transactionBucket.risks.push(risk)
      summary.waiverAuditMissingMetadataCount += 1
      transactionBucket.waiverAuditMissingMetadataCount += 1
    }
  }

  const transactionIds = unique([
    ...Object.values(transactionBuckets).map((bucket) => bucket.transactionId || 'unknown'),
  ])
  summary.transactionCount = transactionIds.length
  summary.riskCount = risks.length
  summary.hardRiskCount = risks.filter((risk) => risk.severity === 'hard').length

  return {
    version: WORKFLOW_OVERRIDE_HEALTH_REPORT_VERSION,
    transactionIds,
    summary,
    byTransaction: transactionBuckets,
    byWorkflowStep: workflowStepBuckets,
    risks,
  }
}

export function assertWorkflowOverrideHealthReport(report = {}) {
  const hardRisks = toArray(report.risks).filter((risk) => risk.severity === 'hard')
  if (!hardRisks.length) return true

  const formatted = hardRisks
    .map((risk) => `${risk.code}:${risk.workflowKey || 'unknown'}.${risk.stepKey || 'unknown'}`)
    .join(', ')
  throw new Error(`Workflow override health report contains hard risks: ${formatted}`)
}
