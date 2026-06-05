/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

const workspaceId = 'workspace-hq-command-centre'
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

function range(count, factory) {
  return Array.from({ length: count }, (_, index) => factory(index + 1))
}

function makeApplication(consultantId, index, overrides = {}) {
  const branchId = overrides.branchId || 'branch-east'
  const regionId = overrides.regionId || 'region-gauteng'
  return {
    id: `${consultantId}-app-${index}`,
    partnerId: overrides.partnerId || 'partner-gauteng',
    partnerName: overrides.partnerName || 'Harcourts Bedfordview',
    applicationReference: `BO-2026-${consultantId}-${index}`,
    assignedConsultantId: consultantId,
    assignedUserId: consultantId,
    assignedBranchId: branchId,
    branchId,
    workspaceUnitId: branchId,
    assignedRegionId: regionId,
    regionId,
    financeStatus: overrides.financeStatus || 'submitted to bank',
    status: overrides.status || 'submitted',
    stage: overrides.stage || '',
    bank: overrides.bank || 'FNB',
    banksSubmittedTo: overrides.banksSubmittedTo || [overrides.bank || 'FNB'],
    createdAt: overrides.createdAt || '2026-05-01T08:00:00.000Z',
    submittedAt: overrides.submittedAt || '2026-05-02T08:00:00.000Z',
    bankFeedbackAt: overrides.bankFeedbackAt || '2026-05-04T08:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-05-10T08:00:00.000Z',
    missingDocumentsCount: overrides.missingDocumentsCount || 0,
    reassignmentCount: overrides.reassignmentCount || 0,
    estimatedRevenue: overrides.estimatedRevenue || 2500,
  }
}

