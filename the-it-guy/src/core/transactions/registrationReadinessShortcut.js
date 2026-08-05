import { isBondFinanceType, normalizeFinanceType } from './financeType.js'

export const REGISTRATION_READINESS_SHORTCUT_VERSION = 'arch9_registration_readiness_shortcut_v1'

const COMPLETE_STATUSES = new Set(['complete', 'completed', 'ready', 'ready_for_handoff', 'accepted', 'approved'])
const REGISTERED_STATUSES = new Set(['registered', 'complete', 'completed'])

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase().replace(/\s+/g, '_')
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function truthy(value) {
  if (value === true) return true
  if (typeof value === 'number') return value > 0
  return ['true', 'yes', 'y', '1', 'required'].includes(lower(value))
}

function getWorkflow(workflows = {}, workflowKey = '') {
  return workflows?.[workflowKey] || workflows?.[lower(workflowKey)] || null
}

function getStep(workflow = {}, stepKey = '') {
  return (workflow?.requiredSteps || workflow?.steps || []).find((step) => lower(step.key || step.stepKey || step.step_key) === lower(stepKey)) || null
}

function isComplete(value) {
  return COMPLETE_STATUSES.has(lower(value))
}

function workflowReady(workflow = null, stepKey = '') {
  if (!workflow) return false
  if (workflow.required === false) return true
  if (workflow.readyForHandoff === true || workflow.ready_for_handoff === true) return true
  if (isComplete(workflow.status)) return true
  if (stepKey && isComplete(getStep(workflow, stepKey)?.status)) return true
  return false
}

function blocker({
  code,
  message,
  workflowKey,
  stepKey,
  ownerRole = 'attorney',
  severity = 'hard',
  sourceBlockers = [],
} = {}) {
  const source = (sourceBlockers || []).find((item) => text(item?.message))
  return {
    code,
    message: source?.message || message,
    severity: source?.severity || severity,
    ownerRole: source?.ownerRole || source?.owner_role || ownerRole,
    workflowKey: source?.workflowKey || source?.workflow_key || workflowKey,
    stepKey: source?.stepKey || source?.step_key || stepKey,
    requiredEvidence: source?.requiredEvidence || source?.required_evidence || [],
  }
}

function buildCheck(key, label, ready, detail, action = '') {
  return {
    key,
    label,
    status: ready ? 'ready' : 'blocked',
    ready,
    detail,
    action,
  }
}

function isRegistered(transaction = {}, registrationWorkflow = null) {
  return Boolean(
    firstText(transaction.registered_at, transaction.registeredAt, transaction.registration_date, transaction.registrationDate) ||
      REGISTERED_STATUSES.has(lower(transaction.lifecycle_state || transaction.lifecycleState)) ||
      REGISTERED_STATUSES.has(lower(transaction.current_main_stage || transaction.currentMainStage)) ||
      isComplete(getStep(registrationWorkflow, 'registration_confirmed')?.status),
  )
}

function requiresCancellation(transaction = {}, workflow = null) {
  if (workflow?.required === true) return true
  if (workflow?.required === false) return false
  return truthy(transaction.seller_has_existing_bond) || truthy(transaction.existing_bond) || truthy(transaction.cancellation_required)
}

function requiresAttorneyBond(transaction = {}, workflow = null) {
  if (workflow?.required === true) return true
  if (workflow?.required === false) return false
  return isBondFinanceType(normalizeFinanceType(transaction.finance_type || transaction.financeType || 'cash', { allowUnknown: true }))
}

