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

export const BOND_LANE_PHASE1_JOURNEY_VERSION = 'bond-lane-phase1-originator-attorney-map-v1'

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

function flatten(groups = [], property = 'stageKeys') {
  return groups.flatMap((group) => Array.isArray(group[property]) ? group[property] : [])
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
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
