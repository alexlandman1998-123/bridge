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
import {
  BOND_ORIGINATOR_EVIDENCE_LINK_DEFINITIONS,
  BOND_ORIGINATOR_EVIDENCE_LINK_VERSION,
} from './bondOriginatorEvidenceLinks.js'
import {
  ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS,
  BOND_ATTORNEY_STAGE_COMMAND_PRESETS,
} from '../../constants/attorneyWorkflowUsability.js'
import { BOND_CONSULTANT_ACTIONS } from '../bondConsultantActionService.js'

export const BOND_LANE_PHASE1_JOURNEY_VERSION = 'bond-lane-phase1-originator-attorney-map-v1'
export const BOND_LANE_PHASE2_ACTION_AUDIT_VERSION = 'bond-lane-phase2-action-audit-v1'
export const BOND_LANE_PHASE3_COMMAND_PLAN_VERSION = 'bond-lane-phase3-stage-command-plan-v1'
export const BOND_LANE_PHASE4_GUARANTEE_COORDINATION_VERSION = 'bond-lane-phase4-guarantee-coordination-v1'
export const BOND_LANE_PHASE5_LODGEMENT_COORDINATION_VERSION = 'bond-lane-phase5-lodgement-coordination-v1'
export const BOND_LANE_PHASE6_ORIGINATOR_EVIDENCE_VERSION = 'bond-lane-phase6-originator-evidence-links-v1'
export const BOND_LANE_PHASE7_SCENARIO_COVERAGE_VERSION = 'bond-lane-phase7-scenario-coverage-v1'

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

export const BOND_PHASE4_GUARANTEE_COORDINATION_PAIRS = Object.freeze([
  Object.freeze({
    key: 'bond_guarantees_to_transfer_acceptance',
    requestingLaneKey: 'transfer',
    dependencyLaneKey: 'bond',
    coordinationItemId: 'bond_bond_guarantees_issued',
    dependencyStageKey: 'guarantees_issued',
    receivingStageKey: 'guarantees_received',
    acceptanceStageKey: 'transfer_guarantees_accepted',
    handoffKey: 'bond_attorney_to_transfer_attorney',
    commandPresetKey: 'bond_bond_guarantees_issued',
    outcome: 'Transfer attorney can request, receive, check, and accept guarantees issued by the bond attorney.',
  }),
  Object.freeze({
    key: 'transfer_acceptance_to_bond_wording',
    requestingLaneKey: 'bond',
    dependencyLaneKey: 'transfer',
    coordinationItemId: 'transfer_transfer_guarantee_acceptance',
    dependencyStageKey: 'transfer_guarantees_accepted',
    receivingStageKey: 'guarantee_wording_accepted',
    acceptanceStageKey: 'guarantee_wording_accepted',
    handoffKey: 'bond_attorney_to_transfer_attorney',
    commandPresetKey: 'transfer_transfer_guarantee_acceptance',
    outcome: 'Bond attorney can request transfer attorney acceptance or corrections before marking guarantee wording accepted.',
  }),
])

export const BOND_PHASE5_LODGEMENT_COORDINATION_PAIRS = Object.freeze([
  Object.freeze({
    key: 'bond_readiness_to_transfer_lodgement',
    requestingLaneKey: 'transfer',
    dependencyLaneKey: 'bond',
    coordinationItemId: 'bond_bond_lodgement_ready',
    dependencyStageKey: 'bond_lodgement_ready',
    requestingStageKey: 'lodgement_ready',
    coordinatedStageKey: 'bond_lodged',
    handoffKey: 'bond_attorney_to_lodgement_coordination',
    commandPresetKey: 'bond_bond_lodgement_ready',
    outcome: 'Transfer attorney can request bond lodgement readiness before confirming simultaneous lodgement.',
  }),
  Object.freeze({
    key: 'transfer_readiness_to_bond_lodgement',
    requestingLaneKey: 'bond',
    dependencyLaneKey: 'transfer',
    coordinationItemId: 'transfer_transfer_lodgement_ready',
    dependencyStageKey: 'lodgement_ready',
    requestingStageKey: 'bond_lodgement_ready',
    coordinatedStageKey: 'bond_lodged',
    handoffKey: 'bond_attorney_to_lodgement_coordination',
    commandPresetKey: 'transfer_transfer_lodgement_ready',
    outcome: 'Bond attorney can request transfer lodgement readiness before marking the bond lodged simultaneously.',
  }),
])

