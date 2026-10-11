import { createListingSellerProfileBuilderDraft, getListingSellerFormData } from '../../lib/listingSellerProfileBuilderModel.js'
import { resolveListingSellerAuthorityContract, getSellerProfileAuthorityContract } from '../../lib/sellerPartyAuthorityContract.js'

export const LISTING_SELLER_INFORMATION_MODEL_VERSION = 'seller_profile_current_v1'

function clean(value) {
  return String(value ?? '').trim()
}

function fullName(person = {}) {
  return clean(person.fullName || person.full_name || [person.name || person.firstName || person.first_name, person.surname || person.lastName || person.last_name].filter(Boolean).join(' '))
}

export function sellerProfileDisplayValue(value) {
  if (value === false) return 'No'
  if (value === true) return 'Yes'
  return clean(value) || 'Not captured'
}

function compactRows(rows = []) {
  return rows
    .filter((row) => row.always || clean(row.value))
    .map((row) => Object.freeze({ key: row.key, label: row.label, value: row.value, displayValue: sellerProfileDisplayValue(row.value) }))
}

function group(key, title, rows) {
  const compacted = compactRows(rows)
  return compacted.length ? Object.freeze({ key, title, rows: Object.freeze(compacted) }) : null
}

function peopleRows(people = [], noun = 'Person') {
  return (Array.isArray(people) ? people : []).flatMap((person, index) => {
    const name = fullName(person)
    const personKey = person.sourcePersonId || person.id || `legacy-${index}`
    return compactRows([
      { key: `${personKey}:name`, label: `${noun} ${index + 1}`, value: name, always: true },
      { key: `${personKey}:role`, label: 'Role / capacity', value: person.role || person.capacity },
      { key: `${personKey}:id`, label: 'ID / passport', value: person.idNumber || person.id_number },
      { key: `${personKey}:email`, label: 'Email', value: person.email },
      { key: `${personKey}:phone`, label: 'Phone', value: person.phone },
      { key: `${personKey}:nationality`, label: 'Nationality', value: person.nationality },
      { key: `${personKey}:address`, label: 'Residential address', value: person.residentialAddress },
      { key: `${personKey}:birth`, label: 'Date of birth', value: person.dateOfBirth },
      { key: `${personKey}:tax`, label: 'Income tax number', value: person.incomeTaxNumber },
      { key: `${personKey}:saResident`, label: 'SA resident', value: person.saResident },
      { key: `${personKey}:taxResident`, label: 'Tax resident', value: person.taxResident },
      { key: `${personKey}:spouseName`, label: 'Spouse', value: person.spouse?.fullName || person.spouse?.full_name || person.spouse?.name },
      { key: `${personKey}:spouseId`, label: 'Spouse ID / passport', value: person.spouse?.idNumber || person.spouse?.id_number },
      { key: `${personKey}:spouseEmail`, label: 'Spouse email', value: person.spouse?.email },
      { key: `${personKey}:spousePhone`, label: 'Spouse phone', value: person.spouse?.phone },
      { key: `${personKey}:marital`, label: 'Marital status', value: person.maritalStatus },
      { key: `${personKey}:regime`, label: 'Marriage regime', value: person.maritalRegime },
      { key: `${personKey}:share`, label: 'Ownership share', value: person.ownershipShare },
      { key: `${personKey}:authority`, label: 'Authority details', value: person.controlBasis },
    ])
  })
}

