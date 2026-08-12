import {
  DIRECT_LISTING_INTAKE_SOURCE,
  DIRECT_LISTING_INTAKE_VERSION,
} from './directListingIntakeModel.js'
import {
  normalizePropertyCategory,
  normalizePropertyStructureType,
} from './propertyTaxonomy.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

function firstObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {}
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return [value]
  return []
}

function compactObject(value) {
  return Object.entries(value).reduce((acc, [key, item]) => {
    if (item === undefined || item === null || item === '') return acc
    if (Array.isArray(item) && !item.length) return acc
    if (item && typeof item === 'object' && !Array.isArray(item) && !Object.keys(item).length) return acc
    acc[key] = item
    return acc
  }, {})
}

function splitName(value = '') {
  const text = normalizeText(value)
  if (!text) return { name: '', surname: '', fullName: '' }
  const parts = text.split(/\s+/).filter(Boolean)
  if (parts.length <= 1) return { name: text, surname: '', fullName: text }
  return {
    name: parts.slice(0, -1).join(' '),
    surname: parts.at(-1),
    fullName: text,
  }
}

function normalizeBooleanDeclaration(value) {
  if (typeof value === 'boolean') return value
  const key = normalizeKey(value)
  if (!key || key === 'unknown') return null
  if (['yes', 'y', 'true', 'signed', 'held', 'available', 'reported_held', 'obtained'].includes(key)) return true
  if (['no', 'n', 'false', 'not_held', 'reported_not_held', 'not_available', 'missing', 'outstanding'].includes(key)) return false
  return null
}

function normalizeMandateType(value = '') {
  const key = normalizeKey(value)
  if (key === 'tri') return 'tri_mandate'
  if (key === 'triple') return 'tri_mandate'
  if (key === 'exclusive') return 'sole'
  if (['sole', 'dual', 'open', 'tri_mandate'].includes(key)) return key
  return ''
}

function normalizePerson(entry = {}, index = 0, roleTitle = 'Person') {
  const source = typeof entry === 'string' ? { fullName: entry } : (entry || {})
  const split = splitName(pickFirst(source.fullName, source.full_name, source.name, source.displayName) || '')
  return compactObject({
    id: normalizeText(source.id) || `${normalizeKey(roleTitle) || 'person'}-${index + 1}`,
    name: normalizeText(pickFirst(source.name, source.firstName, source.first_name, split.name)),
    surname: normalizeText(pickFirst(source.surname, source.lastName, source.last_name, split.surname)),
    email: normalizeText(source.email),
    phone: normalizeText(pickFirst(source.phone, source.mobile, source.cell)),
    idNumber: normalizeText(pickFirst(source.idNumber, source.id_number, source.identityNumber, source.identity_number, source.passportNumber, source.passport_number)),
    residentialAddress: normalizeText(pickFirst(source.residentialAddress, source.residential_address, source.address)),
    ownershipShare: normalizeText(pickFirst(source.ownershipShare, source.ownership_share)),
    consentToSell: normalizeBooleanDeclaration(source.consentToSell ?? source.consent_to_sell) === true,
    signingAuthority: normalizeBooleanDeclaration(source.signingAuthority ?? source.signing_authority) === true,
    roleTitle,
  })
}

function normalizePeopleCollection(values = [], roleTitle = 'Person') {
  return toArray(values)
    .map((item, index) => normalizePerson(item, index, roleTitle))
    .filter((item) => Boolean(item.name || item.surname || item.email || item.phone || item.idNumber))
}

function getSellerOnboardingFormData(listing = {}) {
  return firstObject(
    listing?.sellerOnboarding?.formData,
    listing?.seller_onboarding?.form_data,
    listing?.onboardingFormData?.formData,
  )
}

function getCanonicalFacts(listing = {}, formData = {}) {
  return firstObject(
    listing?.sellerOnboarding?.canonicalFacts,
    listing?.sellerCanonicalFacts,
    listing?.seller_canonical_facts_json,
    formData?.canonicalSellerFacts,
  )
}

function getDirectListingIntake(listing = {}, formData = {}) {
  return firstObject(
    formData?.directListingIntake,
    listing?.directListingIntake,
    listing?.direct_listing_intake,
  )
}