export const BOND_PHASE7_SCENARIO_MATRIX = Object.freeze([
  Object.freeze({
    key: 'cash_individual_unmarried',
    label: 'Cash individual buyer',
    facts: {
      financeType: 'cash',
      buyerEntityType: 'individual',
      buyerMaritalStatus: 'single',
      sellerEntityType: 'individual',
      sellerHasExistingBond: false,
    },
    expected: {
      requiresBondOriginator: false,
      requiresBondAttorney: false,
      requiresCancellationAttorney: false,
      buyerRequirementKeys: ['buyer_identity', 'buyer_proof_of_address'],
    },
  }),
  Object.freeze({
    key: 'cash_married_in_community',
    label: 'Cash married buyer',
    facts: {
      financeType: 'cash',
      buyerEntityType: 'individual',
      buyerMaritalStatus: 'married_in_community',
      sellerEntityType: 'individual',
      sellerHasExistingBond: false,
    },
    expected: {
      requiresBondOriginator: false,
      requiresBondAttorney: false,
      requiresCancellationAttorney: false,
      buyerRequirementKeys: ['buyer_identity', 'buyer_marital_status', 'buyer_spouse_consent'],
    },
  }),
  Object.freeze({
    key: 'bond_married_out_of_community',
    label: 'Bond married buyer',
    facts: {
      financeType: 'bond',
      buyerEntityType: 'individual',
      buyerMaritalStatus: 'married_out_of_community',
      sellerEntityType: 'individual',
      sellerHasExistingBond: false,
    },
    expected: {
      requiresBondOriginator: true,
      requiresBondAttorney: true,
      requiresCancellationAttorney: false,
      buyerRequirementKeys: ['buyer_identity', 'buyer_income_documents', 'buyer_bank_statements', 'buyer_marital_status', 'buyer_antenuptial_contract'],
    },
  }),
  Object.freeze({
    key: 'bond_multiple_buyers',
    label: 'Bond multiple buyers',
    facts: {
      financeType: 'bond',
      buyerEntityType: 'individual',
      hasMultipleBuyers: true,
      sellerEntityType: 'individual',
      sellerHasExistingBond: false,
    },
    expected: {
      requiresBondOriginator: true,
      requiresBondAttorney: true,
      requiresCancellationAttorney: false,
      buyerRequirementKeys: ['buyer_identity', 'buyer_income_documents', 'buyer_bank_statements', 'co_buyer_finance_applications'],
    },
  }),
  Object.freeze({
    key: 'bond_company_buyer_trust_seller_cancellation',
    label: 'Company buyer, trust seller, cancellation',
    facts: {
      financeType: 'bond',
      buyerEntityType: 'company',
      sellerEntityType: 'trust',
      sellerHasExistingBond: true,
    },
    expected: {
      requiresBondOriginator: true,
      requiresBondAttorney: true,
      requiresCancellationAttorney: true,
      buyerRequirementKeys: ['buyer_company_registration', 'buyer_company_resolution', 'buyer_director_ids', 'buyer_company_financials'],
    },
  }),
  Object.freeze({
    key: 'hybrid_trust_buyer_company_seller_cancellation',
    label: 'Hybrid trust buyer, company seller',
    facts: {
      financeType: 'hybrid',
      buyerEntityType: 'trust',
      sellerEntityType: 'company',
      sellerHasExistingBond: true,
    },
    expected: {
      requiresBondOriginator: true,
      requiresBondAttorney: true,
      requiresCancellationAttorney: true,
      buyerRequirementKeys: ['buyer_trust_deed', 'buyer_letters_of_authority', 'buyer_trustee_ids', 'buyer_trustee_resolution'],
    },
  }),
  Object.freeze({
    key: 'unknown_finance_company_buyer',
    label: 'Unknown finance company buyer',
    facts: {
      buyerEntityType: 'company',
      sellerEntityType: 'individual',
      sellerHasExistingBond: false,
    },
    expected: {
      requiresBondOriginator: false,
      requiresBondAttorney: false,
      requiresCancellationAttorney: false,
      attention: true,
      buyerRequirementKeys: ['buyer_company_registration', 'buyer_company_resolution', 'buyer_director_ids'],
    },
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

function normalizeScenarioText(value = '') {
  return String(value || '').trim()
}

function normalizeScenarioKey(value = '') {
  return normalizeScenarioText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function normalizeScenarioBoolean(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const normalized = normalizeScenarioKey(value)
  if (!normalized) return null
  if (['true', 'yes', 'y', '1', 'required', 'applicable', 'has_bond', 'existing_bond', 'bond_registered'].includes(normalized)) return true
  if (['false', 'no', 'n', '0', 'not_required', 'not_applicable', 'none', 'no_bond', 'cash'].includes(normalized)) return false
  return null
}

function normalizeBondScenarioFinanceType(value = '', facts = {}) {
  const normalized = normalizeScenarioKey(value || facts.finance_type || facts.financeType)
  if (!normalized && facts.isCashDeal === true) return 'cash'
  if (['cash', 'cash_sale', 'cash_deal'].includes(normalized)) return 'cash'
  if (['bond', 'bond_finance', 'mortgage', 'home_loan'].includes(normalized)) return 'bond'
  if (['hybrid', 'combination', 'mixed', 'bond_and_cash'].includes(normalized)) return 'combination'
  if (['developer', 'developer_finance'].includes(normalized)) return 'developer'
  return 'unknown'
}

function normalizeBondScenarioEntityType(value = '') {
  const normalized = normalizeScenarioKey(value)
  if (['person', 'natural_person', 'individual', 'private_individual'].includes(normalized)) return 'individual'
  if (['company', 'close_corporation', 'cc', 'pty', 'pty_ltd'].includes(normalized)) return 'company'
  if (['trust', 'inter_vivos_trust'].includes(normalized)) return 'trust'
  return 'unknown'
}

function buildBondBuyerRequirementKeys({
  buyerEntityType = 'unknown',
  buyerMaritalStatus = '',
  hasMultipleBuyers = false,
  requiresBondOriginator = false,
} = {}) {
  const requirements = []
  if (buyerEntityType === 'individual') {
    requirements.push('buyer_identity', 'buyer_proof_of_address')
    if (requiresBondOriginator) requirements.push('buyer_income_documents', 'buyer_bank_statements')
    const maritalStatus = normalizeScenarioKey(buyerMaritalStatus)
    if (maritalStatus.includes('married')) requirements.push('buyer_marital_status')
    if (maritalStatus.includes('in_community')) requirements.push('buyer_spouse_consent')
    if (maritalStatus.includes('out_of_community') || maritalStatus.includes('anc')) requirements.push('buyer_antenuptial_contract')
  } else if (buyerEntityType === 'company') {
    requirements.push('buyer_company_registration', 'buyer_company_resolution', 'buyer_director_ids')
    if (requiresBondOriginator) requirements.push('buyer_company_financials')
  } else if (buyerEntityType === 'trust') {
    requirements.push('buyer_trust_deed', 'buyer_letters_of_authority', 'buyer_trustee_ids', 'buyer_trustee_resolution')
  } else {
    requirements.push('buyer_capacity_to_confirm')
  }
  if (hasMultipleBuyers) requirements.push('co_buyer_finance_applications')
  return unique(requirements)
}

export function buildBondLaneScenarioProfile(facts = {}) {
  const financeType = normalizeBondScenarioFinanceType(facts.financeType || facts.finance_type, facts)
  const buyerEntityType = normalizeBondScenarioEntityType(facts.buyerEntityType || facts.buyer_entity_type || facts.buyer?.entityType || facts.buyer?.entity_type)
  const sellerEntityType = normalizeBondScenarioEntityType(facts.sellerEntityType || facts.seller_entity_type || facts.seller?.entityType || facts.seller?.entity_type)
  const explicitBondOriginator = normalizeScenarioBoolean(facts.requiresBondOriginator ?? facts.requires_bond_originator)
  const explicitBondAttorney = normalizeScenarioBoolean(facts.requiresBondAttorney ?? facts.requires_bond_attorney)
  const sellerHasExistingBond = normalizeScenarioBoolean(facts.sellerHasExistingBond ?? facts.seller_has_existing_bond)
  const explicitCancellation = normalizeScenarioBoolean(facts.requiresCancellationAttorney ?? facts.requires_cancellation_attorney ?? facts.cancellationRequired ?? facts.cancellation_required)
  const hasMultipleBuyers = Boolean(facts.hasMultipleBuyers || facts.multipleBuyers || Number(facts.buyerCount || facts.buyer_count || 0) > 1)
  const bondFinanceApplies = ['bond', 'combination', 'developer'].includes(financeType)
  const requiresBondOriginator = explicitBondOriginator ?? bondFinanceApplies
  const requiresBondAttorney = explicitBondAttorney ?? bondFinanceApplies
  const requiresCancellationAttorney = explicitCancellation ?? sellerHasExistingBond ?? false
  const attention = financeType === 'unknown' || buyerEntityType === 'unknown' || sellerEntityType === 'unknown'
  const buyerRequirementKeys = buildBondBuyerRequirementKeys({
    buyerEntityType,
    buyerMaritalStatus: facts.buyerMaritalStatus || facts.buyer_marital_status || facts.buyer?.maritalStatus || facts.buyer?.marital_status,
    hasMultipleBuyers,
    requiresBondOriginator,
  })

  return {
    financeType,
    buyerEntityType,
    sellerEntityType,
    hasMultipleBuyers,
    sellerHasExistingBond,
    requiresBondOriginator,
    requiresBondAttorney,
    requiresCancellationAttorney,
    status: attention ? 'attention' : 'covered',
    lanePolicy: {
      originatorLaneActive: requiresBondOriginator,
      bondAttorneyLaneActive: requiresBondAttorney,
      cancellationLaneActive: requiresCancellationAttorney,
      cashRouteSuppressesBondLanes: financeType === 'cash' && !requiresBondOriginator && !requiresBondAttorney,
      unknownFinanceRequiresConfirmation: financeType === 'unknown',
      concurrentWorkAllowed: true,
    },
    buyerRequirementKeys,
    coverageItems: [
      {
        key: 'finance_route',
        label: 'Finance Route',
        value: financeType,
        status: financeType === 'unknown' ? 'attention' : 'covered',
        detail: bondFinanceApplies ? 'Bond originator and bond attorney lanes apply.' : financeType === 'cash' ? 'Cash route suppresses bond lanes.' : 'Finance route must be confirmed.',
      },
      {
        key: 'buyer_capacity',
        label: 'Buyer Capacity',
        value: buyerEntityType,
        status: buyerEntityType === 'unknown' ? 'attention' : 'covered',
        detail: `${buyerRequirementKeys.length} buyer requirement(s) tracked.`,
      },
      {
        key: 'seller_capacity',
        label: 'Seller Capacity',
        value: sellerEntityType,
        status: sellerEntityType === 'unknown' ? 'attention' : 'covered',
        detail: requiresCancellationAttorney ? 'Seller existing bond/cancellation lane applies.' : 'No seller cancellation lane required.',
      },
      {
        key: 'lane_activation',
        label: 'Lane Activation',
        value: requiresBondAttorney ? 'Bond lane active' : 'Bond lane inactive',
        status: financeType === 'unknown' ? 'attention' : 'covered',
        detail: requiresBondAttorney ? 'Originator and bond attorney work can run concurrently.' : 'No bond attorney lane unless finance requires it.',
      },
    ],
  }
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

export function buildBondLanePhase4GuaranteeCoordinationPlan() {
  const phase3 = buildBondLanePhase3CommandPlan()
  const map = buildBondLaneJourneyMap()
  const transferGuaranteeHandoff = map.handoffs.find((handoff) => handoff.key === 'bond_attorney_to_transfer_attorney') || null
  const attorneyStageKeys = map.attorney.stageKeys
  const commandPresetKeys = Object.keys(ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS)

  const pairs = BOND_PHASE4_GUARANTEE_COORDINATION_PAIRS.map((pair) => ({
    ...pair,
    commandPreset: ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS[pair.commandPresetKey] || null,
    commandPresetCovered: commandPresetKeys.includes(pair.commandPresetKey),
    handoffCovered: transferGuaranteeHandoff?.key === pair.handoffKey,
    bondStageCovered:
      attorneyStageKeys.includes(pair.dependencyStageKey) ||
      attorneyStageKeys.includes(pair.receivingStageKey) ||
      attorneyStageKeys.includes(pair.acceptanceStageKey),
  }))

  const structuralBlockers = [
    ...phase3.structuralBlockers,
    ...pairs
      .filter((pair) => !pair.commandPresetCovered)
      .map((pair) => `Missing guarantee coordination command preset: ${pair.commandPresetKey}`),
    ...pairs
      .filter((pair) => !pair.handoffCovered)
      .map((pair) => `Missing guarantee handoff for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => pair.requestingLaneKey === 'bond' && !pair.bondStageCovered)
      .map((pair) => `Missing bond guarantee receiving stage for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => pair.dependencyLaneKey === 'bond' && !pair.bondStageCovered)
      .map((pair) => `Missing bond guarantee dependency stage for coordination pair: ${pair.key}`),
  ]

  return {
    version: BOND_LANE_PHASE4_GUARANTEE_COORDINATION_VERSION,
    phase3Version: phase3.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase5',
    handoff: transferGuaranteeHandoff,
    pairs,
    rolloutRules: [
      'Bond attorney guarantee issuance and transfer attorney guarantee acceptance are represented as one paired exchange.',
      'Transfer can request issued guarantees from bond without completing unrelated transfer stages first.',
      'Bond can request transfer wording acceptance before marking bond guarantee wording accepted.',
      'Coordination requests stay professional-shared and persist as workflow notes with sourceCoordinationId metadata.',
    ],
    structuralBlockers,
  }
}

export function buildBondLanePhase5LodgementCoordinationPlan() {
  const phase4 = buildBondLanePhase4GuaranteeCoordinationPlan()
  const map = buildBondLaneJourneyMap()
  const lodgementHandoff = map.handoffs.find((handoff) => handoff.key === 'bond_attorney_to_lodgement_coordination') || null
  const attorneyStageKeys = map.attorney.stageKeys
  const commandPresetKeys = Object.keys(ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS)

  const pairs = BOND_PHASE5_LODGEMENT_COORDINATION_PAIRS.map((pair) => ({
    ...pair,
    commandPreset: ATTORNEY_WORKFLOW_COORDINATION_COMMAND_PRESETS[pair.commandPresetKey] || null,
    commandPresetCovered: commandPresetKeys.includes(pair.commandPresetKey),
    handoffCovered: lodgementHandoff?.key === pair.handoffKey,
    bondStageCovered:
      attorneyStageKeys.includes(pair.dependencyStageKey) ||
      attorneyStageKeys.includes(pair.requestingStageKey) ||
      attorneyStageKeys.includes(pair.coordinatedStageKey),
  }))

  const structuralBlockers = [
    ...phase4.structuralBlockers,
    ...pairs
      .filter((pair) => !pair.commandPresetCovered)
      .map((pair) => `Missing lodgement coordination command preset: ${pair.commandPresetKey}`),
    ...pairs
      .filter((pair) => !pair.handoffCovered)
      .map((pair) => `Missing lodgement handoff for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => pair.requestingLaneKey === 'bond' && !pair.bondStageCovered)
      .map((pair) => `Missing bond lodgement requesting stage for coordination pair: ${pair.key}`),
    ...pairs
      .filter((pair) => pair.dependencyLaneKey === 'bond' && !pair.bondStageCovered)
      .map((pair) => `Missing bond lodgement dependency stage for coordination pair: ${pair.key}`),
  ]

  return {
    version: BOND_LANE_PHASE5_LODGEMENT_COORDINATION_VERSION,
    phase4Version: phase4.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase6',
    handoff: lodgementHandoff,
    pairs,
    rolloutRules: [
      'Bond lodgement readiness and transfer lodgement readiness are paired but independently actionable.',
      'Transfer can request bond readiness before all transfer-side lodgement steps are complete.',
      'Bond can request transfer readiness before marking bond lodged simultaneously.',
      'Coordination requests persist as professional-shared workflow notes with sourceCoordinationId metadata.',
    ],
    structuralBlockers,
  }
}

export function buildBondLanePhase6OriginatorEvidencePlan() {
  const phase5 = buildBondLanePhase5LodgementCoordinationPlan()
  const originatorActionKeys = BOND_ORIGINATOR_PHASE2_REQUIRED_ACTIONS.map((action) => action.sourceActionKey)
  const requiredLinkKeys = [
    'application',
    'documents',
    'bankFeedback',
    'offers',
    'buyerDecision',
    'grant',
    'signedGrant',
    'instruction',
    'activity',
  ]
  const links = BOND_ORIGINATOR_EVIDENCE_LINK_DEFINITIONS.map((definition) => ({
    key: definition.key,
    label: definition.label,
    actionKey: definition.action.key,
    targetWorkspaceTab: definition.action.targetWorkspaceTab,
    targetAction: definition.action.targetAction,
    evidence: definition.evidence,
    coveredByOriginatorAction: originatorActionKeys.includes(definition.action.key),
  }))
  const linkKeys = links.map((link) => link.key)
  const structuralBlockers = [
    ...phase5.structuralBlockers,
    ...requiredLinkKeys
      .filter((key) => !linkKeys.includes(key))
      .map((key) => `Missing originator evidence deep link: ${key}`),
    ...links
      .filter((link) => !link.coveredByOriginatorAction)
      .map((link) => `Originator evidence link is not covered by Phase 2 action baseline: ${link.key}`),
  ]

  return {
    version: BOND_LANE_PHASE6_ORIGINATOR_EVIDENCE_VERSION,
    phase5Version: phase5.version,
    sourceVersion: BOND_ORIGINATOR_EVIDENCE_LINK_VERSION,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase7',
    links,
    attorneySurfaces: [
      'BondOriginatorAgentProgressView',
      'BondOriginatorAttorneyHandoffView',
      'TransactionFinanceCommandCenter handoffPanel',
    ],
    rolloutRules: [
      'Attorney-side originator panels remain read-only.',
      'Deep links route to the bond file workspace with tab and action parameters.',
      'Grant and signed grant document buttons still open document URLs directly where available.',
      'Originator mutation remains governed by the bond originator workspace.',
    ],
    structuralBlockers,
  }
}

export function buildBondLanePhase7ScenarioCoveragePlan() {
  const phase6 = buildBondLanePhase6OriginatorEvidencePlan()
  const scenarios = BOND_PHASE7_SCENARIO_MATRIX.map((scenario) => {
    const profile = buildBondLaneScenarioProfile(scenario.facts)
    const missingBuyerRequirementKeys = (scenario.expected.buyerRequirementKeys || [])
      .filter((key) => !profile.buyerRequirementKeys.includes(key))
    const mismatches = [
      profile.requiresBondOriginator !== scenario.expected.requiresBondOriginator
        ? `requiresBondOriginator expected ${scenario.expected.requiresBondOriginator} got ${profile.requiresBondOriginator}`
        : '',
      profile.requiresBondAttorney !== scenario.expected.requiresBondAttorney
        ? `requiresBondAttorney expected ${scenario.expected.requiresBondAttorney} got ${profile.requiresBondAttorney}`
        : '',
      profile.requiresCancellationAttorney !== scenario.expected.requiresCancellationAttorney
        ? `requiresCancellationAttorney expected ${scenario.expected.requiresCancellationAttorney} got ${profile.requiresCancellationAttorney}`
        : '',
      scenario.expected.attention && profile.status !== 'attention'
        ? `expected scenario attention status got ${profile.status}`
        : '',
      !scenario.expected.requiresBondAttorney && profile.lanePolicy.bondAttorneyLaneActive
        ? 'bond attorney lane should be inactive'
        : '',
      ...missingBuyerRequirementKeys.map((key) => `missing buyer requirement ${key}`),
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
    ...phase6.structuralBlockers,
    ...scenarios.flatMap((scenario) => scenario.mismatches.map((message) => `${scenario.key}: ${message}`)),
  ]

  return {
    version: BOND_LANE_PHASE7_SCENARIO_COVERAGE_VERSION,
    phase6Version: phase6.version,
    status: structuralBlockers.length ? 'blocked' : 'ready_for_phase8',
    scenarioCount: scenarios.length,
    scenarios,
    coverageSummary: {
      cashScenarios: scenarios.filter((scenario) => scenario.profile.financeType === 'cash').length,
      bondScenarios: scenarios.filter((scenario) => ['bond', 'combination', 'developer'].includes(scenario.profile.financeType)).length,
      unknownFinanceScenarios: scenarios.filter((scenario) => scenario.profile.financeType === 'unknown').length,
      cancellationScenarios: scenarios.filter((scenario) => scenario.profile.requiresCancellationAttorney).length,
      companyBuyerScenarios: scenarios.filter((scenario) => scenario.profile.buyerEntityType === 'company').length,
      trustBuyerScenarios: scenarios.filter((scenario) => scenario.profile.buyerEntityType === 'trust').length,
      marriedBuyerScenarios: scenarios.filter((scenario) => scenario.profile.buyerRequirementKeys.includes('buyer_marital_status')).length,
      multipleBuyerScenarios: scenarios.filter((scenario) => scenario.profile.hasMultipleBuyers).length,
    },
    rolloutRules: [
      'Cash finance suppresses bond originator and bond attorney lanes.',
      'Bond, hybrid, and developer finance activate originator and bond attorney lanes.',
      'Seller existing bond activates cancellation coordination without changing bond attorney ownership.',
      'Company and trust buyers surface authority requirements for bond originator and attorney evidence review.',
      'Unknown finance remains an attention state until finance is confirmed.',
      'Concurrent work remains allowed across scenario variants.',
    ],
    structuralBlockers,
  }
}
