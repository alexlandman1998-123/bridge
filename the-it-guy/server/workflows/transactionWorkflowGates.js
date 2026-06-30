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
    requiredEvidence: ['finance_readiness_or_override'],
    requiredSteps: ['ready_for_transfer'],
    allowedOverrides: ['force_complete', 'force_waive'],
    rolePermissions: ['principal', 'admin', 'developer_admin', 'transaction_coordinator', 'arch9_admin'],
  },
  transfer_ready: {
    gateKey: 'transfer_ready',
    label: 'Transfer Ready',
    requiredEvidence: ['attorney_instructed', 'required_docs_satisfied', 'finance_ready'],
    requiredSteps: ['all_required_matters_lodged'],
    allowedOverrides: ['force_complete'],
    rolePermissions: ['principal', 'admin', 'attorney_admin', 'transaction_coordinator', 'arch9_admin'],
  },
  registration_confirmed: {
    gateKey: 'registration_confirmed',
    label: 'Registration Confirmed',
    requiredEvidence: ['registration_date', 'registration_confirmation', 'final_registration_event'],
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
    return (
      ['TRANSFER', 'REGISTRATION', 'COMPLETE'].includes(parentStage) ||
      ['ready_for_handoff', 'complete', 'skipped'].includes(financeStatus)
    )
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
    return ['REGISTRATION', 'COMPLETE'].includes(parentStage)
  }

  if (key === 'registration_confirmed') {
    return parentStage === 'COMPLETE'
  }

  return false
}