export function buildRegistrationReadinessShortcut({ transaction = {}, workflows = {}, rollup = null } = {}) {
  const registrationWorkflow = getWorkflow(workflows, 'registration')
  const transferWorkflow = getWorkflow(workflows, 'attorney_transfer')
  const bondWorkflow = getWorkflow(workflows, 'attorney_bond')
  const cancellationWorkflow = getWorkflow(workflows, 'seller_bond_cancellation')
  const transactionId = firstText(transaction.id, transaction.transactionId, rollup?.transactionId)
  const registered = isRegistered(transaction, registrationWorkflow)
  const bondRequired = requiresAttorneyBond(transaction, bondWorkflow)
  const cancellationRequired = requiresCancellation(transaction, cancellationWorkflow)

  const transferReady = workflowReady(transferWorkflow, 'lodged')
  const bondReady = !bondRequired || workflowReady(bondWorkflow, 'lodged')
  const cancellationReady = !cancellationRequired || workflowReady(cancellationWorkflow, 'lodged')
  const allRequiredMattersLodged =
    isComplete(getStep(registrationWorkflow, 'all_required_matters_lodged')?.status) ||
    (transferReady && bondReady && cancellationReady)

  const checks = [
    buildCheck(
      'transfer_lodged',
      'Transfer lodged',
      transferReady,
      transferReady ? 'Transfer matter is lodged.' : 'Transfer matter is not lodged yet.',
      'Complete transfer lodgement before registration.',
    ),
  ]

  if (bondRequired) {
    checks.push(
      buildCheck(
        'bond_lodged',
        'Bond lodged',
        bondReady,
        bondReady ? 'Bond registration matter is lodged.' : 'Bond registration matter is not lodged yet.',
        'Complete bond attorney lodgement before registration.',
      ),
    )
  }

  if (cancellationRequired) {
    checks.push(
      buildCheck(
        'cancellation_lodged',
        'Cancellation lodged',
        cancellationReady,
        cancellationReady ? 'Seller bond cancellation is lodged.' : 'Seller bond cancellation is not lodged yet.',
        'Complete cancellation lodgement before registration.',
      ),
    )
  }

  checks.push(
    buildCheck(
      'all_required_matters_lodged',
      'All required matters lodged',
      allRequiredMattersLodged,
      allRequiredMattersLodged
        ? 'All required legal lanes are lodged and registration can be prepared.'
        : 'One or more required legal lanes must still be lodged before registration.',
      'Finish outstanding legal lodgements before marking registration ready.',
    ),
  )

  const blockers = []
  if (!transferReady) {
    blockers.push(
      blocker({
        code: 'TRANSFER_NOT_LODGED',
        message: 'Transfer matter must be lodged before registration can proceed.',
        workflowKey: 'attorney_transfer',
        stepKey: 'lodged',
        sourceBlockers: transferWorkflow?.blockers || [],
      }),
    )
  }
  if (bondRequired && !bondReady) {
    blockers.push(
      blocker({
        code: 'BOND_NOT_LODGED',
        message: 'Bond registration matter must be lodged before registration can proceed.',
        workflowKey: 'attorney_bond',
        stepKey: 'lodged',
        ownerRole: 'bond_attorney',
        sourceBlockers: bondWorkflow?.blockers || [],
      }),
    )
  }
  if (cancellationRequired && !cancellationReady) {
    blockers.push(
      blocker({
        code: 'CANCELLATION_NOT_LODGED',
        message: 'Seller bond cancellation must be lodged before registration can proceed.',
        workflowKey: 'seller_bond_cancellation',
        stepKey: 'lodged',
        ownerRole: 'cancellation_attorney',
        sourceBlockers: cancellationWorkflow?.blockers || [],
      }),
    )
  }
  if (!allRequiredMattersLodged && !blockers.length) {
    blockers.push(
      blocker({
        code: 'ALL_REQUIRED_MATTERS_NOT_LODGED',
        message: 'All required attorney matters must be lodged before registration can proceed.',
        workflowKey: 'registration',
        stepKey: 'all_required_matters_lodged',
      }),
    )
  }

  const ready = registered || allRequiredMattersLodged
  const status = registered ? 'registered' : ready ? 'ready_for_registration' : 'blocked'
  const nextAction = blockers[0]
    ? {
        label: checks.find((check) => !check.ready)?.label || 'Registration blocked',
        detail: blockers[0].message,
        action: checks.find((check) => !check.ready)?.action || 'Resolve registration blockers.',
      }
    : registered
      ? null
      : {
          label: 'Capture registration confirmation',
          detail: 'Registration prerequisites are ready.',
          action: 'Capture registration date, title deed number, and confirmation evidence.',
        }

  return {
    version: REGISTRATION_READINESS_SHORTCUT_VERSION,
    transactionId: transactionId || null,
    status,
    ready,
    registered,
    allRequiredMattersLodged,
    requiredLanes: {
      transfer: true,
      bond: bondRequired,
      cancellation: cancellationRequired,
    },
    checks,
    blockers,
    nextAction,
  }
}

export function buildRegistrationReadinessBlockers(input = {}) {
  const shortcut = buildRegistrationReadinessShortcut(input)
  return shortcut.ready ? [] : shortcut.blockers
}
