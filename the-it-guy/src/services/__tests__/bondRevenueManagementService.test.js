/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const workspaceId = 'workspace-bond-revenue'
const now = '2026-06-04T08:00:00.000Z'

function makeContext({
  userId = 'user-hq',
  workspaceRole = 'hq_manager',
  scopeLevel = 'workspace_hq',
  regionId = '',
  branchId = '',
} = {}) {
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
  }
}

function app(index, overrides = {}) {
  return {
    id: `app-rev-${index}`,
    applicationReference: `REV-${index}`,
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
    applicationRevenue: overrides.applicationRevenue ?? 10000,
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
  app(1, { applicationRevenue: 10000, revenueStatus: 'Payable', bank: 'FNB' }),
  app(2, { applicationRevenue: 12000, revenueStatus: 'Approved', bank: 'FNB' }),
  app(3, { consultantId: 'consultant-sarah', consultantName: 'Sarah Jacobs', branchId: 'branch-west', branchName: 'Johannesburg Branch', applicationRevenue: 15000, bank: 'ABSA', partnerId: 'partner-jhb', partnerName: 'Johannesburg Estates' }),
  app(4, { consultantId: 'consultant-lindi', consultantName: 'Lindi Mokoena', branchId: 'branch-coast', branchName: 'Atlantic Branch', regionId: 'region-coast', applicationRevenue: 8000, bank: 'Standard Bank', partnerId: 'partner-coast', partnerName: 'Atlantic Realty' }),
  app(5, { consultantId: 'consultant-lindi', consultantName: 'Lindi Mokoena', branchId: 'branch-coast', branchName: 'Atlantic Branch', regionId: 'region-coast', applicationRevenue: 7000, bank: 'Investec', financeStatus: 'submitted to bank', status: 'submitted to bank', approvedAt: '', revenueStatus: 'Pending', partnerId: 'partner-coast', partnerName: 'Atlantic Realty' }),
  app(6, { applicationRevenue: 9000, bank: 'Nedbank', financeStatus: 'declined by bank', status: 'declined by bank', approvedAt: '', revenueStatus: 'Cancelled' }),
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
  assert.equal(calculated.attribution.applicationRevenue, 10000)
  assert.equal(calculated.attribution.consultantCommission, 2000)
  assert.equal(calculated.attribution.branchCommission, 500)
  assert.equal(calculated.attribution.regionalCommission, 200)
  assert.equal(calculated.attribution.referralFee, 1000)
  assert.equal(calculated.attribution.bankIncentive, 100)
  assert.equal(calculated.attribution.revenueStatus, 'Payable')

  const referral = revenue.calculateReferralFee(applications[0], hqContext, commonOptions)
  assert.equal(referral, 1000)

  const bonus = revenue.calculateBonus({
    recipientType: 'consultant',
    recipientId: 'consultant-john',
    amount: 1500,
    metrics: { approvalRate: 90, slaCompliance: 97, revenue: 22000 },
    rule: { type: 'fixed', fixedAmount: 1500, bonusCriteria: { approvalRateTarget: 85, slaTarget: 95 } },
  }, hqContext, commonOptions)
  assert.equal(bonus.amount, 1500)

  const dashboard = revenue.getRevenueDashboard(hqContext, commonOptions)
  assert.equal(dashboard.summary.revenueThisMonth > 0, true)
  assert.equal(dashboard.summary.commissionsPayable > 0, true)
  assert.equal(dashboard.summary.referralFeesPayable > 0, true)
  assert.equal(dashboard.attribution.length, applications.length)

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
  assert.equal(bankRevenue.some((row) => row.bank === 'FNB' && row.revenue === 22000), true)

  const profitability = revenue.getProfitability(hqContext, commonOptions)
  assert.equal(profitability.revenue > 0, true)
  assert.equal(profitability.profit > 0, true)
  assert.equal(profitability.byBank.length > 0, true)

  const forecast = revenue.getRevenueForecast(hqContext, commonOptions)
  assert.deepEqual(forecast.map((row) => row.periodDays), [30, 90, 365])
  assert.equal(forecast[0].expectedRevenue > 0, true)

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

  const activity = revenue.__bondRevenueManagementServiceTestUtils.getActivity(workspaceId)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.commissionCalculated), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.bonusAwarded), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.payoutApproved), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.payoutPaid), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.commissionApproved), true)
  assert.equal(activity.some((row) => row.eventType === revenue.BOND_REVENUE_EVENTS.commissionPaid), true)

  console.log('bond revenue management tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
