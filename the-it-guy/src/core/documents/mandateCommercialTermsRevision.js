export const MANDATE_COMMERCIAL_TERMS_REVISION_CONTRACT = 'arch9-mandate-commercial-terms-revision-v1'

function text(value) {
  return String(value ?? '').trim()
}

function number(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function bool(value) {
  return value === true || ['true', 'yes', '1'].includes(text(value).toLowerCase())
}

export function normalizeMandateCommercialTerms(input = {}) {
  return {
    commissionPercentage: number(input.commissionPercentage ?? input.commission_percentage ?? input.percentage),
    commissionAmount: number(input.commissionAmount ?? input.commission_amount ?? input.amount),
    vatHandling: text(input.vatHandling ?? input.vat_handling).toLowerCase(),
    mandateTerms: text(input.mandateTerms ?? input.mandate_terms),
    paymentResponsibility: text(input.paymentResponsibility ?? input.payment_responsibility).toLowerCase(),
    digitalMandateRequested: bool(input.digitalMandateRequested ?? input.digital_mandate_requested),
  }
}

export function hasMandateCommercialTermsChanged(previous = {}, next = {}) {
  const left = normalizeMandateCommercialTerms(previous)
  const right = normalizeMandateCommercialTerms(next)
  return Object.keys(left).some((field) => left[field] !== right[field])
}

export function createMandateCommercialTermsRevision({
  previous = {},
  next = {},
  revisions = [],
  actor = '',
  recordedAt = new Date().toISOString(),
} = {}) {
  const normalizedPrevious = normalizeMandateCommercialTerms(previous)
  const normalizedNext = normalizeMandateCommercialTerms(next)
  const changedFields = Object.keys(normalizedNext).filter((field) => normalizedPrevious[field] !== normalizedNext[field])
  return {
    contract: MANDATE_COMMERCIAL_TERMS_REVISION_CONTRACT,
    version: (Array.isArray(revisions) ? revisions.length : 0) + 1,
    changed: changedFields.length > 0,
    changedFields,
    previous: normalizedPrevious,
    next: normalizedNext,
    recordedAt: text(recordedAt) || new Date().toISOString(),
    actor: text(actor),
  }
}
