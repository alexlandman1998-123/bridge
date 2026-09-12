export const TRANSFER_TAX_DECISION_VERSION = 'transfer_tax_decision_v1'

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
    supplyInCourseOfEnterprise: yesNoUnknown(source.supplyInCourseOfEnterprise ?? source.supply_in_course_of_enterprise),
    sellerNonResidentReview: yesNoUnknown(source.sellerNonResidentReview ?? source.seller_non_resident_review),
    sarsEvidenceRequest: yesNoUnknown(source.sarsEvidenceRequest ?? source.sars_evidence_request),
    dutyPaymentRequired: yesNoUnknown(source.dutyPaymentRequired ?? source.duty_payment_required),
    sarsStatus: sarsStatus(source.sarsStatus ?? source.sars_status),
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
  const changed = [
    'route', 'sellerVatRegistered', 'sellerVatNumberReference', 'supplyInCourseOfEnterprise',
    'sellerNonResidentReview', 'sarsEvidenceRequest', 'dutyPaymentRequired', 'sarsStatus', 'basisNote',
  ].some((field) => next[field] !== prior[field])

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
