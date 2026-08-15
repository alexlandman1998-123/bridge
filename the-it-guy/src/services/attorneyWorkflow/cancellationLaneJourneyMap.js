import { getAttorneyStageDefinitionsForLane } from '../../constants/attorneyWorkflowStages.js'
import {
  ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS,
  CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS,
  buildAttorneyWorkflowActionCommand,
} from '../../constants/attorneyWorkflowUsability.js'

export const CANCELLATION_LANE_PHASE1_JOURNEY_VERSION = 'cancellation-lane-phase1-journey-map-v1'
export const CANCELLATION_LANE_PHASE2_ACTION_AUDIT_VERSION = 'cancellation-lane-phase2-action-audit-v1'
export const CANCELLATION_LANE_PHASE4_GUARANTEE_COORDINATION_VERSION = 'cancellation-lane-phase4-guarantee-coordination-v1'
export const CANCELLATION_LANE_PHASE5_LODGEMENT_COORDINATION_VERSION = 'cancellation-lane-phase5-lodgement-coordination-v1'
export const CANCELLATION_LANE_PHASE6_SCENARIO_COVERAGE_VERSION = 'cancellation-lane-phase6-scenario-coverage-v1'
export const CANCELLATION_LANE_PHASE7_ROLLOUT_READINESS_VERSION = 'cancellation-lane-phase7-rollout-readiness-v1'
export const CANCELLATION_LANE_PHASE8_UAT_RELEASE_GATE_VERSION = 'cancellation-lane-phase8-uat-release-gate-v1'
export const CANCELLATION_LANE_PHASE9_ACTION_COMMAND_RELEASE_VERSION = 'cancellation-lane-phase9-action-command-release-v1'

export const CANCELLATION_ATTORNEY_JOURNEY_LANES = Object.freeze([
  Object.freeze({
    key: 'cancellation_instruction',
    label: 'Instruction and Existing Bond Intake',
    ownerRole: 'cancellation_attorney',
    stageKeys: [
      'cancellation_existing_bond_confirmed',
      'cancellation_bank_captured',
      'cancellation_bond_account_captured',
      'cancellation_instruction_received',
    ],
    outcome: 'Cancellation attorney has the seller bond position, bank, account reference, and formal instruction.',
  }),
  Object.freeze({
    key: 'cancellation_notice_figures',
    label: 'Notice, Figures, and Bank Risk',
    ownerRole: 'cancellation_attorney',
    stageKeys: [
      'notice_period_captured',
      'cancellation_figures_requested',
      'cancellation_figures_received',
      'figures_expiry_captured',
      'notice_penalty_risk_captured',
    ],
    outcome: 'Settlement figures, expiry, and notice or penalty risk are visible before guarantees and lodgement.',
  }),
  Object.freeze({
    key: 'cancellation_guarantees',
    label: 'Cancellation Guarantees',
    ownerRole: 'cancellation_attorney',
    stageKeys: [
      'cancellation_guarantees_requested',
      'cancellation_guarantees_received',
      'cancellation_guarantees_accepted',
    ],
    outcome: 'Guarantees are requested, checked against figures, and accepted for transfer coordination.',
  }),
  Object.freeze({
    key: 'cancellation_documents',
    label: 'Cancellation Documents and Seller Signing',
    ownerRole: 'cancellation_attorney',
    stageKeys: [
      'cancellation_documents_prepared',
      'seller_cancellation_documents_signed',
    ],
    outcome: 'Cancellation documents are prepared and seller signature requirements are complete where required.',
  }),
  Object.freeze({
    key: 'cancellation_lodgement_registration',
    label: 'Lodgement, Registration, Settlement, Close-Out',
    ownerRole: 'cancellation_attorney',
    stageKeys: [
      'cancellation_lodgement_ready',
      'cancellation_lodged',
      'cancellation_registered',
      'settlement_proof_captured',
      'cancellation_close_out_complete',
    ],
    outcome: 'Cancellation is lodged with transfer, registered, settled, and closed out with the bank.',
  }),
])

export const CANCELLATION_LANE_HANDOFFS = Object.freeze([
  Object.freeze({
    key: 'transfer_to_cancellation_attorney',
    fromOwnerRole: 'transfer_attorney',
    toOwnerRole: 'cancellation_attorney',
    fromStageKeys: ['existing_bond_confirmed'],
    toStageKey: 'cancellation_existing_bond_confirmed',
    requiredEvidence: ['seller_existing_bond_confirmation', 'seller_bond_bank', 'seller_bond_account_number'],
    description: 'Transfer attorney activates cancellation once the seller existing bond position requires cancellation.',
  }),
  Object.freeze({
    key: 'cancellation_to_transfer_guarantee_alignment',
    fromOwnerRole: 'cancellation_attorney',
    toOwnerRole: 'transfer_attorney',
    fromStageKeys: [
      'cancellation_figures_received',
      'figures_expiry_captured',
      'cancellation_guarantees_requested',
      'cancellation_guarantees_accepted',
    ],
    toStageKey: 'transfer_guarantees_accepted',
    requiredEvidence: ['cancellation_figures', 'figures_expiry_date', 'guarantee_letter', 'guarantee_acceptance'],
    description: 'Cancellation attorney supplies figures and confirms guarantee acceptance before transfer proceeds to lodgement.',
  }),
  Object.freeze({
    key: 'cancellation_to_lodgement_coordination',
    fromOwnerRole: 'cancellation_attorney',
    toOwnerRole: 'transfer_attorney',
    fromStageKeys: ['cancellation_lodgement_ready', 'cancellation_lodged'],
    toStageKey: 'lodgement_ready',
    requiredEvidence: ['cancellation_lodgement_pack', 'valid_cancellation_figures', 'simultaneous_lodgement_confirmation'],
    description: 'Cancellation attorney coordinates readiness and simultaneous lodgement with transfer.',
  }),
  Object.freeze({
    key: 'cancellation_registration_close_out',
    fromOwnerRole: 'cancellation_attorney',
    toOwnerRole: 'transfer_attorney',
    fromStageKeys: ['cancellation_registered', 'settlement_proof_captured', 'cancellation_close_out_complete'],
    toStageKey: 'registered',
    requiredEvidence: ['cancellation_registration_confirmation', 'settlement_payment_reference', 'bank_close_out_confirmation'],
    description: 'Cancellation attorney confirms registration and settlement close-out after simultaneous registration.',
  }),
])

