import { createListingSellerProfileBuilderDraft } from '../../lib/listingSellerProfileBuilderModel.js'
import { resolveListingSellerAuthorityContract } from '../../lib/sellerPartyAuthorityContract.js'

export const LISTING_SELLER_INFORMATION_MODEL_VERSION = 'listing_seller_information_phase4_v1'

function clean(value) {
  return String(value ?? '').trim()
}

function fullName(person = {}) {
  return clean(person.fullName || person.full_name || [person.name || person.firstName || person.first_name, person.surname || person.lastName || person.last_name].filter(Boolean).join(' '))
}

function compactRows(rows = []) {
  return rows
    .filter((row) => row.always || clean(row.value))
    .map(({ always: _always, ...row }) => Object.freeze(row))
}

function group(key, title, rows) {
  const compacted = compactRows(rows)
  return compacted.length ? Object.freeze({ key, title, rows: Object.freeze(compacted) }) : null
}

function peopleRows(people = [], noun = 'Person') {
  return (Array.isArray(people) ? people : []).flatMap((person, index) => {
    const name = fullName(person)
    return compactRows([
      { key: `${index}:name`, label: `${noun} ${index + 1}`, value: name, always: true },
      { key: `${index}:role`, label: 'Role / capacity', value: person.role || person.capacity },
      { key: `${index}:id`, label: 'ID / passport', value: person.idNumber || person.id_number },
      { key: `${index}:email`, label: 'Email', value: person.email },
      { key: `${index}:phone`, label: 'Phone', value: person.phone },
    ])
  })
}

