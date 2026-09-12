import { resolveTransferTaxDecision } from '../transferTaxDecisionService.js'

const COMPLETED_STATUSES = new Set(['completed'])

function text(value) {
  return String(value || '').trim()
}

function key(value) {
  return text(value).toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
}

function completedStepKeys(steps = []) {
  return new Set((Array.isArray(steps) ? steps : [])
    .filter((step) => COMPLETED_STATUSES.has(key(step?.status)))
    .map((step) => key(step?.stepKey || step?.step_key || step?.key))
    .filter(Boolean))
}

function requirement(key, label) {
  return { key, label }
}

/**
 * The tax route is an attorney decision. It is deliberately assessed only at
 * the lodgement gate: attorney work can continue while SARS/tax work is being
 * resolved, but a transfer cannot be declared ready to lodge without the
 * proof appropriate to its confirmed route.
 */
export function evaluateTransferTaxLodgementReadiness({ transferTaxDecision = {}, steps = [] } = {}) {
  const decision = resolveTransferTaxDecision(transferTaxDecision)
  const completed = completedStepKeys(steps)
  const requirements = []

  if (decision.status !== 'confirmed' || decision.route === 'needs_tax_advice') {
    return {
      ready: false,
      route: decision.route,
      requirements,
      missingRequirements: [requirement('transfer_tax_route_confirmed', 'Attorney transfer-tax route confirmed')],
      warnings: ['Confirm the applicable transfer-tax route before marking the matter ready for lodgement.'],
    }
  }

  if (decision.route === 'transfer_duty') {
    requirements.push(
      requirement('transfer_duty_tdc01_submission', 'Transfer-duty submission confirmed'),
      requirement('sars_transfer_tax_receipt_verified', 'SARS transfer-duty receipt verified'),
    )
  } else {
    requirements.push(requirement('vat_exemption_evidence_verified', 'VAT, zero-rated, or exemption evidence verified'))
    requirements.push(requirement('sars_transfer_tax_receipt_verified', 'SARS transfer-tax receipt verified'))
  }

  if (decision.sellerNonResidentReview === 'yes') {
    requirements.push(requirement('non_resident_seller_withholding_review', 'Non-resident seller withholding review completed'))
  }

  const missingRequirements = requirements.filter((item) => !completed.has(item.key))
  return {
    ready: missingRequirements.length === 0,
    route: decision.route,
    requirements,
    missingRequirements,
    warnings: missingRequirements.map((item) => `${item.label} is required before lodgement.`),
  }
}

export function assertTransferTaxLodgementReadiness(input = {}) {
  const result = evaluateTransferTaxLodgementReadiness(input)
  if (!result.ready) {
    throw new Error(result.warnings[0] || 'Transfer-tax readiness must be confirmed before lodgement.')
  }
  return result
}
