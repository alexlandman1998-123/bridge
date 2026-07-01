import {
  buildPropertyDisclosureAnnexureSnapshot,
  isPropertyDisclosureDigitallyComplete,
  normalizePropertyDisclosure,
} from '../../lib/propertyDisclosure.js'

const ZAR_CURRENCY = new Intl.NumberFormat('en-ZA', {
  style: 'currency',
  currency: 'ZAR',
  maximumFractionDigits: 0,
})

export {
  formatMandateValidationMessage,
  MANDATE_FIELD_GROUP_LABELS,
  MANDATE_FIELD_LABELS,
  validateMandateGenerationData,
} from './mandateValidation.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function valueIndicatesMarried(value = '') {
  const normalized = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (!normalized) return false
  if (/(^|_)(single|unmarried|divorced|widowed|not_married|never_married)($|_)/.test(normalized)) return false
  return (
    normalized.includes('married') ||
    normalized.includes('community') ||
    normalized.includes('cop') ||
    normalized.includes('anc') ||
    normalized.includes('antenuptial')
  )
}

function normalizeNullableText(value) {
  const text = normalizeText(value)
  return text || null
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeText(value)
    if (text) return text
  }
  return ''
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) return parsed
  }
  return null
}

function firstNumberWithSource(candidates = []) {
  for (const candidate of candidates) {
    const value = candidate?.value
    if (value === null || value === undefined || value === '') continue
    const parsed = Number(value)
    if (Number.isFinite(parsed) && parsed > 0) {
      return {
        value: parsed,
        source: candidate?.source || 'unknown',
      }
    }
  }
  return { value: null, source: '' }
}

function joinAddressParts(...values) {
  return values.map((value) => normalizeText(value)).filter(Boolean).join(', ')
}

function joinUniqueAddressParts(...values) {
  const seen = new Set()
  const parts = []
  for (const value of values) {
    const text = normalizeText(value)
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    parts.push(text)
  }
  return parts.join(', ')
}

function formatUnitNumber(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  return /^unit\s+/i.test(text) ? text : `Unit ${text}`
}

function formatOwnershipShare(value = '') {
  const text = normalizeText(value)
  if (!text) return ''
  return text.includes('%') ? text : `${text}%`
}

