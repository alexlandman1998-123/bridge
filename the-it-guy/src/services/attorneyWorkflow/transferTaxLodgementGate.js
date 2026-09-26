import { resolveTransferTaxDecision } from '../transferTaxDecisionService.js'
import { phase4TaxTaskKeys, phase4DecisionIssues } from './transferPhase4Policy.js'

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
export function evaluateTransferTaxLodgementReadiness({ transferTaxDecision = {}, scenarioProfile = {}, propertyConditions = null, profile = {}, steps = [] } = {}) {
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

  requirements.push(...phase4TaxTaskKeys(decision, scenarioProfile)
    .filter((item) => item !== 'transfer_tax_route_confirmed')
    .map((item) => requirement(item, item.replace(/_/g, ' '))))

  const missingRequirements = requirements.filter((item) => !completed.has(item.key))
  const decisionIssues = phase4DecisionIssues(decision, scenarioProfile, propertyConditions, profile)
  return {
    ready: missingRequirements.length === 0 && decisionIssues.length === 0,
    route: decision.route,
    requirements,
    missingRequirements,
    warnings: [...missingRequirements.map((item) => `${item.label} is required before lodgement.`),
      ...decisionIssues.map((item) => `Review ${item} before lodgement.`)],
  }
}

export function assertTransferTaxLodgementReadiness(input = {}) {
  const result = evaluateTransferTaxLodgementReadiness(input)
  if (!result.ready) {
    throw new Error(result.warnings[0] || 'Transfer-tax readiness must be confirmed before lodgement.')
  }
  return result
}
