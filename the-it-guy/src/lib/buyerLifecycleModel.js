// Shared synchronous models and legacy local-store operations. Network workflows load separately.
import {
  getListingReadinessSummary,
} from './sellerDocumentRequirementEngine.js'

import {
  deriveFinanceManagedBy,
} from '../core/transactions/financeType.js'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const BUYER_LEAD_STAGES = [
  'New Lead',
  'Contacted',
  'Qualified',
  'Viewing Scheduled',
  'Viewing Completed',
  'Offer Draft',
  'Offer Submitted',
  'Negotiating',
  'Offer Accepted',
  'Onboarding',
  'Finance',
  'Transfer',
  'Registered',
  'Lost',
]

export const CLIENT_INTAKE_PREFERENCE = {
  DIGITAL_PORTAL: 'digital_portal',
  AGENT_ASSISTED: 'agent_assisted',
  HARD_COPY: 'hard_copy',
}

export const SELLER_REVIEW_DELIVERY_MODE = {
  EMAIL: 'email',
  AGENT_ASSISTED: 'agent_assisted',
  HARD_COPY: 'hard_copy',
}

const CLIENT_INTAKE_PREFERENCE_ALIASES = {
  digital: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
  portal: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
  digital_portal: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
  email: CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
  agent: CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED,
  assisted: CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED,
  agent_assisted: CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED,
  assisted_capture: CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED,
  hard_copy: CLIENT_INTAKE_PREFERENCE.HARD_COPY,
  hardcopy: CLIENT_INTAKE_PREFERENCE.HARD_COPY,
  printed: CLIENT_INTAKE_PREFERENCE.HARD_COPY,
  paper: CLIENT_INTAKE_PREFERENCE.HARD_COPY,
}

const SELLER_REVIEW_DELIVERY_MODE_ALIASES = {
  email: SELLER_REVIEW_DELIVERY_MODE.EMAIL,
  digital: SELLER_REVIEW_DELIVERY_MODE.EMAIL,
  portal: SELLER_REVIEW_DELIVERY_MODE.EMAIL,
  agent: SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED,
  assisted: SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED,
  agent_assisted: SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED,
  hard_copy: SELLER_REVIEW_DELIVERY_MODE.HARD_COPY,
  hardcopy: SELLER_REVIEW_DELIVERY_MODE.HARD_COPY,
  printed: SELLER_REVIEW_DELIVERY_MODE.HARD_COPY,
  paper: SELLER_REVIEW_DELIVERY_MODE.HARD_COPY,
}

export const OFFER_STATUS = {
  DRAFT: 'draft',
  SENT_TO_BUYER: 'sent_to_buyer',
  BUYER_VIEWED: 'buyer_viewed',
  SUBMITTED: 'submitted',
  AGENT_REVIEW: 'agent_review',
  CHANGES_REQUESTED: 'changes_requested',
  SENT_TO_SELLER: 'sent_to_seller',
  SELLER_VIEWED: 'seller_viewed',
  COUNTERED: 'countered',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  WITHDRAWN: 'withdrawn',
  EXPIRED: 'expired',
  CONVERTED_TO_TRANSACTION: 'converted_to_transaction',
}

export const OFFER_STATUSES = Object.values(OFFER_STATUS)

const OFFER_STATUS_ALIASES = {
  pending: OFFER_STATUS.SUBMITTED,
  under_review: OFFER_STATUS.AGENT_REVIEW,
  review: OFFER_STATUS.AGENT_REVIEW,
  agent_review: OFFER_STATUS.AGENT_REVIEW,
  seller_review: OFFER_STATUS.SENT_TO_SELLER,
  awaiting_seller_review: OFFER_STATUS.SENT_TO_SELLER,
  buyer_review_counter: OFFER_STATUS.COUNTERED,
  negotiation: OFFER_STATUS.COUNTERED,
  approved: OFFER_STATUS.ACCEPTED,
  declined: OFFER_STATUS.REJECTED,
}

const OFFER_TERMINAL_STATUSES = new Set([
  OFFER_STATUS.ACCEPTED,
  OFFER_STATUS.REJECTED,
  OFFER_STATUS.WITHDRAWN,
  OFFER_STATUS.EXPIRED,
  OFFER_STATUS.CONVERTED_TO_TRANSACTION,
])

const OFFER_ACTIVE_NEGOTIATION_STATUSES = new Set([
  OFFER_STATUS.SUBMITTED,
  OFFER_STATUS.AGENT_REVIEW,
  OFFER_STATUS.SENT_TO_SELLER,
  OFFER_STATUS.SELLER_VIEWED,
])

const OFFER_BUYER_RESUBMISSION_STATUSES = new Set([
  OFFER_STATUS.DRAFT,
  OFFER_STATUS.SENT_TO_BUYER,
  OFFER_STATUS.BUYER_VIEWED,
  OFFER_STATUS.CHANGES_REQUESTED,
  OFFER_STATUS.COUNTERED,
])

