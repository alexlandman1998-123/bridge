import { getAttorneyStageDefinitionsForLane } from '../../constants/attorneyWorkflowStages.js'
import {
  BOND_APPLICATION_JOURNEY_STAGE_DEFINITIONS,
  BOND_APPLICATION_JOURNEY_STAGE_KEYS,
  BOND_APPLICATION_JOURNEY_VERSION,
} from '../../modules/bond/application/journey/bondApplicationJourney.js'
import {
  BOND_HYBRID_FINANCE_STAGE_LABELS,
  BOND_HYBRID_FINANCE_STAGES,
  BOND_HYBRID_FINANCE_WORKFLOW_TYPE,
} from '../../core/transactions/bondHybridFinanceWorkflow.js'
import { BOND_ATTORNEY_STAGE_COMMAND_PRESETS } from '../../constants/attorneyWorkflowUsability.js'
import { BOND_CONSULTANT_ACTIONS } from '../bondConsultantActionService.js'

export const BOND_LANE_PHASE1_JOURNEY_VERSION = 'bond-lane-phase1-originator-attorney-map-v1'
export const BOND_LANE_PHASE2_ACTION_AUDIT_VERSION = 'bond-lane-phase2-action-audit-v1'
export const BOND_LANE_PHASE3_COMMAND_PLAN_VERSION = 'bond-lane-phase3-stage-command-plan-v1'

export const BOND_ORIGINATOR_JOURNEY_LANES = Object.freeze([
  Object.freeze({
    key: 'originator_intake',
    label: 'Application Intake',
    ownerRole: 'bond_originator',
    journeyStageKeys: [BOND_APPLICATION_JOURNEY_STAGE_KEYS.received],
    financeStageKeys: ['intake'],
    outcome: 'Application shell and applicant context are opened.',
  }),
  Object.freeze({
    key: 'originator_documents',
    label: 'Applicant Documents',
    ownerRole: 'bond_originator',
    journeyStageKeys: [BOND_APPLICATION_JOURNEY_STAGE_KEYS.documents],
    financeStageKeys: ['documents'],
    outcome: 'Applicant details and blocking finance documents are ready for bank submission.',
  }),
  Object.freeze({
    key: 'originator_bank_submission',
    label: 'Bank Submission',
    ownerRole: 'bond_originator',
    journeyStageKeys: [BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks],
    financeStageKeys: ['submitted_to_banks', 'bank_review'],
    outcome: 'Application pack is submitted and bank feedback is tracked.',
  }),
  Object.freeze({
    key: 'originator_quotes',
    label: 'Bank Quotes and Buyer Decision',
    ownerRole: 'bond_originator',
    journeyStageKeys: [BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes, BOND_APPLICATION_JOURNEY_STAGE_KEYS.grant],
    financeStageKeys: ['quote_received', 'quote_accepted', 'bond_approved', 'grant_received'],
    outcome: 'Preferred bank offer is accepted and formal grant processing starts.',
  }),
  Object.freeze({
    key: 'originator_instruction',
    label: 'Grant and Attorney Instruction',
    ownerRole: 'bond_originator',
    journeyStageKeys: [BOND_APPLICATION_JOURNEY_STAGE_KEYS.instruction, BOND_APPLICATION_JOURNEY_STAGE_KEYS.complete],
    financeStageKeys: ['grant_signed', 'grant_submitted', 'instruction_sent', 'complete'],
    outcome: 'Signed grant and instruction are issued to the bond attorney.',
  }),
])