export function buildListingSellerInformationModel(listing = {}) {
  const authority = resolveListingSellerAuthorityContract(listing)
  const draft = createListingSellerProfileBuilderDraft(listing)
  const saved = getListingSellerFormData(listing)
  const profileType = authority.profileType
  const profileLabel = getSellerProfileAuthorityContract(profileType).label
  const groups = []
  const ownerName = clean([draft.sellerFirstName, draft.sellerSurname].filter(Boolean).join(' '))

  if (['individual', 'married', 'foreign_individual'].includes(profileType)) {
    groups.push(group('individual', profileType === 'foreign_individual' ? 'Foreign individual details' : 'Individual details', [
      { key: 'name', label: 'Legal owner', value: ownerName, always: true },
      { key: 'id', label: profileType === 'foreign_individual' ? 'Passport number' : 'ID number', value: profileType === 'foreign_individual' ? draft.foreignPassportNumber || draft.idNumber : draft.idNumber, always: true },
      { key: 'marital', label: 'Marital status', value: draft.maritalStatus },
      { key: 'regime', label: 'Marriage regime', value: draft.maritalRegime },
      { key: 'dateOfBirth', label: 'Date of birth', value: draft.dateOfBirth },
      { key: 'nationality', label: 'Nationality', value: draft.nationality },
      { key: 'residentialAddress', label: 'Residential address', value: draft.residentialAddress },
      { key: 'country', label: 'Country / jurisdiction', value: draft.foreignOwnerCountry },
      { key: 'residency', label: 'Residency status', value: draft.foreignResidencyStatus },
    ]))
    if (profileType === 'married' || draft.spouseName || draft.spouseEmail || draft.spouseIdNumber) {
      groups.push(group('spouse', 'Spouse details', [
        { key: 'spouseName', label: 'Spouse', value: draft.spouseName, always: profileType === 'married' },
        { key: 'spouseId', label: 'ID number', value: draft.spouseIdNumber },
        { key: 'spouseEmail', label: 'Email', value: draft.spouseEmail },
        { key: 'spousePhone', label: 'Phone', value: draft.spousePhone },
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
    const beneficialOwners = peopleRows(draft.companyBeneficialOwners, 'Beneficial owner')
    if (beneficialOwners.length) groups.push(group('beneficialOwners', 'Beneficial owners', beneficialOwners))
    if (directorRows.length) groups.push(group('directors', profileType === 'close_corporation' ? 'Members' : 'Directors', directorRows))
    groups.push(group('authority', 'Signing authority', [
      { key: 'signatory', label: 'Authorised signatory', value: draft.authorisedSignatoryName, always: true },
      { key: 'capacity', label: 'Capacity', value: draft.authorisedSignatoryCapacity },
      { key: 'email', label: 'Email', value: draft.authorisedSignatoryEmail },
      { key: 'authorisedSignatoryPhone', label: 'Phone', value: draft.authorisedSignatoryPhone },
      { key: 'authorisedSignatoryIdNumber', label: 'ID / passport', value: draft.authorisedSignatoryIdNumber },
      { key: 'authorisedSignatoryAddress', label: 'Residential address', value: draft.authorisedSignatoryAddress },
      { key: 'companyAuthorityBasis', label: 'Authority basis', value: draft.companyAuthorityBasis },
      { key: 'companyResolutionDate', label: 'Resolution date', value: draft.companyResolutionDate },
    ]))
  } else if (['trust', 'foreign_trust'].includes(profileType)) {
    groups.push(group('trust', 'Trust details', [
      { key: 'trustName', label: 'Trust name', value: draft.trustName, always: true },
      { key: 'trustRegistrationNumber', label: 'Registration number', value: draft.trustRegistrationNumber, always: true },
      { key: 'trustRegisteredAddress', label: 'Registered address', value: draft.trustRegisteredAddress, always: true },
      { key: 'foreignCountry', label: 'Country / jurisdiction', value: draft.foreignOwnerCountry },
    ]))
    groups.push(group('trustees', 'Trustees', peopleRows(draft.trustees, 'Trustee')))
    const founders = peopleRows(draft.trustFounders, 'Founder')
    if (founders.length) groups.push(group('founders', 'Founders', founders))
    const beneficiaryRows = peopleRows(draft.trustBeneficiaries, 'Beneficiary')
    if (beneficiaryRows.length) groups.push(group('beneficiaries', 'Beneficial owners', beneficiaryRows))
    groups.push(group('authority', 'Signing authority', [
      { key: 'trustee', label: 'Authorised trustee', value: draft.authorisedTrusteeName, always: true },
      { key: 'capacity', label: 'Capacity', value: draft.authorisedTrusteeCapacity },
      { key: 'email', label: 'Email', value: draft.authorisedTrusteeEmail },
      { key: 'authorisedTrusteePhone', label: 'Phone', value: draft.authorisedTrusteePhone },
      { key: 'authorisedTrusteeIdNumber', label: 'ID / passport', value: draft.authorisedTrusteeIdNumber },
      { key: 'authorisedTrusteeAddress', label: 'Residential address', value: draft.authorisedTrusteeAddress },
      { key: 'trustAuthorityBasis', label: 'Authority basis', value: draft.trustAuthorityBasis },
    ]))
  } else if (profileType === 'deceased_estate') {
    groups.push(group('estate', 'Deceased estate details', [
      { key: 'estateName', label: 'Estate name', value: draft.deceasedEstateName, always: true },
      { key: 'estateReference', label: 'Estate reference', value: draft.estateReferenceNumber, always: true },
      { key: 'executor', label: 'Executor', value: draft.executorName, always: true },
      { key: 'executorEmail', label: 'Executor email', value: draft.executorEmail },
      { key: 'executorPhone', label: 'Executor phone', value: draft.executorPhone },
      { key: 'executorAuthorityDetails', label: 'Authority details', value: draft.executorAuthorityDetails },
    ]))
    if (draft.executors.length) groups.push(group('executors', 'Executors', peopleRows(draft.executors, 'Executor')))
  } else if (profileType === 'power_of_attorney') {
    groups.push(group('poa', 'Power of attorney details', [
      { key: 'principal', label: 'Legal owner / principal', value: draft.powerOfAttorneyPrincipalName, always: true },
      { key: 'principalId', label: 'Principal ID number', value: draft.powerOfAttorneyPrincipalIdNumber },
      { key: 'representative', label: 'Authorised representative', value: draft.powerOfAttorneyName, always: true },
      { key: 'representativeEmail', label: 'Representative email', value: draft.powerOfAttorneyEmail },
      { key: 'powerOfAttorneyPhone', label: 'Representative phone', value: draft.powerOfAttorneyPhone },
      { key: 'powerOfAttorneyAuthorityDetails', label: 'Authority details', value: draft.powerOfAttorneyAuthorityDetails },
    ]))
    if (draft.powerOfAttorneyRepresentatives.length) groups.push(group('representatives', 'Representatives', peopleRows(draft.powerOfAttorneyRepresentatives, 'Representative')))
  } else {
    groups.push(group('other', 'Legal entity details', [
      { key: 'entityName', label: 'Entity / owner name', value: draft.otherEntityName || ownerName, always: true },
      { key: 'entityRegistration', label: 'Registration number', value: draft.otherEntityRegistrationNumber },
    ]))
  }

  groups.push(group('contact', 'Primary contact details', [
    { key: 'contactName', label: 'Contact', value: draft.primaryContactName, always: true },
    { key: 'email', label: 'Email', value: draft.email, always: true },
    { key: 'phone', label: 'Phone', value: draft.phone, always: true },
    { key: 'alternative', label: 'Alternative contact', value: draft.alternativeContact },
    { key: 'preference', label: 'Preferred contact', value: draft.preferredContactMethod },
  ]))

  groups.push(group('tax', 'Tax and residency details', [
    { key: 'incomeTaxNumber', label: 'Income tax number', value: draft.incomeTaxNumber },
    { key: 'saResident', label: 'SA resident', value: draft.saResident },
    { key: 'taxResident', label: 'Tax resident', value: draft.taxResident },
    { key: 'vatRegistered', label: 'VAT registered', value: draft.vatRegistered },
    { key: 'vatNumber', label: 'VAT number', value: draft.vatNumber },
    { key: 'occupation', label: 'Occupation', value: draft.occupation },
    { key: 'sourceOfFunds', label: 'Source of funds', value: draft.sourceOfFunds },
    { key: 'politicallyExposedPerson', label: 'Politically exposed person', value: draft.politicallyExposedPerson },
    { key: 'politicallyExposedDetails', label: 'Politically exposed details', value: draft.politicallyExposedDetails },
  ]))

  const bonded = clean(draft.bondStatus).toLowerCase() === 'bonded' || clean(draft.bondHolder) || clean(draft.outstandingBond)
  groups.push(group('property', 'Property and ownership details', [
    { key: 'address', label: 'Property address', value: draft.propertyAddress, always: true },
    { key: 'ownership', label: 'Owner structure', value: profileLabel, always: true },
    { key: 'titleDeed', label: 'Title deed number', value: draft.titleDeedNumber },
    { key: 'sectionNumber', label: 'Section number', value: draft.sectionNumber },
    { key: 'unitNumber', label: 'Unit number', value: draft.unitNumber },
    { key: 'bondStatus', label: 'Bond status', value: draft.bondStatus && draft.bondStatus !== 'unknown' ? draft.bondStatus : '' },
    { key: 'bondHolder', label: 'Bond holder', value: bonded ? draft.bondHolder : '' },
    { key: 'outstandingBond', label: 'Outstanding bond', value: bonded ? draft.outstandingBond : '' },
  ]))

  const rosters = profileType === 'multiple_owners' ? [draft.multipleOwners] : ['company', 'close_corporation', 'foreign_company'].includes(profileType) ? [draft.companyDirectors, draft.companyBeneficialOwners] : ['trust', 'foreign_trust'].includes(profileType) ? [draft.trustees, draft.trustFounders, draft.trustBeneficiaries] : profileType === 'deceased_estate' ? [draft.executors] : profileType === 'power_of_attorney' ? [draft.powerOfAttorneyRepresentatives] : []
  const requiresPersonReview = rosters.flat().some((person) => !person.sourcePersonId)

  return Object.freeze({
    version: LISTING_SELLER_INFORMATION_MODEL_VERSION,
    profileType,
    profileLabel,
    requiresPersonReview,
    groups: Object.freeze(groups.filter(Boolean).map((section) => Object.freeze({ ...section, rows: Object.freeze(section.rows.map((row) => {
      const field = { contactName: 'primaryContactName', name: 'sellerFirstName', id: 'idNumber', email: 'email', phone: 'phone', spouseId: 'spouseIdNumber', signatory: 'authorisedSignatoryName', trustee: 'authorisedTrusteeName' }[row.key] || row.key
      const state = clean(row.value) ? 'saved' : Object.hasOwn(saved, field) ? 'empty' : 'missing'
      return Object.freeze({ ...row, state, displayValue: state === 'empty' ? 'Not provided' : row.displayValue })
    })) }))),
    pendingReview: (Array.isArray(listing.sellerPendingChanges) ? listing.sellerPendingChanges : Array.isArray(listing.pendingSellerChanges) ? listing.pendingSellerChanges : []).some((change) => ['pending', 'proposed', 'pending_review'].includes(change.status)),
    draft,
  })
}

export default buildListingSellerInformationModel
