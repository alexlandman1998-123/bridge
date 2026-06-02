import { buildWorkflowBlocker } from './workflowBlockerFactory.js'
import { resolveFinanceWorkflowKey } from './financeWorkflowResolver.js'

export const PARENT_STAGE_ENUM = Object.freeze({
  SETUP: 'SETUP',
  SALES_OTP: 'SALES_OTP',
  FINANCE: 'FINANCE',
  TRANSFER: 'TRANSFER',
  REGISTRATION: 'REGISTRATION',
  COMPLETE: 'COMPLETE',
  CANCELLED: 'CANCELLED',
})

export const WORKFLOW_STATUS_ENUM = Object.freeze({
  NOT_STARTED: 'not_started',
  ACTIVE: 'active',
  BLOCKED: 'blocked',
  READY_FOR_HANDOFF: 'ready_for_handoff',
  COMPLETE: 'complete',
  READY: 'ready_for_handoff',
  CANCELLED: 'cancelled',
})

export const WORKFLOW_STATUS_COMPLETE = new Set(['complete', 'ready_for_handoff', 'skipped'])
export const WORKFLOW_STATUS_BLOCKED = new Set(['blocked', 'blocked_for_handoff'])

const MAIN_STAGE_ALIAS = Object.freeze({
  AVAIL: PARENT_STAGE_ENUM.SETUP,
  RES: PARENT_STAGE_ENUM.SETUP,
  RESERVED: PARENT_STAGE_ENUM.SETUP,
  DEP: PARENT_STAGE_ENUM.SETUP,
  OTP: PARENT_STAGE_ENUM.SALES_OTP,
  FIN: PARENT_STAGE_ENUM.FINANCE,
  FINANCE: PARENT_STAGE_ENUM.FINANCE,
  ATTY: PARENT_STAGE_ENUM.TRANSFER,
  XFER: PARENT_STAGE_ENUM.TRANSFER,
  TRANSFER: PARENT_STAGE_ENUM.TRANSFER,
  REG: PARENT_STAGE_ENUM.REGISTRATION,
  REGISTRATION: PARENT_STAGE_ENUM.REGISTRATION,
  REGISTERED: PARENT_STAGE_ENUM.REGISTRATION,
  COMPLETE: PARENT_STAGE_ENUM.COMPLETE,
  CANCELLED: PARENT_STAGE_ENUM.CANCELLED,
  ARCHIVED: PARENT_STAGE_ENUM.CANCELLED,
})

const DETAILED_ALIAS = Object.freeze({
  AVAILABLE: PARENT_STAGE_ENUM.SETUP,
  RESERVED: PARENT_STAGE_ENUM.SETUP,
  'OTP SIGNED': PARENT_STAGE_ENUM.SALES_OTP,
  'FINANCE PENDING': PARENT_STAGE_ENUM.FINANCE,
  'BOND APPROVED / PROOF OF FUNDS': PARENT_STAGE_ENUM.FINANCE,
  'PROCEED TO ATTORNEYS': PARENT_STAGE_ENUM.TRANSFER,
  'TRANSFER IN PROGRESS': PARENT_STAGE_ENUM.TRANSFER,
  'TRANSFER LODGED': PARENT_STAGE_ENUM.TRANSFER,
  REGISTERED: PARENT_STAGE_ENUM.REGISTRATION,
  COMPLETE: PARENT_STAGE_ENUM.COMPLETE,
  CANCELLED: PARENT_STAGE_ENUM.CANCELLED,
})

function toUpper(value = '') {
  return String(value || '').trim().toUpperCase()
}

function hasHardBlocker(workflow = {}) {
  return (workflow?.blockers || []).some((blocker) => String(blocker?.severity || '').trim().toLowerCase() === 'hard')
}

function hasWorkflowProgress(workflow = {}) {
  if (!workflow || typeof workflow !== 'object') return false
  const status = String(workflow.status || '').trim().toLowerCase()
  if (['active', 'blocked', 'ready_for_handoff', 'complete'].includes(status)) return true
  if (Number(workflow.completionRatio || 0) > 0) return true
  if (Array.isArray(workflow.requiredSteps)) {
    return workflow.requiredSteps.some((step) => ['pending', 'blocked', 'complete', 'skipped'].includes(String(step?.status || '').trim().toLowerCase()))
  }
  return false
}

