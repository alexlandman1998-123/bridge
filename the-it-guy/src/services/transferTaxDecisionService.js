export const TRANSFER_TAX_DECISION_VERSION = 'transfer_tax_decision_v2'

export const TRANSFER_TAX_ROUTES = Object.freeze([
  'transfer_duty',
  'vat',
  'zero_rated_going_concern',
  'exempt',
  'needs_tax_advice',
])
const SARS_TAX_STATUSES = new Set(['not_started', 'draft', 'submitted', 'query', 'approved', 'payment_pending', 'receipted'])

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function yesNoUnknown(value) {
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  const normalized = key(value)
  if (['yes', 'true', '1', 'confirmed'].includes(normalized)) return 'yes'
  if (['no', 'false', '0', 'not_applicable'].includes(normalized)) return 'no'
  return 'unknown'
}

function route(value) {
  const normalized = key(value)
  if (TRANSFER_TAX_ROUTES.includes(normalized)) return normalized
  if (['duty', 'transfer_duty'].includes(normalized)) return 'transfer_duty'
  if (['standard_vat', 'taxable_supply'].includes(normalized)) return 'vat'
  if (['zero_rated', 'going_concern'].includes(normalized)) return 'zero_rated_going_concern'
  if (['exemption', 'exempt_transfer'].includes(normalized)) return 'exempt'
  return 'needs_tax_advice'
}

function sarsStatus(value) {
  const normalized = key(value)
  return SARS_TAX_STATUSES.has(normalized) ? normalized : 'not_started'
}

function auditEntries(value) {
  return Array.isArray(value)
    ? value.filter((entry) => entry && typeof entry === 'object').slice(-50)
    : []
}

function sellerReviews(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).map(([partyId, review]) => [partyId, {
    applicable: yesNoUnknown(review?.applicable),
    directiveStatus: ['issued', 'not_required'].includes(key(review?.directiveStatus)) ? key(review.directiveStatus) : 'unknown',
    directiveReference: text(review?.directiveReference),
    withholdingRequired: yesNoUnknown(review?.withholdingRequired),
    paymentReference: text(review?.paymentReference),
    proofReference: text(review?.proofReference),
    basisNote: text(review?.basisNote),
  }]))
}

function exemptionClaims(source) {
  const supplied = Array.isArray(source.exemptionClaims) ? source.exemptionClaims :
    source.exemptionType ? [{ statutoryBasis: source.exemptionType,
      evidenceReference: source.exemptionEvidenceReference, applicable: 'yes',
      basisNote: source.basisNote, appliesTo: 'whole transaction' }] : []
  return supplied.slice(0, 20).map((claim) => ({
    statutoryBasis: text(claim?.statutoryBasis),
    appliesTo: text(claim?.appliesTo),
    applicable: yesNoUnknown(claim?.applicable),
    evidenceReference: text(claim?.evidenceReference),
    basisNote: text(claim?.basisNote),
  }))
}

/**
 * Normalises the attorney's tax decision independently from onboarding facts.
 * Onboarding can prefill facts, but never becomes a legal determination.
 */
