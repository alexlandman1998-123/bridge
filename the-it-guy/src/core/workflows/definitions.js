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
    label: 'Transfer Workflow',
    editableByRoles: ['transaction_owner', 'attorney', 'admin', 'developer_owner'],
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
    label: 'File Opened',
    description: 'The attorney has opened the transfer matter and confirmed handoff.',
    actionLabel: 'Open File',
  },
  {
    key: 'fica_received',
    label: 'FICA / Compliance Received',
    description: 'Required compliance and FICA records have been captured for transfer.',
    actionLabel: 'Mark FICA Received',
  },
  {
    key: 'transfer_documents_prepared',
    label: 'Transfer Documents Prepared',
    description: 'The legal transfer document pack has been prepared for signature.',
    actionLabel: 'Prepare Transfer Documents',
  },
  {
    key: 'buyer_signed_documents',
    label: 'Buyer Signed Transfer Documents',
    description: 'Buyer signatures for the transfer pack have been received.',
    actionLabel: 'Mark Buyer Signed',
  },
  {
    key: 'seller_signed_documents',
    label: 'Seller Signed Transfer Documents',
    description: 'Seller signatures for the transfer pack have been received.',
    actionLabel: 'Mark Seller Signed',
  },
  {
    key: 'guarantees_received',
    label: 'Guarantees / Financial Requirements Received',
    description: 'Guarantees and related financial conditions are confirmed.',
    actionLabel: 'Confirm Guarantees Received',
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
