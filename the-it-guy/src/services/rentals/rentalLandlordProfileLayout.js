import { landlordProfileFields, landlordProfileErrors, resolvedLandlordType, landlordHasRepresentative } from './rentalLandlordProfileRules.js'
import { rentalLandlordSubmissionErrors } from './rentalLandlordOnboardingModel.js'
const text = value => String(value ?? '').trim()
export const LANDLORD_PROFILE_SECTIONS = [
  { id: 'contact', title: 'Landlord & contact', description: 'Ownership type and main contact details.', keys: ['type','legalStructure','otherEntityDescription','name','email','phone','residentialAddress','country'] },
  { id: 'identity', title: 'Identity & family', description: 'Personal identification and applicable spouse details.', keys: ['idNumber','nationality','maritalStatus','maritalRegime','spouseName','spouseIdNumber'] },
  { id: 'entity', title: 'Entity details', description: 'Registered entity or trust information.', keys: ['registrationNumber','tradingName'] },
  { id: 'tax', title: 'Tax & VAT', description: 'Tax details, where applicable.', keys: ['taxNumber','vatRegistered','vatNumber'] },
  { id: 'people', title: 'Owners & representatives', description: 'Record each owner, director, member, trustee or other relevant person.', keys: ['people'] },
  { id: 'signing', title: 'Signatories & authority', description: 'Choose who can sign and record their authority.', keys: ['hasRepresentative','primarySignatoryId','authorisedSignatoryName','authorisedSignatoryCapacity','authorisedSignatoryIdNumber','authorisedSignatoryNationality','authorisedSignatoryEmail','authorisedSignatoryPhone','authorityBasis','resolutionDate'] },
  { id: 'notes', title: 'Internal notes', description: 'Visible to the agency team.', keys: ['notes'] },
]
function issueSection(message) {
  if (/signatory|signing|signer|resolution|authorised to sign|someone else authorised/.test(message.toLowerCase())) return 'signing'
  if (/each person|relevant people|owner.*share|shares|record each owner|record the relevant|ownership share/.test(message.toLowerCase())) return 'people'
  if (/marital|spouse|landlord’s id/.test(message.toLowerCase())) return 'identity'
  if (/entity or trust registration/.test(message.toLowerCase())) return 'entity'
  if (/vat/.test(message.toLowerCase())) return 'tax'
  if (/each property/.test(message.toLowerCase())) return 'property'
  return 'contact'
}
export function landlordPersonComplete(profile, person) {
  const errors = landlordProfileErrors({ ...profile, people: [person] }, { phase: 'submission' })
  if (errors.some(message => /each person|valid email for each person|shares must be between/.test(message))) return false
  return resolvedLandlordType(profile) !== 'multiple_owners' || !!text(person.ownershipShare)
}
export function landlordProfileCompletion(profile, { publicSource = false, portfolio } = {}) {
  const fields = landlordProfileFields(profile, { publicSource })
  const errors = portfolio === undefined ? landlordProfileErrors(profile, { phase: 'submission' }) : rentalLandlordSubmissionErrors({ profile, portfolio })
  const sections = LANDLORD_PROFILE_SECTIONS.map(section => {
    const activeFields = fields.filter(([key]) => section.keys.includes(key))
    const messages = errors.filter(message => issueSection(message) === section.id)
    const visible = section.id === 'people' || section.id === 'contact' || section.id === 'signing' || activeFields.length > 0
    const filled = section.id === 'people' ? (profile.people || []).length : activeFields.filter(([key]) => text(profile[key])).length
    return { ...section, fields: activeFields, messages, visible, status: messages.length ? 'incomplete' : (!filled && ['tax','notes','people'].includes(section.id) || section.id === 'signing' && !landlordHasRepresentative(profile) && !(profile.people || []).some(person => person.signingAuthority)) ? 'optional' : 'complete' }
  }).filter(section => section.visible)
  return { sections, errors, profileComplete: errors.every(message => issueSection(message) === 'property'), complete: errors.length === 0, completeSections: sections.filter(section => section.status !== 'incomplete').length }
}
