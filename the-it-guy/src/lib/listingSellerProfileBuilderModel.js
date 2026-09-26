import {
  buildSellerEntityProfileAliases,
  buildSellerProfileCanonicalPayload,
  createBlankSellerProfilePersonRecord,
  normalizePersonCollectionForSellerProfile,
} from './sellerProfileCaptureModel.js'
import { normalizeSellerEntityType } from './sellerEntityModel.js'
import {
  getPropertyStructureTypesByCategory,
  getPropertyTypeOptionsByCategory,
  normalizePropertyCategory,
  normalizePropertyStructureType,
} from './propertyTaxonomy.js'
import { resolveListingSellerAuthorityContract } from './sellerPartyAuthorityContract.js'
import {
  LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION as SELLER_REQUIREMENT_RETIREMENT_VERSION,
  getSellerRequirementProfile,
  syncSellerDocumentRequirements,
} from './privateListingRequirementEngine.js'

export const LISTING_SELLER_PROFILE_BUILDER_VERSION = 'listing_seller_profile_builder_phase2_v1'
export const LISTING_SELLER_PROFILE_CAPTURE_SOURCE = 'listing_seller_profile_capture'
export const LISTING_SELLER_REQUIREMENT_PROJECTION_VERSION = 'listing_seller_requirement_projection_phase3_v1'
export const LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION = SELLER_REQUIREMENT_RETIREMENT_VERSION

export const LISTING_SELLER_PROFILE_BRANCHES = [
  { value: '', label: 'Not identified yet' },
  { value: 'individual', label: 'Individual' },
  { value: 'married', label: 'Married Individual' },
  { value: 'multiple_owners', label: 'Multiple Owners' },
  { value: 'company', label: 'Company / CC' },
  { value: 'trust', label: 'Trust' },
  { value: 'deceased_estate', label: 'Deceased Estate' },
  { value: 'power_of_attorney', label: 'Power of Attorney' },
  { value: 'other', label: 'Other Legal Entity' },
  { value: 'foreign_individual', label: 'Foreign Individual' },
  { value: 'foreign_company', label: 'Foreign Company' },
  { value: 'foreign_trust', label: 'Foreign Trust' },
]

const BRANCH_VALUES = new Set(LISTING_SELLER_PROFILE_BRANCHES.map((item) => item.value))

const BRANCH_DETAIL_FIELDS = Object.freeze({
  married: ['spouseName', 'spouseEmail', 'spouseIdNumber'],
  multiple_owners: ['multipleOwners', 'coOwnerDetails'],
  company: ['companyName', 'companyRegistrationNumber', 'companyRegisteredAddress', 'companyDirectors', 'authorisedSignatoryName', 'authorisedSignatoryCapacity', 'authorisedSignatoryEmail'],
  trust: ['trustName', 'trustRegistrationNumber', 'trustRegisteredAddress', 'trustees', 'trustBeneficiaries', 'authorisedTrusteeName', 'authorisedTrusteeCapacity', 'authorisedTrusteeEmail'],
  deceased_estate: ['deceasedEstateName', 'estateReferenceNumber', 'executorName', 'executorEmail'],
  power_of_attorney: ['powerOfAttorneyPrincipalName', 'powerOfAttorneyPrincipalIdNumber', 'powerOfAttorneyName', 'powerOfAttorneyEmail'],
  other: ['otherEntityName', 'otherEntityRegistrationNumber'],
  foreign: ['foreignOwnerCountry', 'foreignPassportNumber', 'foreignRegistrationNumber', 'foreignResidencyStatus'],
})

function branchDetailFamily(branch = '') {
  if (['company', 'foreign_company'].includes(branch)) return 'company'
  if (['trust', 'foreign_trust'].includes(branch)) return 'trust'
  return branch
}

function clearedBranchFields(currentBranch = '', nextBranch = '') {
  const fields = branchDetailFamily(currentBranch) === branchDetailFamily(nextBranch)
    ? []
    : BRANCH_DETAIL_FIELDS[branchDetailFamily(currentBranch)] || []
  if (currentBranch.startsWith('foreign_') && !nextBranch.startsWith('foreign_')) {
    return [...fields, ...BRANCH_DETAIL_FIELDS.foreign]
  }
  return fields
}

function hasEnteredBranchValue(value) {
  if (Array.isArray(value)) return value.some((person) =>
    person && (
      ['name', 'surname', 'email', 'phone', 'idNumber', 'residentialAddress', 'ownershipShare', 'fullName'].some((key) => normalizeText(person[key])) ||
      Boolean(person.consentToSell || person.signingAuthority)
    ))
  return Boolean(normalizeText(value))
}

export function hasListingSellerProfileBranchDetailsToDiscard(draft = {}, nextBranch = '') {
  return clearedBranchFields(draft.branch, nextBranch).some((field) => hasEnteredBranchValue(draft[field]))
}

export function selectListingSellerProfileBranch(draft = {}, nextBranch = '') {
  if (!BRANCH_VALUES.has(nextBranch) || (draft.branch === nextBranch && nextBranch !== 'multiple_owners')) return draft
  const next = { ...draft, branch: nextBranch }
  clearedBranchFields(draft.branch, nextBranch).forEach((field) => {
    next[field] = Array.isArray(draft[field]) ? [] : ''
  })
  if (nextBranch === 'multiple_owners') {
    const owners = draft.branch === 'multiple_owners' && Array.isArray(next.multipleOwners) ? [...next.multipleOwners] : []
    if (!owners.length && [draft.sellerFirstName, draft.sellerSurname, draft.email, draft.phone, draft.idNumber].some(normalizeText)) {
      owners.push({
        ...createBlankSellerProfilePersonRecord('Owner', 0),
        name: normalizeText(draft.sellerFirstName),
        surname: normalizeText(draft.sellerSurname),
        email: normalizeText(draft.email),
        phone: normalizeText(draft.phone),
        idNumber: normalizeText(draft.idNumber),
      })
    }
    while (owners.length < 2) owners.push(createBlankSellerProfilePersonRecord('Owner', owners.length))
    next.multipleOwners = owners
  }
  return next
}

const REQUIREMENT_PREVIEW_GROUPS = [
  { key: 'sales', label: 'Sales Documents' },
  { key: 'fica', label: 'FICA Documents' },
  { key: 'property', label: 'Property Documents' },
  { key: 'requests', label: 'Additional Requests' },
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

function splitName(fullName = '') {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', surname: '' }
  if (parts.length === 1) return { firstName: parts[0], surname: '' }
  return { firstName: parts.slice(0, -1).join(' '), surname: parts.at(-1) }
}

function compactObject(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => compactObject(item))
      .filter((item) => item !== undefined && item !== '')
  }
  if (!value || typeof value !== 'object') return value
  return Object.entries(value).reduce((accumulator, [key, item]) => {
    const next = compactObject(item)
    if (next === undefined || next === '') return accumulator
    if (Array.isArray(next) && !next.length) return accumulator
    if (next && typeof next === 'object' && !Array.isArray(next) && !Object.keys(next).length) return accumulator
    accumulator[key] = next
    return accumulator
  }, {})
}