export const BUYER_LIFECYCLE_EVENTS = {
  VIEWING_CREATED: 'viewing_created',
  VIEWING_COMPLETED: 'viewing_completed',
  OFFER_CREATED: 'offer_created',
  OFFER_SUBMITTED: 'offer_submitted',
  OFFER_COUNTERED: 'offer_countered',
  OFFER_ACCEPTED: 'offer_accepted',
  ONBOARDING_STARTED: 'onboarding_started',
  TRANSACTION_CREATED: 'transaction_created',
  REGISTRATION_CONFIRMED: 'registration_confirmed',
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function isUuidLike(value) {
  return UUID_PATTERN.test(normalizeText(value))
}

function toNullableUuid(value) {
  const normalized = normalizeText(value)
  return isUuidLike(normalized) ? normalized : null
}

function jsonObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  return {}
}

function normalizeDate(value) {
  const normalized = normalizeText(value)
  return normalized || null
}

export function isOfferPastExpiry(offer = {}) {
  const expiryDate = normalizeText(offer?.expiryDate || offer?.expiry_date)
  if (!expiryDate) return false
  const expiryTime = normalizeText(
    offer?.conditions?.expiryTime ||
      offer?.conditionsJson?.expiryTime ||
      offer?.expiryTime ||
      offer?.expiry_time,
  )
  const raw = expiryTime ? `${expiryDate}T${expiryTime}` : expiryDate
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.getTime() < Date.now()
}

export function getOfferLifecycleSummary(offer = {}) {
  const status = normalizeOfferStatus(offer?.status)
  const expiredByDate = status !== OFFER_STATUS.EXPIRED && isOfferPastExpiry(offer)
  const effectiveStatus = expiredByDate ? OFFER_STATUS.EXPIRED : status
  const terminal = OFFER_TERMINAL_STATUSES.has(effectiveStatus)
  const activeNegotiation = OFFER_ACTIVE_NEGOTIATION_STATUSES.has(effectiveStatus)
  const buyerCanResubmit = OFFER_BUYER_RESUBMISSION_STATUSES.has(effectiveStatus)
  const acceptedOrConverted = [OFFER_STATUS.ACCEPTED, OFFER_STATUS.CONVERTED_TO_TRANSACTION].includes(effectiveStatus)
  const buyerCanWithdraw = [
    OFFER_STATUS.SENT_TO_BUYER,
    OFFER_STATUS.BUYER_VIEWED,
    OFFER_STATUS.SUBMITTED,
    OFFER_STATUS.AGENT_REVIEW,
    OFFER_STATUS.CHANGES_REQUESTED,
    OFFER_STATUS.SENT_TO_SELLER,
    OFFER_STATUS.SELLER_VIEWED,
    OFFER_STATUS.COUNTERED,
  ].includes(effectiveStatus)
  let blockedReason = ''
  if (effectiveStatus === OFFER_STATUS.EXPIRED) blockedReason = 'This offer link has expired.'
  else if (effectiveStatus === OFFER_STATUS.WITHDRAWN) blockedReason = 'This offer was withdrawn.'
  else if (effectiveStatus === OFFER_STATUS.REJECTED) blockedReason = 'This offer was rejected. Ask the agent to issue a new offer if negotiations restart.'
  else if (acceptedOrConverted) blockedReason = 'This offer has already been accepted and is moving through the transaction workflow.'
  else if (activeNegotiation) blockedReason = 'This offer is already in review. Wait for feedback from the seller or your agent.'

  return {
    status,
    effectiveStatus,
    terminal,
    activeNegotiation,
    expiredByDate,
    buyerCanResubmit,
    buyerCanWithdraw,
    acceptedOrConverted,
    blockedReason,
    counterTerms: jsonObject(
      offer?.conditions?.sellerCounterTerms ||
      offer?.conditions?.counterTerms ||
      offer?.conditionsJson?.sellerCounterTerms ||
      offer?.conditionsJson?.counterTerms,
    ),
  }
}

function splitFullName(value = '') {
  const parts = normalizeText(value).split(/\s+/).filter(Boolean)
  if (!parts.length) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') }
}

function normalizePurchaserType(value = '') {
  const key = normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
  if (['company', 'pty', 'pty_ltd', 'business'].includes(key)) return 'company'
  if (['trust', 'family_trust'].includes(key)) return 'trust'
  if (['married_coc', 'married_in_community', 'married_in_community_of_property'].includes(key)) return 'married_coc'
  if (['married_anc', 'anc', 'married_out_of_community', 'married_out_of_community_of_property'].includes(key)) return 'married_anc'
  if (['married_anc_accrual', 'anc_with_accrual', 'married_out_of_community_with_accrual'].includes(key)) return 'married_anc_accrual'
  if (['foreign_purchaser', 'foreign', 'foreign_buyer'].includes(key)) return 'foreign_purchaser'
  return 'individual'
}

