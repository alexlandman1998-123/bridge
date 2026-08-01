import { resolveLegalDocumentScenarioProfile } from './legalDocumentScenarioProfile.js'
import { resolveResidentialOfferConditionReview } from '../offers/residentialOfferConditionReview.js'

const PARTY_CLAUSE_PROFILE_LABELS = Object.freeze({
  company: 'Company',
  trust: 'Trust',
  individual: 'Individual',
  individual_spouse_consent: 'Individual with spouse consent',
  close_corporation: 'Close corporation',
  party_unknown: 'Party type not confirmed',
})

const PROPERTY_CLAUSE_PROFILE_LABELS = Object.freeze({
  full_title: 'Full-title property',
  sectional_title: 'Sectional-title property',
  property_unknown: 'Property title type not confirmed',
})

const FINANCE_CLAUSE_PROFILE_LABELS = Object.freeze({
  cash: 'Cash',
  bond: 'Bond',
  combination: 'Cash and bond',
  finance_unknown: 'Finance not confirmed',
})

const ROUTING_FACT_LABELS = Object.freeze({
  seller_entity_type: 'seller type',
  seller_marital_regime: 'seller marital regime',
  buyer_entity_type: 'buyer type',
  buyer_marital_regime: 'buyer marital regime',
  property_title_type: 'property title type',
  finance_type: 'finance type',
})