export const BOND_ATTORNEY_JOURNEY_LANES = Object.freeze([
  Object.freeze({
    key: 'attorney_instruction',
    label: 'Instruction and Bank Detail Capture',
    ownerRole: 'bond_attorney',
    stageKeys: ['bond_instruction_received', 'bank_reference_captured', 'bond_approval_letter_received'],
    outcome: 'Bond attorney has bank instruction, reference, and approval context.',
  }),
  Object.freeze({
    key: 'attorney_bank_conditions',
    label: 'Bank Conditions',
    ownerRole: 'bond_attorney',
    stageKeys: ['bank_requirements_confirmed', 'bank_conditions_outstanding', 'bank_conditions_resolved'],
    outcome: 'Bank requirements are reviewed, assigned, and cleared.',
  }),
  Object.freeze({
    key: 'attorney_bond_documents',
    label: 'Bond Documents and Signing',
    ownerRole: 'bond_attorney',
    stageKeys: [
      'bond_documents_prepared',
      'buyer_bond_signing_scheduled',
      'buyer_signed_bond_documents',
      'bond_documents_sent_to_bank',
      'bank_approval_to_lodge_received',
    ],
    outcome: 'Buyer signs bond documents and bank approval to lodge is received.',
  }),
  Object.freeze({
    key: 'attorney_guarantees',
    label: 'Guarantees',
    ownerRole: 'bond_attorney',
    stageKeys: ['guarantees_issued', 'guarantee_wording_accepted'],
    outcome: 'Guarantees are issued and accepted for transfer coordination.',
  }),
  Object.freeze({
    key: 'attorney_lodgement_registration',
    label: 'Lodgement, Registration, Close-Out',
    ownerRole: 'bond_attorney',
    stageKeys: ['bond_lodgement_ready', 'bond_lodged', 'bond_registered', 'bond_close_out_complete'],
    outcome: 'Bond is lodged with transfer, registered, and closed out with the bank.',
  }),
])

export const BOND_LANE_HANDOFFS = Object.freeze([
  Object.freeze({
    key: 'originator_to_bond_attorney',
    fromOwnerRole: 'bond_originator',
    toOwnerRole: 'bond_attorney',
    fromStageKeys: ['grant_signed', 'grant_submitted', 'instruction_sent'],
    toStageKey: 'bond_instruction_received',
    requiredEvidence: ['signed_grant', 'bond_instruction', 'bank_reference'],
    description: 'Bond originator issues the attorney instruction after grant acceptance/signature.',
  }),
  Object.freeze({
    key: 'bond_attorney_to_transfer_attorney',
    fromOwnerRole: 'bond_attorney',
    toOwnerRole: 'transfer_attorney',
    fromStageKeys: ['guarantees_issued', 'guarantee_wording_accepted'],
    toStageKey: 'transfer_guarantees_accepted',
    requiredEvidence: ['guarantee_letter', 'guarantee_wording_acceptance'],
    description: 'Bond attorney sends guarantees and resolves wording with the transfer attorney.',
  }),
  Object.freeze({
    key: 'bond_attorney_to_lodgement_coordination',
    fromOwnerRole: 'bond_attorney',
    toOwnerRole: 'transfer_attorney',
    fromStageKeys: ['bond_lodgement_ready', 'bond_lodged'],
    toStageKey: 'lodgement_ready',
    requiredEvidence: ['bank_approval_to_lodge', 'bond_lodgement_pack'],
    description: 'Bond attorney coordinates simultaneous lodgement readiness with transfer.',
  }),
])

export const BOND_ORIGINATOR_PHASE2_REQUIRED_ACTIONS = Object.freeze([
  Object.freeze({
    id: 'originator_review_application',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.reviewApplication.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.received,
    financeStageKey: 'intake',
    surfaceKey: 'bond_file_application',
    outcome: 'Open the application and verify buyer finance intake before document review.',
  }),
  Object.freeze({
    id: 'originator_request_documents',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.requestDocuments.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.documents,
    financeStageKey: 'documents',
    surfaceKey: 'bond_file_documents',
    outcome: 'Request missing applicant or supporting finance documents.',
  }),
  Object.freeze({
    id: 'originator_review_documents',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.reviewDocuments.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.documents,
    financeStageKey: 'documents',
    surfaceKey: 'bond_file_documents',
    outcome: 'Review uploaded finance documents before bank submission.',
  }),
  Object.freeze({
    id: 'originator_submit_to_banks',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.submitBank.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks,
    financeStageKey: 'submitted_to_banks',
    surfaceKey: 'bond_file_workflow',
    outcome: 'Submit the completed application pack to selected banks.',
  }),
  Object.freeze({
    id: 'originator_capture_bank_feedback',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.updateBankFeedback.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.banks,
    financeStageKey: 'bank_review',
    surfaceKey: 'bond_file_workflow',
    outcome: 'Capture lender feedback, status movement, or follow-up requirements.',
  }),
  Object.freeze({
    id: 'originator_capture_offer',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.captureOffer.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.quotes,
    financeStageKey: 'quote_received',
    surfaceKey: 'bond_file_workflow',
    outcome: 'Capture a bank quote or offer for buyer review.',
  }),
  Object.freeze({
    id: 'originator_record_buyer_decision',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.recordBuyerDecision.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.grant,
    financeStageKey: 'quote_accepted',
    surfaceKey: 'bond_file_workflow',
    outcome: 'Record the accepted offer or declined outcome.',
  }),
  Object.freeze({
    id: 'originator_record_grant',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.recordGrantReceived.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.grant,
    financeStageKey: 'grant_received',
    surfaceKey: 'bond_file_workflow',
    outcome: 'Capture the formal grant or lender approval evidence.',
  }),
  Object.freeze({
    id: 'originator_record_signed_grant',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.recordGrantSigned.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.instruction,
    financeStageKey: 'grant_signed',
    surfaceKey: 'bond_file_workflow',
    outcome: 'Capture the buyer-signed grant before attorney instruction.',
  }),
  Object.freeze({
    id: 'originator_submit_grant',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.submitGrant.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.instruction,
    financeStageKey: 'grant_submitted',
    surfaceKey: 'bond_file_workflow',
    outcome: 'Mark the signed grant as submitted for instruction.',
  }),
  Object.freeze({
    id: 'originator_send_attorney_instruction',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.sendAttorneyInstruction.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.instruction,
    financeStageKey: 'instruction_sent',
    surfaceKey: 'bond_file_workflow',
    handoffKey: 'originator_to_bond_attorney',
    outcome: 'Issue the bond instruction handoff to the bond attorney.',
  }),
  Object.freeze({
    id: 'originator_monitor_registration',
    ownerRole: 'bond_originator',
    sourceActionKey: BOND_CONSULTANT_ACTIONS.monitorRegistration.key,
    journeyStageKey: BOND_APPLICATION_JOURNEY_STAGE_KEYS.complete,
    financeStageKey: 'complete',
    surfaceKey: 'bond_file_activity',
    outcome: 'Monitor transfer and bond attorney progress after instruction.',
  }),
])