function getComplianceDeclarations(listing = {}, formData = {}, canonicalFacts = {}) {
  return firstObject(
    formData?.complianceDeclarations,
    formData?.compliance_declarations,
    canonicalFacts?.complianceDeclarations,
    canonicalFacts?.compliance_declarations,
    listing?.complianceDeclarations,
    listing?.compliance_declarations,
  )
}

function hasDirectListingMarkers(listing = {}, formData = {}, canonicalFacts = {}) {
  const intake = getDirectListingIntake(listing, formData)
  return (
    intake.source === DIRECT_LISTING_INTAKE_SOURCE ||
    intake.version === DIRECT_LISTING_INTAKE_VERSION ||
    formData?.source === DIRECT_LISTING_INTAKE_SOURCE ||
    canonicalFacts?.source === DIRECT_LISTING_INTAKE_SOURCE
  )
}

function resolveSellerLegalType(formData = {}, canonicalFacts = {}) {
  return normalizeKey(
    pickFirst(
      formData.sellerLegalType,
      formData.seller_legal_type,
      formData.sellerType,
      formData.ownershipType,
      canonicalFacts?.seller?.legal_type,
      canonicalFacts?.seller?.sellerLegalType,
      canonicalFacts?.seller?.ownershipType,
      canonicalFacts?.seller?.owner_structure_type,
    ),
  ) || 'individual'
}

function resolveOwnerModel(sellerLegalType = '', formData = {}, canonicalFacts = {}) {
  const explicitEntity = normalizeKey(pickFirst(formData.ownerEntityType, formData.owner_entity_type, canonicalFacts?.seller?.owner_entity_type))
  const explicitStructure = normalizeKey(pickFirst(formData.ownerStructureType, formData.owner_structure_type, canonicalFacts?.seller?.owner_structure_type))
  if (explicitEntity || explicitStructure) {
    return {
      ownerEntityType: explicitEntity || (sellerLegalType === 'company' ? 'company' : sellerLegalType === 'trust' ? 'trust' : sellerLegalType === 'foreign_individual' ? 'foreign' : 'natural_person'),
      ownerStructureType: explicitStructure || sellerLegalType || 'individual',
    }
  }

  if (sellerLegalType === 'company') return { ownerEntityType: 'company', ownerStructureType: 'company' }
  if (sellerLegalType === 'trust') return { ownerEntityType: 'trust', ownerStructureType: 'trust' }
  if (sellerLegalType === 'foreign_individual') return { ownerEntityType: 'foreign', ownerStructureType: 'foreign_individual' }
  if (sellerLegalType === 'multiple_owners') return { ownerEntityType: 'natural_person', ownerStructureType: 'multiple_owners' }
  return { ownerEntityType: 'natural_person', ownerStructureType: sellerLegalType || 'individual' }
}

function resolveOwnershipType(ownerEntityType = '', ownerStructureType = '') {
  if (ownerEntityType === 'company' || ownerStructureType === 'company') return 'company'
  if (ownerEntityType === 'trust' || ownerStructureType === 'trust') return 'trust'
  if (ownerStructureType === 'foreign_individual') return 'individual'
  if (ownerStructureType === 'multiple_owners') return 'multiple_owners'
  if (ownerStructureType === 'married_cop' || ownerStructureType === 'married_anc') return ownerStructureType
  return 'individual'
}

function buildComplianceSummary(declarations = {}) {
  const mandate = declarations.mandate || {}
  const disclosure = declarations.propertyConditionDisclosure || declarations.property_condition_disclosure || {}
  const fica = declarations.ficaForm || declarations.fica_form || {}
  const rows = [
    ['mandate', 'Signed mandate held', mandate.signed ?? mandate.hasSignedMandate],
    ['property_condition_disclosure', 'Signed Property Condition Disclosure held', disclosure.signed],
    ['fica_form', 'Signed FICA form held', fica.signed],
  ]
  return rows.map(([key, label, value]) => {
    const held = normalizeBooleanDeclaration(value)
    return {
      key,
      label,
      held,
      status: held === true ? 'reported_held' : held === false ? 'reported_not_held' : 'unknown',
      statusLabel: held === true ? 'Reported held' : held === false ? 'Reported not held' : 'Not captured',
    }
  })
}