function normalizeText(value) {
  return String(value ?? '').trim()
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

function parseCurrencyAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const normalized = normalizeText(value).replace(/[^\d.,-]/g, '').replace(/,/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatCurrency(value) {
  const amount = Number(value || 0)
  if (!Number.isFinite(amount) || amount <= 0) return ''
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount)
}

function readOfferConditions(offer = {}) {
  return asPlainObject(offer.conditions || offer.conditionsJson || offer.conditions_json)
}

function readResidentialOfferTerms(offer = {}) {
  const conditions = readOfferConditions(offer)
  return asPlainObject(conditions.residentialOfferTerms || offer.residentialOfferTerms || offer.offer?.residentialOfferTerms)
}

function readOfferTermValue(offer = {}, path = [], fallback = '') {
  const terms = readResidentialOfferTerms(offer)
  let cursor = terms
  for (const segment of path) {
    cursor = cursor?.[segment]
    if (cursor === null || cursor === undefined) break
  }
  return cursor === null || cursor === undefined || cursor === '' ? fallback : cursor
}

function normalizeOfferStatus(value = '') {
  return normalizeText(value).toLowerCase()
}

function hasSubmittedOfferStatus(value = '') {
  const status = normalizeOfferStatus(value)
  return [
    'submitted',
    'agent_review',
    'ready_to_generate_otp',
    'sent_to_seller',
    'seller_viewed',
    'accepted',
    'converted_to_transaction',
  ].includes(status)
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

function getOtpLegalRouteReadiness(profile = {}) {
  const profileRecord = asPlainObject(profile)
  const missingRoutingFacts = Array.isArray(profileRecord.missingRoutingFacts)
    ? profileRecord.missingRoutingFacts.map(normalizeText).filter(Boolean)
    : []
  const sellerProfile = normalizeText(profileRecord.sellerClauseProfile)
  const buyerProfile = normalizeText(profileRecord.buyerClauseProfile)
  const propertyProfile = normalizeText(profileRecord.propertyClauseProfile)
  const financeProfile = normalizeText(profileRecord.financeClauseProfile)
  const complete = profileRecord.complete === true && missingRoutingFacts.length === 0
  const routeParts = [
    sellerProfile ? `${PARTY_CLAUSE_PROFILE_LABELS[sellerProfile] || labelFromKey(sellerProfile)} seller` : '',
    buyerProfile ? `${PARTY_CLAUSE_PROFILE_LABELS[buyerProfile] || labelFromKey(buyerProfile)} buyer` : '',
    PROPERTY_CLAUSE_PROFILE_LABELS[propertyProfile] || labelFromKey(propertyProfile),
    FINANCE_CLAUSE_PROFILE_LABELS[financeProfile] || labelFromKey(financeProfile),
  ].filter(Boolean)

  return {
    complete,
    scenarioKey: normalizeText(profileRecord.scenarioKey || profileRecord.templateVariant || profileRecord.clauseProfile),
    sellerClauseProfile: sellerProfile,
    buyerClauseProfile: buyerProfile,
    propertyClauseProfile: propertyProfile,
    financeClauseProfile: financeProfile,
    missingRoutingFacts,
    value: complete
      ? `Smart route: ${routeParts.join(' + ') || 'OTP route confirmed'}`
      : `Smart route needs review: ${missingRoutingFacts.map(labelMissingRoutingFact).join(', ') || 'routing facts missing'}`,
  }
}

function buildOtpTemplateContext({
  leadRecord = {},
  contactRecord = {},
  agentRecord = {},
  organisationRecord = {},
  agencyRecord = {},
  propertyRecord = {},
  transactionRecord = {},
  offerRecord = {},
  onboardingFormData = {},
  buyerName = '',
  buyerEmail = '',
  buyerPhone = '',
  purchasePrice = 0,
} = {}) {
  const sellerDetails = {
    ...asPlainObject(propertyRecord.sellerDetails || propertyRecord.seller_details || propertyRecord.seller),
    entityType: firstTextValue(
      propertyRecord.sellerEntityType,
      propertyRecord.seller_entity_type,
      propertyRecord.sellerType,
      propertyRecord.seller_type,
      propertyRecord.seller?.entityType,
      propertyRecord.seller?.entity_type,
      propertyRecord.sellerDetails?.entityType,
      propertyRecord.seller_details?.entity_type,
    ),
  }
  const buyer = {
    name: buyerName,
    email: buyerEmail,
    phone: buyerPhone,
    entityType: firstTextValue(
      offerRecord.buyerEntityType,
      offerRecord.buyer_entity_type,
      offerRecord.purchaserType,
      offerRecord.purchaser_type,
      leadRecord.buyerEntityType,
      leadRecord.buyer_entity_type,
      leadRecord.purchaserType,
      leadRecord.purchaser_type,
      onboardingFormData.purchaserType,
      onboardingFormData.purchaser_type,
      onboardingFormData.buyer?.legal_type,
      onboardingFormData.buyer?.purchaser_type,
      onboardingFormData.buyer?.branch,
    ),
    maritalStatus: firstTextValue(
      offerRecord.buyerMaritalStatus,
      offerRecord.buyer_marital_status,
      leadRecord.buyerMaritalStatus,
      leadRecord.buyer_marital_status,
      onboardingFormData.maritalStatus,
      onboardingFormData.marital_status,
      onboardingFormData.buyer?.person?.marital_status,
    ),
    maritalRegime: firstTextValue(
      offerRecord.buyerMaritalRegime,
      offerRecord.buyer_marital_regime,
      leadRecord.buyerMaritalRegime,
      leadRecord.buyer_marital_regime,
      onboardingFormData.maritalRegime,
      onboardingFormData.marital_regime,
      onboardingFormData.buyer?.person?.marital_regime,
    ),
  }
  const financeType = firstTextValue(
    offerRecord.financeType,
    offerRecord.finance_type,
    leadRecord.financeType,
    leadRecord.finance_type,
    leadRecord.preferredFinanceType,
    leadRecord.preferred_finance_type,
    transactionRecord.finance_type,
    transactionRecord.financeType,
  )
  const transaction = {
    ...transactionRecord,
    purchase_price: purchasePrice || transactionRecord.purchase_price || transactionRecord.purchasePrice || null,
    finance_type: financeType || transactionRecord.finance_type || transactionRecord.financeType || '',
    purchaser_type: buyer.entityType || transactionRecord.purchaser_type || transactionRecord.purchaserType || '',
  }
  const sourceContext = {
    offer: offerRecord,
    canonicalOffer: offerRecord,
    listing: propertyRecord,
    property: propertyRecord,
    seller: sellerDetails,
    buyer,
  }

  return {
    transaction,
    unit: propertyRecord,
    listing: propertyRecord,
    privateListing: propertyRecord,
    buyer,
    onboardingFormData: {
      ...onboardingFormData,
      purchaserType: buyer.entityType || onboardingFormData.purchaserType || onboardingFormData.purchaser_type || '',
      purchaser_type: buyer.entityType || onboardingFormData.purchaser_type || onboardingFormData.purchaserType || '',
      maritalStatus: buyer.maritalStatus || onboardingFormData.maritalStatus || onboardingFormData.marital_status || '',
      maritalRegime: buyer.maritalRegime || onboardingFormData.maritalRegime || onboardingFormData.marital_regime || '',
    },
    sellerDetails,
    agency: agencyRecord,
    organisation: organisationRecord,
    agent: agentRecord,
    sourceContext,
  }
}

function buildOtpScenarioPlaceholders(templateContext = {}, propertyRecord = {}) {
  const sellerDetails = asPlainObject(templateContext.sellerDetails)
  const buyer = asPlainObject(templateContext.buyer)
  const transaction = asPlainObject(templateContext.transaction)
  return {
    seller_entity_type: labelFromKey(sellerDetails.entityType || sellerDetails.entity_type || ''),
    'seller.entity_type_raw': normalizeText(sellerDetails.entityType || sellerDetails.entity_type),
    seller_marital_status: normalizeText(sellerDetails.maritalStatus || sellerDetails.marital_status),
    seller_marital_regime: normalizeText(sellerDetails.maritalRegime || sellerDetails.marital_regime),
    buyer_entity_type: labelFromKey(buyer.entityType || buyer.entity_type || ''),
    'buyer.entity_type_raw': normalizeText(buyer.entityType || buyer.entity_type),
    buyer_marital_status: normalizeText(buyer.maritalStatus || buyer.marital_status),
    buyer_marital_regime: normalizeText(buyer.maritalRegime || buyer.marital_regime),
    property_type: normalizeText(propertyRecord.propertyType || propertyRecord.property_type || propertyRecord.type),
    property_title_type: normalizeText(
      propertyRecord.propertyTitleType ||
        propertyRecord.property_title_type ||
        propertyRecord.titleType ||
        propertyRecord.title_type ||
        propertyRecord.propertyStructureType ||
        propertyRecord.property_structure_type,
    ),
    property_address: normalizeText(propertyRecord.propertyAddress || propertyRecord.property_address || propertyRecord.address || propertyRecord.title),
    property_unit_number: normalizeText(propertyRecord.unitNumber || propertyRecord.unit_number),
    property_section_number: normalizeText(propertyRecord.sectionNumber || propertyRecord.section_number),
    property_complex_name: normalizeText(propertyRecord.complexName || propertyRecord.complex_name),
    sectional_title_number: normalizeText(propertyRecord.sectionalTitleNumber || propertyRecord.sectional_title_number || propertyRecord.sectionalTitleScheme),
    finance_type: labelFromKey(transaction.finance_type || transaction.financeType || ''),
    'transaction.finance_type_raw': normalizeText(transaction.finance_type || transaction.financeType),
  }
}

export function resolveOtpReadiness({
  lead = null,
  contact = null,
  agent = null,
  agency = null,
  organisation = null,
  property = null,
  transaction = null,
  offer = null,
  onboardingFormData = null,
  deliveryMode = '',
  deliveryLabel = '',
  requiresDigitalContact = true,
  viewingLabel = '',
  hasViewingContext = false,
  templateReadiness = null,
} = {}) {
  const leadRecord = asPlainObject(lead)
  const contactRecord = asPlainObject(contact)
  const agentRecord = asPlainObject(agent)
  const propertyRecord = asPlainObject(property)
  const transactionRecord = asPlainObject(transaction)
  const offerRecord = asPlainObject(offer)
  const onboardingRecord = asPlainObject(onboardingFormData)
  const onboardingBuyer = asPlainObject(onboardingRecord.buyer)
  const onboardingBuyerPerson = asPlainObject(onboardingBuyer.person || onboardingRecord.person)
  const onboardingBuyerCompany = asPlainObject(onboardingBuyer.company || onboardingRecord.company)
  const onboardingBuyerTrust = asPlainObject(onboardingBuyer.trust || onboardingRecord.trust)
  const onboardingBuyerCompanySignatory = asPlainObject(onboardingBuyerCompany.authorised_signatory || onboardingBuyerCompany.authorized_signatory)
  const onboardingBuyerTrustSignatory = asPlainObject(onboardingBuyerTrust.authorised_trustee || onboardingBuyerTrust.authorized_trustee)
  const offerConditions = readOfferConditions(offerRecord)
  const residentialOfferTerms = readResidentialOfferTerms(offerRecord)
  const offerStatus = normalizeOfferStatus(offerRecord.status || offerRecord.offerStatus || offerRecord.workflowStatus)
  const conditionReview = resolveResidentialOfferConditionReview(offerRecord)
  const buyerName = firstTextValue(
    readOfferTermValue(offerRecord, ['buyer', 'fullName']),
    offerConditions.buyerName,
    offerConditions.fullName,
    offerRecord.buyerName,
    offerRecord.buyer_name,
    [contactRecord.firstName, contactRecord.lastName].map(normalizeText).filter(Boolean).join(' '),
    leadRecord.buyerName,
    leadRecord.buyer_name,
    onboardingRecord.fullName,
    onboardingRecord.full_name,
    [onboardingBuyerPerson.first_name, onboardingBuyerPerson.last_name].map(normalizeText).filter(Boolean).join(' '),
    onboardingBuyerCompany.company_name,
    onboardingBuyerCompany.name,
    onboardingBuyerTrust.trust_name,
    onboardingBuyerTrust.name,
    leadRecord.name,
  )
  const buyerEmail = firstTextValue(
    readOfferTermValue(offerRecord, ['buyer', 'email']),
    offerConditions.buyerEmail,
    offerConditions.email,
    offerRecord.buyerEmail,
    offerRecord.buyer_email,
    contactRecord.email,
    onboardingRecord.email,
    onboardingBuyerPerson.email,
    onboardingBuyerCompanySignatory.email,
    onboardingBuyerTrustSignatory.email,
    leadRecord.email,
  ).toLowerCase()
  const buyerPhone = firstTextValue(
    readOfferTermValue(offerRecord, ['buyer', 'phone']),
    offerConditions.buyerPhone,
    offerConditions.phone,
    offerRecord.buyerPhone,
    offerRecord.buyer_phone,
    contactRecord.phone,
    onboardingRecord.phone,
    onboardingBuyerPerson.phone,
    onboardingBuyerCompanySignatory.phone,
    onboardingBuyerTrustSignatory.phone,
    leadRecord.phone,
  )
  const propertyLabel = firstTextValue(
    propertyRecord.title,
    propertyRecord.listingTitle,
    propertyRecord.listing_title,
    propertyRecord.propertyAddress,
    propertyRecord.property_address,
    propertyRecord.address,
    leadRecord.propertyInterest,
    leadRecord.property_interest,
  )
  const purchasePrice = parseCurrencyAmount(
    firstTextValue(
      readOfferTermValue(offerRecord, ['finance', 'offerAmount']),
      offerRecord.purchasePrice,
      offerRecord.purchase_price,
      offerRecord.offerAmount,
      offerRecord.offer_amount,
      offerRecord.offerPrice,
      offerRecord.offer_price,
      propertyRecord.price,
      propertyRecord.askingPrice,
      propertyRecord.asking_price,
      transactionRecord.purchase_price,
      transactionRecord.purchasePrice,
      transactionRecord.sales_price,
      transactionRecord.salesPrice,
    ),
  )
  const agentEmail = firstTextValue(leadRecord.assignedAgentEmail, leadRecord.assigned_agent_email, agentRecord.email).toLowerCase()
  const agentName = firstTextValue(leadRecord.assignedAgentName, leadRecord.assigned_agent_name, agentRecord.fullName, agentRecord.name, agentRecord.email)
  const financeType = firstTextValue(
    readOfferTermValue(offerRecord, ['finance', 'financeType']),
    offerConditions.financeType,
    offerRecord.financeType,
    offerRecord.finance_type,
    leadRecord.financeType,
    leadRecord.finance_type,
    leadRecord.preferredFinanceType,
    leadRecord.preferred_finance_type,
    transactionRecord.finance_type,
    transactionRecord.financeType,
  )
  const templateContext = buildOtpTemplateContext({
    leadRecord,
    contactRecord,
    agentRecord,
    organisationRecord: asPlainObject(organisation),
    agencyRecord: asPlainObject(agency),
    propertyRecord,
    transactionRecord,
    offerRecord: {
      ...offerRecord,
      financeType: financeType || offerRecord.financeType || offerRecord.finance_type,
      purchaserType: readOfferTermValue(offerRecord, ['capacity', 'purchaserType'], offerConditions.purchaserType || offerConditions.buyerType || offerRecord.purchaserType || offerRecord.buyerEntityType),
    },
    onboardingFormData: onboardingRecord,
    buyerName,
    buyerEmail,
    buyerPhone,
    purchasePrice,
  })
  const placeholders = buildOtpScenarioPlaceholders(templateContext, propertyRecord)
  const scenarioProfile = resolveLegalDocumentScenarioProfile({
    packetType: 'otp',
    placeholders,
    seller: templateContext.sellerDetails,
    buyer: templateContext.buyer,
    property: propertyRecord,
    transaction: templateContext.transaction,
    sourceContext: templateContext.sourceContext,
    context: templateContext,
  })
  const legalRouteReadiness = getOtpLegalRouteReadiness(scenarioProfile)
  const templateReadinessRecord = asPlainObject(templateReadiness)
  const templateRow = templateReadinessRecord.value || templateReadinessRecord.label || templateReadinessRecord.status
    ? buildReadinessRow(
        'template_route',
        'Template route',
        templateReadinessRecord.value || templateReadinessRecord.label || 'Checking published OTP template',
        templateReadinessRecord.ready === true,
        {
          optional: templateReadinessRecord.optional === true,
          source: templateReadinessRecord.source,
        },
      )
    : null

  const rows = [
    buildReadinessRow('buyer', 'Buyer', buyerName || 'Missing buyer name', Boolean(buyerName)),
    buildReadinessRow(
      'buyer_contact',
      'Buyer contact',
      [buyerEmail, buyerPhone].filter(Boolean).join(' / ') || 'Missing buyer email or phone',
      requiresDigitalContact ? Boolean(isValidEmail(buyerEmail) || buyerPhone) : Boolean(buyerEmail || buyerPhone),
      { optional: !requiresDigitalContact },
    ),
    buildReadinessRow('property', 'Property', propertyLabel || 'Missing property', Boolean(propertyLabel || propertyRecord.id)),
    buildReadinessRow(
      'offer_status',
      'Offer submitted',
      offerStatus ? labelFromKey(offerStatus) : 'Offer + Onboarding not submitted',
      hasSubmittedOfferStatus(offerStatus),
    ),
    buildReadinessRow(
      'offer_terms',
      'Residential offer terms',
      residentialOfferTerms.version
        ? `Captured: ${labelFromKey(residentialOfferTerms.source || 'offer onboarding')}`
        : 'Residential offer terms not captured',
      Boolean(residentialOfferTerms.version),
    ),
    buildReadinessRow(
      'condition_review',
      'Condition wording',
      conditionReview.readyForOtpGeneration
        ? 'Agent-approved wording ready for OTP'
        : conditionReview.reviewRequired
          ? 'Agent must approve or rewrite buyer wording before OTP generation'
          : 'Condition wording not ready',
      conditionReview.readyForOtpGeneration,
    ),
    buildReadinessRow('price', 'Price context', formatCurrency(purchasePrice) || 'Not captured', purchasePrice > 0, { optional: true }),
    buildReadinessRow('viewing', 'Viewing context', viewingLabel || 'No completed viewing linked', Boolean(hasViewingContext), { optional: true }),
    buildReadinessRow('delivery', 'Delivery', deliveryLabel || labelFromKey(deliveryMode) || 'Delivery not selected', Boolean(deliveryMode)),
    buildReadinessRow('legal_route', 'Legal route', legalRouteReadiness.value, legalRouteReadiness.complete, {
      optional: true,
      source: legalRouteReadiness.scenarioKey,
    }),
    templateRow,
    buildReadinessRow('agent', 'Signing agent', agentName || 'Missing agent name', Boolean(agentName)),
    buildReadinessRow('agent_email', 'Agent email', agentEmail || 'Missing agent email', isValidEmail(agentEmail)),
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
      buyerName,
      buyerEmail,
      buyerPhone,
      propertyLabel,
      purchasePrice,
      offerStatus,
      offerSubmitted: hasSubmittedOfferStatus(offerStatus),
      residentialOfferTermsVersion: normalizeText(residentialOfferTerms.version),
      conditionReviewStatus: conditionReview.status,
      conditionReviewReady: conditionReview.readyForOtpGeneration,
      approvedConditionWording: conditionReview.approvedConditionWording,
      agentName,
      agentEmail,
      legalRouteReady: legalRouteReadiness.complete,
      legalScenarioKey: legalRouteReadiness.scenarioKey,
      sellerClauseProfile: legalRouteReadiness.sellerClauseProfile,
      buyerClauseProfile: legalRouteReadiness.buyerClauseProfile,
      propertyClauseProfile: legalRouteReadiness.propertyClauseProfile,
      financeClauseProfile: legalRouteReadiness.financeClauseProfile,
      missingRoutingFacts: legalRouteReadiness.missingRoutingFacts,
      templateRouteReady: templateReadinessRecord.ready === true,
      templateRouteStatus: normalizeText(templateReadinessRecord.status),
      templateRouteSource: normalizeText(templateReadinessRecord.source),
    },
    placeholders,
    scenarioProfile,
    templateContext,
  }
}
