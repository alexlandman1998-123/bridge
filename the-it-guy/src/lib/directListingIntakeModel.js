import {
  normalizePropertyCategory,
  normalizePropertyStructureType,
} from './propertyTaxonomy.js'

export const DIRECT_LISTING_INTAKE_VERSION = 'direct_listing_intake_v1'
export const DIRECT_LISTING_INTAKE_SOURCE = 'direct_listing_intake'

export const DIRECT_LISTING_SELLER_LEGAL_TYPES = [
  'individual',
  'multiple_owners',
  'company',
  'trust',
  'foreign_individual',
  'other',
]

export const DIRECT_LISTING_MANDATE_TYPES = ['sole', 'dual', 'tri', 'open']

const DECLARATION_HELD = 'reported_held'
const DECLARATION_NOT_HELD = 'reported_not_held'
const DECLARATION_UNKNOWN = 'unknown'

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

function compactObject(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => compactObject(item))
      .filter((item) => item !== undefined && item !== '')
  }
  if (!value || typeof value !== 'object') return value

  return Object.entries(value).reduce((acc, [key, item]) => {
    const next = compactObject(item)
    if (next === undefined || next === '') return acc
    if (Array.isArray(next) && !next.length) return acc
    if (next && typeof next === 'object' && !Array.isArray(next) && !Object.keys(next).length) return acc
    acc[key] = next
    return acc
  }, {})
}

