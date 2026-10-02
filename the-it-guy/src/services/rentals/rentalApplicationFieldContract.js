// Shared by agent capture, the applicant portal and the server. Existing section
// paths remain stable; reusable details are projected rather than duplicated.
export const RENTAL_APPLICATION_SCHEMA_VERSION = 'arch9_rental_application_fields_v2'
export const RENTAL_TENANT_ENTITY_TYPES = Object.freeze(['individual', 'joint_individuals', 'company', 'close_corporation', 'trust'])
export const RENTAL_APPLICANT_ROLES = Object.freeze(['co_tenant', 'authorised_signatory', 'trustee', 'beneficial_owner', 'guarantor'])
export const RENTAL_EMPLOYMENT_TYPES = Object.freeze(['employed', 'self_employed', 'contract', 'student', 'retired', 'unemployed', 'other'])
const field = (key, label, type = 'text', current = false) => Object.freeze({ key, label, type, current })
export const RENTAL_APPLICATION_FIELD_GROUPS = Object.freeze([
  { key: 'entity', title: 'Tenant entity', scope: 'profile', fields: [field('type', 'Tenant entity type'), field('legalName', 'Registered name'), field('registrationNumber', 'Registration number'), field('countryOfRegistration', 'Country of registration'), field('registeredAddress', 'Registered address'), field('primaryContactRole', 'Primary contact authority')] },
  { key: 'identity', title: 'Tenant contact', scope: 'profile', fields: [field('firstName', 'First name', 'text', true), field('lastName', 'Last name', 'text', true), field('email', 'Email', 'email', true), field('phone', 'Phone', 'tel', true), field('identityType', 'Identity document type'), field('identityNumber', 'ID / passport number'), field('nationality', 'Nationality'), field('dateOfBirth', 'Date of birth', 'date')] },
  { key: 'contacts', title: 'Contact details', scope: 'profile', fields: [field('postalAddress', 'Postal address'), field('preferredContactMethod', 'Preferred contact method'), field('emergencyContactName', 'Emergency contact name'), field('emergencyContactPhone', 'Emergency contact phone', 'tel')] },
  // The primary applicant is identity above. Additional people have stable IDs;
  // occupants and guarantors are different roles, not duplicate tenant records.
  { key: 'people', title: 'Additional applicants & representatives', scope: 'application', collection: true, fields: [field('id', 'Person reference'), field('role', 'Application role'), field('firstName', 'First name'), field('lastName', 'Last name'), field('email', 'Email', 'email'), field('phone', 'Phone', 'tel'), field('identityType', 'Identity document type'), field('identityNumber', 'ID / passport number'), field('nationality', 'Nationality'), field('authorityBasis', 'Authority to act'), field('currentAddress', 'Residential address'), field('employmentType', 'Employment type'), field('employer', 'Employer'), field('incomeSource', 'Income source'), field('monthlyIncome', 'Monthly income', 'number'), field('otherIncome', 'Other monthly income', 'number'), field('monthlyObligations', 'Monthly commitments', 'number'), field('contributesToAffordability', 'Contributes to affordability', 'boolean')] },
  { key: 'property', title: 'Selected property', scope: 'application', readOnly: true, fields: [field('vacancyId', 'Vacancy reference'), field('unitId', 'Unit reference'), field('listingId', 'Listing reference'), field('title', 'Property title'), field('address', 'Property address'), field('monthlyRent', 'Monthly rent', 'number'), field('depositAmount', 'Deposit amount', 'number')] },
  { key: 'household', title: 'Household & occupation', scope: 'application', fields: [field('intendedOccupationDate', 'Intended move date', 'date'), field('occupantCount', 'Occupant count', 'number'), field('leasePeriodMonths', 'Preferred lease term', 'number'), field('pets', 'Pets'), field('petDetails', 'Pet details'), field('guarantorRequired', 'Guarantor required', 'boolean')] },
  { key: 'employment', title: 'Employment', scope: 'application', fields: [field('employer', 'Employer', 'text', true), field('role', 'Role', 'text', true), field('employmentType', 'Employment type', 'text', true), field('businessName', 'Business name'), field('institution', 'Institution'), field('incomeSource', 'Income source'), field('employerPhone', 'Employer phone', 'tel'), field('startDate', 'Employment start date', 'date')] },
  { key: 'income', title: 'Income & affordability', scope: 'application', fields: [field('monthlyIncome', 'Monthly income', 'number', true), field('otherIncome', 'Other monthly income', 'number', true), field('monthlyObligations', 'Monthly commitments', 'number'), field('incomeDescription', 'Other income source'), field('incomeSource', 'Entity income source'), field('depositAvailable', 'Deposit available', 'boolean')] },
  { key: 'rentalHistory', title: 'Rental history', scope: 'application', fields: [field('currentAddress', 'Current address', 'text', true), field('landlordName', 'Current landlord', 'text', true), field('reasonForMoving', 'Reason for moving', 'text', true), field('landlordPhone', 'Landlord phone', 'tel'), field('landlordEmail', 'Landlord email', 'email'), field('currentMonthlyRent', 'Current monthly rent', 'number'), field('housingSituation', 'Current housing situation')] },
  { key: 'documentLinks', title: 'Document assignments', scope: 'application', readOnly: true, collection: true, fields: [field('documentId', 'Document reference'), field('subjectId', 'Document subject'), field('purpose', 'Evidence purpose')] },
  { key: 'references', title: 'References', scope: 'application', collection: true, fields: [field('id', 'Reference ID'), field('type', 'Reference type'), field('name', 'Name'), field('phone', 'Phone', 'tel'), field('email', 'Email', 'email'), field('relationship', 'Relationship')] },
].map((group) => Object.freeze({ ...group, fields: Object.freeze(group.fields) })))
export const RENTAL_APPLICATION_SETUP_STEPS = Object.freeze([
  { key: 'entity', title: 'Tenant entity', groups: ['entity'] },
  { key: 'contacts', title: 'People & contacts', groups: ['identity', 'contacts', 'people'] },
  { key: 'household', title: 'Household & property', groups: ['property', 'household'] },
  { key: 'employment', title: 'Employment', groups: ['employment'] },
  { key: 'affordability', title: 'Affordability', groups: ['income'] },
  { key: 'history', title: 'Rental history & references', groups: ['rentalHistory', 'references'] },
  { key: 'documents', title: 'Documents & FICA', groups: [], recordBacked: true },
  { key: 'review', title: 'Review & declarations', groups: [], recordBacked: true },
])
export const RENTAL_APPLICATION_CURRENT_SECTIONS = Object.freeze(
  RENTAL_APPLICATION_FIELD_GROUPS.filter((group) => group.fields.some((item) => item.current)).map((group) => Object.freeze({ key: group.key, title: group.title, fields: group.fields.filter((item) => item.current).map((item) => [item.key, item.label, item.type]) })),
)
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const text = (value) => String(value ?? '').trim()
const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor'])
function clone(value) {
  if (Array.isArray(value)) return value.map(clone)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !unsafeKeys.has(key)).map(([key, item]) => [key, clone(item)]))
  return value
}
export function mergeRentalApplicationData(current = {}, patch = {}, { source = 'agent' } = {}) {
  const result = clone(object(current))
  for (const [key, value] of Object.entries(object(patch))) {
    if (unsafeKeys.has(key)) continue
    const group = RENTAL_APPLICATION_FIELD_GROUPS.find((item) => item.key === key)
    if (source === 'applicant') {
      if (['schemaVersion', 'profileReference', 'onboarding'].includes(key) || group?.readOnly) continue
      if (!group) throw new Error(`Application section ${key} is not applicant-editable.`)
    }
    if (group && (group.collection ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value))) throw new Error(`${group.title} must be ${group.collection ? 'a list' : 'an object'}.`)
    if (group) {
      const entries = group.collection ? value : [value]
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`${group.title} entries must be objects.`)
        for (const item of group.fields) {
          const captured = entry[item.key]
          if (captured != null && typeof captured === 'object') throw new Error(`${item.label} must be a single value.`)
          if (item.type === 'boolean' && captured != null && captured !== '' && typeof captured !== 'boolean') throw new Error(`${item.label} must be Yes or No.`)
        }
      }
    }
    const next = source === 'applicant' ? projectGroup(group, value) : clone(value)
    result[key] = next && typeof next === 'object' && !Array.isArray(next) ? { ...object(result[key]), ...next } : next
  }
  return result
}
function projectGroup(group, value) {
  const project = (item) => Object.fromEntries(group.fields.filter(({ key }) => Object.hasOwn(object(item), key)).map(({ key }) => [key, clone(item[key])]))
  return group.collection ? (Array.isArray(value) ? value.map(project) : []) : project(value)
}
export function extractReusableRentalTenantProfile(data = {}) {
  return Object.fromEntries(RENTAL_APPLICATION_FIELD_GROUPS.filter((group) => group.scope === 'profile' && Object.hasOwn(data, group.key)).map((group) => [group.key, projectGroup(group, data[group.key])]))
}
export function prefillRentalApplicationFromProfile(profile = {}, applicationData = {}) {
  // Only identity/entity/contact details are reused. A prior rent, income,
  // decision, invitation, consent or document verification is never carried over.
  return mergeRentalApplicationData(extractReusableRentalTenantProfile(profile), applicationData)
}
export function publicRentalApplicationData(data = {}) {
  return { ...(data.schemaVersion === RENTAL_APPLICATION_SCHEMA_VERSION ? { schemaVersion: data.schemaVersion } : {}), ...Object.fromEntries(RENTAL_APPLICATION_FIELD_GROUPS.filter((group) => Object.hasOwn(data, group.key)).map((group) => [group.key, projectGroup(group, data[group.key])])) }
}
export function validateRentalApplicationFields(data = {}, { fullSetup = data.schemaVersion === RENTAL_APPLICATION_SCHEMA_VERSION } = {}) {
  const errors = []
  const people = Array.isArray(data.people) ? data.people : []
  const missing = (path, label) => { if (!text(path)) errors.push(`${label} is required.`) }
  missing(data.identity?.firstName, 'First name'); missing(data.identity?.lastName, 'Last name')
  if (!text(data.identity?.email) && !text(data.identity?.phone)) errors.push('Email or phone is required.')
  const legalEntity = fullSetup && ['company', 'close_corporation', 'trust'].includes(data.entity?.type)
  if (!legalEntity) missing(data.employment?.employmentType, 'Employment type')
  const supportingIncome = fullSetup && people.some((person) => (person.role === 'guarantor' || person.contributesToAffordability === true) && (Number(person.monthlyIncome) > 0 || Number(person.otherIncome) > 0))
  if (!(Number(data.income?.monthlyIncome) > 0 || Number(data.income?.otherIncome) > 0 || supportingIncome)) errors.push('An income source with a positive monthly amount is required.')
  missing(data.rentalHistory?.currentAddress, 'Current address'); missing(data.rentalHistory?.reasonForMoving, 'Reason for moving')
  if (fullSetup) {
    const type = data.entity?.type
    if (!RENTAL_TENANT_ENTITY_TYPES.includes(type)) errors.push('Choose a tenant entity type.')
    if (['company', 'close_corporation', 'trust'].includes(type)) {
      missing(data.entity?.legalName, 'Registered name'); missing(data.entity?.registrationNumber, 'Registration number')
      if (!['authorised_signatory', 'trustee'].includes(data.entity?.primaryContactRole) && !people.some((person) => ['authorised_signatory', 'trustee'].includes(person?.role))) errors.push('An authorised representative is required.')
    }
    if (type === 'joint_individuals' && !people.some((person) => person?.role === 'co_tenant')) errors.push('A joint application needs another tenant.')
    if (data.household?.guarantorRequired === true && !people.some((person) => person?.role === 'guarantor')) errors.push('Add the guarantor.')
    if (new Set(people.map((person) => person?.id)).size !== people.length) errors.push('Additional people must have unique references.')
    for (const person of people) {
      if (['primary', 'entity'].includes(person?.id)) errors.push('Additional people need their own unique references.')
      if (!text(person?.id) || !RENTAL_APPLICANT_ROLES.includes(person?.role) || !text(person?.firstName) || !text(person?.lastName)) errors.push('Each additional person needs a reference, role and full name.')
    }
    if (!text(data.identity?.identityNumber)) errors.push('ID / passport number is required.')
    if (legalEntity) missing(data.income?.incomeSource, 'Entity income source')
    if (!legalEntity && !RENTAL_EMPLOYMENT_TYPES.includes(data.employment?.employmentType)) errors.push('Choose a supported employment type.')
    if (!legalEntity && data.employment?.employmentType === 'employed') missing(data.employment?.employer, 'Employer')
    if (!legalEntity && data.employment?.employmentType === 'self_employed') missing(data.employment?.businessName, 'Business name')
    if (!legalEntity && ['student', 'retired', 'unemployed', 'other'].includes(data.employment?.employmentType)) missing(data.employment?.incomeSource, 'Income source')
    if (!Number.isInteger(Number(data.household?.occupantCount)) || Number(data.household?.occupantCount) < 1) errors.push('At least one occupant is required.')
    missing(data.household?.intendedOccupationDate, 'Intended move date')
  }
  for (const group of RENTAL_APPLICATION_FIELD_GROUPS) {
    for (const item of group.fields) {
      if (!['number', 'email', 'date'].includes(item.type)) continue
      const records = group.collection ? (Array.isArray(data[group.key]) ? data[group.key] : []) : [object(data[group.key])]
      for (const record of records) {
        const value = record?.[item.key]
        if (item.type === 'email' && text(value) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value))) errors.push(`${item.label} must be a valid email address.`)
        if (item.type === 'date' && text(value) && (!/^\d{4}-\d{2}-\d{2}$/.test(text(value)) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) errors.push(`${item.label} must be a valid date.`)
        if (item.type === 'number' && value !== '' && value != null && (typeof value === 'boolean' || !Number.isFinite(Number(value)) || Number(value) < 0)) errors.push(`${item.label} must be zero or more.`)
      }
    }
  }
  return [...new Set(errors)]
}
