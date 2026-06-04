import {
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'
import {
  DEFAULT_BOND_COMMISSION_RULES,
  calculateBonusAmount,
  calculateRuleAmount,
  normalizeCommissionRule,
} from './bondCommissionRulesService'

export const BOND_REVENUE_EVENTS = Object.freeze({
  commissionCalculated: 'COMMISSION_CALCULATED',
  commissionApproved: 'COMMISSION_APPROVED',
  commissionPaid: 'COMMISSION_PAID',
  referralFeeCreated: 'REFERRAL_FEE_CREATED',
  referralFeePaid: 'REFERRAL_FEE_PAID',
  bonusAwarded: 'BONUS_AWARDED',
  payoutApproved: 'PAYOUT_APPROVED',
  payoutPaid: 'PAYOUT_PAID',
})

export const REVENUE_STATUSES = Object.freeze({
  pending: 'Pending',
  approved: 'Approved',
  payable: 'Payable',
  paid: 'Paid',
  cancelled: 'Cancelled',
})

export const PAYOUT_STATUSES = Object.freeze({
  pending: 'Pending',
  approved: 'Approved',
  processing: 'Processing',
  paid: 'Paid',
  rejected: 'Rejected',
})

const LOCAL_RULE_STORE = new Map()
const LOCAL_COMMISSION_STORE = new Map()
const LOCAL_REFERRAL_FEE_STORE = new Map()
const LOCAL_BONUS_STORE = new Map()
const LOCAL_PAYOUT_STORE = new Map()
const LOCAL_STATEMENT_STORE = new Map()
const LOCAL_ACTIVITY_STORE = new Map()
let localSequence = 0

const APPROVAL_TERMS = ['approved', 'approval', 'grant', 'registered', 'accepted', 'quote approved']
const DECLINE_TERMS = ['declined', 'rejected', 'lost', 'cancelled', 'canceled']
const PAYABLE_TERMS = ['instruction', 'instructed', 'registered', 'paid', 'payable']
const BANKS = ['ABSA', 'FNB', 'Nedbank', 'Standard Bank', 'Investec', 'Other']

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : []
}

