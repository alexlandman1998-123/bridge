import { buildCanonicalSellerOnboardingPayload } from '../services/documents/sellerOnboardingFactTransformer.js'

export const SELLER_PROFILE_CAPTURE_VERSION = 'seller_profile_capture_phase1_v1'
export const CANONICAL_SELLER_FACTS_FLAG = 'VITE_CANONICAL_SELLER_FACTS_ENABLED'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function splitName(fullName = '') {
  const parts = normalizeText(fullName).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', surname: '' }
  if (parts.length === 1) return { firstName: parts[0], surname: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    surname: parts.slice(-1).join(' '),
  }
}

function isForeignOwnerModel(ownerEntityType = '', ownerStructureType = '') {
  const entity = normalizeKey(ownerEntityType)
  const structure = normalizeKey(ownerStructureType)
  return entity === 'foreign' || structure.startsWith('foreign_')
}

export function areCanonicalSellerFactsEnabled(env = (typeof import.meta !== 'undefined' ? import.meta.env : {})) {
  const raw = normalizeText(env?.[CANONICAL_SELLER_FACTS_FLAG]).toLowerCase()
  return !['0', 'false', 'no', 'off', 'disabled'].includes(raw)
}

export function normalizePersonRecordForSellerProfile(entry = {}, index = 0, roleTitle = 'Person') {
  const explicitSurname = normalizeText(entry.surname || entry.last_name)
  const explicitFirstName = normalizeText(entry.first_name)
  const nameValue = normalizeText(entry.name)
  const fullName = normalizeText(entry.fullName || entry.full_name || entry.contact_name || (!explicitSurname && !explicitFirstName && nameValue.includes(' ') ? nameValue : ''))
  const split = splitName(fullName || nameValue)
  const normalizedRole = normalizeText(roleTitle || 'Person').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    id: normalizeText(entry.id) || `${normalizedRole || 'person'}-${index + 1}`,
    name: normalizeText(explicitFirstName || (fullName ? split.firstName : nameValue) || split.firstName),
    surname: normalizeText(explicitSurname || split.surname),
    email: normalizeText(entry.email),
    phone: normalizeText(entry.phone),
    residentialAddress: normalizeText(entry.residentialAddress || entry.residential_address || entry.address),
    idNumber: normalizeText(entry.idNumber || entry.id_number || entry.identityNumber || entry.identity_number),
    ownershipShare: normalizeText(entry.ownershipShare || entry.ownership_share),
    consentToSell: Boolean(entry.consentToSell ?? entry.consent_to_sell),
    signingAuthority: Boolean(entry.signingAuthority ?? entry.signing_authority),
    roleTitle: normalizeText(entry.roleTitle || entry.role_title || roleTitle),
  }
}

export function normalizePersonCollectionForSellerProfile(entries = [], fallback = null, roleTitle = 'Person') {
  const source = Array.isArray(entries) ? entries : []
  const mapped = source
    .map((entry, index) => normalizePersonRecordForSellerProfile(entry, index, roleTitle))
    .filter((entry) => Boolean(entry.name || entry.surname || entry.email || entry.phone || entry.idNumber))

  if (mapped.length) return mapped

  if (fallback && typeof fallback === 'object') {
    const record = normalizePersonRecordForSellerProfile(fallback, 0, roleTitle)
    if (record.name || record.surname || record.email || record.phone || record.idNumber) {
      return [record]
    }
  }

  return []
}

export function createBlankSellerProfilePersonRecord(roleTitle = 'Person', index = 0, { timestamp = Date.now() } = {}) {
  const normalizedRole = normalizeText(roleTitle || 'person').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return {
    id: `${normalizedRole || 'person'}-${timestamp}-${index + 1}`,
    name: '',
    surname: '',
    email: '',
    phone: '',
    residentialAddress: '',
    idNumber: '',
    ownershipShare: '',
    consentToSell: false,
    signingAuthority: false,
    roleTitle,
  }
}

export function normalizeSellerProfileEntityPersonAliases(entry = {}, index = 0, roleTitle = 'Person') {
  const record = normalizePersonRecordForSellerProfile(entry, index, roleTitle)
  const firstName = normalizeText(record.name)
  const surname = normalizeText(record.surname)
  const fullName = [firstName, surname].filter(Boolean).join(' ').trim() || normalizeText(entry.fullName || entry.full_name || entry.name)
  const capacity = normalizeText(entry.capacity || entry.roleCapacity || entry.role_capacity)
  return {
    ...record,
    name: fullName || firstName,
    fullName,
    full_name: fullName,
    firstName,
    first_name: firstName,
    lastName: surname,
    last_name: surname,
    residential_address: record.residentialAddress,
    capacity,
    roleCapacity: capacity,
    role_capacity: capacity,
    id_number: record.idNumber,
    ownership_share: record.ownershipShare,
    consent_to_sell: record.consentToSell,
    signing_authority: record.signingAuthority,
    role_title: record.roleTitle,
  }
}

