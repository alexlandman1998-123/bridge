export const ATTORNEY_TASK_CONTRACT_VERSION = 'attorney_task_operational_v2'

export const ATTORNEY_TASK_TYPES = Object.freeze({
  captureInformation: 'capture_information',
  collectDocuments: 'collect_documents',
  reviewEvidence: 'review_evidence',
  requestExternalAction: 'request_external_action',
  scheduleAction: 'schedule_action',
  confirmMilestone: 'confirm_milestone',
})

export const ATTORNEY_TASK_STATUS_ACTIONS = Object.freeze({
  not_started: 'reset_task',
  in_progress: 'start_task',
  waiting: 'wait_for_party',
  blocked: 'block_task',
  completed: 'complete_task',
  completed_externally: 'complete_externally',
  not_applicable: 'mark_not_applicable',
})

export const ATTORNEY_ATTESTED_MILESTONE_KEYS = Object.freeze({
  transfer: Object.freeze(['lodgement_ready', 'lodged_at_deeds_office', 'registered']),
  bond: Object.freeze(['bond_lodgement_ready', 'bond_lodged', 'bond_registered']),
  cancellation: Object.freeze(['cancellation_lodgement_ready', 'cancellation_lodged', 'cancellation_registered']),
})

export const ATTORNEY_EVIDENCE_DECISION_KEYS = Object.freeze({
  transfer: Object.freeze([
    'title_deed_checked', 'transfer_tax_route_confirmed', 'transfer_duty_tdc01_submission',
    'sars_evidence_request_response', 'transfer_duty_assessment_payment',
    'vat_exemption_evidence_verified', 'non_resident_seller_withholding_review',
    'ordinary_vat_basis_verified', 'going_concern_zero_rate_verified',
    'transfer_duty_exemption_basis_verified', 'non_resident_seller_applicability_review',
    'non_resident_seller_directive_review', 'non_resident_seller_withholding_payment_review',
    'sars_transfer_tax_receipt_verified', 'municipal_rates_clearance_review',
    'levy_hoa_clearance_review', 'body_corporate_levy_clearance_review',
    'hoa_clearance_review', 'property_conditions_applicability_review',
    'title_conditions_review', 'property_compliance_review', 'transfer_document_pack_review',
    'specialist_classification_review', 'estate_authority_transfer_review',
    'insolvency_authority_transfer_review', 'court_order_transfer_review',
    'unusual_title_resolution_review', 'agricultural_consent_review',
    'share_block_instrument_review', 'other_specialist_execution_review',
    'buyer_signing_review', 'seller_signing_review', 'cash_funding_source_review', 'payment_security_review',
  ]),
  bond: Object.freeze([
    'bond_approval_letter_received', 'buyer_signed_bond_documents',
    'bank_approval_to_lodge_received', 'guarantee_wording_accepted', 'bond_lodgement_instructions_confirmed',
  ]),
  cancellation: Object.freeze([
    'cancellation_figures_received', 'figures_expiry_captured',
    'cancellation_guarantees_accepted', 'cancellation_guarantee_allocation_review',
    'cancellation_consent_confirmed', 'cancellation_simultaneous_lodgement_confirmed',
    'seller_cancellation_documents_signed',
  ]),
})

const SPECIALIST_DECISION_KEYS = Object.freeze([
  'specialist_classification_review', 'estate_authority_transfer_review',
  'insolvency_authority_transfer_review', 'court_order_transfer_review',
  'unusual_title_resolution_review', 'agricultural_consent_review',
  'share_block_instrument_review', 'other_specialist_execution_review',
])

export function isAttorneyAttestedMilestone(laneKey, taskKey) {
  return (ATTORNEY_ATTESTED_MILESTONE_KEYS[normalizeLaneKey(laneKey)] || []).includes(key(taskKey))
}

export function requiresAttorneyEvidenceDecision(laneKey, taskKey) {
  return (ATTORNEY_EVIDENCE_DECISION_KEYS[normalizeLaneKey(laneKey)] || []).includes(key(taskKey))
}

const LANE_LABELS = Object.freeze({
  transfer: 'Transfer Attorney',
  bond: 'Bond Attorney',
  cancellation: 'Cancellation Attorney',
})

const PROFESSIONAL_AUDIENCE = Object.freeze([
  'agent',
  'bond_originator',
  'transfer_attorney',
  'bond_attorney',
  'cancellation_attorney',
])

const BROAD_CLIENT_MILESTONES = Object.freeze([
  'lodged',
  'lodgement_ready',
  'registered',
  'registration',
  'matter_closed',
  'close_out_complete',
])

function text(value = '') {
  return String(value || '').trim()
}

