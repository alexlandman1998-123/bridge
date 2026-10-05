import { createTransactionPartnerInvitation, listTransactionPartnerInvitations } from './transactionPartnerInvitationService.js'

const text = (value) => String(value ?? '').trim().toLowerCase()
// Read strictly before creating: an unavailable invitation register cannot prove
// absence, including after a previous creation response was lost.
export async function ensureTransactionCaptureInvitations({ transactionId, nominations, list = listTransactionPartnerInvitations, create = createTransactionPartnerInvitation }) {
  if (!transactionId) throw new Error('Save the transaction before inviting its professionals.')
  if (!nominations.length) return []
  let existing
  try {
    existing = await list(transactionId, { strict: true })
    if (!Array.isArray(existing) || existing.some((invitation) => !invitation?.id || !text(invitation.roleType || invitation.role_type) || !text(invitation.email) || !text(invitation.companyName || invitation.company_name))) {
      throw new Error('Invitation history could not be confirmed. Retry from this saved transaction.')
    }
    existing = [...existing]
  }
  catch (error) { return nominations.map((nomination) => ({ ...nomination, status: 'failed', message: error.message || 'Invitation history could not be checked. Retry from this saved transaction.' })) }
  const results = []
  for (const nomination of nominations) {
    const match = existing.find((invitation) => text(invitation.roleType || invitation.role_type) === text(nomination.roleType)
      && text(invitation.email) === text(nomination.email) && text(invitation.companyName || invitation.company_name) === text(nomination.companyName))
    if (match) {
      const status = match.status
      results.push({ ...nomination, invitationId: match.id, status: status === 'accepted' ? 'accepted' : status === 'pending' ? 'pending' : 'attention',
        message: status === 'accepted' ? 'Organisation connection recorded. Check the handoff register for instruction and acceptance.' : status === 'pending' ? 'Invitation already exists. Connection is pending; check its delivery status in the transaction workspace.' : `Existing invitation is ${status}. Review it in the transaction workspace before inviting again.` })
      continue
    }
    try {
      const result = await create({ transactionId, ...nomination, metadata: { source: 'transaction_capture' } })
      if (!result?.invitation?.id) throw new Error('The invitation save could not be confirmed. Check the invitation register before retrying.')
      existing.unshift({ ...nomination, ...result.invitation })
      results.push({ ...nomination, invitationId: result.invitation.id, status: 'pending',
        message: (result.emailResult?.sent === true || result.emailResult?.ok === true) ? 'Invitation email sent. Awaiting organisation connection.' : 'Invitation saved. Email delivery is not confirmed; review or resend it in the transaction workspace.' })
    } catch (error) {
      results.push({ ...nomination, status: 'failed', message: error.message || 'Invitation could not be confirmed. Retry from this saved transaction.' })
    }
  }
  return results
}