function requirementPreviewGroupKey(requirement = {}) {
  const group = normalizeKey(requirement.requirement_group || requirement.group)
  const source = [
    requirement.requirement_key,
    requirement.requirement_name,
    requirement.requirement_description,
    requirement.label,
  ].map((value) => normalizeText(value).toLowerCase()).join(' ')

  if (group === 'mandate' || /mandate|offer to purchase|sale agreement|property condition disclosure|condition disclosure|defects/.test(source)) return 'sales'
  if (
    ['seller_identity', 'fica', 'marital', 'company', 'trust', 'deceased_estate', 'power_of_attorney'].includes(group) ||
    /fica|identity|id document|passport|proof of residential address|proof of address|marriage|anc|spouse|company registration|cipc|director|authority|resolution|trust deed|trustee|letter of authority/.test(source)
  ) {
    return 'fica'
  }
  if (
    ['property', 'compliance', 'property_compliance', 'financial', 'occupancy'].includes(group) ||
    /title deed|rates|levy|levies|body corporate|hoa|homeowners|certificate|coc|building plan|occupancy|sectional title/.test(source)
  ) {
    return 'property'
  }
  return 'requests'
}

function normalizeBranch(value, fallback = 'individual') {
  const key = normalizeKey(value)
  if (!key) return fallback
  const sharedEntityType = normalizeSellerEntityType(key, '')
  if (sharedEntityType === 'close_corporation') return 'company'
  if (sharedEntityType && sharedEntityType !== 'unknown') return sharedEntityType
  if (BRANCH_VALUES.has(key)) return key
  if (['company', 'close_corporation', 'cc', 'pty_ltd', 'corporate'].includes(key)) return 'company'
  if (['trust', 'family_trust'].includes(key)) return 'trust'
  if (['deceased_estate', 'estate'].includes(key)) return 'deceased_estate'
  if (['power_of_attorney', 'poa'].includes(key)) return 'power_of_attorney'
  if (['other', 'developer', 'other_entity'].includes(key)) return 'other'
  if (['multiple', 'multiple_individuals', 'joint', 'co_owners'].includes(key)) return 'multiple_owners'
  if (['foreign', 'foreign_owner', 'non_resident', 'foreign_individual'].includes(key)) return 'foreign_individual'
  if (['foreign_company'].includes(key)) return 'foreign_company'
  if (['foreign_trust'].includes(key)) return 'foreign_trust'
  if (['married', 'married_cop', 'married_anc', 'married_in_community', 'married_out_of_community'].includes(key)) return 'married'
  return key === 'unknown' ? '' : fallback
}

function getListingSellerFormData(listing = {}) {
  const mergeObjects = (...sources) => sources.reduce((accumulator, source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) return accumulator
    return {
      ...accumulator,
      ...source,
    }
  }, {})

  const onboarding = listing?.sellerOnboarding || listing?.seller_onboarding || {}
  const canonicalFacts = getCanonicalFacts(listing)
  const sellerFacts = canonicalFacts?.seller && typeof canonicalFacts.seller === 'object' ? canonicalFacts.seller : {}
  const propertyFacts = canonicalFacts?.property && typeof canonicalFacts.property === 'object' ? canonicalFacts.property : {}

  return mergeObjects(
    sellerFacts,
    propertyFacts,
    canonicalFacts,
    onboarding.formData,
    onboarding.form_data,
    listing?.sellerOnboardingFormData,
    listing?.seller_onboarding_form_data,
  )
}

function getCanonicalFacts(listing = {}) {
  return listing?.sellerCanonicalFacts && typeof listing.sellerCanonicalFacts === 'object'
    ? listing.sellerCanonicalFacts
    : listing?.seller_canonical_facts_json && typeof listing.seller_canonical_facts_json === 'object'
      ? listing.seller_canonical_facts_json
      : {}
}

export function isListingSellerOwnershipUnidentified(listing = {}) {
  const form = getListingSellerFormData(listing)
  return !resolveListingSellerAuthorityContract(listing, form).identified
}

export function resolveListingSellerProfileBranch(form = {}, listing = {}) {
  const facts = getCanonicalFacts(listing)
  const seller = facts.seller && typeof facts.seller === 'object' ? facts.seller : {}
  const source = pickFirst(
    form.ownerStructureType,
    form.owner_structure_type,
    form.sellerLegalType,
    form.seller_legal_type,
    form.ownershipType,
    form.sellerType,
    seller.owner_structure_type,
    seller.legal_type,
    listing?.sellerType,
  )
  const entity = normalizeKey(pickFirst(form.ownerEntityType, form.owner_entity_type, seller.owner_entity_type))
  const structure = normalizeKey(source)
  if (entity === 'foreign' && structure === 'company') return 'foreign_company'
  if (entity === 'foreign' && structure === 'trust') return 'foreign_trust'
  if (entity === 'foreign') return normalizeBranch(structure, 'foreign_individual')
  if (!resolveListingSellerAuthorityContract(listing, form).identified) return ''
  if (!normalizeKey(source)) return ''
  return normalizeBranch(source, '')
}

