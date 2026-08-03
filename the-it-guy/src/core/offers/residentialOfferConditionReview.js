import {
  RESIDENTIAL_OFFER_TERMS_VERSION,
  buildResidentialOfferTermsSnapshot,
  flattenResidentialOfferTerms,
} from './residentialOfferTerms.js'

export const RESIDENTIAL_OFFER_CONDITION_REVIEW_VERSION = 'residential_offer_condition_review_phase1c_v1'

const REVIEW_FIELDS = Object.freeze([
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

function bool(value) {
  if (value === true) return true
  if (value === false || value === null || value === undefined) return false
  return ['true', 'yes', 'y', '1', 'on'].includes(text(value).toLowerCase())
}

function money(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function readConditions(source = {}) {
  return source?.conditions || source?.conditionsJson || source?.conditions_json || {}
}

function readResidentialOfferTerms(source = {}) {
  const conditions = readConditions(source)
  return conditions?.residentialOfferTerms || source?.offer?.residentialOfferTerms || source?.residentialOfferTerms || null
}

function readBuyerField(source = {}, field = '') {
  const terms = readResidentialOfferTerms(source)
  const conditions = readConditions(source)
  const offer = source?.offer || {}
  if (field === 'suspensiveConditions') return text(terms?.conditionRequests?.suspensiveConditions || conditions.suspensiveConditions || offer.suspensiveConditions)
  if (field === 'specialConditions') return text(terms?.conditionRequests?.specialConditions || conditions.specialConditions || offer.specialConditions)
  return text(terms?.terms?.[field] || conditions[field] || offer[field])
}

function buildBuyerRequestedConditions(source = {}) {
  return {
    suspensiveConditions: readBuyerField(source, 'suspensiveConditions'),
    specialConditions: readBuyerField(source, 'specialConditions'),
    includedFixtures: readBuyerField(source, 'includedFixtures'),
    excludedFixtures: readBuyerField(source, 'excludedFixtures'),
    subjectToSale: bool(readResidentialOfferTerms(source)?.terms?.subjectToSale ?? readConditions(source).subjectToSale ?? source?.offer?.subjectToSale),
    subjectSaleProperty: readBuyerField(source, 'subjectSaleProperty'),
    subjectSaleTimeline: readBuyerField(source, 'subjectSaleTimeline'),
    occupationDate: readBuyerField(source, 'occupationDate'),
    occupationalRent: bool(readResidentialOfferTerms(source)?.terms?.occupationalRent ?? readConditions(source).occupationalRent ?? source?.offer?.occupationalRent),
    occupationalRentAmount: money(readResidentialOfferTerms(source)?.terms?.occupationalRentAmount ?? readConditions(source).occupationalRentAmount ?? source?.offer?.occupationalRentAmount),
  }
}

function normaliseReviewFields(source = {}) {
  const terms = readResidentialOfferTerms(source)
  const existing = Array.isArray(terms?.conditionRequests?.reviewFields)
    ? terms.conditionRequests.reviewFields
    : Array.isArray(readConditions(source)?.otpPreGenerationReview?.reviewFields)
      ? readConditions(source).otpPreGenerationReview.reviewFields
      : []
  const requested = buildBuyerRequestedConditions(source)
  const fields = new Set(existing)
  for (const field of REVIEW_FIELDS) {
    if (text(requested[field])) fields.add(field)
  }
  if (requested.subjectToSale) fields.add('subjectToSale')
  return [...fields]
}

export function resolveResidentialOfferConditionReview(source = {}) {
  const conditions = readConditions(source)
  const terms = readResidentialOfferTerms(source)
  const approved = conditions.approvedConditionWording || terms?.conditionRequests?.approvedConditionWording || null
  const reviewFields = normaliseReviewFields(source)
  const existingStatus = text(conditions?.otpPreGenerationReview?.status || terms?.readiness?.agentReviewStatus)
  const approvedStatus = text(approved?.status)
  const status = approvedStatus === 'approved'
    ? 'ready_to_generate_otp'
    : approvedStatus === 'changes_requested'
      ? 'changes_requested'
      : existingStatus === 'ready_to_generate_otp' && reviewFields.length === 0
        ? 'ready_to_generate_otp'
        : reviewFields.length
          ? 'agent_review_required'
          : 'ready_to_generate_otp'

  return {
    version: RESIDENTIAL_OFFER_CONDITION_REVIEW_VERSION,
    status,
    reviewRequired: status === 'agent_review_required' || status === 'changes_requested',
    readyForOtpGeneration: status === 'ready_to_generate_otp',
    reviewFields,
    buyerRequestedConditions: buildBuyerRequestedConditions(source),
    approvedConditionWording: approved,
  }
}

function buildAgentSnapshot(actor = {}) {
  return {
    id: text(actor?.id || actor?.userId),
    name: text(actor?.fullName || actor?.name || actor?.email) || 'Agent',
    email: text(actor?.email).toLowerCase(),
  }
}

function mergeApprovedFields(original = {}, revised = {}) {
  const merged = {
    ...original,
    ...Object.fromEntries(
      Object.entries(revised || {}).filter(([, value]) => {
        if (value === null || value === undefined) return false
        if (typeof value === 'string') return value.trim() !== ''
        return true
      }),
    ),
  }
  merged.subjectToSale = bool(merged.subjectToSale)
  merged.occupationalRent = bool(merged.occupationalRent)
  merged.occupationalRentAmount = money(merged.occupationalRentAmount)
  return merged
}

function buildTermsInputFromApproved(source = {}, approvedFields = {}) {
  const terms = readResidentialOfferTerms(source)
  const conditions = readConditions(source)
  const offer = source?.offer || {}
  return {
    fullName: terms?.buyer?.fullName || conditions.buyerName || offer.buyerName,
    email: terms?.buyer?.email || conditions.buyerEmail || offer.buyerEmail,
    phone: terms?.buyer?.phone || conditions.buyerPhone || offer.buyerPhone,
    idNumber: terms?.buyer?.idNumber || conditions.buyerIdNumber || offer.buyerIdNumber,
    purchaserType: terms?.capacity?.purchaserType || conditions.purchaserType || conditions.buyerType,
    purchaserEntityName: terms?.capacity?.purchaserEntityName || conditions.purchaserEntityName,
    offerAmount: terms?.finance?.offerAmount || source.offerAmount || source.offer_amount || offer.offerAmount,
    depositAmount: terms?.finance?.depositAmount || source.depositAmount || source.deposit_amount || offer.depositAmount,
    financeType: terms?.finance?.financeType || source.financeType || source.finance_type || offer.financeType,
    bondAmount: terms?.finance?.bondAmount || source.bondComponent || source.bond_component || offer.bondAmount,
    cashContribution: terms?.finance?.cashContribution || source.cashComponent || source.cash_component || offer.cashContribution,
    needsBondAssistance: terms?.finance?.needsBondAssistance || conditions.needsBondAssistance,
    proofOfFundsUrl: terms?.finance?.proofOfFundsUrl || conditions.proofOfFundsUrl,
    proofOfFundsReference: terms?.finance?.proofOfFundsReference || conditions.proofOfFundsReference,
    preApprovalReference: terms?.finance?.preApprovalReference || conditions.preApprovalReference,
    depositDueDate: terms?.finance?.depositDueDate || conditions.depositDueDate,
    bondApprovalDeadline: terms?.finance?.bondApprovalDeadline || conditions.bondApprovalDeadline,
    cashProofDeadline: terms?.finance?.cashProofDeadline || conditions.cashProofDeadline,
    guaranteeDeliveryDeadline: terms?.finance?.guaranteeDeliveryDeadline || conditions.guaranteeDeliveryDeadline,
    guaranteeDeliveryPeriod: terms?.finance?.guaranteeDeliveryPeriod || conditions.guaranteeDeliveryPeriod,
    expiryDate: terms?.terms?.expiryDate || source.expiryDate || source.expiry_date || offer.expiryDate,
    expiryTime: terms?.terms?.expiryTime || conditions.expiryTime,
    otpDocumentVariant: terms?.otpDocumentVariant || conditions.otpDocumentVariant,
    subjectSaleMinimumPrice: terms?.terms?.subjectSaleMinimumPrice || conditions.subjectSaleMinimumPrice,
    subjectSaleFulfilmentDate: terms?.terms?.subjectSaleFulfilmentDate || conditions.subjectSaleFulfilmentDate,
    ...approvedFields,
    acknowledgeSellerReview: terms?.acknowledgements?.sellerReview || conditions.acknowledgeSellerReview,
    acknowledgeLegalDisclaimer: terms?.acknowledgements?.legalDisclaimer || conditions.acknowledgeLegalDisclaimer,
    acknowledgeInfoAccuracy: terms?.acknowledgements?.infoAccuracy || conditions.acknowledgeInfoAccuracy,
    acknowledgeDevelopmentRules: terms?.acknowledgements?.developmentRules || conditions.acknowledgeDevelopmentRules,
    acknowledgeNhbrcWarranty: terms?.acknowledgements?.nhbrcWarranty || conditions.acknowledgeNhbrcWarranty,
    acknowledgeBodyCorporateRules: terms?.acknowledgements?.bodyCorporateRules || conditions.acknowledgeBodyCorporateRules,
    acknowledgeUtilityConnectionCharges: terms?.acknowledgements?.utilityConnectionCharges || conditions.acknowledgeUtilityConnectionCharges,
  }
}

export function buildResidentialOfferConditionReviewPatch({
  offer = {},
  decision = 'approve',
  revisedConditions = {},
  actor = {},
  note = '',
  now = new Date().toISOString(),
} = {}) {
  const conditions = readConditions(offer)
  const currentReview = resolveResidentialOfferConditionReview(offer)
  const approvedFields = mergeApprovedFields(currentReview.buyerRequestedConditions, revisedConditions)
  const agent = buildAgentSnapshot(actor)
  const approvedStatus = decision === 'request_changes' || decision === 'changes_requested' ? 'changes_requested' : 'approved'
  const snapshot = buildResidentialOfferTermsSnapshot(buildTermsInputFromApproved(offer, approvedFields), {
    source: 'agent_condition_review',
    captureMethod: 'agent_review',
    capturedAt: now,
  })
  const flat = flattenResidentialOfferTerms(snapshot)
  const approvedConditionWording = {
    version: RESIDENTIAL_OFFER_CONDITION_REVIEW_VERSION,
    status: approvedStatus,
    fields: approvedFields,
    reviewedAt: now,
    reviewedBy: agent,
    note: text(note),
  }
  const ready = approvedStatus === 'approved'

  return {
    conditions_json: {
      ...conditions,
      ...flat,
      residentialOfferTermsVersion: RESIDENTIAL_OFFER_TERMS_VERSION,
      residentialOfferTerms: {
        ...snapshot,
        conditionRequests: {
          ...snapshot.conditionRequests,
          approvedConditionWording,
          reviewRequired: !ready,
          buyerLanguageRequiresRewrite: !ready,
        },
        readiness: {
          ...snapshot.readiness,
          agentReviewRequired: !ready,
          readyForOtpGeneration: ready && snapshot.readiness.missingRequiredFields.length === 0,
        },
      },
      approvedConditionWording,
      otpPreGenerationReview: {
        version: RESIDENTIAL_OFFER_CONDITION_REVIEW_VERSION,
        status: ready ? 'ready_to_generate_otp' : 'changes_requested',
        reviewedAt: now,
        reviewedBy: agent,
        missingRequiredFields: snapshot.readiness.missingRequiredFields,
        reviewFields: ready ? [] : currentReview.reviewFields,
        agentReviewRequired: !ready,
        note: text(note),
      },
      agentActionHistory: [
        ...(Array.isArray(conditions.agentActionHistory) ? conditions.agentActionHistory : []),
        {
          action: ready ? 'Condition wording approved' : 'Condition changes requested',
          note: text(note),
          at: now,
          actorId: agent.id,
          actorName: agent.name,
        },
      ],
      latestAgentNote: text(note) || conditions.latestAgentNote || '',
    },
  }
}