export function normalizeSellerProfileEntityPersonAliasCollection(entries = [], roleTitle = 'Person') {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => normalizeSellerProfileEntityPersonAliases(entry, index, roleTitle))
    .filter((entry) => Boolean(entry.fullName || entry.firstName || entry.lastName || entry.email || entry.phone || entry.idNumber))
}

export function buildSellerEntityProfileAliases(form = {}) {
  const ownerEntityType = normalizeText(form.ownerEntityType || form.owner_entity_type)
  const ownerStructureType = normalizeText(form.ownerStructureType || form.owner_structure_type || form.ownershipType)
  const sellerLegalType = normalizeText(form.sellerLegalType || form.seller_legal_type || form.ownershipType)
  const foreignOwner = isForeignOwnerModel(ownerEntityType, ownerStructureType)
  const companyDirectors = normalizeSellerProfileEntityPersonAliasCollection(form.companyDirectors || form.company_directors || form.directors || [], 'Director')
  const trustees = normalizeSellerProfileEntityPersonAliasCollection(form.trustees || form.trust_trustees || [], 'Trustee')
  const trustBeneficiaries = normalizeSellerProfileEntityPersonAliasCollection(form.trustBeneficiaries || form.trust_beneficiaries || form.beneficiaries || [], 'Beneficiary')
  const authorisedSignatory = normalizeSellerProfileEntityPersonAliases({
    name: form.authorisedSignatoryName || form.authorised_signatory_name,
    capacity: form.authorisedSignatoryCapacity || form.authorised_signatory_capacity,
    email: form.authorisedSignatoryEmail || form.authorised_signatory_email,
    phone: form.authorisedSignatoryPhone || form.authorised_signatory_phone,
    residentialAddress: form.authorisedSignatoryAddress || form.authorised_signatory_address,
    signingAuthority: true,
  }, 0, 'Authorised Signatory')
  const authorisedTrustee = normalizeSellerProfileEntityPersonAliases({
    name: form.authorisedTrusteeName || form.authorised_trustee_name,
    capacity: form.authorisedTrusteeCapacity || form.authorised_trustee_capacity,
    email: form.authorisedTrusteeEmail || form.authorised_trustee_email,
    phone: form.authorisedTrusteePhone || form.authorised_trustee_phone,
    residentialAddress: form.authorisedTrusteeAddress || form.authorised_trustee_address,
    signingAuthority: true,
  }, 0, 'Authorised Trustee')
  const companyName = normalizeText(form.companyName || form.company_name)
  const companyRegistrationNumber = normalizeText(form.companyRegistrationNumber || form.company_registration_number)
  const companyRegisteredAddress = normalizeText(form.companyRegisteredAddress || form.company_registered_address)
  const trustName = normalizeText(form.trustName || form.trust_name)
  const trustRegistrationNumber = normalizeText(form.trustRegistrationNumber || form.trust_registration_number)
  const trustRegisteredAddress = normalizeText(form.trustRegisteredAddress || form.trust_registered_address)
  const foreignOwnerCountry = normalizeText(form.foreignOwnerCountry || form.foreign_owner_country)
  const foreignPassportNumber = normalizeText(form.foreignPassportNumber || form.foreign_passport_number || form.passportNumber)
  const foreignRegistrationNumber = normalizeText(form.foreignRegistrationNumber || form.foreign_registration_number)
  const foreignResidencyStatus = normalizeText(form.foreignResidencyStatus || form.foreign_residency_status || form.residencyStatus)

  return {
    ownerEntityType,
    owner_entity_type: ownerEntityType,
    ownerStructureType,
    owner_structure_type: ownerStructureType,
    sellerLegalType,
    seller_legal_type: sellerLegalType,
    ownershipType: normalizeText(form.ownershipType),
    ownership_type: normalizeText(form.ownershipType),
    foreignOwner,
    foreign_owner: foreignOwner,
    foreignOwnerCountry,
    foreign_owner_country: foreignOwnerCountry,
    foreignPassportNumber,
    foreign_passport_number: foreignPassportNumber,
    foreignRegistrationNumber,
    foreign_registration_number: foreignRegistrationNumber,
    foreignResidencyStatus,
    foreign_residency_status: foreignResidencyStatus,
    foreign: {
      country: foreignOwnerCountry,
      jurisdiction: foreignOwnerCountry,
      passportNumber: foreignPassportNumber,
      passport_number: foreignPassportNumber,
      registrationNumber: foreignRegistrationNumber,
      registration_number: foreignRegistrationNumber,
      residencyStatus: foreignResidencyStatus,
      residency_status: foreignResidencyStatus,
    },
    companyName,
    company_name: companyName,
    companyRegistrationNumber,
    company_registration_number: companyRegistrationNumber,
    companyRegisteredAddress,
    company_registered_address: companyRegisteredAddress,
    companyDirectors,
    company_directors: companyDirectors,
    directors: companyDirectors,
    authorisedSignatoryName: authorisedSignatory.fullName,
    authorised_signatory_name: authorisedSignatory.fullName,
    authorisedSignatoryCapacity: authorisedSignatory.capacity,
    authorised_signatory_capacity: authorisedSignatory.capacity,
    authorisedSignatoryEmail: authorisedSignatory.email,
    authorised_signatory_email: authorisedSignatory.email,
    authorisedSignatoryPhone: authorisedSignatory.phone,
    authorised_signatory_phone: authorisedSignatory.phone,
    authorisedSignatoryAddress: authorisedSignatory.residentialAddress,
    authorised_signatory_address: authorisedSignatory.residentialAddress,
    companyResolutionDate: normalizeText(form.companyResolutionDate || form.company_resolution_date),
    company_resolution_date: normalizeText(form.companyResolutionDate || form.company_resolution_date),
    companyAuthorityBasis: normalizeText(form.companyAuthorityBasis || form.company_authority_basis),
    company_authority_basis: normalizeText(form.companyAuthorityBasis || form.company_authority_basis),
    company: {
      name: companyName,
      companyName,
      company_name: companyName,
      registrationNumber: companyRegistrationNumber,
      registration_number: companyRegistrationNumber,
      registeredAddress: companyRegisteredAddress,
      registered_address: companyRegisteredAddress,
      directors: companyDirectors,
      authorisedSignatory,
      authorised_signatory: authorisedSignatory,
      resolutionDate: normalizeText(form.companyResolutionDate || form.company_resolution_date),
      resolution_date: normalizeText(form.companyResolutionDate || form.company_resolution_date),
      authorityBasis: normalizeText(form.companyAuthorityBasis || form.company_authority_basis),
      authority_basis: normalizeText(form.companyAuthorityBasis || form.company_authority_basis),
    },
    trustName,
    trust_name: trustName,
    trustRegistrationNumber,
    trust_registration_number: trustRegistrationNumber,
    trustRegisteredAddress,
    trust_registered_address: trustRegisteredAddress,
    trustees,
    trust_trustees: trustees,
    trustBeneficiaries,
    trust_beneficiaries: trustBeneficiaries,
    beneficiaries: trustBeneficiaries,
    authorisedTrusteeName: authorisedTrustee.fullName,
    authorised_trustee_name: authorisedTrustee.fullName,
    authorisedTrusteeCapacity: authorisedTrustee.capacity,
    authorised_trustee_capacity: authorisedTrustee.capacity,
    authorisedTrusteeEmail: authorisedTrustee.email,
    authorised_trustee_email: authorisedTrustee.email,
    authorisedTrusteePhone: authorisedTrustee.phone,
    authorised_trustee_phone: authorisedTrustee.phone,
    authorisedTrusteeAddress: authorisedTrustee.residentialAddress,
    authorised_trustee_address: authorisedTrustee.residentialAddress,
    trustAuthorityBasis: normalizeText(form.trustAuthorityBasis || form.trust_authority_basis),
    trust_authority_basis: normalizeText(form.trustAuthorityBasis || form.trust_authority_basis),
    trust: {
      name: trustName,
      trustName,
      trust_name: trustName,
      registrationNumber: trustRegistrationNumber,
      registration_number: trustRegistrationNumber,
      registeredAddress: trustRegisteredAddress,
      registered_address: trustRegisteredAddress,
      trustees,
      beneficiaries: trustBeneficiaries,
      authorisedTrustee,
      authorised_trustee: authorisedTrustee,
      authorityBasis: normalizeText(form.trustAuthorityBasis || form.trust_authority_basis),
      authority_basis: normalizeText(form.trustAuthorityBasis || form.trust_authority_basis),
    },
  }
}

export function buildSellerProfileCanonicalPayload(form = {}, listing = {}, options = {}) {
  const env = options.env || (typeof import.meta !== 'undefined' ? import.meta.env : {})
  if (options.enabled === false || !areCanonicalSellerFactsEnabled(env)) return {}
  return buildCanonicalSellerOnboardingPayload(form || {}, listing || {}, {
    contextType: options.contextType || 'private_listing',
    contextId: options.contextId || listing?.id || '',
    listingId: options.listingId || listing?.id || '',
    source: options.source || 'seller_profile_capture',
    draft: Boolean(options.draft),
  })
}

export default {
  CANONICAL_SELLER_FACTS_FLAG,
  SELLER_PROFILE_CAPTURE_VERSION,
  areCanonicalSellerFactsEnabled,
  buildSellerEntityProfileAliases,
  buildSellerProfileCanonicalPayload,
  createBlankSellerProfilePersonRecord,
  normalizePersonCollectionForSellerProfile,
  normalizePersonRecordForSellerProfile,
  normalizeSellerProfileEntityPersonAliasCollection,
  normalizeSellerProfileEntityPersonAliases,
}
