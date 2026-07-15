import { isSupabaseConfigured, supabase } from '../lib/supabaseClient.js'
import {
  createTransactionPartnerInvitation,
  listTransactionPartnerInvitations,
} from './transactionPartnerInvitationService.js'
import {
  LEGAL_ROLE_COORDINATION_ACTORS,
  LEGAL_ROLE_COORDINATION_STATES,
  evaluateLegalRoleInviteAuthority,
  isBankAppointedLegalRole,
  normalizeLegalRoleType,
} from '../core/transactions/legalRoleCoordinationContract.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeEmail(value = '') {
  return normalizeText(value).toLowerCase()
}

function isMissingTableError(error) {
  return ['42P01', 'PGRST205'].includes(String(error?.code || '').toUpperCase())
}

function isMissingPhaseFunctionError(error, functionName = '') {
  const code = String(error?.code || '').toUpperCase()
  const message = String(error?.message || '').toLowerCase()
  return ['42883', 'PGRST202'].includes(code) || message.includes(String(functionName || '').toLowerCase())
}

function addDays(value, days) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return null
  return new Date(timestamp + days * 86400000)
}

export function deriveBankLegalRoleOperationalHealth(appointment = {}, now = new Date()) {
  const state = normalizeText(appointment.coordination_state || appointment.coordinationState).toLowerCase()
  const staffStatus = normalizeText(appointment.staff_assignment_status || appointment.staffAssignmentStatus).toLowerCase()
  const nowDate = now instanceof Date ? now : new Date(now)
  const nowTime = Number.isFinite(nowDate.getTime()) ? nowDate.getTime() : Date.now()

  let actionKey = ''
  let actionLabel = ''
  let dueAt = null

  if (state === 'invite_sent') {
    actionKey = 'firm_acceptance'
    actionLabel = 'Awaiting appointed firm acceptance'
    dueAt = addDays(appointment.updated_at || appointment.captured_at, 2)
  } else if (state === 'invite_accepted' && staffStatus !== 'staff_assigned') {
    actionKey = 'staff_assignment'
    actionLabel = 'Appointed firm must assign its matter team'
    dueAt = addDays(appointment.accepted_at || appointment.updated_at, 1)
  } else if (state === 'invite_accepted') {
    actionKey = 'bank_instruction'
    actionLabel = 'Awaiting formal bank instruction'
    dueAt = addDays(appointment.updated_at || appointment.accepted_at, 2)
  } else if (state === 'instruction_confirmed') {
    actionKey = 'instruction_decision'
    actionLabel = 'Appointed firm must accept or decline instruction'
    dueAt = addDays(appointment.instruction_confirmed_at || appointment.updated_at, 1)
  } else if (state === 'replacement_required') {
    actionKey = 'replacement_appointment'
    actionLabel = 'Bank replacement appointment required'
    dueAt = addDays(appointment.updated_at, 1)
  } else if (state === 'active') {
    return {
      actionKey: 'active',
      actionLabel: 'Legal role active',
      dueAt: null,
      isOverdue: false,
      daysOverdue: 0,
      severity: 'complete',
    }
  }

  const dueTime = dueAt?.getTime()
  const isOverdue = Number.isFinite(dueTime) && nowTime > dueTime
  const daysOverdue = isOverdue ? Math.max(0, Math.floor((nowTime - dueTime) / 86400000)) : 0
  return {
    actionKey: actionKey || 'pending',
    actionLabel: actionLabel || 'Legal role coordination pending',
    dueAt: dueAt?.toISOString() || null,
    isOverdue,
    daysOverdue,
    severity: isOverdue ? (daysOverdue >= 2 ? 'escalated' : 'overdue') : 'on_track',
  }
}

const LEGAL_ROLE_ASSURANCE_ISSUE_LABELS = Object.freeze({
  appointment_evidence_missing: 'Bank appointment evidence is missing',
  invitation_link_missing: 'The appointment is not linked to its platform invitation',
  invitation_state_mismatch: 'The appointment and invitation states do not agree',
  accepted_firm_binding_missing: 'The accepting organisation is not bound to an attorney firm',
  accepted_invitation_state_mismatch: 'Firm acceptance is not reflected on the invitation',
  assignment_outside_appointed_firm: 'Matter staff were assigned outside the bank-appointed firm',
  role_player_outside_appointed_organisation: 'The active roleplayer belongs to a different organisation',
  primary_attorney_assignment_mismatch: 'Exactly one primary attorney must be assigned',
  staff_status_not_synchronised: 'The matter team and appointment staffing status are out of sync',
  bank_instruction_evidence_missing: 'The active instruction is missing bank evidence',
  active_assignment_instruction_mismatch: 'The active primary assignment has not accepted the instruction',
  active_role_player_mismatch: 'The active legal role must have exactly one active roleplayer',
  replacement_role_still_live: 'The replaced firm or roleplayer still has live matter access',
})