export function createListingSellerProfileBuilderDraft(listing = {}) {
  const form = getListingSellerFormData(listing)
  const mandateDraft = listing?.mandateDraft && typeof listing.mandateDraft === 'object' ? listing.mandateDraft : {}
  const facts = getCanonicalFacts(listing)
  const sellerFacts = facts.seller && typeof facts.seller === 'object' ? facts.seller : facts
  const canonicalCompany = sellerFacts.company && typeof sellerFacts.company === 'object' ? sellerFacts.company : {}
  const canonicalTrust = sellerFacts.trust && typeof sellerFacts.trust === 'object' ? sellerFacts.trust : {}
  const canonicalProperty = facts.property && typeof facts.property === 'object' ? facts.property : {}
  const canonicalFinance = facts.finance && typeof facts.finance === 'object' ? facts.finance : {}
  const sellerName = normalizeText(
    pickFirst(
      form.fullName,
      form.sellerName,
      [form.sellerFirstName || form.firstName, form.sellerSurname || form.lastName].filter(Boolean).join(' '),
      sellerFacts.full_name,
      sellerFacts.fullName,
      sellerFacts.name,
      listing?.sellerName,
      listing?.seller?.name,
      mandateDraft.sellerFullName,
    ),
  )
  const split = splitName(sellerName)
  const branch = resolveListingSellerProfileBranch(form, listing)
  const ownerFallback = {
    name: pickFirst(form.sellerFirstName, form.firstName, split.firstName),
    surname: pickFirst(form.sellerSurname, form.lastName, split.surname),
    email: pickFirst(form.email, form.sellerEmail, listing?.sellerEmail, listing?.seller?.email, mandateDraft.sellerEmail),
    phone: pickFirst(form.phone, form.sellerPhone, listing?.sellerPhone, listing?.seller?.phone, mandateDraft.sellerPhone),
    idNumber: pickFirst(form.idNumber, form.sellerIdNumber, mandateDraft.sellerIdNumber),
  }
  const savedOwners = [form.multipleOwners, form.owners, sellerFacts.owners, mandateDraft.sellerParties]
    .find((owners) => Array.isArray(owners) && owners.length) || []
  const propertyCategory = normalizePropertyCategory(pickFirst(form.propertyCategory, canonicalProperty.property_category, listing?.propertyCategory), { fallback: 'residential' })
  const propertyTypeOptions = getPropertyTypeOptionsByCategory(propertyCategory)
  const savedPropertyType = normalizeText(pickFirst(form.propertyType, canonicalProperty.property_type, listing?.propertyType))
  const explicitBondStatus = normalizeKey(pickFirst(form.bondStatus, form.propertyBondStatus, form.bond_status))
  const existingBond = form.existingBond ?? form.sellerHasExistingBond ?? canonicalFinance.existing_bond
  const bondStatus = ['bonded', 'no_bond'].includes(explicitBondStatus)
    ? explicitBondStatus
    : existingBond === true ? 'bonded' : existingBond === false ? 'no_bond' : 'unknown'

  return {
    branch,
    sellerFirstName: normalizeText(ownerFallback.name),
    sellerSurname: normalizeText(ownerFallback.surname),
    email: normalizeText(ownerFallback.email).toLowerCase(),
    phone: normalizeText(ownerFallback.phone),
    idNumber: normalizeText(ownerFallback.idNumber),
    residentialAddress: normalizeText(pickFirst(form.residentialAddress, form.residential_address, form.physicalAddress, sellerFacts.residential_address)),
    alternativeContact: normalizeText(pickFirst(form.alternativeContact, form.alternateContact, form.secondaryPhone, form.alternativePhone)),
    preferredContactMethod: normalizeText(pickFirst(form.preferredContactMethod, form.contactPreference)),
    maritalStatus: normalizeText(pickFirst(form.maritalStatus, form.marital_status, sellerFacts.marital_status)),
    spouseName: normalizeText(pickFirst(form.spouseName, form.spouseFullName, form.spouse?.fullName, sellerFacts.spouse?.full_name)),
    spouseEmail: normalizeText(pickFirst(form.spouseEmail, form.spouse?.email, sellerFacts.spouse?.email)).toLowerCase(),
    spouseIdNumber: normalizeText(pickFirst(form.spouseIdNumber, form.spouse?.idNumber, sellerFacts.spouse?.id_number)),
    multipleOwners: normalizePersonCollectionForSellerProfile(savedOwners, ownerFallback, 'Owner'),
    companyName: normalizeText(pickFirst(form.companyName, canonicalCompany.name)),
    companyRegistrationNumber: normalizeText(pickFirst(form.companyRegistrationNumber, canonicalCompany.registration_number, canonicalCompany.registrationNumber)),
    companyRegisteredAddress: normalizeText(pickFirst(form.companyRegisteredAddress, canonicalCompany.registered_address, canonicalCompany.registeredAddress)),
    companyDirectors: normalizePersonCollectionForSellerProfile(form.companyDirectors || canonicalCompany.directors || [], null, 'Director'),
    authorisedSignatoryName: normalizeText(pickFirst(form.authorisedSignatoryName, canonicalCompany.authorised_signatory?.full_name, canonicalCompany.authorised_signatory?.name)),
    authorisedSignatoryCapacity: normalizeText(pickFirst(form.authorisedSignatoryCapacity, canonicalCompany.authorised_signatory?.capacity)),
    authorisedSignatoryEmail: normalizeText(pickFirst(form.authorisedSignatoryEmail, canonicalCompany.authorised_signatory?.email)).toLowerCase(),
    trustName: normalizeText(pickFirst(form.trustName, canonicalTrust.name)),
    trustRegistrationNumber: normalizeText(pickFirst(form.trustRegistrationNumber, canonicalTrust.registration_number, canonicalTrust.registrationNumber)),
    trustRegisteredAddress: normalizeText(pickFirst(form.trustRegisteredAddress, canonicalTrust.registered_address, canonicalTrust.registeredAddress)),
    trustees: normalizePersonCollectionForSellerProfile(form.trustees || canonicalTrust.trustees || [], null, 'Trustee'),
    trustBeneficiaries: normalizePersonCollectionForSellerProfile(form.trustBeneficiaries || form.beneficiaries || canonicalTrust.beneficiaries || [], null, 'Beneficiary'),
    authorisedTrusteeName: normalizeText(pickFirst(form.authorisedTrusteeName, canonicalTrust.authorised_trustee?.full_name, canonicalTrust.authorised_trustee?.name)),
    authorisedTrusteeCapacity: normalizeText(pickFirst(form.authorisedTrusteeCapacity, canonicalTrust.authorised_trustee?.capacity)),
    authorisedTrusteeEmail: normalizeText(pickFirst(form.authorisedTrusteeEmail, canonicalTrust.authorised_trustee?.email)).toLowerCase(),
    deceasedEstateName: normalizeText(pickFirst(form.deceasedEstateName, form.estateName, sellerFacts.deceased_estate?.name)),
    estateReferenceNumber: normalizeText(pickFirst(form.estateReferenceNumber, form.deceasedEstateReferenceNumber, sellerFacts.deceased_estate?.reference_number)),
    executorName: normalizeText(pickFirst(form.executorName, sellerFacts.deceased_estate?.executor?.full_name, sellerFacts.deceased_estate?.executor?.name)),
    executorEmail: normalizeText(pickFirst(form.executorEmail, sellerFacts.deceased_estate?.executor?.email)).toLowerCase(),
    powerOfAttorneyPrincipalName: normalizeText(pickFirst(form.powerOfAttorneyPrincipalName, form.power_of_attorney_principal_name, sellerFacts.power_of_attorney?.principal?.full_name, sellerFacts.power_of_attorney?.principal?.name)),
    powerOfAttorneyPrincipalIdNumber: normalizeText(pickFirst(form.powerOfAttorneyPrincipalIdNumber, form.power_of_attorney_principal_id_number, sellerFacts.power_of_attorney?.principal?.id_number)),
    powerOfAttorneyName: normalizeText(pickFirst(form.powerOfAttorneyName, form.power_of_attorney_name, sellerFacts.power_of_attorney?.representative?.full_name, sellerFacts.power_of_attorney?.representative?.name)),
    powerOfAttorneyEmail: normalizeText(pickFirst(form.powerOfAttorneyEmail, form.power_of_attorney_email, sellerFacts.power_of_attorney?.representative?.email)).toLowerCase(),
    otherEntityName: normalizeText(pickFirst(form.otherEntityName, form.entityName, sellerFacts.other_entity?.name)),
    otherEntityRegistrationNumber: normalizeText(pickFirst(form.otherEntityRegistrationNumber, form.entityRegistrationNumber, sellerFacts.other_entity?.registration_number)),
    foreignOwnerCountry: normalizeText(pickFirst(form.foreignOwnerCountry, sellerFacts.foreign?.country)),
    foreignPassportNumber: normalizeText(pickFirst(form.foreignPassportNumber, sellerFacts.foreign?.passport_number, sellerFacts.foreign?.passportNumber)),
    foreignRegistrationNumber: normalizeText(pickFirst(form.foreignRegistrationNumber, sellerFacts.foreign?.registration_number, sellerFacts.foreign?.registrationNumber)),
    foreignResidencyStatus: normalizeText(pickFirst(form.foreignResidencyStatus, sellerFacts.foreign?.residency_status, sellerFacts.foreign?.residencyStatus)),
    propertyAddress: normalizeText(pickFirst(form.propertyAddress, form.addressLine1, canonicalProperty.address, listing?.propertyAddress, listing?.addressLine1, listing?.formattedAddress, listing?.listingTitle)),
    propertyStructureType: normalizeText(pickFirst(form.propertyStructureType, canonicalProperty.property_structure_type, listing?.propertyStructureType, 'full_title')),
    propertyCategory,
    propertyType: savedPropertyType || propertyTypeOptions[0]?.value || '',
    schemeName: normalizeText(pickFirst(form.schemeName, canonicalProperty.scheme?.name, canonicalProperty.scheme_name)),
    sectionNumber: normalizeText(pickFirst(form.sectionNumber, form.unitNumber, canonicalProperty.scheme?.section_number, canonicalProperty.section_number)),
    unitNumber: normalizeText(pickFirst(form.unitNumber, form.sectionNumber, canonicalProperty.scheme?.unit_number, canonicalProperty.unit_number)),
    schemeBodyCorporateName: normalizeText(pickFirst(form.schemeBodyCorporateName, canonicalProperty.scheme?.body_corporate_name)),
    schemeManagingAgentName: normalizeText(pickFirst(form.schemeManagingAgentName, canonicalProperty.scheme?.managing_agent?.name)),
    schemeManagingAgentEmail: normalizeText(pickFirst(form.schemeManagingAgentEmail, canonicalProperty.scheme?.managing_agent?.email)),
    schemeManagingAgentPhone: normalizeText(pickFirst(form.schemeManagingAgentPhone, canonicalProperty.scheme?.managing_agent?.phone)),
    schemeLevies: normalizeText(pickFirst(form.schemeLevies, canonicalProperty.scheme?.levies)),
    schemeRulesAvailable: Boolean(form.schemeRulesAvailable ?? canonicalProperty.scheme?.rules ?? false),
    titleDeedNumber: normalizeText(pickFirst(form.titleDeedNumber, form.deedNumber, form.titleReference)),
    bondStatus,
    bondHolder: bondStatus === 'bonded' ? normalizeText(pickFirst(form.bondHolder, form.bondBank, form.mortgageBank, canonicalFinance.bond_bank)) : '',
    bondAccountReference: bondStatus === 'bonded' ? normalizeText(pickFirst(form.bondAccountReference, canonicalFinance.bond_account_reference)) : '',
    outstandingBond: bondStatus === 'bonded' ? normalizeText(pickFirst(form.outstandingBond, form.estimatedSettlementAmount, form.bondSettlementAmount, canonicalFinance.estimated_settlement_amount)) : '',
    multipleBonds: bondStatus === 'bonded' && Boolean(form.multipleBonds ?? canonicalFinance.multiple_bonds ?? false),
    accessBond: bondStatus === 'bonded' && Boolean(form.accessBond ?? canonicalFinance.access_bond ?? false),
    cancellationRequired: bondStatus === 'bonded' && Boolean(form.cancellationRequired ?? canonicalFinance.cancellation_required ?? false),
    coOwnerDetails: normalizeText(pickFirst(form.coOwnerDetails, form.coOwners)),
    ratesTaxes: normalizeText(pickFirst(form.ratesTaxes, listing?.ratesTaxes)),
    levies: normalizeText(pickFirst(form.levies, listing?.levies)),
    leviesNotApplicable: Boolean(form.leviesNotApplicable ?? form.levies_not_applicable ?? false),
    waterBillingType: normalizeText(pickFirst(form.waterBillingType, form.water_billing_type, 'municipal')),
    mandateType: normalizeText(pickFirst(form.mandateType, listing?.mandateType, listing?.mandate?.type, 'sole')),
    askingPrice: normalizeText(pickFirst(form.askingPrice, form.price, listing?.askingPrice)),
    mandateStartDate: normalizeText(pickFirst(form.mandateStartDate, listing?.mandateStartDate)),
    expiryDate: normalizeText(pickFirst(form.expiryDate, form.mandateEndDate, listing?.expiryDate)),
    commissionPreference: normalizeText(pickFirst(form.commissionPreference, form.commissionType, form.commissionStructure)),
    mandateTerms: normalizeText(pickFirst(form.mandateTerms, form.mandateCommissionTerms)),
    popiConsent: normalizeText(pickFirst(form.popiConsent, form.privacyConsent)),
  }
}