export function buildListingSellerInformationModel(listing = {}) {
  const authority = resolveListingSellerAuthorityContract(listing)
  const draft = createListingSellerProfileBuilderDraft(listing)
  const profileType = authority.profileType
  const groups = []
  const ownerName = clean([draft.sellerFirstName, draft.sellerSurname].filter(Boolean).join(' '))

  if (['individual', 'married', 'foreign_individual'].includes(profileType)) {
    groups.push(group('individual', profileType === 'foreign_individual' ? 'Foreign individual details' : 'Individual details', [
      { key: 'name', label: 'Legal owner', value: ownerName, always: true },
      { key: 'id', label: profileType === 'foreign_individual' ? 'Passport number' : 'ID number', value: profileType === 'foreign_individual' ? draft.foreignPassportNumber || draft.idNumber : draft.idNumber, always: true },
      { key: 'marital', label: 'Marital status', value: draft.maritalStatus },
      { key: 'country', label: 'Country / jurisdiction', value: draft.foreignOwnerCountry },
      { key: 'residency', label: 'Residency status', value: draft.foreignResidencyStatus },
    ]))
    if (profileType === 'married' || draft.spouseName || draft.spouseEmail || draft.spouseIdNumber) {
      groups.push(group('spouse', 'Spouse details', [
        { key: 'spouseName', label: 'Spouse', value: draft.spouseName, always: profileType === 'married' },
        { key: 'spouseId', label: 'ID number', value: draft.spouseIdNumber },
        { key: 'spouseEmail', label: 'Email', value: draft.spouseEmail },
      ]))
    }
  } else if (profileType === 'multiple_owners') {
    groups.push(group('owners', 'Legal owners', peopleRows(draft.multipleOwners, 'Owner')))
  } else if (['company', 'close_corporation', 'foreign_company'].includes(profileType)) {
    groups.push(group('company', profileType === 'close_corporation' ? 'Close corporation details' : 'Company details', [
      { key: 'companyName', label: 'Registered name', value: draft.companyName, always: true },
      { key: 'companyRegistrationNumber', label: 'Registration number', value: draft.companyRegistrationNumber, always: true },
      { key: 'companyRegisteredAddress', label: 'Registered address', value: draft.companyRegisteredAddress, always: true },
      { key: 'foreignCountry', label: 'Country / jurisdiction', value: draft.foreignOwnerCountry },
      { key: 'foreignRegistration', label: 'Foreign registration', value: draft.foreignRegistrationNumber },
    ]))
    const directorRows = peopleRows(draft.companyDirectors, profileType === 'close_corporation' ? 'Member' : 'Director')
    if (directorRows.length) groups.push(group('directors', profileType === 'close_corporation' ? 'Members' : 'Directors', directorRows))
    groups.push(group('authority', 'Signing authority', [
      { key: 'signatory', label: 'Authorised signatory', value: draft.authorisedSignatoryName, always: true },
      { key: 'capacity', label: 'Capacity', value: draft.authorisedSignatoryCapacity },
      { key: 'email', label: 'Email', value: draft.authorisedSignatoryEmail },
    ]))
  } else if (['trust', 'foreign_trust'].includes(profileType)) {
    groups.push(group('trust', 'Trust details', [
      { key: 'trustName', label: 'Trust name', value: draft.trustName, always: true },
      { key: 'trustRegistrationNumber', label: 'Registration number', value: draft.trustRegistrationNumber, always: true },
      { key: 'trustRegisteredAddress', label: 'Registered address', value: draft.trustRegisteredAddress, always: true },
      { key: 'foreignCountry', label: 'Country / jurisdiction', value: draft.foreignOwnerCountry },
    ]))
    groups.push(group('trustees', 'Trustees', peopleRows(draft.trustees, 'Trustee')))
    const beneficiaryRows = peopleRows(draft.trustBeneficiaries, 'Beneficiary')
    if (beneficiaryRows.length) groups.push(group('beneficiaries', 'Beneficial owners', beneficiaryRows))
    groups.push(group('authority', 'Signing authority', [
      { key: 'trustee', label: 'Authorised trustee', value: draft.authorisedTrusteeName, always: true },
      { key: 'capacity', label: 'Capacity', value: draft.authorisedTrusteeCapacity },
      { key: 'email', label: 'Email', value: draft.authorisedTrusteeEmail },
    ]))
  } else if (profileType === 'deceased_estate') {
    groups.push(group('estate', 'Deceased estate details', [
      { key: 'estateName', label: 'Estate name', value: draft.deceasedEstateName, always: true },
      { key: 'estateReference', label: 'Estate reference', value: draft.estateReferenceNumber, always: true },
      { key: 'executor', label: 'Executor', value: draft.executorName, always: true },
      { key: 'executorEmail', label: 'Executor email', value: draft.executorEmail },
    ]))
  } else if (profileType === 'power_of_attorney') {
    groups.push(group('poa', 'Power of attorney details', [
      { key: 'principal', label: 'Legal owner / principal', value: draft.powerOfAttorneyPrincipalName, always: true },
      { key: 'principalId', label: 'Principal ID number', value: draft.powerOfAttorneyPrincipalIdNumber },
      { key: 'representative', label: 'Authorised representative', value: draft.powerOfAttorneyName, always: true },
      { key: 'representativeEmail', label: 'Representative email', value: draft.powerOfAttorneyEmail },
    ]))
  } else {
    groups.push(group('other', 'Legal entity details', [
      { key: 'entityName', label: 'Entity / owner name', value: draft.otherEntityName || ownerName, always: true },
      { key: 'entityRegistration', label: 'Registration number', value: draft.otherEntityRegistrationNumber },
    ]))
  }

  groups.push(group('contact', 'Primary contact details', [
    { key: 'contactName', label: 'Contact', value: ownerName || draft.authorisedSignatoryName || draft.authorisedTrusteeName || draft.executorName || draft.powerOfAttorneyName, always: true },
    { key: 'email', label: 'Email', value: draft.email, always: true },
    { key: 'phone', label: 'Phone', value: draft.phone, always: true },
    { key: 'alternative', label: 'Alternative contact', value: draft.alternativeContact },
    { key: 'preference', label: 'Preferred contact', value: draft.preferredContactMethod },
  ]))

  const bonded = clean(draft.bondStatus).toLowerCase() === 'bonded' || clean(draft.bondHolder) || clean(draft.outstandingBond)
  groups.push(group('property', 'Property and ownership details', [
    { key: 'address', label: 'Property address', value: draft.propertyAddress, always: true },
    { key: 'ownership', label: 'Owner structure', value: authority.label, always: true },
    { key: 'titleDeed', label: 'Title deed number', value: draft.titleDeedNumber },
    { key: 'bondStatus', label: 'Bond status', value: draft.bondStatus && draft.bondStatus !== 'unknown' ? draft.bondStatus : '' },
    { key: 'bondHolder', label: 'Bond holder', value: bonded ? draft.bondHolder : '' },
    { key: 'outstandingBond', label: 'Outstanding bond', value: bonded ? draft.outstandingBond : '' },
  ]))

  return Object.freeze({
    version: LISTING_SELLER_INFORMATION_MODEL_VERSION,
    profileType,
    profileLabel: authority.label,
    groups: Object.freeze(groups.filter(Boolean)),
    draft,
  })
}

export default buildListingSellerInformationModel
