import { landlordSelectedSignatoryErrors } from './rentalLandlordSignatories.js'
// The agent, landlord portal and listing editor share these capture rules.
// These are onboarding completion rules, not a substitute for the agency RMCP.
export const LANDLORD_TYPES = [
  ['individual', 'Individual'], ['company', 'Company'], ['trust', 'Trust'],
  ['close_corporation', 'Close corporation'], ['multiple_owners', 'Multiple owners'],
  ['foreign_owner', 'Foreign owner'], ['other_entity', 'Other entity'],
]
export const LANDLORD_LEGAL_STRUCTURES = LANDLORD_TYPES.slice(0, 5)
const yesNo = [['yes', 'Yes'], ['no', 'No']]
export const PROFILE_FIELDS = [
  ['legalStructure', 'Legal structure', [...LANDLORD_LEGAL_STRUCTURES, ['unresolved', 'Needs agent review']]],
  ['otherEntityDescription', 'Describe the entity or ownership arrangement'],
  ['name', 'Full name / entity name'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'],
  ['residentialAddress', 'Residential / registered address'],
  ['idNumber', 'ID / passport number'], ['nationality', 'Nationality'], ['taxNumber', 'Tax number'],
  ['maritalStatus', 'Marital status', [['single', 'Single'], ['married', 'Married'], ['divorced', 'Divorced'], ['widowed', 'Widowed'], ['other', 'Other / prefer not to say']]],
  ['maritalRegime', 'Marital regime', [['in_community', 'In community of property'], ['out_of_community', 'Out of community of property'], ['foreign', 'Foreign marriage regime'], ['unknown', 'To be confirmed']]],
  ['spouseName', 'Spouse name'], ['spouseIdNumber', 'Spouse ID / passport number'],
  ['registrationNumber', 'Company / trust registration number'], ['tradingName', 'Trading name'],
  ['country', 'Country of registration / residence'],
  ['vatRegistered', 'VAT registered?', yesNo], ['vatNumber', 'VAT number'],
  ['hasRepresentative', 'Someone else authorised to sign?', yesNo],
  ['authorisedSignatoryName', 'Authorised signatory'], ['authorisedSignatoryCapacity', 'Signing capacity'],
  ['authorisedSignatoryIdNumber', 'Signatory ID / passport number'], ['authorisedSignatoryNationality', 'Signatory nationality'],
  ['authorisedSignatoryEmail', 'Signatory email', 'email'], ['authorisedSignatoryPhone', 'Signatory phone', 'tel'],
  ['authorityBasis', 'Authority / resolution reference'], ['resolutionDate', 'Resolution date', 'date'],
  ['notes', 'Notes', 'textarea'],
]
export const PERSON_FIELDS = [
  ['name', 'Full name'], ['email', 'Email', 'email'], ['phone', 'Phone', 'tel'],
  ['idNumber', 'ID / passport number'], ['nationality', 'Nationality'], ['residentialAddress', 'Residential address'],
  ['ownershipShare', 'Ownership share (%)', 'number'], ['capacity', 'Capacity / role'],
]
export const LANDLORD_PUBLIC_PROFILE_FIELDS = ['type', 'primarySignatoryId', ...PROFILE_FIELDS.map(([key]) => key).filter(key => key !== 'notes')]
export const LANDLORD_PUBLIC_PERSON_FIELDS = ['id', ...PERSON_FIELDS.map(([key]) => key), 'role', 'signingAuthority']
export const LANDLORD_DRAFT_HELP = 'Drafts need a name and email or phone to link the landlord profile. Identity, ownership and signing details can be completed before submission.'
const text = value => String(value ?? '').trim()
const entities = ['company', 'close_corporation', 'trust']
export function resolvedLandlordType(profile = {}) {
  const type = ['foreign_owner', 'other_entity'].includes(profile.type) ? profile.legalStructure : profile.type
  return LANDLORD_LEGAL_STRUCTURES.some(([key]) => key === type) ? type : ''
}
export function landlordHasRepresentative(profile = {}) {
  return entities.includes(resolvedLandlordType(profile)) || profile.hasRepresentative === 'yes' || (!text(profile.hasRepresentative) && !!text(profile.authorisedSignatoryName))
}
export function landlordIsMarried(profile = {}) {
  return text(profile.maritalStatus).toLowerCase() === 'married'
}
export function landlordProfileFieldVisible(key, profile = {}) {
  const type = resolvedLandlordType(profile)
  if (key === 'legalStructure') return ['foreign_owner', 'other_entity'].includes(profile.type)
  if (key === 'otherEntityDescription') return profile.type === 'other_entity'
  if (['idNumber', 'nationality', 'maritalStatus'].includes(key)) return type === 'individual'
  if (key === 'maritalRegime') return type === 'individual' && landlordIsMarried(profile)
  if (['spouseName', 'spouseIdNumber'].includes(key)) return type === 'individual' && landlordIsMarried(profile) && profile.maritalRegime === 'in_community'
  if (['registrationNumber', 'tradingName'].includes(key)) return entities.includes(type)
  if (key === 'vatNumber') return profile.vatRegistered === 'yes' || (!text(profile.vatRegistered) && !!text(profile.vatNumber))
  if (key === 'hasRepresentative') return !!type && !entities.includes(type)
  if (key.startsWith('authorisedSignatory') || ['authorityBasis', 'resolutionDate'].includes(key)) return landlordHasRepresentative(profile)
  return true
}
export function landlordProfileFields(profile, { publicSource = false } = {}) {
  return PROFILE_FIELDS.filter(([key]) => (!publicSource || key !== 'notes') && landlordProfileFieldVisible(key, profile))
}
export function landlordPersonFields(profile) {
  return PERSON_FIELDS.filter(([key]) => key !== 'ownershipShare' || ['multiple_owners', 'company', 'close_corporation'].includes(resolvedLandlordType(profile)))
}
export function landlordPeopleRole(profile) {
  return { company: 'Director', trust: 'Trustee', close_corporation: 'Member', multiple_owners: 'Owner' }[resolvedLandlordType(profile)] || 'Representative'
}
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number(value.slice(0, 4)) > 0 && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
export function landlordProfileErrors(profile = {}, { phase = 'draft' } = {}) {
  const errors = []
  const submit = phase === 'submission'
  const type = resolvedLandlordType(profile)
  if (!LANDLORD_TYPES.some(([key]) => key === profile.type)) errors.push('Choose a supported landlord type.')
  if (!text(profile.name)) errors.push('Landlord or entity name is required.')
  if (!text(profile.email) && !text(profile.phone)) errors.push('Add a landlord email or phone number.')
  for (const [key, label, input] of landlordProfileFields(profile)) {
    const value = text(profile[key])
    if (input === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push(`Enter a valid ${label.toLowerCase()}.`)
    if (input === 'date' && value && !validDate(value)) errors.push(`Enter a valid ${label.toLowerCase()}.`)
    // Preserve legacy free-text marital answers in drafts; resolve them before submission.
    if (Array.isArray(input) && value && !input.some(([id]) => id === value) && (submit || !['maritalStatus', 'maritalRegime'].includes(key))) errors.push(`Choose a valid ${label.toLowerCase()}.`)
  }
  const people = Array.isArray(profile.people) ? profile.people : []
  if (profile.people != null && !Array.isArray(profile.people)) errors.push('Choose a valid list of relevant people.')
  for (const person of people) {
    if (text(person.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(person.email))) errors.push('Enter a valid email for each person.')
    if (landlordPersonFields(profile).some(([key]) => key === 'ownershipShare') && text(person.ownershipShare) && (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text(person.ownershipShare)) || !Number.isFinite(Number(person.ownershipShare)) || Number(person.ownershipShare) < 0 || Number(person.ownershipShare) > 100)) errors.push('Ownership shares must be between 0 and 100%.')
    if (person.signingAuthority != null && typeof person.signingAuthority !== 'boolean') errors.push('Choose whether each person is authorised to sign.')
  }
  if (landlordHasRepresentative(profile)) errors.push(...landlordSelectedSignatoryErrors(profile))
  if (!submit) return [...new Set(errors)]
  if (!type) errors.push('Choose the underlying legal structure, or ask your agent to resolve it before submission.')
  if (profile.type === 'foreign_owner' && !text(profile.country)) errors.push('Enter the foreign owner’s country of registration or residence.')
  if (profile.type === 'other_entity' && !text(profile.otherEntityDescription)) errors.push('Describe the other entity or ownership arrangement.')
  if (!text(profile.residentialAddress)) errors.push('Enter the landlord’s residential or registered address.')
  if (type === 'individual' && !text(profile.idNumber)) errors.push('Enter the landlord’s ID or passport number.')
  if (type === 'individual' && landlordIsMarried(profile)) {
    if (!text(profile.maritalRegime) || profile.maritalRegime === 'unknown') errors.push('Confirm the marital regime before submission.')
    if (profile.maritalRegime === 'in_community' && (!text(profile.spouseName) || !text(profile.spouseIdNumber))) errors.push('Complete the spouse name and ID or passport number.')
  }
  if (profile.vatRegistered === 'yes' && !text(profile.vatNumber)) errors.push('Enter the VAT number, or confirm the landlord is not VAT registered.')
  if (entities.includes(type) && !text(profile.registrationNumber)) errors.push('Enter the entity or trust registration number.')
  if (landlordHasRepresentative(profile)) {
    if (['authorisedSignatoryName', 'authorisedSignatoryCapacity', 'authorisedSignatoryIdNumber', 'authorityBasis'].some(key => !text(profile[key]))) errors.push('Complete the signatory name, capacity, ID or passport and authority reference.')
    if (!text(profile.authorisedSignatoryEmail) && !text(profile.authorisedSignatoryPhone)) errors.push('Add a signatory email or phone number.')
  }
  if ((entities.includes(type) && !people.length) || (type === 'multiple_owners' && people.length < 2)) errors.push(type === 'multiple_owners' ? 'Record each owner, including the primary owner (at least two owners).' : 'Record the relevant directors, members or trustees and ownership/control parties.')
  for (const person of people) {
    if (['name', 'idNumber', 'residentialAddress'].some(key => !text(person[key])) || (!text(person.role) && !text(person.capacity))) errors.push('Complete each person’s name, role, ID or passport and residential address, or remove their card.')
  }
  if (type === 'multiple_owners' && people.length >= 2) {
    if (people.some(person => !text(person.ownershipShare))) errors.push('Enter each owner’s ownership share.')
    else if (Math.abs(people.reduce((sum, person) => sum + Number(person.ownershipShare), 0) - 100) > 0.001) errors.push('The owners’ shares must total 100%.')
    if (!people.some(person => person.signingAuthority === true) && !landlordHasRepresentative(profile)) errors.push('Confirm an authorised signer for the multiple owners.')
  }
  return [...new Set(errors)]
}