export function resolveTransferTaxDecision(value = {}) {
  const source = value && typeof value === 'object' ? value : {}
  const routeValue = route(source.route || source.taxRoute || source.vatTreatment)
  return {
    version: TRANSFER_TAX_DECISION_VERSION,
    route: routeValue,
    status: routeValue === 'needs_tax_advice'
      ? 'needs_confirmation'
      : text(source.status) || (source.confirmedAt || source.confirmed_at ? 'confirmed' : 'needs_confirmation'),
    sellerVatRegistered: yesNoUnknown(source.sellerVatRegistered ?? source.seller_vat_registered),
    // This is a reference only. The authoritative VAT number remains in seller onboarding.
    sellerVatNumberReference: text(source.sellerVatNumberReference ?? source.seller_vat_number_reference),
    buyerVatRegistered: yesNoUnknown(source.buyerVatRegistered),
    buyerVatNumberReference: text(source.buyerVatNumberReference),
    supplyInCourseOfEnterprise: yesNoUnknown(source.supplyInCourseOfEnterprise ?? source.supply_in_course_of_enterprise),
    sellerNonResidentReview: yesNoUnknown(source.sellerNonResidentReview ?? source.seller_non_resident_review),
    sarsEvidenceRequest: yesNoUnknown(source.sarsEvidenceRequest ?? source.sars_evidence_request),
    dutyPaymentRequired: yesNoUnknown(source.dutyPaymentRequired ?? source.duty_payment_required),
    sarsStatus: sarsStatus(source.sarsStatus ?? source.sars_status),
    tdc01Reference: text(source.tdc01Reference),
    assessmentReference: text(source.assessmentReference),
    paymentReference: text(source.paymentReference),
    sarsProofReference: text(source.sarsProofReference),
    sarsQueryResponseReference: text(source.sarsQueryResponseReference),
    goingConcernAgreementReference: text(source.goingConcernAgreementReference),
    exemptionType: text(source.exemptionType),
    exemptionEvidenceReference: text(source.exemptionEvidenceReference),
    exemptionClaims: exemptionClaims(source),
    nonResidentSellers: sellerReviews(source.nonResidentSellers),
    basisNote: text(source.basisNote ?? source.basis_note),
    confirmedAt: source.confirmedAt || source.confirmed_at || null,
    confirmedBy: source.confirmedBy || source.confirmed_by || null,
    confirmedByRole: text(source.confirmedByRole ?? source.confirmed_by_role) || null,
    audit: auditEntries(source.audit),
  }
}

export function applyTransferTaxDecisionUpdate(existing = {}, update = {}, actor = {}) {
  const prior = resolveTransferTaxDecision(existing)
  const next = resolveTransferTaxDecision({ ...prior, ...update })
  if (next.route !== prior.route) {
    // A receipt and SARS state belong to a specific legal route. The attorney
    // must review new proof after a route correction, even if the form sent an
    // old hidden field from the previous route.
    const newProof = text(update.sarsProofReference)
    next.sarsProofReference = newProof && newProof !== prior.sarsProofReference ? newProof : ''
    next.sarsStatus = next.sarsProofReference && update.sarsStatus === 'receipted' ? 'receipted' : 'not_started'
    next.sarsQueryResponseReference = ''
  }
  const changed = [
    'route', 'sellerVatRegistered', 'sellerVatNumberReference', 'buyerVatRegistered',
    'buyerVatNumberReference', 'supplyInCourseOfEnterprise',
    'sellerNonResidentReview', 'sarsEvidenceRequest', 'dutyPaymentRequired', 'sarsStatus', 'basisNote',
    'tdc01Reference', 'assessmentReference', 'paymentReference', 'sarsProofReference',
    'sarsQueryResponseReference', 'goingConcernAgreementReference', 'exemptionType', 'exemptionEvidenceReference',
  ].some((field) => next[field] !== prior[field]) ||
    JSON.stringify(next.nonResidentSellers) !== JSON.stringify(prior.nonResidentSellers) ||
    JSON.stringify(next.exemptionClaims) !== JSON.stringify(prior.exemptionClaims)

  if (!changed) return prior

  const confirmedAt = actor.confirmedAt || new Date().toISOString()
  const auditEntry = {
    at: confirmedAt,
    actorId: actor.userId || null,
    actorRole: actor.role || null,
    previousRoute: prior.route,
    route: next.route,
    reason: next.basisNote || null,
  }
  return {
    ...next,
    status: next.route === 'needs_tax_advice' ? 'needs_confirmation' : 'confirmed',
    confirmedAt,
    confirmedBy: actor.userId || prior.confirmedBy || null,
    confirmedByRole: actor.role || prior.confirmedByRole || null,
    audit: [...prior.audit, auditEntry].slice(-50),
  }
}
