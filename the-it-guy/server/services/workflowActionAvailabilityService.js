import { normalizeRoleType } from '../../src/core/transactions/permissions.js'
import { getTransactionWorkflowDefinition } from '../workflows/transactionWorkflowDefinitions.js'
import { resolveFinanceWorkflowKey } from './financeWorkflowResolver.js'

const ACTION_GROUP_LABELS = Object.freeze({
  client: 'Client actions',
  documents: 'Document actions',
  stage: 'Stage actions',
  attorney: 'Attorney actions',
  finance: 'Finance actions',
  admin: 'Admin actions',
})

const ADMIN_ACTION_ROLES = new Set(['developer', 'internal_admin'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function isCompleteStatus(value = '') {
  return ['complete', 'skipped', 'not_applicable'].includes(normalizeKey(value))
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))]
}

function getWorkflowState(workflows = {}, workflowKey = '') {
  return workflows?.[normalizeText(workflowKey)] || workflows?.[workflowKey] || null
}

function getWorkflowDefinitionStep(workflowKey = '', stepKey = '') {
  const definition = getTransactionWorkflowDefinition(workflowKey)
  return (definition?.steps || []).find((step) => normalizeKey(step.key) === normalizeKey(stepKey)) || null
}

function getWorkflowStateStep(workflows = {}, workflowKey = '', stepKey = '') {
  const workflow = getWorkflowState(workflows, workflowKey)
  return (workflow?.requiredSteps || []).find((step) => normalizeKey(step.key || step.stepKey) === normalizeKey(stepKey)) || null
}

function getParticipantEmail(rolePlayers = [], roleType = '') {
  const normalizedRole = normalizeRoleType(roleType)
  const participant = (rolePlayers || []).find(
    (item) =>
      normalizeRoleType(item?.roleType || item?.role_type) === normalizedRole &&
      normalizeKey(item?.status || 'active') !== 'removed',
  )

  return normalizeText(participant?.participantEmail || participant?.participant_email || '')
}

function buildMissingRequirementReason(requirement = {}, actionLabel = '') {
  const label = normalizeText(requirement?.stepLabel || requirement?.label || requirement?.stepKey)
  if (!label) {
    return `${actionLabel} is not available yet.`
  }
  return `${label} is required before ${actionLabel.toLowerCase()}.`
}

function resolvePermissionReason(descriptor = {}, actorRole = '') {
  const normalizedActorRole = normalizeRoleType(actorRole || 'developer')
  if (!descriptor?.allowedRoles?.length) return null
  if (ADMIN_ACTION_ROLES.has(normalizedActorRole)) return null
  if (descriptor.allowedRoles.includes(normalizedActorRole)) return null
  return 'You do not have permission to perform this action.'
}

function resolveFinanceActionWorkflowKey(state = {}) {
  const activeWorkflowKey = normalizeText(
    state.activeWorkflow?.workflowKey ||
      state.rollup?.activeWorkflowKey ||
      state.activeWorkflowKey,
  )
  if (activeWorkflowKey.startsWith('finance_')) {
    return activeWorkflowKey
  }
  return resolveFinanceWorkflowKey(state.transaction || {})
}

function resolveFinanceReadyStepKey(state = {}) {
  return resolveFinanceActionWorkflowKey(state) === 'finance_unknown'
    ? 'finance_type_confirmed'
    : 'ready_for_transfer'
}

function resolveFinanceActionOwnerRole(state = {}) {
  const workflowKey = resolveFinanceActionWorkflowKey(state)
  const stepKey = resolveFinanceReadyStepKey(state)
  const stateStep = getWorkflowStateStep(state.workflows || {}, workflowKey, stepKey)
  const definitionStep = getWorkflowDefinitionStep(workflowKey, stepKey)
  return normalizeRoleType(stateStep?.ownerRole || definitionStep?.ownerRole || 'agent')
}

