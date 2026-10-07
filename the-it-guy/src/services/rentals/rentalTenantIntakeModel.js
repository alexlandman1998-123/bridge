import { TENANT_QUESTIONS, normalizeTenantQualification } from './rentalTenantWorkspaceModel.js'
import { patchRentalCrmLeadMetadata } from './rentalCrmLeadModel.js'

export const TENANT_INTAKE_QUESTIONS = TENANT_QUESTIONS.map((question) => ({
  ...question,
  question: question.key === 'screeningConsent' ? 'Do you agree to rental application screening?'
    : question.key === 'additionalNotes' ? 'Is there anything else you would like us to know?'
      : question.question,
  label: question.key === 'additionalNotes' ? 'Additional notes' : question.label,
}))

export function buildTenantIntakeLeadPatch(lead, answers, viewingRequest, now) {
  const raw = lead.raw_enquiry_payload || {}
  const metadata = raw.rentalCrm || raw.rental_crm || raw
  const sanitized = Object.fromEntries(TENANT_INTAKE_QUESTIONS.map(({ key, options }) => {
    const value = String(answers?.[key] ?? '').trim().slice(0, 1200)
    if (options && value && !options.includes(value)) throw new Error(`Choose a valid ${key} answer.`)
    if (key !== 'additionalNotes' && !value) throw new Error('Complete the tenant qualification questions before submitting.')
    return [key, value]
  }))
  const qualification = normalizeTenantQualification(sanitized, metadata.qualification || {})
  if (!/^\d{4}-\d{2}-\d{2}$/.test(qualification.occupationDate) || new Date(`${qualification.occupationDate}T00:00:00Z`).toISOString().slice(0, 10) !== qualification.occupationDate) throw new Error('Choose a valid move-in date.')
  if (!(qualification.monthlyBudget > 0)) throw new Error('Add your maximum monthly rent.')
  if (!(qualification.occupants > 0)) throw new Error('Add the number of people who will live with you.')
  const consents = qualification.screeningConsent
    ? { screening: qualification.screeningConsent === 'Yes' ? 'granted' : 'declined' } : {}
  const next = patchRentalCrmLeadMetadata(lead, {
    role: 'tenant',
    ...qualification,
    qualification: { ...qualification, submittedAt: now, source: 'tenant_qualification_link' },
    consents,
    viewingRequest: { ...viewingRequest, status: 'requested', submittedAt: now },
  })
  // Keep the original portal evidence and any existing nested metadata envelope.
  const payload = raw.rentalCrm ? { ...raw, rentalCrm: next }
    : raw.rental_crm ? { ...raw, rental_crm: next } : { ...raw, ...next }
  return { raw_enquiry_payload: payload, budget: qualification.monthlyBudget, area_interest: qualification.desiredArea, updated_at: now }
}