export function addListingSellerProfileDraftPerson(draft = {}, key = 'multipleOwners', roleTitle = 'Person') {
  const existing = Array.isArray(draft[key]) ? draft[key] : []
  return {
    ...draft,
    [key]: [
      ...existing,
      createBlankSellerProfilePersonRecord(roleTitle, existing.length),
    ],
  }
}

export function removeListingSellerProfileDraftPerson(draft = {}, key = 'multipleOwners', index = 0) {
  const existing = Array.isArray(draft[key]) ? draft[key] : []
  if (key === 'multipleOwners' && draft.branch === 'multiple_owners' && existing.length <= 2) return draft
  return {
    ...draft,
    [key]: existing.filter((_, itemIndex) => itemIndex !== index),
  }
}

export function updateListingSellerProfileDraftPerson(draft = {}, key = 'multipleOwners', index = 0, field = '', value = '') {
  const existing = Array.isArray(draft[key]) ? draft[key] : []
  return {
    ...draft,
    [key]: existing.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )),
  }
}

export function updateListingSellerProfileDraftField(draft = {}, field = '', value = '') {
  const next = { ...draft, [field]: value }
  if (field === 'propertyCategory') {
    const typeOptions = getPropertyTypeOptionsByCategory(value)
    if (!typeOptions.some((option) => option.value === next.propertyType)) next.propertyType = typeOptions[0]?.value || ''
    const structures = getPropertyStructureTypesByCategory(value)
    if (!structures.includes(next.propertyStructureType)) next.propertyStructureType = structures[0] || 'full_title'
  }
  if (field === 'sectionNumber') next.unitNumber = value
  return next
}

function resolveOwnerModel(branch) {
  if (!branch) return { ownerEntityType: '', ownerStructureType: '', sellerLegalType: '' }
  if (branch === 'company') return { ownerEntityType: 'company', ownerStructureType: 'company', sellerLegalType: 'company' }
  if (branch === 'trust') return { ownerEntityType: 'trust', ownerStructureType: 'trust', sellerLegalType: 'trust' }
  if (branch === 'foreign_company') return { ownerEntityType: 'foreign', ownerStructureType: 'foreign_company', sellerLegalType: 'foreign_company' }
  if (branch === 'foreign_trust') return { ownerEntityType: 'foreign', ownerStructureType: 'foreign_trust', sellerLegalType: 'foreign_trust' }
  if (branch === 'foreign_individual') return { ownerEntityType: 'foreign', ownerStructureType: 'foreign_individual', sellerLegalType: 'foreign_individual' }
  if (branch === 'multiple_owners') return { ownerEntityType: 'natural_person', ownerStructureType: 'multiple_owners', sellerLegalType: 'multiple_owners' }
  if (branch === 'deceased_estate') return { ownerEntityType: 'deceased_estate', ownerStructureType: 'deceased_estate', sellerLegalType: 'deceased_estate' }
  if (branch === 'power_of_attorney') return { ownerEntityType: 'natural_person', ownerStructureType: 'power_of_attorney', sellerLegalType: 'power_of_attorney' }
  if (branch === 'other') return { ownerEntityType: 'other', ownerStructureType: 'other', sellerLegalType: 'other' }
  if (branch === 'married') return { ownerEntityType: 'natural_person', ownerStructureType: 'married', sellerLegalType: 'individual' }
  return { ownerEntityType: 'natural_person', ownerStructureType: 'individual', sellerLegalType: 'individual' }
}

