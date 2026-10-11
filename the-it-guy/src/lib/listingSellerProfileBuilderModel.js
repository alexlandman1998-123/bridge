import { LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION } from './sellerBasePackContract.js'
import { normalizeMaritalRegime } from '../services/documents/sellerOnboardingFactTransformer.js'
import { readSellerMandateTerms, buildSellerMandateTermsFormPatch, getSellerMandatePreparationIssues, normalizeSellerMandateType } from './sellerMandateCapture.js'
import { resolveSellerBondStatus, sellerBondDeclaration } from './sellerBondStatus.js'
import { buildSellerPopiConsentPatch, sellerPopiConsentDisplayValue } from '../core/documents/sellerOnboardingConsent.js'
import { sellerYesNoValue } from './sellerFicaOnboardingFields.js'
import {
  buildSellerEntityProfileAliases,
  buildSellerProfileCanonicalPayload,
  createBlankSellerProfilePersonRecord,
  normalizePersonCollectionForSellerProfile,
} from './sellerProfileCaptureModel.js'
import { normalizeSellerEntityType } from './sellerEntityModel.js'
import {
  getPropertyTypeOptionsByCategory,
  normalizePropertyCategory,
  normalizePropertyStructureType,
} from './propertyTaxonomy.js'
import { resolveListingSellerAuthorityContract } from './sellerPartyAuthorityContract.js'
import {
  getSellerRequirementProfile,
  syncSellerDocumentRequirements,
} from './privateListingRequirementEngine.js'

export const LISTING_SELLER_PROFILE_BUILDER_VERSION = 'listing_seller_profile_builder_phase2_v1'
export const LISTING_SELLER_PROFILE_CAPTURE_SOURCE = 'listing_seller_profile_capture'
export const LISTING_SELLER_REQUIREMENT_PROJECTION_VERSION = 'listing_seller_requirement_projection_phase3_v1'
export { LISTING_SELLER_REQUIREMENT_RETIREMENT_VERSION } from './sellerBasePackContract.js'

export const LISTING_SELLER_PROFILE_BRANCHES = [
  { value: '', label: 'Not identified yet' },
  { value: 'individual', label: 'Individual' },
  { value: 'married', label: 'Married Individual' },
  { value: 'multiple_owners', label: 'Multiple Owners' },
  { value: 'company', label: 'Company' },
  { value: 'close_corporation', label: 'Close Corporation (CC)' },
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
  married: ['spouseName', 'spouseEmail', 'spouseIdNumber', 'spousePhone'],
  multiple_owners: ['multipleOwners', 'coOwnerDetails'],
  company: ['companyName', 'companyRegistrationNumber', 'companyRegisteredAddress', 'companyDirectors', 'companyBeneficialOwners', 'authorisedSignatoryName', 'authorisedSignatoryCapacity', 'authorisedSignatoryEmail', 'authorisedSignatoryIdNumber', 'authorisedSignatoryNationality', 'authorisedSignatoryAddress', 'authorisedSignatoryPhone', 'companyAuthorityBasis', 'companyResolutionDate'],
  trust: ['trustName', 'trustRegistrationNumber', 'trustRegisteredAddress', 'trustees', 'trustFounders', 'trustBeneficiaries', 'trustBeneficiaryClass', 'authorisedTrusteeName', 'authorisedTrusteeCapacity', 'authorisedTrusteeEmail', 'authorisedTrusteeIdNumber', 'authorisedTrusteeNationality', 'authorisedTrusteeAddress', 'authorisedTrusteePhone', 'trustAuthorityBasis'],
  deceased_estate: ['deceasedEstateName', 'estateReferenceNumber', 'executorName', 'executorEmail', 'executorPhone', 'executorAuthorityDetails'],
  power_of_attorney: ['powerOfAttorneyPrincipalName', 'powerOfAttorneyPrincipalIdNumber', 'powerOfAttorneyName', 'powerOfAttorneyEmail', 'powerOfAttorneyPhone', 'powerOfAttorneyAuthorityDetails'],
  other: ['otherEntityName', 'otherEntityRegistrationNumber', 'otherAuthorityDetails'],
  foreign: ['foreignOwnerCountry', 'foreignPassportNumber', 'foreignRegistrationNumber', 'foreignResidencyStatus'],
})

