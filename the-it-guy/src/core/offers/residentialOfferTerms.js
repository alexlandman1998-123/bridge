export const RESIDENTIAL_OFFER_TERMS_VERSION = 'residential_offer_terms_phase1b_v1'

export const RESIDENTIAL_OFFER_TERMS_BUCKETS = Object.freeze([
  'buyer_identity',
  'buyer_capacity',
  'finance_readiness',
  'residential_offer_terms',
  'condition_requests',
  'buyer_acknowledgements',
])

const FREE_TEXT_REVIEW_FIELDS = Object.freeze([
  'suspensiveConditions',
  'specialConditions',
  'includedFixtures',
  'excludedFixtures',
  'subjectSaleProperty',
  'subjectSaleTimeline',
])

function text(value) {
  return String(value ?? '').trim()
}

function lower(value) {
  return text(value).toLowerCase()
}

function bool(value) {
  if (value === true) return true
  if (value === false || value === null || value === undefined) return false
  return ['true', 'yes', 'y', '1', 'on'].includes(lower(value))
}

function money(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function compactObject(input = {}) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => {
      if (value === null || value === undefined) return false
      if (typeof value === 'string') return value.trim() !== ''
      return true
    }),
  )
}

function hasFreeText(value) {
  return text(value).length > 0
}

function normaliseFinanceType(value = '') {
  const normalized = lower(value)
  if (normalized === 'hybrid') return 'combination'
  if (['cash', 'bond', 'combination'].includes(normalized)) return normalized
  return normalized || 'unknown'
}

export function buildResidentialOfferTermsSnapshot(input = {}, options = {}) {
  const financeType = normaliseFinanceType(input.financeType || input.finance_type)
  const offerAmount = money(input.offerAmount ?? input.offer_amount)
  const depositAmount = money(input.depositAmount ?? input.deposit_amount)
  const bondAmount = money(input.bondAmount ?? input.bond_component ?? input.bondComponent)
  const cashContribution = money(input.cashContribution ?? input.cash_component ?? input.cashComponent)
  const subjectToSale = bool(input.subjectToSale ?? input.subject_to_sale)
  const occupationalRent = bool(input.occupationalRent ?? input.occupationalRentPayable ?? input.occupational_rent)
  const requestedText = {
    suspensiveConditions: text(input.suspensiveConditions),
    specialConditions: text(input.specialConditions),
    includedFixtures: text(input.includedFixtures),
    excludedFixtures: text(input.excludedFixtures),
    subjectSaleProperty: text(input.subjectSaleProperty),
    subjectSaleTimeline: text(input.subjectSaleTimeline),
  }
  const reviewFields = FREE_TEXT_REVIEW_FIELDS.filter((field) => hasFreeText(requestedText[field]))
  if (subjectToSale && !reviewFields.includes('subjectToSale')) reviewFields.push('subjectToSale')

  const missingRequiredFields = []
  if (!text(input.fullName || input.buyerName)) missingRequiredFields.push('buyer.fullName')
  if (!text(input.email || input.buyerEmail)) missingRequiredFields.push('buyer.email')
  if (!text(input.phone || input.buyerPhone)) missingRequiredFields.push('buyer.phone')
  if (!offerAmount) missingRequiredFields.push('finance.offerAmount')

  const buyer = compactObject({
    fullName: text(input.fullName || input.buyerName),
    email: lower(input.email || input.buyerEmail),
    phone: text(input.phone || input.buyerPhone),
    idNumber: text(input.idNumber || input.buyerIdNumber),
  })

  const capacity = compactObject({
    purchaserType: text(input.purchaserType || input.buyerType),
    purchaserEntityName: text(input.purchaserEntityName),
  })

  const finance = compactObject({
    offerAmount,
    depositAmount,
    financeType,
    bondAmount,
    cashContribution,
    needsBondAssistance: bool(input.needsBondAssistance),
    proofOfFundsUrl: text(input.proofOfFundsUrl),
    proofOfFundsReference: text(input.proofOfFundsReference),
    preApprovalReference: text(input.preApprovalReference),
    depositDueDate: text(input.depositDueDate),
    bondApprovalDeadline: text(input.bondApprovalDeadline),
  })

  const terms = compactObject({
    expiryDate: text(input.expiryDate),
    expiryTime: text(input.expiryTime),
    occupationDate: text(input.occupationDate),
    occupationalRent,
    occupationalRentAmount: money(input.occupationalRentAmount),
    subjectToSale,
    subjectSaleProperty: requestedText.subjectSaleProperty,
    subjectSaleTimeline: requestedText.subjectSaleTimeline,
    subjectSaleAgentInvolved: bool(input.subjectSaleAgentInvolved),
    includedFixtures: requestedText.includedFixtures,
    excludedFixtures: requestedText.excludedFixtures,
  })

  const conditionRequests = compactObject({
    suspensiveConditions: requestedText.suspensiveConditions,
    specialConditions: requestedText.specialConditions,
    reviewRequired: reviewFields.length > 0,
    reviewFields,
    buyerLanguageRequiresRewrite: reviewFields.length > 0,
  })

  const acknowledgements = compactObject({
    sellerReview: bool(input.acknowledgeSellerReview),
    legalDisclaimer: bool(input.acknowledgeLegalDisclaimer),
    infoAccuracy: bool(input.acknowledgeInfoAccuracy),
  })

  return {
    version: RESIDENTIAL_OFFER_TERMS_VERSION,
    source: text(options.source || input.source) || 'offer_onboarding',
    captureMethod: text(options.captureMethod || input.captureMethod) || 'buyer_self_service',
    capturedAt: text(options.capturedAt || input.capturedAt) || new Date().toISOString(),
    dataBuckets: [...RESIDENTIAL_OFFER_TERMS_BUCKETS],
    buyer,
    capacity,
    finance,
    terms,
    conditionRequests,
    acknowledgements,
    readiness: {
      missingRequiredFields,
      agentReviewRequired: reviewFields.length > 0,
      readyForOtpGeneration: missingRequiredFields.length === 0 && reviewFields.length === 0,
    },
  }
}

