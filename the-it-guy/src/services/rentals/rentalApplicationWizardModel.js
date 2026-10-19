import { mergeRentalApplicationData, extractReusableRentalTenantProfile, RENTAL_APPLICATION_SCHEMA_VERSION, validateRentalApplicationFields } from './rentalApplicationFieldContract.js'
export const isRentalEntityApplicant = (data = {}) => ['company', 'close_corporation', 'trust'].includes(data.entity?.type)
export function initialiseRentalApplicationWizard(data = {}) {
  const saved = mergeRentalApplicationData({}, data)
  return { ...saved, entity: { type: 'individual', ...saved.entity }, schemaVersion: RENTAL_APPLICATION_SCHEMA_VERSION }
}
export function rentalApplicationVisibleFields(group, data = {}) {
  const entity = isRentalEntityApplicant(data)
  const work = data.employment?.employmentType
  const hidden = new Set()
  if (group.key === 'entity' && !entity) for (const key of ['legalName', 'registrationNumber', 'countryOfRegistration', 'registeredAddress', 'primaryContactRole']) hidden.add(key)
  if (group.key === 'employment') {
    if (entity) return []
    if (!['employed', 'contract'].includes(work)) for (const key of ['employer', 'role', 'employerPhone', 'startDate', 'contractType', 'contractEndDate', 'verificationContactName', 'verificationContactEmail']) hidden.add(key)
    if (!['fixed_term', 'temporary'].includes(data.employment?.contractType)) hidden.add('contractEndDate')
    if (work !== 'self_employed') hidden.add('businessName')
    if (work !== 'student') hidden.add('institution')
    if (!['student', 'retired', 'unemployed', 'other'].includes(work)) hidden.add('incomeSource')
  }
  if (group.key === 'income' && entity) for (const key of ['netMonthlyIncome', 'grossMonthlyIncome', 'incomeBasis']) hidden.add(key)
  if (group.key === 'income') {
    if (!entity && (data.income?.monthlyIncome == null || data.income?.monthlyIncome === '' || data.income?.netMonthlyIncome != null && data.income.netMonthlyIncome !== '')) { hidden.add('monthlyIncome'); hidden.add('incomeBasis') }
    if (data.income?.monthlyObligations == null || data.income?.monthlyObligations === '') hidden.add('monthlyObligations')
  }
  if (group.key === 'income' && !entity) hidden.add('incomeSource')
  if (group.key === 'rentalHistory') {
    if (data.rentalHistory?.housingSituation && data.rentalHistory.housingSituation !== 'renting') for (const key of ['landlordName', 'landlordPhone', 'landlordEmail', 'currentMonthlyRent']) hidden.add(key)
    if (data.rentalHistory?.firstTimeRenter !== false) for (const key of ['previousLandlordName', 'previousLandlordPhone', 'previousLandlordEmail']) hidden.add(key)
  }
  if (group.key === 'household' && data.household?.pets !== 'yes') hidden.add('petDetails')
  const fields = group.fields.filter((item) => !hidden.has(item.key) && item.key !== 'id')
  return group.key === 'employment' ? [...fields.filter((item) => item.key === 'employmentType'), ...fields.filter((item) => item.key !== 'employmentType')] : fields
}
export function updateRentalApplicationGroup(data, group, key, value) {
  return mergeRentalApplicationData(data, { [group]: { [key]: value, ...(group === 'income' && key === 'netMonthlyIncome' ? { monthlyIncome: value, incomeBasis: 'net' } : {}) } })
}
export function rentalApplicationReviewErrors(data) {
  return validateRentalApplicationFields(data, { fullSetup: true })
}
export function reuseRentalTenantIdentity(profile, current) {
  return mergeRentalApplicationData(current, extractReusableRentalTenantProfile(profile))
}
export function rentalApplicationDocumentSlots(data = {}, policy = { version: 1 }) {
  const slot = (subjectId, purpose, title, required = true) => ({ key: `${subjectId}:${purpose}`, subjectId, purpose, title, required, type: ['identity', 'proof_of_income', 'bank_statement', 'reference'].includes(purpose) ? purpose : 'other' })
  const slots = [slot('primary', 'identity', 'Primary applicant identity'), slot('primary', 'bank_statement', 'Bank statements', false), slot('primary', 'reference', 'Reference evidence', false)]
  if (isRentalEntityApplicant(data) || rentalPrimaryNeedsIncome(data)) slots.push(slot(isRentalEntityApplicant(data) ? 'entity' : 'primary', 'proof_of_income', isRentalEntityApplicant(data) ? 'Entity income evidence' : 'Primary applicant income evidence'))
  if (isRentalEntityApplicant(data)) slots.push(slot('entity', 'registration', data.entity.type === 'trust' ? 'Trust registration / founding evidence' : 'Entity registration'), slot('entity', 'authority', 'Authority to act'))
  for (const person of Array.isArray(data.people) ? data.people : []) {
    if (!person.id || ['primary', 'entity'].includes(person.id)) continue
    const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Additional person'
    slots.push(slot(person.id, 'identity', `${name}: identity`), slot(person.id, 'signed_consent', `${name}: signed consent evidence`))
    if (['guarantor', 'sponsor'].includes(person.role) || person.contributesToAffordability) slots.push(slot(person.id, 'proof_of_income', `${name}: income evidence`))
  }
  if (policy.version === 4) {
    const required = policy.extendedRequired === true
    slots.push(slot('primary', 'address', 'Primary applicant: proof of address', required))
    for (const person of data.people || []) {
      if (!person.id || ['primary', 'entity'].includes(person.id)) continue
      const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || 'Additional person'
      slots.push(slot(person.id, 'address', `${name}: proof of address`, required))
      if (['authorised_signatory', 'trustee'].includes(person.role)) slots.push(slot(person.id, 'authority', `${name}: authority to act`))
    }
    if (isRentalEntityApplicant(data)) {
      slots.push(slot('entity', 'address', 'Entity: proof of address', required), slot('entity', 'beneficial_ownership', 'Entity: ownership and control evidence', required))
      if (data.entity.type === 'trust') slots.push(slot('entity', 'trust_authority', 'Entity: Letters of Authority'))
    }
  }
  return slots
}
// PostgreSQL timestamps can include microseconds. Preserve that precision so
// browser and database choose the same file when uploads share a millisecond.
function compareEvidenceTime(a, b) {
  const milliseconds = (Date.parse(a) || 0) - (Date.parse(b) || 0)
  const fraction = (value) => Number((String(value || '').match(/\.(\d+)/)?.[1] || '').padEnd(6, '0').slice(3, 6))
  return milliseconds || fraction(a) - fraction(b)
}
export function rentalApplicationSavedDocumentSlots(data, requirements, policy) {
  const slots = rentalApplicationDocumentSlots(data, policy)
  if (requirements === undefined) return slots // Older, non-checklist callers.
  if (!requirements?.length) return slots.map((slot) => ({ ...slot, saved: true, state: 'missing' }))
  return (requirements || []).filter((item) => item.active && item.mode === 'active' && item.scopeKey === 'application').map((requirement) => {
    const person = (data?.people || []).find((item) => item.id === requirement.subjectId)
    const subject = requirement.subjectId === 'primary' ? 'Primary applicant' : requirement.subjectId === 'entity' ? 'Entity' : [person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'Additional person'
    const labels = { address: 'proof of address', beneficial_ownership: 'ownership and control evidence', trust_authority: 'Letters of Authority', authority: 'authority to act' }
    const slot = slots.find((item) => item.subjectId === requirement.subjectId && item.purpose === requirement.purpose) || { key: `${requirement.subjectId}:${requirement.purpose}`, subjectId: requirement.subjectId, purpose: requirement.purpose, title: `${subject}: ${labels[requirement.purpose] || requirement.purpose.replaceAll('_', ' ')}`, type: 'other' }
    return { ...slot, required: requirement.required, saved: true, requirementId: requirement.id, generation: requirement.generation, documentId: requirement.documentId, state: requirement.state || 'missing', expiresAt: requirement.expiresAt }
  })
}
export function rentalApplicationDocumentForSlot(slot, documents = [], data = {}) {
  if (slot.saved) return documents.find((document) => document.id === slot.documentId)

  const links = Array.isArray(data.documentLinks) ? data.documentLinks : []
  return [...documents].sort((a, b) => compareEvidenceTime(b.uploaded_at, a.uploaded_at) || compareEvidenceTime(b.created_at, a.created_at) || String(b.id || '').localeCompare(String(a.id || ''))).find((document) => {
    const link = links.find((item) => item.documentId === document.id)
    return link ? !link.invalidated && link.subjectId === slot.subjectId && link.purpose === slot.purpose : slot.subjectId === 'primary' && !(data.documentInvalidations || []).some((item) => item.subjectId === 'primary') && (document.document_type || document.type) === slot.purpose
  })
}

export function rentalApplicationPersonFields(group, person) {
  const financial = ['guarantor', 'sponsor'].includes(person.role) || person.contributesToAffordability === true
  const money = ['employmentType', 'employer', 'incomeSource', 'monthlyIncome', 'otherIncome', 'monthlyObligations', 'rentContribution', 'depositContribution', 'supportDuration']
  return group.fields.filter((field) => field.key !== 'id' && !(field.key === 'contributesToAffordability' && ['guarantor', 'sponsor'].includes(person.role)) && (financial || !money.includes(field.key)) && (field.key !== 'employer' || ['employed', 'contract'].includes(person.employmentType)) && (field.key !== 'authorityBasis' || ['authorised_signatory', 'trustee'].includes(person.role)))
}

export function rentalPrimaryNeedsIncome(data = {}) {
  return Number(data.income?.netMonthlyIncome) > 0 || Number(data.income?.monthlyIncome) > 0 || Number(data.income?.otherIncome) > 0 || !(data.people || []).some((person) => (['guarantor', 'sponsor'].includes(person.role) || person.contributesToAffordability === true) && (Number(person.monthlyIncome) > 0 || Number(person.otherIncome) > 0))
}
export function rentalApplicationDocumentProgress(application = {}) {
  const slots = rentalApplicationSavedDocumentSlots(application.data, application.requirements).filter((slot) => slot.required)
  const current = slots.map((slot) => rentalApplicationDocumentForSlot(slot, application.documents || [], application.data))
  const received = (slot, doc) => slot.saved ? ['received', 'accepted'].includes(slot.state) && (!slot.expiresAt || Date.parse(slot.expiresAt) > Date.now()) : ['uploaded', 'accepted'].includes(doc?.status)
  const uploaded = slots.filter((slot, index) => received(slot, current[index])).length
  return { uploaded, accepted: slots.filter((slot, index) => received(slot, current[index]) && (slot.saved ? slot.state === 'accepted' : current[index]?.status === 'accepted')).length, required: slots.length, progress: slots.length ? Math.round(uploaded / slots.length * 100) : 0 }
}

export function rentalApplicationDocumentsForSlot(slot, documents = [], data = {}) {
  const current = rentalApplicationDocumentForSlot(slot, documents, data)
  if (!current) return []
  if (!current.intake_bundle_id) return [current]
  const linked = new Set((data.documentLinks || []).filter((link) => !link.invalidated && link.subjectId === slot.subjectId && link.purpose === slot.purpose && (!slot.saved || link.requirementId === slot.requirementId && link.generation === slot.generation)).map((link) => link.documentId))
  return documents.filter((document) => document.intake_bundle_id === current.intake_bundle_id && linked.has(document.id))
}

// Monthly figures remain monthly regardless of payment frequency. Legacy income
// and commitments stay intact; new detail takes precedence only when supplied.
export function rentalAffordabilitySummary(data = {}) {
  const income = data.income || {}
  const amount = value => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 0
  const supplied = value => value !== '' && value != null
  const netKnown = !isRentalEntityApplicant(data) && (supplied(income.netMonthlyIncome) || income.incomeBasis === 'net')
  const net = amount(supplied(income.netMonthlyIncome) ? income.netMonthlyIncome : income.incomeBasis === 'net' ? income.monthlyIncome : 0)
  const detailed = ['debtRepayments', 'livingExpenses', 'otherObligations'].some(key => supplied(income[key]))
  const expenses = detailed ? ['debtRepayments', 'livingExpenses', 'otherObligations'].reduce((total, key) => total + amount(income[key]), 0) : amount(income.monthlyObligations)
  const rent = amount(data.property?.monthlyRent)
  return { netKnown, net, expenses, available: net + amount(income.otherIncome) - expenses, rentPercent: netKnown && net > 0 ? Math.round(rent / net * 100) : null }
}

export function prefillRentalApplicationFromQualification(data = {}, qualification = {}) {
  const employment = { employed: 'employed', 'self-employed': 'self_employed', student: 'student', retired: 'retired', other: 'other' }[String(qualification.employmentStatus || '').toLowerCase()]
  const yesNo = value => typeof value === 'boolean' ? value : { yes: true, no: false }[String(value || '').toLowerCase()]
  const pets = { 'no pets': 'no', 'pet friendly required': 'yes', yes: 'yes', no: 'no' }[String(qualification.pets || '').toLowerCase()]
  const proposed = { household: { intendedOccupationDate: qualification.occupationDate, occupantCount: qualification.occupants, pets }, employment: { employmentType: employment }, income: { depositAvailable: yesNo(qualification.depositAvailable) } }
  const patch = Object.fromEntries(Object.entries(proposed).map(([group, fields]) => [group, Object.fromEntries(Object.entries(fields).filter(([key, value]) => value != null && value !== '' && (data[group]?.[key] == null || data[group][key] === '')))]))
  // Never reuse screening consent or internal call notes as applicant answers.
  return mergeRentalApplicationData(data, patch)
}