export const BOND_ATTORNEY_PHASE2_REQUIRED_ACTIONS = Object.freeze([
  Object.freeze({ id: 'attorney_confirm_bond_instruction', ownerRole: 'bond_attorney', stageKey: 'bond_instruction_received', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_capture_bank_details', ownerRole: 'bond_attorney', stageKey: 'bank_reference_captured', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_confirm_approval_letter', ownerRole: 'bond_attorney', stageKey: 'bond_approval_letter_received', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_review_bank_conditions', ownerRole: 'bond_attorney', stageKey: 'bank_requirements_confirmed', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_capture_outstanding_conditions', ownerRole: 'bond_attorney', stageKey: 'bank_conditions_outstanding', commandType: 'add_note', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_resolve_bank_conditions', ownerRole: 'bond_attorney', stageKey: 'bank_conditions_resolved', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_prepare_bond_documents', ownerRole: 'bond_attorney', stageKey: 'bond_documents_prepared', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_schedule_bond_signing', ownerRole: 'bond_attorney', stageKey: 'buyer_bond_signing_scheduled', commandType: 'schedule_signing', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_capture_signed_bond_documents', ownerRole: 'bond_attorney', stageKey: 'buyer_signed_bond_documents', commandType: 'request_document', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_send_docs_to_bank', ownerRole: 'bond_attorney', stageKey: 'bond_documents_sent_to_bank', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_confirm_approval_to_lodge', ownerRole: 'bond_attorney', stageKey: 'bank_approval_to_lodge_received', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_issue_guarantees', ownerRole: 'bond_attorney', stageKey: 'guarantees_issued', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel', handoffKey: 'bond_attorney_to_transfer_attorney' }),
  Object.freeze({ id: 'attorney_confirm_guarantee_wording', ownerRole: 'bond_attorney', stageKey: 'guarantee_wording_accepted', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel', handoffKey: 'bond_attorney_to_transfer_attorney' }),
  Object.freeze({ id: 'attorney_mark_lodgement_ready', ownerRole: 'bond_attorney', stageKey: 'bond_lodgement_ready', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel', handoffKey: 'bond_attorney_to_lodgement_coordination' }),
  Object.freeze({ id: 'attorney_mark_bond_lodged', ownerRole: 'bond_attorney', stageKey: 'bond_lodged', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel', handoffKey: 'bond_attorney_to_lodgement_coordination' }),
  Object.freeze({ id: 'attorney_confirm_bond_registration', ownerRole: 'bond_attorney', stageKey: 'bond_registered', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
  Object.freeze({ id: 'attorney_close_bond_matter', ownerRole: 'bond_attorney', stageKey: 'bond_close_out_complete', commandType: 'complete_step', surfaceKey: 'attorney_workflow_action_panel' }),
])

export const BOND_PHASE2_ACTION_SURFACES = Object.freeze([
  Object.freeze({
    key: 'bond_file_application',
    ownerRole: 'bond_originator',
    component: 'Bond file application workspace',
    executionMode: 'deep_link',
    supportsMutation: true,
    description: 'Originator opens and verifies application intake.',
  }),
  Object.freeze({
    key: 'bond_file_documents',
    ownerRole: 'bond_originator',
    component: 'Bond file documents workspace',
    executionMode: 'deep_link',
    supportsMutation: true,
    description: 'Originator requests and reviews finance documents.',
  }),
  Object.freeze({
    key: 'bond_file_workflow',
    ownerRole: 'bond_originator',
    component: 'Bond file workflow workspace',
    executionMode: 'deep_link',
    supportsMutation: true,
    description: 'Originator submits to banks, captures feedback, offers, grants, and instruction status.',
  }),
  Object.freeze({
    key: 'bond_file_activity',
    ownerRole: 'bond_originator',
    component: 'Bond file activity workspace',
    executionMode: 'deep_link',
    supportsMutation: false,
    description: 'Originator monitors attorney-side registration progress.',
  }),
  Object.freeze({
    key: 'originator_progress_panel',
    ownerRole: 'attorney',
    component: 'BondOriginatorAgentProgressView',
    executionMode: 'read_only_navigation',
    supportsMutation: false,
    description: 'Attorney can inspect originator bank feedback, documents, offers, grants, and open finance/doc/activity tabs.',
  }),
  Object.freeze({
    key: 'originator_attorney_handoff',
    ownerRole: 'attorney',
    component: 'BondOriginatorAttorneyHandoffView',
    executionMode: 'read_only_evidence',
    supportsMutation: false,
    description: 'Attorney can view instruction evidence, grant documents, and roleplayer allocation.',
  }),
  Object.freeze({
    key: 'attorney_workflow_action_panel',
    ownerRole: 'bond_attorney',
    component: 'LegalWorkflowActionPanel',
    executionMode: 'workflow_command',
    supportsMutation: true,
    description: 'Bond attorney next actions open assignment, document, signing, note, or step-completion commands.',
  }),
  Object.freeze({
    key: 'attorney_workflow_progress',
    ownerRole: 'bond_attorney',
    component: 'LegalWorkflowProgressBar',
    executionMode: 'quick_stage_update',
    supportsMutation: true,
    description: 'Bond attorney can update any non-linear stage directly without forcing a sticky sequence.',
  }),
])

function flatten(groups = [], property = 'stageKeys') {
  return groups.flatMap((group) => Array.isArray(group[property]) ? group[property] : [])
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function indexByKey(items = []) {
  return new Map(items.map((item) => [item.key, item]))
}

function buildActionCoverage(actions = [], surfaces = []) {
  const surfaceIndex = indexByKey(surfaces)
  return actions.map((action) => ({
    ...action,
    surface: surfaceIndex.get(action.surfaceKey) || null,
    covered: surfaceIndex.has(action.surfaceKey),
  }))
}

export function buildBondLaneJourneyMap() {
  const originatorJourneyStageKeys = BOND_APPLICATION_JOURNEY_STAGE_DEFINITIONS.map((stage) => stage.key)
  const mappedOriginatorJourneyStageKeys = flatten(BOND_ORIGINATOR_JOURNEY_LANES, 'journeyStageKeys')
  const mappedOriginatorFinanceStageKeys = flatten(BOND_ORIGINATOR_JOURNEY_LANES, 'financeStageKeys')
  const attorneyStageDefinitions = getAttorneyStageDefinitionsForLane('bond')
  const attorneyStageKeys = attorneyStageDefinitions.map((stage) => stage.key)
  const mappedAttorneyStageKeys = flatten(BOND_ATTORNEY_JOURNEY_LANES, 'stageKeys')
  const missingOriginatorJourneyStageKeys = originatorJourneyStageKeys.filter((stageKey) => !mappedOriginatorJourneyStageKeys.includes(stageKey))
  const missingOriginatorFinanceStageKeys = BOND_HYBRID_FINANCE_STAGES.filter((stageKey) => !mappedOriginatorFinanceStageKeys.includes(stageKey))
  const missingAttorneyStageKeys = attorneyStageKeys.filter((stageKey) => !mappedAttorneyStageKeys.includes(stageKey))
  const unknownAttorneyStageKeys = mappedAttorneyStageKeys.filter((stageKey) => !attorneyStageKeys.includes(stageKey))
  const duplicateAttorneyStageKeys = mappedAttorneyStageKeys.filter((stageKey, index, values) => values.indexOf(stageKey) !== index)

  return {
    version: BOND_LANE_PHASE1_JOURNEY_VERSION,
    originator: {
      ownerRole: 'bond_originator',
      sourceVersion: BOND_APPLICATION_JOURNEY_VERSION,
      workflowType: BOND_HYBRID_FINANCE_WORKFLOW_TYPE,
      lanes: BOND_ORIGINATOR_JOURNEY_LANES,
      journeyStageKeys: originatorJourneyStageKeys,
      mappedJourneyStageKeys: unique(mappedOriginatorJourneyStageKeys),
      financeStageKeys: BOND_HYBRID_FINANCE_STAGES,
      financeStageLabels: BOND_HYBRID_FINANCE_STAGE_LABELS,
      mappedFinanceStageKeys: unique(mappedOriginatorFinanceStageKeys),
      missingJourneyStageKeys: missingOriginatorJourneyStageKeys,
      missingFinanceStageKeys: missingOriginatorFinanceStageKeys,
    },
    attorney: {
      ownerRole: 'bond_attorney',
      lanes: BOND_ATTORNEY_JOURNEY_LANES,
      stageKeys: attorneyStageKeys,
      stageLabels: Object.fromEntries(attorneyStageDefinitions.map((stage) => [stage.key, stage.label])),
      mappedStageKeys: unique(mappedAttorneyStageKeys),
      missingStageKeys: missingAttorneyStageKeys,
      unknownStageKeys: unknownAttorneyStageKeys,
      duplicateStageKeys: unique(duplicateAttorneyStageKeys),
    },
    handoffs: BOND_LANE_HANDOFFS,
    rolloutBaseline: {
      originatorCompleteBeforeAttorneyInstruction: true,
      attorneyStartsAt: 'bond_instruction_received',
      transferGuaranteeDependency: 'transfer_guarantees_accepted',
      simultaneousLodgementDependency: 'lodgement_ready',
    },
  }
}

export function buildBondLanePhase2ActionAudit() {
  const journeyMap = buildBondLaneJourneyMap()
  const actionSurfaces = BOND_PHASE2_ACTION_SURFACES
  const surfaceKeys = actionSurfaces.map((surface) => surface.key)
  const originatorSourceActionKeys = Object.values(BOND_CONSULTANT_ACTIONS).map((action) => action.key)
  const attorneyStageLabelByKey = journeyMap.attorney.stageLabels
  const handoffKeys = BOND_LANE_HANDOFFS.map((handoff) => handoff.key)

  const originatorRequiredActions = buildActionCoverage(BOND_ORIGINATOR_PHASE2_REQUIRED_ACTIONS, actionSurfaces).map((action) => ({
    ...action,
    sourceAction: Object.values(BOND_CONSULTANT_ACTIONS).find((candidate) => candidate.key === action.sourceActionKey) || null,
  }))
  const attorneyRequiredActions = buildActionCoverage(BOND_ATTORNEY_PHASE2_REQUIRED_ACTIONS, actionSurfaces).map((action) => ({
    ...action,
    label: attorneyStageLabelByKey[action.stageKey] || action.stageKey,
    laneKey: 'bond',
  }))

  const structuralBlockers = [
    ...originatorRequiredActions
      .filter((action) => !originatorSourceActionKeys.includes(action.sourceActionKey))
      .map((action) => `Missing bond originator source action: ${action.sourceActionKey}`),
    ...originatorRequiredActions
      .filter((action) => !journeyMap.originator.journeyStageKeys.includes(action.journeyStageKey))
      .map((action) => `Unknown originator journey stage for ${action.id}: ${action.journeyStageKey}`),
    ...originatorRequiredActions
      .filter((action) => !journeyMap.originator.financeStageKeys.includes(action.financeStageKey))
      .map((action) => `Unknown originator finance stage for ${action.id}: ${action.financeStageKey}`),
    ...attorneyRequiredActions
      .filter((action) => !journeyMap.attorney.stageKeys.includes(action.stageKey))
      .map((action) => `Unknown bond attorney stage for ${action.id}: ${action.stageKey}`),
    ...[...originatorRequiredActions, ...attorneyRequiredActions]
      .filter((action) => !surfaceKeys.includes(action.surfaceKey))
      .map((action) => `Missing action surface for ${action.id}: ${action.surfaceKey}`),
    ...[...originatorRequiredActions, ...attorneyRequiredActions]
      .filter((action) => action.handoffKey && !handoffKeys.includes(action.handoffKey))
      .map((action) => `Missing handoff for ${action.id}: ${action.handoffKey}`),
  ]

  const coveredHandoffKeys = unique(
    [...originatorRequiredActions, ...attorneyRequiredActions]
      .map((action) => action.handoffKey),
  )
  const handoffActionCoverage = BOND_LANE_HANDOFFS.map((handoff) => ({
    handoffKey: handoff.key,
    covered: coveredHandoffKeys.includes(handoff.key),
    actionIds: [...originatorRequiredActions, ...attorneyRequiredActions]
      .filter((action) => action.handoffKey === handoff.key)
      .map((action) => action.id),
  }))

  return {
    version: BOND_LANE_PHASE2_ACTION_AUDIT_VERSION,
    journeyVersion: journeyMap.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase3',
    originator: {
      ownerRole: 'bond_originator',
      requiredActions: originatorRequiredActions,
      mutationSurface: 'bond_file',
      attorneyWorkspacePolicy: 'read_only_observable',
    },
    attorney: {
      ownerRole: 'bond_attorney',
      requiredActions: attorneyRequiredActions,
      mutationSurface: 'attorney_workflow',
      nonLinearWorkflowPolicy: 'any_stage_can_be_updated_without_forcing_previous_stage_completion',
    },
    actionSurfaces,
    handoffActionCoverage,
    implementationGaps: [
      'Originator progress and handoff panels inside the attorney workspace are intentionally read-only; mutation remains in the bond file deep-link surfaces.',
      'Bond attorney actions currently use generic workflow commands; stage-specific forms for bank conditions, guarantees, and lodgement references are Phase 3 candidates.',
      'Guarantee wording acceptance is represented in the bond attorney lane and transfer lane, but the cross-lane command should be tested as a coordinated two-party workflow in Phase 3.',
    ],
    structuralBlockers,
  }
}

export function buildBondLanePhase3CommandPlan() {
  const phase2 = buildBondLanePhase2ActionAudit()
  const presetStageKeys = Object.keys(BOND_ATTORNEY_STAGE_COMMAND_PRESETS)
  const attorneyStageKeys = phase2.attorney.requiredActions.map((action) => action.stageKey)
  const missingPresetStageKeys = attorneyStageKeys.filter((stageKey) => !presetStageKeys.includes(stageKey))
  const unusedPresetStageKeys = presetStageKeys.filter((stageKey) => !attorneyStageKeys.includes(stageKey))
  const noteOnlyStageKeys = presetStageKeys.filter((stageKey) => BOND_ATTORNEY_STAGE_COMMAND_PRESETS[stageKey]?.commandType === 'add_note')
  const stageSpecificCommands = phase2.attorney.requiredActions.map((action) => {
    const preset = BOND_ATTORNEY_STAGE_COMMAND_PRESETS[action.stageKey] || null
    return {
      actionId: action.id,
      stageKey: action.stageKey,
      stageLabel: action.label,
      commandLabel: preset?.label || action.label,
      commandType: preset?.commandType || 'complete_step',
      checklist: preset?.checklist || [],
      hasPreset: Boolean(preset),
      noteOnly: preset?.commandType === 'add_note',
    }
  })

  const structuralBlockers = [
    ...phase2.structuralBlockers,
    ...missingPresetStageKeys.map((stageKey) => `Missing bond stage command preset: ${stageKey}`),
    ...unusedPresetStageKeys.map((stageKey) => `Unused bond stage command preset: ${stageKey}`),
  ]

  return {
    version: BOND_LANE_PHASE3_COMMAND_PLAN_VERSION,
    phase2Version: phase2.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase4',
    stageSpecificCommands,
    noteOnlyStageKeys,
    rolloutRules: [
      'Use existing workflow mutation endpoints for step, note, document, and signing updates.',
      'Keep originator mutation in the bond file workspace; attorney-side originator panels remain read-only.',
      'Allow bond attorney stages to be opened and updated independently so concurrent work is not blocked by previous incomplete stages.',
    ],
    structuralBlockers,
  }
}
