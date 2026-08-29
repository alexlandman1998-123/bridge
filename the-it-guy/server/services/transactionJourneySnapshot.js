export const TRANSACTION_JOURNEY_SNAPSHOT_SCHEMA_VERSION = 1

export const TRANSACTION_JOURNEY_MILESTONES = Object.freeze([
  Object.freeze({ key: 'otp_signed', label: 'OTP Signed' }),
  Object.freeze({ key: 'finance', label: 'Finance' }),
  Object.freeze({ key: 'guarantees', label: 'Guarantees' }),
  Object.freeze({ key: 'transfer', label: 'Transfer' }),
  Object.freeze({ key: 'lodgement', label: 'Lodgement' }),
  Object.freeze({ key: 'registration', label: 'Registration' }),
])

const COMPLETE_STEP_STATUSES = new Set(['complete', 'completed', 'done', 'skipped', 'not_applicable'])
const EXTERNAL_AUDIENCE_ROLES = new Set(['buyer', 'seller', 'client', 'prospect', 'external_share', 'public'])
const INTERNAL_AUDIENCE_ROLES = new Set([
  'agent',
  'agency_admin',
  'admin',
  'internal_admin',
  'developer',
  'bond_originator',
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
  'attorney',
])

const GUARANTEE_STEP_KEYS = new Set([
  'guarantees',
  'guarantees_issued',
  'guarantees_received',
  'guarantees_confirmed',
  'guarantees_accepted',
  'guarantee_wording_accepted',
  'transfer_guarantees_accepted',
  'cancellation_guarantees_requested',
  'cancellation_guarantees_received',
  'cancellation_guarantees_accepted',
])

const LODGEMENT_STEP_KEYS = new Set([
  'ready_for_lodgement',
  'lodgement_ready',
  'lodgement_pack_prepared',
  'bond_lodgement_ready',
  'bond_lodgement_pack_prepared',
  'cancellation_lodgement_ready',
  'lodged',
  'lodgement_submitted',
  'bond_lodged',
  'bond_lodgement_submitted',
  'cancellation_lodged',
  'all_required_matters_lodged',
])

const WORKFLOW_ITEM_SUMMARIES = Object.freeze({
  sign_otp: {
    external: 'The signed Offer to Purchase is still required before the transaction can progress.',
    internal: 'The signed Offer to Purchase is the current blocking workflow item.',
  },
  signed_otp_received: {
    external: 'The signed Offer to Purchase is still required before the transaction can progress.',
    internal: 'The signed Offer to Purchase must be captured before the finance handoff.',
  },
  applications_submitted: {
    external: 'The bond application has been submitted to the banks for assessment.',
    internal: 'Bank applications have been submitted and responses are being tracked.',
  },
  feedback_received: {
    external: 'The bond application is with the banks and the finance team is waiting for feedback and quotes.',
    internal: 'The bond originator is waiting for bank feedback and quotes.',
  },
  waiting_for_bank_quotes: {
    external: 'The bond application is with the banks and the finance team is waiting for feedback and quotes.',
    internal: 'The bond originator is waiting for bank feedback and quotes.',
  },
  bank_review: {
    external: 'The bond application is with the banks for assessment.',
    internal: 'The banks are assessing the submitted bond application.',
  },
  quote_received: {
    external: 'Bank feedback has been received and the finance team is reviewing the available quote.',
    internal: 'A bank quote has been received and is ready for review.',
  },
  bond_approval: {
    external: 'The finance team is waiting for the bond approval outcome.',
    internal: 'Bond approval evidence is outstanding.',
  },
  proof_of_funds: {
    external: 'Proof of funds is being verified before transfer continues.',
    internal: 'Proof-of-funds verification is the current finance item.',
  },
  proof_of_funds_received: {
    external: 'Proof of funds is being collected before transfer continues.',
    internal: 'Proof of funds must be received before review can begin.',
  },
  guarantees_issued: {
    external: 'The appointed attorneys are preparing the required guarantees.',
    internal: 'Guarantee issuance is the current attorney workflow item.',
  },
  guarantees_received: {
    external: 'The legal teams are coordinating receipt and acceptance of the required guarantees.',
    internal: 'Receipt of the required guarantees is outstanding.',
  },
  guarantees_confirmed: {
    external: 'The legal teams are confirming that the required guarantees are in place.',
    internal: 'Transfer guarantees still need to be confirmed.',
  },
  clearance_figures_requested: {
    external: 'Municipal clearance figures have been requested and the transfer team is waiting for the municipality.',
    internal: 'Clearance figures have been requested and are awaiting the municipality.',
  },
  rates_figures_requested: {
    external: 'Municipal clearance figures have been requested and the transfer team is waiting for the municipality.',
    internal: 'Clearance figures have been requested and are awaiting the municipality.',
  },
  rates_clearance_requested: {
    external: 'Municipal clearance figures have been requested and the transfer team is waiting for the municipality.',
    internal: 'Clearance figures have been requested and are awaiting the municipality.',
  },
  clearance_figures_received: {
    external: 'The transfer team is waiting for the required municipal clearance figures.',
    internal: 'Receipt of the requested clearance figures is outstanding.',
  },
  ready_for_lodgement: {
    external: 'The legal teams are coordinating readiness for lodgement.',
    internal: 'The matter is being prepared and coordinated for lodgement.',
  },
  all_required_matters_lodged: {
    external: 'The matter has been lodged and is progressing through the Deeds Office.',
    internal: 'All required transfer, bond and cancellation matters must be lodged.',
  },
  lodged: {
    external: 'The matter has been lodged and is progressing through the Deeds Office.',
    internal: 'The matter has been lodged at the Deeds Office.',
  },
  lodgement_submitted: {
    external: 'The matter has been lodged and is progressing through the Deeds Office.',
    internal: 'The matter has been lodged at the Deeds Office.',
  },
  registration_confirmed: {
    external: 'Registration has been confirmed.',
    internal: 'Registration has been confirmed and the transaction is ready for close-out.',
  },
})

