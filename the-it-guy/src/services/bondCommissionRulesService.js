export const COMMISSION_RULE_TYPES = Object.freeze({
  fixed: 'fixed',
  percentage: 'percentage',
  tiered: 'tiered',
  hybrid: 'hybrid',
})

export const COMMISSION_CALCULATION_BASES = Object.freeze({
  grossBondAmount: 'gross_bond_amount',
  originatorCommission: 'originator_commission',
  fixedAmount: 'fixed_amount',
  manual: 'manual',
})

export const COMMISSION_PARTY_TYPES = Object.freeze({
  originatorCompany: 'originator_company',
  consultant: 'consultant',
  agency: 'agency',
  agent: 'agent',
  developer: 'developer',
  branch: 'branch',
  region: 'region',
  bank: 'bank',
  partnerReferral: 'partner_referral',
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
  const type = normalizeLower(rule.type || rule.ruleType || rule.rule_type || rule.rateType || rule.rate_type || COMMISSION_RULE_TYPES.percentage)
  const appliesTo = normalizeLower(rule.appliesTo || rule.applies_to || rule.partyType || rule.party_type || COMMISSION_PARTY_TYPES.consultant)
  const calculationBasis = normalizeLower(rule.calculationBasis || rule.calculation_basis || (
    appliesTo === COMMISSION_PARTY_TYPES.consultant || appliesTo === COMMISSION_PARTY_TYPES.branch || appliesTo === COMMISSION_PARTY_TYPES.region
      ? COMMISSION_CALCULATION_BASES.originatorCommission
      : COMMISSION_CALCULATION_BASES.grossBondAmount
  ))
  const percentage = Number(rule.percentage ?? rule.rate ?? 0)
  const fixedAmount = Number(rule.fixedAmount ?? rule.fixed_amount ?? rule.amount ?? (type === COMMISSION_RULE_TYPES.fixed ? rule.rate : 0) ?? 0)
  return {
    id: normalizeText(rule.id || rule.key),
    name: normalizeText(rule.name || rule.ruleName || rule.rule_name || rule.label || 'Commission Rule'),
    partyType: appliesTo,
    partyId: normalizeText(rule.partyId || rule.party_id),
    appliesTo,
    appliesToLabel: normalizeText(rule.appliesToLabel || rule.applies_to_label || rule.partyName || rule.party_name),
    calculationBasis,
    type: Object.values(COMMISSION_RULE_TYPES).includes(type) ? type : COMMISSION_RULE_TYPES.percentage,
    rateType: Object.values(COMMISSION_RULE_TYPES).includes(type) ? type : COMMISSION_RULE_TYPES.percentage,
    rate: Number(rule.rate ?? percentage ?? 0),
    percentage,
    fixedAmount,
    tiers: normalizeArray(rule.tiers),
    components: normalizeArray(rule.components),
    bonusCriteria: rule.bonusCriteria || rule.bonus_criteria || {},
    status: normalizeLower(rule.status || 'active'),
    effectiveFrom: normalizeText(rule.effectiveFrom || rule.effective_from),
    effectiveTo: normalizeText(rule.effectiveTo || rule.effective_to),
    isDefault: Boolean(rule.isDefault || rule.is_default),
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
  { id: 'originator-standard', name: 'Originator Company 1.95%', appliesTo: COMMISSION_PARTY_TYPES.originatorCompany, calculationBasis: COMMISSION_CALCULATION_BASES.grossBondAmount, type: COMMISSION_RULE_TYPES.percentage, percentage: 1.95, rate: 1.95, isDefault: true },
  { id: 'consultant-standard', name: 'Consultant 35%', appliesTo: COMMISSION_PARTY_TYPES.consultant, calculationBasis: COMMISSION_CALCULATION_BASES.originatorCommission, type: COMMISSION_RULE_TYPES.percentage, percentage: 35, rate: 35, isDefault: true },
  { id: 'branch-standard', name: 'Branch 0%', appliesTo: COMMISSION_PARTY_TYPES.branch, calculationBasis: COMMISSION_CALCULATION_BASES.originatorCommission, type: COMMISSION_RULE_TYPES.percentage, percentage: 0, rate: 0, isDefault: true },
  { id: 'region-standard', name: 'Region 0%', appliesTo: COMMISSION_PARTY_TYPES.region, calculationBasis: COMMISSION_CALCULATION_BASES.originatorCommission, type: COMMISSION_RULE_TYPES.percentage, percentage: 0, rate: 0, isDefault: true },
  { id: 'partner-referral-standard', name: 'Partner Referral 0.30%', appliesTo: COMMISSION_PARTY_TYPES.partnerReferral, calculationBasis: COMMISSION_CALCULATION_BASES.grossBondAmount, type: COMMISSION_RULE_TYPES.percentage, percentage: 0.3, rate: 0.3, isDefault: true },
  { id: 'developer-referral-standard', name: 'Developer Referral 0.40%', appliesTo: COMMISSION_PARTY_TYPES.developer, calculationBasis: COMMISSION_CALCULATION_BASES.grossBondAmount, type: COMMISSION_RULE_TYPES.percentage, percentage: 0.4, rate: 0.4, isDefault: true },
  { id: 'agency-referral-standard', name: 'Agency Referral 0.30%', appliesTo: COMMISSION_PARTY_TYPES.agency, calculationBasis: COMMISSION_CALCULATION_BASES.grossBondAmount, type: COMMISSION_RULE_TYPES.percentage, percentage: 0.3, rate: 0.3, isDefault: true },
  { id: 'agent-referral-standard', name: 'Agent Referral 0.30%', appliesTo: COMMISSION_PARTY_TYPES.agent, calculationBasis: COMMISSION_CALCULATION_BASES.grossBondAmount, type: COMMISSION_RULE_TYPES.percentage, percentage: 0.3, rate: 0.3, isDefault: true },
  { id: 'bank-incentive-standard', name: 'Bank Incentive 0%', appliesTo: COMMISSION_PARTY_TYPES.bank, calculationBasis: COMMISSION_CALCULATION_BASES.originatorCommission, type: COMMISSION_RULE_TYPES.percentage, percentage: 0, rate: 0, isDefault: true },
])