const partners = [
  { id: 'partner-gauteng', organisationId: workspaceId, name: 'Harcourts Bedfordview', type: 'agency', portalUsageScore: 80 },
  { id: 'partner-west', organisationId: workspaceId, name: 'Johannesburg Estates', type: 'agency', portalUsageScore: 90 },
  { id: 'partner-coast', organisationId: workspaceId, name: 'Atlantic Realty', type: 'developer', portalUsageScore: 75 },
]
const regions = [
  { id: 'region-gauteng', name: 'Gauteng' },
  { id: 'region-coast', name: 'Coastal' },
]
const branches = [
  { id: 'branch-east', name: 'East Rand Branch', regionId: 'region-gauteng', managerName: 'Naledi Maseko', growth: 3 },
  { id: 'branch-west', name: 'Johannesburg Branch', regionId: 'region-gauteng', managerName: 'Peter Naidoo', growth: 12 },
  { id: 'branch-coast', name: 'Atlantic Branch', regionId: 'region-coast', managerName: 'Lindi Mokoena', growth: 5 },
]
const consultants = [
  { id: 'consultant-john', name: 'John Smith', regionId: 'region-gauteng', branchId: 'branch-east', status: 'active' },
  { id: 'consultant-sarah', name: 'Sarah Jacobs', regionId: 'region-gauteng', branchId: 'branch-east', status: 'active' },
  { id: 'consultant-peter', name: 'Peter Jacobs', regionId: 'region-gauteng', branchId: 'branch-west', status: 'active' },
  { id: 'consultant-lindi', name: 'Lindi Mokoena', regionId: 'region-coast', branchId: 'branch-coast', status: 'active' },
  { id: 'consultant-inactive', name: 'Inactive Consultant', regionId: 'region-coast', branchId: 'branch-coast', status: 'inactive' },
]
const applications = [
  ...range(42, (index) => makeApplication('consultant-john', index, {
    financeStatus: index <= 4 ? 'approval submitted instruction sent' : index <= 12 ? 'awaiting documents' : index <= 18 ? 'awaiting submission' : 'submitted to bank feedback received',
    status: index <= 4 ? 'approval submitted instruction sent' : index <= 12 ? 'awaiting documents' : index <= 18 ? 'awaiting submission' : 'submitted',
    bank: 'FNB',
    bankFeedbackAt: '2026-05-07T08:00:00.000Z',
    missingDocumentsCount: index <= 12 ? 1 : 0,
    reassignmentCount: index <= 3 ? 1 : 0,
  })),
  ...range(14, (index) => makeApplication('consultant-sarah', index, {
    financeStatus: index <= 10 ? 'approval submitted quote approved instruction sent' : 'submitted to bank feedback received',
    status: index <= 10 ? 'approval submitted quote approved instruction sent' : 'submitted',
    bank: 'ABSA',
    createdAt: '2026-05-08T08:00:00.000Z',
    updatedAt: '2026-05-14T08:00:00.000Z',
  })),
  ...range(12, (index) => makeApplication('consultant-peter', index, {
    branchId: 'branch-west',
    regionId: 'region-gauteng',
    partnerId: 'partner-west',
    partnerName: 'Johannesburg Estates',
    financeStatus: index <= 9 ? 'approval submitted quote approved' : 'submitted to bank feedback received',
    status: index <= 9 ? 'approval submitted quote approved' : 'submitted',
    bank: 'Nedbank',
    createdAt: '2026-05-12T08:00:00.000Z',
    updatedAt: '2026-05-16T08:00:00.000Z',
  })),
  ...range(5, (index) => makeApplication('consultant-lindi', index, {
    branchId: 'branch-coast',
    regionId: 'region-coast',
    partnerId: 'partner-coast',
    partnerName: 'Atlantic Realty',
    financeStatus: index <= 4 ? 'approval submitted instruction sent' : 'declined',
    status: index <= 4 ? 'approval submitted instruction sent' : 'declined',
    bank: 'Standard Bank',
    createdAt: '2026-05-12T08:00:00.000Z',
    updatedAt: '2026-05-16T08:00:00.000Z',
  })),
]
const requests = [
  {
    id: 'request-john-complaint',
    partnerId: 'partner-gauteng',
    partnerName: 'Harcourts Bedfordview',
    applicationId: 'consultant-john-app-1',
    requestType: 'support_ticket',
    status: 'assigned',
    title: 'Partner complaint about consultant delay',
    message: 'Repeat complaint about no response and document delays.',
    priority: 'urgent',
    escalated: true,
    ownerConsultantId: 'consultant-john',
    ownerName: 'John Smith',
    branchId: 'branch-east',
    regionId: 'region-gauteng',
    createdAt: '2026-05-10T08:00:00.000Z',
    firstResponseAt: '2026-05-12T02:00:00.000Z',
    dueAt: '2026-05-10T12:00:00.000Z',
  },
  {
    id: 'request-john-docs',
    partnerId: 'partner-gauteng',
    partnerName: 'Harcourts Bedfordview',
    applicationId: 'consultant-john-app-2',
    requestType: 'document_review',
    status: 'in_progress',
    title: 'Missing documents',
    message: 'Missing bank statements still outstanding.',
    priority: 'high',
    ownerConsultantId: 'consultant-john',
    ownerName: 'John Smith',
    branchId: 'branch-east',
    regionId: 'region-gauteng',
    createdAt: '2026-05-11T08:00:00.000Z',
    firstResponseAt: '2026-05-12T08:00:00.000Z',
    dueAt: '2026-05-11T16:00:00.000Z',
  },
  {
    id: 'request-peter-fast',
    partnerId: 'partner-west',
    partnerName: 'Johannesburg Estates',
    applicationId: 'consultant-peter-app-1',
    requestType: 'support_ticket',
    status: 'resolved',
    title: 'Bank submission update',
    priority: 'normal',
    ownerConsultantId: 'consultant-peter',
    ownerName: 'Peter Jacobs',
    branchId: 'branch-west',
    regionId: 'region-gauteng',
    createdAt: '2026-05-14T08:00:00.000Z',
    firstResponseAt: '2026-05-14T09:00:00.000Z',
    dueAt: '2026-05-15T08:00:00.000Z',
    resolvedAt: '2026-05-14T14:00:00.000Z',
  },
  {
    id: 'request-lindi-fast',
    partnerId: 'partner-coast',
    partnerName: 'Atlantic Realty',
    applicationId: 'consultant-lindi-app-1',
    requestType: 'support_ticket',
    status: 'resolved',
    title: 'General support request',
    priority: 'normal',
    ownerConsultantId: 'consultant-lindi',
    ownerName: 'Lindi Mokoena',
    branchId: 'branch-coast',
    regionId: 'region-coast',
    createdAt: '2026-05-15T08:00:00.000Z',
    firstResponseAt: '2026-05-15T10:00:00.000Z',
    dueAt: '2026-05-16T08:00:00.000Z',
    resolvedAt: '2026-05-15T16:00:00.000Z',
  },
]
const documents = [
  { id: 'doc-1', applicationId: 'consultant-john-app-1', documentType: 'Payslip', uploadedBy: 'Partner', status: 'uploaded', uploadedAt: '2026-05-20T08:00:00.000Z', createdAt: '2026-05-20T08:00:00.000Z' },
  { id: 'doc-2', applicationId: 'consultant-john-app-2', documentType: 'Bank Statement', uploadedBy: 'Partner', status: 'rejected', uploadedAt: '2026-05-18T08:00:00.000Z', createdAt: '2026-05-18T08:00:00.000Z' },
  { id: 'doc-3', applicationId: 'consultant-peter-app-1', documentType: 'ID', uploadedBy: 'Partner', status: 'reviewed', uploadedAt: '2026-05-18T08:00:00.000Z', createdAt: '2026-05-18T08:00:00.000Z' },
]
const documentRequests = [
  { id: 'doc-request-1', applicationId: 'consultant-john-app-3', documentType: 'Replacement Bank Statement', status: 'replacement requested', createdAt: '2026-05-17T08:00:00.000Z' },
  { id: 'doc-request-2', applicationId: 'consultant-john-app-4', documentType: 'Proof of Income', status: 'requested', createdAt: '2026-05-19T08:00:00.000Z' },
]
const originatorBanks = [
  { id: 'panel-absa', bankId: 'absa', status: 'active' },
  { id: 'panel-fnb', bankId: 'fnb', status: 'active' },
  { id: 'panel-nedbank', bankId: 'nedbank', status: 'active' },
  { id: 'panel-standard-bank', bankId: 'standard-bank', status: 'active' },
  { id: 'panel-investec', bankId: 'investec', status: 'active' },
  { id: 'panel-other', bankId: 'other', status: 'active' },
]