export function flattenResidentialOfferTerms(snapshot = {}) {
  const terms = snapshot?.terms || {}
  const finance = snapshot?.finance || {}
  const buyer = snapshot?.buyer || {}
  const capacity = snapshot?.capacity || {}
  const conditionRequests = snapshot?.conditionRequests || {}
  return {
    buyerName: buyer.fullName || '',
    buyerEmail: buyer.email || '',
    buyerPhone: buyer.phone || '',
    buyerIdNumber: buyer.idNumber || '',
    buyerType: capacity.purchaserType || '',
    purchaserType: capacity.purchaserType || '',
    purchaserEntityName: capacity.purchaserEntityName || '',
    financeType: finance.financeType || '',
    proofOfFundsUrl: finance.proofOfFundsUrl || '',
    proofOfFundsReference: finance.proofOfFundsReference || '',
    preApprovalReference: finance.preApprovalReference || '',
    suspensiveConditions: conditionRequests.suspensiveConditions || '',
    specialConditions: conditionRequests.specialConditions || '',
    subjectToSale: Boolean(terms.subjectToSale),
    subjectSaleProperty: terms.subjectSaleProperty || '',
    subjectSaleTimeline: terms.subjectSaleTimeline || '',
    subjectSaleAgentInvolved: Boolean(terms.subjectSaleAgentInvolved),
    occupationDate: terms.occupationDate || '',
    occupationalRent: Boolean(terms.occupationalRent),
    occupationalRentPayable: Boolean(terms.occupationalRent),
    occupationalRentAmount: finance.occupationalRentAmount || terms.occupationalRentAmount || 0,
    includedFixtures: terms.includedFixtures || '',
    excludedFixtures: terms.excludedFixtures || '',
    depositDueDate: finance.depositDueDate || '',
    bondApprovalDeadline: finance.bondApprovalDeadline || '',
    expiryTime: terms.expiryTime || '',
    needsBondAssistance: Boolean(finance.needsBondAssistance),
  }
}

export function mergeResidentialOfferTermsIntoConditions(existingConditions = {}, input = {}, options = {}) {
  const snapshot = buildResidentialOfferTermsSnapshot(input, options)
  return {
    ...existingConditions,
    ...flattenResidentialOfferTerms(snapshot),
    residentialOfferTermsVersion: RESIDENTIAL_OFFER_TERMS_VERSION,
    residentialOfferTerms: snapshot,
    otpPreGenerationReview: {
      status: snapshot.readiness.agentReviewRequired ? 'agent_review_required' : 'ready_to_generate_otp',
      missingRequiredFields: snapshot.readiness.missingRequiredFields,
      reviewFields: snapshot.conditionRequests.reviewFields,
      agentReviewRequired: snapshot.readiness.agentReviewRequired,
    },
  }
}