export function buildListingSellerProfileFormPatch(draft = {}) {
  const branch = normalizeBranch(draft.branch, '')
  const ownerModel = resolveOwnerModel(branch)
  const fullName = [draft.sellerFirstName, draft.sellerSurname].map(normalizeText).filter(Boolean).join(' ')
  const entityName = branch === 'company' || branch === 'foreign_company'
    ? normalizeText(draft.companyName)
    : branch === 'trust' || branch === 'foreign_trust'
      ? normalizeText(draft.trustName)
      : branch === 'deceased_estate'
        ? normalizeText(draft.deceasedEstateName)
        : branch === 'other'
          ? normalizeText(draft.otherEntityName)
        : ''
  const maritalStatus = normalizeText(draft.maritalStatus)
  const normalizedMaritalStatus = maritalStatus.toLowerCase()
  const maritalRegime = ['single', 'not married', 'not-married', 'not_married', 'notmarried', 'unmarried', 'never married', 'never-married', 'never_married'].includes(normalizedMaritalStatus)
    ? 'single'
    : maritalStatus
  const base = {
    sellerProfileBuilderVersion: LISTING_SELLER_PROFILE_BUILDER_VERSION,
    sellerProfileCaptureSource: LISTING_SELLER_PROFILE_CAPTURE_SOURCE,
    sellerType: ownerModel.sellerLegalType,
    sellerLegalType: ownerModel.sellerLegalType,
    seller_legal_type: ownerModel.sellerLegalType,
    ownershipType: branch,
    ownerEntityType: ownerModel.ownerEntityType,
    owner_entity_type: ownerModel.ownerEntityType,
    ownerStructureType: ownerModel.ownerStructureType,
    owner_structure_type: ownerModel.ownerStructureType,
    sellerFirstName: normalizeText(draft.sellerFirstName),
    sellerSurname: normalizeText(draft.sellerSurname),
    firstName: normalizeText(draft.sellerFirstName),
    lastName: normalizeText(draft.sellerSurname),
    sellerName: entityName || fullName,
    fullName: entityName || fullName,
    contactName: fullName,
    email: normalizeText(draft.email).toLowerCase(),
    sellerEmail: normalizeText(draft.email).toLowerCase(),
    phone: normalizeText(draft.phone),
    sellerPhone: normalizeText(draft.phone),
    mobile: normalizeText(draft.phone),
    alternativeContact: normalizeText(draft.alternativeContact),
    alternateContact: normalizeText(draft.alternativeContact),
    preferredContactMethod: normalizeText(draft.preferredContactMethod),
    contactPreference: normalizeText(draft.preferredContactMethod),
    idNumber: normalizeText(draft.idNumber),
    sellerIdNumber: normalizeText(draft.idNumber),
    residentialAddress: normalizeText(draft.residentialAddress),
    residential_address: normalizeText(draft.residentialAddress),
    maritalStatus,
    maritalRegime,
    marital_status: maritalStatus,
    marital_regime: maritalRegime,
    spouseName: normalizeText(draft.spouseName),
    spouseEmail: normalizeText(draft.spouseEmail).toLowerCase(),
    spouseIdNumber: normalizeText(draft.spouseIdNumber),
    propertyAddress: normalizeText(draft.propertyAddress),
    addressLine1: normalizeText(draft.propertyAddress),
    propertyStructureType: normalizeText(draft.propertyStructureType) || 'full_title',
    propertyCategory: normalizePropertyCategory(draft.propertyCategory, { fallback: 'residential' }),
    propertyType: normalizeText(draft.propertyType) || getPropertyTypeOptionsByCategory(draft.propertyCategory)[0]?.value || 'house',
    sectionalTitle: ['sectional_title', 'share_block'].includes(normalizePropertyStructureType(draft.propertyStructureType, { fallback: '' })),
    bodyCorporate: ['sectional_title', 'share_block'].includes(normalizePropertyStructureType(draft.propertyStructureType, { fallback: '' })),
    schemeName: normalizeText(draft.schemeName),
    sectionNumber: normalizeText(draft.sectionNumber || draft.unitNumber),
    unitNumber: normalizeText(draft.unitNumber || draft.sectionNumber),
    schemeBodyCorporateName: normalizeText(draft.schemeBodyCorporateName),
    schemeManagingAgentName: normalizeText(draft.schemeManagingAgentName),
    schemeManagingAgentEmail: normalizeText(draft.schemeManagingAgentEmail),
    schemeManagingAgentPhone: normalizeText(draft.schemeManagingAgentPhone),
    schemeLevies: normalizeText(draft.schemeLevies),
    schemeRulesAvailable: Boolean(draft.schemeRulesAvailable),
    titleDeedNumber: normalizeText(draft.titleDeedNumber),
    deedNumber: normalizeText(draft.titleDeedNumber),
    bondStatus: normalizeText(draft.bondStatus) || 'unknown',
    propertyBondStatus: normalizeText(draft.bondStatus) || 'unknown',
    existingBond: draft.bondStatus === 'bonded',
    sellerHasExistingBond: draft.bondStatus === 'bonded',
    bondedProperty: draft.bondStatus === 'bonded',
    bondHolder: draft.bondStatus === 'bonded' ? normalizeText(draft.bondHolder) : '',
    bondBank: draft.bondStatus === 'bonded' ? normalizeText(draft.bondHolder) : '',
    currentBondBank: draft.bondStatus === 'bonded' ? normalizeText(draft.bondHolder) : '',
    bondAccountReference: draft.bondStatus === 'bonded' ? normalizeText(draft.bondAccountReference) : '',
    currentBondAccountNumber: draft.bondStatus === 'bonded' ? normalizeText(draft.bondAccountReference) : '',
    outstandingBond: draft.bondStatus === 'bonded' ? normalizeText(draft.outstandingBond) : '',
    estimatedSettlementAmount: draft.bondStatus === 'bonded' ? normalizeText(draft.outstandingBond) : '',
    bondSettlementAmount: draft.bondStatus === 'bonded' ? normalizeText(draft.outstandingBond) : '',
    multipleBonds: draft.bondStatus === 'bonded' && Boolean(draft.multipleBonds),
    accessBond: draft.bondStatus === 'bonded' && Boolean(draft.accessBond),
    cancellationRequired: draft.bondStatus === 'bonded' && Boolean(draft.cancellationRequired),
    coOwnerDetails: normalizeText(draft.coOwnerDetails),
    coOwners: normalizeText(draft.coOwnerDetails),
    ratesTaxes: normalizeText(draft.ratesTaxes),
    levies: normalizeText(draft.levies),
    leviesNotApplicable: Boolean(draft.leviesNotApplicable),
    waterBillingType: normalizeText(draft.waterBillingType),
    mandateType: normalizeText(draft.mandateType) || 'sole',
    askingPrice: normalizeText(draft.askingPrice),
    price: normalizeText(draft.askingPrice),
    mandateStartDate: normalizeText(draft.mandateStartDate),
    startDate: normalizeText(draft.mandateStartDate),
    expiryDate: normalizeText(draft.expiryDate),
    mandateEndDate: normalizeText(draft.expiryDate),
    commissionPreference: normalizeText(draft.commissionPreference),
    commissionType: normalizeText(draft.commissionPreference),
    mandateTerms: normalizeText(draft.mandateTerms),
    mandateCommissionTerms: normalizeText(draft.mandateTerms),
    popiConsent: normalizeText(draft.popiConsent),
    privacyConsent: normalizeText(draft.popiConsent),
  }

  if (branch === 'multiple_owners') {
    base.multipleOwners = normalizePersonCollectionForSellerProfile(draft.multipleOwners || [], null, 'Owner')
    base.owners = base.multipleOwners
  }
  if (branch === 'company' || branch === 'foreign_company') {
    base.companyName = normalizeText(draft.companyName)
    base.companyRegistrationNumber = normalizeText(draft.companyRegistrationNumber)
    base.companyRegisteredAddress = normalizeText(draft.companyRegisteredAddress)
    base.companyDirectors = normalizePersonCollectionForSellerProfile(draft.companyDirectors || [], null, 'Director')
    base.directors = base.companyDirectors
    base.authorisedSignatoryName = normalizeText(draft.authorisedSignatoryName)
    base.authorisedSignatoryCapacity = normalizeText(draft.authorisedSignatoryCapacity)
    base.authorisedSignatoryEmail = normalizeText(draft.authorisedSignatoryEmail).toLowerCase()
  }
  if (branch === 'trust' || branch === 'foreign_trust') {
    base.trustName = normalizeText(draft.trustName)
    base.trustRegistrationNumber = normalizeText(draft.trustRegistrationNumber)
    base.trustRegisteredAddress = normalizeText(draft.trustRegisteredAddress)
    base.trustees = normalizePersonCollectionForSellerProfile(draft.trustees || [], null, 'Trustee')
    base.trustBeneficiaries = normalizePersonCollectionForSellerProfile(draft.trustBeneficiaries || [], null, 'Beneficiary')
    base.beneficiaries = base.trustBeneficiaries
    base.authorisedTrusteeName = normalizeText(draft.authorisedTrusteeName)
    base.authorisedTrusteeCapacity = normalizeText(draft.authorisedTrusteeCapacity)
    base.authorisedTrusteeEmail = normalizeText(draft.authorisedTrusteeEmail).toLowerCase()
  }
  if (branch === 'deceased_estate') {
    base.deceasedEstateName = normalizeText(draft.deceasedEstateName)
    base.estateName = base.deceasedEstateName
    base.estateReferenceNumber = normalizeText(draft.estateReferenceNumber)
    base.executorName = normalizeText(draft.executorName)
    base.executorEmail = normalizeText(draft.executorEmail).toLowerCase()
    base.executors = base.executorName ? [{ name: base.executorName, fullName: base.executorName, email: base.executorEmail, roleTitle: 'Executor', signingAuthority: true }] : []
    base.deceased_estate = { name: base.deceasedEstateName, estate_reference: base.estateReferenceNumber, reference_number: base.estateReferenceNumber, executor: { full_name: base.executorName, email: base.executorEmail }, executors: base.executors }
  }
  if (branch === 'power_of_attorney') {
    base.powerOfAttorneyPrincipalName = normalizeText(draft.powerOfAttorneyPrincipalName)
    base.power_of_attorney_principal_name = base.powerOfAttorneyPrincipalName
    base.powerOfAttorneyPrincipalIdNumber = normalizeText(draft.powerOfAttorneyPrincipalIdNumber)
    base.power_of_attorney_principal_id_number = base.powerOfAttorneyPrincipalIdNumber
    base.powerOfAttorneyName = normalizeText(draft.powerOfAttorneyName)
    base.power_of_attorney_name = base.powerOfAttorneyName
    base.powerOfAttorneyEmail = normalizeText(draft.powerOfAttorneyEmail).toLowerCase()
    base.power_of_attorney_email = base.powerOfAttorneyEmail
    base.power_of_attorney = {
      principal: { full_name: base.powerOfAttorneyPrincipalName, id_number: base.powerOfAttorneyPrincipalIdNumber },
      representative: { full_name: base.powerOfAttorneyName, email: base.powerOfAttorneyEmail },
    }
  }
  if (branch === 'other') {
    base.otherEntityName = normalizeText(draft.otherEntityName)
    base.otherEntityRegistrationNumber = normalizeText(draft.otherEntityRegistrationNumber)
    base.other_entity = { name: base.otherEntityName, registration_number: base.otherEntityRegistrationNumber }
  }
  if (branch.startsWith('foreign_')) {
    base.foreignOwner = true
    base.foreign_owner = true
    base.foreignOwnerCountry = normalizeText(draft.foreignOwnerCountry)
    base.foreignPassportNumber = normalizeText(draft.foreignPassportNumber)
    base.foreignRegistrationNumber = normalizeText(draft.foreignRegistrationNumber)
    base.foreignResidencyStatus = normalizeText(draft.foreignResidencyStatus)
  }

  const patch = compactObject({
    ...base,
    ...buildSellerEntityProfileAliases(base),
  })
  // Empty strings normally disappear from patches. An explicit "no bond" must
  // clear old bond values when this patch is merged into saved onboarding data.
  if (draft.bondStatus === 'no_bond') {
    for (const key of ['bondHolder', 'bondBank', 'currentBondBank', 'mortgageBank', 'bondAccountReference', 'currentBondAccountNumber', 'outstandingBond', 'estimatedSettlementAmount', 'bondSettlementAmount']) patch[key] = ''
  }
  return patch
}