export function deriveBankLegalRoleAssurance(appointment = {}, assurance = null, now = new Date()) {
  const operational = deriveBankLegalRoleOperationalHealth(appointment, now)
  const state = normalizeText(appointment.coordination_state || appointment.coordinationState).toLowerCase()
  let issue = normalizeText(assurance?.assurance_issue || assurance?.assuranceIssue).toLowerCase()

  if (!issue && !assurance) {
    if (appointment.evidence_confirmed !== true) issue = 'appointment_evidence_missing'
    else if (['invite_sent', 'invite_accepted', 'instruction_confirmed', 'active'].includes(state) && !appointment.invitation_id) {
      issue = 'invitation_link_missing'
    } else if (['invite_accepted', 'instruction_confirmed', 'active'].includes(state) && (!appointment.accepted_firm_id || !appointment.accepted_organisation_id)) {
      issue = 'accepted_firm_binding_missing'
    } else if (['instruction_confirmed', 'active'].includes(state) && (appointment.instruction_issuer !== 'bank' || !normalizeText(appointment.instruction_reference))) {
      issue = 'bank_instruction_evidence_missing'
    }
  }

  const databaseHealth = normalizeText(assurance?.assurance_health || assurance?.assuranceHealth).toLowerCase()
  const health = issue
    ? 'blocked'
    : databaseHealth || (operational.isOverdue ? 'attention' : 'unverified')

  return {
    health,
    issue: issue || null,
    issueLabel: issue ? (LEGAL_ROLE_ASSURANCE_ISSUE_LABELS[issue] || issue.replaceAll('_', ' ')) : '',
    reconciled: Boolean(assurance) && health === 'on_track',
    source: assurance ? 'database' : 'local_fallback',
    checkedAt: normalizeText(assurance?.assurance_updated_at || assurance?.assuranceUpdatedAt) || null,
  }
}

export function validateBankLegalRoleAppointmentDraft(input = {}) {
  const draft = {
    transactionId: normalizeText(input.transactionId || input.transaction_id),
    roleType: normalizeLegalRoleType(input.roleType || input.role_type),
    appointingBank: normalizeText(input.appointingBank || input.appointing_bank),
    appointmentReference: normalizeText(input.appointmentReference || input.appointment_reference),
    companyName: normalizeText(input.companyName || input.appointedFirmName || input.appointed_firm_name),
    contactName: normalizeText(input.contactName || input.appointedContactName || input.appointed_contact_name),
    email: normalizeEmail(input.email || input.appointedEmail || input.appointed_email),
    phone: normalizeText(input.phone || input.appointedPhone || input.appointed_phone),
    evidenceDocumentId: normalizeText(input.evidenceDocumentId || input.evidence_document_id),
    evidenceConfirmed: input.evidenceConfirmed === true || input.evidence_confirmed === true,
  }
  const errors = {}
  if (!draft.transactionId) errors.transactionId = 'Transaction is required.'
  if (!isBankAppointedLegalRole(draft.roleType)) errors.roleType = 'Choose a bank-appointed legal role.'
  if (!draft.appointingBank) errors.appointingBank = 'Appointing bank is required.'
  if (!draft.appointmentReference) errors.appointmentReference = 'Bank appointment reference is required.'
  if (!draft.companyName) errors.companyName = 'Appointed firm is required.'
  if (!draft.contactName) errors.contactName = 'Firm contact is required.'
  if (!draft.email || !/^\S+@\S+\.\S+$/.test(draft.email)) errors.email = 'A valid firm email is required.'
  if (!draft.evidenceConfirmed) errors.evidenceConfirmed = 'Confirm that the appointment came from the bank.'
  return { valid: Object.keys(errors).length === 0, errors, draft }
}

