/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const workspaceId = 'workspace-bond-revenue'
const now = '2026-05-30T08:00:00.000Z'

function makeContext({
  userId = 'user-hq',
  workspaceRole = 'hq_manager',
  scopeLevel = 'workspace_hq',
  regionId = '',
  branchId = '',
} = {}) {
  const resolvedPermissionContext = {
    userId,
    workspaceId,
    workspaceRole,
    organisationRole: workspaceRole,
    scopeLevel,
    scopeLevelRaw: scopeLevel,
    regionId,
    workspaceUnitId: branchId,
    branchId,
  }
  return {
    role: 'bond_originator',
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    userId,
    profile: { id: userId, email: `${userId}@example.test`, role: 'bond_originator' },
    currentWorkspace: { id: workspaceId, type: 'bond_originator' },
    currentMembership: {
      id: `membership-${userId}`,
      userId,
      user_id: userId,
      organisationId: workspaceId,
      organisation_id: workspaceId,
      workspaceId,
      workspaceType: 'bond_originator',
      workspaceRole,
      workspace_role: workspaceRole,
      organisationRole: workspaceRole,
      organisation_role: workspaceRole,
      scopeLevel,
      scope_level: scopeLevel,
      regionId,
      region_id: regionId,
      branchId,
      branch_id: branchId,
      workspaceUnitId: branchId,
      workspace_unit_id: branchId,
      status: 'active',
    },
    activeMemberships: [],
    resolvedPermissionContext,
  }
}

function app(index, overrides = {}) {
  return {
    id: `app-rev-${index}`,
    applicationReference: `REV-${index}`,
    clientName: overrides.clientName || `Buyer ${index}`,
    assignedConsultantId: overrides.consultantId || 'consultant-john',
    assignedUserId: overrides.consultantId || 'consultant-john',
    consultantName: overrides.consultantName || 'John Smith',
    assignedBranchId: overrides.branchId || 'branch-east',
    branchId: overrides.branchId || 'branch-east',
    branchName: overrides.branchName || 'East Rand Branch',
    assignedRegionId: overrides.regionId || 'region-gauteng',
    regionId: overrides.regionId || 'region-gauteng',
    partnerId: overrides.partnerId || 'partner-harcourts',
    partnerName: overrides.partnerName || 'Harcourts Bedfordview',
    bank: overrides.bank || 'FNB',
    financeStatus: overrides.financeStatus || 'approval submitted instruction sent',
    status: overrides.status || 'approval submitted instruction sent',
    revenueStatus: overrides.revenueStatus || '',
    bondAmount: overrides.bondAmount ?? 2000000,
    grossCommissionAmount: overrides.grossCommissionAmount,
    applicationRevenue: overrides.applicationRevenue,
    partnerType: overrides.partnerType,
    createdAt: overrides.createdAt || '2026-05-01T08:00:00.000Z',
    submittedAt: overrides.submittedAt || '2026-05-02T08:00:00.000Z',
    approvedAt: overrides.approvedAt || '2026-05-05T08:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-05-08T08:00:00.000Z',
  }
}

const regions = [
  { id: 'region-gauteng', name: 'Gauteng' },
  { id: 'region-coast', name: 'Coastal' },
]
const branches = [
  { id: 'branch-east', name: 'East Rand Branch', regionId: 'region-gauteng' },
  { id: 'branch-west', name: 'Johannesburg Branch', regionId: 'region-gauteng' },
  { id: 'branch-coast', name: 'Atlantic Branch', regionId: 'region-coast' },
]
const consultants = [
  { id: 'consultant-john', name: 'John Smith', regionId: 'region-gauteng', branchId: 'branch-east' },
  { id: 'consultant-sarah', name: 'Sarah Jacobs', regionId: 'region-gauteng', branchId: 'branch-west' },
  { id: 'consultant-lindi', name: 'Lindi Mokoena', regionId: 'region-coast', branchId: 'branch-coast' },
]
const applications = [
  app(1, { bondAmount: 2000000, revenueStatus: 'Payable', bank: 'FNB' }),
  app(2, { bondAmount: 1200000, revenueStatus: 'Approved', bank: 'FNB' }),
  app(3, { consultantId: 'consultant-sarah', consultantName: 'Sarah Jacobs', branchId: 'branch-west', branchName: 'Johannesburg Branch', bondAmount: 1500000, bank: 'ABSA', partnerId: 'partner-jhb', partnerName: 'Johannesburg Estates', partnerType: 'agency' }),
  app(4, { consultantId: 'consultant-lindi', consultantName: 'Lindi Mokoena', branchId: 'branch-coast', branchName: 'Atlantic Branch', regionId: 'region-coast', bondAmount: 800000, bank: 'Standard Bank', partnerId: 'partner-coast', partnerName: 'Atlantic Realty' }),
  app(5, { consultantId: 'consultant-lindi', consultantName: 'Lindi Mokoena', branchId: 'branch-coast', branchName: 'Atlantic Branch', regionId: 'region-coast', bondAmount: 700000, bank: 'Investec', financeStatus: 'submitted to bank', status: 'submitted to bank', approvedAt: '', revenueStatus: 'Pending', partnerId: 'partner-coast', partnerName: 'Atlantic Realty' }),
  app(6, { bondAmount: 900000, bank: 'Nedbank', financeStatus: 'declined by bank', status: 'declined by bank', approvedAt: '', revenueStatus: 'Cancelled' }),
]

