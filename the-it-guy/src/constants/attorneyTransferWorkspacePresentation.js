export const TRANSFER_WORKSPACE_STATUS = Object.freeze({
  complete: 'complete',
  inProgress: 'in_progress',
  waiting: 'waiting',
  blocked: 'blocked',
  notStarted: 'not_started',
})

export const TRANSFER_WORKSPACE_STATUS_OPTIONS = Object.freeze([
  { key: TRANSFER_WORKSPACE_STATUS.complete, label: 'Complete' },
  { key: TRANSFER_WORKSPACE_STATUS.inProgress, label: 'In progress' },
  { key: TRANSFER_WORKSPACE_STATUS.waiting, label: 'Waiting' },
  { key: TRANSFER_WORKSPACE_STATUS.blocked, label: 'Blocked' },
  { key: TRANSFER_WORKSPACE_STATUS.notStarted, label: 'Not started' },
])

export const TRANSFER_WORKSPACE_SECTION_ORDER = Object.freeze([
  'steps',
  'required_information',
  'documents',
  'evidence',
  'activity',
])

export const TRANSFER_WORKSPACE_PHASES = Object.freeze([
  {
    key: 'open_file',
    label: 'Open File',
    description: 'Receive the instruction, open the matter, and validate the source and property information.',
    stageKeys: [
      'instruction_received',
      'matter_opened',
      'otp_source_docs_checked',
      'title_deed_checked',
      'existing_bond_confirmed',
    ],
  },
  {
    key: 'parties_fica',
    label: 'Parties & FICA',
    description: 'Collect, review, and approve party identity and authority information.',
    stageKeys: [
      'buyer_fica_requested',
      'buyer_fica_received',
      'buyer_fica_approved',
      'seller_fica_requested',
      'seller_fica_received',
      'seller_fica_approved',
      'entity_authority_checked',
    ],
  },
  {
    key: 'duty_clearances',
    label: 'Duty & Clearances',
    description: 'Complete duty treatment, municipal, levy, and compliance requirements.',
    stageKeys: [
      'transfer_duty_assessment_prepared',
      'transfer_duty_submitted',
      'transfer_duty_receipt_received',
      'rates_figures_requested',
      'rates_payment_confirmed',
      'rates_clearance_received',
      'levy_clearance_requested',
      'levy_clearance_received',
      'compliance_certificates_received',
    ],
  },
  {
    key: 'documents_signing_guarantees',
    label: 'Documents, Signing & Guarantees',
    description: 'Prepare and sign the transfer pack and secure acceptable guarantees or undertakings.',
    stageKeys: [
      'transfer_documents_prepared',
      'buyer_signing_scheduled',
      'buyer_signed_transfer_documents',
      'seller_signing_scheduled',
      'seller_signed_transfer_documents',
      'guarantees_requested',
      'guarantees_received',
      'transfer_guarantees_accepted',
    ],
  },
  {
    key: 'lodgement_registration',
    label: 'Lodgement & Registration',
    description: 'Prepare the lodgement pack and track the matter through registration.',
    stageKeys: [
      'lodgement_pack_prepared',
      'lodgement_ready',
      'lodged_at_deeds_office',
      'in_prep',
      'registered',
    ],
  },
  {
    key: 'close_out',
    label: 'Close-Out',
    description: 'Complete final accounts, notify stakeholders, and close the matter.',
    stageKeys: [
      'final_accounts_prepared',
      'registration_letter_issued',
      'matter_closed',
    ],
  },
])

export const TRANSFER_WORKSPACE_CONTENT_OWNERSHIP = Object.freeze({
  matterHeader: ['overall_status', 'current_phase', 'progress', 'assigned_attorney'],
  nextAction: ['primary_action', 'reason', 'due_date', 'responsible_party'],
  phase: [...TRANSFER_WORKSPACE_SECTION_ORDER],
})

export const TRANSFER_WORKSPACE_ACTION_CONTRACT = Object.freeze({
  assign_attorney: {
    label: 'Assign attorney',
    intendedResult: 'Open the assignment selector for the relevant legal lane.',
    currentCommandType: 'open_assignments',
    aligned: true,
  },
  request_document: {
    label: 'Request document',
    intendedResult: 'Open a prefilled request linked to the selected document requirement.',
    currentCommandType: 'request_document',
    aligned: true,
  },
  request_corrected_document: {
    label: 'Request correction',
    intendedResult: 'Open a correction request linked to the rejected document.',
    currentCommandType: 'request_document',
    aligned: true,
  },
  complete_stage_evidence: {
    label: 'Mark step complete',
    intendedResult: 'Show the required evidence and complete the selected step after confirmation.',
    currentCommandType: 'complete_step',
    aligned: true,
  },
  update_matter_data: {
    label: 'Capture information',
    intendedResult: 'Open the actual missing matter field and save the captured value.',
    currentCommandType: 'capture_matter_data',
    aligned: true,
  },
  manage_signing: {
    label: 'Schedule signing',
    intendedResult: 'Open a signing form with party, date, time, channel, and document pack.',
    currentCommandType: 'schedule_signing',
    aligned: true,
  },
  resolve_blocker: {
    label: 'Resolve blocker',
    intendedResult: 'Capture the resolution and update the blocked step status.',
    currentCommandType: 'resolve_blocker',
    aligned: true,
  },
  review_workflow: {
    label: 'Review workflow',
    intendedResult: 'Open the relevant phase and focus the item that needs review.',
    currentCommandType: 'focus_workflow',
    aligned: true,
  },
})

export function getTransferWorkspacePhaseForStage(stageKey = '') {
  const normalizedStageKey = String(stageKey || '').trim().toLowerCase()
  return TRANSFER_WORKSPACE_PHASES.find((phase) => phase.stageKeys.includes(normalizedStageKey)) || null
}

export function buildTransferWorkspaceRequirementOwnership(stageDefinitions = [], requirementField = 'requiredData') {
  const definitions = Array.isArray(stageDefinitions) ? stageDefinitions : []
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]))
  const ownership = {}

  for (const phase of TRANSFER_WORKSPACE_PHASES) {
    for (const stageKey of phase.stageKeys) {
      const definition = definitionsByKey.get(stageKey)
      const requirements = Array.isArray(definition?.[requirementField]) ? definition[requirementField] : []
      for (const requirement of requirements) {
        const requirementId = typeof requirement === 'string' ? requirement : requirement?.id || requirement?.key
        if (!requirementId || ownership[requirementId]) continue
        ownership[requirementId] = { phaseKey: phase.key, stageKey }
      }
    }
  }

  return ownership
}

export function buildTransferWorkspacePhaseMap(stageDefinitions = []) {
  const definitions = Array.isArray(stageDefinitions) ? stageDefinitions : []
  const definitionsByKey = new Map(definitions.map((definition) => [definition.key, definition]))
  const phases = TRANSFER_WORKSPACE_PHASES.map((phase) => ({
    ...phase,
    sections: [...TRANSFER_WORKSPACE_SECTION_ORDER],
    steps: phase.stageKeys.map((stageKey) => definitionsByKey.get(stageKey)).filter(Boolean),
  }))
  const assignedStageKeys = new Set(TRANSFER_WORKSPACE_PHASES.flatMap((phase) => phase.stageKeys))

  return {
    phases,
    unassignedSteps: definitions.filter((definition) => !assignedStageKeys.has(definition.key)),
    missingStageKeys: [...assignedStageKeys].filter((stageKey) => !definitionsByKey.has(stageKey)),
  }
}
