import { transformSellerOnboardingToFacts } from '../../services/documents/sellerOnboardingFactTransformer.js'

export const SELLER_ONBOARDING_SIGNING_PACK_SNAPSHOT_CONTRACT = 'arch9-seller-onboarding-signing-pack-snapshot-v1'

const text = (value) => String(value ?? '').trim()
const record = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const firstText = (...values) => values.map(text).find(Boolean) || ''

function personName(person = {}) {
  const value = record(person)
  return firstText(
    value.fullName,
    value.full_name,
    value.name,
    [value.firstName || value.first_name, value.surname || value.lastName || value.last_name].filter(Boolean).join(' '),
  )
}

function splitName(value = '') {
  const parts = text(value).split(/\s+/).filter(Boolean)
  return {
    firstName: parts.slice(0, -1).join(' ') || parts[0] || '',
    surname: parts.length > 1 ? parts.at(-1) || '' : '',
  }
}

function personSnapshot(person = {}, role = 'Seller') {
  const value = record(person)
  return {
    firstName: firstText(value.firstName, value.first_name),
    surname: firstText(value.surname, value.lastName, value.last_name),
    name: personName(value),
    role: firstText(value.role, value.role_title, role),
    idNumber: firstText(value.idNumber, value.id_number, value.sellerIdNumber, value.passportNumber, value.passport_number, value.foreignPassportNumber),
    dateOfBirth: firstText(value.dateOfBirth, value.date_of_birth),
    nationality: firstText(value.nationality, value.countryOfNationality, value.country_of_nationality),
    countryOfResidence: firstText(value.countryOfResidence, value.country_of_residence, value.residencyCountry, value.residency_country),
    incomeTaxNumber: firstText(value.incomeTaxNumber, value.income_tax_number, value.taxNumber, value.tax_number),
    residentialAddress: firstText(value.residentialAddress, value.residential_address, value.physicalAddress, value.physical_address, value.address),
    email: firstText(value.email, value.emailAddress, value.email_address).toLowerCase(),
    phone: firstText(value.phone, value.mobile, value.mobileNumber, value.mobile_number),
    occupation: firstText(value.occupation),
    sourceOfFunds: firstText(value.sourceOfFunds, value.source_of_funds),
    authorityBasis: firstText(value.authorityBasis, value.authority_basis, value.authority_details, value.capacity),
  }
}

function canonicalParties(seller = {}) {
  const source = record(seller)
  const parties = []
  const add = (people, role) => {
    if (!Array.isArray(people)) return
    people.forEach((person) => {
      const snapshot = personSnapshot(person, role)
      if (snapshot.name || snapshot.idNumber || snapshot.email) parties.push(snapshot)
    })
  }
  add(source.owners, 'Seller')
  add(source.company?.directors, 'Director')
  add(source.company?.beneficial_owners, 'Beneficial owner')
  add(source.trust?.trustees, 'Trustee')
  add(source.trust?.beneficiaries, 'Beneficiary')
  add(source.deceased_estate?.executors, 'Executor')
  add(source.power_of_attorney?.representatives, 'Representative')
  return parties
}

function selectedParties(formData = {}, seller = {}) {
  const form = record(formData)
  const legalType = firstText(form.sellerLegalType, form.seller_legal_type, form.sellerType, seller.legalType).toLowerCase()
  const people = (keys, role) => {
    const items = keys.flatMap((key) => Array.isArray(form[key]) ? form[key] : [])
    return items.map((person) => personSnapshot(person, role)).filter((person) => person.name || person.idNumber || person.email)
  }
  if (['multiple_owners', 'multiple_owners_married'].includes(legalType)) return people(['multipleOwners', 'multiple_owners', 'owners'], 'Seller')
  if (['company', 'close_corporation', 'foreign_company'].includes(legalType)) return people(['companyDirectors', 'company_directors', 'directors'], 'Director')
  if (['trust', 'foreign_trust'].includes(legalType)) return people(['trustees'], 'Trustee')
  return []
}

function propertyAddress(form = {}, listing = {}, fallback = '') {
  const address = record(form.propertyAddress || form.property_address)
  return firstText(
    fallback,
    [address.line1 || address.line_1, address.line2 || address.line_2, address.suburb, address.city || address.town, address.province, address.postalCode || address.postal_code].filter(Boolean).join(', '),
    form.propertyAddressText,
    form.property_address_text,
    listing.propertyAddress,
    listing.formattedAddress,
    listing.address,
  )
}

/**
 * The only shared contract passed to a public seller signing link. It is a
 * frozen projection of canonical onboarding/listing facts; later phases add
 * controlled corrections without allowing separate per-screen data models.
 */
