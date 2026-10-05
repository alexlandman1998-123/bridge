const ROLES = {
  transfer_attorney: 'Transfer attorney', bond_originator: 'Bond originator',
  bond_attorney: 'Bond attorney', cancellation_attorney: 'Cancellation attorney',
}
const STATES = {
  unassigned: 'Destination needed', nominated: 'Organisation nominated', invited: 'Partner invited', conflicting: 'Conflicting destinations',
  awaiting_finance_owner: 'Awaiting finance ownership', not_required: 'Not required', awaiting_buyer_onboarding: 'Awaiting buyer onboarding', awaiting_signed_otp: 'Awaiting signed OTP', ready: 'Ready for instruction',
  not_invited: 'Not invited', pending: 'Invitation pending', accepted: 'Accepted', declined: 'Declined', expired: 'Invitation expired',
  not_recorded: 'Delivery not confirmed', sent: 'Sent', failed: 'Delivery failed', awaiting_receipt: 'Awaiting organisation receipt',
}
const EXCEPTIONS = {
  destination_missing: 'Select an organisation or invite the external partner.',
  organisation_unresolved: 'Link the selected partner to an organisation.',
  conflicting_destinations: 'Resolve the competing partner destinations.',
  invitation_expired: 'Resend the expired partner invitation.',
  invitation_declined: 'Nominate a replacement partner.',
  accepted_invitation_not_bound: 'Connect the accepted invitation to the partner organisation.',
  organisation_declined: 'Nominate a replacement organisation.',
  finance_owner_unresolved: 'Confirm whether the buyer or a bond originator manages the finance.',
}

const DISPATCH = { waiting: 'Waiting for readiness', pending: 'Queued for background delivery', failed: 'Delivery needs attention', blocked: 'Handoff blocked', sent: 'Dispatched' }
const DISPATCH_REASONS = {
  retirement_review_required: 'Review the existing bond work before releasing the replacement handoff.',
  organisation_contact_missing: 'Add an organisation email address or an active organisation administrator.',
  attorney_firm_not_linked: 'Link the selected organisation to its attorney firm.',
  domain_destination_conflict: 'Resolve the competing organisation in the existing partner matter.',
  historical_delivery_review_required: 'Review earlier delivery before releasing this existing instruction.',
  retries_exhausted: 'Automatic retries stopped. Review the failed handoff.',
  delivery_confirmation_uncertain: 'Confirm the earlier email result before sending again.',
  delivery_failed: 'Delivery failed. Background retries are scheduled.',
  awaiting_partner_signup: 'The partner must complete signup and link its organisation.',
  awaiting_bond_attorney_instruction: 'Awaiting the bond attorney instruction trigger.',
  controlled_test_recipient: 'External delivery is suppressed for this test matter.',
}
function retryTime(value) {
  const date = new Date(value)
  return value && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' }).format(date) : null
}

export function buildTransactionHandoffRegisterItems(rows = []) {
  return rows.filter((row) => row.required).map((row) => ({
    id: row.id, role: ROLES[row.role_type] || row.role_type,
    destination: row.destination_company_name || row.invited_company_name || (row.destination_organisation_id ? 'Linked organisation' : 'Organisation not linked'),
    nomination: STATES[row.nomination_status] || 'Nomination unknown',
    readiness: STATES[row.instruction_status] || 'Readiness unknown',
    invitation: STATES[row.invitation_status] || 'Invitation unknown',
    delivery: row.delivery_status === 'pending' ? 'Delivery pending' : STATES[row.delivery_status] || 'Delivery unknown',
    acceptance: STATES[row.acceptance_status] || 'Receipt unknown',
    cleanup: ({ retired: 'Previous partner access retired', review_required: 'Previous finance work needs review' })[row.assignment_cleanup_status] || null,
    lastRecovery: row.last_recovery,
    generation: row.dispatch_generation,
    recoveryActions: row.recovery_actions || [],
    dispatch: DISPATCH[row.dispatch_status] || null,
    workspace: row.workspace_prepared_at ? 'Prepared for the organisation' : 'Awaiting preparation',
    nextAttempt: retryTime(row.next_delivery_attempt_at),
    actions: [...new Set([...(row.exception_keys || []).map((key) => EXCEPTIONS[key] || 'Review the partner handoff.'),
      DISPATCH_REASONS[row.dispatch_reason]].filter(Boolean))],
  }))
}
