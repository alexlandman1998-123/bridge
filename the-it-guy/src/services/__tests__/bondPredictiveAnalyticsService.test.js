/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const workspaceId = 'workspace-bond-predictive'
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
    profile: { id: userId, role: 'bond_originator' },
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
  }
}

function app(index, overrides = {}) {
  return {
    id: `app-predict-${index}`,
    applicationReference: `PRED-${index}`,
    assignedConsultantId: overrides.consultantId || 'consultant-john',
    assignedUserId: overrides.consultantId || 'consultant-john',
    consultantName: overrides.consultantName || 'John Smith',
    assignedBranchId: overrides.branchId || 'branch-east',
    branchId: overrides.branchId || 'branch-east',
    branchName: overrides.branchName || 'East Rand Branch',
    assignedRegionId: overrides.regionId || 'region-gauteng',
    regionId: overrides.regionId || 'region-gauteng',
    partnerId: overrides.partnerId || 'partner-risk',
    partnerName: overrides.partnerName || 'Harcourts Bedfordview',
    bank: overrides.bank || 'FNB',
    suburb: overrides.suburb || 'Bedfordview',
    status: overrides.status || 'submitted to bank feedback pending',
    financeStatus: overrides.financeStatus || 'submitted to bank feedback pending',
    missingDocuments: overrides.missingDocuments ?? 2,
    income: overrides.income ?? 65000,
    bondAmount: overrides.bondAmount ?? 1200000,
    purchasePrice: overrides.purchasePrice ?? 1500000,
    creditScore: overrides.creditScore ?? 715,
    employmentType: overrides.employmentType || 'Permanent',
    applicationRevenue: overrides.applicationRevenue ?? 10000,
    submittedAt: overrides.submittedAt || '2026-05-25T08:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-05-24T08:00:00.000Z',
    createdAt: overrides.createdAt || '2026-05-20T08:00:00.000Z',
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
  { id: 'consultant-john', name: 'John Smith', regionId: 'region-gauteng', branchId: 'branch-east', activeApplications: 43 },
  { id: 'consultant-sarah', name: 'Sarah Jacobs', regionId: 'region-gauteng', branchId: 'branch-west', activeApplications: 12 },
  { id: 'consultant-lindi', name: 'Lindi Mokoena', regionId: 'region-coast', branchId: 'branch-coast', activeApplications: 9 },
]

const applications = [
  app(1),
  app(2, { id: 'app-approved-fnb', status: 'approved instruction sent', financeStatus: 'approved instruction sent', missingDocuments: 0, updatedAt: '2026-06-01T08:00:00.000Z' }),
  app(3, { consultantId: 'consultant-sarah', consultantName: 'Sarah Jacobs', branchId: 'branch-west', branchName: 'Johannesburg Branch', partnerId: 'partner-stable', bank: 'ABSA', status: 'approved instruction sent', financeStatus: 'approved instruction sent', missingDocuments: 0, creditScore: 740 }),
  app(4, { consultantId: 'consultant-lindi', consultantName: 'Lindi Mokoena', branchId: 'branch-coast', branchName: 'Atlantic Branch', regionId: 'region-coast', partnerId: 'partner-coast', bank: 'Nedbank', status: 'declined by bank', financeStatus: 'declined by bank', missingDocuments: 1, creditScore: 590 }),
]

for (let index = 5; index <= 45; index += 1) {
  applications.push(app(index, { id: `app-john-active-${index}`, missingDocuments: index % 3 === 0 ? 1 : 0, updatedAt: '2026-06-01T08:00:00.000Z', submittedAt: '2026-05-30T08:00:00.000Z' }))
}

const documents = [
  { id: 'doc-bank-statement', applicationId: 'app-predict-1', status: 'requested', requestedAt: '2026-05-28T08:00:00.000Z' },
]

const partners = [
  { id: 'partner-risk', name: 'Harcourts Bedfordview', healthScore: 38, portalUsageScore: 30, applicationVolumeTrend: -35 },
  { id: 'partner-stable', name: 'Johannesburg Estates', healthScore: 82, portalUsageScore: 78, applicationVolumeTrend: 5 },
]

const banks = [
  { id: 'FNB', name: 'FNB', averageResponseTime: 12 },
  { id: 'ABSA', name: 'ABSA', averageResponseTime: 5 },
]

const requests = [
  { id: 'request-risk', applicationId: 'app-predict-1', partnerId: 'partner-risk', status: 'escalated complaint', type: 'complaint', createdAt: '2026-05-29T08:00:00.000Z', slaConsumedPercent: 86, responseHours: 36 },
]

const commonOptions = {
  workspaceId,
  now,
  applications,
  documents,
  partners,
  consultants,
  branches,
  regions,
  banks,
  requests,
  revenueTarget: 500000,
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const portal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const predictive = await server.ssrLoadModule('/src/services/bondPredictiveAnalyticsService.js')

  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  predictive.__bondPredictiveAnalyticsServiceTestUtils.clearStores()

  const hqContext = makeContext()
  const applicationRisk = predictive.calculateApplicationRisk(applications[0], hqContext, commonOptions)
  assert.equal(applicationRisk.riskScore >= 51, true)
  assert.equal(['High Risk', 'Critical Risk'].includes(applicationRisk.riskLevel), true)
  assert.equal(applicationRisk.reasons.some((reason) => reason.includes('missing document')), true)

  const approval = predictive.predictApprovalProbability(applications[0], hqContext, commonOptions)
  assert.equal(approval.probabilities.length >= 5, true)
  assert.equal(approval.bestProbability > 0, true)
  assert.equal(Boolean(approval.bestBank), true)

  const sla = predictive.predictSLABreach(requests[0], hqContext, commonOptions)
  assert.equal(sla.probability >= 76, true)
  assert.equal(sla.riskLevel, 'Critical')

  const consultantRisk = predictive.predictConsultantCapacityRisk('consultant-john', hqContext, commonOptions)
  assert.equal(consultantRisk.forecast.map((row) => row.periodDays).join(','), '7,14,30')
  assert.equal(consultantRisk.forecast.some((row) => ['At Risk', 'Critical'].includes(row.riskLevel)), true)

  const branchRisk = predictive.predictBranchCapacityRisk('branch-east', hqContext, commonOptions)
  assert.equal(branchRisk.forecast.map((row) => row.periodDays).join(','), '7,14,30')
  assert.equal(branchRisk.forecast.some((row) => row.requiredHeadcount > 0), true)

  const churn = predictive.predictPartnerChurn('partner-risk', hqContext, commonOptions)
  assert.equal(churn.churnRisk, 'High Risk')
  assert.match(churn.reason, /Partner health|Portal usage|escalation|Application volume/i)

  const revenueRisk = predictive.predictRevenueRisk(hqContext, commonOptions)
  assert.equal(revenueRisk.expectedRevenue > 0, true)
  assert.equal(['Low', 'Medium', 'High', 'Critical'].includes(revenueRisk.riskLevel), true)

  const bank = predictive.predictBankPerformance('FNB', hqContext, commonOptions)
  assert.equal(bank.bank, 'FNB')
  assert.equal(Number.isFinite(bank.responseTimeChange), true)
  assert.equal(['Low', 'Medium', 'High', 'Critical'].includes(bank.riskLevel), true)

  const dashboard = predictive.getPredictiveDashboard(hqContext, commonOptions)
  assert.equal(dashboard.summary.highRiskApplications > 0, true)
  assert.equal(dashboard.applicationRisks.length, applications.length)
  assert.equal(dashboard.approvalProbabilities.length, applications.length)
  assert.equal(dashboard.predictiveTimeline.length > 0, true)
  assert.equal(dashboard.recommendations.length > 0, true)

  const recommendations = predictive.generateRecommendations(hqContext, commonOptions)
  assert.equal(recommendations.some((row) => row.type === 'application'), true)
  assert.equal(recommendations.some((row) => row.type === 'capacity'), true)
  assert.equal(recommendations.some((row) => row.type === 'partner'), true)

  const executive = predictive.getExecutiveRiskDashboard(hqContext, commonOptions)
  assert.equal(executive.highestRiskApplications.length > 0, true)
  assert.equal(executive.highestRiskPartners.length > 0, true)
  assert.equal(executive.highestRiskBanks.length > 0, true)

  const branchContext = makeContext({ userId: 'branch-manager', workspaceRole: 'branch_manager', scopeLevel: 'branch', regionId: 'region-gauteng', branchId: 'branch-east' })
  const branchDashboard = predictive.getPredictiveDashboard(branchContext, commonOptions)
  assert.equal(branchDashboard.applicationRisks.every((row) => row.branchId === 'branch-east'), true)
  const branchView = predictive.getBranchRiskDashboard('branch-east', branchContext, commonOptions)
  assert.equal(branchView.applicationRisk.length > 0, true)

  const regionalContext = makeContext({ userId: 'regional-manager', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-gauteng' })
  const regionalDashboard = predictive.getPredictiveDashboard(regionalContext, commonOptions)
  assert.equal(regionalDashboard.applicationRisks.every((row) => row.regionId === 'region-gauteng'), true)
  const regionalView = predictive.getRegionalRiskDashboard('region-gauteng', regionalContext, commonOptions)
  assert.equal(regionalView.branchRisks.length > 0, true)

  const consultantContext = makeContext({ userId: 'consultant-john', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-gauteng', branchId: 'branch-east' })
  const consultantDashboard = predictive.getPredictiveDashboard(consultantContext, commonOptions)
  assert.equal(consultantDashboard.applicationRisks.every((row) => row.consultantId === 'consultant-john'), true)

  const workspacePrediction = predictive.getApplicationPrediction('app-predict-1', hqContext, commonOptions)
  assert.equal(workspacePrediction.risk.riskScore >= 51, true)
  assert.equal(workspacePrediction.timeline.length, 2)

  const snapshot = predictive.__bondPredictiveAnalyticsServiceTestUtils.recordPrediction({ workspaceKey: workspaceId }, {
    predictionType: 'application_risk',
    entityType: 'application',
    entityId: 'app-predict-1',
    score: 72,
    confidence: 'High Confidence',
    recommendation: 'Follow up within 24h.',
  })
  const feedback = predictive.recordPredictionFeedback(snapshot.id, {
    correct: true,
    expectedOutcome: 'SLA breach avoided',
    actualOutcome: 'SLA breach avoided',
  }, hqContext, commonOptions)
  assert.equal(feedback.accuracy, 100)
  assert.equal(predictive.__bondPredictiveAnalyticsServiceTestUtils.getFeedback(workspaceId).length, 1)
  assert.equal(predictive.__bondPredictiveAnalyticsServiceTestUtils.getHistory(workspaceId).some((row) => row.eventType === predictive.BOND_PREDICTIVE_EVENTS.predictionConfirmed), true)

  const clientContext = makeContext({ userId: 'client-user', workspaceRole: 'client', scopeLevel: 'assigned' })
  assert.throws(
    () => predictive.getPredictiveDashboard(clientContext, commonOptions),
    /access is not permitted/i,
  )

  console.log('bond predictive analytics tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