export function validateListingSellerProfileBuilderDraft(draft = {}) {
  const branch = normalizeBranch(draft.branch, '')
  const errors = []
  if (!branch) return ['Choose who owns this property before continuing.']
  const email = normalizeText(draft.email)
  const hasPrimarySeller = normalizeText(draft.sellerFirstName || draft.sellerSurname || draft.email || draft.phone || draft.idNumber)
  if (!hasPrimarySeller && !['company', 'trust', 'foreign_company', 'foreign_trust'].includes(branch)) {
    errors.push('Capture at least one seller name, email, phone, or ID number.')
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Add a valid seller email address.')
  if (!normalizeText(draft.propertyAddress)) errors.push('Capture the property address.')
  if (['company', 'foreign_company'].includes(branch) && !normalizeText(draft.companyName)) errors.push('Capture the company name.')
  if (['trust', 'foreign_trust'].includes(branch) && !normalizeText(draft.trustName)) errors.push('Capture the trust name.')
  if (branch === 'deceased_estate' && !normalizeText(draft.deceasedEstateName)) errors.push('Capture the estate name.')
  if (branch === 'power_of_attorney' && !normalizeText(draft.powerOfAttorneyPrincipalName)) errors.push('Capture the principal / legal owner name.')
  if (branch === 'other' && !normalizeText(draft.otherEntityName)) errors.push('Capture the legal entity name.')
  if (branch === 'multiple_owners' && normalizePersonCollectionForSellerProfile(draft.multipleOwners || [], null, 'Owner').length < 2) {
    errors.push('Capture at least two owners.')
  }
  if (branch.startsWith('foreign_') && !normalizeText(draft.foreignOwnerCountry)) {
    errors.push('Capture the foreign owner country or jurisdiction.')
  }
  return errors
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(value))
}

