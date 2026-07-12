import {
  SUSPENSIVE_CONDITION_GATE_KEYS,
  areSuspensiveConditionWorkflowGatesSatisfied,
} from './suspensiveConditionWorkflowGates.js'
import {
  AUTHORITY_VALIDITY_GATE_KEYS,
  areAuthorityValidityWorkflowGatesSatisfied,
} from './authorityValidityWorkflowGates.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

export const TRANSACTION_GATE_DEFINITIONS = Object.freeze({
  sale_confirmed: {
    gateKey: 'sale_confirmed',
    label: 'Sale Confirmed',
    requiredEvidence: ['accepted_offer_or_override', 'buyer_linked', 'property_linked'],
    requiredSteps: [],
    allowedOverrides: ['force_complete'],
    rolePermissions: ['principal', 'admin', 'developer_admin', 'transaction_coordinator', 'arch9_admin'],
  },
  otp_executed: {
    gateKey: 'otp_executed',
    label: 'OTP Executed',
    requiredEvidence: ['otp_generated_or_uploaded', 'buyer_signature', 'seller_or_developer_signature'],
    requiredSteps: ['signed_otp_received'],
    allowedOverrides: ['force_complete', 'force_waive'],
    rolePermissions: ['principal', 'admin', 'developer_admin', 'transaction_coordinator', 'arch9_admin'],
  },
  finance_ready: {
    gateKey: 'finance_ready',
    label: 'Finance Ready',
    requiredEvidence: ['finance_readiness_or_override', SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent],
    requiredSteps: ['ready_for_transfer'],
    allowedOverrides: ['force_complete', 'force_waive'],
    rolePermissions: ['principal', 'admin', 'developer_admin', 'transaction_coordinator', 'arch9_admin'],
  },
  [SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent]: {
    gateKey: SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent,
    label: 'Suspensive Condition Deadlines Current',
    requiredEvidence: ['condition_deadline', 'condition_extension_evidence_if_late'],
    requiredSteps: [],
    allowedOverrides: ['force_complete'],
    rolePermissions: ['principal', 'admin', 'attorney_admin', 'transaction_coordinator', 'arch9_admin'],
  },
  [SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady]: {
    gateKey: SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady,
    label: 'Suspensive Condition Resolutions Ready',
    requiredEvidence: ['condition_fulfilment', 'condition_waiver', 'condition_extension_if_late'],
    requiredSteps: [],
    allowedOverrides: ['force_complete'],
    rolePermissions: ['principal', 'admin', 'attorney_admin', 'transaction_coordinator', 'arch9_admin'],
  },
  [AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady]: {
    gateKey: AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady,
    label: 'Legal Authority Validity Ready',
    requiredEvidence: ['authority_validity_review', 'signatory_authority_match', 'quorum_or_required_signatures', 'transaction_scope_authority'],
    requiredSteps: [],
    allowedOverrides: ['force_complete'],
    rolePermissions: ['principal', 'admin', 'attorney_admin', 'transaction_coordinator', 'arch9_admin'],
  },
  transfer_ready: {
    gateKey: 'transfer_ready',
    label: 'Transfer Ready',
    requiredEvidence: [
      'attorney_instructed',
      'required_docs_satisfied',
      'finance_ready',
      SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady,
      AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady,
    ],
    requiredSteps: ['all_required_matters_lodged'],
    allowedOverrides: ['force_complete'],
    rolePermissions: ['principal', 'admin', 'attorney_admin', 'transaction_coordinator', 'arch9_admin'],
  },
  registration_confirmed: {
    gateKey: 'registration_confirmed',
    label: 'Registration Confirmed',
    requiredEvidence: [
      'registration_date',
      'registration_confirmation',
      'final_registration_event',
      SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady,
      AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady,
    ],
    requiredSteps: ['registration_confirmed'],
    allowedOverrides: ['force_complete'],
    rolePermissions: ['principal', 'admin', 'attorney_admin', 'transaction_coordinator', 'arch9_admin'],
  },
})

export function listTransactionWorkflowGates() {
  return Object.values(TRANSACTION_GATE_DEFINITIONS)
}

export function getTransactionWorkflowGate(gateKey = '') {
  return TRANSACTION_GATE_DEFINITIONS[normalizeKey(gateKey)] || null
}

export function isGateWorkflowAction(descriptor = {}) {
  if (!descriptor) return false
  if (descriptor.gateAction === true) return true
  if (descriptor.transactionOnly === true) return true
  if (normalizeText(descriptor.targetParentStage)) return true
  return false
}

export function isWorkflowGateSatisfied(gateKey = '', state = {}) {
  const key = normalizeKey(gateKey)
  const rollup = state.rollup || {}
  const workflows = state.workflows || {}
  const parentStage = normalizeText(state.parentStage || rollup.parentStage || rollup.parent_stage).toUpperCase()

  if (key === 'finance_ready') {
    const financeWorkflow = Object.values(workflows).find((workflow) =>
      normalizeText(workflow?.workflowKey || workflow?.workflow_key).startsWith('finance_'),
    )
    const financeStatus = normalizeKey(financeWorkflow?.status)
    const financeReady = (
      ['TRANSFER', 'REGISTRATION', 'COMPLETE'].includes(parentStage) ||
      ['ready_for_handoff', 'complete', 'skipped'].includes(financeStatus)
    )
    return financeReady && areSuspensiveConditionWorkflowGatesSatisfied(
      state.transaction || {},
      SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent,
      state,
    )
  }

  if (key === SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent) {
    return areSuspensiveConditionWorkflowGatesSatisfied(state.transaction || {}, SUSPENSIVE_CONDITION_GATE_KEYS.deadlinesCurrent, state)
  }

  if (key === SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady) {
    return areSuspensiveConditionWorkflowGatesSatisfied(state.transaction || {}, SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady, state)
  }

  if (key === AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady) {
    return areAuthorityValidityWorkflowGatesSatisfied(state.transaction || {}, AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady, state)
  }

  if (key === 'otp_executed') {
    const sales = workflows.sales_otp || workflows.SALES_OTP || null
    const signedStep = (sales?.requiredSteps || []).find((step) =>
      normalizeKey(step?.key || step?.stepKey || step?.step_key) === 'signed_otp_received',
    )
    return ['complete', 'skipped', 'not_applicable'].includes(normalizeKey(signedStep?.status))
  }

  if (key === 'sale_confirmed') {
    const transaction = state.transaction || {}
    return Boolean(
      transaction.accepted_offer_id ||
        transaction.acceptedOfferId ||
        transaction.transaction_creation_override_reason ||
        transaction.transactionCreationOverrideReason,
    )
  }

  if (key === 'transfer_ready') {
    return ['REGISTRATION', 'COMPLETE'].includes(parentStage) &&
      areSuspensiveConditionWorkflowGatesSatisfied(
        state.transaction || {},
        SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady,
        state,
      ) &&
      areAuthorityValidityWorkflowGatesSatisfied(
        state.transaction || {},
        AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady,
        state,
      )
  }

  if (key === 'registration_confirmed') {
    return parentStage === 'COMPLETE' &&
      areSuspensiveConditionWorkflowGatesSatisfied(
        state.transaction || {},
        SUSPENSIVE_CONDITION_GATE_KEYS.resolutionsReady,
        state,
      ) &&
      areAuthorityValidityWorkflowGatesSatisfied(
        state.transaction || {},
        AUTHORITY_VALIDITY_GATE_KEYS.legalAuthorityValidityReady,
        state,
      )
  }

  return false
}
