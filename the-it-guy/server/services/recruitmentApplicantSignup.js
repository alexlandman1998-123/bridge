import { createHash } from 'node:crypto'

// A stable provider ID recovers an uncertain Auth response without retaining a
// password or changing an existing account. The CRM lead UUID stays server-side.
function applicantId(leadId) {
  const hex = createHash('sha256').update(`recruitment-applicant-v1:${leadId}`).digest('hex')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-8${hex.slice(13,16)}-${((parseInt(hex[16],16) & 3) | 8).toString(16)}${hex.slice(17,20)}-${hex.slice(20,32)}`
}

export async function createRecruitmentApplicant(db, link, submissionKey, contact, password) {
  const { data: receipt, error } = await db.from('recruitment_contact_receipts').select('lead_id')
    .eq('organisation_id', link.organisation_id).eq('link_id', link.id).eq('submission_key', submissionKey).maybeSingle()
  if (error || !receipt?.lead_id) throw new Error('Contact receipt unavailable')
  const id = applicantId(receipt.lead_id)
  const matches = (user) => user?.id === id && user.email?.toLowerCase() === contact.email
    && user.app_metadata?.recruitment_contact_lead_id === receipt.lead_id
    && user.app_metadata?.recruitment_organisation_id === link.organisation_id
  const read = () => db.auth.admin.getUserById(id)
  const existing = await read()
  if (existing.error && existing.error.status !== 404 && existing.error.code !== 'user_not_found') throw new Error('Applicant account unavailable')
  if (existing.data?.user) {
    if (!matches(existing.data.user)) throw new Error('Applicant account mismatch')
    return { duplicate: true }
  }
  const created = await db.auth.admin.createUser({
    id, email: contact.email, ...(password ? { password } : {}), email_confirm: false,
    user_metadata: { full_name: `${contact.firstName} ${contact.lastName}` },
    // Server-authored association is pending ownership proof. It grants no
    // organisation membership, staff role or applicant CRM access.
    app_metadata: { recruitment_contact_lead_id: receipt.lead_id, recruitment_organisation_id: link.organisation_id },
  })
  // An existing Arch9 account continues through the same email ownership proof.
  // Do not replace its password, metadata, roles or membership, and do not bind
  // it to this enquiry until recruitment_open_applicant_session verifies Auth.
  if (created.error?.code === 'email_exists') return { duplicate: false }
  if (!created.error && matches(created.data?.user) && !created.data.user.email_confirmed_at) return { duplicate: false }
  // Another identical request may have won, or the provider response was lost.
  const recovered = await read()
  if (!recovered.error && matches(recovered.data?.user)) return { duplicate: true }
  throw new Error('Applicant account unavailable')
}
