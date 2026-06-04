export const COMMISSION_RULE_TYPES = Object.freeze({
  fixed: 'fixed',
  percentage: 'percentage',
  tiered: 'tiered',
  hybrid: 'hybrid',
})

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function money(value = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function percentAmount(baseAmount = 0, percentage = 0) {
  return money(Number(baseAmount || 0) * (Number(percentage || 0) / 100))
}

function resolveTier(tiers = [], volume = 0) {
  const safeVolume = Number(volume || 0)
  return normalizeArray(tiers)
    .map((tier) => ({
      from: Number(tier.from ?? tier.min ?? 0),
      to: tier.to === null || tier.to === undefined ? Infinity : Number(tier.to ?? tier.max),
      percentage: Number(tier.percentage || tier.rate || 0),
      fixedAmount: Number(tier.fixedAmount || tier.fixed_amount || 0),
    }))
    .sort((left, right) => left.from - right.from)
    .find((tier) => safeVolume >= tier.from && safeVolume <= tier.to)
}

export function normalizeCommissionRule(rule = {}) {
  const type = normalizeLower(rule.type || rule.ruleType || rule.rule_type || COMMISSION_RULE_TYPES.percentage)
  return {
    id: normalizeText(rule.id || rule.key),
    name: normalizeText(rule.name || rule.label || 'Commission Rule'),
    appliesTo: normalizeLower(rule.appliesTo || rule.applies_to || 'consultant'),
    type: Object.values(COMMISSION_RULE_TYPES).includes(type) ? type : COMMISSION_RULE_TYPES.percentage,
    percentage: Number(rule.percentage || rule.rate || 0),
    fixedAmount: Number(rule.fixedAmount || rule.fixed_amount || rule.amount || 0),
    tiers: normalizeArray(rule.tiers),
    components: normalizeArray(rule.components),
    bonusCriteria: rule.bonusCriteria || rule.bonus_criteria || {},
    status: normalizeLower(rule.status || 'active'),
  }
}

export function calculateRuleAmount(rule = {}, {
  baseAmount = 0,
  volume = 0,
  metrics = {},
} = {}) {
  const normalized = normalizeCommissionRule(rule)
  const safeBase = Number(baseAmount || 0)
  if (normalized.type === COMMISSION_RULE_TYPES.fixed) return money(normalized.fixedAmount)
  if (normalized.type === COMMISSION_RULE_TYPES.percentage) return percentAmount(safeBase, normalized.percentage)
  if (normalized.type === COMMISSION_RULE_TYPES.tiered) {
    const tier = resolveTier(normalized.tiers, volume)
    if (!tier) return 0
    return money(tier.fixedAmount || percentAmount(safeBase, tier.percentage))
  }
  if (normalized.type === COMMISSION_RULE_TYPES.hybrid) {
    const components = normalized.components.length
      ? normalized.components
      : [
          { type: COMMISSION_RULE_TYPES.fixed, fixedAmount: normalized.fixedAmount },
          { type: COMMISSION_RULE_TYPES.percentage, percentage: normalized.percentage },
        ]
    return money(components.reduce((sum, component) => sum + calculateRuleAmount(component, { baseAmount: safeBase, volume, metrics }), 0))
  }
  return 0
}

export function calculateBonusAmount(rule = {}, {
  baseAmount = 0,
  metrics = {},
} = {}) {
  const normalized = normalizeCommissionRule(rule)
  const criteria = normalized.bonusCriteria || {}
  const approvalRateTarget = Number(criteria.approvalRateTarget || criteria.approval_rate_target || 0)
  const slaTarget = Number(criteria.slaTarget || criteria.sla_target || 0)
  const revenueTarget = Number(criteria.revenueTarget || criteria.revenue_target || 0)
  const partnerSatisfactionTarget = Number(criteria.partnerSatisfactionTarget || criteria.partner_satisfaction_target || 0)
  const qualifies = [
    !approvalRateTarget || Number(metrics.approvalRate || 0) >= approvalRateTarget,
    !slaTarget || Number(metrics.slaCompliance || 0) >= slaTarget,
    !revenueTarget || Number(metrics.revenue || 0) >= revenueTarget,
    !partnerSatisfactionTarget || Number(metrics.partnerSatisfaction || 0) >= partnerSatisfactionTarget,
  ].every(Boolean)
  return qualifies ? calculateRuleAmount(normalized, { baseAmount, metrics }) : 0
}

export const DEFAULT_BOND_COMMISSION_RULES = Object.freeze([
  { id: 'consultant-standard', name: 'Consultant 20%', appliesTo: 'consultant', type: COMMISSION_RULE_TYPES.percentage, percentage: 20 },
  { id: 'branch-standard', name: 'Branch 5%', appliesTo: 'branch', type: COMMISSION_RULE_TYPES.percentage, percentage: 5 },
  { id: 'region-standard', name: 'Region 2%', appliesTo: 'region', type: COMMISSION_RULE_TYPES.percentage, percentage: 2 },
  { id: 'partner-referral-standard', name: 'Partner Referral 10%', appliesTo: 'partner_referral', type: COMMISSION_RULE_TYPES.percentage, percentage: 10 },
  { id: 'bank-incentive-standard', name: 'Bank Incentive 1%', appliesTo: 'bank_incentive', type: COMMISSION_RULE_TYPES.percentage, percentage: 1 },
])