function firstFilledValue(...values) {
  return values.find((value) => normalizeText(value).length > 0) ?? ''
}

function normalizeYesNoChoice(value = '') {
  if (value === true) return 'yes'
  if (value === false) return 'no'
  const key = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (['yes', 'y', 'true', '1'].includes(key)) return 'yes'
  if (['no', 'n', 'false', '0'].includes(key)) return 'no'
  return ''
}

function normalizePurchaserEntityType(value = '', fallback = '') {
  const normalized = normalizePurchaserType(firstFilledValue(value, fallback))
  if (['company', 'trust', 'foreign_purchaser'].includes(normalized)) return normalized
  return 'individual'
}

function normalizeNaturalPersonPurchaseMode(value = '') {
  const key = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (['co_purchasing', 'co_purchaser', 'joint', 'joint_purchase', 'joint_purchaser', 'multiple'].includes(key)) {
    return 'co_purchasing'
  }
  return key ? 'individual' : ''
}

function normalizeBondAssistancePreference(value = '', helpRequested = '') {
  const key = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (['self_managed', 'self', 'own', 'client', 'buyer_managed', 'sort_it_myself', 'sort_it_out_myself'].includes(key)) {
    return 'self_managed'
  }
  if (['originator_assisted', 'originator', 'bond_originator', 'assisted', 'agency_assisted', 'help'].includes(key)) {
    return 'originator_assisted'
  }
  const yesNo = normalizeYesNoChoice(helpRequested)
  if (yesNo === 'yes') return 'originator_assisted'
  if (yesNo === 'no') return 'self_managed'
  return ''
}

function normalizeBondAssistanceSelection(value = '') {
  const key = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (['agency_partner', 'agency', 'preferred', 'preferred_originator', 'agency_preferred'].includes(key)) return 'agency_partner'
  if (['buyer_nominated', 'buyer', 'nominated', 'own_originator', 'my_originator'].includes(key)) return 'buyer_nominated'
  if (['third_party', 'external', 'other'].includes(key)) return 'third_party'
  return ''
}