export function validateBankLegalInstructionDraft(input = {}) {
  const draft = {
    appointmentId: normalizeText(input.appointmentId || input.appointment_id),
    instructionReference: normalizeText(input.instructionReference || input.instruction_reference),
    instructionSource: normalizeText(input.instructionSource || input.instruction_source || 'appointed_firm_capture').toLowerCase(),
    instructionIssuedAt: normalizeText(input.instructionIssuedAt || input.instruction_issued_at),
    evidenceDocumentId: normalizeText(input.evidenceDocumentId || input.evidence_document_id),
    evidenceConfirmed: input.evidenceConfirmed === true || input.evidence_confirmed === true,
  }
  const allowedSources = ['bank_integration', 'instruction_document', 'appointed_firm_capture', 'legacy_manual']
  const errors = {}
  if (!draft.appointmentId) errors.appointmentId = 'Bank-appointed legal role is required.'
  if (!draft.instructionReference) errors.instructionReference = 'Bank instruction reference is required.'
  if (!allowedSources.includes(draft.instructionSource)) errors.instructionSource = 'Choose a valid bank instruction source.'
  if (!draft.evidenceConfirmed) errors.evidenceConfirmed = 'Confirm that the formal instruction was issued by the appointing bank.'
  return { valid: Object.keys(errors).length === 0, errors, draft }
}

export async function confirmBankLegalRoleInstruction(input = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database connection is unavailable.')
  const validation = validateBankLegalInstructionDraft(input)
  if (!validation.valid) throw new Error(Object.values(validation.errors)[0])

  const result = await supabase.rpc('bridge_confirm_bank_legal_instruction', {
    p_appointment_id: validation.draft.appointmentId,
    p_instruction_reference: validation.draft.instructionReference,
    p_instruction_source: validation.draft.instructionSource,
    p_instruction_issued_at: validation.draft.instructionIssuedAt || new Date().toISOString(),
    p_evidence_document_id: validation.draft.evidenceDocumentId || null,
    p_evidence_confirmed: true,
  })
  if (result.error) {
    if (isMissingPhaseFunctionError(result.error, 'bridge_confirm_bank_legal_instruction')) {
      throw new Error('Bank instruction confirmation is not set up yet. Run the Phase 5 legal role migration and refresh.')
    }
    throw result.error
  }
  return result.data
}

export async function decideBankLegalRoleInstruction({ appointmentId, decision, note = '' } = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database connection is unavailable.')
  const normalizedAppointmentId = normalizeText(appointmentId)
  const normalizedDecision = normalizeText(decision).toLowerCase()
  if (!normalizedAppointmentId) throw new Error('Bank-appointed legal role is required.')
  if (!['accepted', 'declined'].includes(normalizedDecision)) throw new Error('Instruction decision must be accepted or declined.')

  const result = await supabase.rpc('bridge_decide_bank_legal_instruction', {
    p_appointment_id: normalizedAppointmentId,
    p_decision: normalizedDecision,
    p_note: normalizeText(note) || null,
  })
  if (result.error) {
    if (isMissingPhaseFunctionError(result.error, 'bridge_decide_bank_legal_instruction')) {
      throw new Error('Bank instruction decisions are not set up yet. Run the Phase 5 legal role migration and refresh.')
    }
    throw result.error
  }
  return result.data
}

export async function listBankLegalRoleAppointments(transactionId) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId || !isSupabaseConfigured || !supabase) return []
  const result = await supabase
    .from('transaction_legal_role_appointments')
    .select('*')
    .eq('transaction_id', normalizedTransactionId)
    .order('captured_at', { ascending: false })
  if (result.error) {
    if (isMissingTableError(result.error)) return []
    throw result.error
  }
  return result.data || []
}

export async function listBankLegalRoleAssurance(transactionId) {
  const normalizedTransactionId = normalizeText(transactionId)
  if (!normalizedTransactionId || !isSupabaseConfigured || !supabase) return []
  const result = await supabase
    .from('legal_role_coordination_assurance_v1')
    .select('*')
    .eq('transaction_id', normalizedTransactionId)
    .order('assurance_updated_at', { ascending: false })
  if (result.error) {
    if (isMissingTableError(result.error)) return []
    throw result.error
  }
  return result.data || []
}

async function resolveCurrentUserId(client) {
  const result = await client.auth.getUser()
  if (result.error) throw result.error
  return result.data?.user?.id || null
}

