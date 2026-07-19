import { normalizeFinanceType } from '../transactions/financeType.js'
import {
  createTransactionProgressDefinition,
  TRANSACTION_PROGRESS_VISIBILITY,
} from '../transactions/sharedTransactionProgressContract.js'

export const OPERATIONAL_ACTION_TYPES = [
  'confirmation',
  'document_upload',
  'document_review',
  'client_action',
  'signature_confirmation',
  'milestone',
  'internal_progress',
  'compliance_check',
]

function normalizePropertyType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isSectionalTitleProperty(propertyType) {
  return normalizePropertyType(propertyType).includes('sectional')
}

export const OPERATIONAL_STEP_DEFINITIONS = {
  finance: [
    {
      stepKey: 'application_received',
      lane: 'finance',
      label: 'Confirm bond application received',
      actionType: 'confirmation',
      ownerRole: 'bond_originator',
      clientVisible: false,
      completionEventType: 'finance_application_received',
    },
    {
      stepKey: 'buyer_documents_collected',
      lane: 'finance',
      label: 'Collect buyer finance documents',
      actionType: 'document_review',
      ownerRole: 'bond_originator',
      clientVisible: false,
      completionEventType: 'finance_documents_collected',
    },
    {
      stepKey: 'submitted_to_banks',
      lane: 'finance',
      label: 'Submit application to banks',
      actionType: 'milestone',
      ownerRole: 'bond_originator',
      clientVisible: true,
      clientUpdateText: 'Your finance application has been submitted to the banks.',
      completionEventType: 'finance_submitted_to_banks',
    },
    {
      stepKey: 'bank_feedback_received',
      lane: 'finance',
      label: 'Capture bank feedback',
      actionType: 'document_review',
      ownerRole: 'bond_originator',
      clientVisible: false,
      completionEventType: 'finance_bank_feedback_received',
    },
    {
      stepKey: 'bond_approved',
      lane: 'finance',
      label: 'Confirm bond approval',
      actionType: 'confirmation',
      ownerRole: 'bond_originator',
      clientVisible: true,
      clientUpdateText: 'Your bond has been approved and registration prep can begin.',
      completionEventType: 'bond_approved',
      financeTypes: ['bond', 'combination'],
    },
    {
      stepKey: 'grant_signed',
      lane: 'finance',
      label: 'Confirm grant signed',
      actionType: 'signature_confirmation',
      ownerRole: 'bond_originator',
      requiredDocumentType: 'grant_letter',
      clientVisible: false,
      completionEventType: 'finance_grant_signed',
      financeTypes: ['bond', 'combination'],
    },
    {
      stepKey: 'bond_instruction_sent_to_attorneys',
      lane: 'finance',
      label: 'Notify attorneys of bond instruction',
      actionType: 'internal_progress',
      ownerRole: 'bond_originator',
      clientVisible: true,
      clientUpdateText: 'Bond instruction has been shared with the legal team.',
      completionEventType: 'finance_bond_instruction_sent',
      financeTypes: ['bond', 'combination'],
    },
    {
      stepKey: 'proof_of_funds_requested',
      lane: 'finance',
      label: 'Request proof of funds from buyer',
      actionType: 'client_action',
      ownerRole: 'bond_originator',
      clientVisible: true,
      clientUpdateText: 'Action required: upload proof of funds.',
      completionEventType: 'proof_of_funds_requested',
      financeTypes: ['cash', 'combination'],
    },
    {
      stepKey: 'proof_of_funds_received',
      lane: 'finance',
      label: 'Review proof of funds',
      actionType: 'document_review',
      ownerRole: 'bond_originator',
      requiredDocumentType: 'proof_of_funds',
      clientVisible: false,
      completionEventType: 'proof_of_funds_received',
      financeTypes: ['cash', 'combination'],
    },
    {
      stepKey: 'funds_secured_confirmed',
      lane: 'finance',
      label: 'Confirm funds secured',
      actionType: 'confirmation',
      ownerRole: 'bond_originator',
      clientVisible: true,
      clientUpdateText: 'Funding readiness is confirmed.',
      completionEventType: 'funds_secured_confirmed',
      financeTypes: ['cash', 'combination'],
    },
    {
      stepKey: 'guarantees_grant_issued',
      lane: 'finance',
      label: 'Upload grant / guarantee output',
      actionType: 'document_upload',
      ownerRole: 'bond_originator',
      requiredDocumentType: 'grant_letter',
      clientVisible: false,
      completionEventType: 'guarantees_or_grant_issued',
      financeTypes: ['bond', 'combination'],
    },
    {
      stepKey: 'ready_for_transfer',
      lane: 'finance',
      label: 'Mark finance handoff ready',
      actionType: 'milestone',
      ownerRole: 'bond_originator',
      clientVisible: true,
      clientUpdateText: 'Finance handoff is complete and transfer is progressing.',
      completionEventType: 'finance_ready_for_transfer',
    },
  ],
  transfer: [
    {
      stepKey: 'instruction_received',
      lane: 'transfer',
      label: 'Confirm instruction received',
      actionType: 'confirmation',
      ownerRole: 'transfer_attorney',
      clientVisible: false,
      completionEventType: 'transfer_instruction_received',
    },
    {
      stepKey: 'seller_fica_received',
      lane: 'transfer',
      label: 'Confirm buyer and seller FICA received',
      actionType: 'document_review',
      ownerRole: 'transfer_attorney',
      clientVisible: false,
      completionEventType: 'transfer_fica_received',
    },
    {
      stepKey: 'transfer_documents_prepared',
      lane: 'transfer',
      label: 'Prepare transfer documents',
      actionType: 'internal_progress',
      ownerRole: 'transfer_attorney',
      clientVisible: true,
      clientUpdateText: 'Transfer documents are being prepared.',
      completionEventType: 'transfer_documents_prepared',
    },
    {
      stepKey: 'buyer_signed_transfer_documents',
      lane: 'transfer',
      label: 'Confirm buyer signed transfer documents',
      actionType: 'signature_confirmation',
      ownerRole: 'transfer_attorney',
      clientVisible: false,
      completionEventType: 'buyer_signed_transfer_documents',
    },
    {
      stepKey: 'seller_signed_transfer_documents',
      lane: 'transfer',
      label: 'Confirm seller signed transfer documents',
      actionType: 'signature_confirmation',
      ownerRole: 'transfer_attorney',
      clientVisible: false,
      completionEventType: 'seller_signed_transfer_documents',
    },
    {
      stepKey: 'rates_figures_requested',
      lane: 'transfer',
      label: 'Request rates clearance',
      actionType: 'confirmation',
      ownerRole: 'transfer_attorney',
      clientVisible: true,
      clientUpdateText: 'Rates clearance is in progress.',
      completionEventType: 'rates_clearance_requested',
    },
    {
      stepKey: 'rates_clearance_received',
      lane: 'transfer',
      label: 'Confirm rates clearance received',
      actionType: 'document_upload',
      ownerRole: 'transfer_attorney',
      requiredDocumentType: 'rates_clearance_certificate',
      clientVisible: true,
      clientUpdateText: 'Rates clearance is being handled by the attorneys.',
      completionEventType: 'rates_clearance_received',
    },
    {
      stepKey: 'levy_clearance_requested',
      lane: 'transfer',
      label: 'Request levy clearance',
      actionType: 'confirmation',
      ownerRole: 'transfer_attorney',
      clientVisible: true,
      clientUpdateText: 'Levy clearance is in progress.',
      completionEventType: 'levy_clearance_requested',
      onlySectionalTitle: true,
    },
    {
      stepKey: 'levy_clearance_received',
      lane: 'transfer',
      label: 'Confirm levy clearance received',
      actionType: 'document_upload',
      ownerRole: 'transfer_attorney',
      requiredDocumentType: 'levy_clearance_certificate',
      clientVisible: true,
      clientUpdateText: 'Levy clearance is being handled by the attorneys.',
      completionEventType: 'levy_clearance_received',
      onlySectionalTitle: true,
    },
    {
      stepKey: 'guarantees_received',
      lane: 'transfer',
      label: 'Confirm guarantees received',
      actionType: 'confirmation',
      ownerRole: 'transfer_attorney',
      requiredDocumentType: 'guarantee_letter',
      clientVisible: true,
      clientUpdateText: 'Financial guarantees have been received for transfer.',
      completionEventType: 'guarantees_received',
    },
    {
      stepKey: 'lodgement_ready',
      lane: 'transfer',
      label: 'Confirm lodgement ready',
      actionType: 'internal_progress',
      ownerRole: 'transfer_attorney',
      clientVisible: true,
      clientUpdateText: 'Lodgement preparation is underway.',
      completionEventType: 'lodgement_ready',
    },
    {
      stepKey: 'lodged_at_deeds_office',
      lane: 'transfer',
      label: 'Confirm lodged at Deeds Office',
      actionType: 'milestone',
      ownerRole: 'transfer_attorney',
      requiredDocumentType: 'lodgement_proof',
      clientVisible: true,
      clientUpdateText: 'Your transfer has been lodged.',
      completionEventType: 'transfer_lodged',
    },
    {
      stepKey: 'registered',
      lane: 'transfer',
      label: 'Confirm registered',
      actionType: 'milestone',
      ownerRole: 'transfer_attorney',
      requiredDocumentType: 'registration_confirmation',
      clientVisible: true,
      clientUpdateText: 'Registration has been completed.',
      completionEventType: 'registration_confirmed',
    },
  ],
  bond: [
    {
      stepKey: 'bond_instruction_received',
      lane: 'bond',
      label: 'Confirm bond instruction received',
      actionType: 'confirmation',
      ownerRole: 'bond_attorney',
      clientVisible: false,
      completionEventType: 'bond_instruction_received',
    },
    {
      stepKey: 'bank_requirements_confirmed',
      lane: 'bond',
      label: 'Confirm bank requirements',
      actionType: 'document_review',
      ownerRole: 'bond_attorney',
      clientVisible: false,
      completionEventType: 'bank_requirements_confirmed',
    },
    {
      stepKey: 'bond_documents_prepared',
      lane: 'bond',
      label: 'Prepare bond documents',
      actionType: 'internal_progress',
      ownerRole: 'bond_attorney',
      clientVisible: true,
      clientUpdateText: 'Bond registration is being prepared.',
      completionEventType: 'bond_documents_prepared',
    },
    {
      stepKey: 'buyer_signed_bond_documents',
      lane: 'bond',
      label: 'Confirm buyer signed bond documents',
      actionType: 'signature_confirmation',
      ownerRole: 'bond_attorney',
      clientVisible: true,
      clientUpdateText: 'Bond documents are ready for signing.',
      completionEventType: 'bond_documents_signed',
    },
    {
      stepKey: 'guarantees_issued',
      lane: 'bond',
      label: 'Confirm guarantees issued',
      actionType: 'signature_confirmation',
      ownerRole: 'bond_attorney',
      clientVisible: false,
      completionEventType: 'guarantees_issued',
    },
    {
      stepKey: 'bond_lodgement_ready',
      lane: 'bond',
      label: 'Confirm bond lodgement ready',
      actionType: 'internal_progress',
      ownerRole: 'bond_attorney',
      clientVisible: true,
      clientUpdateText: 'Bond lodgement preparation is underway.',
      completionEventType: 'bond_lodgement_ready',
    },
    {
      stepKey: 'bond_lodged',
      lane: 'bond',
      label: 'Confirm bond lodged',
      actionType: 'milestone',
      ownerRole: 'bond_attorney',
      clientVisible: true,
      clientUpdateText: 'Bond registration has been lodged.',
      completionEventType: 'bond_lodged',
    },
    {
      stepKey: 'bond_registered',
      lane: 'bond',
      label: 'Confirm bond registered',
      actionType: 'milestone',
      ownerRole: 'bond_attorney',
      clientVisible: true,
      clientUpdateText: 'Bond registration has been completed.',
      completionEventType: 'bond_registered',
    },
  ],
  agent_oversight: [
    {
      stepKey: 'onboarding_completed',
      lane: 'agent_oversight',
      label: 'Confirm buyer onboarding completed',
      actionType: 'confirmation',
      ownerRole: 'agent',
      clientVisible: false,
      completionEventType: 'agent_onboarding_confirmed',
    },
    {
      stepKey: 'otp_signed',
      lane: 'agent_oversight',
      label: 'Confirm OTP signed',
      actionType: 'signature_confirmation',
      ownerRole: 'agent',
      clientVisible: false,
      completionEventType: 'agent_otp_confirmed',
    },
    {
      stepKey: 'role_players_assigned',
      lane: 'agent_oversight',
      label: 'Confirm role players assigned',
      actionType: 'confirmation',
      ownerRole: 'agent',
      clientVisible: false,
      completionEventType: 'agent_role_players_assigned',
    },
    {
      stepKey: 'monitor_transaction_blockers',
      lane: 'agent_oversight',
      label: 'Monitor transaction blockers',
      actionType: 'internal_progress',
      ownerRole: 'agent',
      clientVisible: false,
      completionEventType: 'agent_blocker_monitoring',
    },
  ],
}