function createId(prefix = 'bond-revenue') {
  localSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${localSequence}`
}

function money(value = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

function percent(part = 0, total = 0) {
  return total ? Math.round((Number(part || 0) / Number(total || 0)) * 100) : 0
}

function average(values = []) {
  const safe = values.map(Number).filter((value) => Number.isFinite(value))
  if (!safe.length) return 0
  return Math.round((safe.reduce((sum, value) => sum + value, 0) / safe.length) * 10) / 10
}

function getWorkspaceKey(context = {}, options = {}) {
  return normalizeText(
    options.workspaceId ||
      context.workspaceId ||
      context.currentWorkspace?.id ||
      context.workspace?.id ||
      context.currentMembership?.workspaceId ||
      context.currentMembership?.organisation_id ||
      context.currentMembership?.organisationId ||
      'default',
  )
}

function getActorId(context = {}) {
  return normalizeText(context.userId || context.user?.id || context.profile?.id || context.currentMembership?.userId || context.currentMembership?.user_id)
}

function getLocalRows(store, workspaceKey = '') {
  return [...(store.get(workspaceKey) || [])]
}

function setLocalRows(store, workspaceKey = '', rows = []) {
  store.set(workspaceKey, rows)
}

function recordActivity(workspaceKey = '', event = {}) {
  const row = {
    id: event.id || createId('revenue-activity'),
    eventType: normalizeText(event.eventType),
    sourceType: normalizeText(event.sourceType),
    sourceId: normalizeText(event.sourceId),
    actorUserId: normalizeText(event.actorUserId),
    previousValue: event.previousValue || null,
    newValue: event.newValue || null,
    createdAt: event.createdAt || new Date().toISOString(),
  }
  setLocalRows(LOCAL_ACTIVITY_STORE, workspaceKey, [row, ...getLocalRows(LOCAL_ACTIVITY_STORE, workspaceKey)])
  return row
}

function getSignal(row = {}) {
  return normalizeLower(`${row.status || ''} ${row.stage || ''} ${row.financeStatus || ''} ${row.finance_status || ''} ${row.financeStageKey || ''} ${row.finance_stage_key || ''} ${row.financeStageLabel || ''} ${row.registrationStatus || ''} ${row.nextAction || ''} ${row.next_action || ''} ${row.revenueStatus || ''} ${row.revenue_status || ''}`)
}

function signalIncludes(row = {}, terms = []) {
  const signal = getSignal(row)
  return terms.some((term) => signal.includes(term))
}

function isApprovedApplication(row = {}) {
  return signalIncludes(row, APPROVAL_TERMS)
}

function isCancelledApplication(row = {}) {
  return signalIncludes(row, DECLINE_TERMS) && !isApprovedApplication(row)
}

function isPayableApplication(row = {}) {
  return signalIncludes(row, PAYABLE_TERMS)
}

function getRevenueStatus(row = {}) {
  const explicit = normalizeLower(row.revenueStatus || row.revenue_status)
  if (explicit === 'paid') return REVENUE_STATUSES.paid
  if (explicit === 'payable') return REVENUE_STATUSES.payable
  if (explicit === 'approved') return REVENUE_STATUSES.approved
  if (explicit === 'cancelled' || explicit === 'canceled') return REVENUE_STATUSES.cancelled
  if (isCancelledApplication(row)) return REVENUE_STATUSES.cancelled
  if (isPayableApplication(row)) return REVENUE_STATUSES.payable
  if (isApprovedApplication(row)) return REVENUE_STATUSES.approved
  return REVENUE_STATUSES.pending
}

function dateValue(row = {}) {
  return normalizeText(row.paidAt || row.paid_at || row.approvedAt || row.approved_at || row.submittedAt || row.submitted_at || row.updatedAt || row.updated_at || row.createdAt || row.created_at)
}

function isWithinDays(row = {}, days = 30, now = new Date()) {
  const value = new Date(dateValue(row))
  if (Number.isNaN(value.getTime())) return true
  return value.getTime() >= now.getTime() - Number(days || 0) * 24 * 60 * 60 * 1000
}

function getApplicationId(row = {}) {
  return normalizeText(row.id || row.applicationId || row.application_id || row.transactionId || row.transaction_id || row.key)
}

function getApplicationConsultantId(row = {}) {
  return normalizeText(row.assignedConsultantId || row.assigned_consultant_id || row.assignedUserId || row.assigned_user_id || row.primaryBondConsultantUserId || row.primary_bond_consultant_user_id || row.ownerUserId || row.owner_user_id)
}

function getApplicationConsultantName(row = {}) {
  return normalizeText(row.consultantName || row.consultant_name || row.consultant || row.assignedUserName || row.assigned_user_name || getApplicationConsultantId(row)) || 'Consultant'
}

function getApplicationBranchId(row = {}) {
  return normalizeText(row.assignedBranchId || row.assigned_branch_id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id || row.bond_workspace_unit_id)
}

function getApplicationRegionId(row = {}) {
  return normalizeText(row.assignedRegionId || row.assigned_region_id || row.regionId || row.region_id || row.bond_region_id)
}

function getApplicationPartnerId(row = {}) {
  return normalizeText(row.partnerId || row.partner_id || row.bondPartnerId || row.bond_partner_id || row.agencyId || row.agency_id || row.developmentId || row.development_id)
}

function getApplicationPartnerName(row = {}) {
  return normalizeText(row.partnerName || row.partner_name || row.agencyName || row.agency_name || row.developmentName || row.development_name || getApplicationPartnerId(row)) || 'Partner'
}

function getBranchId(row = {}) {
  return normalizeText(row.id || row.branchId || row.branch_id || row.workspaceUnitId || row.workspace_unit_id)
}

function getBranchName(row = {}) {
  return normalizeText(row.name || row.branchName || row.branch_name || row.label || row.branch || getBranchId(row)) || 'Branch'
}

function getBranchRegionId(row = {}) {
  return normalizeText(row.regionId || row.region_id)
}

function getRegionId(row = {}) {
  return normalizeText(row.id || row.regionId || row.region_id)
}

function getRegionName(row = {}) {
  return normalizeText(row.name || row.regionName || row.region_name || row.label || getRegionId(row)) || 'Region'
}

function normalizeBankName(value = '') {
  const signal = normalizeLower(value)
  if (signal.includes('absa')) return 'ABSA'
  if (signal.includes('fnb') || signal.includes('first national')) return 'FNB'
  if (signal.includes('nedbank')) return 'Nedbank'
  if (signal.includes('standard')) return 'Standard Bank'
  if (signal.includes('investec')) return 'Investec'
  return 'Other'
}

function getBankValuesForApplication(row = {}) {
  const values = [
    row.bank,
    row.bankName,
    row.bank_name,
    row.lender,
    row.lenderName,
    row.lender_name,
    row.submittedBank,
    row.submitted_bank,
    ...normalizeArray(row.banksSubmittedTo || row.banks_submitted_to || row.submittedBanks || row.submitted_banks || row.selectedBanks || row.selected_banks),
  ].map(normalizeText).filter(Boolean)
  return values.length ? [...new Set(values.map(normalizeBankName))] : ['Other']
}

function getApplicationRevenue(row = {}, options = {}) {
  const explicit = Number(row.applicationRevenue || row.application_revenue || row.revenue || row.estimatedRevenue || row.estimated_revenue || row.grossCommissionAmount || row.gross_commission_amount || row.bondCommissionAmount || row.bond_commission_amount)
  if (Number.isFinite(explicit) && explicit > 0) return money(explicit)
  if (getRevenueStatus(row) === REVENUE_STATUSES.cancelled) return 0
  return money(options.defaultApplicationRevenue || 7500)
}

function deriveRegionsFromBranches(branches = [], applications = []) {
  const byId = new Map()
  branches.forEach((branch) => {
    const id = getBranchRegionId(branch)
    if (!id || byId.has(id)) return
    byId.set(id, { id, name: normalizeText(branch.regionName || branch.region || id) })
  })
  applications.forEach((application) => {
    const id = getApplicationRegionId(application)
    if (!id || byId.has(id)) return
    byId.set(id, { id, name: normalizeText(application.regionName || application.region || id) })
  })
  return [...byId.values()]
}

function getRows(context = {}, options = {}) {
  const workspaceKey = getWorkspaceKey(context, options)
  const operationalRows = getPartnerPortalOperationalRows(context, { ...options, workspaceId: workspaceKey })
  const applications = normalizeArray(options.applications || operationalRows.applications)
  const branches = normalizeArray(options.branches || options.units || operationalRows.branches || operationalRows.units)
  const rawRegions = normalizeArray(options.regions || operationalRows.regions)
  const regions = rawRegions.length ? rawRegions : deriveRegionsFromBranches(branches, applications)
  const consultants = normalizeArray(options.consultants || options.users || operationalRows.consultants || operationalRows.users)
  const scope = resolveBondOrganisationScope(context, {
    regions,
    branches,
    consultants,
    applications,
  })
  const rules = [
    ...DEFAULT_BOND_COMMISSION_RULES,
    ...normalizeArray(options.commissionRules),
    ...getLocalRows(LOCAL_RULE_STORE, workspaceKey),
  ].map(normalizeCommissionRule).filter((rule) => rule.status !== 'inactive')
  const raw = {
    workspaceKey,
    scope,
    applications,
    branches,
    regions,
    consultants,
    rules,
    commissions: [...normalizeArray(options.commissions), ...getLocalRows(LOCAL_COMMISSION_STORE, workspaceKey)].map((row) => normalizeCommission(row, workspaceKey)),
    referralFees: [...normalizeArray(options.referralFees), ...getLocalRows(LOCAL_REFERRAL_FEE_STORE, workspaceKey)].map((row) => normalizeReferralFee(row, workspaceKey)),
    bonuses: [...normalizeArray(options.bonuses), ...getLocalRows(LOCAL_BONUS_STORE, workspaceKey)].map((row) => normalizeBonus(row, workspaceKey)),
    payouts: [...normalizeArray(options.payouts), ...getLocalRows(LOCAL_PAYOUT_STORE, workspaceKey)].map((row) => normalizePayout(row, workspaceKey)),
  }
  return scopeRows(raw)
}

function scopeRows(rows = {}) {
  const scope = rows.scope || {}
  const applications = rows.applications.filter((row) => scopeMatchesApplication(scope, row))
  const applicationIds = new Set(applications.map(getApplicationId))
  const consultantIds = new Set(applications.map(getApplicationConsultantId).filter(Boolean))
  return {
    ...rows,
    applications,
    branches: rows.branches.filter((row) => scopeMatchesBranch(scope, row)),
    commissions: rows.commissions.filter((row) => applicationIds.has(row.applicationId) || consultantIds.has(row.consultantId)),
    referralFees: rows.referralFees.filter((row) => applicationIds.has(row.applicationId)),
    bonuses: rows.bonuses.filter((row) => {
      if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
      if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return normalizeArray(scope.regionIds).includes(row.regionId)
      if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return normalizeArray(scope.branchIds).includes(row.branchId)
      return consultantIds.has(row.recipientId)
    }),
    payouts: rows.payouts.filter((row) => {
      if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
      if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return normalizeArray(scope.regionIds).includes(row.regionId)
      if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return normalizeArray(scope.branchIds).includes(row.branchId)
      return consultantIds.has(row.payeeId)
    }),
  }
}

function scopeMatchesApplication(scope = {}, row = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return normalizeArray(scope.regionIds).includes(getApplicationRegionId(row))
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return normalizeArray(scope.branchIds).includes(getApplicationBranchId(row))
  return normalizeArray(scope.consultantIds).includes(getApplicationConsultantId(row))
}

function scopeMatchesBranch(scope = {}, row = {}) {
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq) return true
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.region) return normalizeArray(scope.regionIds).includes(getBranchRegionId(row))
  if (scope.scopeLevel === BOND_ORGANISATION_LEVELS.branch) return normalizeArray(scope.branchIds).includes(getBranchId(row))
  return false
}

function isFinanceRole(context = {}) {
  const role = normalizeLower(context.currentMembership?.workspaceRole || context.currentMembership?.workspace_role || context.currentMembership?.organisationRole || context.currentMembership?.organisation_role || context.workspaceRole || context.organisationRole)
  return ['finance_manager', 'bond_finance_manager', 'finance', 'cfo'].includes(role)
}

function assertRevenueAccess(rows = {}, context = {}) {
  if (isFinanceRole(context) || [BOND_ORGANISATION_LEVELS.hq, BOND_ORGANISATION_LEVELS.region, BOND_ORGANISATION_LEVELS.branch, BOND_ORGANISATION_LEVELS.consultant].includes(rows.scope.scopeLevel)) return
  const error = new Error('Revenue & Commissions access is not permitted for this user.')
  error.code = 'permission_denied'
  throw error
}

function assertPayoutAccess(rows = {}, context = {}) {
  if (rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || isFinanceRole(context)) return
  const error = new Error('Only HQ and finance managers can approve or pay commission payouts.')
  error.code = 'permission_denied'
  throw error
}

function ruleFor(rows = {}, appliesTo = '') {
  return rows.rules.find((rule) => rule.appliesTo === appliesTo) || DEFAULT_BOND_COMMISSION_RULES.find((rule) => normalizeCommissionRule(rule).appliesTo === appliesTo)
}

function applicationVolumeForConsultant(rows = {}, consultantId = '') {
  return rows.applications.filter((row) => getApplicationConsultantId(row) === consultantId && isApprovedApplication(row)).length
}

function buildAttribution(row = {}, rows = {}, options = {}) {
  const applicationId = getApplicationId(row)
  const consultantId = getApplicationConsultantId(row)
  const branchId = getApplicationBranchId(row)
  const regionId = getApplicationRegionId(row)
  const partnerId = getApplicationPartnerId(row)
  const applicationRevenue = getApplicationRevenue(row, options)
  const consultantVolume = applicationVolumeForConsultant(rows, consultantId)
  const consultantCommission = calculateRuleAmount(ruleFor(rows, 'consultant'), { baseAmount: applicationRevenue, volume: consultantVolume })
  const branchCommission = calculateRuleAmount(ruleFor(rows, 'branch'), { baseAmount: applicationRevenue })
  const regionalCommission = calculateRuleAmount(ruleFor(rows, 'region'), { baseAmount: applicationRevenue })
  const referralFee = calculateRuleAmount(ruleFor(rows, 'partner_referral'), { baseAmount: applicationRevenue })
  const bankIncentive = calculateRuleAmount(ruleFor(rows, 'bank_incentive'), { baseAmount: applicationRevenue })
  const revenueStatus = getRevenueStatus(row)
  const totalCosts = consultantCommission + branchCommission + regionalCommission + referralFee + bankIncentive
  return {
    id: applicationId,
    applicationId,
    applicationReference: normalizeText(row.applicationReference || row.application_reference || applicationId),
    consultantId,
    consultantName: getApplicationConsultantName(row),
    branchId,
    branchName: normalizeText(row.branchName || row.branch_name || labelForBranch(rows, branchId)),
    regionId,
    regionName: normalizeText(row.regionName || row.region_name || labelForRegion(rows, regionId)),
    partnerId,
    partnerName: getApplicationPartnerName(row),
    bank: getBankValuesForApplication(row)[0],
    applicationRevenue,
    consultantCommission,
    branchCommission,
    regionalCommission,
    referralFee,
    bankIncentive,
    revenueStatus,
    profit: money(applicationRevenue - totalCosts),
    margin: applicationRevenue ? percent(applicationRevenue - totalCosts, applicationRevenue) : 0,
    date: dateValue(row),
  }
}

function labelForBranch(rows = {}, branchId = '') {
  return getBranchName(rows.branches.find((branch) => getBranchId(branch) === branchId) || {}) || branchId || 'Branch'
}

function labelForRegion(rows = {}, regionId = '') {
  return getRegionName(rows.regions.find((region) => getRegionId(region) === regionId) || {}) || regionId || 'Region'
}

function normalizeCommission(row = {}, workspaceKey = '') {
  return {
    id: normalizeText(row.id) || createId('commission'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    applicationId: normalizeText(row.applicationId || row.application_id),
    consultantId: normalizeText(row.consultantId || row.consultant_id),
    amount: money(row.amount),
    status: normalizeText(row.status || PAYOUT_STATUSES.pending),
    calculatedAt: normalizeText(row.calculatedAt || row.calculated_at) || new Date().toISOString(),
    approvedAt: normalizeText(row.approvedAt || row.approved_at),
    paidAt: normalizeText(row.paidAt || row.paid_at),
  }
}

function normalizeReferralFee(row = {}, workspaceKey = '') {
  return {
    id: normalizeText(row.id) || createId('referral-fee'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    applicationId: normalizeText(row.applicationId || row.application_id),
    partnerId: normalizeText(row.partnerId || row.partner_id),
    amount: money(row.amount),
    status: normalizeText(row.status || PAYOUT_STATUSES.pending),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    paidAt: normalizeText(row.paidAt || row.paid_at),
  }
}

function normalizeBonus(row = {}, workspaceKey = '') {
  return {
    id: normalizeText(row.id) || createId('bonus-award'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    recipientType: normalizeText(row.recipientType || row.recipient_type || 'consultant'),
    recipientId: normalizeText(row.recipientId || row.recipient_id),
    branchId: normalizeText(row.branchId || row.branch_id),
    regionId: normalizeText(row.regionId || row.region_id),
    amount: money(row.amount),
    reason: normalizeText(row.reason || 'Bonus awarded'),
    status: normalizeText(row.status || PAYOUT_STATUSES.pending),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
  }
}

function normalizePayout(row = {}, workspaceKey = '') {
  return {
    id: normalizeText(row.id) || createId('payout'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    payeeType: normalizeText(row.payeeType || row.payee_type || 'consultant'),
    payeeId: normalizeText(row.payeeId || row.payee_id),
    payeeName: normalizeText(row.payeeName || row.payee_name || row.name),
    branchId: normalizeText(row.branchId || row.branch_id),
    regionId: normalizeText(row.regionId || row.region_id),
    amount: money(row.amount),
    status: normalizeText(row.status || PAYOUT_STATUSES.pending),
    workflowStage: normalizeText(row.workflowStage || row.workflow_stage || 'Calculated'),
    managerApprovedAt: normalizeText(row.managerApprovedAt || row.manager_approved_at),
    financeApprovedAt: normalizeText(row.financeApprovedAt || row.finance_approved_at),
    paidAt: normalizeText(row.paidAt || row.paid_at),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    auditTrail: normalizeArray(row.auditTrail || row.audit_trail),
  }
}

function attributionRows(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertRevenueAccess(rows, context)
  return {
    rows,
    attributions: rows.applications.map((row) => buildAttribution(row, rows, options)),
  }
}

function sum(rows = [], getter = (row) => row) {
  return money(rows.reduce((total, row) => total + Number(getter(row) || 0), 0))
}

function groupBy(rows = [], getter = () => '') {
  const grouped = new Map()
  rows.forEach((row) => {
    const key = normalizeText(getter(row)) || 'Unassigned'
    grouped.set(key, [...(grouped.get(key) || []), row])
  })
  return grouped
}

function rollup(rows = [], keyGetter, labelGetter = (key) => key) {
  return [...groupBy(rows, keyGetter).entries()].map(([key, items]) => ({
    id: key,
    key,
    name: labelGetter(key, items),
    applications: items.length,
    revenue: sum(items, (row) => row.applicationRevenue),
    commissions: sum(items, (row) => row.consultantCommission + row.branchCommission + row.regionalCommission),
    referralFees: sum(items, (row) => row.referralFee),
    bankIncentives: sum(items, (row) => row.bankIncentive),
    bonuses: 0,
    profit: sum(items, (row) => row.profit),
    margin: percent(sum(items, (row) => row.profit), sum(items, (row) => row.applicationRevenue)),
    approvalRate: percent(items.filter((row) => row.revenueStatus !== REVENUE_STATUSES.pending && row.revenueStatus !== REVENUE_STATUSES.cancelled).length, items.length),
  })).sort((left, right) => right.revenue - left.revenue)
}

export function calculateCommission(application = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertRevenueAccess(rows, context)
  const attribution = buildAttribution(application, rows, options)
  const commission = normalizeCommission({
    applicationId: attribution.applicationId,
    consultantId: attribution.consultantId,
    amount: attribution.consultantCommission,
    status: PAYOUT_STATUSES.pending,
  }, rows.workspaceKey)
  setLocalRows(LOCAL_COMMISSION_STORE, rows.workspaceKey, [commission, ...getLocalRows(LOCAL_COMMISSION_STORE, rows.workspaceKey)])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_REVENUE_EVENTS.commissionCalculated,
    sourceType: 'application',
    sourceId: attribution.applicationId,
    actorUserId: getActorId(context),
    newValue: commission,
  })
  if (attribution.referralFee > 0) {
    const referralFee = normalizeReferralFee({
      applicationId: attribution.applicationId,
      partnerId: attribution.partnerId,
      amount: attribution.referralFee,
      status: PAYOUT_STATUSES.pending,
    }, rows.workspaceKey)
    setLocalRows(LOCAL_REFERRAL_FEE_STORE, rows.workspaceKey, [referralFee, ...getLocalRows(LOCAL_REFERRAL_FEE_STORE, rows.workspaceKey)])
    recordActivity(rows.workspaceKey, {
      eventType: BOND_REVENUE_EVENTS.referralFeeCreated,
      sourceType: 'partner',
      sourceId: attribution.partnerId,
      actorUserId: getActorId(context),
      newValue: referralFee,
    })
  }
  return { attribution, commission }
}

export function calculateReferralFee(application = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  const applicationRevenue = getApplicationRevenue(application, options)
  return calculateRuleAmount(ruleFor(rows, 'partner_referral'), { baseAmount: applicationRevenue })
}

export function calculateBonus(payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertRevenueAccess(rows, context)
  const rule = normalizeCommissionRule(payload.rule || {
    type: payload.type || 'fixed',
    fixedAmount: payload.fixedAmount || payload.amount || 0,
    percentage: payload.percentage || 0,
    bonusCriteria: payload.bonusCriteria || {},
  })
  const amount = calculateBonusAmount(rule, { baseAmount: payload.baseAmount || payload.revenue || 0, metrics: payload.metrics || {} })
  const bonus = normalizeBonus({
    recipientType: payload.recipientType || 'consultant',
    recipientId: payload.recipientId,
    branchId: payload.branchId,
    regionId: payload.regionId,
    amount,
    reason: payload.reason || 'Bonus criteria met',
  }, rows.workspaceKey)
  if (amount > 0) {
    setLocalRows(LOCAL_BONUS_STORE, rows.workspaceKey, [bonus, ...getLocalRows(LOCAL_BONUS_STORE, rows.workspaceKey)])
    recordActivity(rows.workspaceKey, {
      eventType: BOND_REVENUE_EVENTS.bonusAwarded,
      sourceType: bonus.recipientType,
      sourceId: bonus.recipientId,
      actorUserId: getActorId(context),
      newValue: bonus,
    })
  }
  return bonus
}

export function getRevenueDashboard(context = {}, options = {}) {
  const { rows, attributions } = attributionRows(context, options)
  const now = options.now ? new Date(options.now) : new Date()
  const revenueThisMonthRows = attributions.filter((row) => isWithinDays({ updatedAt: row.date }, 30, now))
  const ytdStart = new Date(now.getFullYear(), 0, 1)
  const ytdRows = attributions.filter((row) => new Date(row.date || now).getTime() >= ytdStart.getTime())
  const payable = attributions.filter((row) => [REVENUE_STATUSES.payable, REVENUE_STATUSES.approved].includes(row.revenueStatus))
  const paidPayouts = rows.payouts.filter((row) => row.status === PAYOUT_STATUSES.paid)
  return {
    scope: rows.scope,
    permissions: {
      canManagePayouts: rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || isFinanceRole(context),
      canIssueBonuses: rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || isFinanceRole(context),
      canGenerateStatements: true,
    },
    summary: {
      revenueThisMonth: sum(revenueThisMonthRows, (row) => row.applicationRevenue),
      revenueYTD: sum(ytdRows, (row) => row.applicationRevenue),
      projectedRevenue: getRevenueForecast(context, options)[0]?.expectedRevenue || 0,
      pendingRevenue: sum(attributions.filter((row) => row.revenueStatus === REVENUE_STATUSES.pending), (row) => row.applicationRevenue),
      commissionsPayable: sum(payable, (row) => row.consultantCommission + row.branchCommission + row.regionalCommission),
      referralFeesPayable: sum(payable, (row) => row.referralFee),
      profitEstimate: sum(attributions, (row) => row.profit),
      averageRevenuePerApplication: average(attributions.map((row) => row.applicationRevenue)),
    },
    attribution: attributions,
    consultantEarnings: getConsultantCommission(null, context, options).rows,
    branchRevenue: getBranchRevenue(context, options),
    regionalRevenue: getRegionalRevenue(context, options),
    partnerRevenue: getPartnerRevenue(context, options),
    bankRevenue: getBankRevenue(context, options),
    profitability: getProfitability(context, options),
    forecast: getRevenueForecast(context, options),
    rankings: getCommercialRankings(context, options),
    payouts: buildPayoutRows(rows, attributions),
    activityFeed: getLocalRows(LOCAL_ACTIVITY_STORE, rows.workspaceKey),
    paidPayouts,
  }
}

export function getCommercialRankings(context = {}, options = {}) {
  const consultantRows = getConsultantCommission(null, context, options).rows
  const branchRows = getBranchRevenue(context, options)
  const regionRows = getRegionalRevenue(context, options)
  const partnerRows = getPartnerRevenue(context, options)
  const bankRows = getBankRevenue(context, options)
  const byRevenue = (rows = []) => [...rows].sort((left, right) => Number(right.revenue || right.revenueGenerated || 0) - Number(left.revenue || left.revenueGenerated || 0))
  const byProfit = (rows = []) => [...rows].sort((left, right) => Number(right.profit || 0) - Number(left.profit || 0))
  return {
    topRevenueConsultant: byRevenue(consultantRows)[0] || null,
    topRevenueBranch: byRevenue(branchRows)[0] || null,
    topRevenueRegion: byRevenue(regionRows)[0] || null,
    topRevenuePartner: byRevenue(partnerRows)[0] || null,
    mostProfitableBank: byProfit(bankRows)[0] || null,
  }
}

export function getConsultantCommission(consultantId = null, context = {}, options = {}) {
  const { attributions } = attributionRows(context, options)
  const safeId = normalizeText(consultantId)
  const rows = safeId ? attributions.filter((row) => row.consultantId === safeId) : attributions
  const rollups = rollup(rows, (row) => row.consultantId, (key, items) => items[0]?.consultantName || key)
    .map((row) => ({
      ...row,
      revenueGenerated: row.revenue,
      commissionEarned: sum(rows.filter((item) => item.consultantId === row.key), (item) => item.consultantCommission),
      commissionPaid: 0,
      commissionOutstanding: sum(rows.filter((item) => item.consultantId === row.key && item.revenueStatus !== REVENUE_STATUSES.paid), (item) => item.consultantCommission),
    }))
  return {
    summary: {
      applications: rows.length,
      revenueGenerated: sum(rows, (row) => row.applicationRevenue),
      commissionEarned: sum(rows, (row) => row.consultantCommission),
      commissionPaid: sum(rows.filter((row) => row.revenueStatus === REVENUE_STATUSES.paid), (row) => row.consultantCommission),
      commissionOutstanding: sum(rows.filter((row) => row.revenueStatus !== REVENUE_STATUSES.paid), (row) => row.consultantCommission),
    },
    rows: rollups,
    applications: rows.map((row) => ({
      application: row.applicationReference,
      revenue: row.applicationRevenue,
      commission: row.consultantCommission,
      status: row.revenueStatus,
      date: row.date,
    })),
  }
}

export function getBranchRevenue(context = {}, options = {}) {
  const { rows, attributions } = attributionRows(context, options)
  return rollup(attributions, (row) => row.branchId, (key) => labelForBranch(rows, key))
    .map((row) => ({
      ...row,
      branchId: row.key,
      branchName: row.name,
      revenuePerConsultant: money(row.revenue / Math.max(1, new Set(attributions.filter((item) => item.branchId === row.key).map((item) => item.consultantId)).size)),
    }))
}

export function getRegionalRevenue(context = {}, options = {}) {
  const { rows, attributions } = attributionRows(context, options)
  return rollup(attributions, (row) => row.regionId, (key) => labelForRegion(rows, key))
    .map((row) => ({ ...row, regionId: row.key, regionName: row.name, growth: revenueGrowth(attributions.filter((item) => item.regionId === row.key)) }))
}

export function getPartnerRevenue(context = {}, options = {}) {
  const { attributions } = attributionRows(context, options)
  return rollup(attributions, (row) => row.partnerId || row.partnerName, (key, items) => items[0]?.partnerName || key)
    .map((row) => ({
      ...row,
      partnerId: row.key,
      partnerName: row.name,
      applicationsSent: row.applications,
      revenueGenerated: row.revenue,
      approvalRevenue: sum(attributions.filter((item) => (item.partnerId || item.partnerName) === row.key && item.revenueStatus !== REVENUE_STATUSES.pending), (item) => item.applicationRevenue),
      lifetimeValue: row.revenue,
    }))
}

export function getBankRevenue(context = {}, options = {}) {
  const { attributions } = attributionRows(context, options)
  return BANKS.map((bank) => {
    const items = attributions.filter((row) => row.bank === bank)
    return {
      id: bank,
      bank,
      applications: items.length,
      revenue: sum(items, (row) => row.applicationRevenue),
      approvalRevenue: sum(items.filter((row) => row.revenueStatus !== REVENUE_STATUSES.pending), (row) => row.applicationRevenue),
      instructionRevenue: sum(items.filter((row) => row.revenueStatus === REVENUE_STATUSES.payable || row.revenueStatus === REVENUE_STATUSES.paid), (row) => row.applicationRevenue),
      bankIncentives: sum(items, (row) => row.bankIncentive),
      profit: sum(items, (row) => row.profit),
    }
  }).sort((left, right) => right.revenue - left.revenue)
}

export function getProfitability(context = {}, options = {}) {
  const { attributions } = attributionRows(context, options)
  const base = {
    revenue: sum(attributions, (row) => row.applicationRevenue),
    commission: sum(attributions, (row) => row.consultantCommission + row.branchCommission + row.regionalCommission),
    referralFees: sum(attributions, (row) => row.referralFee),
    bankIncentives: sum(attributions, (row) => row.bankIncentive),
    bonuses: 0,
  }
  const profit = money(base.revenue - base.commission - base.referralFees - base.bankIncentives - base.bonuses)
  return {
    ...base,
    profit,
    margin: percent(profit, base.revenue),
    byConsultant: getConsultantCommission(null, context, options).rows,
    byBranch: getBranchRevenue(context, options),
    byRegion: getRegionalRevenue(context, options),
    byPartner: getPartnerRevenue(context, options),
    byBank: getBankRevenue(context, options),
  }
}

export function getRevenueForecast(context = {}, options = {}) {
  const { attributions } = attributionRows(context, options)
  const now = options.now ? new Date(options.now) : new Date()
  const recent = attributions.filter((row) => isWithinDays({ updatedAt: row.date }, 30, now))
  const averageDailyApplications = (recent.length || attributions.length || 1) / 30
  const averageRevenue = average(attributions.map((row) => row.applicationRevenue)) || Number(options.defaultApplicationRevenue || 7500)
  const averageCommissionRate = percent(sum(attributions, (row) => row.consultantCommission + row.branchCommission + row.regionalCommission), sum(attributions, (row) => row.applicationRevenue)) || 27
  return [30, 90, 365].map((days) => {
    const expectedApplications = Math.max(0, Math.round(averageDailyApplications * days))
    const expectedRevenue = money(expectedApplications * averageRevenue)
    const expectedCommission = money(expectedRevenue * (averageCommissionRate / 100))
    const expectedReferral = money(expectedRevenue * 0.1)
    return {
      id: `forecast-${days}`,
      periodDays: days,
      expectedApplications,
      expectedRevenue,
      expectedCommission,
      expectedProfit: money(expectedRevenue - expectedCommission - expectedReferral),
    }
  })
}

export function approvePayout(payoutId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPayoutAccess(rows, context)
  const current = materializePayouts(rows, options)
  const existing = current.find((row) => row.id === payoutId)
  if (!existing) throwNotFound('Payout not found.')
  const updated = {
    ...existing,
    status: PAYOUT_STATUSES.approved,
    workflowStage: 'Finance Approved',
    managerApprovedAt: existing.managerApprovedAt || new Date().toISOString(),
    financeApprovedAt: new Date().toISOString(),
    auditTrail: [...existing.auditTrail, { action: 'approved', actorUserId: getActorId(context), at: new Date().toISOString() }],
  }
  setLocalRows(LOCAL_PAYOUT_STORE, rows.workspaceKey, [updated, ...getLocalRows(LOCAL_PAYOUT_STORE, rows.workspaceKey).filter((row) => row.id !== payoutId)])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_REVENUE_EVENTS.payoutApproved,
    sourceType: 'payout',
    sourceId: payoutId,
    actorUserId: getActorId(context),
    previousValue: existing,
    newValue: updated,
  })
  recordActivity(rows.workspaceKey, {
    eventType: BOND_REVENUE_EVENTS.commissionApproved,
    sourceType: 'payout',
    sourceId: payoutId,
    actorUserId: getActorId(context),
    newValue: updated,
  })
  return updated
}

export function markPayoutPaid(payoutId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPayoutAccess(rows, context)
  const current = materializePayouts(rows, options)
  const existing = current.find((row) => row.id === payoutId)
  if (!existing) throwNotFound('Payout not found.')
  const updated = {
    ...existing,
    status: PAYOUT_STATUSES.paid,
    workflowStage: 'Paid',
    paidAt: new Date().toISOString(),
    auditTrail: [...existing.auditTrail, { action: 'paid', actorUserId: getActorId(context), at: new Date().toISOString() }],
  }
  setLocalRows(LOCAL_PAYOUT_STORE, rows.workspaceKey, [updated, ...getLocalRows(LOCAL_PAYOUT_STORE, rows.workspaceKey).filter((row) => row.id !== payoutId)])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_REVENUE_EVENTS.payoutPaid,
    sourceType: 'payout',
    sourceId: payoutId,
    actorUserId: getActorId(context),
    previousValue: existing,
    newValue: updated,
  })
  recordActivity(rows.workspaceKey, {
    eventType: BOND_REVENUE_EVENTS.commissionPaid,
    sourceType: 'payout',
    sourceId: payoutId,
    actorUserId: getActorId(context),
    newValue: updated,
  })
  recordActivity(rows.workspaceKey, {
    eventType: BOND_REVENUE_EVENTS.referralFeePaid,
    sourceType: 'payout',
    sourceId: payoutId,
    actorUserId: getActorId(context),
    newValue: updated,
  })
  return updated
}

export function generateCommissionStatement(consultantId = '', context = {}, options = {}) {
  const rows = getRows(context, options)
  assertRevenueAccess(rows, context)
  const commission = getConsultantCommission(consultantId, context, options)
  const statement = {
    id: createId('commission-statement'),
    organisationId: rows.workspaceKey,
    consultantId,
    period: normalizeText(options.period) || new Date().toISOString().slice(0, 7),
    format: normalizeText(options.format || 'PDF'),
    sections: ['Applications', 'Revenue', 'Commission', 'Adjustments', 'Total Payable'],
    applications: commission.applications,
    revenue: commission.summary.revenueGenerated,
    commission: commission.summary.commissionEarned,
    adjustments: 0,
    totalPayable: commission.summary.commissionOutstanding,
    fileUrl: `/reports/bond/commission-statements/${rows.workspaceKey}/${consultantId || 'all'}-${Date.now()}.${normalizeLower(options.format || 'PDF') === 'excel' ? 'xlsx' : 'pdf'}`,
    createdAt: new Date().toISOString(),
  }
  setLocalRows(LOCAL_STATEMENT_STORE, rows.workspaceKey, [statement, ...getLocalRows(LOCAL_STATEMENT_STORE, rows.workspaceKey)])
  return statement
}

function materializePayouts(rows = {}, options = {}) {
  const attributions = rows.applications.map((row) => buildAttribution(row, rows, options))
  const generated = rollup(attributions, (row) => row.consultantId, (key, items) => items[0]?.consultantName || key)
    .map((row) => normalizePayout({
      id: `payout-consultant-${row.key}`,
      payeeType: 'consultant',
      payeeId: row.key,
      payeeName: row.name,
      branchId: attributions.find((item) => item.consultantId === row.key)?.branchId,
      regionId: attributions.find((item) => item.consultantId === row.key)?.regionId,
      amount: sum(attributions.filter((item) => item.consultantId === row.key), (item) => item.consultantCommission),
      status: PAYOUT_STATUSES.pending,
    }, rows.workspaceKey))
  const local = getLocalRows(LOCAL_PAYOUT_STORE, rows.workspaceKey).map((row) => normalizePayout(row, rows.workspaceKey))
  const localIds = new Set(local.map((row) => row.id))
  return [...local, ...generated.filter((row) => !localIds.has(row.id))]
}

function buildPayoutRows(rows = {}, attributions = []) {
  const materialized = materializePayouts(rows, {})
  return materialized.map((row) => ({
    ...row,
    applications: attributions.filter((item) => item.consultantId === row.payeeId).length,
  })).sort((left, right) => right.amount - left.amount)
}

function revenueGrowth(rows = []) {
  const now = new Date()
  const recent = sum(rows.filter((row) => isWithinDays({ updatedAt: row.date }, 30, now)), (row) => row.applicationRevenue)
  const prior = sum(rows.filter((row) => !isWithinDays({ updatedAt: row.date }, 30, now) && isWithinDays({ updatedAt: row.date }, 90, now)), (row) => row.applicationRevenue)
  if (!prior) return recent ? 100 : 0
  return Math.round(((recent - prior) / prior) * 100)
}

function throwNotFound(message = 'Record not found.') {
  const error = new Error(message)
  error.code = 'not_found'
  throw error
}

export const __bondRevenueManagementServiceTestUtils = Object.freeze({
  clearStores() {
    LOCAL_RULE_STORE.clear()
    LOCAL_COMMISSION_STORE.clear()
    LOCAL_REFERRAL_FEE_STORE.clear()
    LOCAL_BONUS_STORE.clear()
    LOCAL_PAYOUT_STORE.clear()
    LOCAL_STATEMENT_STORE.clear()
    LOCAL_ACTIVITY_STORE.clear()
    localSequence = 0
  },
  seedRules(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_RULE_STORE, normalizeText(workspaceId || 'default'), rows.map(normalizeCommissionRule))
  },
  seedPayouts(workspaceId = '', rows = []) {
    setLocalRows(LOCAL_PAYOUT_STORE, normalizeText(workspaceId || 'default'), rows.map((row) => normalizePayout(row, workspaceId)))
  },
  getActivity(workspaceId = '') {
    return getLocalRows(LOCAL_ACTIVITY_STORE, normalizeText(workspaceId || 'default'))
  },
  getStatements(workspaceId = '') {
    return getLocalRows(LOCAL_STATEMENT_STORE, normalizeText(workspaceId || 'default'))
  },
})