function toTitleCase(value) {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

const MARKETING_AUTHORISATION_LABELS = [
  ['allowOnlineMarketing', 'allow_online_marketing', 'Agency Website'],
  ['allowPropertyPortals', 'allow_property_portals', 'Property portals'],
  ['allowSocialMedia', 'allow_social_media', 'Social Media'],
  ['allowShowBoards', 'allow_show_boards', 'Show boards'],
]

const SPECIAL_MANDATE_CONDITION_LABELS = [
  ['sellerApprovalRequired', 'All offers remain subject to seller approval.'],
  ['replacementPropertyRequired', 'The mandate is subject to the seller securing a replacement property.'],
  ['existingLease', 'The property is subject to an existing lease.'],
  ['tenantRightsApply', 'Tenant rights apply and must be observed.'],
  ['occupationBeforeRegistration', 'Occupation before registration is permitted by agreement.'],
  ['occupationAfterRegistration', 'Occupation is permitted after registration only.'],
]

function formatCurrency(value) {
  const amount = firstNumber(value)
  if (!Number.isFinite(amount)) return null
  return ZAR_CURRENCY.format(amount)
}

function formatPercent(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return null
  return `${parsed.toFixed(2)}%`
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function buildMarketingPermissionsText(onboarding = {}, lead = {}) {
  const source = {
    ...normalizeObject(lead.marketingAuthorisations),
    ...normalizeObject(lead.marketing_authorisations),
    ...normalizeObject(onboarding.marketingAuthorisations),
    ...normalizeObject(onboarding.marketing_authorisations),
  }
  const flatValues = {
    allowOnlineMarketing: onboarding.allowOnlineMarketing ?? onboarding.allow_online_marketing ?? lead.allowOnlineMarketing ?? lead.allow_online_marketing,
    allowPropertyPortals: onboarding.allowPropertyPortals ?? onboarding.allow_property_portals ?? lead.allowPropertyPortals ?? lead.allow_property_portals,
    allowSocialMedia: onboarding.allowSocialMedia ?? onboarding.allow_social_media ?? lead.allowSocialMedia ?? lead.allow_social_media,
    allowShowBoards: onboarding.allowShowBoards ?? onboarding.allow_show_boards ?? lead.allowShowBoards ?? lead.allow_show_boards,
  }
  for (const [key, value] of Object.entries(flatValues)) {
    if (value !== undefined && value !== null) source[key] = value
  }
  const selected = MARKETING_AUTHORISATION_LABELS
    .filter(([camelKey, snakeKey]) => Boolean(source[camelKey] ?? source[snakeKey]))
    .map(([, , label]) => label)
  return selected.length ? `Seller authorises marketing via: ${selected.join(', ')}.` : ''
}

function buildSpecialMandateConditionsText(onboarding = {}, lead = {}) {
  const source = {
    ...normalizeObject(lead.specialMandateConditions),
    ...normalizeObject(lead.special_mandate_conditions),
    ...normalizeObject(onboarding.specialMandateConditions),
    ...normalizeObject(onboarding.special_mandate_conditions),
  }
  const selected = SPECIAL_MANDATE_CONDITION_LABELS
    .filter(([key]) => Boolean(source[key]))
    .map(([, clause]) => clause)
  return selected.join('\n')
}

export function normalizeSellerOnboardingStatus(value = '', { hasToken = false, hasFormData = false } = {}) {
  const key = normalizeKey(value)
  if (['completed', 'complete', 'onboarding_completed'].includes(key)) return 'completed'
  if (['submitted', 'under_review'].includes(key)) return 'submitted'
  if (['in_progress', 'progress', 'started', 'opened'].includes(key)) return key === 'opened' ? 'opened' : 'in_progress'
  if (['sent', 'onboarding_sent'].includes(key)) return 'sent'
  if (['failed', 'error', 'rejected'].includes(key)) return 'failed'
  if (hasFormData) return 'in_progress'
  if (hasToken) return 'sent'
  return 'not_sent'
}

function isCompletedOnboardingStatus(value, options = {}) {
  return normalizeSellerOnboardingStatus(value, options) === 'completed'
}

function toIsoDate(value) {
  if (value) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  }
  return ''
}

function addDaysToIsoDate(days = 0, baseDate = new Date()) {
  const source = baseDate instanceof Date ? new Date(baseDate.getTime()) : new Date(baseDate)
  if (Number.isNaN(source.getTime())) return ''
  source.setHours(0, 0, 0, 0)
  source.setDate(source.getDate() + Number(days || 0))
  return source.toISOString().slice(0, 10)
}

function normalizeEntityType(value = '') {
  const key = normalizeKey(value)
  if (key.includes('company')) return 'company'
  if (key.includes('trust')) return 'trust'
  if (key.includes('individual') || key.includes('married') || key.includes('single')) return 'individual'
  return key || 'individual'
}

function buildMapperInput(input = {}, legacyLead = {}, legacyAgency = {}, legacyAgent = {}) {
  const isCanonicalInput =
    input &&
    typeof input === 'object' &&
    (
      Object.prototype.hasOwnProperty.call(input, 'onboardingSubmission') ||
      Object.prototype.hasOwnProperty.call(input, 'privateListing') ||
      Object.prototype.hasOwnProperty.call(input, 'organisation') ||
      Object.prototype.hasOwnProperty.call(input, 'transaction') ||
      Object.prototype.hasOwnProperty.call(input, 'contact')
    )

  if (isCanonicalInput) {
    return {
      onboardingSubmission: input.onboardingSubmission || input.onboarding || {},
      lead: input.lead || {},
      privateListing: input.privateListing || input.listing || {},
      agency: input.agency || {},
      organisation: input.organisation || {},
      agent: input.agent || input.user || {},
      contact: input.contact || {},
      transaction: input.transaction || {},
      mandateDraft: input.mandateDraft || {},
    }
  }

  return {
    onboardingSubmission: input || {},
    lead: legacyLead || {},
    privateListing: {},
    agency: legacyAgency || {},
    organisation: legacyAgency || {},
    agent: legacyAgent || {},
    contact: legacyLead?.contact || {},
    transaction: {},
    mandateDraft: {},
  }
}

function resolveSellerProfile(onboarding = {}, lead = {}, contact = {}) {
  const ownershipType = normalizeKey(
    firstText(onboarding.ownershipType, onboarding.ownership_structure, onboarding.entityType, onboarding.sellerType, lead.sellerType) || 'individual',
  )
  const entityType = normalizeEntityType(ownershipType)
  const firstName = firstText(onboarding.sellerFirstName, onboarding.firstName, lead.sellerName)
  const surname = firstText(onboarding.sellerSurname, onboarding.lastName, onboarding.surname, lead.sellerSurname)
  const individualName = firstText(
    onboarding.seller_full_name,
    onboarding.fullName,
    onboarding.display_name,
    onboarding.displayName,
    [firstName, surname].filter(Boolean).join(' '),
    contact.name,
    [contact.firstName, contact.lastName].filter(Boolean).join(' '),
    lead.name,
  )
  const companyName = firstText(onboarding.companyName, onboarding.entityName, onboarding.seller_full_name)
  const trustName = firstText(onboarding.trustName, onboarding.entityName, onboarding.seller_full_name)
  const isCompany = entityType === 'company'
  const isTrust = entityType === 'trust'
  const identityNumber = isCompany
    ? firstText(onboarding.companyRegistrationNumber, onboarding.entityRegistrationNumber, onboarding.seller_id_number)
    : isTrust
      ? firstText(onboarding.trustRegistrationNumber, onboarding.entityRegistrationNumber, onboarding.seller_id_number)
      : firstText(onboarding.idNumber, onboarding.passportNumber, onboarding.seller_id_number, lead.sellerIdNumber)

  return {
    entityType,
    fullName: isCompany ? companyName : isTrust ? trustName : individualName,
    identityNumber,
    idNumber: identityNumber,
    email: firstText(onboarding.email, onboarding.sellerEmail, contact.email, lead.sellerEmail, lead.email),
    phone: firstText(onboarding.phone, onboarding.sellerPhone, contact.phone, lead.sellerPhone, lead.phone),
    domiciliumAddress: firstText(
      onboarding.domiciliumAddress,
      onboarding.domicilium_address,
      onboarding.residentialAddress,
      onboarding.residential_address,
      onboarding.physicalAddress,
      onboarding.physical_address,
      onboarding.companyRegisteredAddress,
      onboarding.company_registered_address,
      onboarding.trustRegisteredAddress,
      onboarding.trust_registered_address,
      contact.address,
      lead.address,
    ),
    maritalStatus: firstText(onboarding.maritalStatus, valueIndicatesMarried(ownershipType) ? 'married' : ''),
    maritalRegime: firstText(onboarding.marriageType, onboarding.marriageRegime, onboarding.maritalRegime, onboarding.antenuptialContract, valueIndicatesMarried(ownershipType) ? ownershipType : ''),
    spouseName: firstText(onboarding.spouseName),
    spouseIdNumber: firstText(onboarding.spouseIdNumber),
    spouseEmail: firstText(onboarding.spouseEmail),
    representativeName: isCompany
      ? firstText(onboarding.representativeName, onboarding.companyRepresentativeName, onboarding.companyDirectorName, onboarding.authorisedRepresentativeName, onboarding.authorizedRepresentativeName, onboarding.entityRepresentative)
      : isTrust
        ? firstText(onboarding.representativeName, onboarding.trustRepresentativeName, onboarding.trusteeName, onboarding.authorisedRepresentativeName, onboarding.authorizedRepresentativeName, onboarding.entityRepresentative)
        : firstText(onboarding.representativeName, onboarding.authorisedRepresentativeName, onboarding.authorizedRepresentativeName),
    representativeIdNumber: firstText(onboarding.representativeIdNumber, onboarding.companyDirectorIdNumber, onboarding.trusteeIdNumber),
    representativeCapacity: isCompany
      ? firstText(onboarding.representativeCapacity, onboarding.companyDirectorCapacity, onboarding.authorisedRepresentativeCapacity, onboarding.authorizedRepresentativeCapacity, 'Director')
      : isTrust
        ? firstText(onboarding.representativeCapacity, onboarding.trusteeCapacity, onboarding.authorisedRepresentativeCapacity, onboarding.authorizedRepresentativeCapacity, 'Trustee')
        : firstText(onboarding.representativeCapacity, onboarding.authorisedRepresentativeCapacity, onboarding.authorizedRepresentativeCapacity),
    trustRegistrationNumber: firstText(onboarding.trustRegistrationNumber),
    companyRegistrationNumber: firstText(onboarding.companyRegistrationNumber),
    multipleOwners: Array.isArray(onboarding.multipleOwners) ? onboarding.multipleOwners : [],
  }
}

function normalizeSellerOwnerParty(owner = {}, index = 0) {
  const payload = normalizeObject(owner)
  const name = firstText(
    payload.fullName,
    payload.full_name,
    payload.displayName,
    payload.display_name,
    [payload.firstName || payload.first_name || payload.name, payload.lastName || payload.last_name || payload.surname].filter(Boolean).join(' '),
    payload.name,
  )
  const idNumber = firstText(
    payload.idNumber,
    payload.id_number,
    payload.identityNumber,
    payload.identity_number,
    payload.passportNumber,
    payload.passport_number,
    payload.registrationNumber,
    payload.registration_number,
  )
  const party = {
    role: 'Seller',
    title: firstText(payload.roleTitle, payload.role_title, `Seller ${index + 1}`),
    name,
    idNumber,
    email: firstText(payload.email, payload.emailAddress, payload.email_address),
    phone: firstText(payload.phone, payload.mobile, payload.mobileNumber, payload.mobile_number),
    capacity: firstText(payload.capacity, payload.signingCapacity, payload.signing_capacity, payload.roleTitle, payload.role_title),
    ownershipShare: formatOwnershipShare(firstText(payload.ownershipShare, payload.ownership_share, payload.share)),
  }
  return [party.name, party.idNumber, party.email, party.phone, party.capacity, party.ownershipShare].some((value) => normalizeText(value)) ? party : null
}

function buildSellerParties(seller = {}) {
  const owners = Array.isArray(seller.multipleOwners) ? seller.multipleOwners : []
  const ownerParties = owners
    .map((owner, index) => normalizeSellerOwnerParty(owner, index))
    .filter(Boolean)
  if (ownerParties.length) return ownerParties

  const primarySeller = {
    role: 'Seller',
    title: 'Seller',
    name: seller.fullName,
    idNumber: seller.identityNumber,
    email: seller.email,
    phone: seller.phone,
    capacity: seller.representativeCapacity,
  }
  const spouse = {
    role: 'Seller',
    title: 'Spouse / Co-seller',
    name: seller.spouseName,
    idNumber: seller.spouseIdNumber,
    email: seller.spouseEmail,
  }
  return [primarySeller, spouse].filter((party) => [party.name, party.idNumber, party.email, party.phone, party.capacity].some((value) => normalizeText(value)))
}

function resolvePropertyProfile(onboarding = {}, lead = {}, privateListing = {}, transaction = {}) {
  const addressDetails = onboarding.propertyAddressDetails || onboarding.property_address_details || onboarding.addressDetails || onboarding.address_details || {}
  const unitNumber = firstText(onboarding.unitNumber, onboarding.unit_number, addressDetails.unitNumber, addressDetails.unit_number, privateListing.unitNumber, privateListing.unit_number, lead.unitNumber, transaction.unit_number)
  const sectionNumber = firstText(onboarding.sectionNumber, onboarding.section_number, addressDetails.sectionNumber, addressDetails.section_number, privateListing.sectionNumber, privateListing.section_number, lead.sectionNumber, transaction.section_number)
  const complexName = firstText(onboarding.complexName, onboarding.complex_name, onboarding.schemeName, onboarding.scheme_name, onboarding.estateComplexName, addressDetails.complexName, addressDetails.complex_name, addressDetails.schemeName, addressDetails.scheme_name, lead.complexName, lead.estateComplexName)
  const estateName = firstText(onboarding.estateName, onboarding.estate_name, onboarding.estateComplexName, addressDetails.estateName, addressDetails.estate_name, lead.estateName, lead.estateComplexName)
  const sectionalTitleScheme = firstText(onboarding.sectionalTitleScheme, onboarding.property_sectional_title_scheme, onboarding.sectionalTitleNumber, onboarding.schemeName, onboarding.scheme_name, addressDetails.sectionalTitleScheme, addressDetails.schemeName, lead.sectionalTitleScheme, transaction.sectional_title_number)
  const structuredOnboardingAddress = firstText(
    addressDetails.formatted,
    addressDetails.fullAddress,
    addressDetails.address,
    joinAddressParts(addressDetails.line1, addressDetails.line2, addressDetails.suburb, addressDetails.city, addressDetails.province, addressDetails.postalCode || addressDetails.postal_code),
    joinAddressParts(onboarding.propertyAddressLine1 || onboarding.property_address_line_1 || onboarding.addressLine1, onboarding.propertyAddressLine2 || onboarding.property_address_line_2 || onboarding.addressLine2, onboarding.suburb || onboarding.property_suburb, onboarding.city || onboarding.property_city, onboarding.province || onboarding.property_province, onboarding.postalCode || onboarding.postal_code),
  )
  const askingPrice = firstNumber(
    onboarding.askingPrice,
    onboarding.marketingPrice,
    privateListing.askingPrice,
    privateListing.asking_price,
    lead.askingPrice,
    lead.estimatedPrice,
    lead.estimatedValue,
    lead.budget,
    transaction.asking_price,
    transaction.purchase_price,
    transaction.sales_price,
  )
  const address = firstText(
    onboarding.propertyAddress,
    onboarding.property_address,
    onboarding.address,
    onboarding.streetAddress,
    structuredOnboardingAddress,
    privateListing.propertyAddress,
    privateListing.addressLine1,
    privateListing.address_line_1,
    lead.propertyAddress,
    lead.sellerPropertyAddress,
    lead.addressLine1,
    lead.listingTitle,
    transaction.property_address,
    transaction.property_address_line_1,
    lead.propertyInterest,
  )
  const displayAddress = joinUniqueAddressParts(formatUnitNumber(unitNumber), complexName, estateName, address)
  return {
    fullAddress: address,
    displayAddress: displayAddress || address,
    address,
    type: firstText(onboarding.propertyType, onboarding.propertyStructureType, privateListing.propertyType, lead.propertyType, transaction.property_type, lead.propertyInterest),
    propertyType: firstText(onboarding.propertyType, onboarding.propertyStructureType, privateListing.propertyType, lead.propertyType, transaction.property_type, lead.propertyInterest),
    suburb: firstText(onboarding.suburb, privateListing.suburb, lead.suburb, transaction.suburb, lead.areaInterest),
    city: firstText(onboarding.city, privateListing.city, lead.city, transaction.city),
    province: firstText(onboarding.province, privateListing.province, lead.province, transaction.province),
    postalCode: firstText(onboarding.postalCode, privateListing.postalCode, privateListing.postal_code, lead.postalCode, transaction.postal_code),
    erfNumber: firstText(onboarding.erfNumber, onboarding.erf, lead.erfNumber, privateListing.erfNumber, transaction.erf_number),
    sectionalTitleScheme,
    estateComplexName: firstText(complexName, estateName),
    complexName,
    estateName,
    unitNumber,
    sectionNumber,
    erfSize: firstText(onboarding.erfSize, lead.erfSize),
    floorSize: firstText(onboarding.floorSize, lead.floorSize),
    bedrooms: firstText(onboarding.bedrooms, lead.bedrooms),
    bathrooms: firstText(onboarding.bathrooms, lead.bathrooms),
    askingPrice,
  }
}

function resolveMandateProfile(onboarding = {}, lead = {}, agency = {}, organisation = {}, privateListing = {}, transaction = {}, mandateDraft = {}) {
  const commissionStructure = normalizeKey(firstText(
    onboarding.commissionStructure,
    onboarding.commissionType,
    onboarding.commission_type,
    mandateDraft.commissionStructure,
    lead.commissionStructure,
    agency.defaultCommissionStructure,
    organisation.defaultCommissionStructure,
    'percentage',
  ))
  const commissionPercentResolved = firstNumberWithSource([
    { value: onboarding.commissionPercentage, source: 'private_listing_seller_onboarding' },
    { value: onboarding.commissionPercent, source: 'private_listing_seller_onboarding' },
    { value: onboarding.commission_percentage, source: 'private_listing_seller_onboarding' },
    { value: onboarding.mandateCommissionPercent, source: 'private_listing_seller_onboarding' },
    { value: mandateDraft.commissionPercent, source: 'document_packet_context' },
    { value: lead.commissionPercent, source: 'lead' },
    { value: lead.mandateCommissionPercent, source: 'lead' },
    { value: agency.defaultCommissionPercentage, source: 'agency_default' },
    { value: agency.defaultCommissionPercent, source: 'agency_default' },
    { value: organisation.defaultCommissionPercentage, source: 'agency_default' },
    { value: organisation.defaultCommissionPercent, source: 'agency_default' },
  ].filter(Boolean))
  const commissionAmountResolved = firstNumberWithSource([
    { value: onboarding.commissionAmount, source: 'private_listing_seller_onboarding' },
    { value: onboarding.commission_amount, source: 'private_listing_seller_onboarding' },
    { value: onboarding.mandateCommissionAmount, source: 'private_listing_seller_onboarding' },
    { value: mandateDraft.commissionAmount, source: 'document_packet_context' },
    { value: lead.commissionAmount, source: 'lead' },
    { value: agency.defaultCommissionAmount, source: 'agency_default' },
    { value: organisation.defaultCommissionAmount, source: 'agency_default' },
  ])
  const askingPrice = firstNumber(onboarding.marketingPrice, onboarding.askingPrice, privateListing.askingPrice, privateListing.asking_price, lead.askingPrice, lead.estimatedPrice, lead.estimatedValue, lead.budget, transaction.asking_price, transaction.purchase_price)
  const explicitStartDate = firstText(onboarding.mandateStartDate, onboarding.mandate_start_date, onboarding.startDate, mandateDraft.mandateStartDate, mandateDraft.startDate, lead.mandateStartDate, privateListing.mandateStartDate)
  const explicitEndDate = firstText(onboarding.mandateExpiryDate, onboarding.mandate_expiry_date, onboarding.mandateEndDate, onboarding.mandate_end_date, onboarding.expiryDate, mandateDraft.mandateEndDate, mandateDraft.expiryDate, mandateDraft.endDate, lead.mandateEndDate, privateListing.mandateEndDate)
  const startDate = toIsoDate(explicitStartDate) || addDaysToIsoDate(0)
  const expiryDate = toIsoDate(explicitEndDate) || addDaysToIsoDate(90)
  const resolvedCommissionPercentage = commissionPercentResolved.value ?? (commissionStructure === 'fixed' ? null : 7.5)
  const marketingPermissions = firstText(
    onboarding.marketingPermissions,
    onboarding.mandateMarketingPermissions,
    lead.marketingPermissions,
    buildMarketingPermissionsText(onboarding, lead),
  )
  const selectedSpecialConditions = buildSpecialMandateConditionsText(onboarding, lead)
  const additionalConditions = firstText(
    onboarding.additionalConditions,
    onboarding.additional_conditions,
    onboarding.additionalMandateConditions,
    onboarding.additional_mandate_conditions,
    lead.additionalConditions,
  )
  const specialConditions = firstText(
    onboarding.specialConditions,
    lead.specialConditions,
    [selectedSpecialConditions, additionalConditions].filter(Boolean).join('\n'),
  )

  return {
    type: firstText(onboarding.mandateType, onboarding.mandate_type, mandateDraft.mandateType, mandateDraft.type, lead.mandateType, privateListing.mandateType, agency.defaultMandateType, organisation.defaultMandateType, 'sole'),
    startDate,
    expiryDate,
    endDate: expiryDate,
    startDateWasDefaulted: false,
    endDateWasDefaulted: false,
    authorityGranted: firstText(onboarding.authorityGranted, lead.authorityGranted),
    commissionStructure: commissionStructure || 'percentage',
    commissionPercentage: resolvedCommissionPercentage,
    commissionPercent: resolvedCommissionPercentage,
    commissionPercentageSource: commissionPercentResolved.source || (resolvedCommissionPercentage !== null ? 'draft_default' : ''),
    commissionAmount: commissionAmountResolved.value,
    commissionAmountSource: commissionAmountResolved.source,
    vatHandling: firstText(onboarding.vatHandling, onboarding.vat_handling, lead.vatHandling, agency.vatHandling, organisation.vatHandling, 'exclusive'),
    askingPrice,
    marketingPermissions,
    accessInstructions: firstText(onboarding.accessInstructions, lead.accessInstructions),
    specialConditions,
    annexuresList: firstText(onboarding.annexuresList, lead.annexuresList),
  }
}

function resolvePropertyDisclosureAnnexure(onboarding = {}, privateListing = {}, transaction = {}) {
  const source =
    onboarding.propertyDisclosure ||
    onboarding.property_disclosure ||
    onboarding.disclosure ||
    onboarding.generatedDocument?.disclosure ||
    onboarding.propertyDisclosureDocument?.disclosure ||
    {}
  const normalized = normalizePropertyDisclosure(source, {
    kind: onboarding.propertyBranch === 'commercial' || onboarding.property_branch === 'commercial' ? 'commercial' : 'residential',
  })
  if (!isPropertyDisclosureDigitallyComplete(normalized)) return null
  return buildPropertyDisclosureAnnexureSnapshot(normalized, {
    listingId: privateListing?.id || onboarding.listingId || onboarding.listing_id,
    propertyId: privateListing?.property_profile_id || onboarding.propertyId || onboarding.property_id,
    transactionId: transaction?.id || onboarding.transactionId || onboarding.transaction_id,
    generatedAt: onboarding.generatedDocument?.generatedAt || onboarding.propertyDisclosure?.generatedDocument?.generatedAt,
  })
}

function appendAnnexureLabel(current = '', label = '') {
  const nextLabel = normalizeText(label)
  if (!nextLabel) return normalizeText(current)
  const existing = normalizeText(current)
  if (!existing) return nextLabel
  if (existing.toLowerCase().includes(nextLabel.toLowerCase())) return existing
  return `${existing}; ${nextLabel}`
}

function resolveAgencyProfile(agency = {}, organisation = {}, lead = {}) {
  const legalName = firstText(agency.legalName, agency.legal_name, organisation.legalName, organisation.legal_name, agency.name, agency.organisationName, organisation.displayName, organisation.display_name, organisation.name, lead.agencyName)
  return {
    legalName,
    name: legalName,
    tradingName: firstText(agency.tradingName, agency.trading_name, organisation.tradingName, organisation.displayName, organisation.display_name, organisation.name, legalName),
    registrationNumber: firstText(agency.registrationNumber, agency.agencyRegistrationNumber, agency.companyRegistrationNumber, organisation.registrationNumber, organisation.registration_number, organisation.companyRegistrationNumber),
    vatNumber: firstText(agency.vatNumber, agency.vat_number, organisation.vatNumber, organisation.vat_number),
    address: firstText(agency.address, agency.agencyAddress, organisation.address, organisation.physicalAddress),
    branchName: firstText(agency.branchName, organisation.branchName, lead.branchName),
    fspNumber: firstText(agency.fspNumber, agency.fsp_number, organisation.fspNumber, organisation.fsp_number, agency.metadata?.fspNumber, agency.metadata?.fsp_number, organisation.metadata?.fspNumber, organisation.metadata?.fsp_number),
    phone: firstText(agency.phone, agency.contactPhone),
    email: firstText(agency.email, agency.contactEmail),
    logoUrl: firstText(agency.logoUrl, agency.logoLightUrl, organisation.logoUrl, organisation.logo_url),
    logoLightUrl: firstText(agency.logoLightUrl, agency.logoUrl, organisation.logoLightUrl, organisation.logo_url),
    logoDarkUrl: firstText(agency.logoDarkUrl, agency.logoHighContrastUrl, organisation.logoDarkUrl, organisation.logo_high_contrast_url),
  }
}

function resolveAgentProfile(agent = {}, lead = {}) {
  return {
    fullName: firstText(agent.fullName, agent.name, lead.assignedAgentName),
    email: firstText(agent.email, lead.assignedAgentEmail),
    phone: firstText(agent.phone, lead.assignedAgentPhone),
    ffcNumber: firstText(agent.ffcNumber, agent.fidelityFundCertificateNumber, lead.agentFfcNumber),
  }
}

function resolveSourceContext({ onboarding = {}, lead = {}, privateListing = {}, agency = {}, organisation = {}, agent = {}, transaction = {} } = {}) {
  return {
    seller: Object.keys(onboarding).length ? 'private_listing_seller_onboarding' : lead?.sellerName || lead?.name ? 'lead' : 'unknown',
    property: privateListing?.id || privateListing?.propertyAddress || privateListing?.addressLine1 ? 'private_listings' : Object.keys(onboarding).length ? 'private_listing_seller_onboarding' : transaction?.id ? 'transaction' : 'lead',
    mandate: Object.keys(onboarding).length ? 'private_listing_seller_onboarding' : privateListing?.id ? 'private_listings' : 'lead',
    commission: agency?.defaultCommissionPercentage || agency?.defaultCommissionPercent || organisation?.defaultCommissionPercentage || organisation?.defaultCommissionPercent ? 'agency_default' : Object.keys(onboarding).length ? 'private_listing_seller_onboarding' : 'lead',
    agency: organisation?.id || organisation?.name || organisation?.displayName ? 'organisation_settings' : agency?.name || agency?.legalName ? 'agency_context' : 'unknown',
    agent: agent?.id || agent?.email || agent?.fullName ? 'user_profile' : 'lead_assignment',
  }
}

function safePlaceholder(value) {
  return value === null || value === undefined ? '' : value
}

export function mapSellerOnboardingToMandateData(input = {}, legacyLead = {}, legacyAgency = {}, legacyAgent = {}) {
  const {
    onboardingSubmission,
    lead,
    privateListing,
    agency,
    organisation,
    agent,
    contact,
    transaction,
    mandateDraft,
  } = buildMapperInput(input, legacyLead, legacyAgency, legacyAgent)
  const onboarding = onboardingSubmission && typeof onboardingSubmission === 'object' ? onboardingSubmission : {}
  const seller = resolveSellerProfile(onboarding, lead, contact)
  const sellerParties = buildSellerParties(seller)
  const property = resolvePropertyProfile(onboarding, lead, privateListing, transaction)
  const mandate = resolveMandateProfile(onboarding, lead, agency, organisation, privateListing, transaction, mandateDraft)
  const propertyDisclosureAnnexure = resolvePropertyDisclosureAnnexure(onboarding, privateListing, transaction)
  if (propertyDisclosureAnnexure) {
    mandate.annexuresList = appendAnnexureLabel(mandate.annexuresList, propertyDisclosureAnnexure.title)
  }
  const agencyProfile = resolveAgencyProfile(agency, organisation, lead)
  const agentProfile = resolveAgentProfile(agent, lead)
  const onboardingStatus = firstText(
    onboarding.status,
    onboarding.onboardingStatus,
    lead.sellerOnboardingStatus,
    lead.onboardingStatus,
    lead.sellerOnboarding?.status,
  )
  const onboardingStatusNormalized = normalizeSellerOnboardingStatus(onboardingStatus, {
    hasToken: Boolean(lead.sellerOnboardingToken || lead.sellerOnboarding?.token),
    hasFormData: Boolean(Object.keys(onboarding).length),
  })
  const onboardingComplete = isCompletedOnboardingStatus(onboardingStatus, {
    hasToken: Boolean(lead.sellerOnboardingToken || lead.sellerOnboarding?.token),
    hasFormData: Boolean(Object.keys(onboarding).length),
  })
  const warnings = []
  const sourceContext = resolveSourceContext({ onboarding, lead, privateListing, agency, organisation, agent, transaction })
  if (propertyDisclosureAnnexure) {
    sourceContext.propertyDisclosureAnnexure = propertyDisclosureAnnexure
    sourceContext.property_disclosure_annexure = propertyDisclosureAnnexure
  }

  if (['company', 'trust'].includes(seller.entityType) && !seller.representativeName) {
    warnings.push(`${toTitleCase(seller.entityType)} representative name is missing.`)
  }
  if (['company', 'trust'].includes(seller.entityType) && !seller.representativeIdNumber) {
    warnings.push(`${toTitleCase(seller.entityType)} representative ID number is missing.`)
  }

  const placeholders = {
    mandate_introduction_purpose: firstText(
      mandate.introductionPurpose,
      'This Mandate Agreement records the appointment of the Agent by the Seller to market the property described in this agreement and to perform the related services set out herein. The purpose of this document is to confirm the parties, the property, the mandate terms, commission arrangements, and any special conditions applicable to the marketing and sale of the property.',
    ),
    seller_parties: sellerParties,
    seller_full_name: safePlaceholder(seller.fullName),
    seller_id_number: safePlaceholder(seller.identityNumber),
    seller_email: safePlaceholder(seller.email),
    seller_phone: safePlaceholder(seller.phone),
    seller_domicilium_address: safePlaceholder(seller.domiciliumAddress),
    seller_entity_type: safePlaceholder(toTitleCase(seller.entityType || 'individual')),
    'seller.entity_type_raw': seller.entityType || 'individual',
    seller_marital_status: safePlaceholder(seller.maritalStatus),
    seller_marital_regime: safePlaceholder(seller.maritalRegime),
    seller_spouse_name: safePlaceholder(seller.spouseName),
    seller_spouse_id_number: safePlaceholder(seller.spouseIdNumber),
    seller_spouse_email: safePlaceholder(seller.spouseEmail),
    seller_representative_name: safePlaceholder(seller.representativeName),
    representative_name: safePlaceholder(seller.representativeName),
    representative_id_number: safePlaceholder(seller.representativeIdNumber),
    seller_representative_capacity: safePlaceholder(seller.representativeCapacity),
    representative_capacity: safePlaceholder(seller.representativeCapacity),
    seller_trust_registration_number: safePlaceholder(seller.trustRegistrationNumber),
    seller_company_registration_number: safePlaceholder(seller.companyRegistrationNumber),

    property_address: safePlaceholder(property.fullAddress),
    property_type: safePlaceholder(property.propertyType),
    property_suburb: safePlaceholder(property.suburb),
    property_city: safePlaceholder(property.city),
    property_province: safePlaceholder(property.province),
    property_postal_code: safePlaceholder(property.postalCode),
    property_erf_number: safePlaceholder(property.erfNumber),
    erf_number: safePlaceholder(property.erfNumber),
    property_display_address: safePlaceholder(property.displayAddress),
    property_unit_number: safePlaceholder(property.unitNumber),
    unit_number: safePlaceholder(property.unitNumber),
    property_section_number: safePlaceholder(property.sectionNumber),
    section_number: safePlaceholder(property.sectionNumber),
    property_complex_name: safePlaceholder(property.complexName),
    property_estate_name: safePlaceholder(property.estateName),
    property_estate_complex_name: safePlaceholder(property.estateComplexName),
    property_sectional_title_scheme: safePlaceholder(property.sectionalTitleScheme),
    sectional_title_number: safePlaceholder(property.sectionalTitleScheme),
    property_asking_price: safePlaceholder(formatCurrency(property.askingPrice)),
    erf_size: safePlaceholder(property.erfSize),
    floor_size: safePlaceholder(property.floorSize),

    mandate_type: safePlaceholder(toTitleCase(mandate.type || 'sole')),
    mandate_start_date: safePlaceholder(mandate.startDate),
    mandate_expiry_date: safePlaceholder(mandate.expiryDate),
    mandate_end_date: safePlaceholder(mandate.expiryDate),
    mandate_authority_granted:
      normalizeNullableText(mandate.authorityGranted) ||
      'The Seller authorises the Agent to market the property and perform the services reasonably required to introduce prospective purchasers and progress a sale on the terms recorded in this agreement.',
    commission_structure: safePlaceholder(toTitleCase(mandate.commissionStructure || 'percentage')),
    commission_percentage: safePlaceholder(formatPercent(mandate.commissionPercentage)),
    mandate_commission_percent: mandate.commissionStructure === 'percentage' ? safePlaceholder(formatPercent(mandate.commissionPercentage)) : 'Not applicable',
    commission_amount: safePlaceholder(formatCurrency(mandate.commissionAmount)),
    mandate_commission_amount: mandate.commissionStructure === 'fixed' ? safePlaceholder(formatCurrency(mandate.commissionAmount)) : 'Not applicable',
    vat_handling: safePlaceholder(toTitleCase(mandate.vatHandling || 'exclusive')),
    asking_price: safePlaceholder(formatCurrency(mandate.askingPrice)),
    purchase_price: safePlaceholder(formatCurrency(mandate.askingPrice)),
    mandate_marketing_permissions: safePlaceholder(mandate.marketingPermissions),
    mandate_access_instructions: safePlaceholder(mandate.accessInstructions),
    annexures_list: safePlaceholder(mandate.annexuresList),
    property_disclosure_annexure: propertyDisclosureAnnexure ? safePlaceholder(propertyDisclosureAnnexure.title) : '',
    property_disclosure_status: propertyDisclosureAnnexure ? safePlaceholder(propertyDisclosureAnnexure.status) : '',
    property_disclosure_comments: propertyDisclosureAnnexure ? safePlaceholder(propertyDisclosureAnnexure.comments) : '',
    special_conditions: safePlaceholder(mandate.specialConditions),

    agency: safePlaceholder(agencyProfile.tradingName || agencyProfile.legalName),
    agency_name: safePlaceholder(agencyProfile.legalName),
    agency_legal_name: safePlaceholder(agencyProfile.legalName),
    agency_trading_name: safePlaceholder(agencyProfile.tradingName),
    agency_display_name: safePlaceholder(agencyProfile.tradingName || agencyProfile.legalName),
    organisation: safePlaceholder(agencyProfile.tradingName || agencyProfile.legalName),
    organisation_name: safePlaceholder(agencyProfile.tradingName || agencyProfile.legalName),
    organisation_display_name: safePlaceholder(agencyProfile.tradingName || agencyProfile.legalName),
    agency_registration_number: safePlaceholder(agencyProfile.registrationNumber),
    agency_vat_number: safePlaceholder(agencyProfile.vatNumber),
    agency_address: safePlaceholder(agencyProfile.address),
    branch_name: safePlaceholder(agencyProfile.branchName),
    agency_fsp_number: safePlaceholder(agencyProfile.fspNumber),
    agency_logo_url: safePlaceholder(agencyProfile.logoUrl),
    'agency.logo_url': safePlaceholder(agencyProfile.logoUrl),
    organisation_logo_url: safePlaceholder(firstText(agencyProfile.logoLightUrl, agencyProfile.logoUrl)),
    organisation_logo_dark_url: safePlaceholder(firstText(agencyProfile.logoDarkUrl, agencyProfile.logoLightUrl, agencyProfile.logoUrl)),
    'organisation.logo_url': safePlaceholder(firstText(agencyProfile.logoLightUrl, agencyProfile.logoUrl)),
    'organisation.logo_light_url': safePlaceholder(firstText(agencyProfile.logoLightUrl, agencyProfile.logoUrl)),
    'organisation.logo_dark_url': safePlaceholder(firstText(agencyProfile.logoDarkUrl, agencyProfile.logoLightUrl, agencyProfile.logoUrl)),
    agent_full_name: safePlaceholder(agentProfile.fullName),
    agent_email: safePlaceholder(agentProfile.email),
    agent_phone: safePlaceholder(agentProfile.phone),
    agent_ffc_number: safePlaceholder(agentProfile.ffcNumber),
  }

  return {
    onboardingStatus,
    onboardingStatusNormalized,
    onboardingComplete,
    seller,
    property,
    mandate,
    agency: agencyProfile,
    agent: agentProfile,
    signatures: {
      sellerName: seller.fullName,
      agentName: agentProfile.fullName,
      sellerSignaturePlaceholder: 'seller_signature',
      agentSignaturePlaceholder: 'agent_signature',
    },
    placeholders,
    sourceContext,
    propertyDisclosureAnnexure,
    warnings,
    sourceSnapshot: {
      onboarding,
      lead,
      privateListing,
      agency: agencyProfile,
      agent: agentProfile,
      organisation,
      transaction,
      propertyDisclosureAnnexure,
      sourceContext,
      generatedAt: new Date().toISOString(),
    },
  }
}