function normalizeKey(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s/-]+/g, '_')
}

function normalizeRole(value = '') {
  const role = normalizeKey(value)
  if (EXTERNAL_AUDIENCE_ROLES.has(role)) return role
  if (INTERNAL_AUDIENCE_ROLES.has(role)) return role
  return 'internal'
}

function clampPercent(value = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, Math.round(number)))
}

function toIsoString(value) {
  const parsed = new Date(value || Date.now())
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

function isCompleteStep(step = {}) {
  return COMPLETE_STEP_STATUSES.has(normalizeKey(step.status || step.stepStatus))
}

function requiredWorkflowSteps(workflow = null) {
  if (!workflow || workflow.required === false) return []
  return (Array.isArray(workflow.requiredSteps) ? workflow.requiredSteps : []).filter((step) => step?.required !== false)
}

function getRequiredGuaranteeSteps(workflows = {}) {
  return Object.values(workflows || {}).flatMap((workflow) =>
    requiredWorkflowSteps(workflow).filter((step) => GUARANTEE_STEP_KEYS.has(normalizeKey(step.key || step.stepKey))),
  )
}

function transactionRequiresGuarantees(transaction = {}, workflows = {}) {
  const financeType = normalizeKey(transaction.finance_type || transaction.financeType)
  if (['bond', 'hybrid', 'combination', 'mortgage'].includes(financeType)) return true
  if (workflows.attorney_bond?.required !== false && requiredWorkflowSteps(workflows.attorney_bond).length) return true
  if (workflows.seller_bond_cancellation?.required !== false && requiredWorkflowSteps(workflows.seller_bond_cancellation).length) return true
  return false
}

function resolveCurrentMilestoneIndex({ transaction, parentStage, activeStep, workflows }) {
  const parentKey = String(parentStage || '').trim().toUpperCase()
  const activeStepKey = normalizeKey(activeStep?.key || activeStep?.stepKey)
  const guaranteesRequired = transactionRequiresGuarantees(transaction, workflows)

  if (parentKey === 'COMPLETE') return TRANSACTION_JOURNEY_MILESTONES.length
  if (parentKey === 'SETUP' || parentKey === 'SALES_OTP') return 0
  if (parentKey === 'FINANCE') {
    return guaranteesRequired && GUARANTEE_STEP_KEYS.has(activeStepKey) ? 2 : 1
  }
  if (parentKey === 'TRANSFER') {
    const guaranteeSteps = guaranteesRequired ? getRequiredGuaranteeSteps(workflows) : []
    if (guaranteeSteps.some((step) => !isCompleteStep(step))) return 2
    if (LODGEMENT_STEP_KEYS.has(activeStepKey)) return 4
    return 3
  }
  if (parentKey === 'REGISTRATION') {
    return LODGEMENT_STEP_KEYS.has(activeStepKey) ? 4 : 5
  }
  if (parentKey === 'CANCELLED') return -1
  return 0
}

function resolveAudienceVisibility(actorRole = '') {
  return EXTERNAL_AUDIENCE_ROLES.has(normalizeRole(actorRole)) ? 'external' : 'internal'
}

function resolveOwnerLabel(ownerRole = '', visibility = 'internal') {
  const role = normalizeKey(ownerRole)
  const internalLabels = {
    agent: 'Agent',
    buyer: 'Buyer',
    seller: 'Seller',
    bank: 'Bank',
    bond_originator: 'Bond Originator',
    attorney: 'Attorney',
    transfer_attorney: 'Transfer Attorney',
    bond_attorney: 'Bond Attorney',
    cancellation_attorney: 'Cancellation Attorney',
    developer: 'Developer',
    system: 'Arch9',
  }
  if (visibility === 'external') {
    if (role === 'bank') return 'Banks'
    if (role === 'bond_originator') return 'Finance Team'
    if (role.includes('attorney')) return 'Legal Team'
  }
  return internalLabels[role] || 'Transaction Team'
}

function resolveWorkflowItemSummary({ stepKey, stepLabel, milestoneLabel, visibility }) {
  const summary = WORKFLOW_ITEM_SUMMARIES[stepKey]
  if (summary?.[visibility]) return summary[visibility]
  if (visibility === 'external') return `The transaction team is progressing ${milestoneLabel.toLowerCase()}.`
  return stepLabel
    ? `${stepLabel} is the current workflow item.`
    : `${milestoneLabel} is the current transaction milestone.`
}

function buildCurrentWorkflowItem({ activeWorkflow, activeStep, milestone, actorRole, isBlocked }) {
  if (!activeStep || !milestone) return null
  const visibility = resolveAudienceVisibility(actorRole)
  const key = normalizeKey(activeStep.key || activeStep.stepKey)
  const label = activeStep.label || activeStep.stepLabel || activeStep.nextActionLabel || milestone.label
  const ownerRole = normalizeKey(activeStep.ownerRole || 'system') || 'system'

  return Object.freeze({
    key,
    sourceStepKey: key,
    label,
    status: isBlocked || normalizeKey(activeStep.status) === 'blocked' ? 'blocked' : 'current',
    workflowKey: normalizeKey(activeWorkflow?.workflowKey) || null,
    ownerRole,
    ownerLabel: resolveOwnerLabel(ownerRole, visibility),
    summary: resolveWorkflowItemSummary({
      stepKey: key,
      stepLabel: label,
      milestoneLabel: milestone.label,
      visibility,
    }),
  })
}

export function buildTransactionJourneySnapshot({
  transactionId,
  transaction = {},
  parentStage = '',
  parentStatus = '',
  progressPercent = 0,
  activeWorkflow = null,
  activeStep = null,
  workflows = {},
  blockers = [],
  derivedAt = null,
  actorRole = '',
} = {}) {
  const normalizedParentStatus = normalizeKey(parentStatus)
  const isComplete = String(parentStage || '').trim().toUpperCase() === 'COMPLETE' || normalizedParentStatus === 'complete'
  const isCancelled = String(parentStage || '').trim().toUpperCase() === 'CANCELLED' || normalizedParentStatus === 'cancelled'
  const currentIndex = resolveCurrentMilestoneIndex({ transaction, parentStage, activeStep, workflows })
  const isBlocked = normalizedParentStatus === 'blocked' || (Array.isArray(blockers) && blockers.length > 0)
  const resolvedDerivedAt = toIsoString(derivedAt || transaction.updated_at || transaction.updatedAt)
  const milestones = TRANSACTION_JOURNEY_MILESTONES.map((milestone, index) => {
    const status = isComplete
      ? 'complete'
      : isCancelled
        ? index < Math.max(currentIndex, 0) ? 'complete' : 'upcoming'
        : index < currentIndex
          ? 'complete'
          : index === currentIndex
            ? isBlocked ? 'blocked' : 'current'
            : 'upcoming'
    return Object.freeze({ ...milestone, status, isComplete: status === 'complete', isCurrent: ['current', 'blocked'].includes(status) })
  })
  const currentMilestone = currentIndex >= 0 && currentIndex < milestones.length ? milestones[currentIndex] : null
  const currentWorkflowItem = buildCurrentWorkflowItem({ activeWorkflow, activeStep, milestone: currentMilestone, actorRole, isBlocked })
  const audienceRole = normalizeRole(actorRole)

  return Object.freeze({
    schemaVersion: TRANSACTION_JOURNEY_SNAPSHOT_SCHEMA_VERSION,
    version: `transaction-journey-v${TRANSACTION_JOURNEY_SNAPSHOT_SCHEMA_VERSION}:${resolvedDerivedAt}`,
    transactionId: String(transactionId || transaction.id || ''),
    audience: Object.freeze({ role: audienceRole, visibility: resolveAudienceVisibility(audienceRole) }),
    status: isComplete ? 'complete' : isCancelled ? 'cancelled' : isBlocked ? 'blocked' : 'active',
    progressPercent: clampPercent(progressPercent),
    currentMilestoneKey: currentMilestone?.key || null,
    currentMilestone,
    currentWorkflowItem,
    milestones: Object.freeze(milestones),
    derivedAt: resolvedDerivedAt,
    source: Object.freeze({
      parentStage: String(parentStage || '').trim().toUpperCase() || null,
      workflowKey: normalizeKey(activeWorkflow?.workflowKey) || null,
      stepKey: normalizeKey(activeStep?.key || activeStep?.stepKey) || null,
    }),
  })
}
