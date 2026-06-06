import {
  BOND_ORGANISATION_LEVELS,
  resolveBondOrganisationScope,
} from './bondOrganisationScopeResolver'
import { DEV_BYPASS_WORKSPACE_IDS } from '../lib/demoIds'
import { getPartnerPortalOperationalRows } from './bondPartnerPortalService'
import {
  COMMISSION_CALCULATION_BASES,
  COMMISSION_PARTY_TYPES,
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
  commissionRuleSaved: 'COMMISSION_RULE_SAVED',
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
  readyToPay: 'Ready To Pay',
  approved: 'Approved',
  invoiced: 'Invoiced',
  processing: 'Processing',
  paid: 'Paid',
  onHold: 'On Hold',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
})

export const PAYOUT_STATUS_KEYS = Object.freeze({
  pending: 'pending',
  readyToPay: 'ready_to_pay',
  approved: 'approved',
  invoiced: 'invoiced',
  paid: 'paid',
  onHold: 'on_hold',
  cancelled: 'cancelled',
})

export const INVOICE_STATUSES = Object.freeze({
  notRequired: 'not_required',
  notInvoiced: 'not_invoiced',
  invoiceRequested: 'invoice_requested',
  invoiceReceived: 'invoice_received',
  invoiceApproved: 'invoice_approved',
  invoicePaid: 'invoice_paid',
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
const SUBMITTED_TERMS = ['submitted', 'applications_submitted', 'bank', 'quote', 'approved', 'instruction', 'registered']
const QUOTE_ACCEPTED_TERMS = ['accepted quote', 'quote accepted', 'quote_approved', 'approved_by_buyer', 'buyer approved']
const REGISTERED_TERMS = ['registered', 'registration', 'paid', 'completed']

const FORECAST_STAGE_WEIGHTS = Object.freeze([
  { id: 'submitted', label: 'Submitted', weight: 25, matcher: (row) => signalIncludes(row, SUBMITTED_TERMS) && !signalIncludes(row, [...APPROVAL_TERMS, ...QUOTE_ACCEPTED_TERMS, 'instruction', 'registered']) },
  { id: 'approved', label: 'Approved', weight: 60, matcher: (row) => isApprovedApplication(row) && !signalIncludes(row, [...QUOTE_ACCEPTED_TERMS, 'instruction', 'registered']) },
  { id: 'accepted_quote', label: 'Accepted Quote', weight: 80, matcher: (row) => signalIncludes(row, QUOTE_ACCEPTED_TERMS) && !signalIncludes(row, ['instruction', 'registered']) },
  { id: 'instruction_issued', label: 'Instruction Issued', weight: 90, matcher: (row) => isPayableApplication(row) && !signalIncludes(row, REGISTERED_TERMS) },
  { id: 'registered_paid', label: 'Registered / Paid', weight: 100, matcher: (row) => signalIncludes(row, REGISTERED_TERMS) },
])

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

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function firstPositiveNumber(values = []) {
  for (const value of values) {
    const parsed = toNumber(value, Number.NaN)
    if (Number.isFinite(parsed) && parsed > 0) return money(parsed)
  }
  return 0
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

function isBondOriginatorDemoWorkspace(workspaceKey = '') {
  return normalizeText(workspaceKey) === DEV_BYPASS_WORKSPACE_IDS.bond_originator
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

function slugify(value = '') {
  const normalized = normalizeLower(value)
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (normalized.includes('absa')) return 'absa'
  if (normalized.includes('fnb') || normalized.includes('first-national')) return 'fnb'
  if (normalized.includes('nedbank')) return 'nedbank'
  if (normalized.includes('standard')) return 'standard-bank'
  if (normalized.includes('investec')) return 'investec'
  return normalized || 'other'
}

function normalizeConfiguredBank(row = {}, workspaceKey = '') {
  const name = normalizeText(row.name || row.bankName || row.bank_name || row.bank || row.id)
  const id = slugify(row.id || row.bankId || row.bank_id || name)
  return {
    id,
    bankId: id,
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    name: name || normalizeBankName(id),
    status: normalizeLower(row.status || 'active'),
  }
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

function getApplicationBondAmount(row = {}) {
  return firstPositiveNumber([
    row.bondAmount,
    row.bond_amount,
    row.quotedAmount,
    row.quoted_amount,
    row.approvedBondAmount,
    row.approved_bond_amount,
    row.loanAmount,
    row.loan_amount,
    row.purchasePrice,
    row.purchase_price,
    row.salesPrice,
    row.sales_price,
    row.transaction?.bond_amount,
    row.transaction?.quoted_amount,
    row.transaction?.purchase_price,
    row.transaction?.sales_price,
    row.quote?.quoted_amount,
    row.acceptedQuote?.quoted_amount,
    row.application?.bond_amount,
  ])
}

function getExplicitGrossCommission(row = {}) {
  return firstPositiveNumber([
    row.grossCommissionAmount,
    row.gross_commission_amount,
    row.bondCommissionAmount,
    row.bond_commission_amount,
    row.applicationRevenue,
    row.application_revenue,
    row.revenue,
    row.estimatedRevenue,
    row.estimated_revenue,
    row.transaction?.gross_commission_amount,
    row.transaction?.bond_commission_amount,
  ])
}

function getExplicitAgentPayout(row = {}) {
  return firstPositiveNumber([
    row.agentCommissionAmount,
    row.agent_commission_amount,
    row.transaction?.agent_commission_amount,
  ])
}

function getExplicitAgencyPayout(row = {}) {
  return firstPositiveNumber([
    row.agencyCommissionAmount,
    row.agency_commission_amount,
    row.transaction?.agency_commission_amount,
  ])
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
  const configuredBanks = normalizeArray(options.banks || options.configuredBanks || operationalRows.banks).map((row) => normalizeConfiguredBank(row, workspaceKey))
  const scopeContext = isBondOriginatorDemoWorkspace(workspaceKey) && !context.resolvedPermissionContext
    ? {
        ...context,
        resolvedPermissionContext: {
          workspaceId: workspaceKey,
          userId: getActorId(context),
          workspaceRole: 'owner',
          organisationRole: 'owner',
          scopeLevel: 'workspace_hq',
          scopeLevelRaw: 'workspace_hq',
        },
      }
    : context
  const scope = resolveBondOrganisationScope(scopeContext, {
    regions,
    branches,
    consultants,
    applications,
  })
  const configuredRules = [
    ...normalizeArray(options.commissionRules),
    ...normalizeArray(operationalRows.commissionRules),
    ...getLocalRows(LOCAL_RULE_STORE, workspaceKey),
  ].map(normalizeCommissionRule)
  const rules = [
    ...DEFAULT_BOND_COMMISSION_RULES,
    ...configuredRules,
  ].map(normalizeCommissionRule).filter((rule) => isCommissionRuleActive(rule, options.now))
  const raw = {
    workspaceKey,
    scope,
    applications,
    branches,
    regions,
    consultants,
    banks: configuredBanks,
    configuredRules,
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
    banks: rows.banks,
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

function isCommissionRuleActive(rule = {}, nowInput = '') {
  const status = normalizeLower(rule.status)
  if (status === 'inactive' || status === 'expired') return false
  const now = nowInput ? new Date(nowInput) : new Date()
  if (rule.effectiveFrom) {
    const from = new Date(rule.effectiveFrom)
    if (!Number.isNaN(from.getTime()) && from.getTime() > now.getTime()) return false
  }
  if (rule.effectiveTo) {
    const to = new Date(rule.effectiveTo)
    if (!Number.isNaN(to.getTime()) && to.getTime() < now.getTime()) return false
  }
  return true
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

function assertCommissionRuleAccess(rows = {}, context = {}) {
  if (rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || isFinanceRole(context)) return
  const error = new Error('Only HQ and finance managers can manage commission rules.')
  error.code = 'permission_denied'
  throw error
}

function ruleFor(rows = {}, appliesTo = '') {
  const safeAppliesTo = normalizeLower(appliesTo)
  return rows.rules.find((rule) => rule.appliesTo === safeAppliesTo || rule.partyType === safeAppliesTo) ||
    DEFAULT_BOND_COMMISSION_RULES.map(normalizeCommissionRule).find((rule) => rule.appliesTo === safeAppliesTo || rule.partyType === safeAppliesTo)
}

function getPartnerType(row = {}) {
  const signal = normalizeLower(row.partnerType || row.partner_type || row.partyType || row.party_type || row.sourceType || row.source_type || row.developmentId || row.development_id || row.agencyId || row.agency_id)
  if (signal.includes('developer') || signal.includes('development')) return COMMISSION_PARTY_TYPES.developer
  if (signal.includes('agency')) return COMMISSION_PARTY_TYPES.agency
  if (signal.includes('agent')) return COMMISSION_PARTY_TYPES.agent
  return COMMISSION_PARTY_TYPES.partnerReferral
}

function getRuleBaseAmount(rule = {}, bases = {}) {
  const basis = normalizeLower(rule.calculationBasis || rule.calculation_basis)
  if (basis === COMMISSION_CALCULATION_BASES.originatorCommission) return Number(bases.originatorCommission || 0)
  if (basis === COMMISSION_CALCULATION_BASES.fixedAmount || basis === COMMISSION_CALCULATION_BASES.manual) return Number(rule.fixedAmount || rule.rate || 0)
  return Number(bases.grossBondAmount || bases.bondAmount || 0)
}

function calculateCommercialRuleAmount(rule = {}, bases = {}, volume = 0) {
  const normalized = normalizeCommissionRule(rule)
  if (!normalized || normalizeLower(normalized.status) === 'inactive') return 0
  if (normalized.calculationBasis === COMMISSION_CALCULATION_BASES.manual) return money(normalized.fixedAmount || 0)
  const baseAmount = getRuleBaseAmount(normalized, bases)
  if (normalized.type === 'fixed' || normalized.rateType === 'fixed') return money(normalized.fixedAmount || normalized.rate || 0)
  return calculateRuleAmount(normalized, { baseAmount, volume })
}

function getOriginatorGrossCommission(row = {}, rows = {}) {
  if (getRevenueStatus(row) === REVENUE_STATUSES.cancelled) return 0
  const explicit = getExplicitGrossCommission(row)
  if (explicit > 0) return explicit
  const bondAmount = getApplicationBondAmount(row)
  if (!bondAmount) return getApplicationRevenue(row)
  return calculateCommercialRuleAmount(ruleFor(rows, COMMISSION_PARTY_TYPES.originatorCompany), { grossBondAmount: bondAmount, bondAmount })
}

function getPartnerPayout(row = {}, rows = {}, originatorGrossCommission = 0) {
  const explicit = money(getExplicitAgentPayout(row) + getExplicitAgencyPayout(row))
  if (explicit > 0) return explicit
  const bondAmount = getApplicationBondAmount(row)
  const partnerType = getPartnerType(row)
  const rule = ruleFor(rows, partnerType) || ruleFor(rows, COMMISSION_PARTY_TYPES.partnerReferral)
  return calculateCommercialRuleAmount(rule, {
    grossBondAmount: bondAmount,
    bondAmount,
    originatorCommission: originatorGrossCommission,
  })
}

function applicationVolumeForConsultant(rows = {}, consultantId = '') {
  return rows.applications.filter((row) => getApplicationConsultantId(row) === consultantId && isApprovedApplication(row)).length
}

function resolveForecastStage(row = {}) {
  return FORECAST_STAGE_WEIGHTS.find((stage) => stage.matcher(row)) || FORECAST_STAGE_WEIGHTS[0]
}

function buildAttribution(row = {}, rows = {}, options = {}) {
  const applicationId = getApplicationId(row)
  const consultantId = getApplicationConsultantId(row)
  const branchId = getApplicationBranchId(row)
  const regionId = getApplicationRegionId(row)
  const partnerId = getApplicationPartnerId(row)
  const partnerType = getPartnerType(row)
  const bondAmount = getApplicationBondAmount(row)
  const applicationRevenue = getApplicationRevenue(row, options)
  const originatorGrossCommission = getOriginatorGrossCommission(row, rows)
  const consultantVolume = applicationVolumeForConsultant(rows, consultantId)
  const commercialBases = { grossBondAmount: bondAmount, bondAmount, originatorCommission: originatorGrossCommission }
  const consultantCommission = calculateCommercialRuleAmount(ruleFor(rows, COMMISSION_PARTY_TYPES.consultant), commercialBases, consultantVolume)
  const branchCommission = calculateCommercialRuleAmount(ruleFor(rows, COMMISSION_PARTY_TYPES.branch), commercialBases)
  const regionalCommission = calculateCommercialRuleAmount(ruleFor(rows, COMMISSION_PARTY_TYPES.region), commercialBases)
  const referralFee = getPartnerPayout(row, rows, originatorGrossCommission)
  const bankIncentive = calculateCommercialRuleAmount(ruleFor(rows, COMMISSION_PARTY_TYPES.bank), commercialBases)
  const revenueStatus = getRevenueStatus(row)
  const totalCosts = consultantCommission + branchCommission + regionalCommission + referralFee + bankIncentive
  const netProfit = money(originatorGrossCommission - totalCosts)
  return {
    id: applicationId,
    applicationId,
    applicationReference: normalizeText(row.applicationReference || row.application_reference || applicationId),
    clientName: normalizeText(row.clientName || row.client_name || row.buyerName || row.buyer_name || row.buyer?.name || row.transaction?.buyer_name) || 'Client pending',
    consultantId,
    consultantName: getApplicationConsultantName(row),
    branchId,
    branchName: normalizeText(row.branchName || row.branch_name || labelForBranch(rows, branchId)),
    regionId,
    regionName: normalizeText(row.regionName || row.region_name || labelForRegion(rows, regionId)),
    partnerId,
    partnerName: getApplicationPartnerName(row),
    partnerType,
    bank: getBankValuesForApplication(row)[0],
    bondAmount,
    grossBondAmount: bondAmount,
    originatorGrossCommission,
    grossCommission: originatorGrossCommission,
    companyCommissionReceived: revenueStatus === REVENUE_STATUSES.paid ? originatorGrossCommission : 0,
    applicationRevenue,
    consultantCommission,
    branchCommission,
    regionalCommission,
    referralFee,
    partnerPayout: referralFee,
    bankIncentive,
    revenueStatus,
    profit: netProfit,
    netProfit,
    margin: originatorGrossCommission ? percent(netProfit, originatorGrossCommission) : 0,
    date: dateValue(row),
    stage: resolveForecastStage(row).label,
    forecastWeight: resolveForecastStage(row).weight,
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
  const status = normalizePayoutStatus(row.status || row.statusKey || row.status_key || PAYOUT_STATUSES.pending)
  const invoiceStatus = normalizeInvoiceStatus(row.invoiceStatus || row.invoice_status)
  return {
    id: normalizeText(row.id) || createId('payout'),
    organisationId: normalizeText(row.organisationId || row.organisation_id || workspaceKey),
    applicationId: normalizeText(row.applicationId || row.application_id),
    payeeType: normalizeText(row.payeeType || row.payee_type || row.partyType || row.party_type || 'consultant'),
    payeeId: normalizeText(row.payeeId || row.payee_id),
    payeeName: normalizeText(row.payeeName || row.payee_name || row.name),
    branchId: normalizeText(row.branchId || row.branch_id),
    regionId: normalizeText(row.regionId || row.region_id),
    bondAmount: money(row.bondAmount || row.bond_amount),
    grossCommission: money(row.grossCommission || row.gross_commission),
    consultantCommission: money(row.consultantCommission || row.consultant_commission),
    partnerPayout: money(row.partnerPayout || row.partner_payout),
    netProfit: money(row.netProfit || row.net_profit),
    amount: money(row.amount),
    status,
    statusKey: payoutStatusKey(status),
    invoiceStatus,
    paymentReference: normalizeText(row.paymentReference || row.payment_reference),
    paymentDate: normalizeText(row.paymentDate || row.payment_date),
    notes: normalizeText(row.notes),
    workflowStage: normalizeText(row.workflowStage || row.workflow_stage || 'Calculated'),
    managerApprovedAt: normalizeText(row.managerApprovedAt || row.manager_approved_at),
    financeApprovedAt: normalizeText(row.financeApprovedAt || row.finance_approved_at),
    paidAt: normalizeText(row.paidAt || row.paid_at),
    createdAt: normalizeText(row.createdAt || row.created_at) || new Date().toISOString(),
    auditTrail: normalizeArray(row.auditTrail || row.audit_trail),
  }
}

function normalizePayoutStatus(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  if (normalized === PAYOUT_STATUS_KEYS.readyToPay || normalized === 'ready' || normalized === 'payable') return PAYOUT_STATUSES.readyToPay
  if (normalized === PAYOUT_STATUS_KEYS.approved) return PAYOUT_STATUSES.approved
  if (normalized === PAYOUT_STATUS_KEYS.invoiced || normalized === 'processing') return PAYOUT_STATUSES.invoiced
  if (normalized === PAYOUT_STATUS_KEYS.paid) return PAYOUT_STATUSES.paid
  if (normalized === PAYOUT_STATUS_KEYS.onHold || normalized === 'hold' || normalized === 'on_hold') return PAYOUT_STATUSES.onHold
  if (normalized === PAYOUT_STATUS_KEYS.cancelled || normalized === 'canceled' || normalized === 'rejected') return PAYOUT_STATUSES.cancelled
  return PAYOUT_STATUSES.pending
}

function payoutStatusKey(value = '') {
  const status = normalizePayoutStatus(value)
  if (status === PAYOUT_STATUSES.readyToPay) return PAYOUT_STATUS_KEYS.readyToPay
  if (status === PAYOUT_STATUSES.approved) return PAYOUT_STATUS_KEYS.approved
  if (status === PAYOUT_STATUSES.invoiced || status === PAYOUT_STATUSES.processing) return PAYOUT_STATUS_KEYS.invoiced
  if (status === PAYOUT_STATUSES.paid) return PAYOUT_STATUS_KEYS.paid
  if (status === PAYOUT_STATUSES.onHold) return PAYOUT_STATUS_KEYS.onHold
  if (status === PAYOUT_STATUSES.cancelled || status === PAYOUT_STATUSES.rejected) return PAYOUT_STATUS_KEYS.cancelled
  return PAYOUT_STATUS_KEYS.pending
}

function normalizeInvoiceStatus(value = '') {
  const normalized = normalizeLower(value).replace(/[\s-]+/g, '_')
  return Object.values(INVOICE_STATUSES).includes(normalized) ? normalized : INVOICE_STATUSES.notInvoiced
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
    bondValue: sum(items, (row) => row.bondAmount),
    revenue: sum(items, (row) => row.originatorGrossCommission),
    commissions: sum(items, (row) => row.consultantCommission + row.branchCommission + row.regionalCommission),
    referralFees: sum(items, (row) => row.referralFee),
    bankIncentives: sum(items, (row) => row.bankIncentive),
    bonuses: 0,
    profit: sum(items, (row) => row.profit),
    margin: percent(sum(items, (row) => row.profit), sum(items, (row) => row.originatorGrossCommission)),
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
  return getPartnerPayout(application, rows, getOriginatorGrossCommission(application, rows))
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
  const kpis = getRevenueKpis(context, options)
  const payoutCentre = getPayoutCentre(context, options)
  const scopedProfitVisible = rows.scope.scopeLevel !== BOND_ORGANISATION_LEVELS.consultant
  return {
    scope: rows.scope,
    permissions: {
      canManagePayouts: rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || isFinanceRole(context),
      canIssueBonuses: rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || isFinanceRole(context),
      canGenerateStatements: true,
      canViewCompanyProfit: scopedProfitVisible,
      canManageCommissionRules: rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.hq || isFinanceRole(context),
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
      grossCommissionReceived: kpis.grossCommissionReceived.value,
      consultantCommissions: kpis.consultantCommissions.value,
      partnerPayouts: kpis.partnerPayouts.value,
      netProfit: scopedProfitVisible ? kpis.netProfit.value : null,
      pendingPayouts: kpis.pendingPayouts.value,
      marginPercent: scopedProfitVisible ? kpis.marginPercent.value : null,
    },
    kpis,
    revenueFlow: getRevenueFlow(context, options),
    commissionRules: getCommissionRules(context, options),
    attribution: attributions,
    revenueAttribution: getRevenueAttribution(context, options),
    consultantEarnings: getConsultantCommission(null, context, options).rows,
    branchRevenue: getBranchRevenue(context, options),
    regionalRevenue: getRegionalRevenue(context, options),
    partnerRevenue: getPartnerRevenue(context, options),
    bankRevenue: getBankRevenue(context, options),
    profitability: getProfitability(context, options),
    forecast: getRevenueForecast(context, options),
    weightedForecast: getRevenueForecast(context, options),
    rankings: getCommercialRankings(context, options),
    payouts: buildPayoutRows(rows, attributions),
    payoutCentre,
    activityFeed: getLocalRows(LOCAL_ACTIVITY_STORE, rows.workspaceKey),
    paidPayouts,
    hasConfiguredCommissionRules: rows.configuredRules.some((rule) => isCommissionRuleActive(rule, options.now)),
  }
}

function periodRows(attributions = [], now = new Date(), minDays = 0, maxDays = 30) {
  return attributions.filter((row) => {
    const value = new Date(row.date || '')
    if (Number.isNaN(value.getTime())) return minDays === 0
    const age = (now.getTime() - value.getTime()) / (24 * 60 * 60 * 1000)
    return age >= minDays && age < maxDays
  })
}

function trendFor(current = 0, previous = 0) {
  if (!previous) return current ? '+100%' : 'No change'
  const delta = Math.round(((current - previous) / previous) * 100)
  return `${delta >= 0 ? '+' : ''}${delta}%`
}

export function getRevenueKpis(context = {}, options = {}) {
  const { rows, attributions } = attributionRows(context, options)
  const now = options.now ? new Date(options.now) : new Date()
  const current = periodRows(attributions, now, 0, 30)
  const previous = periodRows(attributions, now, 30, 60)
  const paid = attributions.filter((row) => row.revenueStatus === REVENUE_STATUSES.paid)
  const pendingPayoutRows = getPayoutCentre(context, options).rows.filter((row) => [PAYOUT_STATUS_KEYS.pending, PAYOUT_STATUS_KEYS.readyToPay, PAYOUT_STATUS_KEYS.approved].includes(row.statusKey))
  const values = {
    grossCommissionReceived: sum(paid.length ? paid : current, (row) => row.originatorGrossCommission),
    consultantCommissions: sum(current, (row) => row.consultantCommission + row.branchCommission + row.regionalCommission),
    partnerPayouts: sum(current, (row) => row.partnerPayout),
    netProfit: sum(current, (row) => row.netProfit),
    pendingPayouts: sum(pendingPayoutRows, (row) => row.amount),
    marginPercent: percent(sum(current, (row) => row.netProfit), sum(current, (row) => row.originatorGrossCommission)),
  }
  const previousValues = {
    grossCommissionReceived: sum(previous, (row) => row.originatorGrossCommission),
    consultantCommissions: sum(previous, (row) => row.consultantCommission + row.branchCommission + row.regionalCommission),
    partnerPayouts: sum(previous, (row) => row.partnerPayout),
    netProfit: sum(previous, (row) => row.netProfit),
    pendingPayouts: 0,
    marginPercent: percent(sum(previous, (row) => row.netProfit), sum(previous, (row) => row.originatorGrossCommission)),
  }
  return Object.fromEntries(Object.entries(values).map(([key, value]) => ([
    key,
    {
      key,
      value: rows.scope.scopeLevel === BOND_ORGANISATION_LEVELS.consultant && ['grossCommissionReceived', 'partnerPayouts', 'netProfit', 'marginPercent'].includes(key) ? null : value,
      trend: trendFor(value, previousValues[key]),
    },
  ])))
}

export function getRevenueFlow(context = {}, options = {}) {
  const { attributions } = attributionRows(context, options)
  const totalBondAmount = sum(attributions, (row) => row.bondAmount)
  const grossCommission = sum(attributions, (row) => row.originatorGrossCommission)
  const consultantCommissions = sum(attributions, (row) => row.consultantCommission + row.branchCommission + row.regionalCommission)
  const partnerPayouts = sum(attributions, (row) => row.partnerPayout)
  const netProfit = sum(attributions, (row) => row.netProfit)
  return {
    nodes: [
      { key: 'bond_amount', label: 'Total Bond Amount', amount: totalBondAmount, applications: attributions.length },
      { key: 'bank_commission_received', label: 'Bank Commission Received', amount: grossCommission, applications: attributions.filter((row) => row.revenueStatus !== REVENUE_STATUSES.pending).length },
      { key: 'originator_gross_revenue', label: 'Originator Gross Revenue', amount: grossCommission, applications: attributions.length },
      { key: 'consultant_commissions', label: 'Consultant Commissions', amount: consultantCommissions, applications: attributions.filter((row) => row.consultantCommission > 0).length },
      { key: 'partner_payouts', label: 'Partner / Agent Payouts', amount: partnerPayouts, applications: attributions.filter((row) => row.partnerPayout > 0).length },
      { key: 'net_profit', label: 'Net Profit', amount: netProfit, applications: attributions.length },
    ],
    rates: {
      averageOriginatorRate: totalBondAmount ? Math.round((grossCommission / totalBondAmount) * 10000) / 100 : null,
      averageConsultantSplit: grossCommission ? Math.round((consultantCommissions / grossCommission) * 10000) / 100 : null,
      averagePartnerRate: totalBondAmount ? Math.round((partnerPayouts / totalBondAmount) * 10000) / 100 : null,
    },
  }
}

export function getCommissionRules(context = {}, options = {}) {
  const rows = getRows(context, options)
  assertRevenueAccess(rows, context)
  return rows.rules.map((rule) => ({
    id: rule.id,
    name: rule.name,
    partyType: rule.partyType || rule.appliesTo,
    partyId: rule.partyId,
    partyName: rule.appliesToLabel || rule.name,
    calculationBasis: rule.calculationBasis,
    rate: rule.rate || rule.percentage || rule.fixedAmount,
    rateType: rule.rateType || rule.type,
    type: rule.type,
    percentage: rule.percentage,
    fixedAmount: rule.fixedAmount,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    status: rule.status,
    isDefault: rule.isDefault,
  }))
}

export function createCommissionRule(payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertRevenueAccess(rows, context)
  assertCommissionRuleAccess(rows, context)
  const rule = normalizeCommissionRule({
    ...payload,
    id: payload.id || createId('commission-rule'),
    name: payload.name || payload.ruleName || payload.partyName || 'Commission Rule',
    appliesToLabel: payload.appliesToLabel || payload.partyName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  setLocalRows(LOCAL_RULE_STORE, rows.workspaceKey, [rule, ...getLocalRows(LOCAL_RULE_STORE, rows.workspaceKey)])
  recordActivity(rows.workspaceKey, {
    eventType: BOND_REVENUE_EVENTS.commissionRuleSaved,
    sourceType: 'commission_rule',
    sourceId: rule.id,
    actorUserId: getActorId(context),
    newValue: rule,
  })
  return rule
}

export function updateCommissionRule(id = '', payload = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertRevenueAccess(rows, context)
  assertCommissionRuleAccess(rows, context)
  const safeId = normalizeText(id)
  const current = getLocalRows(LOCAL_RULE_STORE, rows.workspaceKey).map(normalizeCommissionRule)
  const existing = current.find((row) => row.id === safeId)
  if (!existing) throwNotFound('Commission rule not found.')
  const updated = normalizeCommissionRule({
    ...existing,
    ...payload,
    id: existing.id,
    name: payload.name || payload.ruleName || payload.partyName || existing.name,
    appliesToLabel: payload.appliesToLabel || payload.partyName || existing.appliesToLabel,
    updatedAt: new Date().toISOString(),
  })
  setLocalRows(LOCAL_RULE_STORE, rows.workspaceKey, current.map((row) => (row.id === existing.id ? updated : row)))
  recordActivity(rows.workspaceKey, {
    eventType: BOND_REVENUE_EVENTS.commissionRuleSaved,
    sourceType: 'commission_rule',
    sourceId: updated.id,
    actorUserId: getActorId(context),
    previousValue: existing,
    newValue: updated,
  })
  return updated
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
      bondValue: sum(rows, (row) => row.bondAmount),
      revenueGenerated: sum(rows, (row) => row.originatorGrossCommission),
      commissionEarned: sum(rows, (row) => row.consultantCommission),
      commissionPaid: sum(rows.filter((row) => row.revenueStatus === REVENUE_STATUSES.paid), (row) => row.consultantCommission),
      commissionOutstanding: sum(rows.filter((row) => row.revenueStatus !== REVENUE_STATUSES.paid), (row) => row.consultantCommission),
    },
    rows: rollups,
    applications: rows.map((row) => ({
      application: row.applicationReference,
      bondAmount: row.bondAmount,
      revenue: row.originatorGrossCommission,
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
      partnerType: attributions.find((item) => (item.partnerId || item.partnerName) === row.key)?.partnerType || COMMISSION_PARTY_TYPES.partnerReferral,
      applicationsSent: row.applications,
      bondValue: sum(attributions.filter((item) => (item.partnerId || item.partnerName) === row.key), (item) => item.bondAmount),
      revenueGenerated: row.revenue,
      approvalRevenue: sum(attributions.filter((item) => (item.partnerId || item.partnerName) === row.key && item.revenueStatus !== REVENUE_STATUSES.pending), (item) => item.applicationRevenue),
      lifetimeValue: row.revenue,
      payoutRate: row.revenue ? Math.round((row.referralFees / Math.max(1, sum(attributions.filter((item) => (item.partnerId || item.partnerName) === row.key), (item) => item.bondAmount))) * 10000) / 100 : 0,
      payoutAmount: row.referralFees,
      status: row.referralFees > 0 ? PAYOUT_STATUSES.pending : 'No payout',
    }))
}

export function getBankRevenue(context = {}, options = {}) {
  const { rows, attributions } = attributionRows(context, options)
  const configuredBanks = rows.banks.filter((bank) => normalizeLower(bank.status) !== 'inactive')
  const observedBankNames = [...new Set(attributions.map((row) => row.bank).filter(Boolean))]
  const bankRows = configuredBanks.length
    ? configuredBanks
    : observedBankNames.map((name) => normalizeConfiguredBank({ id: name, name }, rows.workspaceKey))
  return bankRows.map((bank) => {
    const items = attributions.filter((row) => slugify(row.bank) === bank.id || normalizeLower(row.bank) === normalizeLower(bank.name))
    return {
      id: bank.id,
      bank: bank.name,
      applications: items.length,
      bondValue: sum(items, (row) => row.bondAmount),
      revenue: sum(items, (row) => row.originatorGrossCommission),
      grossCommission: sum(items, (row) => row.originatorGrossCommission),
      approvalRevenue: sum(items.filter((row) => row.revenueStatus !== REVENUE_STATUSES.pending), (row) => row.originatorGrossCommission),
      instructionRevenue: sum(items.filter((row) => row.revenueStatus === REVENUE_STATUSES.payable || row.revenueStatus === REVENUE_STATUSES.paid), (row) => row.originatorGrossCommission),
      bankIncentives: sum(items, (row) => row.bankIncentive),
      profit: sum(items, (row) => row.profit),
    }
  }).sort((left, right) => right.revenue - left.revenue)
}

export function getProfitability(context = {}, options = {}) {
  const { attributions } = attributionRows(context, options)
  const base = {
    bondValue: sum(attributions, (row) => row.bondAmount),
    revenue: sum(attributions, (row) => row.originatorGrossCommission),
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
  const stageRows = FORECAST_STAGE_WEIGHTS.map((stage) => {
    const items = attributions.filter((row) => row.stage === stage.label || resolveForecastStage(row).id === stage.id)
    const totalBondAmount = sum(items, (row) => row.bondAmount)
    const expectedRevenue = money(sum(items, (row) => row.originatorGrossCommission) * (stage.weight / 100))
    return {
      id: stage.id,
      pipelineStage: stage.label,
      periodDays: stage.weight === 100 ? 365 : stage.weight,
      applications: items.length,
      expectedApplications: items.length,
      totalBondAmount,
      bondAmount: totalBondAmount,
      weight: stage.weight,
      expectedRevenue,
      expectedCommission: money(sum(items, (row) => row.consultantCommission) * (stage.weight / 100)),
      expectedProfit: money(sum(items, (row) => row.netProfit) * (stage.weight / 100)),
    }
  })
  const total = {
    id: 'total',
    pipelineStage: 'Total / Weighted Forecast',
    periodDays: 0,
    applications: sum(stageRows, (row) => row.applications),
    expectedApplications: sum(stageRows, (row) => row.applications),
    totalBondAmount: sum(stageRows, (row) => row.totalBondAmount),
    bondAmount: sum(stageRows, (row) => row.totalBondAmount),
    weight: null,
    expectedRevenue: sum(stageRows, (row) => row.expectedRevenue),
    expectedCommission: sum(stageRows, (row) => row.expectedCommission),
    expectedProfit: sum(stageRows, (row) => row.expectedProfit),
  }
  return [...stageRows, total]
}

export function getRevenueAttribution(context = {}, options = {}) {
  const { attributions } = attributionRows(context, options)
  const consultantShare = sum(attributions, (row) => row.consultantCommission + row.branchCommission + row.regionalCommission)
  const agentAgencyShare = sum(attributions.filter((row) => [COMMISSION_PARTY_TYPES.agent, COMMISSION_PARTY_TYPES.agency, COMMISSION_PARTY_TYPES.partnerReferral].includes(row.partnerType)), (row) => row.partnerPayout)
  const developerShare = sum(attributions.filter((row) => row.partnerType === COMMISSION_PARTY_TYPES.developer), (row) => row.partnerPayout)
  const companyShare = sum(attributions, (row) => row.netProfit)
  const total = consultantShare + agentAgencyShare + developerShare + companyShare
  return [
    { key: 'consultants', label: 'Consultants', amount: consultantShare, percentage: percent(consultantShare, total) },
    { key: 'agents_agencies', label: 'Agents / Agencies', amount: agentAgencyShare, percentage: percent(agentAgencyShare, total) },
    { key: 'developers', label: 'Developers', amount: developerShare, percentage: percent(developerShare, total) },
    { key: 'company_share', label: 'Internal Company Share', amount: companyShare, percentage: percent(companyShare, total) },
  ]
}

export function getPayoutCentre(context = {}, options = {}) {
  const { rows, attributions } = attributionRows(context, options)
  const materialized = materializePayouts(rows, options)
  const byId = new Map(materialized.map((row) => [row.applicationId || `${row.payeeType}-${row.payeeId}`, row]))
  const generated = attributions.flatMap((row) => {
    const consultantAmount = money(row.consultantCommission + row.branchCommission + row.regionalCommission)
    const rowsForApplication = []
    if (consultantAmount > 0) {
      rowsForApplication.push(normalizePayout({
        id: `payout-${row.applicationId}-consultant`,
        applicationId: row.applicationId,
        payeeType: COMMISSION_PARTY_TYPES.consultant,
        payeeId: row.consultantId,
        payeeName: row.consultantName,
        branchId: row.branchId,
        regionId: row.regionId,
        bondAmount: row.bondAmount,
        grossCommission: row.originatorGrossCommission,
        consultantCommission: consultantAmount,
        partnerPayout: row.partnerPayout,
        netProfit: row.netProfit,
        amount: consultantAmount,
        status: row.revenueStatus === REVENUE_STATUSES.payable ? PAYOUT_STATUSES.readyToPay : PAYOUT_STATUSES.pending,
        workflowStage: row.revenueStatus === REVENUE_STATUSES.payable ? 'Ready to Pay' : 'Pending Approval',
      }, rows.workspaceKey))
    }
    if (row.partnerPayout > 0) {
      rowsForApplication.push(normalizePayout({
        id: `payout-${row.applicationId}-partner`,
        applicationId: row.applicationId,
        payeeType: row.partnerType,
        payeeId: row.partnerId,
        payeeName: row.partnerName,
        branchId: row.branchId,
        regionId: row.regionId,
        bondAmount: row.bondAmount,
        grossCommission: row.originatorGrossCommission,
        consultantCommission: consultantAmount,
        partnerPayout: row.partnerPayout,
        netProfit: row.netProfit,
        amount: row.partnerPayout,
        status: row.revenueStatus === REVENUE_STATUSES.payable ? PAYOUT_STATUSES.readyToPay : PAYOUT_STATUSES.pending,
        invoiceStatus: INVOICE_STATUSES.notInvoiced,
        workflowStage: row.revenueStatus === REVENUE_STATUSES.payable ? 'Ready to Pay' : 'Invoice Pending',
      }, rows.workspaceKey))
    }
    return rowsForApplication.map((payout) => ({
      ...payout,
      application: row.applicationReference,
      client: row.clientName,
      grossCommission: row.originatorGrossCommission,
      consultantCommission: consultantAmount,
      partnerPayout: row.partnerPayout,
      netProfit: row.netProfit,
    }))
  })
  const localIds = new Set(materialized.map((row) => row.id))
  const merged = [
    ...materialized.map((row) => {
      const attribution = attributions.find((item) => item.applicationId === row.applicationId)
      return {
        ...row,
        application: attribution?.applicationReference || row.applicationId || row.payeeName,
        client: attribution?.clientName || '',
        grossCommission: row.grossCommission || attribution?.originatorGrossCommission || 0,
        consultantCommission: row.consultantCommission || attribution?.consultantCommission || 0,
        partnerPayout: row.partnerPayout || attribution?.partnerPayout || 0,
        netProfit: row.netProfit || attribution?.netProfit || 0,
      }
    }),
    ...generated.filter((row) => !localIds.has(row.id) && !byId.has(row.applicationId || `${row.payeeType}-${row.payeeId}`)),
  ].sort((left, right) => right.amount - left.amount)
  return {
    rows: merged,
    tabs: [
      { key: PAYOUT_STATUS_KEYS.readyToPay, label: 'Ready to Pay', count: merged.filter((row) => row.statusKey === PAYOUT_STATUS_KEYS.readyToPay).length },
      { key: PAYOUT_STATUS_KEYS.pending, label: 'Pending Approval', count: merged.filter((row) => row.statusKey === PAYOUT_STATUS_KEYS.pending).length },
      { key: PAYOUT_STATUS_KEYS.invoiced, label: 'Invoiced', count: merged.filter((row) => row.statusKey === PAYOUT_STATUS_KEYS.invoiced).length },
      { key: PAYOUT_STATUS_KEYS.paid, label: 'Paid', count: merged.filter((row) => row.statusKey === PAYOUT_STATUS_KEYS.paid).length },
      { key: PAYOUT_STATUS_KEYS.onHold, label: 'On Hold', count: merged.filter((row) => row.statusKey === PAYOUT_STATUS_KEYS.onHold).length },
    ],
    summary: {
      totalReadyToPay: sum(merged.filter((row) => row.statusKey === PAYOUT_STATUS_KEYS.readyToPay), (row) => row.amount),
      pendingApproval: sum(merged.filter((row) => row.statusKey === PAYOUT_STATUS_KEYS.pending), (row) => row.amount),
      overduePayouts: sum(merged.filter((row) => row.statusKey === PAYOUT_STATUS_KEYS.pending && isOverdue(row)), (row) => row.amount),
    },
  }
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

export function updatePayoutStatus(payoutId = '', status = PAYOUT_STATUSES.pending, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertPayoutAccess(rows, context)
  const current = materializePayouts(rows, options)
  let existing = current.find((row) => row.id === payoutId)
  if (!existing) {
    existing = getPayoutCentre(context, options).rows.find((row) => row.id === payoutId)
  }
  if (!existing) throwNotFound('Payout not found.')
  const normalizedStatus = normalizePayoutStatus(status)
  const updated = normalizePayout({
    ...existing,
    status: normalizedStatus,
    workflowStage: payoutWorkflowStage(normalizedStatus),
    invoiceStatus: normalizedStatus === PAYOUT_STATUSES.invoiced ? INVOICE_STATUSES.invoiceReceived : existing.invoiceStatus,
    paidAt: normalizedStatus === PAYOUT_STATUSES.paid ? new Date().toISOString() : existing.paidAt,
    paymentDate: normalizedStatus === PAYOUT_STATUSES.paid ? new Date().toISOString() : existing.paymentDate,
    auditTrail: [...existing.auditTrail, { action: payoutStatusKey(normalizedStatus), actorUserId: getActorId(context), at: new Date().toISOString() }],
  }, rows.workspaceKey)
  setLocalRows(LOCAL_PAYOUT_STORE, rows.workspaceKey, [updated, ...getLocalRows(LOCAL_PAYOUT_STORE, rows.workspaceKey).filter((row) => row.id !== payoutId)])
  recordActivity(rows.workspaceKey, {
    eventType: normalizedStatus === PAYOUT_STATUSES.paid ? BOND_REVENUE_EVENTS.payoutPaid : BOND_REVENUE_EVENTS.payoutApproved,
    sourceType: 'payout',
    sourceId: payoutId,
    actorUserId: getActorId(context),
    previousValue: existing,
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

function payoutWorkflowStage(status = '') {
  const normalized = normalizePayoutStatus(status)
  if (normalized === PAYOUT_STATUSES.readyToPay) return 'Ready to Pay'
  if (normalized === PAYOUT_STATUSES.approved) return 'Finance Approved'
  if (normalized === PAYOUT_STATUSES.invoiced) return 'Invoice Received'
  if (normalized === PAYOUT_STATUSES.paid) return 'Paid'
  if (normalized === PAYOUT_STATUSES.onHold) return 'On Hold'
  if (normalized === PAYOUT_STATUSES.cancelled) return 'Cancelled'
  return 'Pending Approval'
}

function isOverdue(row = {}) {
  const date = new Date(row.createdAt || '')
  if (Number.isNaN(date.getTime())) return false
  return Date.now() - date.getTime() > 14 * 24 * 60 * 60 * 1000
}

export function calculateApplicationCommissions(applicationOrId = {}, context = {}, options = {}) {
  const rows = getRows(context, options)
  assertRevenueAccess(rows, context)
  const application = typeof applicationOrId === 'string'
    ? rows.applications.find((row) => getApplicationId(row) === applicationOrId)
    : applicationOrId
  if (!application) throwNotFound('Application not found.')
  return buildAttribution(application, rows, options)
}

export function calculateConsultantCommission(applicationOrId = {}, context = {}, options = {}) {
  return calculateApplicationCommissions(applicationOrId, context, options).consultantCommission
}

export function calculatePartnerPayout(applicationOrId = {}, context = {}, options = {}) {
  return calculateApplicationCommissions(applicationOrId, context, options).partnerPayout
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