export function mapLegacyStageToCanonical(parent = {}) {
  const main = toUpper(parent.currentMainStage || parent.current_main_stage || parent.mainStage || '')
  const detailed = toUpper(parent.stage || parent.detailedStage || parent.detailed_stage || '')

  if (MAIN_STAGE_ALIAS[main]) return MAIN_STAGE_ALIAS[main]
  if (DETAILED_ALIAS[detailed]) return DETAILED_ALIAS[detailed]
  if (parent.lifecycleState && /cancelled|archived|abandoned/.test(String(parent.lifecycleState).toLowerCase())) return PARENT_STAGE_ENUM.CANCELLED
  if (parent.lifecycle_state && /cancelled|archived|abandoned/.test(String(parent.lifecycle_state).toLowerCase())) return PARENT_STAGE_ENUM.CANCELLED

  return PARENT_STAGE_ENUM.SETUP
}

export function isWorkflowComplete(workflow = {}) {
  if (!workflow || typeof workflow !== 'object') return false
  return WORKFLOW_STATUS_COMPLETE.has(String(workflow.status || '').trim().toLowerCase())
}

export function hasCancelledWorkflow(workflows = {}) {
  return Object.values(workflows || {}).some((workflow) => String(workflow?.status || '').trim().toLowerCase() === 'cancelled')
}

export function hasNormalizedWorkflowData(workflows = {}) {
  return Object.values(workflows || {}).some((workflow) => workflow && typeof workflow === 'object' && (Array.isArray(workflow.requiredSteps) || workflow.status || workflow.workflowKey))
}

function buildUnknownFinanceWorkflow() {
  return {
    workflowKey: 'finance_unknown',
    required: true,
    status: WORKFLOW_STATUS_ENUM.BLOCKED,
    completionRatio: 0,
    requiredSteps: [
      {
        key: 'finance_type_confirmed',
        stepKey: 'finance_type_confirmed',
        label: 'Finance type confirmed',
        stepLabel: 'Finance type confirmed',
        required: true,
        blocking: true,
        status: 'pending',
        ownerRole: 'agent',
        actionKey: 'CONFIRM_FINANCE_TYPE',
        nextActionLabel: 'Confirm finance type',
        requiredEvidence: [],
      },
    ],
    blockers: [
      buildWorkflowBlocker({
        code: 'FINANCE_TYPE_REQUIRED',
        message: 'Finance type is required before the correct Finance workflow can start.',
        severity: 'hard',
        ownerRole: 'agent',
        workflowKey: 'finance_unknown',
        stepKey: 'finance_type_confirmed',
      }),
    ],
  }
}

export function getActiveFinanceWorkflow(transaction = {}, workflows = {}) {
  const activeWorkflowKey = resolveFinanceWorkflowKey(transaction)
  const parentFinanceWorkflow =
    workflows.finance && workflows.finance.workflowKey === activeWorkflowKey
      ? workflows.finance
      : null

  if (activeWorkflowKey === 'finance_unknown') {
    return workflows.finance_unknown || parentFinanceWorkflow || buildUnknownFinanceWorkflow()
  }
  return workflows[activeWorkflowKey] || parentFinanceWorkflow || buildUnknownFinanceWorkflow()
}

export function deriveParentStage({ transaction = {}, workflows = {} } = {}) {
  if (String(transaction?.status || '').trim().toLowerCase() === 'cancelled') {
    return PARENT_STAGE_ENUM.CANCELLED
  }
  if (String(transaction?.lifecycle_state || transaction?.lifecycleState || '').trim().toLowerCase() === 'cancelled') {
    return PARENT_STAGE_ENUM.CANCELLED
  }
  if (hasCancelledWorkflow(workflows)) {
    return PARENT_STAGE_ENUM.CANCELLED
  }

  if (!hasNormalizedWorkflowData(workflows)) {
    return mapLegacyStageToCanonical(transaction)
  }

  const salesWorkflow = workflows.sales_otp || workflows.sales || null
  if (!salesWorkflow || !isWorkflowComplete(salesWorkflow)) {
    if (!salesWorkflow || !hasWorkflowProgress(salesWorkflow)) {
      const legacyStage = mapLegacyStageToCanonical(transaction)
      if (legacyStage === PARENT_STAGE_ENUM.SETUP) return PARENT_STAGE_ENUM.SETUP
    }
    return PARENT_STAGE_ENUM.SALES_OTP
  }

  const financeWorkflow = getActiveFinanceWorkflow(transaction, workflows)
  if (financeWorkflow?.required !== false && !isWorkflowComplete(financeWorkflow)) {
    return PARENT_STAGE_ENUM.FINANCE
  }

  const transferWorkflow = workflows.transfer || workflows.attorney_transfer || null
  if (!transferWorkflow || !isWorkflowComplete(transferWorkflow)) {
    return PARENT_STAGE_ENUM.TRANSFER
  }

  const registrationWorkflow = workflows.registration || null
  if (!registrationWorkflow || !isWorkflowComplete(registrationWorkflow)) {
    return PARENT_STAGE_ENUM.REGISTRATION
  }

  return PARENT_STAGE_ENUM.COMPLETE
}

