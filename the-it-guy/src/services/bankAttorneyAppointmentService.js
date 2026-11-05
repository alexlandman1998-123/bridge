import { requireClient } from './attorneyFirmServiceShared'

const bankRoles = new Set(['bond_attorney', 'cancellation_attorney'])
const text = value => String(value || '').trim()
const same = (left, right) => text(left).toLowerCase() === text(right).toLowerCase()

// Capture the bank's decision, before inviting its firm. This does not appoint
// an attorney, allocate staff or accept the bank's formal instruction.
export async function captureBankAttorneyAppointment(input = {}, options = {}) {
  const client = options.client || requireClient()
  if (!input.transactionId || !bankRoles.has(input.roleType)) throw new Error('Choose a transaction and bank-appointed legal role.')
  if (!input.evidenceConfirmed || !input.evidenceDocumentId ||
      ![input.bankName, input.appointmentReference, input.companyName, input.contactName, input.email].every(value => text(value))) {
    throw new Error('Record the bank, appointment reference, firm, contact and appointment evidence first.')
  }
  const evidence = await client.from('documents').select('id,transaction_id,status').eq('id', input.evidenceDocumentId).eq('transaction_id', input.transactionId).maybeSingle()
  if (evidence.error) throw evidence.error
  if (!evidence.data || ['archived', 'deleted', 'superseded'].includes(evidence.data.status)) throw new Error('Use current appointment evidence from this transaction.')
  const existing = await client.from('transaction_legal_role_appointments').select('*')
    .eq('transaction_id', input.transactionId).eq('role_type', input.roleType).neq('coordination_state', 'replacement_required').maybeSingle()
  if (existing.error) throw existing.error
  if (existing.data) {
    if (same(existing.data.appointing_bank, input.bankName) && same(existing.data.appointment_reference, input.appointmentReference) &&
        same(existing.data.appointed_firm_name, input.companyName) && same(existing.data.appointed_email, input.email) &&
        existing.data.evidence_confirmed && existing.data.evidence_document_id === input.evidenceDocumentId) return existing.data
    throw new Error('A bank appointment is already recorded. Review and replace that appointment before inviting a different firm.')
  }
  const actor = await client.auth.getUser()
  if (actor.error) throw actor.error
  if (!actor.data?.user?.id) throw new Error('Sign in to record a bank appointment.')
  const saved = await client.from('transaction_legal_role_appointments').insert({
    transaction_id: input.transactionId, role_type: input.roleType,
    appointing_bank: text(input.bankName), appointment_reference: text(input.appointmentReference),
    appointed_firm_name: text(input.companyName), appointed_contact_name: text(input.contactName),
    appointed_email: text(input.email).toLowerCase(), appointed_phone: text(input.phone) || null,
    appointment_source: 'instruction_document', evidence_confirmed: true,
    evidence_document_id: input.evidenceDocumentId, captured_by: actor.data.user.id,
  }).select('*').single()
  if (saved.error) throw saved.error
  return saved.data
}