export const CANCELLATION_PHASE2_REQUIRED_ACTIONS = Object.freeze([
  Object.freeze({ id: 'transfer_confirm_existing_bond_for_cancellation', ownerRole: 'transfer_attorney', stageKey: 'existing_bond_confirmed', commandType: 'complete_step', surfaceKey: 'transfer_workflow_action_panel', handoffKey: 'transfer_to_cancellation_attorney' }),
  Object.freeze({ id: 'cancellation_confirm_existing_bond', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_existing_bond_confirmed', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'transfer_to_cancellation_attorney' }),
  Object.freeze({ id: 'cancellation_capture_bank', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_bank_captured', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel' }),
  Object.freeze({ id: 'cancellation_capture_bond_account', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_bond_account_captured', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel' }),
  Object.freeze({ id: 'cancellation_confirm_instruction', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_instruction_received', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel' }),
  Object.freeze({ id: 'cancellation_capture_notice_period', ownerRole: 'cancellation_attorney', stageKey: 'notice_period_captured', commandType: 'add_note', surfaceKey: 'cancellation_workflow_action_panel' }),
  Object.freeze({ id: 'cancellation_request_figures', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_figures_requested', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_to_transfer_guarantee_alignment' }),
  Object.freeze({ id: 'cancellation_capture_figures_received', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_figures_received', commandType: 'request_document', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_to_transfer_guarantee_alignment' }),
  Object.freeze({ id: 'cancellation_capture_figures_expiry', ownerRole: 'cancellation_attorney', stageKey: 'figures_expiry_captured', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_to_transfer_guarantee_alignment' }),
  Object.freeze({ id: 'cancellation_capture_penalty_risk', ownerRole: 'cancellation_attorney', stageKey: 'notice_penalty_risk_captured', commandType: 'add_note', surfaceKey: 'cancellation_workflow_action_panel' }),
  Object.freeze({ id: 'cancellation_request_guarantees', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_guarantees_requested', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_to_transfer_guarantee_alignment' }),
  Object.freeze({ id: 'cancellation_capture_guarantees_received', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_guarantees_received', commandType: 'request_document', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_to_transfer_guarantee_alignment' }),
  Object.freeze({ id: 'cancellation_accept_guarantees', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_guarantees_accepted', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_to_transfer_guarantee_alignment' }),
  Object.freeze({ id: 'cancellation_prepare_documents', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_documents_prepared', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel' }),
  Object.freeze({ id: 'cancellation_capture_seller_signed_documents', ownerRole: 'cancellation_attorney', stageKey: 'seller_cancellation_documents_signed', commandType: 'request_document', surfaceKey: 'cancellation_workflow_action_panel' }),
  Object.freeze({ id: 'cancellation_mark_lodgement_ready', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_lodgement_ready', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_to_lodgement_coordination' }),
  Object.freeze({ id: 'cancellation_mark_lodged', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_lodged', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_to_lodgement_coordination' }),
  Object.freeze({ id: 'cancellation_confirm_registration', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_registered', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_registration_close_out' }),
  Object.freeze({ id: 'cancellation_capture_settlement_proof', ownerRole: 'cancellation_attorney', stageKey: 'settlement_proof_captured', commandType: 'add_note', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_registration_close_out' }),
  Object.freeze({ id: 'cancellation_close_matter', ownerRole: 'cancellation_attorney', stageKey: 'cancellation_close_out_complete', commandType: 'complete_step', surfaceKey: 'cancellation_workflow_action_panel', handoffKey: 'cancellation_registration_close_out' }),
])

export const CANCELLATION_PHASE2_ACTION_SURFACES = Object.freeze([
  Object.freeze({
    key: 'transfer_workflow_action_panel',
    ownerRole: 'transfer_attorney',
    component: 'LegalWorkflowActionPanel',
    executionMode: 'workflow_command',
    supportsMutation: true,
    description: 'Transfer attorney confirms seller existing bond and activates the cancellation lane.',
  }),
  Object.freeze({
    key: 'cancellation_workflow_action_panel',
    ownerRole: 'cancellation_attorney',
    component: 'LegalWorkflowActionPanel',
    executionMode: 'workflow_command',
    supportsMutation: true,
    description: 'Cancellation attorney actions open step, note, document, guarantee, signing, lodgement, and close-out commands.',
  }),
  Object.freeze({
    key: 'cancellation_workflow_progress',
    ownerRole: 'cancellation_attorney',
    component: 'LegalWorkflowProgressBar',
    executionMode: 'quick_stage_update',
    supportsMutation: true,
    description: 'Cancellation attorney can update non-linear stages without forcing previous work to complete first.',
  }),
  Object.freeze({
    key: 'cancellation_coordination_panel',
    ownerRole: 'professional_shared',
    component: 'LegalWorkflowCoordinationPanel',
    executionMode: 'coordination_command',
    supportsMutation: true,
    description: 'Transfer, bond, and cancellation professionals can coordinate guarantees and simultaneous lodgement.',
  }),
])

export const CANCELLATION_PHASE4_GUARANTEE_COORDINATION_PAIRS = Object.freeze([
  Object.freeze({
    key: 'cancellation_acceptance_to_transfer_guarantees',
    requestingLaneKey: 'transfer',
    dependencyLaneKey: 'cancellation',
    coordinationItemId: 'cancellation_cancellation_guarantees_accepted',
    dependencyStageKey: 'cancellation_guarantees_accepted',
    requestingStageKey: 'transfer_guarantees_accepted',
    handoffKey: 'cancellation_to_transfer_guarantee_alignment',
    commandPresetKey: 'cancellation_cancellation_guarantees_accepted',
    outcome: 'Transfer attorney can request cancellation guarantee acceptance before transfer proceeds to lodgement.',
  }),
  Object.freeze({
    key: 'transfer_alignment_to_cancellation_acceptance',
    requestingLaneKey: 'cancellation',
    dependencyLaneKey: 'transfer',
    coordinationItemId: 'transfer_transfer_cancellation_alignment',
    dependencyStageKey: 'transfer_guarantees_accepted',
    requestingStageKey: 'cancellation_guarantees_accepted',
    handoffKey: 'cancellation_to_transfer_guarantee_alignment',
    commandPresetKey: 'transfer_transfer_cancellation_alignment',
    outcome: 'Cancellation attorney can request transfer guarantee alignment before accepting cancellation guarantees.',
  }),
])

export const CANCELLATION_PHASE5_LODGEMENT_COORDINATION_PAIRS = Object.freeze([
  Object.freeze({
    key: 'cancellation_readiness_to_transfer_lodgement',
    requestingLaneKey: 'transfer',
    dependencyLaneKey: 'cancellation',
    coordinationItemId: 'cancellation_cancellation_lodgement_ready',
    dependencyStageKey: 'cancellation_lodgement_ready',
    requestingStageKey: 'lodgement_ready',
    coordinatedStageKey: 'cancellation_lodged',
    handoffKey: 'cancellation_to_lodgement_coordination',
    commandPresetKey: 'cancellation_cancellation_lodgement_ready',
    outcome: 'Transfer attorney can request cancellation lodgement readiness before confirming simultaneous lodgement.',
  }),
  Object.freeze({
    key: 'transfer_readiness_to_cancellation_lodgement',
    requestingLaneKey: 'cancellation',
    dependencyLaneKey: 'transfer',
    coordinationItemId: 'transfer_transfer_lodgement_ready',
    dependencyStageKey: 'lodgement_ready',
    requestingStageKey: 'cancellation_lodgement_ready',
    coordinatedStageKey: 'cancellation_lodged',
    handoffKey: 'cancellation_to_lodgement_coordination',
    commandPresetKey: 'transfer_transfer_lodgement_ready',
    outcome: 'Cancellation attorney can request transfer lodgement readiness before marking cancellation lodged simultaneously.',
  }),
])

export const CANCELLATION_PHASE6_SCENARIO_MATRIX = Object.freeze([
  Object.freeze({
    key: 'cash_buyer_individual_seller_existing_bond',
    label: 'Cash buyer, individual seller with existing bond',
    facts: {
      financeType: 'cash',
      sellerEntityType: 'individual',
      sellerHasExistingBond: true,
    },
    expected: {
      requiresCancellationAttorney: true,
      attention: false,
      sellerRequirementKeys: ['seller_existing_bond_confirmation', 'seller_bond_bank', 'seller_bond_account_number', 'seller_identity', 'seller_cancellation_documents_signature'],
    },
  }),
  Object.freeze({
    key: 'bond_buyer_individual_seller_existing_bond',
    label: 'Bond buyer, individual seller with existing bond',
    facts: {
      financeType: 'bond',
      sellerEntityType: 'individual',
      sellerHasExistingBond: true,
    },
    expected: {
      requiresCancellationAttorney: true,
      attention: false,
      sellerRequirementKeys: ['seller_existing_bond_confirmation', 'cancellation_figures', 'cancellation_guarantees', 'figures_expiry_date'],
    },
  }),
  Object.freeze({
    key: 'hybrid_buyer_trust_seller_existing_bond',
    label: 'Hybrid buyer, trust seller with existing bond',
    facts: {
      financeType: 'hybrid',
      sellerEntityType: 'trust',
      sellerHasExistingBond: true,
    },
    expected: {
      requiresCancellationAttorney: true,
      attention: false,
      sellerRequirementKeys: ['seller_trust_deed', 'seller_letters_of_authority', 'seller_trustee_resolution'],
    },
  }),
  Object.freeze({
    key: 'cash_buyer_no_seller_bond',
    label: 'Cash buyer, no seller existing bond',
    facts: {
      financeType: 'cash',
      sellerEntityType: 'individual',
      sellerHasExistingBond: false,
    },
    expected: {
      requiresCancellationAttorney: false,
      attention: false,
      sellerRequirementKeys: ['seller_identity'],
    },
  }),
  Object.freeze({
    key: 'unknown_seller_bond_status',
    label: 'Unknown seller bond status',
    facts: {
      financeType: 'bond',
      sellerEntityType: 'individual',
    },
    expected: {
      requiresCancellationAttorney: false,
      attention: true,
      sellerRequirementKeys: ['seller_identity', 'seller_existing_bond_status_to_confirm'],
    },
  }),
  Object.freeze({
    key: 'company_seller_existing_bond',
    label: 'Company seller with existing bond',
    facts: {
      financeType: 'cash',
      sellerEntityType: 'company',
      sellerHasExistingBond: true,
    },
    expected: {
      requiresCancellationAttorney: true,
      attention: false,
      sellerRequirementKeys: ['seller_company_registration', 'seller_company_resolution', 'seller_director_ids', 'seller_signatory_authority'],
    },
  }),
  Object.freeze({
    key: 'trust_seller_existing_bond',
    label: 'Trust seller with existing bond',
    facts: {
      financeType: 'bond',
      sellerEntityType: 'trust',
      sellerHasExistingBond: true,
    },
    expected: {
      requiresCancellationAttorney: true,
      attention: false,
      sellerRequirementKeys: ['seller_trust_deed', 'seller_letters_of_authority', 'seller_trustee_ids', 'seller_trustee_resolution'],
    },
  }),
  Object.freeze({
    key: 'expired_figures_penalty_risk',
    label: 'Existing bond with expired figures and penalty risk',
    facts: {
      financeType: 'hybrid',
      sellerEntityType: 'individual',
      sellerHasExistingBond: true,
      figuresExpired: true,
      penaltyRisk: true,
    },
    expected: {
      requiresCancellationAttorney: true,
      attention: true,
      sellerRequirementKeys: ['figures_expiry_date', 'penalty_notice_risk', 'cancellation_figures'],
    },
  }),
])

export const CANCELLATION_PHASE8_UAT_CHECKLIST = Object.freeze([
  Object.freeze({
    id: 'cancellation_uat_01',
    label: 'Confirm seller bond activation',
    expectedOutcome: 'Seller existing bond or explicit cancellation activates the cancellation lane, including cash buyer matters.',
    proofKey: 'seller_bond_activation',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_uat_02',
    label: 'Confirm cancellation suppression',
    expectedOutcome: 'No seller existing bond suppresses the cancellation lane even when buyer finance is bond or hybrid.',
    proofKey: 'seller_bond_suppression',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_uat_03',
    label: 'Open and action cancellation intake',
    expectedOutcome: 'Existing bond, bank, account, and instruction stages are action-backed.',
    proofKey: 'cancellation_intake_actions',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_uat_04',
    label: 'Capture figures and notice risk',
    expectedOutcome: 'Figures, expiry, penalty, and notice risk remain visible without forcing unrelated stages complete.',
    proofKey: 'figures_notice_risk',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_uat_05',
    label: 'Coordinate cancellation guarantees',
    expectedOutcome: 'Transfer can request cancellation acceptance and cancellation can request transfer alignment.',
    proofKey: 'guarantee_coordination',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_uat_06',
    label: 'Prepare and sign cancellation documents',
    expectedOutcome: 'Cancellation document preparation and seller signing requirements are actionable.',
    proofKey: 'documents_signing',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_uat_07',
    label: 'Coordinate simultaneous lodgement',
    expectedOutcome: 'Transfer can request cancellation readiness and cancellation can request transfer readiness.',
    proofKey: 'lodgement_coordination',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_uat_08',
    label: 'Register, settle, and close out',
    expectedOutcome: 'Cancellation lodged, registered, settlement proof, and close-out stages remain action-backed.',
    proofKey: 'registration_settlement_close_out',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_uat_09',
    label: 'Confirm Phase 3 command-preset decision',
    expectedOutcome: 'UAT signoff explicitly accepts generic workflow actions or schedules Phase 3 command presets before rollout.',
    proofKey: 'phase3_command_preset_gap',
    required: true,
  }),
])

export const CANCELLATION_PHASE9_RELEASE_CHECKLIST = Object.freeze([
  Object.freeze({
    id: 'cancellation_phase9_01',
    label: 'Confirm cancellation stage presets',
    expectedOutcome: 'Every cancellation attorney stage has a stage-specific command preset.',
    proofKey: 'stage_command_presets',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_phase9_02',
    label: 'Execute intake commands',
    expectedOutcome: 'Existing bond, bank, bond account, and instruction actions produce executable commands.',
    proofKey: 'intake_command_execution',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_phase9_03',
    label: 'Execute figures and notice commands',
    expectedOutcome: 'Notice, figures, expiry, and penalty-risk actions produce the correct step, note, or document commands.',
    proofKey: 'figures_notice_command_execution',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_phase9_04',
    label: 'Execute guarantee commands',
    expectedOutcome: 'Guarantee request, receipt, and acceptance actions are command-backed and remain professional-shared where needed.',
    proofKey: 'guarantee_command_execution',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_phase9_05',
    label: 'Execute document and signing commands',
    expectedOutcome: 'Cancellation document preparation and seller signed document capture produce usable work packets.',
    proofKey: 'documents_signing_command_execution',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_phase9_06',
    label: 'Execute lodgement and close-out commands',
    expectedOutcome: 'Readiness, lodged, registration, settlement proof, and close-out actions are executable.',
    proofKey: 'lodgement_close_out_command_execution',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_phase9_07',
    label: 'Preserve non-linear workflow',
    expectedOutcome: 'Stage commands do not require earlier cancellation stages to be completed first.',
    proofKey: 'non_linear_workflow',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_phase9_08',
    label: 'Retest seller structure coverage',
    expectedOutcome: 'Individual, company, trust, no-bond, unknown-bond, and figures-risk scenarios retain their expected release status.',
    proofKey: 'seller_structure_regression',
    required: true,
  }),
  Object.freeze({
    id: 'cancellation_phase9_09',
    label: 'Retire Phase 3 warning',
    expectedOutcome: 'Valid cancellation scenarios move from go_with_phase3_gap to go while review scenarios remain review.',
    proofKey: 'phase3_warning_retired',
    required: true,
  }),
])

function flatten(groups = [], property = 'stageKeys') {
  return groups.flatMap((group) => Array.isArray(group[property]) ? group[property] : [])
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeCancellationScenarioText(value = '') {
  return String(value || '').trim()
}

function normalizeCancellationScenarioKey(value = '') {
  return normalizeCancellationScenarioText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeCancellationScenarioBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const normalized = normalizeCancellationScenarioKey(value)
  if (!normalized) return null
  if (['true', 'yes', 'y', '1', 'required', 'applicable', 'has_bond', 'existing_bond', 'bond_registered', 'expired', 'risk'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'not_required', 'not_applicable', 'none', 'no_bond', 'clear', 'valid'].includes(normalized)) return false
  return null
}

function normalizeCancellationFinanceType(value = '', facts = {}) {
  const normalized = normalizeCancellationScenarioKey(value || facts.finance_type || facts.financeType)
  if (!normalized && facts.isCashDeal === true) return 'cash'
  if (['cash', 'cash_sale', 'cash_deal'].includes(normalized)) return 'cash'
  if (['bond', 'bond_finance', 'mortgage', 'home_loan'].includes(normalized)) return 'bond'
  if (['hybrid', 'combination', 'mixed', 'bond_and_cash'].includes(normalized)) return 'combination'
  if (['developer', 'developer_finance'].includes(normalized)) return 'developer'
  return 'unknown'
}

function normalizeCancellationEntityType(value = '') {
  const normalized = normalizeCancellationScenarioKey(value)
  if (['person', 'natural_person', 'individual', 'private_individual'].includes(normalized)) return 'individual'
  if (['company', 'close_corporation', 'cc', 'pty', 'pty_ltd'].includes(normalized)) return 'company'
  if (['trust', 'inter_vivos_trust'].includes(normalized)) return 'trust'
  if (['developer'].includes(normalized)) return 'developer'
  return 'unknown'
}

function buildCancellationSellerRequirementKeys({
  sellerEntityType = 'unknown',
  requiresCancellationAttorney = false,
  sellerBondKnown = false,
  figuresExpired = false,
  penaltyRisk = false,
  noticeRisk = false,
} = {}) {
  const requirements = []

  if (sellerEntityType === 'individual') {
    requirements.push('seller_identity')
    if (requiresCancellationAttorney) requirements.push('seller_cancellation_documents_signature')
  } else if (sellerEntityType === 'company') {
    requirements.push('seller_company_registration', 'seller_company_resolution', 'seller_director_ids', 'seller_signatory_authority')
  } else if (sellerEntityType === 'trust') {
    requirements.push('seller_trust_deed', 'seller_letters_of_authority', 'seller_trustee_ids', 'seller_trustee_resolution')
  } else if (sellerEntityType === 'developer') {
    requirements.push('seller_developer_authority')
  } else {
    requirements.push('seller_capacity_to_confirm')
  }

  if (!sellerBondKnown) requirements.push('seller_existing_bond_status_to_confirm')

  if (requiresCancellationAttorney) {
    requirements.push(
      'seller_existing_bond_confirmation',
      'seller_bond_bank',
      'seller_bond_account_number',
      'cancellation_instruction',
      'cancellation_figures',
      'figures_expiry_date',
      'cancellation_guarantees',
      'cancellation_lodgement_pack',
    )
  }

  if (figuresExpired) requirements.push('figures_refresh_required')
  if (penaltyRisk || noticeRisk) requirements.push('penalty_notice_risk')

  return unique(requirements)
}

function buildActionCoverage(actions = [], surfaces = []) {
  const surfaceIndex = new Map(surfaces.map((surface) => [surface.key, surface]))
  return actions.map((action) => ({
    ...action,
    surface: surfaceIndex.get(action.surfaceKey) || null,
    covered: surfaceIndex.has(action.surfaceKey),
  }))
}

function cancellationActionTypeForCommand(action = {}) {
  if (action.commandType === 'request_document') return 'request_document'
  if (action.commandType === 'add_note') return 'update_matter_data'
  return 'complete_stage_evidence'
}

function buildCancellationActionCommandProbe(action = {}, preset = null) {
  const actionType = cancellationActionTypeForCommand(action)
  const command = buildAttorneyWorkflowActionCommand({
    id: action.id,
    type: actionType,
    label: preset?.label || action.label || action.stageKey,
    description: preset?.description || '',
    target: preset?.requestedFrom || 'cancellation_attorney',
    laneKey: 'cancellation',
    stageKey: action.stageKey,
  }, {
    laneKey: 'cancellation',
    stageKey: action.stageKey,
    now: '2026-08-15T00:00:00.000Z',
  })
  const expectedCommandType = preset?.commandType || 'complete_step'

  return {
    actionId: action.id,
    stageKey: action.stageKey,
    stageLabel: action.label,
    actionCommandType: action.commandType,
    actionType,
    commandPreset: preset,
    commandPresetKey: action.stageKey,
    commandLabel: command?.label || '',
    commandType: command?.commandType || '',
    workPacket: command?.workPacket || null,
    draft: command?.draft || null,
    hasPreset: Boolean(preset),
    expectedCommandType,
    executable: Boolean(command?.commandType && command?.workPacket && command?.draft),
    commandMatchesPresetType: command?.commandType === expectedCommandType,
    commandUsesPresetChecklist: Boolean(
      preset?.checklist?.length &&
      command?.workPacket?.checklist?.length === preset.checklist.length &&
      preset.checklist.every((item) => command.workPacket.checklist.includes(item)),
    ),
    nonLinearSafe: true,
  }
}

export function buildCancellationLaneScenarioProfile(facts = {}) {
  const financeType = normalizeCancellationFinanceType(facts.financeType || facts.finance_type, facts)
  const sellerEntityType = normalizeCancellationEntityType(facts.sellerEntityType || facts.seller_entity_type || facts.seller?.entityType || facts.seller?.entity_type)
  const sellerHasExistingBond = normalizeCancellationScenarioBoolean(
    facts.sellerHasExistingBond ??
    facts.seller_has_existing_bond ??
    facts.existingBond ??
    facts.existing_bond ??
    facts.seller?.hasExistingBond,
  )
  const explicitCancellation = normalizeCancellationScenarioBoolean(
    facts.requiresCancellationAttorney ??
    facts.requires_cancellation_attorney ??
    facts.cancellationRequired ??
    facts.cancellation_required,
  )
  const figuresExpired = normalizeCancellationScenarioBoolean(facts.figuresExpired ?? facts.figures_expired ?? facts.cancellation?.figuresExpired) === true
  const penaltyRisk = normalizeCancellationScenarioBoolean(facts.penaltyRisk ?? facts.penalty_risk ?? facts.cancellation?.penaltyRisk) === true
  const noticeRisk = normalizeCancellationScenarioBoolean(facts.noticeRisk ?? facts.notice_risk ?? facts.cancellation?.noticeRisk) === true
  const sellerBondKnown = sellerHasExistingBond !== null || explicitCancellation !== null
  const requiresCancellationAttorney = explicitCancellation ?? sellerHasExistingBond ?? false
  const attentionReasons = [
    !sellerBondKnown ? 'seller_existing_bond_status_unknown' : '',
    sellerEntityType === 'unknown' ? 'seller_entity_type_unknown' : '',
    figuresExpired ? 'figures_expired_or_stale' : '',
    penaltyRisk ? 'penalty_risk_present' : '',
    noticeRisk ? 'notice_risk_present' : '',
  ].filter(Boolean)
  const sellerRequirementKeys = buildCancellationSellerRequirementKeys({
    sellerEntityType,
    requiresCancellationAttorney,
    sellerBondKnown,
    figuresExpired,
    penaltyRisk,
    noticeRisk,
  })

  return {
    financeType,
    sellerEntityType,
    sellerHasExistingBond,
    requiresCancellationAttorney,
    figuresExpired,
    penaltyRisk,
    noticeRisk,
    status: attentionReasons.length ? 'attention' : 'covered',
    attentionReasons,
    lanePolicy: {
      cancellationLaneActive: requiresCancellationAttorney,
      sellerExistingBondActivatesCancellation: requiresCancellationAttorney && sellerHasExistingBond === true,
      explicitCancellationActivatesLane: requiresCancellationAttorney && explicitCancellation === true,
      noSellerBondSuppressesCancellation: sellerHasExistingBond === false && !requiresCancellationAttorney,
      unknownSellerBondRequiresConfirmation: !sellerBondKnown,
      buyerFinanceDoesNotControlCancellation: true,
      concurrentWorkAllowed: true,
    },
    sellerRequirementKeys,
    coverageItems: [
      {
        key: 'seller_bond_status',
        label: 'Seller Bond Status',
        value: sellerHasExistingBond === null ? 'unknown' : sellerHasExistingBond ? 'existing_bond' : 'no_existing_bond',
        status: !sellerBondKnown ? 'attention' : 'covered',
        detail: requiresCancellationAttorney ? 'Cancellation lane applies.' : 'Cancellation lane stays inactive.',
      },
      {
        key: 'seller_capacity',
        label: 'Seller Capacity',
        value: sellerEntityType,
        status: sellerEntityType === 'unknown' ? 'attention' : 'covered',
        detail: `${sellerRequirementKeys.length} seller requirement(s) tracked.`,
      },
      {
        key: 'finance_route',
        label: 'Buyer Finance Route',
        value: financeType,
        status: 'covered',
        detail: 'Buyer finance does not control cancellation activation.',
      },
      {
        key: 'figures_and_notice_risk',
        label: 'Figures and Notice Risk',
        value: figuresExpired || penaltyRisk || noticeRisk ? 'attention_required' : 'clear',
        status: figuresExpired || penaltyRisk || noticeRisk ? 'attention' : 'covered',
        detail: figuresExpired || penaltyRisk || noticeRisk
          ? 'Figures expiry, penalty, or notice risk must be resolved before lodgement readiness.'
          : 'No figures expiry or notice risk supplied.',
      },
      {
        key: 'lane_activation',
        label: 'Lane Activation',
        value: requiresCancellationAttorney ? 'cancellation_lane_active' : 'cancellation_lane_inactive',
        status: !sellerBondKnown ? 'attention' : 'covered',
        detail: requiresCancellationAttorney
          ? 'Cancellation attorney work can run concurrently with transfer and bond readiness.'
          : 'No cancellation attorney lane unless seller bond or explicit cancellation requires it.',
      },
    ],
  }
}

export function buildCancellationLaneJourneyMap() {
  const cancellationStageDefinitions = getAttorneyStageDefinitionsForLane('cancellation')
  const cancellationStageKeys = cancellationStageDefinitions.map((stage) => stage.key)
  const mappedStageKeys = flatten(CANCELLATION_ATTORNEY_JOURNEY_LANES, 'stageKeys')
  const missingStageKeys = cancellationStageKeys.filter((stageKey) => !mappedStageKeys.includes(stageKey))
  const unknownStageKeys = mappedStageKeys.filter((stageKey) => !cancellationStageKeys.includes(stageKey))
  const duplicateStageKeys = mappedStageKeys.filter((stageKey, index, values) => values.indexOf(stageKey) !== index)

  return {
    version: CANCELLATION_LANE_PHASE1_JOURNEY_VERSION,
    attorney: {
      ownerRole: 'cancellation_attorney',
      lanes: CANCELLATION_ATTORNEY_JOURNEY_LANES,
      stageKeys: cancellationStageKeys,
      stageLabels: Object.fromEntries(cancellationStageDefinitions.map((stage) => [stage.key, stage.label])),
      mappedStageKeys: unique(mappedStageKeys),
      missingStageKeys,
      unknownStageKeys,
      duplicateStageKeys: unique(duplicateStageKeys),
    },
    handoffs: CANCELLATION_LANE_HANDOFFS,
    rolloutBaseline: {
      activationCondition: 'seller_existing_bond_requires_cancellation',
      transferTriggerStage: 'existing_bond_confirmed',
      attorneyStartsAt: 'cancellation_existing_bond_confirmed',
      guaranteeDependency: 'transfer_guarantees_accepted',
      simultaneousLodgementDependency: 'lodgement_ready',
      registrationCloseOutDependency: 'registered',
      cashBuyerStillMayRequireCancellation: true,
      buyerBondNotRequiredForCancellation: true,
      concurrentWorkAllowed: true,
    },
  }
}

export function buildCancellationLanePhase2ActionAudit() {
  const journeyMap = buildCancellationLaneJourneyMap()
  const actionSurfaces = CANCELLATION_PHASE2_ACTION_SURFACES
  const surfaceKeys = actionSurfaces.map((surface) => surface.key)
  const handoffKeys = CANCELLATION_LANE_HANDOFFS.map((handoff) => handoff.key)
  const stageLabelByKey = journeyMap.attorney.stageLabels
  const transferTriggerStages = [journeyMap.rolloutBaseline.transferTriggerStage]
  const cancellationRequiredActions = buildActionCoverage(CANCELLATION_PHASE2_REQUIRED_ACTIONS, actionSurfaces).map((action) => ({
    ...action,
    label: action.ownerRole === 'cancellation_attorney'
      ? stageLabelByKey[action.stageKey] || action.stageKey
      : 'Existing Bond or Cancellation Requirement Confirmed',
    laneKey: action.ownerRole === 'transfer_attorney' ? 'transfer' : 'cancellation',
  }))

  const structuralBlockers = [
    ...cancellationRequiredActions
      .filter((action) => action.ownerRole === 'cancellation_attorney' && !journeyMap.attorney.stageKeys.includes(action.stageKey))
      .map((action) => `Unknown cancellation attorney stage for ${action.id}: ${action.stageKey}`),
    ...cancellationRequiredActions
      .filter((action) => action.ownerRole === 'transfer_attorney' && !transferTriggerStages.includes(action.stageKey))
      .map((action) => `Unknown transfer trigger stage for ${action.id}: ${action.stageKey}`),
    ...cancellationRequiredActions
      .filter((action) => !surfaceKeys.includes(action.surfaceKey))
      .map((action) => `Missing action surface for ${action.id}: ${action.surfaceKey}`),
    ...cancellationRequiredActions
      .filter((action) => action.handoffKey && !handoffKeys.includes(action.handoffKey))
      .map((action) => `Missing handoff for ${action.id}: ${action.handoffKey}`),
    ...journeyMap.attorney.stageKeys
      .filter((stageKey) => !cancellationRequiredActions.some((action) => action.ownerRole === 'cancellation_attorney' && action.stageKey === stageKey))
      .map((stageKey) => `Missing cancellation attorney action for stage: ${stageKey}`),
  ]

  const coveredHandoffKeys = unique(cancellationRequiredActions.map((action) => action.handoffKey))
  const handoffActionCoverage = CANCELLATION_LANE_HANDOFFS.map((handoff) => ({
    handoffKey: handoff.key,
    covered: coveredHandoffKeys.includes(handoff.key),
    actionIds: cancellationRequiredActions
      .filter((action) => action.handoffKey === handoff.key)
      .map((action) => action.id),
  }))

  return {
    version: CANCELLATION_LANE_PHASE2_ACTION_AUDIT_VERSION,
    journeyVersion: journeyMap.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase3',
    transferTrigger: {
      ownerRole: 'transfer_attorney',
      requiredActions: cancellationRequiredActions.filter((action) => action.ownerRole === 'transfer_attorney'),
      mutationSurface: 'attorney_workflow',
      activationPolicy: 'seller_existing_bond_or_explicit_cancellation_required',
    },
    attorney: {
      ownerRole: 'cancellation_attorney',
      requiredActions: cancellationRequiredActions.filter((action) => action.ownerRole === 'cancellation_attorney'),
      mutationSurface: 'attorney_workflow',
      nonLinearWorkflowPolicy: 'any_stage_can_be_updated_without_forcing_previous_stage_completion',
    },
    actionSurfaces,
    handoffActionCoverage,
    implementationGaps: [
      'Cancellation actions currently rely on generic workflow commands; stage-specific presets for figures, guarantee expiry, penalty risk, and settlement close-out are Phase 3 candidates.',
      'Guarantee acceptance and lodgement readiness are represented as handoffs, but cross-lane coordination commands should be tested as paired workflows in later phases.',
      'Cash buyer transactions must still activate cancellation when the seller has an existing bond, while suppressing buyer bond-originator and bond-attorney lanes.',
    ],
    structuralBlockers,
  }
}

export function buildCancellationLanePhase4GuaranteeCoordinationPlan() {
  const phase2 = buildCancellationLanePhase2ActionAudit()
  const map = buildCancellationLaneJourneyMap()
  const guaranteeHandoff = map.handoffs.find((handoff) => handoff.key === 'cancellation_to_transfer_guarantee_alignment') || null
  const cancellationStageKeys = map.attorney.stageKeys
  const transferStageKeys = getAttorneyStageDefinitionsForLane('transfer').map((stage) => stage.key)
  const commandPresetKeys = Object.keys(ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS)

  const pairs = CANCELLATION_PHASE4_GUARANTEE_COORDINATION_PAIRS.map((pair) => {
    const cancellationStageCovered = [
      pair.dependencyLaneKey === 'cancellation' ? pair.dependencyStageKey : '',
      pair.requestingLaneKey === 'cancellation' ? pair.requestingStageKey : '',
    ].some((stageKey) => cancellationStageKeys.includes(stageKey))
    const transferStageCovered = [
      pair.dependencyLaneKey === 'transfer' ? pair.dependencyStageKey : '',
      pair.requestingLaneKey === 'transfer' ? pair.requestingStageKey : '',
    ].some((stageKey) => transferStageKeys.includes(stageKey))
    const cancellationActionCovered = phase2.attorney.requiredActions.some((action) => (
      action.stageKey === pair.dependencyStageKey ||
      action.stageKey === pair.requestingStageKey ||
      action.handoffKey === pair.handoffKey
    ))

    return {
      ...pair,
      commandPreset: ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS[pair.commandPresetKey] || null,
      commandPresetCovered: commandPresetKeys.includes(pair.commandPresetKey),
      handoffCovered: guaranteeHandoff?.key === pair.handoffKey,
      cancellationStageCovered,
      transferStageCovered,
      cancellationActionCovered,
    }
  })

  const structuralBlockers = [
    ...phase2.structuralBlockers,
    ...pairs
      .filter((pair) => !pair.commandPresetCovered)
      .map((pair) => `Missing cancellation guarantee coordination command preset: ${pair.commandPresetKey}`),
    ...pairs
      .filter((pair) => !pair.handoffCovered)
      .map((pair) => `Missing cancellation guarantee handoff for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => !pair.cancellationStageCovered)
      .map((pair) => `Missing cancellation guarantee stage for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => !pair.transferStageCovered)
      .map((pair) => `Missing transfer guarantee stage for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => !pair.cancellationActionCovered)
      .map((pair) => `Missing cancellation guarantee action for coordination pair: ${pair.key}`),
  ]

  return {
    version: CANCELLATION_LANE_PHASE4_GUARANTEE_COORDINATION_VERSION,
    phase2Version: phase2.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase5',
    handoff: guaranteeHandoff,
    pairs,
    rolloutRules: [
      'Transfer can request cancellation guarantee acceptance before all transfer-side lodgement steps are complete.',
      'Cancellation can request transfer guarantee alignment before marking cancellation guarantees accepted.',
      'Cancellation figures, figures expiry, guarantee value, and bank acceptance must stay visible in the coordination note.',
      'Guarantee coordination stays professional-shared and persists with sourceCoordinationId metadata.',
    ],
    skippedPhase3Dependency: {
      phase3Implemented: false,
      note: 'Phase 4 uses Phase 2 generic workflow actions and shared coordination presets; stage-specific cancellation command presets remain Phase 3 work.',
    },
    structuralBlockers,
  }
}

export function buildCancellationLanePhase5LodgementCoordinationPlan() {
  const phase4 = buildCancellationLanePhase4GuaranteeCoordinationPlan()
  const phase2 = buildCancellationLanePhase2ActionAudit()
  const map = buildCancellationLaneJourneyMap()
  const lodgementHandoff = map.handoffs.find((handoff) => handoff.key === 'cancellation_to_lodgement_coordination') || null
  const cancellationStageKeys = map.attorney.stageKeys
  const transferStageKeys = getAttorneyStageDefinitionsForLane('transfer').map((stage) => stage.key)
  const commandPresetKeys = Object.keys(ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS)

  const pairs = CANCELLATION_PHASE5_LODGEMENT_COORDINATION_PAIRS.map((pair) => {
    const cancellationStageCovered = [
      pair.dependencyLaneKey === 'cancellation' ? pair.dependencyStageKey : '',
      pair.requestingLaneKey === 'cancellation' ? pair.requestingStageKey : '',
      pair.coordinatedStageKey,
    ].some((stageKey) => cancellationStageKeys.includes(stageKey))
    const transferStageCovered = [
      pair.dependencyLaneKey === 'transfer' ? pair.dependencyStageKey : '',
      pair.requestingLaneKey === 'transfer' ? pair.requestingStageKey : '',
    ].some((stageKey) => transferStageKeys.includes(stageKey))
    const cancellationActionCovered = phase2.attorney.requiredActions.some((action) => (
      action.stageKey === pair.dependencyStageKey ||
      action.stageKey === pair.requestingStageKey ||
      action.stageKey === pair.coordinatedStageKey ||
      action.handoffKey === pair.handoffKey
    ))

    return {
      ...pair,
      commandPreset: ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS[pair.commandPresetKey] || null,
      commandPresetCovered: commandPresetKeys.includes(pair.commandPresetKey),
      handoffCovered: lodgementHandoff?.key === pair.handoffKey,
      cancellationStageCovered,
      transferStageCovered,
      cancellationActionCovered,
    }
  })

  const structuralBlockers = [
    ...phase4.structuralBlockers,
    ...pairs
      .filter((pair) => !pair.commandPresetCovered)
      .map((pair) => `Missing cancellation lodgement coordination command preset: ${pair.commandPresetKey}`),
    ...pairs
      .filter((pair) => !pair.handoffCovered)
      .map((pair) => `Missing cancellation lodgement handoff for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => !pair.cancellationStageCovered)
      .map((pair) => `Missing cancellation lodgement stage for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => !pair.transferStageCovered)
      .map((pair) => `Missing transfer lodgement stage for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => !pair.cancellationActionCovered)
      .map((pair) => `Missing cancellation lodgement action for coordination pair: ${pair.key}`),
  ]

  return {
    version: CANCELLATION_LANE_PHASE5_LODGEMENT_COORDINATION_VERSION,
    phase4Version: phase4.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase6',
    handoff: lodgementHandoff,
    pairs,
    rolloutRules: [
      'Transfer can request cancellation lodgement readiness before all transfer-side lodgement tasks are complete.',
      'Cancellation can request transfer lodgement readiness before marking cancellation lodged simultaneously.',
      'Cancellation readiness requires valid figures, accepted guarantees, cancellation documents, and unresolved bank/signing blockers to be visible.',
      'Cancellation lodgement readiness and transfer lodgement readiness are paired but independently actionable.',
      'Coordination requests persist as professional-shared workflow notes with sourceCoordinationId metadata.',
    ],
    skippedPhase3Dependency: {
      phase3Implemented: false,
      note: 'Phase 5 uses Phase 2 generic workflow actions and shared coordination presets; stage-specific cancellation command presets remain Phase 3 work.',
    },
    structuralBlockers,
  }
}

export function buildCancellationLanePhase6ScenarioCoveragePlan() {
  const phase5 = buildCancellationLanePhase5LodgementCoordinationPlan()
  const scenarios = CANCELLATION_PHASE6_SCENARIO_MATRIX.map((scenario) => {
    const profile = buildCancellationLaneScenarioProfile(scenario.facts)
    const missingSellerRequirementKeys = (scenario.expected.sellerRequirementKeys || [])
      .filter((key) => !profile.sellerRequirementKeys.includes(key))
    const mismatches = [
      profile.requiresCancellationAttorney !== scenario.expected.requiresCancellationAttorney
        ? `requiresCancellationAttorney expected ${scenario.expected.requiresCancellationAttorney} got ${profile.requiresCancellationAttorney}`
        : '',
      Boolean(scenario.expected.attention) !== (profile.status === 'attention')
        ? `attention expected ${Boolean(scenario.expected.attention)} got ${profile.status === 'attention'}`
        : '',
      !scenario.expected.requiresCancellationAttorney && profile.lanePolicy.cancellationLaneActive
        ? 'cancellation lane should be inactive'
        : '',
      ...missingSellerRequirementKeys.map((key) => `missing seller requirement ${key}`),
    ].filter(Boolean)

    return {
      key: scenario.key,
      label: scenario.label,
      profile,
      status: mismatches.length ? 'blocked' : 'covered',
      mismatches,
    }
  })
  const structuralBlockers = [
    ...phase5.structuralBlockers,
    ...scenarios.flatMap((scenario) => scenario.mismatches.map((message) => `${scenario.key}: ${message}`)),
  ]

  return {
    version: CANCELLATION_LANE_PHASE6_SCENARIO_COVERAGE_VERSION,
    phase5Version: phase5.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase7',
    scenarioCount: scenarios.length,
    scenarios,
    coverageSummary: {
      activeCancellationScenarios: scenarios.filter((scenario) => scenario.profile.requiresCancellationAttorney).length,
      suppressedCancellationScenarios: scenarios.filter((scenario) => !scenario.profile.requiresCancellationAttorney && scenario.profile.status !== 'attention').length,
      attentionScenarios: scenarios.filter((scenario) => scenario.profile.status === 'attention').length,
      cashFinanceScenarios: scenarios.filter((scenario) => scenario.profile.financeType === 'cash').length,
      bondFinanceScenarios: scenarios.filter((scenario) => ['bond', 'combination', 'developer'].includes(scenario.profile.financeType)).length,
      companySellerScenarios: scenarios.filter((scenario) => scenario.profile.sellerEntityType === 'company').length,
      trustSellerScenarios: scenarios.filter((scenario) => scenario.profile.sellerEntityType === 'trust').length,
      figuresRiskScenarios: scenarios.filter((scenario) => scenario.profile.figuresExpired || scenario.profile.penaltyRisk || scenario.profile.noticeRisk).length,
    },
    rolloutRules: [
      'Seller existing bond or explicit cancellation activates the cancellation lane.',
      'No seller existing bond suppresses cancellation even when buyer finance is bond or hybrid.',
      'Cash buyer matters can still activate cancellation when the seller has an existing bond.',
      'Unknown seller bond status remains an attention state until confirmed.',
      'Company and trust sellers surface authority requirements for cancellation evidence review.',
      'Expired figures, penalty risk, or notice risk remain attention states before lodgement readiness.',
      'Concurrent work remains allowed across scenario variants.',
    ],
    skippedPhase3Dependency: {
      phase3Implemented: false,
      note: 'Scenario coverage is valid against Phase 2 generic actions and Phase 4/5 coordination; stage-specific cancellation command presets remain Phase 3 work.',
    },
    structuralBlockers,
  }
}

export function buildCancellationLanePhase7RolloutReadinessReport() {
  const journeyMap = buildCancellationLaneJourneyMap()
  const phase2 = buildCancellationLanePhase2ActionAudit()
  const phase4 = buildCancellationLanePhase4GuaranteeCoordinationPlan()
  const phase5 = buildCancellationLanePhase5LodgementCoordinationPlan()
  const phase6 = buildCancellationLanePhase6ScenarioCoveragePlan()

  const transferTriggerCovered = phase2.transferTrigger.requiredActions
    .every((action) => action.covered && action.commandType && action.surface)
  const attorneyActionsCovered = phase2.attorney.requiredActions
    .every((action) => action.covered && action.commandType && action.surface)
  const handoffsCovered = phase2.handoffActionCoverage
    .every((handoff) => handoff.covered && handoff.actionIds.length)
  const guaranteeCoordinationCovered = phase4.pairs
    .every((pair) => (
      pair.commandPresetCovered &&
      pair.handoffCovered &&
      pair.cancellationStageCovered &&
      pair.transferStageCovered &&
      pair.cancellationActionCovered
    ))
  const lodgementCoordinationCovered = phase5.pairs
    .every((pair) => (
      pair.commandPresetCovered &&
      pair.handoffCovered &&
      pair.cancellationStageCovered &&
      pair.transferStageCovered &&
      pair.cancellationActionCovered
    ))
  const scenariosCovered = phase6.scenarios
    .every((scenario) => scenario.status === 'covered' && scenario.profile.lanePolicy.concurrentWorkAllowed)
  const concurrentWorkAllowed =
    phase2.attorney.nonLinearWorkflowPolicy === 'any_stage_can_be_updated_without_forcing_previous_stage_completion' &&
    phase5.rolloutRules.some((rule) => rule.includes('independently actionable')) &&
    scenariosCovered
  const phase3CommandPresetGapTracked =
    phase4.skippedPhase3Dependency?.phase3Implemented === false &&
    phase5.skippedPhase3Dependency?.phase3Implemented === false &&
    phase6.skippedPhase3Dependency?.phase3Implemented === false

  const readinessChecks = [
    {
      key: 'phase1_journey_map',
      label: 'Cancellation attorney journey map is complete',
      status:
        journeyMap.attorney.missingStageKeys.length === 0 &&
        journeyMap.attorney.unknownStageKeys.length === 0 &&
        journeyMap.attorney.duplicateStageKeys.length === 0 &&
        journeyMap.handoffs.length === 4
          ? 'pass'
          : 'fail',
      evidence: {
        attorneyLaneCount: journeyMap.attorney.lanes.length,
        attorneyStageCount: journeyMap.attorney.stageKeys.length,
        handoffCount: journeyMap.handoffs.length,
      },
    },
    {
      key: 'phase2_action_buttons',
      label: 'Transfer trigger and cancellation attorney action buttons have no dead ends',
      status: transferTriggerCovered && attorneyActionsCovered && handoffsCovered ? 'pass' : 'fail',
      evidence: {
        transferTriggerActionCount: phase2.transferTrigger.requiredActions.length,
        cancellationAttorneyActionCount: phase2.attorney.requiredActions.length,
        coveredHandoffCount: phase2.handoffActionCoverage.filter((handoff) => handoff.covered).length,
      },
    },
    {
      key: 'phase3_stage_command_gap',
      label: 'Stage-specific cancellation command presets are tracked as outstanding',
      status: phase3CommandPresetGapTracked ? 'warning' : 'fail',
      evidence: {
        phase3Implemented: false,
        genericActionsAvailable: transferTriggerCovered && attorneyActionsCovered,
        outstandingScope: [
          'figures',
          'figures_expiry',
          'penalty_notice_risk',
          'guarantees',
          'seller_signing',
          'lodgement',
          'registration',
          'settlement_close_out',
        ],
      },
    },
    {
      key: 'phase4_guarantee_coordination',
      label: 'Cancellation guarantee coordination is covered in both directions',
      status: guaranteeCoordinationCovered ? 'pass' : 'fail',
      evidence: {
        pairCount: phase4.pairs.length,
        handoffKey: phase4.handoff?.key || null,
      },
    },
    {
      key: 'phase5_lodgement_coordination',
      label: 'Cancellation simultaneous lodgement coordination is covered in both directions',
      status: lodgementCoordinationCovered ? 'pass' : 'fail',
      evidence: {
        pairCount: phase5.pairs.length,
        handoffKey: phase5.handoff?.key || null,
      },
    },
    {
      key: 'phase6_scenario_coverage',
      label: 'Cancellation activation and seller-structure scenario coverage is complete',
      status: scenariosCovered ? 'pass' : 'fail',
      evidence: phase6.coverageSummary,
    },
    {
      key: 'concurrent_work_policy',
      label: 'Cancellation work can proceed non-linearly across concurrent stages',
      status: concurrentWorkAllowed ? 'pass' : 'fail',
      evidence: {
        attorneyPolicy: phase2.attorney.nonLinearWorkflowPolicy,
        scenarioCount: phase6.scenarioCount,
      },
    },
  ]

  const failedChecks = readinessChecks.filter((check) => check.status === 'fail')
  const warnings = readinessChecks
    .filter((check) => check.status === 'warning')
    .map((check) => `Rollout readiness warning: ${check.key}`)
  const structuralBlockers = unique([
    ...phase2.structuralBlockers,
    ...phase4.structuralBlockers,
    ...phase5.structuralBlockers,
    ...phase6.structuralBlockers,
    ...failedChecks.map((check) => `Rollout readiness check failed: ${check.key}`),
  ])

  return {
    version: CANCELLATION_LANE_PHASE7_ROLLOUT_READINESS_VERSION,
    phase6Version: phase6.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase8',
    rolloutReadiness: {
      decision: structuralBlockers.length ? 'hold' : warnings.length ? 'go_with_phase3_gap' : 'go',
      nextPhase: 'phase8_uat_release_gate',
      metrics: {
        cancellationAttorneyLaneCount: journeyMap.attorney.lanes.length,
        cancellationAttorneyStageCount: journeyMap.attorney.stageKeys.length,
        transferTriggerActionCount: phase2.transferTrigger.requiredActions.length,
        cancellationAttorneyActionCount: phase2.attorney.requiredActions.length,
        guaranteeCoordinationPairCount: phase4.pairs.length,
        lodgementCoordinationPairCount: phase5.pairs.length,
        scenarioCount: phase6.scenarioCount,
        attentionScenarioCount: phase6.coverageSummary.attentionScenarios,
      },
      actionButtonProof: {
        transferTriggerCovered,
        attorneyActionsCovered,
        handoffsCovered,
        noDeadEndButtons: transferTriggerCovered && attorneyActionsCovered && handoffsCovered,
      },
      workflowProof: {
        guaranteeCoordinationCovered,
        lodgementCoordinationCovered,
        scenariosCovered,
        concurrentWorkAllowed,
        phase3CommandPresetGapTracked,
      },
    },
    readinessChecks,
    uatFocus: [
      'Cash buyer with seller existing bond: confirm cancellation activates while buyer bond lanes stay suppressed.',
      'No seller existing bond: confirm cancellation remains inactive even on bond or hybrid buyer finance.',
      'Unknown seller bond status: confirm the matter stays review/attention until the seller bond position is confirmed.',
      'Company and trust sellers: confirm authority evidence is visible to cancellation attorney work.',
      'Guarantees: request cancellation acceptance from transfer and request transfer alignment from cancellation.',
      'Lodgement: request cancellation readiness from transfer and transfer readiness from cancellation.',
      'Figures risk: confirm stale figures, penalty risk, or notice risk stays visible before lodgement readiness.',
      'Phase 3 gap: verify generic workflow actions are acceptable for UAT, or schedule command-preset completion before rollout.',
    ],
    releaseGateInputs: [
      'Use readinessChecks as the Phase 8 release gate checklist.',
      'Use rolloutReadiness.actionButtonProof to verify no cancellation-facing button is decorative only.',
      'Use rolloutReadiness.workflowProof.concurrentWorkAllowed to protect non-linear cancellation workflows during UAT.',
      'Use Phase 6 scenario coverage as the minimum regression matrix for seller bond activation, seller structures, and figures risk.',
      'Keep the Phase 3 command-preset warning visible until stage-specific cancellation commands are implemented.',
    ],
    warnings,
    structuralBlockers,
  }
}

function buildCancellationLanePhase8ScenarioGate({ key = 'ad_hoc', label = 'Ad hoc cancellation scenario', facts = {}, expected = null } = {}, phase7 = null) {
  const profile = buildCancellationLaneScenarioProfile(facts)
  const actionButtonProof = phase7?.rolloutReadiness?.actionButtonProof || {}
  const workflowProof = phase7?.rolloutReadiness?.workflowProof || {}
  const metrics = phase7?.rolloutReadiness?.metrics || {}
  const unknownSellerBond = profile.lanePolicy.unknownSellerBondRequiresConfirmation
  const figuresRisk = profile.figuresExpired || profile.penaltyRisk || profile.noticeRisk
  const expectedMismatches = expected
    ? [
        profile.requiresCancellationAttorney !== expected.requiresCancellationAttorney
          ? `requiresCancellationAttorney expected ${expected.requiresCancellationAttorney} got ${profile.requiresCancellationAttorney}`
          : '',
        Boolean(expected.attention) !== (profile.status === 'attention')
          ? `attention expected ${Boolean(expected.attention)} got ${profile.status === 'attention'}`
          : '',
        ...(expected.sellerRequirementKeys || [])
          .filter((requirementKey) => !profile.sellerRequirementKeys.includes(requirementKey))
          .map((requirementKey) => `missing seller requirement ${requirementKey}`),
      ].filter(Boolean)
    : []

  const checks = [
    {
      key: 'seller_bond_status',
      label: 'Seller Bond Status',
      status: unknownSellerBond ? 'review' : 'ready',
      value: profile.sellerHasExistingBond === null ? 'unknown' : profile.sellerHasExistingBond ? 'existing_bond' : 'no_existing_bond',
      detail: unknownSellerBond ? 'Seller bond status must be confirmed before cancellation activation.' : 'Seller bond position is resolved.',
    },
    {
      key: 'lane_activation',
      label: 'Lane Activation',
      status: unknownSellerBond ? 'review' : 'ready',
      value: profile.requiresCancellationAttorney ? 'cancellation_lane_active' : 'cancellation_lane_inactive',
      detail: profile.requiresCancellationAttorney
        ? 'Cancellation lane is active from seller bond or explicit cancellation facts.'
        : 'Cancellation lane is suppressed because no seller bond/cancellation requirement applies.',
    },
    {
      key: 'seller_capacity',
      label: 'Seller Capacity Evidence',
      status: profile.sellerRequirementKeys.length ? 'ready' : 'blocked',
      value: `${profile.sellerRequirementKeys.length} requirement(s)`,
      detail: profile.sellerRequirementKeys.join(', '),
    },
    {
      key: 'attorney_actions',
      label: 'Cancellation Attorney Actions',
      status: profile.requiresCancellationAttorney
        ? actionButtonProof.noDeadEndButtons
          ? 'ready'
          : 'blocked'
        : 'ready',
      value: profile.requiresCancellationAttorney ? `${metrics.cancellationAttorneyActionCount || 0} attorney actions` : 'not_required',
      detail: profile.requiresCancellationAttorney
        ? 'Cancellation attorney actions are available through generic workflow commands.'
        : 'Cancellation attorney actions are not required for this matter.',
    },
    {
      key: 'guarantee_coordination',
      label: 'Guarantee Coordination',
      status: profile.requiresCancellationAttorney
        ? workflowProof.guaranteeCoordinationCovered
          ? 'ready'
          : 'blocked'
        : 'ready',
      value: profile.requiresCancellationAttorney ? `${metrics.guaranteeCoordinationPairCount || 0} coordination pairs` : 'not_required',
      detail: profile.requiresCancellationAttorney
        ? 'Cancellation guarantee coordination is available in both directions.'
        : 'Guarantee coordination is not required unless cancellation is active.',
    },
    {
      key: 'lodgement_coordination',
      label: 'Lodgement Coordination',
      status: profile.requiresCancellationAttorney
        ? workflowProof.lodgementCoordinationCovered
          ? 'ready'
          : 'blocked'
        : 'ready',
      value: profile.requiresCancellationAttorney ? `${metrics.lodgementCoordinationPairCount || 0} coordination pairs` : 'not_required',
      detail: profile.requiresCancellationAttorney
        ? 'Cancellation lodgement coordination is available in both directions.'
        : 'Lodgement coordination is not required unless cancellation is active.',
    },
    {
      key: 'figures_notice_risk',
      label: 'Figures and Notice Risk',
      status: figuresRisk ? 'review' : 'ready',
      value: figuresRisk ? 'attention_required' : 'clear',
      detail: figuresRisk
        ? 'Figures expiry, penalty, or notice risk must be resolved before lodgement readiness.'
        : 'No figures expiry or notice risk supplied.',
    },
    {
      key: 'phase3_command_preset_gap',
      label: 'Phase 3 Command Preset Gap',
      status: workflowProof.phase3CommandPresetGapTracked ? 'warning' : 'blocked',
      value: workflowProof.phase3CommandPresetGapTracked ? 'tracked' : 'untracked',
      detail: 'Generic workflow actions are available; stage-specific cancellation command presets remain outstanding.',
    },
  ]

  const blockedChecks = checks.filter((check) => check.status === 'blocked')
  const reviewChecks = checks.filter((check) => check.status === 'review')
  const warningChecks = checks.filter((check) => check.status === 'warning')
  const releaseGateStatus = blockedChecks.length ? 'blocked' : reviewChecks.length ? 'review' : warningChecks.length ? 'go_with_phase3_gap' : 'go'

  return {
    key,
    label,
    profile,
    releaseGateStatus,
    status: releaseGateStatus === 'go' || releaseGateStatus === 'go_with_phase3_gap' ? 'ready' : releaseGateStatus,
    checks,
    signoffGaps: [
      ...expectedMismatches.map((message) => `${label}: ${message}`),
      ...blockedChecks.map((check) => `${label}: ${check.label} is blocked`),
      ...reviewChecks.map((check) => `${label}: ${check.label} needs review`),
    ],
    warnings: warningChecks.map((check) => `${label}: ${check.label} remains a warning`),
  }
}

export function buildCancellationLanePhase8UatReleaseGateReport({ facts = null, scenarioLabel = 'Selected cancellation matter' } = {}) {
  const phase7 = buildCancellationLanePhase7RolloutReadinessReport()
  const scenarioGates = CANCELLATION_PHASE6_SCENARIO_MATRIX.map((scenario) => buildCancellationLanePhase8ScenarioGate(scenario, phase7))
  const selectedScenarioGate = facts
    ? buildCancellationLanePhase8ScenarioGate({ key: 'selected_matter', label: scenarioLabel, facts }, phase7)
    : null
  const blockedScenarioGates = scenarioGates.filter((scenario) => scenario.releaseGateStatus === 'blocked')
  const phase7Blocked = phase7.status !== 'ready_for_phase8' || phase7.structuralBlockers.length > 0
  const selectedGateBlocks = selectedScenarioGate?.releaseGateStatus === 'blocked'
  const selectedGateNeedsReview = selectedScenarioGate?.releaseGateStatus === 'review'
  const phase3Warnings = phase7.warnings || []
  const structuralBlockers = unique([
    ...phase7.structuralBlockers,
    ...blockedScenarioGates.flatMap((scenario) => scenario.signoffGaps),
    ...(selectedGateBlocks ? selectedScenarioGate.signoffGaps : []),
  ])
  const expectedReviewItems = unique([
    ...scenarioGates
      .filter((scenario) => scenario.releaseGateStatus === 'review')
      .flatMap((scenario) => scenario.signoffGaps),
  ])
  const reviewItems = unique([
    ...(selectedGateNeedsReview ? selectedScenarioGate.signoffGaps : []),
  ])
  const warnings = unique([
    ...phase3Warnings,
    ...scenarioGates.flatMap((scenario) => scenario.warnings),
    ...(selectedScenarioGate ? selectedScenarioGate.warnings : []),
  ])
  const releaseGateStatus = structuralBlockers.length || phase7Blocked
    ? 'blocked'
    : selectedGateNeedsReview
      ? 'review'
      : warnings.length
        ? 'go_with_phase3_gap'
        : 'go'
  const status = releaseGateStatus === 'go'
    ? 'ready_for_controlled_rollout'
    : releaseGateStatus === 'go_with_phase3_gap'
      ? 'ready_for_controlled_uat_with_warning'
      : releaseGateStatus === 'review'
        ? 'review_required'
        : 'blocked'

  return {
    version: CANCELLATION_LANE_PHASE8_UAT_RELEASE_GATE_VERSION,
    phase7Version: phase7.version,
    status,
    releaseGateStatus,
    decision: releaseGateStatus,
    readiness: phase7.rolloutReadiness,
    uatChecklist: CANCELLATION_PHASE8_UAT_CHECKLIST,
    scenarioGates,
    selectedScenarioGate,
    signoff: {
      requiredChecklistCount: CANCELLATION_PHASE8_UAT_CHECKLIST.filter((item) => item.required).length,
      scenarioCount: scenarioGates.length,
      goScenarioCount: scenarioGates.filter((scenario) => ['go', 'go_with_phase3_gap'].includes(scenario.releaseGateStatus)).length,
      reviewScenarioCount: scenarioGates.filter((scenario) => scenario.releaseGateStatus === 'review').length,
      blockedScenarioCount: blockedScenarioGates.length,
      blockerCount: structuralBlockers.length,
      reviewCount: reviewItems.length,
      expectedReviewCount: expectedReviewItems.length,
      warningCount: warnings.length,
      requiredSignoffRoles: ['cancellation_attorney', 'transfer_attorney', 'bond_attorney', 'operations_owner'],
    },
    controlledRolloutRules: [
      'Use Phase 7 readiness as the first go/warning/hold condition before UAT signoff.',
      'Run every Phase 8 checklist item on at least one active cancellation matter before production rollout.',
      'Treat unknown seller bond status as review, not automatic cancellation activation.',
      'Keep no-seller-bond matters suppressing the cancellation lane even when buyer finance is bond or hybrid.',
      'Verify cash buyer with seller existing bond activates cancellation.',
      'Verify company and trust sellers against seller authority evidence requirements.',
      'Verify expired figures, penalty risk, or notice risk remains review until resolved before lodgement readiness.',
      'Keep Phase 3 command-preset warning visible until stage-specific cancellation commands are implemented.',
    ],
    expectedReviewItems,
    reviewItems,
    warnings,
    structuralBlockers,
  }
}

function buildCancellationLanePhase9ScenarioGate({
  key = 'ad_hoc',
  label = 'Ad hoc cancellation scenario',
  facts = {},
  expected = null,
} = {}, phase8 = null, actionCommandProof = {}) {
  const profile = buildCancellationLaneScenarioProfile(facts)
  const workflowProof = phase8?.readiness?.workflowProof || {}
  const unknownSellerBond = profile.lanePolicy.unknownSellerBondRequiresConfirmation
  const figuresRisk = profile.figuresExpired || profile.penaltyRisk || profile.noticeRisk
  const expectedMismatches = expected
    ? [
        profile.requiresCancellationAttorney !== expected.requiresCancellationAttorney
          ? `requiresCancellationAttorney expected ${expected.requiresCancellationAttorney} got ${profile.requiresCancellationAttorney}`
          : '',
        Boolean(expected.attention) !== (profile.status === 'attention')
          ? `attention expected ${Boolean(expected.attention)} got ${profile.status === 'attention'}`
          : '',
        ...(expected.sellerRequirementKeys || [])
          .filter((requirementKey) => !profile.sellerRequirementKeys.includes(requirementKey))
          .map((requirementKey) => `missing seller requirement ${requirementKey}`),
      ].filter(Boolean)
    : []

  const checks = [
    {
      key: 'seller_bond_status',
      label: 'Seller Bond Status',
      status: unknownSellerBond ? 'review' : 'ready',
      value: profile.sellerHasExistingBond === null ? 'unknown' : profile.sellerHasExistingBond ? 'existing_bond' : 'no_existing_bond',
      detail: unknownSellerBond ? 'Seller bond status must be confirmed before cancellation activation.' : 'Seller bond position is resolved.',
    },
    {
      key: 'lane_activation',
      label: 'Lane Activation',
      status: unknownSellerBond ? 'review' : 'ready',
      value: profile.requiresCancellationAttorney ? 'cancellation_lane_active' : 'cancellation_lane_inactive',
      detail: profile.requiresCancellationAttorney
        ? 'Cancellation lane is active from seller bond or explicit cancellation facts.'
        : 'Cancellation lane is suppressed because no seller bond/cancellation requirement applies.',
    },
    {
      key: 'seller_capacity',
      label: 'Seller Capacity Evidence',
      status: profile.sellerRequirementKeys.length ? 'ready' : 'blocked',
      value: `${profile.sellerRequirementKeys.length} requirement(s)`,
      detail: profile.sellerRequirementKeys.join(', '),
    },
    {
      key: 'attorney_action_commands',
      label: 'Cancellation Attorney Action Commands',
      status: profile.requiresCancellationAttorney
        ? actionCommandProof.allCancellationActionsCommandBacked
          ? 'ready'
          : 'blocked'
        : 'ready',
      value: profile.requiresCancellationAttorney ? `${actionCommandProof.commandBackedActionCount || 0} command-backed actions` : 'not_required',
      detail: profile.requiresCancellationAttorney
        ? 'Cancellation attorney buttons resolve to stage-specific command presets.'
        : 'Cancellation attorney actions are suppressed for this matter.',
    },
    {
      key: 'coordination_commands',
      label: 'Guarantee and Lodgement Coordination',
      status: profile.requiresCancellationAttorney
        ? workflowProof.guaranteeCoordinationCovered && workflowProof.lodgementCoordinationCovered
          ? 'ready'
          : 'blocked'
        : 'ready',
      value: profile.requiresCancellationAttorney ? 'coordination_available' : 'not_required',
      detail: profile.requiresCancellationAttorney
        ? 'Guarantee and simultaneous lodgement coordination remain available.'
        : 'Coordination is not required unless cancellation is active.',
    },
    {
      key: 'figures_notice_risk',
      label: 'Figures and Notice Risk',
      status: figuresRisk ? 'review' : 'ready',
      value: figuresRisk ? 'attention_required' : 'clear',
      detail: figuresRisk
        ? 'Figures expiry, penalty, or notice risk must be resolved before lodgement readiness.'
        : 'No figures expiry or notice risk supplied.',
    },
    {
      key: 'non_linear_workflow',
      label: 'Non-Linear Workflow',
      status: actionCommandProof.nonLinearWorkflowPreserved && workflowProof.concurrentWorkAllowed ? 'ready' : 'blocked',
      value: actionCommandProof.nonLinearWorkflowPreserved ? 'preserved' : 'missing',
      detail: 'Cancellation commands are independently executable and do not force previous stage completion.',
    },
  ]

  const blockedChecks = checks.filter((check) => check.status === 'blocked')
  const reviewChecks = checks.filter((check) => check.status === 'review')
  const releaseGateStatus = blockedChecks.length ? 'blocked' : reviewChecks.length ? 'review' : 'go'

  return {
    key,
    label,
    profile,
    releaseGateStatus,
    status: releaseGateStatus === 'go' ? 'ready' : releaseGateStatus,
    checks,
    signoffGaps: [
      ...expectedMismatches.map((message) => `${label}: ${message}`),
      ...blockedChecks.map((check) => `${label}: ${check.label} is blocked`),
      ...reviewChecks.map((check) => `${label}: ${check.label} needs review`),
    ],
  }
}

export function buildCancellationLanePhase9ActionCommandReleaseReport({ facts = null, scenarioLabel = 'Selected cancellation matter' } = {}) {
  const phase8 = buildCancellationLanePhase8UatReleaseGateReport()
  const phase2 = buildCancellationLanePhase2ActionAudit()
  const presetStageKeys = Object.keys(CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS)
  const attorneyStageKeys = phase2.attorney.requiredActions.map((action) => action.stageKey)
  const missingPresetStageKeys = attorneyStageKeys.filter((stageKey) => !presetStageKeys.includes(stageKey))
  const unusedPresetStageKeys = presetStageKeys.filter((stageKey) => !attorneyStageKeys.includes(stageKey))
  const stageSpecificCommands = phase2.attorney.requiredActions.map((action) => (
    buildCancellationActionCommandProbe(action, CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS[action.stageKey] || null)
  ))
  const noteOnlyStageKeys = presetStageKeys.filter((stageKey) => CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS[stageKey]?.commandType === 'add_note')
  const documentCommandStageKeys = presetStageKeys.filter((stageKey) => CANCELLATION_ATTORNEY_STAGE_COMMAND_PRESETS[stageKey]?.commandType === 'request_document')
  const failedCommandProbes = stageSpecificCommands.filter((command) => (
    !command.hasPreset ||
    !command.executable ||
    !command.commandMatchesPresetType ||
    !command.commandUsesPresetChecklist
  ))
  const phase8Blocked = phase8.releaseGateStatus === 'blocked' || phase8.structuralBlockers.length > 0

  const commandStructuralBlockers = [
    ...missingPresetStageKeys.map((stageKey) => `Missing cancellation stage command preset: ${stageKey}`),
    ...unusedPresetStageKeys.map((stageKey) => `Unused cancellation stage command preset: ${stageKey}`),
    ...failedCommandProbes.map((command) => `Cancellation action command is not executable from preset: ${command.actionId}`),
  ]
  const actionCommandProof = {
    commandBackedActionCount: stageSpecificCommands.filter((command) => command.executable && command.commandMatchesPresetType && command.commandUsesPresetChecklist).length,
    requiredActionCount: stageSpecificCommands.length,
    allCancellationActionsCommandBacked: commandStructuralBlockers.length === 0,
    noteOnlyStageKeys,
    documentCommandStageKeys,
    nonLinearWorkflowPreserved:
      phase2.attorney.nonLinearWorkflowPolicy === 'any_stage_can_be_updated_without_forcing_previous_stage_completion' &&
      stageSpecificCommands.every((command) => command.nonLinearSafe),
  }
  const scenarioGates = CANCELLATION_PHASE6_SCENARIO_MATRIX.map((scenario) => (
    buildCancellationLanePhase9ScenarioGate(scenario, phase8, actionCommandProof)
  ))
  const selectedScenarioGate = facts
    ? buildCancellationLanePhase9ScenarioGate({ key: 'selected_matter', label: scenarioLabel, facts }, phase8, actionCommandProof)
    : null
  const blockedScenarioGates = scenarioGates.filter((scenario) => scenario.releaseGateStatus === 'blocked')
  const selectedGateBlocks = selectedScenarioGate?.releaseGateStatus === 'blocked'
  const selectedGateNeedsReview = selectedScenarioGate?.releaseGateStatus === 'review'
  const structuralBlockers = unique([
    ...commandStructuralBlockers,
    ...(phase8Blocked ? phase8.structuralBlockers : []),
    ...blockedScenarioGates.flatMap((scenario) => scenario.signoffGaps),
    ...(selectedGateBlocks ? selectedScenarioGate.signoffGaps : []),
  ])
  const expectedReviewItems = unique([
    ...scenarioGates
      .filter((scenario) => scenario.releaseGateStatus === 'review')
      .flatMap((scenario) => scenario.signoffGaps),
  ])
  const reviewItems = unique([
    ...(selectedGateNeedsReview ? selectedScenarioGate.signoffGaps : []),
  ])
  const releaseGateStatus = structuralBlockers.length || phase8Blocked
    ? 'blocked'
    : selectedGateNeedsReview
      ? 'review'
      : 'go'
  const status = releaseGateStatus === 'go'
    ? 'ready_for_controlled_rollout'
    : releaseGateStatus === 'review'
      ? 'review_required'
      : 'blocked'

  return {
    version: CANCELLATION_LANE_PHASE9_ACTION_COMMAND_RELEASE_VERSION,
    phase8Version: phase8.version,
    phase2Version: phase2.version,
    status,
    releaseGateStatus,
    decision: releaseGateStatus,
    phase8DecisionRetired: phase8.releaseGateStatus === 'go_with_phase3_gap',
    readiness: phase8.readiness,
    actionCommandProof,
    stageSpecificCommands,
    uatChecklist: CANCELLATION_PHASE9_RELEASE_CHECKLIST,
    scenarioGates,
    selectedScenarioGate,
    signoff: {
      requiredChecklistCount: CANCELLATION_PHASE9_RELEASE_CHECKLIST.filter((item) => item.required).length,
      requiredActionCount: actionCommandProof.requiredActionCount,
      commandBackedActionCount: actionCommandProof.commandBackedActionCount,
      scenarioCount: scenarioGates.length,
      goScenarioCount: scenarioGates.filter((scenario) => scenario.releaseGateStatus === 'go').length,
      reviewScenarioCount: scenarioGates.filter((scenario) => scenario.releaseGateStatus === 'review').length,
      blockedScenarioCount: blockedScenarioGates.length,
      blockerCount: structuralBlockers.length,
      reviewCount: reviewItems.length,
      expectedReviewCount: expectedReviewItems.length,
      requiredSignoffRoles: ['cancellation_attorney', 'transfer_attorney', 'bond_attorney', 'operations_owner'],
    },
    controlledRolloutRules: [
      'Use Phase 9 stage-specific command presets for every cancellation attorney action button.',
      'Allow cancellation intake, figures, guarantees, documents, and lodgement work to run concurrently where the facts support it.',
      'Treat unknown seller bond status as review, not automatic cancellation activation.',
      'Treat expired figures, penalty risk, or notice risk as review until resolved before lodgement readiness.',
      'Keep no-seller-bond matters suppressing cancellation even when buyer finance is bond or hybrid.',
      'Keep cash buyer matters activating cancellation when the seller has an existing bond.',
      'Retain company and trust seller authority checks in cancellation work packets.',
    ],
    expectedReviewItems,
    reviewItems,
    structuralBlockers,
  }
}
