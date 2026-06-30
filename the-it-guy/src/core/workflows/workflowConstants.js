export const WORKFLOW_MAIN_STAGES = ['AVAIL', 'DEP', 'OTP', 'FIN', 'ATTY', 'XFER', 'REG']

export const WORKFLOW_MAIN_STAGE_LABELS = {
  AVAIL: 'Available',
  DEP: 'Deposit',
  OTP: 'Offer to Purchase',
  FIN: 'Finance',
  ATTY: 'Attorneys',
  XFER: 'Transfer',
  REG: 'Registration',
}

export const WORKFLOW_DETAILED_STAGES = [
  'Available',
  'Reserved',
  'OTP Signed',
  'Deposit Paid',
  'Finance Pending',
  'Bond Approved / Proof of Funds',
  'Proceed to Attorneys',
  'Transfer in Progress',
  'Transfer Lodged',
  'Registered',
]

export const WORKFLOW_SUBPROCESS_TYPES = [
  'finance',
  'transfer',
  'bond',
  'attorney',
  'bond_attorney',
  'transfer_attorney',
  'buyer',
  'seller',
  'handover',
]

export const WORKFLOW_SUBPROCESS_STEP_STATUSES = ['not_started', 'in_progress', 'completed', 'blocked']
export const WORKFLOW_CHECKLIST_STATUSES = ['pending', 'in_progress', 'completed', 'blocked', 'waived']
export const WORKFLOW_DOCUMENT_REQUEST_STATUSES = ['requested', 'uploaded', 'under_review', 'reviewed', 'rejected', 'completed', 'cancelled']
export const WORKFLOW_VISIBILITY_SCOPES = ['internal', 'shared_role_players', 'client_visible']

const DETAILED_STAGE_BY_SLUG = {
  available: 'Available',
  avail: 'Available',
  reserved: 'Reserved',
  otp_signed: 'OTP Signed',
  otp: 'OTP Signed',
  deposit_paid: 'Deposit Paid',
  dep: 'Deposit Paid',
  finance_pending: 'Finance Pending',
  fin: 'Finance Pending',
  bond_approved_proof_of_funds: 'Bond Approved / Proof of Funds',
  bond_approved: 'Bond Approved / Proof of Funds',
  proof_of_funds: 'Bond Approved / Proof of Funds',
  proceed_to_attorneys: 'Proceed to Attorneys',
  atty: 'Proceed to Attorneys',
  transfer_in_progress: 'Transfer in Progress',
  xfer: 'Transfer in Progress',
  transfer_lodged: 'Transfer Lodged',
  registered: 'Registered',
  reg: 'Registered',
}

const MAIN_STAGE_BY_SLUG = {
  avail: 'AVAIL',
  available: 'AVAIL',
  dep: 'DEP',
  deposit: 'DEP',
  otp: 'OTP',
  fin: 'FIN',
  finance: 'FIN',
  atty: 'ATTY',
  attorney: 'ATTY',
  attorneys: 'ATTY',
  xfer: 'XFER',
  transfer: 'XFER',
  reg: 'REG',
  registered: 'REG',
}

const SUBPROCESS_TYPE_BY_SLUG = {
  finance: 'finance',
  transfer: 'transfer',
  bond: 'bond',
  attorney: 'attorney',
  legal: 'attorney',
  bond_attorney: 'bond_attorney',
  transfer_attorney: 'transfer_attorney',
  buyer: 'buyer',
  seller: 'seller',
  handover: 'handover',
}

const VISIBILITY_BY_SLUG = {
  internal: 'internal',
  internal_only: 'internal',
  shared: 'shared_role_players',
  shared_role_players: 'shared_role_players',
  client: 'client_visible',
  client_visible: 'client_visible',
}

const SUBPROCESS_TYPE_LABELS = {
  finance: 'Finance',
  transfer: 'Transfer',
  bond: 'Bond Registration',
  attorney: 'Attorney Coordination',
  bond_attorney: 'Bond Attorney',
  transfer_attorney: 'Transfer Attorney',
  buyer: 'Buyer',
  seller: 'Seller',
  handover: 'Handover',
}

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, '_')
}