function buildAcceptedOfferContinuityFacts(offer = {}, payload = {}) {
  const conditions = jsonObject(offer?.conditions)
  const residentialOfferTerms = jsonObject(conditions.residentialOfferTerms)
  const residentialBuyer = jsonObject(residentialOfferTerms.buyer)
  const residentialCapacity = jsonObject(residentialOfferTerms.capacity)
  const residentialFinance = jsonObject(residentialOfferTerms.finance)
  const fullName = normalizeText(
    payload?.buyerName ||
      conditions.buyerName ||
      residentialBuyer.fullName ||
      conditions.fullName ||
      [conditions.firstName, conditions.lastName].filter(Boolean).join(' '),
  )
  const split = splitFullName(fullName)
  const purchaserTypeSource = firstFilledValue(
    payload?.purchaserType,
    payload?.purchaser_type,
    conditions.purchaserType,
    conditions.purchaser_type,
    conditions.buyerType,
    conditions.buyer_type,
    residentialCapacity.purchaserType,
    residentialCapacity.purchaser_type,
    residentialCapacity.buyerType,
    residentialCapacity.buyer_type,
    conditions.purchaserEntityType,
    conditions.purchaser_entity_type,
    residentialCapacity.purchaserEntityType,
    residentialCapacity.purchaser_entity_type,
  )
  const purchaserType = normalizePurchaserType(purchaserTypeSource)
  const purchaserEntityType = normalizePurchaserEntityType(
    firstFilledValue(
      payload?.purchaserEntityType,
      payload?.purchaser_entity_type,
      payload?.buyerEntityType,
      payload?.buyer_entity_type,
      conditions.purchaserEntityType,
      conditions.purchaser_entity_type,
      conditions.buyerEntityType,
      conditions.buyer_entity_type,
      residentialCapacity.purchaserEntityType,
      residentialCapacity.purchaser_entity_type,
    ),
    purchaserType,
  )
  const financeType = normalizeText(offer?.financeType || conditions.financeType || payload?.financeType || 'cash').toLowerCase()
  const rawBondHelpRequested = firstFilledValue(
    conditions.bond_help_requested,
    conditions.bondHelpRequested,
    residentialFinance.bond_help_requested,
    residentialFinance.bondHelpRequested,
    conditions.ooba_assist_requested,
    conditions.oobaAssistRequested,
    residentialFinance.ooba_assist_requested,
    residentialFinance.oobaAssistRequested,
  )
  const bondHelpRequested = normalizeYesNoChoice(rawBondHelpRequested)
  const bondAssistancePreference = normalizeBondAssistancePreference(
    firstFilledValue(
      conditions.bondAssistancePreference,
      conditions.bond_assistance_preference,
      residentialFinance.bondAssistancePreference,
      residentialFinance.bond_assistance_preference,
    ),
    bondHelpRequested,
  )
  const originatorName = normalizeText(firstFilledValue(
    conditions.bond_originator_name,
    conditions.bondOriginatorName,
    residentialFinance.bond_originator_name,
    residentialFinance.bondOriginatorName,
  ))
  const originatorContact = normalizeText(firstFilledValue(
    conditions.bond_originator_contact,
    conditions.bondOriginatorContact,
    residentialFinance.bond_originator_contact,
    residentialFinance.bondOriginatorContact,
  ))
  const hasOriginatorDetails = Boolean(originatorName || originatorContact)
  const explicitBondAssistanceSelection = normalizeBondAssistanceSelection(
    firstFilledValue(
      conditions.bond_assistance_selection,
      conditions.bondAssistanceSelection,
      residentialFinance.bond_assistance_selection,
      residentialFinance.bondAssistanceSelection,
    ),
  )
  let bondAssistanceSelection = explicitBondAssistanceSelection
  if (!bondAssistanceSelection && bondHelpRequested === 'yes') {
    bondAssistanceSelection = hasOriginatorDetails ? 'buyer_nominated' : 'agency_partner'
  }
  const bondAssistanceContactConsent = normalizeYesNoChoice(firstFilledValue(
    conditions.bond_assistance_contact_consent,
    conditions.bondAssistanceContactConsent,
    residentialFinance.bond_assistance_contact_consent,
    residentialFinance.bondAssistanceContactConsent,
  ))
  const financeManagedBy = bondHelpRequested
    ? deriveFinanceManagedBy({
        financeType,
        formData: {
          bond_help_requested: bondHelpRequested,
          finance: {
            bond_help_requested: bondHelpRequested,
          },
        },
      })
    : normalizeText(firstFilledValue(
        conditions.finance_managed_by,
        conditions.financeManagedBy,
        residentialFinance.finance_managed_by,
        residentialFinance.financeManagedBy,
      ))
  const intake = buildClientIntakePreferenceFacts(
    payload?.clientIntakePreference ||
      payload?.deliveryMode ||
      conditions.clientIntakePreference ||
      conditions.deliveryMode,
  )
  const purchaserEntityName = normalizeText(firstFilledValue(
    conditions.purchaserEntityName,
    conditions.purchaser_entity_name,
    residentialCapacity.purchaserEntityName,
    residentialCapacity.purchaser_entity_name,
  ))
  const naturalPersonPurchaseMode = normalizeNaturalPersonPurchaseMode(firstFilledValue(
    conditions.natural_person_purchase_mode,
    conditions.naturalPersonPurchaseMode,
    residentialCapacity.natural_person_purchase_mode,
    residentialCapacity.naturalPersonPurchaseMode,
  ))

  return {
    conditions,
    residentialBuyer,
    split,
    purchaserType,
    purchaserEntityType,
    purchaserEntityName,
    naturalPersonPurchaseMode,
    financeType,
    bondAssistancePreference,
    bondHelpRequested,
    bondAssistanceSelection,
    bondAssistanceContactConsent,
    bondOriginatorName: bondAssistanceSelection === 'agency_partner' ? '' : originatorName,
    bondOriginatorContact: bondAssistanceSelection === 'agency_partner' ? '' : originatorContact,
    financeManagedBy,
    intake,
  }
}

