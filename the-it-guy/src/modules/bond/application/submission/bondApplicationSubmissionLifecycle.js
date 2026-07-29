export const BOND_APPLICATION_SUBMISSION_FLOW_VERSION = 'phase-5-v1'

export const BOND_APPLICATION_SUBMISSION_STATUSES = {
  draft: 'draft',
  preparing: 'preparing',
  awaitingSignature: 'awaiting_signature',
  signed: 'signed',
  submitted: 'submitted',
  failed: 'failed',
  cancelled: 'cancelled',
  superseded: 'superseded',
}

export const BOND_APPLICATION_SUBMISSION_TERMINAL_STATUSES = new Set([
  BOND_APPLICATION_SUBMISSION_STATUSES.submitted,
  BOND_APPLICATION_SUBMISSION_STATUSES.cancelled,
  BOND_APPLICATION_SUBMISSION_STATUSES.superseded,
])

export function isBondApplicationSubmissionLocked(status = '') {
  return [
    BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature,
    BOND_APPLICATION_SUBMISSION_STATUSES.signed,
    BOND_APPLICATION_SUBMISSION_STATUSES.submitted,
  ].includes(String(status || '').trim().toLowerCase())
}

export function canCancelBondApplicationSubmission(status = '') {
  return [
    BOND_APPLICATION_SUBMISSION_STATUSES.preparing,
    BOND_APPLICATION_SUBMISSION_STATUSES.awaitingSignature,
    BOND_APPLICATION_SUBMISSION_STATUSES.failed,
  ].includes(String(status || '').trim().toLowerCase())
}
