import {
  buildSellerEntityProfileAliases,
  buildSellerProfileCanonicalPayload,
  createBlankSellerProfilePersonRecord,
  normalizePersonCollectionForSellerProfile,
} from './sellerProfileCaptureModel.js'
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
  { value: 'individual', label: 'Individual' },
  { value: 'married', label: 'Married Individual' },
  { value: 'multiple_owners', label: 'Multiple Owners' },
  { value: 'company', label: 'Company / CC' },
  { value: 'trust', label: 'Trust' },
  { value: 'foreign_individual', label: 'Foreign Individual' },
  { value: 'foreign_company', label: 'Foreign Company' },
  { value: 'foreign_trust', label: 'Foreign Trust' },
]

const BRANCH_VALUES = new Set(LISTING_SELLER_PROFILE_BRANCHES.map((item) => item.value))

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
  if (BRANCH_VALUES.has(key)) return key
  if (['company', 'close_corporation', 'cc', 'pty_ltd', 'corporate'].includes(key)) return 'company'
  if (['trust', 'family_trust'].includes(key)) return 'trust'
  if (['multiple', 'multiple_individuals', 'joint', 'co_owners'].includes(key)) return 'multiple_owners'
  if (['foreign', 'foreign_owner', 'non_resident', 'foreign_individual'].includes(key)) return 'foreign_individual'
  if (['foreign_company'].includes(key)) return 'foreign_company'
  if (['foreign_trust'].includes(key)) return 'foreign_trust'
  if (['married', 'married_cop', 'married_anc', 'married_in_community', 'married_out_of_community'].includes(key)) return 'married'
  return fallback
}

function getListingSellerFormData(listing = {}) {
  return listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
    ? listing.sellerOnboarding.formData
    : {}
}

function getCanonicalFacts(listing = {}) {
  return listing?.sellerCanonicalFacts && typeof listing.sellerCanonicalFacts === 'object'
    ? listing.sellerCanonicalFacts
    : listing?.seller_canonical_facts_json && typeof listing.seller_canonical_facts_json === 'object'
      ? listing.seller_canonical_facts_json
      : {}
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
  return normalizeBranch(source, 'individual')
}

