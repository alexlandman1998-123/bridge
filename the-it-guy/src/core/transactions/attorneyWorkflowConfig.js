export const ATTORNEY_WORKFLOW_STAGES = [
  {
    key: 'instruction_received',
    label: 'Instruction Received',
    description: 'Open the matter, capture the file, and confirm intake is complete.',
    groups: [
      {
        key: 'intake',
        label: 'Intake',
        stepKeys: ['instruction_received'],
      },
    ],
  },
  {
    key: 'fica_compliance_review',
    label: 'FICA / Compliance Review',
    description: 'Capture purchaser compliance information and clear the matter for prep.',
    groups: [
      {
        key: 'compliance',
        label: 'Compliance',
        stepKeys: ['fica_received', 'fica_compliance_review', 'fica_review'],
      },
    ],
  },
  {
    key: 'transfer_preparation',
    label: 'Transfer Preparation',
    description: 'Prepare the transfer pack, manage signatures, and clear financial readiness.',
    groups: [
      {
        key: 'documents',
        label: 'Documents',
        stepKeys: ['transfer_documents_prepared', 'transfer_preparation'],
      },
      {
        key: 'signatures',
        label: 'Signing',
        stepKeys: ['buyer_signed_documents', 'seller_signed_documents'],
      },
      {
        key: 'financial',
        label: 'Financial & Guarantees',
        stepKeys: ['guarantees_received'],
      },
    ],
  },
  {
    key: 'lodgement',
    label: 'Lodgement',
    description: 'Check the pack and confirm the matter has been lodged correctly.',
    groups: [
      {
        key: 'lodgement',
        label: 'Lodgement',
        stepKeys: ['lodgement_submitted', 'lodgement'],
      },
    ],
  },
  {
    key: 'registration',
    label: 'Registration',
    description: 'Confirm registration, prepare final accounts, and move the file to close-out.',
    groups: [
      {
        key: 'registration',
        label: 'Registration',
        stepKeys: ['registration_confirmed', 'registration'],
      },
    ],
  },
]

export function getAttorneyWorkflowStageConfig() {
  return ATTORNEY_WORKFLOW_STAGES
}