const commonOptions = {
  workspaceId,
  applications,
  regions,
  branches,
  consultants,
  now,
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const portal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const rules = await server.ssrLoadModule('/src/services/bondCommissionRulesService.js')
  const revenue = await server.ssrLoadModule('/src/services/bondRevenueManagementService.js')

  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  revenue.__bondRevenueManagementServiceTestUtils.clearStores()

  assert.equal(rules.calculateRuleAmount({ type: 'fixed', fixedAmount: 500 }, { baseAmount: 10000 }), 500)
  assert.equal(rules.calculateRuleAmount({ type: 'percentage', percentage: 20 }, { baseAmount: 10000 }), 2000)
  assert.equal(rules.calculateRuleAmount({ type: 'tiered', tiers: [{ from: 0, to: 20, percentage: 20 }, { from: 21, to: 40, percentage: 25 }, { from: 41, to: null, percentage: 30 }] }, { baseAmount: 10000, volume: 30 }), 2500)
  assert.equal(rules.calculateRuleAmount({ type: 'hybrid', fixedAmount: 500, percentage: 10 }, { baseAmount: 10000 }), 1500)
  assert.equal(rules.calculateBonusAmount({ type: 'fixed', fixedAmount: 1000, bonusCriteria: { approvalRateTarget: 85, slaTarget: 95 } }, { metrics: { approvalRate: 90, slaCompliance: 96 } }), 1000)

  const hqContext = makeContext()
  const calculated = revenue.calculateCommission(applications[0], hqContext, commonOptions)
  assert.equal(calculated.attribution.bondAmount, 2000000)
  assert.equal(calculated.attribution.originatorGrossCommission, 39000)
  assert.equal(calculated.attribution.consultantCommission, 13650)
  assert.equal(calculated.attribution.branchCommission, 0)
  assert.equal(calculated.attribution.regionalCommission, 0)
  assert.equal(calculated.attribution.referralFee, 6000)
  assert.equal(calculated.attribution.partnerPayout, 6000)
  assert.equal(calculated.attribution.bankIncentive, 0)
  assert.equal(calculated.attribution.netProfit, 19350)
  assert.equal(calculated.attribution.revenueStatus, 'Payable')

  const referral = revenue.calculateReferralFee(applications[0], hqContext, commonOptions)
  assert.equal(referral, 6000)
  assert.equal(revenue.calculateConsultantCommission(applications[0], hqContext, commonOptions), 13650)
  assert.equal(revenue.calculatePartnerPayout(applications[0], hqContext, commonOptions), 6000)

  const bonus = revenue.calculateBonus({
    recipientType: 'consultant',
    recipientId: 'consultant-john',
    amount: 1500,
    metrics: { approvalRate: 90, slaCompliance: 97, revenue: 22000 },
    rule: { type: 'fixed', fixedAmount: 1500, bonusCriteria: { approvalRateTarget: 85, slaTarget: 95 } },
  }, hqContext, commonOptions)
  assert.equal(bonus.amount, 1500)

  const dashboard = revenue.getRevenueDashboard(hqContext, commonOptions)
  assert.equal(dashboard.summary.grossCommissionReceived > 0, true)
  assert.equal(dashboard.summary.commissionsPayable > 0, true)
  assert.equal(dashboard.summary.referralFeesPayable > 0, true)
  assert.equal(dashboard.summary.netProfit > 0, true)
  assert.equal(dashboard.revenueFlow.nodes.some((row) => row.key === 'net_profit' && row.amount > 0), true)
  assert.equal(dashboard.attribution.length, applications.length)

  const bankRule = revenue.createCommissionRule({
    name: 'FNB bank incentive',
    partyType: 'bank',
    appliesTo: 'bank',
    partyName: 'FNB',
    calculationBasis: 'originator_commission',
    type: 'percentage',
    rate: 2.5,
    percentage: 2.5,
    status: 'active',
    effectiveFrom: '2026-01-01',
  }, hqContext, commonOptions)
  assert.equal(bankRule.partyType, 'bank')
  assert.equal(bankRule.appliesToLabel, 'FNB')
  assert.equal(revenue.getCommissionRules(hqContext, commonOptions).some((row) => row.id === bankRule.id && row.partyName === 'FNB'), true)
  const updatedBankRule = revenue.updateCommissionRule(bankRule.id, { rate: 3, percentage: 3, partyName: 'FNB Premier' }, hqContext, commonOptions)
  assert.equal(updatedBankRule.rate, 3)
  assert.equal(updatedBankRule.appliesToLabel, 'FNB Premier')

  const consultantCommission = revenue.getConsultantCommission('consultant-john', hqContext, commonOptions)
  assert.equal(consultantCommission.summary.applications, 3)
  assert.equal(consultantCommission.summary.commissionEarned > 0, true)

  const branchRevenue = revenue.getBranchRevenue(makeContext({ userId: 'branch-east-manager', workspaceRole: 'branch_manager', scopeLevel: 'branch', regionId: 'region-gauteng', branchId: 'branch-east' }), commonOptions)
  assert.equal(branchRevenue.length, 1)
  assert.equal(branchRevenue[0].branchName, 'East Rand Branch')

  const regionalRevenue = revenue.getRegionalRevenue(makeContext({ userId: 'regional-gauteng', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-gauteng' }), commonOptions)
  assert.equal(regionalRevenue.every((row) => row.regionName === 'Gauteng'), true)

  const partnerRevenue = revenue.getPartnerRevenue(hqContext, commonOptions)
  assert.equal(partnerRevenue.some((row) => row.partnerName === 'Harcourts Bedfordview' && row.referralFees > 0), true)

  const bankRevenue = revenue.getBankRevenue(hqContext, commonOptions)
  assert.equal(bankRevenue.some((row) => row.bank === 'FNB' && row.revenue === 62400), true)
  const configuredBankRevenue = revenue.getBankRevenue(hqContext, { ...commonOptions, banks: [{ id: 'fnb', name: 'FNB' }] })
  assert.deepEqual(configuredBankRevenue.map((row) => row.bank), ['FNB'])

  const profitability = revenue.getProfitability(hqContext, commonOptions)
  assert.equal(profitability.revenue > 0, true)
  assert.equal(profitability.profit > 0, true)
  assert.equal(profitability.byBank.length > 0, true)

  const forecast = revenue.getRevenueForecast(hqContext, commonOptions)
  assert.deepEqual(forecast.map((row) => row.pipelineStage), ['Submitted', 'Approved', 'Accepted Quote', 'Instruction Issued', 'Registered / Paid', 'Total / Weighted Forecast'])
  assert.equal(forecast.find((row) => row.pipelineStage === 'Instruction Issued').weight, 90)
  assert.equal(forecast.find((row) => row.id === 'total').expectedRevenue > 0, true)

  const inactiveDeveloperRule = {
    id: 'inactive-developer',
    partyType: 'developer',
    appliesTo: 'developer',
    calculationBasis: 'gross_bond_amount',
    type: 'percentage',
    percentage: 10,
    rate: 10,
    status: 'inactive',
  }
  const developerPayout = revenue.calculatePartnerPayout(app(20, { partnerType: 'developer', bondAmount: 1000000 }), hqContext, { ...commonOptions, commissionRules: [inactiveDeveloperRule] })
  assert.equal(developerPayout, 4000)

  const payout = dashboard.payouts.find((row) => row.payeeId === 'consultant-john')
  assert.ok(payout)
  const approved = revenue.approvePayout(payout.id, hqContext, commonOptions)
  assert.equal(approved.status, 'Approved')
  assert.equal(approved.workflowStage, 'Finance Approved')
  const paid = revenue.markPayoutPaid(payout.id, hqContext, commonOptions)
  assert.equal(paid.status, 'Paid')
  assert.equal(paid.workflowStage, 'Paid')

  const statement = revenue.generateCommissionStatement('consultant-john', hqContext, { ...commonOptions, period: '2026-06', format: 'Excel' })
  assert.equal(statement.sections.includes('Applications'), true)
  assert.equal(statement.totalPayable > 0, true)
  assert.equal(revenue.__bondRevenueManagementServiceTestUtils.getStatements(workspaceId).length, 1)

  const consultantContext = makeContext({ userId: 'consultant-john', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-gauteng', branchId: 'branch-east' })
  const ownDashboard = revenue.getRevenueDashboard(consultantContext, commonOptions)
  assert.equal(ownDashboard.attribution.every((row) => row.consultantId === 'consultant-john'), true)
  assert.throws(
    () => revenue.approvePayout(payout.id, consultantContext, commonOptions),
    /Only HQ and finance managers/i,
  )
  assert.throws(
    () => revenue.createCommissionRule({ name: 'Consultant override', partyType: 'consultant', rate: 40 }, consultantContext, commonOptions),
    /Only HQ and finance managers/i,
  )

  const activity = revenue.__bondRevenueManagementServiceTestUtils.getActivity(workspaceId)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.commissionCalculated), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.bonusAwarded), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.payoutApproved), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.payoutPaid), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.commissionApproved), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.commissionPaid), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.commissionRuleSaved), true)

  console.log('bond revenue management tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
