export const EXTERNAL_ACCESS_ROLES = ['attorney', 'bond_originator']

export const TRANSACTION_ROLE_TYPES = ['developer', 'agent', 'attorney', 'bond_originator', 'client', 'buyer', 'seller', 'internal_admin']

export const TRANSACTION_ROLE_LABELS = {
  developer: 'Developer / Internal Admin',
  internal_admin: 'Developer / Internal Admin',
  agent: 'Estate Agent',
  attorney: 'Attorney / Conveyancer',
  bond_originator: 'Bond Originator',
  client: 'Client / Buyer',
  buyer: 'Buyer',
  seller: 'Seller',
}

export const EXTERNAL_ROLE_LABELS = {
  attorney: TRANSACTION_ROLE_LABELS.attorney,
  tuckers: TRANSACTION_ROLE_LABELS.attorney,
  bond_originator: TRANSACTION_ROLE_LABELS.bond_originator,
}

export const FINANCE_MANAGED_BY_OPTIONS = ['bond_originator', 'client', 'internal']

export const SUBPROCESS_STEP_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked']
export const SUBPROCESS_TYPES = ['finance', 'transfer', 'bond', 'cancellation', 'attorney']
export const SUBPROCESS_OWNER_TYPES = ['bond_originator', 'attorney', 'internal']

export const SUBPROCESS_STEP_TEMPLATES = {
  finance: [
    { key: 'application_received', label: 'Application Received', sortOrder: 1 },
    { key: 'buyer_documents_collected', label: 'Buyer Documents Collected', sortOrder: 2 },
    { key: 'submitted_to_banks', label: 'Submitted to Banks', sortOrder: 3 },
    { key: 'bank_feedback_received', label: 'Bank Feedback Received', sortOrder: 4 },
    { key: 'bond_approved', label: 'Bond Approved', sortOrder: 5 },
    { key: 'grant_signed', label: 'Grant Signed', sortOrder: 6 },
    { key: 'bond_instruction_sent_to_attorneys', label: 'Bond Instruction Sent to Attorneys', sortOrder: 7 },
  ],
  transfer: [
    { key: 'instruction_received', label: 'Instruction Received', sortOrder: 1 },
    { key: 'fica_review', label: 'FICA Reviewed', sortOrder: 2 },
    { key: 'transfer_documents_prepared', label: 'Transfer Documents Prepared', sortOrder: 3 },
    { key: 'buyer_signed_transfer_documents', label: 'Buyer Signed Transfer Documents', sortOrder: 4 },
    { key: 'seller_signed_transfer_documents', label: 'Seller Signed Transfer Documents', sortOrder: 5 },
    { key: 'rates_clearance_requested', label: 'Rates Clearance Requested', sortOrder: 6 },
    { key: 'rates_clearance_uploaded', label: 'Rates Clearance Certificate Uploaded', sortOrder: 7 },
    { key: 'levy_clearance_requested', label: 'Levy Clearance Requested', sortOrder: 8 },
    { key: 'levy_clearance_uploaded', label: 'Levy Clearance Certificate Uploaded', sortOrder: 9 },
    { key: 'guarantees_received', label: 'Guarantees Received', sortOrder: 10 },
    { key: 'lodgement_pack_prepared', label: 'Lodgement Pack Prepared', sortOrder: 11 },
    { key: 'lodgement_submitted', label: 'Lodgement Submitted', sortOrder: 12 },
    { key: 'registration_confirmed', label: 'Registration Confirmed', sortOrder: 13 },
  ],
  bond: [
    { key: 'bond_instruction_received', label: 'Bond Instruction Received', sortOrder: 1 },
    { key: 'bank_conditions_reviewed', label: 'Bank Conditions Reviewed', sortOrder: 2 },
    { key: 'bond_documents_prepared', label: 'Bond Documents Prepared', sortOrder: 3 },
    { key: 'buyer_signed_bond_documents', label: 'Buyer Signed Bond Documents', sortOrder: 4 },
    { key: 'grant_signed', label: 'Grant Signed', sortOrder: 5 },
    { key: 'bond_lodgement_pack_prepared', label: 'Bond Lodgement Pack Prepared', sortOrder: 6 },
    { key: 'bond_lodgement_submitted', label: 'Bond Lodgement Submitted', sortOrder: 7 },
    { key: 'bond_registration_confirmed', label: 'Bond Registration Confirmed', sortOrder: 8 },
  ],
  cancellation: [
    { key: 'cancellation_instruction_received', label: 'Cancellation Instruction Received', sortOrder: 1 },
    { key: 'cancellation_figures_requested', label: 'Cancellation Figures Requested', sortOrder: 2 },
    { key: 'cancellation_figures_received', label: 'Cancellation Figures Received', sortOrder: 3 },
    { key: 'guarantees_accepted', label: 'Guarantees Accepted', sortOrder: 4 },
    { key: 'cancellation_documents_prepared', label: 'Cancellation Documents Prepared', sortOrder: 5 },
    { key: 'cancellation_lodged', label: 'Cancellation Lodged', sortOrder: 6 },
    { key: 'cancellation_registered', label: 'Cancellation Registered', sortOrder: 7 },
  ],
}

export const SUBPROCESS_DEFAULT_OWNERS = {
  finance: 'bond_originator',
  transfer: 'attorney',
  bond: 'attorney',
  cancellation: 'attorney',
  attorney: 'attorney',
}

export function getTransactionRoleLabel(role) {
  const normalizedRole = String(role || '').trim().toLowerCase()
  return TRANSACTION_ROLE_LABELS[normalizedRole] || EXTERNAL_ROLE_LABELS[normalizedRole] || normalizedRole
}