export function normalizeMainStage(value, fallback = 'AVAIL') {
  const normalized = MAIN_STAGE_BY_SLUG[normalizeKey(value)] || String(value || '').trim().toUpperCase()
  return WORKFLOW_MAIN_STAGES.includes(normalized) ? normalized : fallback
}

export function normalizeDetailedStage(value, fallback = 'Available') {
  const normalized = DETAILED_STAGE_BY_SLUG[normalizeKey(value)] || String(value || '').trim()
  return WORKFLOW_DETAILED_STAGES.includes(normalized) ? normalized : fallback
}

export function normalizeSubprocessType(value, fallback = 'attorney') {
  const normalized = SUBPROCESS_TYPE_BY_SLUG[normalizeKey(value)] || normalizeKey(value)
  return WORKFLOW_SUBPROCESS_TYPES.includes(normalized) ? normalized : fallback
}

export function normalizeSubprocessStepStatus(value, fallback = 'not_started') {
  const normalized = normalizeKey(value)
  return WORKFLOW_SUBPROCESS_STEP_STATUSES.includes(normalized) ? normalized : fallback
}

export function normalizeChecklistStatus(value, fallback = 'pending') {
  const normalized = normalizeKey(value)
  return WORKFLOW_CHECKLIST_STATUSES.includes(normalized) ? normalized : fallback
}

export function normalizeDocumentRequestStatus(value, fallback = 'requested') {
  const normalized = normalizeKey(value)
  if (normalized === 'required') return 'requested'
  if (normalized === 'approved') return 'completed'
  if (normalized === 'reviewed') return 'reviewed'
  return WORKFLOW_DOCUMENT_REQUEST_STATUSES.includes(normalized) ? normalized : fallback
}

export function normalizeVisibilityScope(value, fallback = 'internal') {
  const normalized = VISIBILITY_BY_SLUG[normalizeKey(value)] || normalizeKey(value)
  return WORKFLOW_VISIBILITY_SCOPES.includes(normalized) ? normalized : fallback
}

export function getMainStageLabel(value) {
  const normalized = normalizeMainStage(value)
  return WORKFLOW_MAIN_STAGE_LABELS[normalized] || 'Unknown'
}

export function getSubprocessTypeLabel(value) {
  const normalized = normalizeSubprocessType(value)
  return SUBPROCESS_TYPE_LABELS[normalized] || 'Workflow Lane'
}

export function getWorkflowStatusLabel(value) {
  const normalized = normalizeKey(value)
  if (normalized === 'not_started') return 'Not Started'
  if (normalized === 'waiting') return 'Waiting'
  if (normalized === 'in_progress') return 'In Progress'
  if (normalized === 'complete') return 'Completed'
  if (normalized === 'completed') return 'Completed'
  if (normalized === 'blocked') return 'Blocked'
  if (normalized === 'pending') return 'Waiting'
  if (normalized === 'skipped') return 'Skipped'
  if (normalized === 'waived') return 'Waived'
  if (normalized === 'not_applicable') return 'Waived'
  if (normalized === 'out_of_sequence') return 'Out of Sequence'
  if (normalized === 'requested') return 'Requested'
  if (normalized === 'uploaded') return 'Uploaded'
  if (normalized === 'under_review') return 'Under Review'
  if (normalized === 'reviewed') return 'Reviewed'
  if (normalized === 'rejected') return 'Rejected'
  if (normalized === 'cancelled') return 'Cancelled'
  return 'Unknown'
}

export function normalizeWorkflowDisplayStatus(value, { waived = false, outOfSequence = false } = {}) {
  if (outOfSequence) return 'out_of_sequence'
  const normalized = normalizeKey(value)
  if (normalized === 'pending') return 'waiting'
  if (normalized === 'active') return 'in_progress'
  if (normalized === 'complete') return 'completed'
  if (normalized === 'not_applicable') return waived ? 'waived' : 'not_applicable'
  if (['waiting', 'in_progress', 'completed', 'skipped', 'waived', 'blocked', 'not_started'].includes(normalized)) {
    return normalized
  }
  return 'not_started'
}

export function getVisibilityLabel(value) {
  const normalized = normalizeVisibilityScope(value)
  if (normalized === 'internal') return 'Internal'
  if (normalized === 'shared_role_players') return 'Shared Role Players'
  if (normalized === 'client_visible') return 'Client Visible'
  return 'Unknown'
}