export function buildAcceptedOfferOnboardingPrefill(offer = {}, payload = {}) {
  const {
    conditions,
    residentialBuyer,
    split,
    purchaserType,
    purchaserEntityType,
    purchaserEntityName,
    naturalPersonPurchaseMode,
    financeType,
    bondAssistancePreference,
    bondHelpRequested,
    bondAssistanceSelection,
    bondAssistanceContactConsent,
    bondOriginatorName,
    bondOriginatorContact,
    financeManagedBy,
    intake,
  } = buildAcceptedOfferContinuityFacts(offer, payload)
  const finance = Object.fromEntries(Object.entries({
    purchase_finance_type: financeType || 'cash',
    purchase_price: offer?.offerAmount ? String(offer.offerAmount) : '',
    cash_amount: offer?.cashComponent ? String(offer.cashComponent) : '',
    bond_amount: offer?.bondComponent ? String(offer.bondComponent) : '',
    deposit_amount: offer?.depositAmount ? String(offer.depositAmount) : '',
    source_of_funds: normalizeText(conditions.sourceOfFunds),
    bond_help_requested: bondHelpRequested,
    ooba_assist_requested: bondHelpRequested,
    bond_assistance_selection: bondAssistanceSelection,
    bond_assistance_contact_consent: bondAssistanceContactConsent,
    bond_assistance_consent_version: bondAssistanceSelection ? 'bond-assistance-v1' : '',
    bond_originator_name: bondOriginatorName,
    bond_originator_contact: bondOriginatorContact,
    finance_managed_by: financeManagedBy,
    financeManagedBy: financeManagedBy,
  }).filter(([, value]) => value !== null && value !== undefined && value !== ''))

  return Object.fromEntries(Object.entries({
    purchaser_type: purchaserType,
    purchaser_entity_type: purchaserEntityType,
    purchaserEntityType: purchaserEntityType,
    natural_person_purchase_mode: naturalPersonPurchaseMode,
    first_name: normalizeText(conditions.firstName) || split.firstName,
    last_name: normalizeText(conditions.lastName) || split.lastName,
    email: normalizeText(payload?.buyerEmail || conditions.buyerEmail || residentialBuyer.email || conditions.email).toLowerCase(),
    phone: normalizeText(payload?.buyerPhone || conditions.buyerPhone || residentialBuyer.phone || conditions.phone),
    identity_number: normalizeText(conditions.buyerIdNumber || residentialBuyer.idNumber || conditions.identityNumber || conditions.idNumber),
    purchase_finance_type: financeType || 'cash',
    bond_assistance_preference: bondAssistancePreference,
    bond_help_requested: bondHelpRequested,
    ooba_assist_requested: bondHelpRequested,
    bond_assistance_selection: bondAssistanceSelection,
    bond_assistance_contact_consent: bondAssistanceContactConsent,
    bond_assistance_consent_version: bondAssistanceSelection ? 'bond-assistance-v1' : '',
    bond_originator_name: bondOriginatorName,
    bond_originator_contact: bondOriginatorContact,
    finance_managed_by: financeManagedBy,
    financeManagedBy: financeManagedBy,
    finance,
    purchase_price: offer?.offerAmount ? String(offer.offerAmount) : '',
    cash_amount: offer?.cashComponent ? String(offer.cashComponent) : '',
    bond_amount: offer?.bondComponent ? String(offer.bondComponent) : '',
    deposit_amount: offer?.depositAmount ? String(offer.depositAmount) : '',
    deposit_due_date: normalizeText(conditions.depositDueDate),
    bond_approval_deadline: normalizeText(conditions.bondApprovalDeadline),
    source_of_funds: normalizeText(conditions.sourceOfFunds),
    proof_of_funds_reference: normalizeText(conditions.proofOfFundsReference),
    pre_approval_reference: normalizeText(conditions.preApprovalReference),
    occupation_date: normalizeText(conditions.occupationDate),
    occupational_rent: conditions.occupationalRent === true ? 'yes' : '',
    occupational_rent_payable: conditions.occupationalRent === true ? 'yes' : '',
    occupational_rent_amount: normalizeText(conditions.occupationalRentAmount),
    special_conditions: normalizeText(conditions.specialConditions || conditions.suspensiveConditions),
    subject_to_sale: conditions.subjectToSale === true ? 'yes' : '',
    subject_sale_property: normalizeText(conditions.subjectSaleProperty),
    subject_sale_timeline: normalizeText(conditions.subjectSaleTimeline),
    included_fixtures: normalizeText(conditions.includedFixtures),
    excluded_fixtures: normalizeText(conditions.excludedFixtures),
    purchaser_entity_name: purchaserEntityName,
    company_name: purchaserEntityType === 'company' ? purchaserEntityName : '',
    trust_name: purchaserEntityType === 'trust' ? purchaserEntityName : '',
    bridge_offer_expiry_time: normalizeText(conditions.expiryTime),
    bridge_client_intake_preference: intake.preference,
    bridge_client_intake_label: intake.label,
    bridge_agent_assisted_onboarding: intake.isAgentAssisted ? 'yes' : '',
    bridge_hard_copy_preferred: intake.isHardCopy ? 'yes' : '',
    bridge_prefill_source: 'accepted_offer',
    bridge_prefilled_at: new Date().toISOString(),
  }).filter(([, value]) => value !== null && value !== undefined && value !== ''))
}

export function normalizeBuyerStage(stage, fallback = 'New Lead') {
  const normalized = normalizeText(stage)
  return BUYER_LEAD_STAGES.find((candidate) => candidate.toLowerCase() === normalized.toLowerCase()) || fallback
}

export function normalizeOfferStatus(status, fallback = 'draft') {
  const normalized = normalizeLower(status)
  const aliased = OFFER_STATUS_ALIASES[normalized] || normalized
  return OFFER_STATUSES.includes(aliased) ? aliased : fallback
}

export function normalizeClientIntakePreference(value, fallback = CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL) {
  const normalized = normalizeLower(value)
  return CLIENT_INTAKE_PREFERENCE_ALIASES[normalized] || fallback
}

export function getClientIntakePreferenceLabel(value) {
  const normalized = normalizeClientIntakePreference(value)
  if (normalized === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED) return 'Agent Assisted'
  if (normalized === CLIENT_INTAKE_PREFERENCE.HARD_COPY) return 'Hard Copy'
  return 'Digital Portal'
}

