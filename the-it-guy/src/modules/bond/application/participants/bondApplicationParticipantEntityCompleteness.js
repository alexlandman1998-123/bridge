import { canonicalizeBondApplicationSnapshot } from '../submission/bondApplicationSnapshotHash.js'

export const BOND_APPLICATION_PARTICIPANT_ENTITY_COMPLETENESS_VERSION = 'phase-4-v1'

const YES = new Set(['yes', 'true', '1', 'confirmed', 'complete', 'uploaded', 'provided'])

function present(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.some(present)
  if (value && typeof value === 'object') return Object.values(value).some(present)
  return String(value || '').trim().length > 0
}

function first(...values) {
  return values.find(present)
}

function list(value) {
  if (Array.isArray(value)) return value.filter(present)
  if (!present(value)) return []
  if (typeof value === 'string') {
    return value.split(/[;\n,]+/).map((item) => item.trim()).filter(Boolean).map((name) => ({ name }))
  }
  return [value]
}

function confirmed(value) {
  if (typeof value === 'boolean') return value
  return YES.has(String(value || '').trim().toLowerCase()) ||
    value?.confirmed === true ||
    YES.has(String(value?.status || '').trim().toLowerCase()) ||
    present(value?.documentId || value?.document_id || value?.fileId || value?.file_id)
}

function personName(person = {}) {
  if (typeof person === 'string') return person.trim()
  return first(person.name, person.fullName, person.full_name, [person.firstName || person.first_name, person.lastName || person.last_name || person.surname].filter(Boolean).join(' ')) || ''
}

function identity(person = {}) {
  return first(person.identityNumber, person.identity_number, person.idNumber, person.id_number, person.passportNumber, person.passport_number)
}

function financialValue(participant = {}) {
  const employment = participant.employment || {}
  const expenses = participant.expenses || {}
  return first(
    employment.grossMonthlyIncome,
    employment.gross_monthly_income,
    employment.grossSalary,
    employment.gross_salary,
    expenses.grossMonthlyIncome,
    expenses.gross_monthly_income,
    expenses.grossSalary,
    expenses.gross_salary,
    participant.incomeSources,
  )
}

function participantIssues(participant, { role, path, required }) {
  if (!required) return []
  if (!participant) return [{ code: `${role}_required`, path, message: `Add the ${role.replaceAll('_', ' ')} before submission.` }]
  const issues = []
  const personal = participant.personal || {}
  const contact = participant.contact || {}
  if (!personName(personal)) issues.push({ code: `${role}_name_required`, path: `${path}.personal`, message: `Add the ${role.replaceAll('_', ' ')} name.` })
  if (!identity(personal)) issues.push({ code: `${role}_identity_required`, path: `${path}.personal`, message: `Add the ${role.replaceAll('_', ' ')} identity or passport number.` })
  if (!first(contact.email, personal.email)) issues.push({ code: `${role}_email_required`, path: `${path}.contact.email`, message: `Add the ${role.replaceAll('_', ' ')} email address.` })
  if (!first(participant.employment?.employmentType, participant.employment?.employment_type, participant.employment?.status)) {
    issues.push({ code: `${role}_employment_required`, path: `${path}.employment`, message: `Complete the ${role.replaceAll('_', ' ')} employment status.` })
  }
  if (!financialValue(participant)) issues.push({ code: `${role}_income_required`, path: `${path}.incomeSources`, message: `Capture the ${role.replaceAll('_', ' ')} income information.` })
  return issues
}

