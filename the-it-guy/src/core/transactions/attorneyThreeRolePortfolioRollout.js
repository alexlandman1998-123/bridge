export const ATTORNEY_THREE_ROLE_PHASE8_VERSION = 'attorney_three_role_portfolio_rollout_phase8_v1'

const ROLE_KEYS = Object.freeze(['transfer_attorney', 'bond_attorney', 'cancellation_attorney'])
const ROLE_LABELS = Object.freeze({
  transfer_attorney: 'Transfer Attorney',
  bond_attorney: 'Bond Attorney',
  cancellation_attorney: 'Cancellation Attorney',
})

const DEFAULT_THRESHOLDS = Object.freeze({
  maximumAtRiskRate: 0.2,
  maximumStaleRate: 0.15,
  maximumOverdueRate: 0.15,
  holdAtRiskRate: 0.35,
})

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isBondFinance(value = '') {
  const normalized = normalizeText(value)
  return ['bond', 'bonded', 'bond_finance', 'mortgage', 'home_loan', 'hybrid', 'cash_and_bond', 'partial_bond', 'combination'].includes(normalized)
}

function requiredRolesForMatter(row = {}) {
  const required = ['transfer_attorney']
  if (isBondFinance(row.financeType) || normalizeText(row.matterType).includes('bond')) required.push('bond_attorney')
  if (row.sellerHasExistingBond === true || normalizeText(row.matterType).includes('cancellation')) required.push('cancellation_attorney')
  return required
}

function ageDays(value, now) {
  const timestamp = new Date(value || '').getTime()
  if (!Number.isFinite(timestamp)) return 0
  return Math.max(0, Math.floor((now.getTime() - timestamp) / 86400000))
}

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0
}

function groupVisibleMatters(rows = []) {
  const grouped = new Map()
  for (const row of rows) {
    const matterId = row.matterId || row.matterReference
    if (!matterId) continue
    const current = grouped.get(matterId) || { ...row, assignedRoles: new Set() }
    const role = normalizeText(row.attorneyRole)
    if (ROLE_KEYS.includes(role)) current.assignedRoles.add(role)
    grouped.set(matterId, current)
  }
  return [...grouped.values()]
}

function interventionForMatter(matter, now) {
  const requiredRoles = requiredRolesForMatter(matter)
  const missingRoles = requiredRoles.filter((role) => !matter.assignedRoles.has(role))
  const staleDays = ageDays(matter.lastMeaningfulActivityAt || matter.lastUpdated, now)
  const overdue = matter.nextActionDueAt && new Date(matter.nextActionDueAt).getTime() < now.getTime()
  const atRisk = matter.status === 'Needs Attention' || matter.flags?.delayed === true
  const reasons = [
    ...missingRoles.map((role) => `${ROLE_LABELS[role]} assignment missing`),
    overdue ? 'Next action overdue' : '',
    staleDays >= 7 ? `${staleDays} days without meaningful activity` : '',
    atRisk ? 'Matter marked at risk' : '',
  ].filter(Boolean)
  return Object.freeze({
    matterId: matter.matterId,
    matterReference: matter.matterReference || matter.matterId,
    actionHref: matter.actionHref || '',
    missingRoles: Object.freeze(missingRoles),
    staleDays,
    overdue: Boolean(overdue),
    atRisk,
    reasons: Object.freeze(reasons),
    severity: missingRoles.length || (atRisk && overdue) ? 'critical' : reasons.length ? 'warning' : 'clear',
  })
}

export function buildAttorneyThreeRolePortfolioRollout({ matterRows = [], now = null, thresholds = {} } = {}) {
  const effectiveThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
  const clock = new Date(now || Date.now())
  const matters = groupVisibleMatters(Array.isArray(matterRows) ? matterRows : [])
  const interventions = matters.map((matter) => interventionForMatter(matter, clock))
  const atRiskCount = interventions.filter((item) => item.atRisk).length
  const staleCount = interventions.filter((item) => item.staleDays >= 7).length
  const overdueCount = interventions.filter((item) => item.overdue).length
  const coverageGapCount = interventions.reduce((sum, item) => sum + item.missingRoles.length, 0)
  const roleCoverage = ROLE_KEYS.map((roleKey) => {
    const required = matters.filter((matter) => requiredRolesForMatter(matter).includes(roleKey)).length
    const assigned = matters.filter((matter) => requiredRolesForMatter(matter).includes(roleKey) && matter.assignedRoles.has(roleKey)).length
    return Object.freeze({ roleKey, label: ROLE_LABELS[roleKey], required, assigned, gap: Math.max(0, required - assigned), coveragePercent: required ? percent(assigned, required) : 100 })
  })
  const atRiskRate = matters.length ? atRiskCount / matters.length : 0
  const staleRate = matters.length ? staleCount / matters.length : 0
  const overdueRate = matters.length ? overdueCount / matters.length : 0
  const thresholdBreaches = [
    atRiskRate > effectiveThresholds.maximumAtRiskRate ? 'at_risk_rate' : '',
    staleRate > effectiveThresholds.maximumStaleRate ? 'stale_matter_rate' : '',
    overdueRate > effectiveThresholds.maximumOverdueRate ? 'overdue_action_rate' : '',
  ].filter(Boolean)
  const decision = !matters.length
    ? 'insufficient_data'
    : coverageGapCount > 0 || atRiskRate > effectiveThresholds.holdAtRiskRate
      ? 'hold'
      : thresholdBreaches.length
        ? 'observe'
        : 'go'

  return Object.freeze({
    version: ATTORNEY_THREE_ROLE_PHASE8_VERSION,
    decision,
    decisionLabel: decision === 'go' ? 'Pilot operating within thresholds' : decision === 'observe' ? 'Pilot requires observation' : decision === 'hold' ? 'Hold expansion and intervene' : 'Insufficient portfolio data',
    matterCount: matters.length,
    metrics: Object.freeze({
      atRiskCount,
      atRiskPercent: percent(atRiskCount, matters.length),
      staleCount,
      stalePercent: percent(staleCount, matters.length),
      overdueCount,
      overduePercent: percent(overdueCount, matters.length),
      coverageGapCount,
    }),
    roleCoverage: Object.freeze(roleCoverage),
    thresholdBreaches: Object.freeze(thresholdBreaches),
    interventions: Object.freeze(interventions.filter((item) => item.reasons.length).sort((left, right) => {
      if (left.severity !== right.severity) return left.severity === 'critical' ? -1 : 1
      return right.reasons.length - left.reasons.length
    })),
    thresholds: Object.freeze(effectiveThresholds),
  })
}