async function saveConfirmedAppointment(client, draft, actorUserId) {
  const existing = await client
    .from('transaction_legal_role_appointments')
    .select('id, coordination_state')
    .eq('transaction_id', draft.transactionId)
    .eq('role_type', draft.roleType)
    .neq('coordination_state', LEGAL_ROLE_COORDINATION_STATES.replacementRequired)
    .maybeSingle()
  if (existing.error && !isMissingTableError(existing.error)) throw existing.error

  const payload = {
    transaction_id: draft.transactionId,
    role_type: draft.roleType,
    appointing_bank: draft.appointingBank,
    appointment_reference: draft.appointmentReference,
    appointed_firm_name: draft.companyName,
    appointed_contact_name: draft.contactName,
    appointed_email: draft.email,
    appointed_phone: draft.phone || null,
    appointment_source: 'transfer_attorney',
    evidence_confirmed: true,
    evidence_document_id: draft.evidenceDocumentId || null,
    coordination_state: LEGAL_ROLE_COORDINATION_STATES.appointmentCaptured,
    captured_by: actorUserId,
  }
  const query = existing.data?.id
    ? client.from('transaction_legal_role_appointments').update(payload).eq('id', existing.data.id)
    : client.from('transaction_legal_role_appointments').insert(payload)
  const result = await query.select('*').single()
  if (result.error) {
    if (isMissingTableError(result.error)) throw new Error('Bank-appointed legal roles are not set up yet. Run the Phase 3 migration and refresh.')
    throw result.error
  }
  return result.data
}

export async function captureBankAppointmentAndInvite(input = {}) {
  if (!isSupabaseConfigured || !supabase) throw new Error('Database connection is unavailable.')
  const validation = validateBankLegalRoleAppointmentDraft(input)
  if (!validation.valid) throw new Error(Object.values(validation.errors)[0])

  const authority = evaluateLegalRoleInviteAuthority({
    targetRole: validation.draft.roleType,
    actorRole: LEGAL_ROLE_COORDINATION_ACTORS.transferAttorney,
    appointmentEvidenceConfirmed: validation.draft.evidenceConfirmed,
    transferInstructionAccepted: input.transferInstructionAccepted === true,
    isPrimaryTransferAttorney: input.isPrimaryTransferAttorney !== false,
  })
  if (!authority.allowed) {
    if (authority.reason === 'transfer_instruction_acceptance_required') {
      throw new Error('Accept the transfer instruction before coordinating bank-appointed attorneys.')
    }
    throw new Error('You are not authorised to coordinate this bank-appointed legal role.')
  }

  const actorUserId = await resolveCurrentUserId(supabase)
  const appointment = await saveConfirmedAppointment(supabase, validation.draft, actorUserId)
  const existingInvitations = await listTransactionPartnerInvitations(validation.draft.transactionId)
  const existingInvitation = existingInvitations.find((invitation) =>
    invitation.roleType === validation.draft.roleType &&
    String(invitation.metadata?.legal_role_appointment_id || '') === String(appointment.id || '') &&
    ['pending', 'accepted'].includes(invitation.status))
  if (existingInvitation) {
    throw new Error(
      existingInvitation.status === 'accepted'
        ? 'The appointed firm has already accepted its platform invitation.'
        : 'An invitation to this appointed firm is already pending. Use resend instead of creating another invite.',
    )
  }
  const invitationResult = await createTransactionPartnerInvitation({
    transactionId: validation.draft.transactionId,
    roleType: validation.draft.roleType,
    companyName: validation.draft.companyName,
    contactName: validation.draft.contactName,
    email: validation.draft.email,
    phone: validation.draft.phone,
    invitedByUserId: actorUserId,
    metadata: {
      source: 'bank_appointed_legal_role_phase3',
      invitedByRole: LEGAL_ROLE_COORDINATION_ACTORS.transferAttorney,
      legal_role_appointment_id: appointment.id,
      appointing_bank: validation.draft.appointingBank,
      appointment_reference: validation.draft.appointmentReference,
      appointment_evidence_confirmed: true,
    },
  })

  const invitationId = invitationResult?.invitation?.id || invitationResult?.id || null
  if (appointment.id) {
    const updateResult = await supabase
      .from('transaction_legal_role_appointments')
      .update({
        invitation_id: invitationId,
        coordination_state: LEGAL_ROLE_COORDINATION_STATES.inviteSent,
      })
      .eq('id', appointment.id)
    if (updateResult.error && !isMissingTableError(updateResult.error)) throw updateResult.error
  }

  return {
    appointment: {
      ...appointment,
      invitation_id: invitationId,
      coordination_state: LEGAL_ROLE_COORDINATION_STATES.inviteSent,
    },
    ...invitationResult,
  }
}

export async function getBankLegalRoleCoordinationSnapshot(transactionId) {
  const [appointments, invitations] = await Promise.all([
    listBankLegalRoleAppointments(transactionId),
    listTransactionPartnerInvitations(transactionId),
  ])
  return { appointments, invitations }
}