function entityIssues(buyerEntity = {}) {
  const type = String(buyerEntity.entityType || 'individual').trim().toLowerCase()
  if (!['company', 'trust'].includes(type)) return []
  const issues = []
  if (!present(buyerEntity.name)) issues.push({ code: 'buyer_entity_name_required', path: 'application.buyerEntity.name', message: 'Add the purchaser entity name.' })
  if (!present(buyerEntity.registrationNumber)) issues.push({ code: 'buyer_entity_registration_required', path: 'application.buyerEntity.registrationNumber', message: 'Add the purchaser entity registration or trust number.' })
  if (type === 'company') {
    const company = buyerEntity.company || {}
    const directors = list(company.directors)
    const shareholders = list(company.shareholders || company.beneficialOwners)
    if (!directors.length) issues.push({ code: 'company_directors_required', path: 'application.buyerEntity.company.directors', message: 'Capture all company directors.' })
    if (directors.some((director) => !personName(director) || (typeof director === 'object' && !identity(director)))) issues.push({ code: 'company_director_identity_incomplete', path: 'application.buyerEntity.company.directors', message: 'Complete each director name and identity reference.' })
    if (!shareholders.length) issues.push({ code: 'company_shareholding_required', path: 'application.buyerEntity.company.shareholders', message: 'Capture the company shareholding or beneficial ownership structure.' })
    if (!list(company.authorisedSignatories).length) issues.push({ code: 'company_signatory_required', path: 'application.buyerEntity.company.authorisedSignatories', message: 'Identify the company authorised signatory.' })
    if (!confirmed(company.resolution)) issues.push({ code: 'company_resolution_required', path: 'application.buyerEntity.company.resolution', message: 'Provide or confirm the company borrowing resolution.' })
  }
  if (type === 'trust') {
    const trust = buyerEntity.trust || {}
    const trustees = list(trust.trustees)
    if (!trustees.length) issues.push({ code: 'trust_trustees_required', path: 'application.buyerEntity.trust.trustees', message: 'Capture all trustees.' })
    if (trustees.some((trustee) => !personName(trustee) || (typeof trustee === 'object' && !identity(trustee)))) issues.push({ code: 'trust_trustee_identity_incomplete', path: 'application.buyerEntity.trust.trustees', message: 'Complete each trustee name and identity reference.' })
    if (!list(trust.authorisedSignatories).length) issues.push({ code: 'trust_signatory_required', path: 'application.buyerEntity.trust.authorisedSignatories', message: 'Identify the trustee authorised to sign.' })
    if (!confirmed(trust.lettersOfAuthority)) issues.push({ code: 'trust_letters_of_authority_required', path: 'application.buyerEntity.trust.lettersOfAuthority', message: 'Provide the current Letters of Authority.' })
    if (!confirmed(trust.trustDeed)) issues.push({ code: 'trust_deed_required', path: 'application.buyerEntity.trust.trustDeed', message: 'Provide the trust deed and amendments.' })
    if (!confirmed(trust.resolution)) issues.push({ code: 'trust_resolution_required', path: 'application.buyerEntity.trust.resolution', message: 'Provide or confirm the trustee borrowing resolution.' })
  }
  return issues
}

export function buildBondApplicationParticipantEntityCompleteness(applicationState = {}) {
  const structure = String(applicationState?.application?.applicantStructure || '').trim().toLowerCase()
  const requiresSurety = structure === 'surety' || ['yes', 'true', '1'].includes(String(applicationState?.application?.requiresSurety || '').trim().toLowerCase())
  const issues = [
    ...participantIssues(applicationState?.participants?.coApplicant, { role: 'co_applicant', path: 'participants.coApplicant', required: structure === 'joint' }),
    ...entityIssues(applicationState?.application?.buyerEntity),
  ]
  const sureties = Array.isArray(applicationState?.participants?.sureties) ? applicationState.participants.sureties : []
  if (requiresSurety && sureties.length === 0) {
    issues.push(...participantIssues(null, { role: 'surety', path: 'participants.sureties', required: true }))
  } else if (requiresSurety) {
    sureties.forEach((surety, index) => issues.push(...participantIssues(surety, { role: 'surety', path: `participants.sureties.${index}`, required: true })))
  }
  const normalizedIssues = issues.map((item) => ({ category: 'participant_entity', ...item }))
  return {
    version: BOND_APPLICATION_PARTICIPANT_ENTITY_COMPLETENESS_VERSION,
    complete: normalizedIssues.length === 0,
    blockingIssues: normalizedIssues,
    fingerprint: `${BOND_APPLICATION_PARTICIPANT_ENTITY_COMPLETENESS_VERSION}:${canonicalizeBondApplicationSnapshot(normalizedIssues)}`,
  }
}
