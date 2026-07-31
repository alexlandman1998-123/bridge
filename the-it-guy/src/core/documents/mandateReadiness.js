import {
  mapSellerOnboardingToMandateData,
  normalizeSellerOnboardingStatus,
  validateMandateGenerationData,
} from './mandateDataMapper.js'

const SELLER_CLAUSE_PROFILE_LABELS = Object.freeze({
  company: 'Company seller',
  trust: 'Trust seller',
  individual: 'Individual seller',
  individual_spouse_consent: 'Individual seller with spouse consent',
  close_corporation: 'Close corporation seller',
  party_unknown: 'Seller type not confirmed',
})

const PROPERTY_CLAUSE_PROFILE_LABELS = Object.freeze({
  full_title: 'Full-title property',
  sectional_title: 'Sectional-title property',
  property_unknown: 'Property title type not confirmed',
})

const ROUTING_FACT_LABELS = Object.freeze({
  seller_entity_type: 'seller type',
  seller_marital_regime: 'seller marital regime',
  property_title_type: 'property title type',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function asPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function firstTextValue(...values) {
  return values.map(normalizeText).find(Boolean) || ''
}

function isValidEmail(value) {
  const text = normalizeText(value).toLowerCase()
  if (!text || text.includes(' ')) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return 'R 0'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function labelFromKey(value = '') {
  return normalizeText(value)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

function labelMissingRoutingFact(value = '') {
  const key = normalizeText(value)
  return ROUTING_FACT_LABELS[key] || labelFromKey(key).toLowerCase()
}

function getMandateLegalRouteReadiness(mandateData = {}) {
  const profile = asPlainObject(mandateData?.scenarioProfile || mandateData?.mandateScenarioProfile)
  const missingRoutingFacts = Array.isArray(profile.missingRoutingFacts)
    ? profile.missingRoutingFacts.map(normalizeText).filter(Boolean)
    : []
  const sellerProfile = normalizeText(profile.sellerClauseProfile)
  const propertyProfile = normalizeText(profile.propertyClauseProfile)
  const routeParts = [
    SELLER_CLAUSE_PROFILE_LABELS[sellerProfile] || labelFromKey(sellerProfile),
    PROPERTY_CLAUSE_PROFILE_LABELS[propertyProfile] || labelFromKey(propertyProfile),
  ].filter(Boolean)
  const complete = profile.complete === true && missingRoutingFacts.length === 0

  return {
    complete,
    scenarioKey: normalizeText(profile.scenarioKey || profile.templateVariant || profile.clauseProfile),
    sellerClauseProfile: sellerProfile,
    propertyClauseProfile: propertyProfile,
    missingRoutingFacts,
    value: complete
      ? `Smart route: ${routeParts.join(' + ') || 'Mandate route confirmed'}`
      : `Smart route needs review: ${missingRoutingFacts.map(labelMissingRoutingFact).join(', ') || 'routing facts missing'}`,
  }
}

export function resolveMandateSellerOnboarding(lead = {}) {
  return asPlainObject(lead?.sellerOnboarding || lead?.seller_onboarding)
}

function resolveMandateSellerCanonicalFacts(lead = {}) {
  const onboarding = resolveMandateSellerOnboarding(lead)
  const listings = Array.isArray(lead?.listings) ? lead.listings : []
  const listing = asPlainObject(lead?.privateListing || lead?.private_listing || listings[0])
  const listingOnboarding = asPlainObject(listing.sellerOnboarding || listing.seller_onboarding)
  return [
    lead?.sellerCanonicalFacts || lead?.seller_canonical_facts_json,
    onboarding.canonicalFacts || onboarding.canonical_facts_json,
    listing.sellerCanonicalFacts || listing.seller_canonical_facts_json,
    listingOnboarding.canonicalFacts || listingOnboarding.canonical_facts_json,
  ].map(asPlainObject).find((candidate) => Object.keys(candidate).length) || {}
}

export function resolveMandateSellerOnboardingFormData(lead = {}) {
  const onboarding = resolveMandateSellerOnboarding(lead)
  const canonicalFacts = resolveMandateSellerCanonicalFacts(lead)
  const seller = asPlainObject(canonicalFacts.seller)
  const property = asPlainObject(canonicalFacts.property)
  const transaction = asPlainObject(canonicalFacts.transaction)
  const addressDetails = asPlainObject(property.address_details)
  const canonicalFormData = {
    sellerFirstName: seller.first_name || seller.firstName,
    sellerSurname: seller.surname || seller.last_name || seller.lastName,
    sellerFullName: seller.full_name || seller.fullName || seller.name,
    sellerEmail: seller.email || seller.seller_email,
    sellerPhone: seller.phone || seller.seller_phone,
    entityType: seller.owner_entity_type || seller.entity_type,
    ownershipType: seller.ownership_type || seller.owner_structure_type,
    maritalStatus: seller.marital_status || seller.maritalStatus,
    maritalRegime: seller.marital_regime || seller.maritalRegime,
    spouseName: seller.spouse?.name || seller.spouse_name,
    spouseIdNumber: seller.spouse?.id_number || seller.spouse_id_number,
    propertyAddress: property.address || property.formatted,
    propertyAddressLine1: property.address_line_1 || addressDetails.line_1,
    propertyAddressLine2: property.address_line_2 || addressDetails.line_2,
    suburb: property.suburb || addressDetails.suburb,
    city: property.city || addressDetails.city,
    province: property.province || addressDetails.province,
    postalCode: property.postal_code || addressDetails.postal_code,
    propertyType: property.property_type,
    propertyStructureType: property.property_structure_type || property.title_type,
    propertyTitleType: property.property_title_type || property.title_type,
    unitNumber: property.unit_number,
    sectionNumber: property.section_number,
    schemeName: property.scheme_name || property.scheme?.name,
    estateName: property.estate_name || property.estate?.name,
    askingPrice: transaction.asking_price,
    mandateType: transaction.mandate_type,
    mandateStartDate: transaction.mandate_start_date,
    mandateEndDate: transaction.mandate_end_date,
  }
  return {
    ...canonicalFormData,
    ...asPlainObject(onboarding.form_data),
    ...asPlainObject(onboarding.formData),
  }
}

export function resolveMandatePropertyLabel(lead = {}) {
  const formData = resolveMandateSellerOnboardingFormData(lead)
  const listings = Array.isArray(lead?.listings) ? lead.listings : []
  const listing = asPlainObject(lead?.privateListing || lead?.private_listing || listings[0])
  const listingOnboarding = asPlainObject(listing.sellerOnboarding || listing.seller_onboarding)
  const listingFormData = {
    ...asPlainObject(listingOnboarding.form_data),
    ...asPlainObject(listingOnboarding.formData),
  }
  const propertyDetails = asPlainObject(lead?.propertyDetails || lead?.property_details || listing.propertyDetails || listing.property_details)
  const canonicalFacts = resolveMandateSellerCanonicalFacts(lead)
  const canonicalProperty = asPlainObject(canonicalFacts.property)
  const addressDetails = asPlainObject(
    formData.propertyAddressDetails ||
      formData.property_address_details ||
      formData.addressDetails ||
      formData.address_details ||
      listingFormData.propertyAddressDetails ||
      listingFormData.property_address_details ||
      canonicalProperty.address_details,
  )

  const line1 = firstTextValue(
    lead?.sellerPropertyAddress,
    lead?.seller_property_address,
    lead?.propertyAddress,
    lead?.property_address,
    lead?.formattedAddress,
    lead?.formatted_address,
    lead?.streetAddress,
    lead?.street_address,
    lead?.addressLine1,
    lead?.address_line_1,
    listing.propertyAddress,
    listing.property_address,
    listing.addressLine1,
    listing.address_line_1,
    listing.formattedAddress,
    listing.formatted_address,
    propertyDetails.propertyAddress,
    propertyDetails.property_address,
    propertyDetails.formattedAddress,
    propertyDetails.formatted_address,
    propertyDetails.addressLine1,
    propertyDetails.address_line_1,
    formData.propertyAddress,
    formData.property_address,
    formData.propertyAddressSearch,
    formData.property_address_search,
    formData.formattedAddress,
    formData.formatted_address,
    formData.address,
    formData.propertyAddressLine1,
    formData.property_address_line_1,
    listingFormData.propertyAddress,
    listingFormData.property_address,
    listingFormData.propertyAddressLine1,
    listingFormData.property_address_line_1,
    canonicalProperty.address,
    canonicalProperty.formatted,
    canonicalProperty.address_line_1,
    addressDetails.formatted,
    addressDetails.query,
    addressDetails.line1,
    addressDetails.line_1,
  )
  const suburb = firstTextValue(lead?.suburb, lead?.areaInterest, lead?.area_interest, listing.suburb, formData.suburb, listingFormData.suburb, canonicalProperty.suburb, addressDetails.suburb)
  const city = firstTextValue(lead?.city, listing.city, formData.city, listingFormData.city, canonicalProperty.city, addressDetails.city)
  const composed = [line1, suburb && !line1.toLowerCase().includes(suburb.toLowerCase()) ? suburb : '', city && !line1.toLowerCase().includes(city.toLowerCase()) ? city : ''].filter(Boolean).join(', ')
  return firstTextValue(composed, lead?.propertyInterest, lead?.property_interest, listing.title, listing.listingTitle, listing.listing_title)
}

export function hasMandateSellerOnboardingSubmitted(lead = {}, normalizedStatus = '') {
  const onboarding = resolveMandateSellerOnboarding(lead)
  const status = normalizeText(normalizedStatus || lead?.sellerOnboardingStatus || lead?.seller_onboarding_status || onboarding.status).toLowerCase()
  const onboardingStatus = normalizeText(onboarding.status || onboarding.status_raw || onboarding.onboardingStatus).toLowerCase()
  const submittedAt = normalizeText(
    lead?.sellerOnboardingSubmittedAt ||
      lead?.seller_onboarding_submitted_at ||
      lead?.sellerOnboardingCompletedAt ||
      lead?.seller_onboarding_completed_at ||
      onboarding.submittedAt ||
      onboarding.submitted_at ||
      onboarding.completedAt ||
      onboarding.completed_at,
  )
  const submittedStatuses = ['completed', 'complete', 'submitted', 'under_review', 'onboarding_completed', 'seller_onboarding_completed']
  if (submittedAt) return true
  if (onboardingStatus && !submittedStatuses.includes(onboardingStatus)) return false
  return submittedStatuses.includes(status) || submittedStatuses.includes(onboardingStatus)
}

function buildReadinessRow(key, label, value, ready, options = {}) {
  return {
    key,
    label,
    value,
    ready: ready === true,
    optional: options.optional === true,
    source: normalizeText(options.source),
  }
}

export function resolveMandateReadiness({
  lead = null,
  contact = null,
  agent = null,
  agency = null,
  organisation = null,
  privateListing = null,
  transaction = null,
  templateReadiness = null,
} = {}) {
  const leadRecord = asPlainObject(lead)
  const contactRecord = asPlainObject(contact)
  const agentRecord = asPlainObject(agent)
  const onboarding = resolveMandateSellerOnboarding(leadRecord)
  const onboardingFormData = resolveMandateSellerOnboardingFormData(leadRecord)
  const onboardingStatusKey = normalizeSellerOnboardingStatus(
    leadRecord?.sellerOnboardingStatus || leadRecord?.seller_onboarding_status || onboarding.status,
    {
      hasToken: Boolean(leadRecord?.sellerOnboardingToken || leadRecord?.seller_onboarding_token || onboarding.token),
      hasFormData: Boolean(Object.keys(onboardingFormData).length),
    },
  )
  const onboardingSubmitted = hasMandateSellerOnboardingSubmitted(leadRecord, onboardingStatusKey)
  const propertyLabel = resolveMandatePropertyLabel(leadRecord)
  const sellerNameFromOnboarding = firstTextValue(
    onboardingFormData?.sellerFullName,
    onboardingFormData?.seller_full_name,
    onboardingFormData?.fullName,
    onboardingFormData?.displayName,
    onboardingFormData?.sellerName,
    [onboardingFormData?.sellerFirstName || onboardingFormData?.firstName, onboardingFormData?.sellerSurname || onboardingFormData?.lastName || onboardingFormData?.surname].map(normalizeText).filter(Boolean).join(' '),
  )
  const sellerName = sellerNameFromOnboarding ||
    [contactRecord?.firstName, contactRecord?.lastName].map(normalizeText).filter(Boolean).join(' ') ||
    firstTextValue(leadRecord?.sellerFullName, leadRecord?.seller_full_name, leadRecord?.name)
  const sellerEmail = firstTextValue(
    onboardingFormData?.sellerEmail,
    onboardingFormData?.seller_email,
    onboardingFormData?.email,
    contactRecord?.email,
    leadRecord?.sellerEmail,
    leadRecord?.seller_email,
    leadRecord?.email,
  ).toLowerCase()
  const sellerPhone = firstTextValue(
    onboardingFormData?.sellerPhone,
    onboardingFormData?.seller_phone,
    onboardingFormData?.phone,
    onboardingFormData?.mobile,
    contactRecord?.phone,
    leadRecord?.sellerPhone,
    leadRecord?.seller_phone,
    leadRecord?.phone,
  )
  const askingPrice = Number(leadRecord?.estimatedValue || leadRecord?.estimated_value || leadRecord?.budget || onboardingFormData?.askingPrice || onboardingFormData?.asking_price || 0) || 0
  const agentEmail = firstTextValue(leadRecord?.assignedAgentEmail, leadRecord?.assigned_agent_email, agentRecord.email).toLowerCase()
  const agentName = firstTextValue(leadRecord?.assignedAgentName, leadRecord?.assigned_agent_name, agentRecord.fullName, agentRecord.name, agentRecord.email)
  const hasMinimumMandateData = Boolean(sellerName && sellerPhone && propertyLabel)

  const mapperLead = {
    ...leadRecord,
    name: sellerName,
    sellerName: firstTextValue(contactRecord?.firstName, leadRecord?.sellerName),
    sellerSurname: firstTextValue(contactRecord?.lastName, leadRecord?.sellerSurname),
    sellerEmail,
    sellerPhone,
    propertyAddress: propertyLabel,
    listingTitle: firstTextValue(leadRecord?.propertyInterest, propertyLabel),
    askingPrice,
    assignedAgentName: agentName,
    assignedAgentEmail: agentEmail,
  }
  const mandateData = mapSellerOnboardingToMandateData({
    onboardingSubmission: {
      ...onboardingFormData,
      status: firstTextValue(leadRecord?.sellerOnboardingStatus, onboarding.status),
      askingPrice: askingPrice || '',
      mandateType: firstTextValue(onboardingFormData?.mandateType, leadRecord?.mandateType, 'sole'),
    },
    lead: mapperLead,
    privateListing: privateListing || leadRecord?.privateListing || {},
    agency: agency || {},
    organisation: organisation || {},
    agent: agentRecord,
    contact: contactRecord,
    transaction: transaction || {},
  })
  const validation = validateMandateGenerationData(mandateData, { action: 'generate' })
  const legalRouteReadiness = getMandateLegalRouteReadiness(mandateData)

  const templateReadinessRecord = asPlainObject(templateReadiness)
  const templateRow = templateReadinessRecord.value || templateReadinessRecord.label || templateReadinessRecord.status
    ? buildReadinessRow(
        'template_route',
        'Template route',
        templateReadinessRecord.value || templateReadinessRecord.label || 'Checking published mandate template',
        templateReadinessRecord.ready === true,
        {
          optional: templateReadinessRecord.optional === true,
          source: templateReadinessRecord.source,
        },
      )
    : null

  const rows = [
    buildReadinessRow('seller', 'Seller', sellerName || 'Missing seller name', Boolean(sellerName)),
    buildReadinessRow('seller_email', 'Seller email', sellerEmail || 'Missing seller email', isValidEmail(sellerEmail)),
    buildReadinessRow('seller_phone', 'Seller phone', sellerPhone || 'Not captured', Boolean(sellerPhone), { optional: true }),
    buildReadinessRow('property', 'Property', propertyLabel || 'Missing property details', Boolean(propertyLabel)),
    buildReadinessRow('asking_price', 'Asking price', askingPrice ? formatCurrency(askingPrice) : 'Not captured', askingPrice > 0, { optional: true }),
    buildReadinessRow('legal_route', 'Legal route', legalRouteReadiness.value, legalRouteReadiness.complete, {
      optional: true,
      source: legalRouteReadiness.scenarioKey,
    }),
    templateRow,
    buildReadinessRow('agent', 'Signing agent', agentName || 'Missing agent name', Boolean(agentName)),
    buildReadinessRow('agent_email', 'Agent email', agentEmail || 'Missing agent email', isValidEmail(agentEmail)),
    buildReadinessRow(
      'onboarding',
      'Seller onboarding',
      onboardingSubmitted ? 'Submitted' : (leadRecord?.sellerOnboardingToken || leadRecord?.seller_onboarding_token || onboarding.token) ? 'Link sent, not submitted' : 'Not sent',
      onboardingSubmitted,
      { optional: hasMinimumMandateData },
    ),
  ].filter(Boolean)
  const blockers = rows.filter((row) => !row.ready && !row.optional).map((row) => row.value || `${row.label} is required.`)
  const warnings = rows.filter((row) => !row.ready && row.optional).map((row) => row.value || `${row.label} is not complete.`)

  return {
    canGenerate: blockers.length === 0,
    canSendForSignature: blockers.length === 0,
    blockers,
    warnings,
    rows,
    facts: {
      sellerName,
      sellerEmail,
      sellerPhone,
      sellerEntityType: mandateData?.seller?.entityType || mandateData?.placeholders?.['seller.entity_type_raw'] || '',
      propertyAddress: propertyLabel,
      askingPrice,
      agentName,
      agentEmail,
      sellerOnboardingStatus: onboardingStatusKey,
      sellerOnboardingSubmitted: onboardingSubmitted,
      legalRouteReady: legalRouteReadiness.complete,
      legalScenarioKey: legalRouteReadiness.scenarioKey,
      sellerClauseProfile: legalRouteReadiness.sellerClauseProfile,
      propertyClauseProfile: legalRouteReadiness.propertyClauseProfile,
      missingRoutingFacts: legalRouteReadiness.missingRoutingFacts,
      templateRouteReady: templateReadinessRecord.ready === true,
      templateRouteStatus: normalizeText(templateReadinessRecord.status),
      templateRouteSource: normalizeText(templateReadinessRecord.source),
    },
    mandateData,
    validation,
  }
}