export function hasDirectListingPortalIntake(listing = {}) {
  const formData = getSellerOnboardingFormData(listing)
  const canonicalFacts = getCanonicalFacts(listing, formData)
  return hasDirectListingMarkers(listing, formData, canonicalFacts)
}

export function buildSellerPortalFormDataFromDirectListing(listing = {}) {
  const formData = getSellerOnboardingFormData(listing)
  const canonicalFacts = getCanonicalFacts(listing, formData)
  if (!hasDirectListingMarkers(listing, formData, canonicalFacts)) return {}

  const seller = firstObject(canonicalFacts?.seller, formData)
  const property = firstObject(canonicalFacts?.property, formData)
  const identitySplit = splitName(pickFirst(formData.fullName, formData.full_name, formData.sellerName, canonicalFacts?.sellerName, canonicalFacts?.name, listing?.seller?.name))
  const sellerLegalType = resolveSellerLegalType(formData, canonicalFacts)
  const { ownerEntityType, ownerStructureType } = resolveOwnerModel(sellerLegalType, formData, canonicalFacts)
  const ownershipType = resolveOwnershipType(ownerEntityType, ownerStructureType)
  const company = firstObject(formData.company, seller.company)
  const trust = firstObject(formData.trust, seller.trust)
  const foreign = firstObject(formData.foreign, seller.foreign)
  const complianceDeclarations = getComplianceDeclarations(listing, formData, canonicalFacts)
  const mandateDeclaration = firstObject(complianceDeclarations.mandate)
  const normalizedMandateType = normalizeMandateType(pickFirst(formData.mandateType, mandateDeclaration.mandateType, listing?.mandateType, listing?.mandate_type))
  const propertyStructureType = normalizePropertyStructureType(
    pickFirst(formData.propertyStructureType, property.property_structure_type, property.propertyStructureType, property.property_title_type, listing?.propertyStructureType, listing?.property_structure_type),
    { fallback: '' },
  )
  const propertyCategory = normalizePropertyCategory(
    pickFirst(formData.propertyCategory, property.property_category, property.propertyCategory, listing?.propertyCategory, listing?.property_category),
    { fallback: '' },
  )
  const complianceSummary = buildComplianceSummary(complianceDeclarations)

  return compactObject({
    directListingIntake: {
      ...getDirectListingIntake(listing, formData),
      source: DIRECT_LISTING_INTAKE_SOURCE,
      version: DIRECT_LISTING_INTAKE_VERSION,
      declarationsOnly: true,
      uploadsRequired: false,
    },
    directListingComplianceDeclarations: complianceDeclarations,
    directListingComplianceSummary: complianceSummary,
    directListingUploadsRequired: false,
    sellerPortalInviteRequested: formData.sellerPortalInviteRequested ?? formData.seller_portal_invite_requested,

    sellerFirstName: pickFirst(formData.sellerFirstName, formData.sellerName, seller.sellerName, seller.firstName, canonicalFacts?.firstName, identitySplit.name),
    sellerSurname: pickFirst(formData.sellerSurname, seller.sellerSurname, seller.lastName, canonicalFacts?.lastName, identitySplit.surname),
    email: pickFirst(formData.email, formData.sellerEmail, seller.email, seller.sellerEmail, canonicalFacts?.email, canonicalFacts?.sellerEmail, listing?.seller?.email),
    phone: pickFirst(formData.phone, formData.sellerPhone, seller.phone, seller.sellerPhone, canonicalFacts?.phone, canonicalFacts?.sellerPhone, listing?.seller?.phone),

    sellerLegalType,
    directListingSellerLegalType: sellerLegalType,
    ownershipType,
    ownerEntityType,
    ownerStructureType,
    foreignOwner: ownerEntityType === 'foreign',
    foreignOwnerCountry: pickFirst(formData.foreignOwnerCountry, formData.foreign_owner_country, foreign.country, seller.foreignOwnerCountry, seller.foreign_owner_country),
    foreignPassportNumber: pickFirst(formData.foreignPassportNumber, formData.foreign_passport_number, foreign.passportNumber, foreign.passport_number),
    foreignRegistrationNumber: pickFirst(formData.foreignRegistrationNumber, formData.foreign_registration_number, foreign.registrationNumber, foreign.registration_number),
    foreignResidencyStatus: pickFirst(formData.foreignResidencyStatus, formData.foreign_residency_status, foreign.residencyStatus, foreign.residency_status),

    maritalStatus: pickFirst(formData.maritalStatus, formData.marital_status, seller.maritalStatus, seller.marital_status),
    maritalRegime: ownerStructureType === 'married_cop' ? 'in_community' : ownerStructureType === 'married_anc' ? 'anc' : '',
    spouseName: pickFirst(formData.spouseName, formData.spouse?.fullName, formData.spouse?.full_name, seller.spouse?.fullName, seller.spouse?.full_name),
    spouseEmail: pickFirst(formData.spouseEmail, formData.spouse?.email, seller.spouse?.email),
    spousePhone: pickFirst(formData.spousePhone, formData.spouse?.phone, seller.spouse?.phone),

    companyName: pickFirst(formData.companyName, formData.company_name, company.name, seller.companyName, seller.company_name),
    companyRegistrationNumber: pickFirst(formData.companyRegistrationNumber, formData.company_registration_number, company.registrationNumber, company.registration_number),
    companyDirectors: normalizePeopleCollection(pickFirst(formData.companyDirectors, formData.company_directors, company.directors, seller.companyDirectors, seller.company_directors), 'Director'),
    directors: normalizePeopleCollection(pickFirst(formData.companyDirectors, formData.company_directors, company.directors, seller.companyDirectors, seller.company_directors), 'Director'),

    trustName: pickFirst(formData.trustName, formData.trust_name, trust.name, seller.trustName, seller.trust_name),
    trustRegistrationNumber: pickFirst(formData.trustRegistrationNumber, formData.trust_registration_number, trust.registrationNumber, trust.registration_number),
    trustees: normalizePeopleCollection(pickFirst(formData.trustees, formData.trust_trustees, trust.trustees, seller.trustees), 'Trustee'),

    multipleOwners: normalizePeopleCollection(pickFirst(formData.multipleOwners, formData.owners, seller.owners, seller.multipleOwners), 'Owner'),

    mandateType: normalizedMandateType,
    reportedMandateHeld: complianceSummary.find((row) => row.key === 'mandate')?.held,
    reportedPropertyConditionDisclosureHeld: complianceSummary.find((row) => row.key === 'property_condition_disclosure')?.held,
    reportedFicaFormHeld: complianceSummary.find((row) => row.key === 'fica_form')?.held,

    propertyCategory,
    propertyStructureType,
    propertyAddress: pickFirst(formData.propertyAddress, property.propertyAddress, property.address, property.formattedAddress, listing?.formattedAddress, listing?.propertyAddress),
    propertyAddressLine1: pickFirst(formData.propertyAddressLine1, property.address_line_1, listing?.addressLine1, listing?.address_line_1),
    suburb: pickFirst(formData.suburb, property.suburb, listing?.suburb),
    city: pickFirst(formData.city, property.city, listing?.city),
    province: pickFirst(formData.province, property.province, listing?.province),
    postalCode: pickFirst(formData.postalCode, property.postal_code, listing?.postalCode, listing?.postal_code),
    country: pickFirst(formData.country, property.country, listing?.country),
    unitNumber: pickFirst(formData.unitNumber, property.unit_number, property.unitNumber),
    sectionNumber: pickFirst(formData.sectionNumber, property.section_number, property.sectionNumber, property.unit_number),
    schemeName: pickFirst(formData.schemeName, property.scheme_name, property.complex_name, property.complexName),
    estateName: pickFirst(formData.estateName, property.estate_name, property.estateName),
    erfNumber: pickFirst(formData.erfNumber, property.erf_number, property.sectional_title_number, property.sectionalTitleNumber),
  })
}

export default {
  buildSellerPortalFormDataFromDirectListing,
  hasDirectListingPortalIntake,
}