function personName(person = {}) {
  return normalizeText(person.fullName || person.name || [person.firstName, person.surname || person.lastName].filter(Boolean).join(' '))
}

/**
 * The direct-listing minimum required to prepare a mandate.  This deliberately
 * does not require FICA evidence or a completed disclosure: those are separate
 * documents that can be requested later in the seller-document flow.
 */
export function buildListingMandateReadiness(listing = {}, commission = {}) {
  const form = getListingSellerFormData(listing)
  const branch = resolveListingSellerProfileBranch(form, listing)
  const missing = []
  const legalType = branch || 'not_identified'
  const require = (condition, message) => { if (!condition) missing.push(message) }
  const contactName = normalizeText(form.contactName || form.sellerName || form.fullName || [form.sellerFirstName || form.firstName, form.sellerSurname || form.lastName].filter(Boolean).join(' '))
  const contactEmail = normalizeText(form.sellerEmail || form.email)
  const owners = normalizePersonCollectionForSellerProfile(form.multipleOwners || form.owners || [], null, 'Owner')

  require(Boolean(branch), 'Choose the ownership type.')
  if (branch === 'multiple_owners') {
    require(owners.length > 0, 'Add every property owner.')
    owners.forEach((owner, index) => {
      require(Boolean(personName(owner)), `Add owner ${index + 1}'s full name.`)
      require(isEmail(owner.email), `Add a valid email for owner ${index + 1}.`)
    })
  } else if (branch === 'company' || branch === 'foreign_company') {
    require(Boolean(normalizeText(form.companyName)), 'Add the company or CC name.')
    require(Boolean(normalizeText(form.companyRegistrationNumber)), 'Add the company or CC registration number.')
    require(Boolean(normalizeText(form.authorisedSignatoryName)), 'Add the authorised signatory.')
    require(Boolean(normalizeText(form.authorisedSignatoryCapacity)), 'Add the signatory capacity.')
    require(isEmail(form.authorisedSignatoryEmail), 'Add a valid authorised-signatory email.')
  } else if (branch === 'trust' || branch === 'foreign_trust') {
    require(Boolean(normalizeText(form.trustName)), 'Add the trust name.')
    require(Boolean(normalizeText(form.trustRegistrationNumber)), 'Add the trust registration number.')
    require(Boolean(normalizeText(form.authorisedTrusteeName)), 'Add the authorised trustee.')
    require(Boolean(normalizeText(form.authorisedTrusteeCapacity)), 'Add the trustee capacity.')
    require(isEmail(form.authorisedTrusteeEmail), 'Add a valid authorised-trustee email.')
  } else if (branch === 'deceased_estate') {
    require(Boolean(normalizeText(form.deceasedEstateName || form.estateName)), 'Add the estate name.')
    require(Boolean(normalizeText(form.estateReferenceNumber)), 'Add the estate reference number.')
    require(Boolean(normalizeText(form.executorName)), 'Add the executor.')
    require(isEmail(form.executorEmail), 'Add a valid executor email.')
  } else if (branch === 'power_of_attorney') {
    require(Boolean(normalizeText(form.powerOfAttorneyPrincipalName)), 'Add the principal / legal owner name.')
    require(Boolean(normalizeText(form.powerOfAttorneyPrincipalIdNumber)), 'Add the principal ID/passport number.')
    require(Boolean(normalizeText(form.powerOfAttorneyName)), 'Add the authorised representative.')
    require(isEmail(form.powerOfAttorneyEmail), 'Add a valid authorised-representative email.')
  } else if (branch === 'other') {
    require(Boolean(normalizeText(form.otherEntityName)), 'Add the legal entity name.')
    require(Boolean(contactName), 'Add the authorised contact name.')
    require(isEmail(contactEmail), 'Add a valid authorised-contact email.')
  } else {
    require(Boolean(contactName), 'Add the seller’s full name.')
    require(isEmail(contactEmail), 'Add a valid seller email.')
  }

  require(Boolean(normalizeText(form.propertyAddress || form.addressLine1 || listing.propertyAddress || listing.addressLine1)), 'Add the property address.')
  require(Boolean(normalizeText(form.mandateType || listing.mandateType)), 'Choose the mandate type.')
  require(Number(form.askingPrice || form.price || listing.askingPrice) > 0, 'Add the asking price.')
  require(Boolean(normalizeText(form.mandateStartDate || listing.mandateStartDate)), 'Add the mandate start date.')
  require(Boolean(normalizeText(form.expiryDate || form.mandateEndDate || listing.expiryDate)), 'Add the mandate expiry date.')

  const basis = normalizeText(commission.basis)
  const hasCommission = basis === 'fixed' ? Number(commission.amount) > 0 : Number(commission.percentage) > 0
  require(hasCommission, `Add the ${basis === 'fixed' ? 'fixed Rand commission' : 'commission percentage'}.`)
  require(Boolean(normalizeText(commission.vatHandling)), 'Choose the VAT treatment.')

  return {
    version: 'listing_mandate_readiness_v1',
    legalType,
    ready: missing.length === 0,
    missing,
    summary: missing.length === 0 ? 'Ready to prepare the mandate.' : `${missing.length} item${missing.length === 1 ? '' : 's'} still needed before the mandate can be prepared.`,
  }
}

export function buildListingSellerDocumentReadiness(listing = {}, commission = {}) {
  const mandate = buildListingMandateReadiness(listing, commission)
  const form = getListingSellerFormData(listing)
  const mandateType = normalizeKey(form.mandateType || listing?.mandateType || 'sole')
  const mandateTitle = mandateType === 'dual'
    ? 'Dual mandate'
    : mandateType === 'tri'
      ? 'Tri mandate'
      : mandateType === 'open'
        ? 'Open mandate'
        : 'Sole mandate'

  const documents = [
    { key: 'mandate', title: mandateTitle, copy: 'Uses the saved mandate, commission and VAT details.', ready: mandate.ready, missing: mandate.missing },
    // These are seller-completed questionnaires. They must be available in a
    // secure pack before their answers exist; otherwise the form can never do
    // the job it was sent to do.
    { key: 'disclosure', title: 'Property disclosure form', copy: 'The seller completes the property-condition questionnaire in the secure link.', ready: true, missing: [] },
    { key: 'fica', title: 'Seller FICA declaration', copy: 'The seller confirms and completes outstanding FICA information in the secure link.', ready: true, missing: [] },
  ]
  return { version: 'listing_seller_document_readiness_v1', documents, byKey: Object.fromEntries(documents.map((document) => [document.key, document])) }
}