export function buildClientIntakePreferenceFacts(value) {
  const preference = normalizeClientIntakePreference(value)
  return {
    preference,
    label: getClientIntakePreferenceLabel(preference),
    isDigital: preference === CLIENT_INTAKE_PREFERENCE.DIGITAL_PORTAL,
    isAgentAssisted: preference === CLIENT_INTAKE_PREFERENCE.AGENT_ASSISTED,
    isHardCopy: preference === CLIENT_INTAKE_PREFERENCE.HARD_COPY,
  }
}

function isValidEmail(value) {
  const email = normalizeText(value).toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizePhoneDigits(value) {
  return normalizeText(value).replace(/[^\d+]/g, '')
}

function addDaysIso(days = 7) {
  const date = new Date()
  date.setDate(date.getDate() + Number(days || 0))
  return date.toISOString()
}

function getListingSellerFormData(listing = {}) {
  return listing?.sellerOnboarding?.formData && typeof listing.sellerOnboarding.formData === 'object'
    ? listing.sellerOnboarding.formData
    : {}
}

function resolveListingSellerEmail(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return normalizeText(
    formData.sellerEmail ||
      formData.email ||
      formData.contactEmail ||
      listing?.sellerEmail ||
      listing?.seller_email ||
      listing?.seller?.email,
  ).toLowerCase()
}

function resolveListingSellerPhone(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return normalizeText(
    formData.sellerPhone ||
      formData.phone ||
      formData.contactNumber ||
      formData.mobile ||
      listing?.sellerPhone ||
      listing?.seller_phone ||
      listing?.seller?.phone,
  )
}

function resolveListingSellerName(listing = {}) {
  const formData = getListingSellerFormData(listing)
  return normalizeText(
    [formData.sellerFirstName || formData.firstName, formData.sellerSurname || formData.lastName].filter(Boolean).join(' ') ||
      formData.sellerName ||
      formData.fullName ||
      listing?.sellerName ||
      listing?.seller_name ||
      listing?.seller?.name,
  )
}

export function normalizeSellerReviewDeliveryMode(value, { sellerEmail = '', sellerPhone = '' } = {}) {
  const normalized = normalizeLower(value)
  const aliased = SELLER_REVIEW_DELIVERY_MODE_ALIASES[normalized]
  if (aliased) return aliased
  if (isValidEmail(sellerEmail)) return SELLER_REVIEW_DELIVERY_MODE.EMAIL
  if (normalizePhoneDigits(sellerPhone)) return SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED
  return SELLER_REVIEW_DELIVERY_MODE.HARD_COPY
}

export function getSellerOfferReviewDeliveryModeLabel(value) {
  const normalized = normalizeSellerReviewDeliveryMode(value)
  if (normalized === SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED) return 'Agent Assisted'
  if (normalized === SELLER_REVIEW_DELIVERY_MODE.HARD_COPY) return 'Hard Copy'
  return 'Email Link'
}

export function buildSellerOfferReviewPreparation({
  listing = {},
  offer = {},
  deliveryMode = '',
  sellerEmail = '',
  sellerPhone = '',
  sellerName = '',
  sellerLeadId = '',
  sellerContactId = '',
  expiresAt = '',
} = {}) {
  const resolvedSellerEmail = normalizeText(sellerEmail || offer?.sellerEmail || resolveListingSellerEmail(listing)).toLowerCase()
  const resolvedSellerPhone = normalizePhoneDigits(sellerPhone || offer?.sellerPhone || resolveListingSellerPhone(listing))
  const resolvedSellerName = normalizeText(
    sellerName ||
      offer?.sellerName ||
      offer?.conditions?.sellerReviewRecipientName ||
      offer?.conditions?.sellerName ||
      resolveListingSellerName(listing),
  )
  const selectedDeliveryMode = normalizeSellerReviewDeliveryMode(deliveryMode || offer?.conditions?.sellerReviewDeliveryMode, {
    sellerEmail: resolvedSellerEmail,
    sellerPhone: resolvedSellerPhone,
  })
  const summary = listing?.id ? getListingReadinessSummary(listing) : null
  const profile = summary?.requirementProfile || {}
  const sellerType = normalizeText(profile?.sellerType || listing?.sellerType || listing?.seller_type || '')
  const owners = Array.isArray(profile?.owners) ? profile.owners : []
  const ownerCount = Number(profile?.ownerCount || owners.length || 0)
  const allOwnersCaptured = sellerType !== 'multiple_individuals' || owners.length >= Math.max(ownerCount, 2)
  const authorisedSignatoryPresent = sellerType
    ? !['company', 'trust', 'deceased_estate', 'other_legal_entity'].includes(normalizeLower(sellerType))
        || Boolean(normalizeText(profile?.authorisedSignatory))
    : true
  const linkedSellerLeadId = toNullableUuid(sellerLeadId || offer?.sellerLeadId || listing?.sellerLeadId || listing?.seller_lead_id || listing?.leadId || listing?.lead_id)
  const linkedSellerContactId = toNullableUuid(sellerContactId || offer?.sellerContactId || listing?.sellerContactId || listing?.seller_contact_id)
  const blockers = []
  const warnings = []

  if (!resolvedSellerName) blockers.push('Seller name or entity name is missing.')
  if (!linkedSellerLeadId && !linkedSellerContactId) blockers.push('Link a seller lead or seller contact to this listing before routing the offer.')
  if (selectedDeliveryMode === SELLER_REVIEW_DELIVERY_MODE.EMAIL && !isValidEmail(resolvedSellerEmail)) {
    blockers.push('A valid seller email is required for email-based seller review.')
  }
  if (selectedDeliveryMode === SELLER_REVIEW_DELIVERY_MODE.AGENT_ASSISTED && !resolvedSellerPhone && !resolvedSellerEmail) {
    blockers.push('Add at least one seller contact method before using agent-assisted seller review.')
  }
  if (sellerType === 'multiple_individuals' && !allOwnersCaptured) {
    blockers.push('Capture all owners before routing the offer for seller decision.')
  }
  if (!authorisedSignatoryPresent) {
    blockers.push('Authorised signatory details are missing for this seller structure.')
  }
  if (summary?.mandateReady === false) {
    warnings.push(...(Array.isArray(summary?.mandateChecks) ? summary.mandateChecks.filter((item) => !item?.satisfied).slice(0, 3).map((item) => item?.blocker || `Missing ${item?.label}`) : []))
  }
  if (summary?.mandateSigned === false) {
    warnings.push('Signed mandate is not yet recorded on this listing.')
  }
  if (summary?.missingRequirementsCount) {
    warnings.push(`Seller workspace still has ${summary.missingRequirementsCount} outstanding requirement${summary.missingRequirementsCount === 1 ? '' : 's'}.`)
  }

  const effectiveExpiresAt = normalizeDate(expiresAt) || addDaysIso(7)
  const authorityStatus = blockers.length ? 'blocked' : warnings.length ? 'watch' : 'ready'

  return {
    ready: blockers.length === 0,
    authorityStatus,
    deliveryMode: selectedDeliveryMode,
    deliveryModeLabel: getSellerOfferReviewDeliveryModeLabel(selectedDeliveryMode),
    sellerName: resolvedSellerName,
    sellerEmail: resolvedSellerEmail,
    sellerPhone: resolvedSellerPhone,
    sellerLeadId: linkedSellerLeadId,
    sellerContactId: linkedSellerContactId,
    sellerType: sellerType || 'individual',
    ownerCount,
    allOwnersCaptured,
    authorisedSignatory: normalizeText(profile?.authorisedSignatory),
    mandateReady: Boolean(summary?.mandateReady),
    mandateSigned: Boolean(summary?.mandateSigned),
    onboardingComplete: Boolean(summary?.onboardingComplete),
    blockers,
    warnings: Array.from(new Set(warnings)).filter(Boolean),
    expiresAt: effectiveExpiresAt,
    metadata: {
      deliveryMode: selectedDeliveryMode,
      deliveryModeLabel: getSellerOfferReviewDeliveryModeLabel(selectedDeliveryMode),
      authorityStatus,
      sellerType: sellerType || 'individual',
      ownerCount,
      allOwnersCaptured,
      authorisedSignatory: normalizeText(profile?.authorisedSignatory),
      mandateReady: Boolean(summary?.mandateReady),
      mandateSigned: Boolean(summary?.mandateSigned),
      onboardingComplete: Boolean(summary?.onboardingComplete),
      blockers,
      warnings: Array.from(new Set(warnings)).filter(Boolean),
    },
  }
}

export function isBuyerLifecycleAppointment(appointment = {}) {
  const type = normalizeLower(appointment?.appointmentType || appointment?.appointment_type || appointment?.type)
  const label = normalizeLower(appointment?.appointmentTypeLabel || appointment?.title || appointment?.label)
  return type.includes('viewing') || label.includes('viewing')
}

export function isBuyerLeadCategory(value) {
  const normalized = normalizeLower(value)
  return normalized === 'buyer' || normalized === 'buyer lead' || normalized.includes('buyer')
}

/**
 * Persists the accepted-offer facts that a transaction conversion must use.
 * It is intentionally small and idempotent: the offer remains the source of
 * truth, while the candidate gives every conversion surface the same snapshot
 * and a clear readiness result.
 */
export function buildAcceptedOfferConversionCandidate(offer = {}, { now = new Date().toISOString() } = {}) {
  const conditions = jsonObject(offer.conditions || offer.conditions_json)
  const candidate = jsonObject(conditions.conversionCandidate)
  const continuityFacts = buildAcceptedOfferContinuityFacts({ ...offer, conditions })
  const organisationId = normalizeText(offer.organisationId || offer.organisation_id)
  const offerId = normalizeText(offer.offerId || offer.id)
  const listingId = normalizeText(offer.listingId || offer.listing_id)
  const buyerLeadId = normalizeText(offer.buyerLeadId || offer.buyer_lead_id)
  const buyerContactId = normalizeText(offer.buyerContactId || offer.buyer_contact_id)
  const transactionId = normalizeText(offer.transactionId || offer.transaction_id)
  const offerAmount = Number(offer.offerAmount || offer.offer_amount || 0)
  const blockers = []
  if (!organisationId) blockers.push('organisation_missing')
  if (!offerId) blockers.push('offer_missing')
  if (!listingId) blockers.push('listing_missing')
  if (!buyerLeadId && !buyerContactId) blockers.push('buyer_missing')
  if (!Number.isFinite(offerAmount) || offerAmount <= 0) blockers.push('offer_amount_missing')
  const converted = normalizeOfferStatus(offer.status) === OFFER_STATUS.CONVERTED_TO_TRANSACTION && Boolean(transactionId)
  return {
    contract: 'arch9-accepted-offer-conversion-candidate-v2',
    candidateKey: organisationId && offerId ? `${organisationId}:${offerId}` : '',
    acceptedOfferId: offerId || null,
    organisationId: organisationId || null,
    listingId: listingId || null,
    buyerLeadId: buyerLeadId || null,
    buyerContactId: buyerContactId || null,
    offerAmount: Number.isFinite(offerAmount) && offerAmount > 0 ? offerAmount : null,
    financeType: continuityFacts.financeType || null,
    purchaserType: continuityFacts.purchaserType || null,
    purchaserEntityType: continuityFacts.purchaserEntityType || null,
    purchaserEntityName: continuityFacts.purchaserEntityName || null,
    bondAssistancePreference: continuityFacts.bondAssistancePreference || null,
    bondHelpRequested: continuityFacts.bondHelpRequested || null,
    bondAssistanceSelection: continuityFacts.bondAssistanceSelection || null,
    bondOriginatorName: continuityFacts.bondOriginatorName || null,
    bondOriginatorContact: continuityFacts.bondOriginatorContact || null,
    financeManagedBy: continuityFacts.financeManagedBy || null,
    clientIntakePreference: normalizeClientIntakePreference(conditions.clientIntakePreference || conditions.deliveryMode),
    status: converted ? 'converted' : blockers.length ? 'needs_attention' : 'ready',
    blockers,
    transactionId: transactionId || null,
    acceptedAt: normalizeDate(offer.acceptedAt || offer.accepted_at) || now,
    createdAt: normalizeDate(candidate.createdAt) || now,
    updatedAt: now,
  }
}

export {
  normalizeText as __normalizeText,
  normalizeLower as __normalizeLower,
  OFFER_STATUS_ALIASES as __OFFER_STATUS_ALIASES,
  OFFER_TERMINAL_STATUSES as __OFFER_TERMINAL_STATUSES,
  OFFER_ACTIVE_NEGOTIATION_STATUSES as __OFFER_ACTIVE_NEGOTIATION_STATUSES,
  OFFER_BUYER_RESUBMISSION_STATUSES as __OFFER_BUYER_RESUBMISSION_STATUSES,
  jsonObject as __jsonObject,
  buildAcceptedOfferContinuityFacts as __buildAcceptedOfferContinuityFacts,
  splitFullName as __splitFullName,
  firstFilledValue as __firstFilledValue,
  normalizePurchaserType as __normalizePurchaserType,
  normalizePurchaserEntityType as __normalizePurchaserEntityType,
  normalizeYesNoChoice as __normalizeYesNoChoice,
  normalizeBondAssistancePreference as __normalizeBondAssistancePreference,
  normalizeBondAssistanceSelection as __normalizeBondAssistanceSelection,
  CLIENT_INTAKE_PREFERENCE_ALIASES as __CLIENT_INTAKE_PREFERENCE_ALIASES,
  normalizeNaturalPersonPurchaseMode as __normalizeNaturalPersonPurchaseMode,
  SELLER_REVIEW_DELIVERY_MODE_ALIASES as __SELLER_REVIEW_DELIVERY_MODE_ALIASES,
  isValidEmail as __isValidEmail,
  normalizePhoneDigits as __normalizePhoneDigits,
  resolveListingSellerEmail as __resolveListingSellerEmail,
  getListingSellerFormData as __getListingSellerFormData,
  resolveListingSellerPhone as __resolveListingSellerPhone,
  resolveListingSellerName as __resolveListingSellerName,
  toNullableUuid as __toNullableUuid,
  isUuidLike as __isUuidLike,
  UUID_PATTERN as __UUID_PATTERN,
  normalizeDate as __normalizeDate,
  addDaysIso as __addDaysIso,
}