const OPERATIONAL_PROCESS_LABELS = Object.freeze({
  finance: 'Finance and bond origination',
  transfer: 'Property transfer',
  bond: 'Bond registration',
  agent_oversight: 'Transaction coordination',
})

for (const [laneKey, definitions] of Object.entries(OPERATIONAL_STEP_DEFINITIONS)) {
  for (const definition of definitions) {
    const processLabel = OPERATIONAL_PROCESS_LABELS[laneKey] || laneKey
    definition.sharedProgress = createTransactionProgressDefinition({
      processKey: laneKey,
      processLabel,
      stepKey: definition.stepKey,
      ownerRole: definition.ownerRole,
      defaultVisibility: definition.clientVisible
        ? TRANSACTION_PROGRESS_VISIBILITY.client
        : TRANSACTION_PROGRESS_VISIBILITY.professional,
      clientVisibleAllowed: definition.clientVisible,
      professionalTitle: definition.label,
      professionalDescription: definition.professionalProgressText || `${definition.label}.`,
      clientTitle: `${processLabel} update`,
      clientDescription: definition.clientUpdateText || '',
    })
  }
}

export function getOperationalStepDefinition(laneKey, stepKey) {
  const lane = String(laneKey || '')
    .trim()
    .toLowerCase()
  const key = String(stepKey || '')
    .trim()
    .toLowerCase()
  return (OPERATIONAL_STEP_DEFINITIONS[lane] || []).find((item) => String(item.stepKey || '').trim().toLowerCase() === key) || null
}

export function getOperationalStepsForLane(
  laneKey,
  {
    financeType = 'cash',
    propertyType = '',
  } = {},
) {
  const lane = String(laneKey || '')
    .trim()
    .toLowerCase()
  const normalizedFinanceType = normalizeFinanceType(financeType || 'cash')
  const steps = OPERATIONAL_STEP_DEFINITIONS[lane] || []

  return steps.filter((item) => {
    if (Array.isArray(item.financeTypes) && item.financeTypes.length && !item.financeTypes.includes(normalizedFinanceType)) {
      return false
    }
    if (item.onlySectionalTitle && !isSectionalTitleProperty(propertyType)) {
      return false
    }
    return true
  })
}

export function isClientVisibleOperationalStep(step = null) {
  return Boolean(step?.clientVisible)
}

export function getOperationalSharedProgressDefinition(laneKey, stepKey) {
  return getOperationalStepDefinition(laneKey, stepKey)?.sharedProgress || null
}