export function buildSellerOnboardingSigningPackSnapshot({
  formData = {},
  listing = {},
  recipients = [],
  selectedDocuments = ['fica', 'mandate'],
  propertyAddress: propertyAddressOverride = '',
  mandate = {},
  branding = {},
  sellerPortalTasks = [],
  generatedAt = new Date().toISOString(),
} = {}) {
  const form = record(formData)
  const currentListing = record(listing)
  const canonicalFacts = transformSellerOnboardingToFacts(form, currentListing, { source: 'seller_signing_pack_snapshot' })
  const canonicalSeller = record(canonicalFacts.seller)
  const suppliedSellerName = firstText(form.sellerName, form.fullName, form.name, currentListing.sellerName, currentListing.seller?.name)
  const suppliedNameParts = splitName(suppliedSellerName)
  const sellerIdentity = personSnapshot({
    firstName: canonicalSeller.first_name || form.sellerFirstName || form.firstName || suppliedNameParts.firstName,
    surname: canonicalSeller.surname || form.sellerSurname || form.lastName || suppliedNameParts.surname,
    name: suppliedSellerName,
    idNumber: canonicalSeller.id_number || canonicalSeller.foreign?.passport_number || form.idNumber || form.sellerIdNumber,
    dateOfBirth: canonicalSeller.date_of_birth || form.dateOfBirth || form.date_of_birth,
    nationality: canonicalSeller.nationality || form.nationality,
    countryOfResidence: canonicalSeller.foreign?.country || form.countryOfResidence || form.country_of_residence,
    incomeTaxNumber: canonicalSeller.tax_number || form.sellerIncomeTaxNumber || form.incomeTaxNumber || form.taxNumber,
    residentialAddress: canonicalSeller.residential_address || form.residentialAddress || form.residential_address || form.physicalAddress,
    email: canonicalSeller.email || form.sellerEmail || form.seller_email || form.email || currentListing.sellerEmail,
    phone: canonicalSeller.phone || form.mobile || form.mobileNumber || form.phone || currentListing.sellerPhone,
    occupation: form.occupation,
    sourceOfFunds: form.sourceOfFunds || form.source_of_funds,
  })
  const legalType = firstText(canonicalSeller.legal_type, form.sellerLegalType, form.seller_legal_type, form.sellerType, currentListing.sellerType)
  const seller = {
    ...sellerIdentity,
    legalType,
    ownershipType: firstText(canonicalSeller.owner_structure_type, form.ownerStructureType, form.owner_structure_type, form.ownershipType),
    maritalStatus: firstText(canonicalSeller.marital_status, form.maritalStatus, form.marital_status),
    maritalRegime: firstText(canonicalSeller.marital_regime, form.maritalRegime, form.marital_regime),
    vatRegistered: firstText(canonicalSeller.vat_registered, form.vatRegistered, form.vat_registered),
    vatNumber: firstText(canonicalSeller.vat_number, form.vatNumber, form.vat_number),
    companyName: firstText(canonicalSeller.company?.name, form.companyName, form.company_name),
    companyRegistrationNumber: firstText(canonicalSeller.company?.registration_number, form.companyRegistrationNumber, form.company_registration_number),
    trustName: firstText(canonicalSeller.trust?.name, form.trustName, form.trust_name),
    trustRegistrationNumber: firstText(canonicalSeller.trust?.registration_number, form.trustRegistrationNumber, form.trust_registration_number),
  }
  const parties = canonicalParties(canonicalSeller)
  if (!parties.length) parties.push(...selectedParties(form, seller))
  seller.parties = parties.length ? parties : [sellerIdentity].filter((person) => person.name || person.idNumber || person.email)
  const address = firstText(
    propertyAddressOverride,
    canonicalFacts.property?.address,
    propertyAddress(form, currentListing),
  )
  const safeMandate = record(mandate)
  const normalizedRecipients = (Array.isArray(recipients) ? recipients : []).map((recipient) => ({
    name: text(recipient?.name), email: text(recipient?.email).toLowerCase(), role: text(recipient?.role) || 'Seller',
  })).filter((recipient) => recipient.name || recipient.email)

  return {
    contract: SELLER_ONBOARDING_SIGNING_PACK_SNAPSHOT_CONTRACT,
    version: 'seller_signing_pack_v1',
    frozenAt: generatedAt,
    selectedDocuments: Array.isArray(selectedDocuments) ? selectedDocuments.filter((key) => ['fica', 'disclosure', 'mandate'].includes(key)) : [],
    onboardingSource: {
      kind: 'seller_onboarding_submission',
      submittedAt: firstText(form.submittedAt, form.submitted_at, form.sellerOnboardingCompletion?.completedAt, form.seller_onboarding_completion?.completed_at, currentListing.sellerOnboarding?.submittedAt, currentListing.sellerOnboarding?.submitted_at),
      message: 'Seller facts were captured in onboarding and frozen into this signing pack for review and controlled correction.',
    },
    branding: record(branding),
    seller,
    property: {
      address,
      titleDeedNumber: firstText(form.titleDeedNumber, form.title_deed_number, form.deedNumber),
      bondStatus: firstText(form.bondStatus, form.propertyBondStatus, form.property_bond_status),
    },
    proposedTransferAttorney: form.proposedTransferAttorney || form.proposed_transfer_attorney || null,
    disclosure: record(form.propertyDisclosure || form.property_disclosure),
    sellerPortalTasks: Array.isArray(sellerPortalTasks) ? sellerPortalTasks : [],
    signers: normalizedRecipients,
    mandate: { ...safeMandate, propertyAddress: firstText(safeMandate.propertyAddress, address), branding: record(branding) },
    templateVersions: {
      mandate: firstText(form.mandateTemplateVersion, form.mandate_template_version, 'agency_sales_mandate_vnext'),
      disclosure: 'property_disclosure_annexure_a_v1',
      fica: 'arch9_fica_declaration_v1',
    },
  }
}

export default buildSellerOnboardingSigningPackSnapshot
