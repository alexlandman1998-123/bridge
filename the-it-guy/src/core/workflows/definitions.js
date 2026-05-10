import { normalizeFinanceType } from '../transactions/financeType'

export const WORKFLOW_LANE_DEFINITIONS = {
  sales: {
    key: 'sales',
    label: 'Sales Workflow',
    editableByRoles: ['transaction_owner', 'agent', 'admin', 'developer_owner'],
  },
  finance: {
    key: 'finance',
    label: 'Finance Workflow',
    editableByRoles: ['transaction_owner', 'finance_owner', 'admin', 'developer_owner'],
  },
  transfer: {
    key: 'transfer',
    label: 'Transfer',
    editableByRoles: ['transaction_owner', 'attorney', 'admin', 'developer_owner'],
  },
  bond: {
    key: 'bond',
    label: 'Bond Registration',
    editableByRoles: ['transaction_owner', 'attorney', 'finance_owner', 'admin', 'developer_owner'],
  },
}

export const SALES_STAGE_DEFINITIONS = [
  {
    key: 'new_transaction_onboarding',
    label: 'New Transaction + Onboarding',
    description: 'Transaction is opened and onboarding link lifecycle is tracked.',
    completionRequirements: ['Onboarding completed'],
  },
  {
    key: 'otp_prep_signing',
    label: 'OTP Prep + Signing',
    description: 'Generate, approve, release, and capture the signed OTP version.',
    completionRequirements: ['Generated OTP', 'Approved OTP', 'Signed OTP uploaded'],
  },
  {
    key: 'supporting_documentation',
    label: 'Supporting Documentation',
    description: 'Required supporting documents for the development are completed.',
    completionRequirements: ['All required supporting documents complete'],
  },
  {
    key: 'ready_for_finance',
    label: 'Ready for Finance',
    description: 'Sales prerequisites are complete and finance can proceed.',
    completionRequirements: ['Onboarding', 'Signed OTP', 'Supporting docs'],
  },
]

export const FINANCE_STAGE_DEFINITIONS = {
  bond: [
    {
      key: 'application_not_started',
      label: 'Application Not Started',
      description: 'Finance intake has not started yet.',
      actionLabel: 'Start Application',
    },
    {
      key: 'application_in_progress',
      label: 'Application In Progress',
      description: 'The bond originator is preparing and checking your application.',
      actionLabel: 'Submit to Banks',
    },
    {
      key: 'submitted_to_banks',
      label: 'Submitted to Banks',
      description: 'The application has been submitted to selected banks.',
      actionLabel: 'Record Bank Feedback',
    },
    {
      key: 'bank_feedback_received',
      label: 'Bank Feedback Received',
      description: 'Feedback and conditions from banks have been captured.',
      actionLabel: 'Mark Bond Approved',
    },
    {
      key: 'bond_approved',
      label: 'Bond Approved',
      description: 'Bond approval has been confirmed.',
      actionLabel: 'Confirm Guarantees / Grant',
    },
    {
      key: 'guarantees_grant_issued',
      label: 'Guarantees / Grant Issued',
      description: 'Guarantees and grant documentation are in place.',
      actionLabel: 'Mark Ready for Transfer',
    },
    {
      key: 'ready_for_transfer',
      label: 'Ready for Transfer',
      description: 'Finance is complete and the file can move to transfer.',
      actionLabel: null,
    },
  ],
  cash: [
    {
      key: 'proof_of_funds_requested',
      label: 'Proof of Funds Requested',
      description: 'Proof of funds has been requested from the buyer.',
      actionLabel: 'Record Proof of Funds',
    },
    {
      key: 'proof_of_funds_received',
      label: 'Proof of Funds Received',
      description: 'Proof of funds has been uploaded and captured.',
      actionLabel: 'Confirm Funds Secured',
    },
    {
      key: 'funds_secured_confirmed',
      label: 'Funds Secured / Confirmed',
      description: 'Cash funding position is confirmed and ready to proceed.',
      actionLabel: 'Mark Ready for Transfer',
    },
    {
      key: 'ready_for_transfer',
      label: 'Ready for Transfer',
      description: 'Finance is complete and the file can move to transfer.',
      actionLabel: null,
    },
  ],
  combination: [
    {
      key: 'application_not_started',
      label: 'Application Not Started',
      description: 'Combined bond and cash funding workflow is not started yet.',
      actionLabel: 'Start Application',
    },
    {
      key: 'application_in_progress',
      label: 'Application In Progress',
      description: 'The bond and cash funding pack is being prepared.',
      actionLabel: 'Submit to Banks',
    },
    {
      key: 'submitted_to_banks',
      label: 'Submitted to Banks',
      description: 'The bond portion has been submitted to selected banks.',
      actionLabel: 'Record Bank Feedback',
    },
    {
      key: 'bank_feedback_received',
      label: 'Bank Feedback Received',
      description: 'Bank responses and conditions are now recorded.',
      actionLabel: 'Mark Bond Approved',
    },
    {
      key: 'bond_approved',
      label: 'Bond Approved',
      description: 'Bond approval is confirmed for the finance portion.',
      actionLabel: 'Request Proof of Funds',
    },
    {
      key: 'proof_of_funds_requested',
      label: 'Proof of Funds Requested',
      description: 'Cash contribution proof has been requested from the buyer.',
      actionLabel: 'Record Proof of Funds',
    },
    {
      key: 'proof_of_funds_received',
      label: 'Proof of Funds Received',
      description: 'Cash contribution proof has been received.',
      actionLabel: 'Confirm Funds Secured',
    },
    {
      key: 'funds_secured_confirmed',
      label: 'Funds Secured / Confirmed',
      description: 'Cash and bond portions are aligned and confirmed.',
      actionLabel: 'Confirm Guarantees / Grant',
    },
    {
      key: 'guarantees_grant_issued',
      label: 'Guarantees / Grant Issued',
      description: 'Guarantee and grant documents have been issued.',
      actionLabel: 'Mark Ready for Transfer',
    },
    {
      key: 'ready_for_transfer',
      label: 'Ready for Transfer',
      description: 'Finance is complete and the file can move to transfer.',
      actionLabel: null,
    },
  ],
}

