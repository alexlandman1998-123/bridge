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
export const SUBPROCESS_TYPES = ['finance', 'attorney']
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
  attorney: [
    { key: 'instruction_received', label: 'File Opened', sortOrder: 1 },
    { key: 'fica_received', label: 'FICA / Compliance Received', sortOrder: 2 },
    { key: 'transfer_documents_prepared', label: 'Transfer Documents Prepared', sortOrder: 3 },
    { key: 'buyer_signed_documents', label: 'Buyer Signed Transfer Documents', sortOrder: 4 },
    { key: 'seller_signed_documents', label: 'Seller Signed Transfer Documents', sortOrder: 5 },
    { key: 'guarantees_received', label: 'Guarantees / Financial Requirements Received', sortOrder: 6 },
    { key: 'lodgement_submitted', label: 'Lodgement Submitted', sortOrder: 7 },
    { key: 'registration_confirmed', label: 'Registration Confirmed', sortOrder: 8 },
  ],
}

export const SUBPROCESS_DEFAULT_OWNERS = {
  finance: 'bond_originator',
  attorney: 'attorney',
}

export function getTransactionRoleLabel(role) {
  const normalizedRole = String(role || '').trim().toLowerCase()
  return TRANSACTION_ROLE_LABELS[normalizedRole] || EXTERNAL_ROLE_LABELS[normalizedRole] || normalizedRole
}