export function resolveParentStage(workflows = {}, transaction = {}) {
  return deriveParentStage({ transaction, workflows })
}

export function deriveParentStatusFromRules({ parentStage, workflows = {}, activeWorkflow = null, blockers = [] }) {
  if (parentStage === PARENT_STAGE_ENUM.CANCELLED) {
    return WORKFLOW_STATUS_ENUM.CANCELLED
  }

  if (parentStage === PARENT_STAGE_ENUM.COMPLETE) {
    return WORKFLOW_STATUS_ENUM.COMPLETE
  }

  if (!activeWorkflow) {
    return WORKFLOW_STATUS_ENUM.NOT_STARTED
  }

  if (String(activeWorkflow.status || '').trim().toLowerCase() === WORKFLOW_STATUS_ENUM.BLOCKED) {
    return WORKFLOW_STATUS_ENUM.BLOCKED
  }

  if ((blockers || []).some((blocker) => String(blocker?.severity || '').trim().toLowerCase() === 'hard')) {
    return WORKFLOW_STATUS_ENUM.BLOCKED
  }

  if (hasHardBlocker(activeWorkflow)) {
    return WORKFLOW_STATUS_ENUM.BLOCKED
  }

  if (['ready_for_handoff', 'complete'].includes(String(activeWorkflow.status || '').trim().toLowerCase())) {
    return WORKFLOW_STATUS_ENUM.READY_FOR_HANDOFF
  }

  if (String(activeWorkflow.status || '').trim().toLowerCase() === WORKFLOW_STATUS_ENUM.NOT_STARTED) {
    return WORKFLOW_STATUS_ENUM.NOT_STARTED
  }

  return WORKFLOW_STATUS_ENUM.ACTIVE
}

export function collectCompletedStages(workflows = {}, transaction = {}) {
  const completed = []
  if (isWorkflowComplete(workflows.sales_otp || workflows.sales || {})) {
    completed.push(PARENT_STAGE_ENUM.SALES_OTP)
  }
  if (isWorkflowComplete(getActiveFinanceWorkflow(transaction, workflows))) {
    completed.push(PARENT_STAGE_ENUM.FINANCE)
  }
  if (isWorkflowComplete(workflows.transfer || workflows.attorney_transfer || {})) {
    completed.push(PARENT_STAGE_ENUM.TRANSFER)
  }
  if (isWorkflowComplete(workflows.registration || {})) {
    completed.push(PARENT_STAGE_ENUM.REGISTRATION)
  }
  return completed
}

export function collectBlockedStages(workflows = {}, transaction = {}) {
  const blocked = []
  const sales = workflows.sales_otp || workflows.sales || {}
  const finance = getActiveFinanceWorkflow(transaction, workflows)
  const transfer = workflows.transfer || workflows.attorney_transfer || {}
  const registration = workflows.registration || {}

  if (String(sales.status || '').trim().toLowerCase() === 'blocked' || hasHardBlocker(sales)) {
    blocked.push(PARENT_STAGE_ENUM.SALES_OTP)
  }
  if (String(finance.status || '').trim().toLowerCase() === 'blocked' || hasHardBlocker(finance)) {
    blocked.push(PARENT_STAGE_ENUM.FINANCE)
  }
  if (String(transfer.status || '').trim().toLowerCase() === 'blocked' || hasHardBlocker(transfer)) {
    blocked.push(PARENT_STAGE_ENUM.TRANSFER)
  }
  if (String(registration.status || '').trim().toLowerCase() === 'blocked' || hasHardBlocker(registration)) {
    blocked.push(PARENT_STAGE_ENUM.REGISTRATION)
  }
  return blocked
}

export function resolveActiveWorkflow(workflows = {}, transaction = {}, order = ['sales_otp', 'finance', 'transfer', 'registration']) {
  const resolved = {
    sales_otp: workflows.sales_otp || workflows.sales || null,
    finance: getActiveFinanceWorkflow(transaction, workflows),
    transfer: workflows.transfer || workflows.attorney_transfer || null,
    registration: workflows.registration || null,
  }

  for (const key of order) {
    const workflow = resolved[key] || null
    if (!workflow || typeof workflow !== 'object') continue
    if (!isWorkflowComplete(workflow)) {
      return { key, workflow }
    }
  }

  return null
}

export function resolveWithFallback(transaction = {}, workflows = {}, deriveFn = deriveParentStage) {
  if (hasNormalizedWorkflowData(workflows)) {
    return {
      usedLegacyFallback: false,
      value: deriveFn({ transaction, workflows }),
    }
  }

  return {
    usedLegacyFallback: true,
    value: mapLegacyStageToCanonical(transaction),
  }
}

export function mapLegacyStage(workflow) {
  return mapLegacyStageToCanonical(workflow || {})
}