export const TRANSFER_STAGE_DEFINITIONS = [
  {
    key: 'instruction_received',
    label: 'Instruction Received',
    description: 'The transfer instruction has been received and opened.',
    actionLabel: 'Confirm Instruction Received',
  },
  {
    key: 'fica_review',
    label: 'FICA Reviewed',
    description: 'Client FICA documentation has been reviewed for transfer readiness.',
    actionLabel: 'Mark FICA Reviewed',
  },
  {
    key: 'transfer_documents_prepared',
    label: 'Transfer Documents Prepared',
    description: 'The legal transfer document pack has been prepared for signature.',
    actionLabel: 'Prepare Transfer Documents',
  },
  {
    key: 'buyer_signed_transfer_documents',
    label: 'Buyer Signed Transfer Documents',
    description: 'Buyer signatures for the transfer pack have been received.',
    actionLabel: 'Mark Buyer Signed',
  },
  {
    key: 'seller_signed_transfer_documents',
    label: 'Seller Signed Transfer Documents',
    description: 'Seller signatures for the transfer pack have been received.',
    actionLabel: 'Mark Seller Signed',
  },
  {
    key: 'rates_clearance_requested',
    label: 'Rates Clearance Requested',
    description: 'Rates clearance has been requested from the municipality.',
    actionLabel: 'Mark Rates Clearance Requested',
  },
  {
    key: 'rates_clearance_uploaded',
    label: 'Rates Clearance Certificate Uploaded',
    description: 'The rates clearance certificate has been received and uploaded.',
    actionLabel: 'Mark Rates Clearance Uploaded',
  },
  {
    key: 'levy_clearance_requested',
    label: 'Levy Clearance Requested',
    description: 'Levy clearance has been requested where sectional-title rules apply.',
    actionLabel: 'Mark Levy Clearance Requested',
  },
  {
    key: 'levy_clearance_uploaded',
    label: 'Levy Clearance Certificate Uploaded',
    description: 'The levy clearance certificate has been received and uploaded.',
    actionLabel: 'Mark Levy Clearance Uploaded',
  },
  {
    key: 'guarantees_received',
    label: 'Guarantees Received',
    description: 'Guarantees and related financial conditions are confirmed for transfer.',
    actionLabel: 'Confirm Guarantees Received',
  },
  {
    key: 'lodgement_pack_prepared',
    label: 'Lodgement Pack Prepared',
    description: 'Transfer lodgement pack has been prepared and checked.',
    actionLabel: 'Mark Lodgement Pack Prepared',
  },
  {
    key: 'lodgement_submitted',
    label: 'Lodgement Submitted',
    description: 'The transfer file has been lodged.',
    actionLabel: 'Submit Lodgement',
  },
  {
    key: 'registration_confirmed',
    label: 'Registration Confirmed',
    description: 'Registration is complete and transfer has been confirmed.',
    actionLabel: 'Confirm Registration',
  },
]

export const BOND_STAGE_DEFINITIONS = [
  {
    key: 'bond_instruction_received',
    label: 'Bond Instruction Received',
    description: 'Bond instruction has been received and logged.',
    actionLabel: 'Confirm Bond Instruction',
  },
  {
    key: 'bank_conditions_reviewed',
    label: 'Bank Conditions Reviewed',
    description: 'Bank conditions and requirements have been reviewed.',
    actionLabel: 'Mark Conditions Reviewed',
  },
  {
    key: 'bond_documents_prepared',
    label: 'Bond Documents Prepared',
    description: 'Bond documentation has been prepared for signing.',
    actionLabel: 'Prepare Bond Documents',
  },
  {
    key: 'buyer_signed_bond_documents',
    label: 'Buyer Signed Bond Documents',
    description: 'Buyer signatures on bond documents have been captured.',
    actionLabel: 'Mark Buyer Signed',
  },
  {
    key: 'grant_signed',
    label: 'Grant Signed',
    description: 'Grant has been signed and recorded.',
    actionLabel: 'Mark Grant Signed',
  },
  {
    key: 'bond_lodgement_pack_prepared',
    label: 'Bond Lodgement Pack Prepared',
    description: 'Bond lodgement pack has been prepared for submission.',
    actionLabel: 'Prepare Bond Lodgement Pack',
  },
  {
    key: 'bond_lodgement_submitted',
    label: 'Bond Lodgement Submitted',
    description: 'Bond documents have been lodged.',
    actionLabel: 'Submit Bond Lodgement',
  },
  {
    key: 'bond_registration_confirmed',
    label: 'Bond Registration Confirmed',
    description: 'Bond registration has been confirmed.',
    actionLabel: 'Confirm Bond Registration',
  },
]

export const TRANSFER_WORKFLOW_DEFINITION = TRANSFER_STAGE_DEFINITIONS
export const BOND_WORKFLOW_DEFINITION = BOND_STAGE_DEFINITIONS

export function getFinanceStageDefinitions(financeType) {
  const normalizedType = normalizeFinanceType(financeType || 'cash')
  if (normalizedType === 'bond') {
    return FINANCE_STAGE_DEFINITIONS.bond
  }
  if (normalizedType === 'combination') {
    return FINANCE_STAGE_DEFINITIONS.combination
  }
  return FINANCE_STAGE_DEFINITIONS.cash
}