function key(value = '') {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function unique(values = []) {
  return [...new Set((values || []).map((value) => key(value)).filter(Boolean))]
}

function freezeArray(values = []) {
  return Object.freeze([...(values || [])])
}

function freezeRows(rows = []) {
  return freezeArray((rows || []).map((row) => Object.freeze({ ...row })))
}

function normalizeLaneKey(value = '') {
  const normalized = key(value).replace(/_attorney$/, '')
  return ['transfer', 'bond', 'cancellation'].includes(normalized) ? normalized : 'transfer'
}

function inferTaskType({ taskKey = '', requiredData = [], requiredDocuments = [] } = {}) {
  const normalizedTaskKey = key(taskKey)
  if (/signing_scheduled|schedule|appointment/.test(normalizedTaskKey)) return ATTORNEY_TASK_TYPES.scheduleAction
  if (/requested|submitted|sent_to|issued/.test(normalizedTaskKey)) return ATTORNEY_TASK_TYPES.requestExternalAction
  if (/approved|accepted|checked|review(?:ed)?(?:_|$)|confirmed|resolved/.test(normalizedTaskKey)) return ATTORNEY_TASK_TYPES.reviewEvidence
  if (/captured|matter_opened|number_assigned|prepared/.test(normalizedTaskKey) && requiredData.length) return ATTORNEY_TASK_TYPES.captureInformation
  if (/fica_received|documents_received|signed_documents|receipt_received|certificate_received/.test(normalizedTaskKey)) return ATTORNEY_TASK_TYPES.collectDocuments
  if (requiredDocuments.length && /received|signed|document/.test(normalizedTaskKey)) return ATTORNEY_TASK_TYPES.collectDocuments
  if (requiredData.length && !requiredDocuments.length) return ATTORNEY_TASK_TYPES.captureInformation
  return ATTORNEY_TASK_TYPES.confirmMilestone
}

function inferClientAudience(taskKey = '', clientVisibleAllowed = true, explicitAudience = null) {
  if (!clientVisibleAllowed) return []
  if (explicitAudience) return unique(Array.isArray(explicitAudience) ? explicitAudience : [explicitAudience])

  const normalizedTaskKey = key(taskKey)
  if (BROAD_CLIENT_MILESTONES.some((token) => normalizedTaskKey.includes(token))) return ['buyer', 'seller']
  if (normalizedTaskKey.includes('buyer')) return ['buyer']
  if (normalizedTaskKey.includes('seller') || normalizedTaskKey.includes('cancellation')) return ['seller']
  return ['buyer', 'seller']
}

function dueDaysForTaskType(taskType = '') {
  if (taskType === ATTORNEY_TASK_TYPES.collectDocuments) return 5
  if (taskType === ATTORNEY_TASK_TYPES.requestExternalAction) return 3
  if (taskType === ATTORNEY_TASK_TYPES.scheduleAction) return 3
  if (taskType === ATTORNEY_TASK_TYPES.reviewEvidence) return 2
  return 1
}

function buildAllowedActions({ taskType, requiredInputs, requiredDocuments, actionLabel, attestedMilestone, evidenceDecision, specialistDecision }) {
  const actions = []
  if (requiredInputs.length) {
    actions.push({ id: 'capture_data', label: 'Capture information', mode: 'task_workbench' })
  }
  if (requiredDocuments.length || taskType === ATTORNEY_TASK_TYPES.reviewEvidence) {
    actions.push({ id: 'request_document', label: 'Request document', mode: 'document_request' })
    actions.push({ id: 'upload_document', label: 'Upload evidence', mode: 'document_upload' })
  }
  if (taskType === ATTORNEY_TASK_TYPES.reviewEvidence) {
    actions.push({ id: 'review_document', label: 'Review evidence', mode: 'document_review' })
  }
  if (taskType === ATTORNEY_TASK_TYPES.requestExternalAction) {
    actions.push({ id: 'request_external_action', label: actionLabel || 'Send request', mode: 'task_command' })
  }
  if (taskType === ATTORNEY_TASK_TYPES.scheduleAction) {
    actions.push({ id: 'schedule_action', label: actionLabel || 'Schedule', mode: 'scheduling' })
  }
  actions.push({ id: 'add_note', label: 'Add note', mode: 'task_note' })
  actions.push({ id: 'mark_in_progress', label: 'Mark in progress', mode: 'status_update', status: 'in_progress' })
  actions.push({ id: 'mark_waiting', label: 'Mark waiting', mode: 'status_update', status: 'waiting', requiresNote: true })
  actions.push({ id: 'mark_blocked', label: 'Mark blocked', mode: 'status_update', status: 'blocked', requiresNote: true })
  actions.push({ id: 'mark_complete', label: actionLabel || 'Mark complete', mode: 'status_update', status: 'completed', requiresNote: attestedMilestone || evidenceDecision })
  if (!attestedMilestone && !specialistDecision) {
    actions.push({ id: 'complete_externally', label: 'Completed externally', mode: 'status_update', status: 'completed_externally', requiresNote: true })
    actions.push({ id: 'mark_not_applicable', label: 'Not applicable', mode: 'status_update', status: 'not_applicable', requiresNote: true })
  }
  return freezeRows(actions)
}

function defaultPrimaryAction(taskType = '', actionLabel = '') {
  if (taskType === ATTORNEY_TASK_TYPES.captureInformation) return { id: 'capture_data', label: actionLabel || 'Capture information' }
  if (taskType === ATTORNEY_TASK_TYPES.collectDocuments) return { id: 'upload_document', label: actionLabel || 'Capture documents' }
  if (taskType === ATTORNEY_TASK_TYPES.reviewEvidence) return { id: 'review_document', label: actionLabel || 'Review evidence' }
  if (taskType === ATTORNEY_TASK_TYPES.requestExternalAction) return { id: 'request_external_action', label: actionLabel || 'Send request' }
  if (taskType === ATTORNEY_TASK_TYPES.scheduleAction) return { id: 'schedule_action', label: actionLabel || 'Schedule action' }
  return { id: 'mark_complete', label: actionLabel || 'Confirm milestone' }
}

export function createAttorneyTaskOperationalContract({
  laneKey,
  taskKey,
  label,
  description = '',
  actionLabel = '',
  ownerRole = '',
  ownerLabel = '',
  defaultVisibility = 'professional_shared',
  clientVisibleAllowed = true,
  clientAudience = null,
  requiredData = [],
  requiredDocuments = [],
  evidenceRequirements = [],
  requiresNote = false,
  readinessGate = null,
  clientTitle = '',
  clientDescription = '',
  taskType: explicitTaskType = '',
} = {}) {
  const normalizedLaneKey = normalizeLaneKey(laneKey)
  const normalizedTaskKey = key(taskKey)
  const normalizedRequiredInputs = (requiredData || []).map((requirement) => ({
    id: key(requirement?.id || requirement?.factKey || requirement?.label),
    label: text(requirement?.label || requirement?.id),
    fields: freezeArray(requirement?.fields || []),
    factKey: text(requirement?.factKey || ''),
    description: text(requirement?.description || ''),
    required: requirement?.required !== false,
    owner: key(requirement?.owner || ownerRole || 'attorney'),
    severity: key(requirement?.severity || 'medium'),
    visibility: key(requirement?.visibility || 'internal'),
  })).filter((requirement) => requirement.id)
  const normalizedRequiredDocuments = unique(requiredDocuments)
  const taskType = explicitTaskType || inferTaskType({
    taskKey: normalizedTaskKey,
    requiredData: normalizedRequiredInputs,
    requiredDocuments: normalizedRequiredDocuments,
  })
  const audience = inferClientAudience(normalizedTaskKey, clientVisibleAllowed, clientAudience)
  const attestedMilestone = isAttorneyAttestedMilestone(normalizedLaneKey, normalizedTaskKey)
  const evidenceDecision = requiresAttorneyEvidenceDecision(normalizedLaneKey, normalizedTaskKey)
  const specialistDecision = normalizedLaneKey === 'transfer' && SPECIALIST_DECISION_KEYS.includes(normalizedTaskKey)
  const primaryAction = defaultPrimaryAction(taskType, actionLabel)

  const contract = {
    version: ATTORNEY_TASK_CONTRACT_VERSION,
    laneKey: normalizedLaneKey,
    laneLabel: LANE_LABELS[normalizedLaneKey],
    taskKey: normalizedTaskKey,
    label: text(label),
    description: text(description),
    taskType,
    owner: Object.freeze({
      role: key(ownerRole || `${normalizedLaneKey}_attorney`),
      label: text(ownerLabel || LANE_LABELS[normalizedLaneKey]),
    }),
    primaryAction: Object.freeze(primaryAction),
    allowedActions: buildAllowedActions({
      taskType,
      requiredInputs: normalizedRequiredInputs,
      requiredDocuments: normalizedRequiredDocuments,
      actionLabel,
      attestedMilestone,
      evidenceDecision,
      specialistDecision,
    }),
    requirements: Object.freeze({
      inputs: freezeRows(normalizedRequiredInputs),
      documents: freezeArray(normalizedRequiredDocuments),
      evidence: freezeArray((evidenceRequirements || []).map(text).filter(Boolean)),
    }),
    completionPolicy: Object.freeze({
      requireAllInputs: normalizedRequiredInputs.some((requirement) => requirement.required),
      requireAllDocuments: normalizedRequiredDocuments.length > 0,
      requireEvidenceConfirmation: (evidenceRequirements || []).length > 0,
      requiresNote: Boolean(requiresNote || attestedMilestone || evidenceDecision),
      readinessGate: readinessGate?.key
        ? Object.freeze({ key: key(readinessGate.key), label: text(readinessGate.label) })
        : null,
    }),
    dependencyPolicy: Object.freeze({
      strategy: 'previous_required_task',
      allowConcurrentWork: true,
      completionRequiresDependencies: true,
    }),
    dueDateRule: Object.freeze({
      strategy: 'business_days_from_activation',
      businessDays: dueDaysForTaskType(taskType),
    }),
    visibilityPolicy: Object.freeze({
      defaultVisibility: key(defaultVisibility) || 'professional_shared',
      clientVisibleAllowed: clientVisibleAllowed !== false,
      clientAudience: freezeArray(audience),
      professionalAudience: PROFESSIONAL_AUDIENCE,
      clientTitle: clientVisibleAllowed === false ? '' : text(clientTitle),
      clientDescription: clientVisibleAllowed === false ? '' : text(clientDescription),
    }),
    eventPolicy: Object.freeze({
      not_started: `${normalizedLaneKey}_attorney_task_reset`,
      in_progress: `${normalizedLaneKey}_attorney_task_started`,
      waiting: `${normalizedLaneKey}_attorney_task_waiting`,
      blocked: `${normalizedLaneKey}_attorney_task_blocked`,
      completed: `${normalizedLaneKey}_attorney_task_completed`,
      completed_externally: `${normalizedLaneKey}_attorney_task_completed_externally`,
      not_applicable: `${normalizedLaneKey}_attorney_task_not_applicable`,
    }),
  }

  if (!contract.taskKey || !contract.label) {
    throw new Error('Attorney task operational contracts require a task key and label.')
  }

  return Object.freeze(contract)
}

export function assertAttorneyTaskStatusAction(contract, status) {
  const normalizedStatus = key(status)
  const actionId = ATTORNEY_TASK_STATUS_ACTIONS[normalizedStatus]
  if (!contract?.version || !actionId) {
    throw new Error('This attorney task status action is not supported by the operational contract.')
  }
  const allowed = (contract.allowedActions || []).some((action) => action.status === normalizedStatus)
  if (normalizedStatus !== 'not_started' && !allowed) {
    throw new Error(`The ${normalizedStatus} action is not available for this attorney task.`)
  }
  return actionId
}

export function buildAttorneyTaskMutationPacket(contract, {
  status = 'in_progress',
  workPacket = null,
} = {}) {
  if (!contract?.version) return workPacket
  const normalizedStatus = key(status)
  const clientAudience = contract.visibilityPolicy?.clientAudience || []
  const existing = workPacket && typeof workPacket === 'object' ? workPacket : {}
  const priority = normalizedStatus === 'blocked' ? 'urgent' : existing.priority || 'required'
  const audience = clientAudience.length === 0
    ? 'attorney'
    : clientAudience.length === 1
      ? clientAudience[0]
      : 'buyer_and_seller'
  return {
    ...existing,
    title: existing.title || contract.primaryAction?.label || contract.label,
    laneKey: contract.laneKey,
    laneLabel: contract.laneLabel,
    stageKey: contract.taskKey,
    stageLabel: contract.label,
    commandType: existing.commandType || 'update_task_status',
    audience: existing.audience || audience,
    audienceLabel: existing.audienceLabel || (audience === 'attorney' ? 'Attorney team' : clientAudience.length === 1 ? clientAudience[0] : 'Buyer and seller'),
    priority,
    visibility: existing.visibility || contract.visibilityPolicy?.defaultVisibility || 'professional_shared',
    checklist: existing.checklist || contract.requirements?.evidence || [],
    contractVersion: contract.version,
    taskType: contract.taskType,
    statusAction: ATTORNEY_TASK_STATUS_ACTIONS[normalizedStatus] || '',
    clientAudience,
    eventKey: contract.eventPolicy?.[normalizedStatus] || '',
  }
}

export function presentAttorneyTaskOperationalContract(contract, { viewerRole = 'attorney' } = {}) {
  if (!contract?.version) return null
  const normalizedViewerRole = key(viewerRole)
  if (normalizedViewerRole === 'buyer' || normalizedViewerRole === 'seller') {
    if (!contract.visibilityPolicy?.clientVisibleAllowed) return null
    if (!(contract.visibilityPolicy?.clientAudience || []).includes(normalizedViewerRole)) return null
    return {
      version: contract.version,
      laneKey: contract.laneKey,
      taskKey: contract.taskKey,
      label: contract.visibilityPolicy.clientTitle || contract.label,
      description: contract.visibilityPolicy.clientDescription || 'Your legal team is progressing this step.',
      taskType: contract.taskType,
    }
  }
  return contract
}