const ACTION_DEFINITIONS = Object.freeze({
  REQUEST_BUYER_DETAILS: {
    label: 'Request buyer details',
    groupKey: 'client',
    executionMode: 'external',
    workflowKey: 'sales_otp',
    stepKey: 'buyer_onboarding_complete',
    ownerRole: 'agent',
    allowedRoles: ['agent'],
    stages: ['SALES_OTP'],
    hideWhenStepComplete: true,
    reason(state = {}) {
      const buyerEmail =
        normalizeText(state.transaction?.buyer_email) ||
        normalizeText(state.transaction?.buyerEmail) ||
        getParticipantEmail(state.rolePlayers, 'buyer')
      if (!buyerEmail) {
        return 'Buyer email is required before buyer details can be requested.'
      }
      return null
    },
  },
  REQUEST_SELLER_DETAILS: {
    label: 'Request seller details',
    groupKey: 'client',
    executionMode: 'external',
    workflowKey: 'sales_otp',
    stepKey: 'seller_onboarding_complete',
    ownerRole: 'agent',
    allowedRoles: ['agent'],
    stages: ['SALES_OTP'],
    hideWhenStepComplete: true,
    reason(state = {}) {
      const sellerEmail =
        normalizeText(state.transaction?.seller_email) ||
        normalizeText(state.transaction?.sellerEmail) ||
        getParticipantEmail(state.rolePlayers, 'seller')
      if (!sellerEmail) {
        return 'Seller email is required before seller details can be requested.'
      }
      return null
    },
  },
  MOVE_TO_FINANCE: {
    label: 'Move to Finance',
    groupKey: 'stage',
    workflowKey: 'sales_otp',
    stepKey: 'ready_for_finance_handoff',
    ownerRole: 'agent',
    allowedRoles: ['agent'],
    stages: ['SALES_OTP'],
    requires: ['buyer_onboarding_complete', 'signed_otp_received', 'supporting_docs_complete'],
    targetStatus: 'complete',
    prerequisiteParentStage: 'SALES_OTP',
    targetParentStage: 'FINANCE',
  },
  MOVE_TO_TRANSFER: {
    label: 'Move to Transfer',
    groupKey: 'finance',
    workflowKey: resolveFinanceActionWorkflowKey,
    stepKey: resolveFinanceReadyStepKey,
    ownerRole: resolveFinanceActionOwnerRole,
    allowedRoles: (state = {}) => [resolveFinanceActionOwnerRole(state)],
    stages: ['FINANCE'],
    targetStatus: 'complete',
    prerequisiteParentStage: 'FINANCE',
    targetParentStage: 'TRANSFER',
  },
  MARK_READY_FOR_REGISTRATION: {
    label: 'Mark Ready for Registration',
    groupKey: 'attorney',
    workflowKey: 'registration',
    stepKey: 'all_required_matters_lodged',
    ownerRole: 'attorney',
    allowedRoles: ['attorney'],
    stages: ['TRANSFER'],
    targetStatus: 'complete',
    prerequisiteParentStage: 'TRANSFER',
    targetParentStage: 'REGISTRATION',
  },
  MARK_REGISTERED: {
    label: 'Mark Registered',
    groupKey: 'attorney',
    workflowKey: 'registration',
    stepKey: 'registration_confirmed',
    ownerRole: 'attorney',
    allowedRoles: ['attorney'],
    stages: ['REGISTRATION'],
    targetStatus: 'complete',
    prerequisiteParentStage: 'REGISTRATION',
    targetParentStage: 'COMPLETE',
    reason(state = {}) {
      const transaction = state.transaction || {}
      if (!normalizeText(transaction.registration_date)) {
        return 'Registration date is required before the transaction can be marked as Registered.'
      }
      if (!normalizeText(transaction.title_deed_number)) {
        return 'Title deed number is required before the transaction can be marked as Registered.'
      }
      if (!normalizeText(transaction.registration_confirmation_document_id)) {
        return 'Registration confirmation evidence is required before the transaction can be marked as Registered.'
      }
      return null
    },
  },
  REOPEN_FINANCE: {
    label: 'Reopen Finance',
    groupKey: 'stage',
    workflowKey: resolveFinanceActionWorkflowKey,
    stepKey: resolveFinanceReadyStepKey,
    ownerRole: resolveFinanceActionOwnerRole,
    allowedRoles: (state = {}) => [resolveFinanceActionOwnerRole(state)],
    stages: ['TRANSFER', 'REGISTRATION'],
    targetStatus: 'pending',
    targetParentStage: 'FINANCE',
  },
  REOPEN_TRANSFER: {
    label: 'Reopen Transfer',
    groupKey: 'attorney',
    workflowKey: 'registration',
    stepKey: 'all_required_matters_lodged',
    ownerRole: 'attorney',
    allowedRoles: ['attorney'],
    stages: ['REGISTRATION', 'COMPLETE'],
    targetStatus: 'pending',
    targetParentStage: 'TRANSFER',
  },
  CANCEL_TRANSACTION: {
    label: 'Cancel Transaction',
    groupKey: 'admin',
    workflowKey: '',
    stepKey: '',
    ownerRole: 'agent',
    allowedRoles: ['agent', 'developer', 'internal_admin'],
    stages: ['SALES_OTP', 'FINANCE', 'TRANSFER', 'REGISTRATION'],
    targetStatus: '',
    targetParentStage: 'CANCELLED',
    transactionOnly: true,
  },
})