function branchDetailFamily(branch = '') {
  if (['company', 'close_corporation', 'foreign_company'].includes(branch)) return 'company'
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
      ['name', 'surname', 'email', 'phone', 'idNumber', 'nationality', 'residentialAddress', 'ownershipShare', 'controlBasis', 'fullName'].some((key) => normalizeText(person[key])) ||
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
    next[field] = ['multipleOwners', 'companyDirectors', 'companyBeneficialOwners', 'trustees', 'trustFounders', 'trustBeneficiaries'].includes(field) ? [] : ''
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

// A supplied blank is a saved clearing; only absent keys may use legacy fallbacks.
function savedField(source, keys, ...fallbacks) {
  for (const key of keys) if (Object.hasOwn(source, key) && source[key] !== undefined) return source[key] ?? ''
  return fallbacks.find((value) => value !== undefined)
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

export function getListingSellerFormData(listing = {}) {
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
    ...(sellerFacts.contact ? [sellerFacts.contact] : sellerFacts.primary_contact ? [sellerFacts.primary_contact] : []),
    propertyFacts,
    canonicalFacts,
    listing?.seller_onboarding_form_data,
    listing?.sellerOnboardingFormData,
    onboarding.form_data,
    onboarding.formData,
  )
}

function getCanonicalFacts(listing = {}) {
  const onboarding = listing.sellerOnboarding || listing.seller_onboarding || {}
  const form = onboarding.formData || onboarding.form_data || listing.sellerOnboardingFormData || listing.seller_onboarding_form_data || {}
  return [onboarding.storedCanonicalFacts, onboarding.canonicalFacts, onboarding.canonical_facts_json,
    listing.sellerCanonicalFacts, listing.seller_canonical_facts_json, form.canonicalSellerFacts, form.canonicalFacts, form.canonical_facts]
    .find((facts) => facts && typeof facts === 'object' && !Array.isArray(facts) && Object.keys(facts).length) || {}
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
  const mandateTerms = readSellerMandateTerms(form, listing)
  const mandateDraft = listing?.mandateDraft && typeof listing.mandateDraft === 'object' ? listing.mandateDraft : {}
  const facts = getCanonicalFacts(listing)
  const sellerFacts = facts.seller && typeof facts.seller === 'object' ? facts.seller : facts
  const canonicalCompany = form.company || sellerFacts.company || {}
  const canonicalTrust = form.trust || sellerFacts.trust || {}
  const canonicalSignatory = canonicalCompany.authorised_signatory || canonicalCompany.authorisedSignatory || {}
  const canonicalTrustee = canonicalTrust.authorised_trustee || canonicalTrust.authorisedTrustee || {}
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
    name: savedField(form, ['sellerFirstName', 'firstName', 'first_name'], sellerFacts.first_name, ['individual', 'married', 'foreign_individual'].includes(branch) ? split.firstName : ''),
    surname: savedField(form, ['sellerSurname', 'lastName', 'surname', 'last_name'], sellerFacts.surname, ['individual', 'married', 'foreign_individual'].includes(branch) ? split.surname : ''),
    email: savedField(form, ['email', 'sellerEmail']) ?? savedField(sellerFacts.contact || {}, ['email'], sellerFacts.email, listing?.sellerEmail, listing?.seller?.email, mandateDraft.sellerEmail),
    phone: savedField(form, ['phone', 'sellerPhone', 'mobile']) ?? savedField(sellerFacts.contact || {}, ['phone'], sellerFacts.phone, listing?.sellerPhone, listing?.seller?.phone, mandateDraft.sellerPhone),
    idNumber: savedField(form, ['idNumber', 'id_number', 'sellerIdNumber'], sellerFacts.id_number, mandateDraft.sellerIdNumber),
  }
  const savedOwners = savedField(form, ['multipleOwners', 'owners'], sellerFacts.owners, mandateDraft.sellerParties) || []
  const propertyCategory = normalizePropertyCategory(savedField(form, ['propertyCategory'], canonicalProperty.property_category, listing?.propertyCategory), { fallback: 'residential' })
  const propertyTypeOptions = getPropertyTypeOptionsByCategory(propertyCategory)
  const savedPropertyType = normalizeText(savedField(form, ['propertyType'], canonicalProperty.property_type, listing?.propertyType))
  const bondStatus = resolveSellerBondStatus(form.bondStatus, form.propertyBondStatus, form.bond_status, form.existingBond, form.sellerHasExistingBond, form.bondExists, canonicalFinance.existing_bond)

  return {
    branch,
    primaryContactName: normalizeText(savedField(form, ['primaryContactName', 'primary_contact_name', 'contactName'], sellerFacts.contact?.name ?? sellerFacts.primary_contact?.name, [form.sellerFirstName, form.sellerSurname].filter(Boolean).join(' ') || undefined, listing?.seller?.name, listing?.sellerName)),
    sellerFirstName: normalizeText(ownerFallback.name),
    sellerSurname: normalizeText(ownerFallback.surname),
    email: normalizeText(ownerFallback.email).toLowerCase(),
    phone: normalizeText(ownerFallback.phone),
    idNumber: normalizeText(ownerFallback.idNumber),
    residentialAddress: normalizeText(savedField(form, ['residentialAddress', 'residential_address', 'residentialStreet', 'physicalAddress']) ?? sellerFacts.residential_address),
    dateOfBirth: normalizeText(savedField(form, ['dateOfBirth', 'date_of_birth', 'birthDate']) ?? sellerFacts.date_of_birth),
    nationality: normalizeText(savedField(form, ['nationality']) ?? sellerFacts.nationality),
    incomeTaxNumber: normalizeText(savedField(form, ['incomeTaxNumber', 'income_tax_number', 'sellerTaxNumber', 'taxNumber', 'tax_number']) ?? sellerFacts.tax_number),
    saResident: sellerYesNoValue(savedField(form, ['saResident', 'sa_resident'], sellerFacts.sa_resident)),
    taxResident: sellerYesNoValue(savedField(form, ['taxResident', 'tax_resident'], sellerFacts.tax_resident)),
    maritalRegime: normalizeText(savedField(form, ['maritalRegime', 'marital_regime'], sellerFacts.marital_regime, normalizeMaritalRegime(form))),
    vatRegistered: sellerYesNoValue(savedField(form, ['vatRegistered', 'vat_registered']) ?? sellerFacts.vat_registered),
    alternativeContact: normalizeText(savedField(form, ['alternativeContact', 'alternativeNumber', 'alternative_number', 'alternatePhone', 'alternate_phone', 'alternateContact', 'secondaryPhone', 'alternativePhone'])),
    preferredContactMethod: normalizeText(savedField(form, ['preferredContactMethod', 'contactPreference'])),
    vatNumber: normalizeText(savedField(form, ['vatNumber', 'vat_number']) ?? sellerFacts.vat_number),
    spousePhone: normalizeText(savedField(form, ['spousePhone'], form.spouse?.phone, sellerFacts.spouse?.phone)),
    authorisedSignatoryPhone: normalizeText(savedField(form, ['authorisedSignatoryPhone', 'authorised_signatory_phone']) ?? canonicalSignatory.phone),
    authorisedTrusteePhone: normalizeText(savedField(form, ['authorisedTrusteePhone', 'authorised_trustee_phone']) ?? canonicalTrustee.phone),
    executorPhone: normalizeText(savedField(form, ['executorPhone']) ?? sellerFacts.deceased_estate?.executors?.[0]?.phone),
    powerOfAttorneyPhone: normalizeText(savedField(form, ['powerOfAttorneyPhone']) ?? sellerFacts.power_of_attorney?.representatives?.[0]?.phone),
    maritalStatus: (() => { const status = normalizeText(savedField(form, ['maritalStatus', 'marital_status'], sellerFacts.marital_status)); return status.startsWith('married') ? 'married' : ['not_married', 'never_married'].includes(status) ? 'single' : status })(),
    spouseName: normalizeText(savedField(form, ['spouseName', 'spouseFullName'], form.spouse?.fullName, form.spouse?.full_name, form.spouse?.name, sellerFacts.spouse?.name)),
    spouseEmail: normalizeText(savedField(form, ['spouseEmail'], form.spouse?.email, sellerFacts.spouse?.email)).toLowerCase(),
    spouseIdNumber: normalizeText(savedField(form, ['spouseIdNumber'], form.spouse?.idNumber, form.spouse?.id_number, sellerFacts.spouse?.id_number)),
    multipleOwners: normalizePersonCollectionForSellerProfile(savedOwners, Object.hasOwn(form, 'multipleOwners') || Object.hasOwn(form, 'owners') ? null : ownerFallback, 'Owner'),
    executors: normalizePersonCollectionForSellerProfile(savedField(form, ['executors'], sellerFacts.deceased_estate?.executors) || [], null, 'Executor'),
    powerOfAttorneyRepresentatives: normalizePersonCollectionForSellerProfile(savedField(form, ['powerOfAttorneyRepresentatives'], sellerFacts.power_of_attorney?.representatives) || [], null, 'Representative'),
    companyAuthorityBasis: normalizeText(savedField(form, ['companyAuthorityBasis', 'company_authority_basis'], canonicalCompany.authority_basis)),
    companyResolutionDate: normalizeText(savedField(form, ['companyResolutionDate', 'company_resolution_date'], canonicalCompany.resolution_date)),
    trustAuthorityBasis: normalizeText(savedField(form, ['trustAuthorityBasis', 'trust_authority_basis'], canonicalTrust.authority_basis)),
    executorAuthorityDetails: normalizeText(savedField(form, ['executorAuthorityDetails'], sellerFacts.deceased_estate?.authority_details)),
    powerOfAttorneyAuthorityDetails: normalizeText(savedField(form, ['powerOfAttorneyAuthorityDetails'], sellerFacts.power_of_attorney?.authority_details)),
    otherAuthorityDetails: normalizeText(savedField(form, ['otherAuthorityDetails'], sellerFacts.other_entity?.authority_details)),
    companyName: normalizeText(savedField(form, ['companyName', 'company_name'], canonicalCompany.name)),
    companyRegistrationNumber: normalizeText(savedField(form, ['companyRegistrationNumber', 'foreignRegistrationNumber'], canonicalCompany.registration_number, canonicalCompany.registrationNumber)),
    companyRegisteredAddress: normalizeText(savedField(form, ['companyRegisteredAddress', 'company_registered_address'], canonicalCompany.registered_address, canonicalCompany.registeredAddress)),
    companyDirectors: normalizePersonCollectionForSellerProfile(savedField(form, ['companyDirectors', 'company_directors', 'directors'], canonicalCompany.directors) || [], null, 'Director'),
    companyBeneficialOwners: normalizePersonCollectionForSellerProfile(savedField(form, ['companyBeneficialOwners', 'company_beneficial_owners']) ?? canonicalCompany.beneficial_owners ?? [], null, 'Beneficial Owner'),
    authorisedSignatoryName: normalizeText(savedField(form, ['authorisedSignatoryName', 'authorised_signatory_name'], canonicalSignatory.full_name, canonicalSignatory.name)),
    authorisedSignatoryCapacity: normalizeText(savedField(form, ['authorisedSignatoryCapacity', 'authorised_signatory_capacity'], canonicalSignatory.capacity)),
    authorisedSignatoryEmail: normalizeText(savedField(form, ['authorisedSignatoryEmail', 'authorised_signatory_email'], canonicalSignatory.email)).toLowerCase(),
    authorisedSignatoryIdNumber: normalizeText(savedField(form, ['authorisedSignatoryIdNumber', 'authorised_signatory_id_number'], canonicalSignatory.id_number)),
    authorisedSignatoryNationality: normalizeText(savedField(form, ['authorisedSignatoryNationality', 'authorised_signatory_nationality'], canonicalSignatory.nationality)),
    authorisedSignatoryAddress: normalizeText(savedField(form, ['authorisedSignatoryAddress', 'authorised_signatory_address'], canonicalSignatory.residential_address)),
    trustName: normalizeText(savedField(form, ['trustName', 'trust_name'], canonicalTrust.name)),
    trustRegistrationNumber: normalizeText(savedField(form, ['trustRegistrationNumber', 'foreignRegistrationNumber'], canonicalTrust.registration_number, canonicalTrust.registrationNumber)),
    trustRegisteredAddress: normalizeText(savedField(form, ['trustRegisteredAddress', 'trust_registered_address'], canonicalTrust.registered_address, canonicalTrust.registeredAddress)),
    trustees: normalizePersonCollectionForSellerProfile(savedField(form, ['trustees', 'trust_trustees'], canonicalTrust.trustees) || [], null, 'Trustee'),
    trustFounders: normalizePersonCollectionForSellerProfile(savedField(form, ['trustFounders', 'trust_founders']) ?? canonicalTrust.founders ?? [], null, 'Founder'),
    trustBeneficiaries: normalizePersonCollectionForSellerProfile(savedField(form, ['trustBeneficiaries', 'trust_beneficiaries', 'beneficiaries']) ?? canonicalTrust.beneficiaries ?? [], null, 'Beneficiary'),
    trustBeneficiaryClass: normalizeText(savedField(form, ['trustBeneficiaryClass', 'trust_beneficiary_class']) ?? canonicalTrust.beneficiary_class),
    authorisedTrusteeName: normalizeText(savedField(form, ['authorisedTrusteeName', 'authorised_trustee_name'], canonicalTrustee.full_name, canonicalTrustee.name)),
    authorisedTrusteeCapacity: normalizeText(savedField(form, ['authorisedTrusteeCapacity', 'authorised_trustee_capacity'], canonicalTrustee.capacity)),
    authorisedTrusteeEmail: normalizeText(savedField(form, ['authorisedTrusteeEmail', 'authorised_trustee_email'], canonicalTrustee.email)).toLowerCase(),
    authorisedTrusteeIdNumber: normalizeText(savedField(form, ['authorisedTrusteeIdNumber', 'authorised_trustee_id_number'], canonicalTrustee.id_number)),
    authorisedTrusteeNationality: normalizeText(savedField(form, ['authorisedTrusteeNationality', 'authorised_trustee_nationality'], canonicalTrustee.nationality)),
    authorisedTrusteeAddress: normalizeText(savedField(form, ['authorisedTrusteeAddress', 'authorised_trustee_address'], canonicalTrustee.residential_address)),
    occupation: normalizeText(savedField(form, ['occupation']) ?? sellerFacts.occupation),
    sourceOfFunds: normalizeText(savedField(form, ['sourceOfFunds', 'source_of_funds']) ?? sellerFacts.source_of_funds),
    politicallyExposedPerson: sellerYesNoValue(savedField(form, ['politicallyExposedPerson', 'politically_exposed_person']) ?? sellerFacts.politically_exposed_person),
    politicallyExposedDetails: normalizeText(savedField(form, ['politicallyExposedDetails', 'politically_exposed_details']) ?? sellerFacts.politically_exposed_details),
    deceasedEstateName: normalizeText(savedField(form, ['deceasedEstateName'], sellerFacts.deceased_estate?.name)),
    estateReferenceNumber: normalizeText(savedField(form, ['estateReferenceNumber', 'deceasedEstateReferenceNumber', 'estateReference'], sellerFacts.deceased_estate?.reference_number, sellerFacts.deceased_estate?.estate_reference)),
    executorName: normalizeText(savedField(form, ['executorName'], sellerFacts.deceased_estate?.executors?.[0]?.full_name, sellerFacts.deceased_estate?.executors?.[0]?.name)),
    executorEmail: normalizeText(savedField(form, ['executorEmail'], sellerFacts.deceased_estate?.executors?.[0]?.email)).toLowerCase(),
    powerOfAttorneyPrincipalName: normalizeText(savedField(form, ['powerOfAttorneyPrincipalName', 'power_of_attorney_principal_name'], sellerFacts.power_of_attorney?.principal?.full_name, sellerFacts.power_of_attorney?.principal?.name)),
    powerOfAttorneyPrincipalIdNumber: normalizeText(savedField(form, ['powerOfAttorneyPrincipalIdNumber', 'power_of_attorney_principal_id_number'], sellerFacts.power_of_attorney?.principal?.id_number)),
    powerOfAttorneyName: normalizeText(savedField(form, ['powerOfAttorneyName', 'power_of_attorney_name'], sellerFacts.power_of_attorney?.representatives?.[0]?.full_name, sellerFacts.power_of_attorney?.representatives?.[0]?.name)),
    powerOfAttorneyEmail: normalizeText(savedField(form, ['powerOfAttorneyEmail', 'power_of_attorney_email'], sellerFacts.power_of_attorney?.representatives?.[0]?.email)).toLowerCase(),
    otherEntityName: normalizeText(savedField(form, ['otherEntityName', 'entityName'], sellerFacts.other_entity?.name)),
    otherEntityRegistrationNumber: normalizeText(savedField(form, ['otherEntityRegistrationNumber', 'entityRegistrationNumber'], sellerFacts.other_entity?.registration_number)),
    foreignOwnerCountry: normalizeText(savedField(form, ['foreignOwnerCountry'], sellerFacts.foreign?.country)),
    foreignPassportNumber: normalizeText(savedField(form, ['foreignPassportNumber'], sellerFacts.foreign?.passport_number, sellerFacts.foreign?.passportNumber)),
    foreignRegistrationNumber: normalizeText(savedField(form, ['foreignRegistrationNumber'], sellerFacts.foreign?.registration_number, sellerFacts.foreign?.registrationNumber)),
    foreignResidencyStatus: normalizeText(savedField(form, ['foreignResidencyStatus'], sellerFacts.foreign?.residency_status, sellerFacts.foreign?.residencyStatus)),
    propertyAddress: normalizeText(savedField(form, ['propertyAddress', 'addressLine1'], canonicalProperty.address, listing?.propertyAddress, listing?.addressLine1, listing?.formattedAddress, listing?.listingTitle)),
    propertyStructureType: normalizeText(savedField(form, ['propertyStructureType'], canonicalProperty.property_structure_type, listing?.propertyStructureType, 'full_title')),
    propertyCategory,
    propertyType: savedPropertyType || propertyTypeOptions[0]?.value || '',
    schemeName: normalizeText(savedField(form, ['schemeName'], canonicalProperty.scheme?.name, canonicalProperty.scheme_name)),
    sectionNumber: normalizeText(savedField(form, ['sectionNumber'], canonicalProperty.scheme?.section_number, canonicalProperty.section_number)),
    unitNumber: normalizeText(savedField(form, ['unitNumber'], canonicalProperty.scheme?.unit_number, canonicalProperty.unit_number)),
    schemeBodyCorporateName: normalizeText(savedField(form, ['schemeBodyCorporateName'], canonicalProperty.scheme?.body_corporate_name)),
    schemeManagingAgentName: normalizeText(savedField(form, ['schemeManagingAgentName'], canonicalProperty.scheme?.managing_agent?.name)),
    schemeManagingAgentEmail: normalizeText(savedField(form, ['schemeManagingAgentEmail'], canonicalProperty.scheme?.managing_agent?.email)),
    schemeManagingAgentPhone: normalizeText(savedField(form, ['schemeManagingAgentPhone'], canonicalProperty.scheme?.managing_agent?.phone)),
    schemeLevies: normalizeText(savedField(form, ['schemeLevies'], canonicalProperty.scheme?.levies)),
    schemeRulesAvailable: Boolean(form.schemeRulesAvailable ?? canonicalProperty.scheme?.rules ?? false),
    titleDeedNumber: normalizeText(savedField(form, ['titleDeedNumber', 'deedNumber', 'titleReference'])),
    bondStatus,
    bondHolder: bondStatus === 'bonded' ? normalizeText(savedField(form, ['bondHolder', 'bondBank', 'mortgageBank'], canonicalFinance.bond_bank)) : '',
    bondAccountReference: bondStatus === 'bonded' ? normalizeText(savedField(form, ['bondAccountReference'], canonicalFinance.bond_account_reference)) : '',
    outstandingBond: bondStatus === 'bonded' ? normalizeText(savedField(form, ['outstandingBond', 'estimatedSettlementAmount', 'bondSettlementAmount'], canonicalFinance.estimated_settlement_amount)) : '',
    multipleBonds: bondStatus === 'bonded' && Boolean(form.multipleBonds ?? canonicalFinance.multiple_bonds ?? false),
    accessBond: bondStatus === 'bonded' && Boolean(form.accessBond ?? canonicalFinance.access_bond ?? false),
    cancellationRequired: bondStatus === 'bonded' && Boolean(form.cancellationRequired ?? canonicalFinance.cancellation_required ?? false),
    coOwnerDetails: normalizeText(savedField(form, ['coOwnerDetails', 'coOwners'])),
    ratesTaxes: normalizeText(savedField(form, ['ratesTaxes'], listing?.ratesTaxes)),
    levies: normalizeText(savedField(form, ['levies'], listing?.levies)),
    leviesNotApplicable: Boolean(savedField(form, ['leviesNotApplicable', 'levies_not_applicable']) ?? false),
    waterBillingType: normalizeText(savedField(form, ['waterBillingType', 'water_billing_type'], 'municipal')),
    mandateType: Object.hasOwn(form, 'mandateType') ? mandateTerms.mandateType : mandateTerms.mandateType || normalizeText(listing?.mandate?.type) || 'sole',
    otherAgencyName: normalizeText(savedField(form, ['otherAgencyName', 'coAgencyName'])),
    askingPrice: mandateTerms.askingPrice,
    mandateStartDate: mandateTerms.startDate,
    expiryDate: mandateTerms.endDate,
    mandateDuration: mandateTerms.mandateDuration,
    protectionPeriod: mandateTerms.protectionPeriod,
    commissionBasis: mandateTerms.commissionBasis,
    commissionPercentage: mandateTerms.commissionPercentage,
    commissionAmount: mandateTerms.commissionAmount,
    vatHandling: mandateTerms.vatHandling,
    ...(form.mandateCapture !== undefined ? { mandateCapture: mandateTerms.mandateCapture } : {}),
    ...(mandateTerms.mandateAcceptanceReview ? { mandateAcceptanceReview: mandateTerms.mandateAcceptanceReview } : {}),
    commissionPreference: normalizeText(savedField(form, ['commissionPreference', 'commissionType', 'commissionStructure'])),
    mandateTerms: normalizeText(savedField(form, ['mandateTerms', 'mandateCommissionTerms'])),
    popiConsent: sellerPopiConsentDisplayValue(form),
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
  if (field === 'maritalStatus' && ['single', 'divorced', 'widowed', 'not_married'].includes(value)) next.maritalRegime = 'not_applicable'
  return next
}

function resolveOwnerModel(branch) {
  if (!branch) return { ownerEntityType: '', ownerStructureType: '', sellerLegalType: '' }
  if (branch === 'close_corporation') return { ownerEntityType: 'close_corporation', ownerStructureType: 'close_corporation', sellerLegalType: 'close_corporation' }
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
  const capturedMandateTerms = buildSellerMandateTermsFormPatch({ ...draft, mandateType: draft.mandateType ?? 'sole', startDate: draft.mandateStartDate, endDate: draft.expiryDate, specialConditions: draft.mandateTerms })
  const branch = normalizeBranch(draft.branch, '')
  const ownerModel = resolveOwnerModel(branch)
  const bondStatus = resolveSellerBondStatus(draft.bondStatus)
  const fullName = [draft.sellerFirstName, draft.sellerSurname].map(normalizeText).filter(Boolean).join(' ')
  const entityName = ['company', 'close_corporation', 'foreign_company'].includes(branch)
    ? normalizeText(draft.companyName)
    : branch === 'trust' || branch === 'foreign_trust'
      ? normalizeText(draft.trustName)
      : branch === 'deceased_estate'
        ? normalizeText(draft.deceasedEstateName)
        : branch === 'power_of_attorney'
          ? normalizeText(draft.powerOfAttorneyPrincipalName)
          : branch === 'other'
            ? normalizeText(draft.otherEntityName)
            : ''
  const maritalStatus = normalizeText(draft.maritalStatus)
  const normalizedMaritalStatus = maritalStatus.toLowerCase()
  const maritalRegime = ['single', 'not married', 'not-married', 'not_married', 'notmarried', 'unmarried', 'never married', 'never-married', 'never_married'].includes(normalizedMaritalStatus)
    ? 'not_applicable'
    : draft.maritalRegime !== undefined ? normalizeText(draft.maritalRegime) : normalizeMaritalRegime({ maritalStatus })
  const base = {
    companyAuthorityBasis: normalizeText(draft.companyAuthorityBasis),
    companyResolutionDate: normalizeText(draft.companyResolutionDate),
    trustAuthorityBasis: normalizeText(draft.trustAuthorityBasis),
    executorAuthorityDetails: normalizeText(draft.executorAuthorityDetails),
    powerOfAttorneyAuthorityDetails: normalizeText(draft.powerOfAttorneyAuthorityDetails),
    otherAuthorityDetails: normalizeText(draft.otherAuthorityDetails),
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
    primaryContactName: normalizeText(draft.primaryContactName) || fullName,
    contactName: normalizeText(draft.primaryContactName) || fullName,
    email: normalizeText(draft.email).toLowerCase(),
    sellerEmail: normalizeText(draft.email).toLowerCase(),
    phone: normalizeText(draft.phone),
    sellerPhone: normalizeText(draft.phone),
    mobile: normalizeText(draft.phone),
    alternativeContact: normalizeText(draft.alternativeContact),
    alternateContact: normalizeText(draft.alternativeContact),
    alternativeNumber: normalizeText(draft.alternativeContact),
    alternative_number: normalizeText(draft.alternativeContact),
    vatNumber: normalizeText(draft.vatNumber),
    vat_number: normalizeText(draft.vatNumber),
    preferredContactMethod: normalizeText(draft.preferredContactMethod),
    contactPreference: normalizeText(draft.preferredContactMethod),
    idNumber: normalizeText(draft.idNumber),
    sellerIdNumber: normalizeText(draft.idNumber),
    residentialAddress: normalizeText(draft.residentialAddress),
    residential_address: normalizeText(draft.residentialAddress),
    residentialStreet: normalizeText(draft.residentialAddress),
    dateOfBirth: normalizeText(draft.dateOfBirth),
    date_of_birth: normalizeText(draft.dateOfBirth),
    nationality: normalizeText(draft.nationality),
    incomeTaxNumber: normalizeText(draft.incomeTaxNumber),
    income_tax_number: normalizeText(draft.incomeTaxNumber),
    sellerTaxNumber: normalizeText(draft.incomeTaxNumber),
    taxNumber: normalizeText(draft.incomeTaxNumber),
    tax_number: normalizeText(draft.incomeTaxNumber),
    saResident: normalizeText(draft.saResident),
    sa_resident: normalizeText(draft.saResident),
    taxResident: normalizeText(draft.taxResident),
    tax_resident: normalizeText(draft.taxResident),
    vatRegistered: normalizeText(draft.vatRegistered),
    vat_registered: normalizeText(draft.vatRegistered),
    maritalStatus,
    maritalRegime,
    marital_status: maritalStatus,
    marital_regime: maritalRegime,
    spouseName: normalizeText(draft.spouseName),
    spouseEmail: normalizeText(draft.spouseEmail).toLowerCase(),
    spouseIdNumber: normalizeText(draft.spouseIdNumber),
    spousePhone: normalizeText(draft.spousePhone),
    propertyAddress: normalizeText(draft.propertyAddress),
    addressLine1: normalizeText(draft.propertyAddress),
    propertyStructureType: normalizeText(draft.propertyStructureType) || 'full_title',
    propertyCategory: normalizePropertyCategory(draft.propertyCategory, { fallback: 'residential' }),
    propertyType: normalizeText(draft.propertyType) || getPropertyTypeOptionsByCategory(draft.propertyCategory)[0]?.value || 'house',
    sectionalTitle: ['sectional_title', 'share_block'].includes(normalizePropertyStructureType(draft.propertyStructureType, { fallback: '' })),
    bodyCorporate: ['sectional_title', 'share_block'].includes(normalizePropertyStructureType(draft.propertyStructureType, { fallback: '' })),
    schemeName: normalizeText(draft.schemeName),
    sectionNumber: normalizeText(draft.sectionNumber),
    unitNumber: normalizeText(draft.unitNumber),
    schemeBodyCorporateName: normalizeText(draft.schemeBodyCorporateName),
    schemeManagingAgentName: normalizeText(draft.schemeManagingAgentName),
    schemeManagingAgentEmail: normalizeText(draft.schemeManagingAgentEmail),
    schemeManagingAgentPhone: normalizeText(draft.schemeManagingAgentPhone),
    schemeLevies: normalizeText(draft.schemeLevies),
    schemeRulesAvailable: Boolean(draft.schemeRulesAvailable),
    titleDeedNumber: normalizeText(draft.titleDeedNumber),
    deedNumber: normalizeText(draft.titleDeedNumber),
    bondStatus: bondStatus,
    propertyBondStatus: bondStatus,
    existingBond: sellerBondDeclaration(bondStatus),
    sellerHasExistingBond: sellerBondDeclaration(bondStatus),
    bondedProperty: sellerBondDeclaration(bondStatus),
    bondHolder: bondStatus === 'bonded' ? normalizeText(draft.bondHolder) : '',
    bondBank: bondStatus === 'bonded' ? normalizeText(draft.bondHolder) : '',
    currentBondBank: bondStatus === 'bonded' ? normalizeText(draft.bondHolder) : '',
    bondAccountReference: bondStatus === 'bonded' ? normalizeText(draft.bondAccountReference) : '',
    currentBondAccountNumber: bondStatus === 'bonded' ? normalizeText(draft.bondAccountReference) : '',
    outstandingBond: bondStatus === 'bonded' ? normalizeText(draft.outstandingBond) : '',
    estimatedSettlementAmount: bondStatus === 'bonded' ? normalizeText(draft.outstandingBond) : '',
    bondSettlementAmount: bondStatus === 'bonded' ? normalizeText(draft.outstandingBond) : '',
    multipleBonds: bondStatus === 'bonded' && Boolean(draft.multipleBonds),
    accessBond: bondStatus === 'bonded' && Boolean(draft.accessBond),
    cancellationRequired: bondStatus === 'bonded' && Boolean(draft.cancellationRequired),
    coOwnerDetails: normalizeText(draft.coOwnerDetails),
    coOwners: normalizeText(draft.coOwnerDetails),
    ratesTaxes: normalizeText(draft.ratesTaxes),
    levies: normalizeText(draft.levies),
    leviesNotApplicable: Boolean(draft.leviesNotApplicable),
    waterBillingType: normalizeText(draft.waterBillingType),
    mandateType: normalizeText(draft.mandateType) || 'sole',
    otherAgencyName: normalizeText(draft.otherAgencyName),
    coAgencyName: normalizeText(draft.otherAgencyName),
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
    occupation: normalizeText(draft.occupation),
    sourceOfFunds: normalizeText(draft.sourceOfFunds),
    source_of_funds: normalizeText(draft.sourceOfFunds),
    politicallyExposedPerson: normalizeText(draft.politicallyExposedPerson),
    politically_exposed_person: normalizeText(draft.politicallyExposedPerson),
    politicallyExposedDetails: normalizeText(draft.politicallyExposedDetails),
    politically_exposed_details: normalizeText(draft.politicallyExposedDetails),
    ...buildSellerPopiConsentPatch(draft, Object.hasOwn(draft, 'popiConsentAccepted') ? draft.popiConsentAccepted : draft.popiConsent),
    ...capturedMandateTerms,
  }

  if (branch === 'multiple_owners') {
    base.multipleOwners = normalizePersonCollectionForSellerProfile(draft.multipleOwners || [], null, 'Owner')
    base.owners = base.multipleOwners
  }
  if (['company', 'close_corporation', 'foreign_company'].includes(branch)) {
    base.companyName = normalizeText(draft.companyName)
    base.companyRegistrationNumber = normalizeText(draft.companyRegistrationNumber)
    base.companyRegisteredAddress = normalizeText(draft.companyRegisteredAddress)
    base.companyDirectors = normalizePersonCollectionForSellerProfile(draft.companyDirectors || [], null, 'Director')
    base.companyBeneficialOwners = normalizePersonCollectionForSellerProfile(draft.companyBeneficialOwners || [], null, 'Beneficial Owner')
    base.directors = base.companyDirectors
    base.authorisedSignatoryName = normalizeText(draft.authorisedSignatoryName)
    base.authorisedSignatoryCapacity = normalizeText(draft.authorisedSignatoryCapacity)
    base.authorisedSignatoryEmail = normalizeText(draft.authorisedSignatoryEmail).toLowerCase()
    base.authorisedSignatoryIdNumber = normalizeText(draft.authorisedSignatoryIdNumber)
    base.authorisedSignatoryNationality = normalizeText(draft.authorisedSignatoryNationality)
    base.authorisedSignatoryAddress = normalizeText(draft.authorisedSignatoryAddress)
    base.authorisedSignatoryPhone = normalizeText(draft.authorisedSignatoryPhone)
  }
  if (branch === 'trust' || branch === 'foreign_trust') {
    base.trustName = normalizeText(draft.trustName)
    base.trustRegistrationNumber = normalizeText(draft.trustRegistrationNumber)
    base.trustRegisteredAddress = normalizeText(draft.trustRegisteredAddress)
    base.trustees = normalizePersonCollectionForSellerProfile(draft.trustees || [], null, 'Trustee')
    base.trustFounders = normalizePersonCollectionForSellerProfile(draft.trustFounders || [], null, 'Founder')
    base.trustBeneficiaries = normalizePersonCollectionForSellerProfile(draft.trustBeneficiaries || [], null, 'Beneficiary')
    base.trustBeneficiaryClass = normalizeText(draft.trustBeneficiaryClass)
    base.beneficiaries = base.trustBeneficiaries
    base.authorisedTrusteeName = normalizeText(draft.authorisedTrusteeName)
    base.authorisedTrusteeCapacity = normalizeText(draft.authorisedTrusteeCapacity)
    base.authorisedTrusteeEmail = normalizeText(draft.authorisedTrusteeEmail).toLowerCase()
    base.authorisedTrusteeIdNumber = normalizeText(draft.authorisedTrusteeIdNumber)
    base.authorisedTrusteeNationality = normalizeText(draft.authorisedTrusteeNationality)
    base.authorisedTrusteeAddress = normalizeText(draft.authorisedTrusteeAddress)
    base.authorisedTrusteePhone = normalizeText(draft.authorisedTrusteePhone)
  }
  if (branch === 'deceased_estate') {
    base.deceasedEstateName = normalizeText(draft.deceasedEstateName)
    base.estateReferenceNumber = normalizeText(draft.estateReferenceNumber)
    base.estateReference = base.estateReferenceNumber
    base.executorName = normalizeText(draft.executorName)
    base.executorEmail = normalizeText(draft.executorEmail).toLowerCase()
    base.executorPhone = normalizeText(draft.executorPhone)
    base.executors = draft.executors?.length ? normalizePersonCollectionForSellerProfile(draft.executors, null, 'Executor') : base.executorName ? [{ name: base.executorName, fullName: base.executorName, email: base.executorEmail, roleTitle: 'Executor', signingAuthority: true }] : []
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
    base.powerOfAttorneyPhone = normalizeText(draft.powerOfAttorneyPhone)
    base.powerOfAttorneyRepresentatives = normalizePersonCollectionForSellerProfile(draft.powerOfAttorneyRepresentatives || [], null, 'Representative')
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
    base.foreignRegistrationNumber = normalizeText(branch === 'foreign_company' ? draft.companyRegistrationNumber || draft.foreignRegistrationNumber : branch === 'foreign_trust' ? draft.trustRegistrationNumber || draft.foreignRegistrationNumber : '')
    base.foreignResidencyStatus = normalizeText(draft.foreignResidencyStatus)
  }

  const collectionFields = new Set(['multipleOwners', 'companyDirectors', 'companyBeneficialOwners', 'trustees', 'trustFounders', 'trustBeneficiaries'])
  for (const [family, fields] of Object.entries(BRANCH_DETAIL_FIELDS)) {
    const active = family === branchDetailFamily(branch) || (family === 'foreign' && branch.startsWith('foreign_')) ||
      (family === 'married' && String(draft.maritalStatus || '').startsWith('married'))
    for (const field of fields) {
      if (!active) base[field] = collectionFields.has(field) ? [] : ''
      else if (!Object.hasOwn(base, field)) base[field] = draft[field] ?? (collectionFields.has(field) ? [] : '')
    }
  }
  if (branch !== 'multiple_owners') Object.assign(base, { owners: [], coOwners: '' })
  if (branch !== 'deceased_estate') Object.assign(base, { executors: [], deceased_estate: {}, estateReference: '' })
  if (branch !== 'power_of_attorney') Object.assign(base, { powerOfAttorneyRepresentatives: [], power_of_attorney: {}, power_of_attorney_name: '', power_of_attorney_email: '', power_of_attorney_principal_name: '', power_of_attorney_principal_id_number: '' })
  if (branch !== 'other') base.other_entity = {}
  const aliases = buildSellerEntityProfileAliases(base)
  const patch = { ...compactObject(base), ...aliases, ...capturedMandateTerms }
  for (const fields of Object.values(BRANCH_DETAIL_FIELDS)) {
    for (const field of fields) patch[field] = base[field]
  }
  // These legacy/nested aliases must carry explicit empty values through the
  // database's form-data merge when their ownership branch is no longer active.
  for (const key of ['owners', 'coOwners', 'executors', 'deceased_estate', 'estateReference',
    'powerOfAttorneyRepresentatives', 'power_of_attorney', 'power_of_attorney_name',
    'power_of_attorney_email', 'power_of_attorney_principal_name',
    'power_of_attorney_principal_id_number', 'other_entity']) {
    if (Object.hasOwn(base, key)) patch[key] = base[key]
  }
  for (const key of ['sellerName', 'fullName', 'sellerFirstName', 'sellerSurname', 'firstName', 'lastName', 'primaryContactName', 'contactName', 'idNumber', 'residentialAddress']) patch[key] = base[key] ?? ''
  // Profile edits must carry intentional clears through the saved-data merge.
  for (const key of ['residential_address', 'residentialStreet', 'dateOfBirth', 'date_of_birth', 'nationality',
    'incomeTaxNumber', 'income_tax_number', 'sellerTaxNumber', 'taxNumber', 'tax_number',
    'saResident', 'sa_resident', 'taxResident', 'tax_resident', 'vatRegistered', 'vat_registered', 'vatNumber', 'vat_number',
    'alternativeContact', 'alternateContact', 'alternativeNumber', 'alternative_number',
    'occupation', 'sourceOfFunds', 'source_of_funds', 'politicallyExposedPerson', 'politically_exposed_person',
    'politicallyExposedDetails', 'politically_exposed_details', 'popiConsentAcceptedAt', 'popi_consent_accepted_at']) {
    if (Object.hasOwn(base, key)) patch[key] = base[key]
  }
  // Optional contacts and dual-agency details can be deliberately cleared.
  for (const key of ['email', 'sellerEmail', 'phone', 'sellerPhone', 'mobile', 'otherAgencyName', 'coAgencyName', 'spouseEmail', 'authorisedSignatoryEmail', 'authorisedTrusteeEmail', 'executorEmail', 'powerOfAttorneyEmail']) {
    if (Object.hasOwn(base, key)) patch[key] = base[key]
  }
  // Empty strings normally disappear from patches. An explicit "no bond" must
  // clear old bond values when this patch is merged into saved onboarding data.
  if (bondStatus === 'no_bond') {
    for (const key of ['bondHolder', 'bondBank', 'currentBondBank', 'mortgageBank', 'bondAccountReference', 'currentBondAccountNumber', 'outstandingBond', 'estimatedSettlementAmount', 'bondSettlementAmount']) patch[key] = ''
  }
  return patch
}

export function validateListingSellerProfileBuilderDraft(draft = {}, { saveAsDraft = false } = {}) {
  // Saving progress is independent of readiness to prepare legal documents.
  if (saveAsDraft) return []
  const branch = normalizeBranch(draft.branch, '')
  const errors = []
  if (!branch) return ['Choose who owns this property before continuing.']
  const email = normalizeText(draft.email)
  const hasPrimarySeller = normalizeText(draft.sellerFirstName || draft.sellerSurname || draft.email || draft.phone || draft.idNumber)
  if (!hasPrimarySeller && ['individual', 'married', 'foreign_individual'].includes(branch)) {
    errors.push('Capture at least one seller name, email, phone, or ID number.')
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Add a valid seller email address.')
  if (!normalizeText(draft.propertyAddress)) errors.push('Capture the property address.')
  if (['company', 'close_corporation', 'foreign_company'].includes(branch) && !normalizeText(draft.companyName)) errors.push('Capture the company name.')
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
export function buildListingMandateReadiness(listing = {}, commission = {}, { requireEmail = false, mandateTerms = null } = {}) {
  const form = getListingSellerFormData(listing)
  const branch = resolveListingSellerProfileBranch(form, listing)
  const missing = []
  const legalType = branch || 'not_identified'
  const emailReady = (value) => (!requireEmail && !normalizeText(value)) || isEmail(value)
  const require = (condition, message) => { if (!condition) missing.push(message) }
  const contactName = normalizeText(form.contactName || form.sellerName || form.fullName || [form.sellerFirstName || form.firstName, form.sellerSurname || form.lastName].filter(Boolean).join(' '))
  const contactEmail = normalizeText(form.sellerEmail || form.email)
  const owners = normalizePersonCollectionForSellerProfile(form.multipleOwners || form.owners || [], null, 'Owner')

  require(Boolean(branch), 'Choose the ownership type.')
  if (branch === 'multiple_owners') {
    require(owners.length >= 2, 'Add at least two property owners.')
    owners.forEach((owner, index) => {
      require(Boolean(personName(owner)), `Add owner ${index + 1}'s full name.`)
      require(emailReady(owner.email), `Add a valid email for owner ${index + 1}.`)
    })
  } else if (['company', 'close_corporation', 'foreign_company'].includes(branch)) {
    require(Boolean(normalizeText(form.companyName)), 'Add the company or CC name.')
    require(Boolean(normalizeText(form.companyRegistrationNumber)), 'Add the company or CC registration number.')
    require(Boolean(normalizeText(form.authorisedSignatoryName)), 'Add the authorised signatory.')
    require(Boolean(normalizeText(form.authorisedSignatoryCapacity)), 'Add the signatory capacity.')
    require(emailReady(form.authorisedSignatoryEmail), 'Add a valid authorised-signatory email.')
  } else if (branch === 'trust' || branch === 'foreign_trust') {
    require(Boolean(normalizeText(form.trustName)), 'Add the trust name.')
    require(Boolean(normalizeText(form.trustRegistrationNumber)), 'Add the trust registration number.')
    require(Boolean(normalizeText(form.authorisedTrusteeName)), 'Add the authorised trustee.')
    require(Boolean(normalizeText(form.authorisedTrusteeCapacity)), 'Add the trustee capacity.')
    require(emailReady(form.authorisedTrusteeEmail), 'Add a valid authorised-trustee email.')
  } else if (branch === 'deceased_estate') {
    require(Boolean(normalizeText(form.deceasedEstateName)), 'Add the estate name.')
    require(Boolean(normalizeText(form.estateReferenceNumber || form.estateReference)), 'Add the estate reference number.')
    require(Boolean(normalizeText(form.executorName)), 'Add the executor.')
    require(emailReady(form.executorEmail), 'Add a valid executor email.')
  } else if (branch === 'power_of_attorney') {
    require(Boolean(normalizeText(form.powerOfAttorneyPrincipalName)), 'Add the principal / legal owner name.')
    require(Boolean(normalizeText(form.powerOfAttorneyPrincipalIdNumber)), 'Add the principal ID/passport number.')
    require(Boolean(normalizeText(form.powerOfAttorneyName)), 'Add the authorised representative.')
    require(emailReady(form.powerOfAttorneyEmail), 'Add a valid authorised-representative email.')
  } else if (branch === 'other') {
    require(Boolean(normalizeText(form.otherEntityName)), 'Add the legal entity name.')
    require(Boolean(contactName), 'Add the authorised contact name.')
    require(emailReady(contactEmail), 'Add a valid authorised-contact email.')
  } else {
    require(Boolean(contactName), 'Add the seller’s full name.')
    require(emailReady(contactEmail), 'Add a valid seller email.')
  }

  require(Boolean(normalizeText(form.propertyAddress || form.addressLine1 || listing.propertyAddress || listing.addressLine1)), 'Add the property address.')
  const terms = readSellerMandateTerms(mandateTerms || form, listing)
  const issues = getSellerMandatePreparationIssues({ ...terms,
    commissionBasis: commission.basis ?? terms.commissionBasis,
    commissionPercentage: commission.percentage ?? terms.commissionPercentage,
    commissionAmount: commission.amount ?? terms.commissionAmount,
    vatHandling: commission.vatHandling ?? terms.vatHandling,
  }, { ownershipType: form.ownerStructureType || form.ownershipType || legalType })
  for (const issue of issues) require(false, issue)

  return {
    version: 'listing_mandate_readiness_v1',
    legalType,
    ready: missing.length === 0,
    missing,
    summary: missing.length === 0 ? 'Ready to prepare the mandate.' : `${missing.length} item${missing.length === 1 ? '' : 's'} still needed before the mandate can be prepared.`,
  }
}

export function buildListingSellerDocumentReadiness(listing = {}, commission = {}, options = {}) {
  const mandate = buildListingMandateReadiness(listing, commission, options)
  const form = getListingSellerFormData(listing)
  const mandateType = normalizeSellerMandateType(form.mandateType || listing?.mandateType || 'sole')
  const mandateTitle = mandateType === 'dual' ? 'Dual mandate' : mandateType === 'open' ? 'Open mandate' : 'Exclusive mandate'

  const documents = [
    { key: 'mandate', title: mandateTitle, copy: 'Uses the saved mandate, commission and VAT details.', ready: mandate.ready, missing: mandate.missing },
    // These are seller-completed questionnaires. They must be available in a
    // secure pack before their answers exist; otherwise the form can never do
    // the job it was sent to do.
    { key: 'disclosure', title: 'Property disclosure form', copy: 'Capture the seller’s disclosure answers in Documents, then choose download or signature links.', ready: true, missing: [] },
    { key: 'fica', title: 'Seller FICA declaration', copy: 'Prepare the FICA declaration independently. Supporting identity and authority evidence is reviewed separately.', ready: true, missing: [] },
  ]
  return { version: 'listing_seller_document_readiness_v1', documents, byKey: Object.fromEntries(documents.map((document) => [document.key, document])) }
}

export function buildListingSellerProfileCapturePayload(draft = {}, listing = {}, options = {}) {
  const existingFormData = { ...getListingSellerFormData(listing), ...(options.existingFormData || {}) }
  const consentValue = Object.hasOwn(draft, 'popiConsentAccepted') ? draft.popiConsentAccepted : draft.popiConsent
  const formPatch = {
    ...buildListingSellerProfileFormPatch(draft),
    ...buildSellerPopiConsentPatch(existingFormData, consentValue),
  }
  const canonicalPayload = buildSellerProfileCanonicalPayload({ ...existingFormData, ...formPatch }, listing, {
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