function pickFirst(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

function splitNameParts(value) {
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
  if (!key) return null
  if (['yes', 'y', 'true', 'signed', 'held', 'available', 'uploaded', 'complete', 'completed', 'obtained'].includes(key)) return true
  if (['signed_uploaded', 'signed_external_pending_upload', 'signed_external', 'mandate_signed'].includes(key)) return true
  if (['no', 'n', 'false', 'not_held', 'not_available', 'missing', 'none', 'outstanding', 'not_started'].includes(key)) return false
  return null
}

function declarationStatus(value) {
  if (value === true) return DECLARATION_HELD
  if (value === false) return DECLARATION_NOT_HELD
  return DECLARATION_UNKNOWN
}

function normalizeMandateType(value) {
  const key = normalizeKey(value)
  if (key === 'exclusive' || key === 'exclusive_mandate') return 'sole'
  if (key === 'joint' || key === 'dual_mandate') return 'dual'
  if (key === 'triple' || key === 'tri_mandate') return 'tri'
  if (DIRECT_LISTING_MANDATE_TYPES.includes(key)) return key
  return ''
}

function normalizeSellerLegalType(form = {}) {
  const key = normalizeKey(
    pickFirst(
      form.sellerLegalType,
      form.seller_legal_type,
      form.ownerStructureType,
      form.owner_structure_type,
      form.ownershipType,
      form.sellerType,
      form.ownerEntityType,
      form.owner_entity_type,
    ),
  )

  if (['company', 'private_company', 'pty_ltd', 'cc', 'close_corporation'].includes(key)) return 'company'
  if (['trust', 'inter_vivos_trust', 'family_trust'].includes(key)) return 'trust'
  if (['foreign', 'foreign_owner', 'foreign_individual', 'non_resident_individual'].includes(key)) return 'foreign_individual'
  if (['multiple', 'multiple_owner', 'multiple_owners', 'joint', 'joint_owners', 'co_owners'].includes(key)) return 'multiple_owners'
  if (['individual', 'natural_person', 'single', 'married_cop', 'married_anc', 'married_in_community', 'married_out_of_community'].includes(key)) return 'individual'
  return key || 'individual'
}

function resolveOwnerModel(sellerLegalType, form = {}) {
  const explicitEntity = normalizeKey(form.ownerEntityType || form.owner_entity_type)
  const explicitStructure = normalizeKey(form.ownerStructureType || form.owner_structure_type)

  if (sellerLegalType === 'company') return { ownerEntityType: 'company', ownerStructureType: 'company' }
  if (sellerLegalType === 'trust') return { ownerEntityType: 'trust', ownerStructureType: 'trust' }
  if (sellerLegalType === 'foreign_individual') return { ownerEntityType: 'foreign', ownerStructureType: 'foreign_individual' }
  if (sellerLegalType === 'multiple_owners') return { ownerEntityType: 'natural_person', ownerStructureType: 'multiple_owners' }

  if (explicitEntity && explicitEntity !== 'natural_person') {
    return {
      ownerEntityType: explicitEntity,
      ownerStructureType: explicitStructure || explicitEntity,
    }
  }

  const marriedInCommunity = normalizeBooleanDeclaration(form.marriedInCommunityOfProperty || form.married_in_community_of_property)
  const marriedOutOfCommunity = normalizeBooleanDeclaration(form.marriedOutOfCommunityOfProperty || form.married_out_of_community_of_property)
  const maritalStatus = normalizeKey(form.maritalStatus || form.marital_status)
  let ownerStructureType = explicitStructure || 'individual'
  if (marriedInCommunity === true || maritalStatus === 'married_in_community' || maritalStatus === 'married_cop') ownerStructureType = 'married_cop'
  if (marriedOutOfCommunity === true || maritalStatus === 'married_out_of_community' || maritalStatus === 'married_anc') ownerStructureType = 'married_anc'

  return {
    ownerEntityType: 'natural_person',
    ownerStructureType,
  }
}

function normalizePersonRecord(record = {}, role = 'Person', index = 0) {
  const source = typeof record === 'string' ? { fullName: record } : (record || {})
  const split = splitNameParts(pickFirst(source.fullName, source.full_name, source.name, source.displayName) || '')
  const name = normalizeText(pickFirst(source.name, source.firstName, source.first_name, split.name))
  const surname = normalizeText(pickFirst(source.surname, source.lastName, source.last_name, split.surname))
  const fullName = normalizeText(pickFirst(source.fullName, source.full_name, [name, surname].filter(Boolean).join(' '), split.fullName))

  return compactObject({
    id: normalizeText(source.id) || `${normalizeKey(role) || 'person'}_${index + 1}`,
    role,
    name,
    surname,
    fullName,
    full_name: fullName,
    email: normalizeText(source.email),
    phone: normalizeText(pickFirst(source.phone, source.mobile, source.cell)),
    idNumber: normalizeText(pickFirst(source.idNumber, source.id_number, source.passportNumber, source.passport_number)),
    consentToSell: normalizeBooleanDeclaration(source.consentToSell ?? source.consent_to_sell),
  })
}

function normalizePeopleCollection(values, role) {
  const source = Array.isArray(values) ? values : (values ? [values] : [])
  return source
    .map((item, index) => normalizePersonRecord(item, role, index))
    .filter((item) => item.name || item.surname || item.fullName || item.email || item.phone || item.idNumber)
}

function normalizeSellerIdentity(form = {}) {
  const sellerName = normalizeText(pickFirst(form.sellerName, form.name, form.firstName, form.first_name))
  const sellerSurname = normalizeText(pickFirst(form.sellerSurname, form.surname, form.lastName, form.last_name))
  const companyName = normalizeText(pickFirst(form.companyName, form.company_name, form.registeredName, form.registered_name))
  const trustName = normalizeText(pickFirst(form.trustName, form.trust_name))
  const displayName = normalizeText(
    pickFirst(
      form.sellerDisplayName,
      form.fullName,
      form.full_name,
      [sellerName, sellerSurname].filter(Boolean).join(' '),
      companyName,
      trustName,
    ),
  )

  return compactObject({
    sellerName,
    sellerSurname,
    name: sellerName || displayName,
    surname: sellerSurname,
    fullName: displayName,
    full_name: displayName,
    email: normalizeText(pickFirst(form.sellerEmail, form.email)),
    sellerEmail: normalizeText(pickFirst(form.sellerEmail, form.email)),
    phone: normalizeText(pickFirst(form.sellerPhone, form.phone, form.mobile)),
    sellerPhone: normalizeText(pickFirst(form.sellerPhone, form.phone, form.mobile)),
    mobile: normalizeText(pickFirst(form.sellerPhone, form.phone, form.mobile)),
  })
}

function normalizeCompanyFacts(form = {}) {
  const directors = normalizePeopleCollection(
    pickFirst(form.companyDirectors, form.company_directors, form.directors) ||
      (form.companyDirectorName || form.companyDirectorEmail || form.companyDirectorPhone
        ? [{
            fullName: form.companyDirectorName,
            email: form.companyDirectorEmail,
            phone: form.companyDirectorPhone,
          }]
        : []),
    'Director',
  )

  return compactObject({
    name: normalizeText(pickFirst(form.companyName, form.company_name, form.registeredName, form.registered_name)),
    registrationNumber: normalizeText(pickFirst(form.companyRegistrationNumber, form.company_registration_number, form.sellerRegistrationNumber)),
    registration_number: normalizeText(pickFirst(form.companyRegistrationNumber, form.company_registration_number, form.sellerRegistrationNumber)),
    directors,
    authorisedSignatory: directors[0],
    authorised_signatory: directors[0],
  })
}

function normalizeTrustFacts(form = {}) {
  const trustees = normalizePeopleCollection(pickFirst(form.trustees, form.trust_trustees), 'Trustee')
  return compactObject({
    name: normalizeText(pickFirst(form.trustName, form.trust_name)),
    registrationNumber: normalizeText(pickFirst(form.trustRegistrationNumber, form.trust_registration_number, form.sellerRegistrationNumber)),
    registration_number: normalizeText(pickFirst(form.trustRegistrationNumber, form.trust_registration_number, form.sellerRegistrationNumber)),
    trustees,
  })
}

function normalizeForeignFacts(form = {}) {
  return compactObject({
    country: normalizeText(pickFirst(form.foreignOwnerCountry, form.foreign_owner_country, form.countryOfResidence, form.country_of_residence)),
    jurisdiction: normalizeText(pickFirst(form.foreignOwnerCountry, form.foreign_owner_country, form.jurisdiction)),
    passportNumber: normalizeText(pickFirst(form.foreignPassportNumber, form.foreign_passport_number, form.passportNumber, form.passport_number)),
    passport_number: normalizeText(pickFirst(form.foreignPassportNumber, form.foreign_passport_number, form.passportNumber, form.passport_number)),
    registrationNumber: normalizeText(pickFirst(form.foreignRegistrationNumber, form.foreign_registration_number)),
    registration_number: normalizeText(pickFirst(form.foreignRegistrationNumber, form.foreign_registration_number)),
    residencyStatus: normalizeText(pickFirst(form.foreignResidencyStatus, form.foreign_residency_status)),
    residency_status: normalizeText(pickFirst(form.foreignResidencyStatus, form.foreign_residency_status)),
  })
}

export function buildDirectListingComplianceDeclarations(form = {}) {
  const mandateSigned = normalizeBooleanDeclaration(
    pickFirst(form.hasSignedMandate, form.signedMandate, form.mandateSigned, form.manualMandateStatus, form.mandateStatus),
  )
  const mandateType = normalizeMandateType(form.mandateType)
  const propertyConditionDisclosureSigned = normalizeBooleanDeclaration(
    pickFirst(
      form.hasSignedPropertyConditionDisclosure,
      form.propertyConditionDisclosureSigned,
      form.signedPropertyConditionDisclosure,
      form.property_condition_disclosure_signed,
    ),
  )
  const ficaFormSigned = normalizeBooleanDeclaration(
    pickFirst(form.hasSignedFicaForm, form.ficaFormSigned, form.signedFicaForm, form.fica_form_signed),
  )

  return {
    version: DIRECT_LISTING_INTAKE_VERSION,
    source: DIRECT_LISTING_INTAKE_SOURCE,
    declarationsOnly: true,
    uploadsRequired: false,
    evidenceRequired: false,
    mandate: {
      hasSignedMandate: mandateSigned,
      signed: mandateSigned,
      status: declarationStatus(mandateSigned),
      mandateType: mandateSigned === true ? (mandateType || 'sole') : mandateType,
    },
    propertyConditionDisclosure: {
      signed: propertyConditionDisclosureSigned,
      status: declarationStatus(propertyConditionDisclosureSigned),
    },
    ficaForm: {
      signed: ficaFormSigned,
      status: declarationStatus(ficaFormSigned),
    },
  }
}

export function buildDirectListingPropertyFacts(form = {}) {
  const propertyStructureType = normalizePropertyStructureType(
    pickFirst(form.propertyStructureType, form.propertyTitleType, form.titleType, form.ownershipTitleType, form.propertyType),
    { fallback: 'full_title' },
  )
  const propertyCategory = normalizePropertyCategory(form.propertyCategory, { fallback: 'residential' })
  const address = normalizeText(pickFirst(form.formattedAddress, form.propertyAddress, form.address))

  return compactObject({
    address,
    propertyAddress: normalizeText(pickFirst(form.propertyAddress, form.address, form.formattedAddress)),
    formattedAddress: normalizeText(pickFirst(form.formattedAddress, form.propertyAddress, form.address)),
    streetAddress: normalizeText(form.streetAddress),
    streetNumber: normalizeText(form.streetNumber),
    street_number: normalizeText(form.streetNumber),
    streetName: normalizeText(pickFirst(form.streetName, form.route)),
    street_name: normalizeText(pickFirst(form.streetName, form.route)),
    route: normalizeText(pickFirst(form.route, form.streetName)),
    suburb: normalizeText(form.suburb),
    city: normalizeText(form.city),
    province: normalizeText(form.province),
    country: normalizeText(form.country) || 'South Africa',
    postalCode: normalizeText(form.postalCode),
    propertyCategory,
    property_category: propertyCategory,
    propertyType: normalizeText(form.propertyType),
    property_type: normalizeText(form.propertyType),
    propertyStructureType,
    property_structure_type: propertyStructureType,
    propertyTitleType: propertyStructureType,
    property_title_type: propertyStructureType,
    unitNumber: normalizeText(form.unitNumber),
    unit_number: normalizeText(form.unitNumber),
    sectionNumber: normalizeText(form.sectionNumber),
    section_number: normalizeText(form.sectionNumber),
    complexName: normalizeText(form.complexName),
    complex_name: normalizeText(form.complexName),
    estateName: normalizeText(form.estateName),
    estate_name: normalizeText(form.estateName),
    sectionalTitleNumber: normalizeText(form.sectionalTitleNumber),
    sectional_title_number: normalizeText(form.sectionalTitleNumber),
    bedrooms: normalizeText(form.bedrooms),
    bathrooms: normalizeText(form.bathrooms),
    garages: normalizeText(form.garages),
    parkingCount: normalizeText(form.parkingCount),
    parking_count: normalizeText(form.parkingCount),
    floorSize: normalizeText(form.floorSize),
    floor_size: normalizeText(form.floorSize),
    erfSize: normalizeText(form.erfSize),
    erf_size: normalizeText(form.erfSize),
  })
}

export function buildDirectListingPartyFacts(form = {}) {
  const sellerLegalType = normalizeSellerLegalType(form)
  const { ownerEntityType, ownerStructureType } = resolveOwnerModel(sellerLegalType, form)
  const identity = normalizeSellerIdentity(form)
  const company = normalizeCompanyFacts(form)
  const trust = normalizeTrustFacts(form)
  const foreign = normalizeForeignFacts(form)
  const owners = normalizePeopleCollection(pickFirst(form.multipleOwners, form.owners), 'Owner')
  const spouse = normalizePersonRecord(
    {
      fullName: pickFirst(form.spouseName, form.spouseFullName, form.spouse_full_name),
      email: pickFirst(form.spouseEmail, form.spouse_email),
      phone: pickFirst(form.spousePhone, form.spouse_phone),
      idNumber: pickFirst(form.spouseIdNumber, form.spouse_id_number),
    },
    'Spouse',
  )
  const hasSpouse = Boolean(spouse.name || spouse.surname || spouse.fullName || spouse.email || spouse.phone || spouse.idNumber)

  return compactObject({
    ...identity,
    sellerType: sellerLegalType,
    sellerLegalType,
    seller_legal_type: sellerLegalType,
    ownershipType: sellerLegalType,
    ownerEntityType,
    owner_entity_type: ownerEntityType,
    ownerStructureType,
    owner_structure_type: ownerStructureType,
    foreignOwner: sellerLegalType === 'foreign_individual' || ownerEntityType === 'foreign',
    foreign_owner: sellerLegalType === 'foreign_individual' || ownerEntityType === 'foreign',
    foreignOwnerCountry: foreign.country,
    foreign_owner_country: foreign.country,
    foreign,
    companyName: company.name,
    company_name: company.name,
    companyRegistrationNumber: company.registrationNumber,
    company_registration_number: company.registrationNumber,
    companyDirectors: company.directors,
    company_directors: company.directors,
    directors: company.directors,
    company,
    trustName: trust.name,
    trust_name: trust.name,
    trustRegistrationNumber: trust.registrationNumber,
    trust_registration_number: trust.registrationNumber,
    trustees: trust.trustees,
    trust_trustees: trust.trustees,
    trust,
    multipleOwners: owners,
    owners,
    maritalStatus: normalizeText(pickFirst(form.maritalStatus, form.marital_status)),
    marital_status: normalizeText(pickFirst(form.maritalStatus, form.marital_status)),
    marriedInCommunityOfProperty: normalizeBooleanDeclaration(form.marriedInCommunityOfProperty ?? form.married_in_community_of_property),
    spouse: hasSpouse ? spouse : undefined,
  })
}

export function buildDirectListingOnboardingFormData(form = {}, context = {}) {
  const partyFacts = buildDirectListingPartyFacts(form)
  const propertyFacts = buildDirectListingPropertyFacts(form)
  const complianceDeclarations = buildDirectListingComplianceDeclarations(form)
  const sellerPortalInviteRequested = normalizeBooleanDeclaration(
    pickFirst(form.sellerPortalInviteRequested, form.sendSellerPortalLink, form.wouldLikeToSendSellerPortalLink),
  ) === true

  return compactObject({
    ...partyFacts,
    ...propertyFacts,
    complianceDeclarations,
    compliance_declarations: complianceDeclarations,
    sellerPortalInviteRequested,
    seller_portal_invite_requested: sellerPortalInviteRequested,
    directListingIntake: {
      version: DIRECT_LISTING_INTAKE_VERSION,
      source: DIRECT_LISTING_INTAKE_SOURCE,
      capturedBy: normalizeText(context.capturedBy),
      capturedAt: normalizeText(context.capturedAt),
      declarationsOnly: true,
      uploadsRequired: false,
    },
  })
}

export function buildDirectListingCanonicalFacts(form = {}, context = {}) {
  const partyFacts = buildDirectListingPartyFacts(form)
  const propertyFacts = buildDirectListingPropertyFacts(form)
  const complianceDeclarations = buildDirectListingComplianceDeclarations(form)
  const legalType = partyFacts.sellerLegalType || 'individual'

  return compactObject({
    version: DIRECT_LISTING_INTAKE_VERSION,
    source: DIRECT_LISTING_INTAKE_SOURCE,
    sellerName: partyFacts.fullName || partyFacts.sellerName || partyFacts.companyName || partyFacts.trustName,
    name: partyFacts.fullName || partyFacts.sellerName || partyFacts.companyName || partyFacts.trustName,
    fullName: partyFacts.fullName,
    firstName: partyFacts.sellerName,
    lastName: partyFacts.sellerSurname,
    email: partyFacts.email,
    sellerEmail: partyFacts.sellerEmail,
    phone: partyFacts.phone,
    sellerPhone: partyFacts.sellerPhone,
    mobile: partyFacts.mobile,
    ...propertyFacts,
    seller: {
      ...partyFacts,
      legalType,
      legal_type: legalType,
      ownerEntityType: partyFacts.ownerEntityType,
      owner_entity_type: partyFacts.ownerEntityType,
      ownerStructureType: partyFacts.ownerStructureType,
      owner_structure_type: partyFacts.ownerStructureType,
    },
    property: propertyFacts,
    complianceDeclarations,
    compliance_declarations: complianceDeclarations,
    metadata: {
      version: DIRECT_LISTING_INTAKE_VERSION,
      source: DIRECT_LISTING_INTAKE_SOURCE,
      capturedBy: normalizeText(context.capturedBy),
      capturedAt: normalizeText(context.capturedAt),
      declarationsOnly: true,
      uploadsRequired: false,
    },
  })
}

export function buildDirectListingIntakePayload(form = {}, context = {}) {
  const listing = buildDirectListingPropertyFacts(form)
  const seller = buildDirectListingPartyFacts(form)
  const complianceDeclarations = buildDirectListingComplianceDeclarations(form)
  const sellerOnboardingFormData = buildDirectListingOnboardingFormData(form, context)
  const sellerCanonicalFacts = buildDirectListingCanonicalFacts(form, context)
  const sellerPortalInviteRequested = normalizeBooleanDeclaration(
    pickFirst(form.sellerPortalInviteRequested, form.sendSellerPortalLink, form.wouldLikeToSendSellerPortalLink),
  ) === true

  return {
    version: DIRECT_LISTING_INTAKE_VERSION,
    source: DIRECT_LISTING_INTAKE_SOURCE,
    declarationsOnly: true,
    uploadsRequired: false,
    evidenceRequired: false,
    listing,
    seller,
    sellerOnboardingFormData,
    sellerCanonicalFacts,
    complianceDeclarations,
    sellerPortalInvite: {
      requested: sellerPortalInviteRequested,
      destinationEmail: seller.sellerEmail || seller.email || '',
      destinationPhone: seller.sellerPhone || seller.phone || '',
    },
  }
}

export default {
  DIRECT_LISTING_INTAKE_SOURCE,
  DIRECT_LISTING_INTAKE_VERSION,
  DIRECT_LISTING_MANDATE_TYPES,
  DIRECT_LISTING_SELLER_LEGAL_TYPES,
  buildDirectListingCanonicalFacts,
  buildDirectListingComplianceDeclarations,
  buildDirectListingIntakePayload,
  buildDirectListingOnboardingFormData,
  buildDirectListingPartyFacts,
  buildDirectListingPropertyFacts,
}