const commonOptions = {
  workspaceId,
  partners,
  applications,
  regions,
  branches,
  consultants,
  documents,
  documentRequests,
  originatorBanks,
  now,
}

try {
  const portal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const collaboration = await server.ssrLoadModule('/src/services/bondPartnerCollaborationService.js')
  const intelligence = await server.ssrLoadModule('/src/services/bondPartnerIntelligenceService.js')
  const consultantPerformance = await server.ssrLoadModule('/src/services/bondConsultantPerformanceService.js')
  const branchOperations = await server.ssrLoadModule('/src/services/bondBranchOperationsService.js')
  const regionalOperations = await server.ssrLoadModule('/src/services/bondRegionalOperationsService.js')
  const hqCommandCentre = await server.ssrLoadModule('/src/services/bondHQCommandCentreService.js')

  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.clearStores()
  intelligence.__bondPartnerIntelligenceServiceTestUtils.clearStores()
  consultantPerformance.__bondConsultantPerformanceServiceTestUtils.clearStores()
  branchOperations.__bondBranchOperationsServiceTestUtils.clearStores()
  regionalOperations.__bondRegionalOperationsServiceTestUtils.clearStores()
  hqCommandCentre.__bondHQCommandCentreServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.seedRequests(workspaceId, requests)

  const hqContext = makeContext()
  const dashboard = hqCommandCentre.getHQCommandCentreDashboard(hqContext, commonOptions)
  assert.equal(dashboard.summary.totalApplications, applications.length)
  assert.equal(dashboard.summary.activeApplications > 0, true)
  assert.equal(dashboard.summary.applicationsSubmittedThisMonth > 0, true)
  assert.equal(dashboard.summary.forecastedVolume > 0, true)
  assert.equal(['Excellent', 'Healthy', 'At Risk', 'Critical'].includes(dashboard.health.status), true)

  const health = hqCommandCentre.calculateNationalHealth(hqContext, commonOptions)
  assert.equal(health.score >= 0 && health.score <= 100, true)
  assert.equal(health.components.regionalHealth > 0, true)

  const regionComparison = hqCommandCentre.getRegionComparison(hqContext, commonOptions)
  assert.equal(regionComparison.length, 2)
  assert.equal(regionComparison.some((row) => row.regionId === 'region-gauteng' && row.branches === 2), true)

  const branchNetwork = hqCommandCentre.getBranchNetworkComparison(hqContext, commonOptions)
  assert.equal(branchNetwork.allRows.length, 3)
  assert.equal(branchNetwork.rows.length, 3)
  assert.equal(branchNetwork.filters.some((row) => row.key === 'overloaded' && row.count >= 1), true)
  assert.equal(hqCommandCentre.getBranchNetworkComparison(hqContext, { ...commonOptions, branchFilter: 'overloaded' }).rows.some((row) => row.branchId === 'branch-east'), true)

  const capacity = hqCommandCentre.getConsultantNetworkCapacity(hqContext, commonOptions)
  assert.equal(capacity.metrics.totalConsultants, 5)
  assert.equal(capacity.metrics.overloadedConsultants >= 1, true)
  assert.equal(capacity.metrics.inactive, 1)
  assert.equal(capacity.metrics.highestWorkloadConsultant.consultantId, 'consultant-john')

  const partnerHealth = hqCommandCentre.getPartnerNetworkHealth(hqContext, commonOptions)
  assert.equal(partnerHealth.rows.length, 3)
  assert.equal(partnerHealth.summary.excellentPartners + partnerHealth.summary.healthyPartners + partnerHealth.summary.atRiskPartners + partnerHealth.summary.criticalPartners, 3)
  assert.equal(partnerHealth.rows.some((row) => row.partnerName === 'Harcourts Bedfordview'), true)

  const hotspots = hqCommandCentre.getSLAHotspots(hqContext, commonOptions)
  assert.equal(hotspots.metrics.totalOpenRequests >= 2, true)
  assert.equal(hotspots.metrics.slaBreaches >= 2, true)
  assert.equal(hotspots.byRegion.length >= 2, true)
  assert.equal(hotspots.topSLARiskAreas.length >= 1, true)

  const pipeline = hqCommandCentre.getApplicationPipelineOverview(hqContext, commonOptions)
  assert.equal(pipeline.find((row) => row.stage === 'Documents Requested')?.count, 2)
  assert.equal(pipeline.find((row) => row.stage === 'Applications Submitted')?.count > 0, true)
  assert.equal(pipeline.find((row) => row.stage === 'Instruction Sent')?.count > 0, true)

  const bankPerformance = hqCommandCentre.getBankPerformanceSnapshot(hqContext, commonOptions)
  assert.deepEqual(bankPerformance.map((row) => row.bank), ['ABSA', 'FNB', 'Nedbank', 'Standard Bank', 'Investec', 'Other'])
  assert.equal(bankPerformance.find((row) => row.bank === 'FNB')?.applicationsSubmitted > 0, true)
  assert.equal(bankPerformance.find((row) => row.bank === 'ABSA')?.approvals > 0, true)

  const forecast = hqCommandCentre.getExecutiveForecast(hqContext, commonOptions)
  assert.deepEqual(forecast.map((row) => row.periodDays), [7, 30, 90])
  assert.equal(forecast.some((row) => ['Low', 'Medium', 'High'].includes(row.executiveForecastRisk)), true)

  const alerts = hqCommandCentre.getExecutiveAlerts(hqContext, commonOptions)
  assert.equal(alerts.length >= 1, true)
  assert.equal(alerts.some((row) => row.actions.includes('Dismiss')), true)
  const assignedAlert = hqCommandCentre.assignExecutiveAlert(alerts[0].id, 'ops-director', hqContext, commonOptions)
  assert.equal(assignedAlert.assignedTo, 'ops-director')
  const dismissedAlert = hqCommandCentre.dismissExecutiveAlert(alerts[0].id, hqContext, commonOptions)
  assert.equal(dismissedAlert.status, 'dismissed')

  const commercial = hqCommandCentre.getCommercialSnapshot(hqContext, commonOptions)
  assert.equal(commercial.estimatedRevenue > 0, true)
  assert.equal(commercial.revenueByRegion.length, 2)
  assert.equal(commercial.revenueByPartner.some((row) => row.name === 'Harcourts Bedfordview'), true)

  const report = hqCommandCentre.generateExecutiveReport('Excel', hqContext, { ...commonOptions, period: '2026-06' })
  assert.equal(report.format, 'Excel')
  assert.equal(report.sections.includes('Executive Summary'), true)
  assert.equal(report.sections.includes('Commercial Snapshot'), true)
  assert.equal(hqCommandCentre.__bondHQCommandCentreServiceTestUtils.getReports(workspaceId).length, 1)

  const feed = hqCommandCentre.getHQActivityFeed(hqContext, commonOptions)
  assert.equal(feed.thisMonth.length > 0, true)

  assert.throws(
    () => hqCommandCentre.getHQCommandCentreDashboard(makeContext({
      userId: 'regional-gauteng',
      workspaceRole: 'regional_manager',
      scopeLevel: 'region',
      regionId: 'region-gauteng',
    }), commonOptions),
    /HQ Command Centre/i,
  )
  assert.throws(
    () => hqCommandCentre.getHQCommandCentreDashboard(makeContext({
      userId: 'branch-east-manager',
      workspaceRole: 'branch_manager',
      scopeLevel: 'branch',
      regionId: 'region-gauteng',
      branchId: 'branch-east',
    }), commonOptions),
    /HQ Command Centre/i,
  )
  assert.throws(
    () => hqCommandCentre.getHQCommandCentreDashboard(makeContext({
      userId: 'consultant-john',
      workspaceRole: 'consultant',
      scopeLevel: 'assigned',
      regionId: 'region-gauteng',
      branchId: 'branch-east',
    }), commonOptions),
    /HQ Command Centre/i,
  )

  const activity = hqCommandCentre.__bondHQCommandCentreServiceTestUtils.getActivity(workspaceId)
  assert.equal(activity.some((row) => row.eventType === hqCommandCentre.BOND_HQ_COMMAND_CENTRE_EVENTS.hqHealthUpdated), true)
  assert.equal(activity.some((row) => row.eventType === hqCommandCentre.BOND_HQ_COMMAND_CENTRE_EVENTS.hqForecastUpdated), true)
  assert.equal(activity.some((row) => row.eventType === hqCommandCentre.BOND_HQ_COMMAND_CENTRE_EVENTS.executiveAlertCreated), true)
  assert.equal(activity.some((row) => row.eventType === hqCommandCentre.BOND_HQ_COMMAND_CENTRE_EVENTS.executiveAlertDismissed), true)
  assert.equal(activity.some((row) => row.eventType === hqCommandCentre.BOND_HQ_COMMAND_CENTRE_EVENTS.executiveReportGenerated), true)

  console.log('bond HQ command centre tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
