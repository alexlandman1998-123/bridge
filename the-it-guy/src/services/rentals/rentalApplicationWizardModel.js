import { mergeRentalApplicationData, extractReusableRentalTenantProfile, RENTAL_APPLICATION_SCHEMA_VERSION, validateRentalApplicationFields } from './rentalApplicationFieldContract.js'
export const isRentalEntityApplicant = (data = {}) => ['company', 'close_corporation', 'trust'].includes(data.entity?.type)
export function initialiseRentalApplicationWizard(data = {}) {
  return { ...mergeRentalApplicationData({ entity: { type: 'individual' } }, data), schemaVersion: RENTAL_APPLICATION_SCHEMA_VERSION }
}
export function rentalApplicationVisibleFields(group, data = {}) {
  const entity = isRentalEntityApplicant(data)
  const work = data.employment?.employmentType
  const hidden = new Set()
  if (group.key === 'entity' && !entity) for (const key of ['legalName', 'registrationNumber', 'countryOfRegistration', 'registeredAddress', 'primaryContactRole']) hidden.add(key)
  if (group.key === 'employment') {
    if (entity) return []
    if (!['employed', 'contract'].includes(work)) for (const key of ['employer', 'role', 'employerPhone', 'startDate']) hidden.add(key)
    if (work !== 'self_employed') hidden.add('businessName')
    if (work !== 'student') hidden.add('institution')
    if (!['student', 'retired', 'unemployed', 'other'].includes(work)) hidden.add('incomeSource')
  }
  if (group.key === 'income' && !entity) hidden.add('incomeSource')
  if (group.key === 'household' && data.household?.pets !== 'yes') hidden.add('petDetails')
  const fields = group.fields.filter((item) => !hidden.has(item.key) && item.key !== 'id')
  return group.key === 'employment' ? [...fields.filter((item) => item.key === 'employmentType'), ...fields.filter((item) => item.key !== 'employmentType')] : fields
}
export function updateRentalApplicationGroup(data, group, key, value) {
  return mergeRentalApplicationData(data, { [group]: { [key]: value } })
}
export function rentalApplicationReviewErrors(data) {
  return validateRentalApplicationFields(data, { fullSetup: true })
}
export function reuseRentalTenantIdentity(profile, current) {
  return mergeRentalApplicationData(current, extractReusableRentalTenantProfile(profile))
}
export function rentalApplicationDocumentSlots(data = {}) {
  const slot = (subjectId, purpose, title, required = true) => ({ key: `${subjectId}:${purpose}`, subjectId, purpose, title, required, type: ['identity', 'proof_of_income', 'bank_statement', 'reference'].includes(purpose) ? purpose : 'other' })
  const slots = [slot('primary', 'identity', 'Primary applicant identity'), slot('primary', 'proof_of_income', isRentalEntityApplicant(data) ? 'Entity income evidence' : 'Primary applicant income evidence'), slot('primary', 'bank_statement', 'Bank statements', false), slot('primary', 'reference', 'Reference evidence', false)]
  if (isRentalEntityApplicant(data)) slots.push(slot('entity', 'registration', data.entity.type === 'trust' ? 'Trust registration / founding evidence' : 'Entity registration'), slot('entity', 'authority', 'Authority to act'))
  for (const person of Array.isArray(data.people) ? data.people : []) {
    if (!person.id || ['primary', 'entity'].includes(person.id)) continue
    const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Additional person'
    slots.push(slot(person.id, 'identity', `${name}: identity`), slot(person.id, 'signed_consent', `${name}: signed consent evidence`))
    if (person.role === 'guarantor' || person.contributesToAffordability) slots.push(slot(person.id, 'proof_of_income', `${name}: income evidence`))
  }
  return slots
}
export function rentalApplicationDocumentForSlot(slot, documents = [], data = {}) {
  const links = Array.isArray(data.documentLinks) ? data.documentLinks : []
  return documents.find((document) => {
    if (!['uploaded', 'accepted'].includes(document.status)) return false
    const link = links.find((item) => item.documentId === document.id)
    return link ? link.subjectId === slot.subjectId && link.purpose === slot.purpose : slot.subjectId === 'primary' && (document.document_type || document.type) === slot.purpose
  })
}

export function rentalApplicationPersonFields(group, person) {
  const financial = person.role === 'guarantor' || person.contributesToAffordability === true
  const money = ['employmentType', 'employer', 'incomeSource', 'monthlyIncome', 'otherIncome', 'monthlyObligations']
  return group.fields.filter((field) => field.key !== 'id' && (financial || !money.includes(field.key)) && (field.key !== 'employer' || ['employed', 'contract'].includes(person.employmentType)) && (field.key !== 'authorityBasis' || ['authorised_signatory', 'trustee'].includes(person.role)))
}