export function buildListingSellerProfileCapturePayload(draft = {}, listing = {}, options = {}) {
  const formPatch = buildListingSellerProfileFormPatch(draft)
  const canonicalPayload = buildSellerProfileCanonicalPayload(formPatch, listing, {
    draft: Boolean(options.draft),
    env: options.env,
    source: LISTING_SELLER_PROFILE_CAPTURE_SOURCE,
  })
  return {
    projectionVersion: LISTING_SELLER_REQUIREMENT_PROJECTION_VERSION,
    formPatch,
    canonicalSellerFacts: canonicalPayload.canonicalSellerFacts || {},
    canonicalPayload,
  }
}

export function buildListingSellerProfileRequirementProjection(draft = {}, listing = {}, options = {}) {
  const branch = normalizeBranch(draft.branch, '')
  if (!branch) {
    return {
      projectionVersion: LISTING_SELLER_REQUIREMENT_PROJECTION_VERSION,
      formPatch: {},
      canonicalSellerFacts: {},
      canonicalPayload: {},
      projectedListing: listing,
      requirementProfile: null,
      generatedRequirements: [],
      upsertRows: [],
      markNotApplicableRows: [],
      rows: [],
      retiredRows: [],
      allRequirementRows: [],
      groups: REQUIREMENT_PREVIEW_GROUPS.map((group) => ({ ...group, rows: [], retiredRows: [] })),
      summary: {
        total: 0,
        required: 0,
        sellerVisible: 0,
        internal: 0,
        archived: 0,
        retired: 0,
        sellerBranch: '',
        sellerType: '',
        propertyStructureType: '',
        ownerCount: 0,
      },
    }
  }
  const { formPatch, canonicalSellerFacts, canonicalPayload } = buildListingSellerProfileCapturePayload(draft, listing, options)
  const existingFormData = getListingSellerFormData(listing)
  const nextFormData = {
    ...existingFormData,
    ...formPatch,
  }
  const projectedListing = {
    ...listing,
    listingStatus: ['seller_lead', 'onboarding_sent', 'not_started', ''].includes(normalizeKey(listing?.listingStatus || listing?.listing_status || listing?.status))
      ? 'listing_review'
      : listing?.listingStatus || listing?.listing_status || listing?.status || 'listing_review',
    status: ['seller_lead', 'onboarding_sent', 'not_started', ''].includes(normalizeKey(listing?.status || listing?.listingStatus || listing?.listing_status))
      ? 'listing_review'
      : listing?.status || listing?.listingStatus || listing?.listing_status || 'listing_review',
    sellerType: formPatch.sellerType || listing?.sellerType || 'individual',
    sellerCanonicalFacts: Object.keys(canonicalSellerFacts || {}).length
      ? canonicalSellerFacts
      : listing?.sellerCanonicalFacts || listing?.seller_canonical_facts_json || {},
    sellerOnboardingStatus:
      listing?.sellerOnboardingStatus ||
      listing?.seller_onboarding_status ||
      listing?.sellerOnboarding?.status ||
      'in_progress',
    sellerOnboarding: {
      ...(listing?.sellerOnboarding || {}),
      status:
        listing?.sellerOnboarding?.status ||
        listing?.sellerOnboardingStatus ||
        listing?.seller_onboarding_status ||
        'in_progress',
      formData: nextFormData,
    },
  }
  const existingRequirements = Array.isArray(listing?.documentRequirements) ? listing.documentRequirements : []
  const sync = syncSellerDocumentRequirements(projectedListing, existingRequirements)
  const rows = sync.upsertRows.map((row) => ({
    ...row,
    key: row.requirement_key,
    label: row.requirement_name,
    required: row.is_required !== false,
    groupKey: requirementPreviewGroupKey(row),
  }))
  const retiredRows = sync.markNotApplicableRows.map((row) => ({
    ...row,
    key: row.requirement_key,
    label: row.requirement_name,
    required: false,
    retired: true,
    retiredBySellerProfileBuilder: true,
    retirementVersion: LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION,
    retirementReason: 'seller_model_changed',
    groupKey: requirementPreviewGroupKey(row),
    generated_from: {
      ...(row?.generated_from && typeof row.generated_from === 'object' ? row.generated_from : {}),
      archived: true,
      retirement_version: LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION,
      retirement_reason: 'seller_model_changed',
    },
  }))
  const allRequirementRows = [...rows, ...retiredRows]
  const groups = REQUIREMENT_PREVIEW_GROUPS.map((group) => ({
    ...group,
    rows: rows.filter((row) => row.groupKey === group.key),
    retiredRows: retiredRows.filter((row) => row.groupKey === group.key),
  }))
  const profile = sync.requirementProfile || getSellerRequirementProfile(projectedListing)

  return {
    projectionVersion: LISTING_SELLER_REQUIREMENT_PROJECTION_VERSION,
    formPatch,
    canonicalSellerFacts,
    canonicalPayload,
    projectedListing,
    requirementProfile: profile,
    generatedRequirements: sync.generatedRequirements,
    upsertRows: sync.upsertRows,
    markNotApplicableRows: sync.markNotApplicableRows,
    rows,
    retiredRows,
    allRequirementRows,
    groups,
    summary: {
      total: rows.length,
      required: rows.filter((row) => row.required).length,
      sellerVisible: rows.filter((row) => normalizeKey(row.visibility || row.document_visibility) !== 'internal').length,
      internal: rows.filter((row) => normalizeKey(row.visibility || row.document_visibility) === 'internal').length,
      archived: sync.markNotApplicableRows.length,
      retired: retiredRows.length,
      sellerBranch: profile?.sellerBranch || '',
      sellerType: profile?.sellerType || '',
      propertyStructureType: profile?.propertyStructureType || '',
      ownerCount: profile?.ownerCount || 1,
    },
  }
}

export default {
  LISTING_SELLER_PROFILE_BRANCHES,
  LISTING_SELLER_PROFILE_BUILDER_VERSION,
  LISTING_SELLER_PROFILE_CAPTURE_SOURCE,
  LISTING_SELLER_REQUIREMENT_PROJECTION_VERSION,
  LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION,
  addListingSellerProfileDraftPerson,
  buildListingSellerProfileCapturePayload,
  buildListingSellerProfileFormPatch,
  buildListingMandateReadiness,
  buildListingSellerDocumentReadiness,
  buildListingSellerProfileRequirementProjection,
  createListingSellerProfileBuilderDraft,
  isListingSellerOwnershipUnidentified,
  removeListingSellerProfileDraftPerson,
  resolveListingSellerProfileBranch,
  updateListingSellerProfileDraftPerson,
  updateListingSellerProfileDraftField,
  validateListingSellerProfileBuilderDraft,
}