export function createListingSellerProfileBuilderDraft(listing = {}) {
  const form = getListingSellerFormData(listing)
  const facts = getCanonicalFacts(listing)
  const sellerFacts = facts.seller && typeof facts.seller === 'object' ? facts.seller : facts
  const canonicalCompany = sellerFacts.company && typeof sellerFacts.company === 'object' ? sellerFacts.company : {}
  const canonicalTrust = sellerFacts.trust && typeof sellerFacts.trust === 'object' ? sellerFacts.trust : {}
  const canonicalProperty = facts.property && typeof facts.property === 'object' ? facts.property : {}
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
    ),
  )
  const split = splitName(sellerName)
  const branch = resolveListingSellerProfileBranch(form, listing)
  const ownerFallback = {
    name: pickFirst(form.sellerFirstName, form.firstName, split.firstName),
    surname: pickFirst(form.sellerSurname, form.lastName, split.surname),
    email: pickFirst(form.email, form.sellerEmail, listing?.sellerEmail, listing?.seller?.email),
    phone: pickFirst(form.phone, form.sellerPhone, listing?.sellerPhone, listing?.seller?.phone),
    idNumber: pickFirst(form.idNumber, form.sellerIdNumber),
  }

  return {
    branch,
    sellerFirstName: normalizeText(ownerFallback.name),
    sellerSurname: normalizeText(ownerFallback.surname),
    email: normalizeText(ownerFallback.email).toLowerCase(),
    phone: normalizeText(ownerFallback.phone),
    idNumber: normalizeText(ownerFallback.idNumber),
    maritalStatus: normalizeText(pickFirst(form.maritalStatus, form.marital_status, sellerFacts.marital_status)),
    spouseName: normalizeText(pickFirst(form.spouseName, form.spouseFullName, form.spouse?.fullName, sellerFacts.spouse?.full_name)),
    spouseEmail: normalizeText(pickFirst(form.spouseEmail, form.spouse?.email, sellerFacts.spouse?.email)).toLowerCase(),
    spouseIdNumber: normalizeText(pickFirst(form.spouseIdNumber, form.spouse?.idNumber, sellerFacts.spouse?.id_number)),
    multipleOwners: normalizePersonCollectionForSellerProfile(form.multipleOwners || form.owners || sellerFacts.owners || [], ownerFallback, 'Owner'),
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
    foreignOwnerCountry: normalizeText(pickFirst(form.foreignOwnerCountry, sellerFacts.foreign?.country)),
    foreignPassportNumber: normalizeText(pickFirst(form.foreignPassportNumber, sellerFacts.foreign?.passport_number, sellerFacts.foreign?.passportNumber)),
    foreignRegistrationNumber: normalizeText(pickFirst(form.foreignRegistrationNumber, sellerFacts.foreign?.registration_number, sellerFacts.foreign?.registrationNumber)),
    foreignResidencyStatus: normalizeText(pickFirst(form.foreignResidencyStatus, sellerFacts.foreign?.residency_status, sellerFacts.foreign?.residencyStatus)),
    propertyAddress: normalizeText(pickFirst(form.propertyAddress, form.addressLine1, canonicalProperty.address, listing?.propertyAddress, listing?.addressLine1, listing?.formattedAddress, listing?.listingTitle)),
    propertyStructureType: normalizeText(pickFirst(form.propertyStructureType, canonicalProperty.property_structure_type, listing?.propertyStructureType, 'full_title')),
    propertyCategory: normalizeText(pickFirst(form.propertyCategory, canonicalProperty.property_category, listing?.propertyCategory, 'residential')),
    ratesTaxes: normalizeText(pickFirst(form.ratesTaxes, listing?.ratesTaxes)),
    levies: normalizeText(pickFirst(form.levies, listing?.levies)),
    leviesNotApplicable: Boolean(form.leviesNotApplicable ?? form.levies_not_applicable ?? false),
    waterBillingType: normalizeText(pickFirst(form.waterBillingType, form.water_billing_type, 'municipal')),
    mandateType: normalizeText(pickFirst(form.mandateType, listing?.mandateType, listing?.mandate?.type, 'sole')),
    askingPrice: normalizeText(pickFirst(form.askingPrice, form.price, listing?.askingPrice)),
    mandateStartDate: normalizeText(pickFirst(form.mandateStartDate, listing?.mandateStartDate)),
    expiryDate: normalizeText(pickFirst(form.expiryDate, form.mandateEndDate, listing?.expiryDate)),
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

function resolveOwnerModel(branch) {
  if (branch === 'company') return { ownerEntityType: 'company', ownerStructureType: 'company', sellerLegalType: 'company' }
  if (branch === 'trust') return { ownerEntityType: 'trust', ownerStructureType: 'trust', sellerLegalType: 'trust' }
  if (branch === 'foreign_company') return { ownerEntityType: 'foreign', ownerStructureType: 'foreign_company', sellerLegalType: 'foreign_company' }
  if (branch === 'foreign_trust') return { ownerEntityType: 'foreign', ownerStructureType: 'foreign_trust', sellerLegalType: 'foreign_trust' }
  if (branch === 'foreign_individual') return { ownerEntityType: 'foreign', ownerStructureType: 'foreign_individual', sellerLegalType: 'foreign_individual' }
  if (branch === 'multiple_owners') return { ownerEntityType: 'natural_person', ownerStructureType: 'multiple_owners', sellerLegalType: 'multiple_owners' }
  if (branch === 'married') return { ownerEntityType: 'natural_person', ownerStructureType: 'married', sellerLegalType: 'individual' }
  return { ownerEntityType: 'natural_person', ownerStructureType: 'individual', sellerLegalType: 'individual' }
}

export function buildListingSellerProfileFormPatch(draft = {}) {
  const branch = normalizeBranch(draft.branch)
  const ownerModel = resolveOwnerModel(branch)
  const fullName = [draft.sellerFirstName, draft.sellerSurname].map(normalizeText).filter(Boolean).join(' ')
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
    sellerName: fullName,
    fullName,
    email: normalizeText(draft.email).toLowerCase(),
    sellerEmail: normalizeText(draft.email).toLowerCase(),
    phone: normalizeText(draft.phone),
    sellerPhone: normalizeText(draft.phone),
    mobile: normalizeText(draft.phone),
    idNumber: normalizeText(draft.idNumber),
    sellerIdNumber: normalizeText(draft.idNumber),
    maritalStatus: normalizeText(draft.maritalStatus),
    spouseName: normalizeText(draft.spouseName),
    spouseEmail: normalizeText(draft.spouseEmail).toLowerCase(),
    spouseIdNumber: normalizeText(draft.spouseIdNumber),
    propertyAddress: normalizeText(draft.propertyAddress),
    addressLine1: normalizeText(draft.propertyAddress),
    propertyStructureType: normalizeText(draft.propertyStructureType) || 'full_title',
    propertyCategory: normalizeText(draft.propertyCategory) || 'residential',
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
  if (branch.startsWith('foreign_')) {
    base.foreignOwner = true
    base.foreign_owner = true
    base.foreignOwnerCountry = normalizeText(draft.foreignOwnerCountry)
    base.foreignPassportNumber = normalizeText(draft.foreignPassportNumber)
    base.foreignRegistrationNumber = normalizeText(draft.foreignRegistrationNumber)
    base.foreignResidencyStatus = normalizeText(draft.foreignResidencyStatus)
  }

  return compactObject({
    ...base,
    ...buildSellerEntityProfileAliases(base),
  })
}

export function validateListingSellerProfileBuilderDraft(draft = {}) {
  const branch = normalizeBranch(draft.branch)
  const errors = []
  const email = normalizeText(draft.email)
  const hasPrimarySeller = normalizeText(draft.sellerFirstName || draft.sellerSurname || draft.email || draft.phone || draft.idNumber)
  if (!hasPrimarySeller && !['company', 'trust', 'foreign_company', 'foreign_trust'].includes(branch)) {
    errors.push('Capture at least one seller name, email, phone, or ID number.')
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Add a valid seller email address.')
  if (!normalizeText(draft.propertyAddress)) errors.push('Capture the property address.')
  if (['company', 'foreign_company'].includes(branch) && !normalizeText(draft.companyName)) errors.push('Capture the company name.')
  if (['trust', 'foreign_trust'].includes(branch) && !normalizeText(draft.trustName)) errors.push('Capture the trust name.')
  if (branch === 'multiple_owners' && !normalizePersonCollectionForSellerProfile(draft.multipleOwners || [], null, 'Owner').length) {
    errors.push('Add at least one owner.')
  }
  if (branch.startsWith('foreign_') && !normalizeText(draft.foreignOwnerCountry)) {
    errors.push('Capture the foreign owner country or jurisdiction.')
  }
  return errors
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
  buildListingSellerProfileRequirementProjection,
  createListingSellerProfileBuilderDraft,
  removeListingSellerProfileDraftPerson,
  resolveListingSellerProfileBranch,
  updateListingSellerProfileDraftPerson,
  validateListingSellerProfileBuilderDraft,
}