function resolveActionMetadata(definition = null, state = {}) {
  if (!definition) return null

  const workflowKey = typeof definition.workflowKey === 'function'
    ? definition.workflowKey(state)
    : definition.workflowKey
  const stepKey = typeof definition.stepKey === 'function'
    ? definition.stepKey(state)
    : definition.stepKey
  const ownerRole = normalizeRoleType(
    typeof definition.ownerRole === 'function'
      ? definition.ownerRole({ ...state, workflowKey, stepKey })
      : definition.ownerRole,
  )
  const allowedRoles = unique(
    (typeof definition.allowedRoles === 'function'
      ? definition.allowedRoles({ ...state, workflowKey, stepKey, ownerRole })
      : definition.allowedRoles) || [],
  ).map((role) => normalizeRoleType(role))
  const requires = unique(
    (typeof definition.requires === 'function'
      ? definition.requires({ ...state, workflowKey, stepKey })
      : definition.requires) || [],
  )

  return {
    actionKey: '',
    label: definition.label,
    groupKey: definition.groupKey,
    groupLabel: ACTION_GROUP_LABELS[definition.groupKey] || 'Workflow actions',
    workflowKey: normalizeText(workflowKey),
    stepKey: normalizeText(stepKey),
    ownerRole,
    allowedRoles,
    stages: unique(definition.stages || []),
    requires,
    targetStatus: normalizeText(definition.targetStatus),
    prerequisiteParentStage: normalizeText(definition.prerequisiteParentStage),
    targetParentStage: normalizeText(definition.targetParentStage),
    executionMode: normalizeText(definition.executionMode || 'workflow'),
    transactionOnly: definition.transactionOnly === true,
    hideWhenStepComplete: definition.hideWhenStepComplete === true,
    reason: definition.reason,
  }
}

function resolveActionRequirementStates(descriptor = {}, workflows = {}) {
  const workflowKey = descriptor.workflowKey
  return (descriptor.requires || []).map((stepKey) => {
    const stateStep = getWorkflowStateStep(workflows, workflowKey, stepKey)
    const definitionStep = getWorkflowDefinitionStep(workflowKey, stepKey)
    return {
      stepKey,
      stepLabel: normalizeText(stateStep?.stepLabel || stateStep?.label || definitionStep?.label || stepKey),
      status: normalizeKey(stateStep?.status),
      complete: isCompleteStatus(stateStep?.status),
    }
  })
}

export function getWorkflowActionDescriptor(actionKey, state = {}) {
  const key = normalizeText(actionKey).toUpperCase()
  const definition = ACTION_DEFINITIONS[key]
  if (!definition) return null

  const descriptor = resolveActionMetadata(definition, state)
  if (!descriptor) return null

  return {
    ...descriptor,
    actionKey: key,
    requiredEvidence: descriptor.requires,
  }
}

export function isWorkflowActionAllowedForRole(descriptor = {}, actorRole = '') {
  return !resolvePermissionReason(descriptor, actorRole)
}

function isActionRelevant(descriptor = {}, state = {}) {
  const parentStage = normalizeText(state.parentStage || state.rollup?.parentStage)
  if (descriptor.stages.length && !descriptor.stages.includes(parentStage)) {
    return false
  }

  if (!descriptor.stepKey || descriptor.transactionOnly) {
    return true
  }

  const targetStep = getWorkflowStateStep(state.workflows || {}, descriptor.workflowKey, descriptor.stepKey)
  if (descriptor.hideWhenStepComplete && isCompleteStatus(targetStep?.status)) {
    return false
  }

  return true
}

function resolveActionDisabledReason(descriptor = {}, state = {}) {
  const permissionReason = resolvePermissionReason(descriptor, state.actorRole)
  if (permissionReason) return permissionReason

  if (typeof descriptor.reason === 'function') {
    const customReason = descriptor.reason({ ...state, descriptor })
    if (customReason) return customReason
  }

  if (descriptor.groupKey !== 'client') {
    const blockers = state.blockers || []
    const primaryBlockerMessage = blockers
      .map((blocker) => normalizeText(blocker?.message))
      .find(Boolean)
    if (primaryBlockerMessage) {
      return primaryBlockerMessage
    }
  }

  const missingRequirement = resolveActionRequirementStates(descriptor, state.workflows || {})
    .find((item) => !item.complete)
  if (missingRequirement) {
    return buildMissingRequirementReason(missingRequirement, descriptor.label)
  }

  return null
}

export function resolveWorkflowAvailableActions(state = {}) {
  const descriptors = Object.keys(ACTION_DEFINITIONS)
    .map((actionKey) => getWorkflowActionDescriptor(actionKey, state))
    .filter(Boolean)
    .filter((descriptor) => isActionRelevant(descriptor, state))

  return descriptors
    .map((descriptor) => {
      const reason = resolveActionDisabledReason(descriptor, state)
      return {
        actionKey: descriptor.actionKey,
        label: descriptor.label,
        groupKey: descriptor.groupKey,
        groupLabel: descriptor.groupLabel,
        workflowKey: descriptor.workflowKey || null,
        stepKey: descriptor.stepKey || null,
        ownerRole: descriptor.ownerRole || 'system',
        enabled: !reason,
        reason: reason || null,
        requires: descriptor.requires || [],
        requiredPermissions: descriptor.allowedRoles || [],
        requiredEvidence: descriptor.requiredEvidence || [],
      }
    })
    .sort((left, right) => {
      const groupCompare = normalizeText(left.groupLabel).localeCompare(normalizeText(right.groupLabel))
      if (groupCompare !== 0) return groupCompare
      return normalizeText(left.label).localeCompare(normalizeText(right.label))
    })
}
