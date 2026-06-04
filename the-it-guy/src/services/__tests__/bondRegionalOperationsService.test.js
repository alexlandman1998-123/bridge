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

const workspaceId = 'workspace-regional-operations'
const now = '2026-06-03T08:00:00.000Z'

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
    createdAt: overrides.createdAt || '2026-05-01T08:00:00.000Z',
    submittedAt: overrides.submittedAt || '2026-05-02T08:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-05-10T08:00:00.000Z',
    missingDocumentsCount: overrides.missingDocumentsCount || 0,
    reassignmentCount: overrides.reassignmentCount || 0,
  }
}

const partners = [
  { id: 'partner-gauteng', organisationId: workspaceId, name: 'Harcourts Bedfordview', type: 'agency', portalUsageScore: 80 },
  { id: 'partner-west', organisationId: workspaceId, name: 'Johannesburg Estates', type: 'agency', portalUsageScore: 90 },
  { id: 'partner-coast', organisationId: workspaceId, name: 'Atlantic Realty', type: 'agency', portalUsageScore: 75 },
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
]
const applications = [
  ...range(42, (index) => makeApplication('consultant-john', index, {
    financeStatus: index <= 4 ? 'approval submitted' : index <= 12 ? 'awaiting documents' : index <= 18 ? 'awaiting submission' : 'submitted to bank',
    status: index <= 4 ? 'approval submitted' : index <= 12 ? 'awaiting documents' : index <= 18 ? 'awaiting submission' : 'submitted',
    missingDocumentsCount: index <= 12 ? 1 : 0,
    reassignmentCount: index <= 3 ? 1 : 0,
  })),
  ...range(14, (index) => makeApplication('consultant-sarah', index, {
    financeStatus: index <= 10 ? 'approval submitted' : 'submitted to bank',
    status: index <= 10 ? 'approval submitted' : 'submitted',
    createdAt: '2026-05-08T08:00:00.000Z',
    updatedAt: '2026-05-14T08:00:00.000Z',
  })),
  ...range(12, (index) => makeApplication('consultant-peter', index, {
    branchId: 'branch-west',
    regionId: 'region-gauteng',
    partnerId: 'partner-west',
    partnerName: 'Johannesburg Estates',
    financeStatus: index <= 9 ? 'approval submitted' : 'submitted to bank',
    status: index <= 9 ? 'approval submitted' : 'submitted',
    createdAt: '2026-05-12T08:00:00.000Z',
    updatedAt: '2026-05-16T08:00:00.000Z',
  })),
  ...range(5, (index) => makeApplication('consultant-lindi', index, {
    branchId: 'branch-coast',
    regionId: 'region-coast',
    partnerId: 'partner-coast',
    partnerName: 'Atlantic Realty',
    financeStatus: index <= 4 ? 'approval submitted' : 'submitted to bank',
    status: index <= 4 ? 'approval submitted' : 'submitted',
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
  { id: 'doc-3', applicationId: 'consultant-peter-app-1', documentType: 'ID', uploadedBy: 'Partner', status: 'accepted', uploadedAt: '2026-05-18T08:00:00.000Z', createdAt: '2026-05-18T08:00:00.000Z' },
]
const documentRequests = [
  { id: 'doc-request-1', applicationId: 'consultant-john-app-3', documentType: 'Replacement Bank Statement', status: 'replacement requested', createdAt: '2026-05-17T08:00:00.000Z' },
  { id: 'doc-request-2', applicationId: 'consultant-john-app-4', documentType: 'Proof of Income', status: 'requested', createdAt: '2026-05-19T08:00:00.000Z' },
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
  now,
}

try {
  const portal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const collaboration = await server.ssrLoadModule('/src/services/bondPartnerCollaborationService.js')
  const intelligence = await server.ssrLoadModule('/src/services/bondPartnerIntelligenceService.js')
  const consultantPerformance = await server.ssrLoadModule('/src/services/bondConsultantPerformanceService.js')
  const branchOperations = await server.ssrLoadModule('/src/services/bondBranchOperationsService.js')
  const regionalOperations = await server.ssrLoadModule('/src/services/bondRegionalOperationsService.js')

  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.clearStores()
  intelligence.__bondPartnerIntelligenceServiceTestUtils.clearStores()
  consultantPerformance.__bondConsultantPerformanceServiceTestUtils.clearStores()
  branchOperations.__bondBranchOperationsServiceTestUtils.clearStores()
  regionalOperations.__bondRegionalOperationsServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.seedRequests(workspaceId, requests)

  const hqContext = makeContext()
  const dashboard = regionalOperations.getRegionalOperationsDashboard(hqContext, { ...commonOptions, regionId: 'region-gauteng' })
  assert.equal(dashboard.region.id, 'region-gauteng')
  assert.equal(dashboard.summary.branches, 2)
  assert.equal(dashboard.summary.consultants, 3)
  assert.equal(dashboard.summary.activeApplications > 0, true)
  assert.equal(dashboard.summary.openPartnerRequests >= 2, true)
  assert.equal(['Excellent', 'Healthy', 'At Risk', 'Critical'].includes(dashboard.health.status), true)

  const health = regionalOperations.calculateRegionalHealth('region-gauteng', hqContext, commonOptions)
  assert.equal(health.score >= 0 && health.score <= 100, true)
  assert.equal(health.components.slaCompliance < 100, true)

  const comparison = regionalOperations.getBranchComparison('region-gauteng', hqContext, commonOptions)
  assert.deepEqual(comparison.map((row) => row.branchId).sort(), ['branch-east', 'branch-west'])
  assert.equal(comparison.find((row) => row.branchId === 'branch-east')?.capacityRiskLevel, 'High')
  assert.equal(comparison.find((row) => row.branchId === 'branch-west')?.approvalRate > 0, true)

  const rankings = regionalOperations.getBranchRankings('region-gauteng', hqContext, commonOptions)
  assert.equal(rankings.top10.length, 2)
  assert.equal(rankings.bottom10.length, 2)
  assert.equal(rankings.mostAtRisk.some((row) => row.branchId === 'branch-east'), true)

  const capacity = regionalOperations.getRegionalCapacity('region-gauteng', hqContext, commonOptions)
  assert.equal(capacity.metrics.overloaded >= 1, true)
  assert.equal(capacity.rows.length, 2)
  assert.equal(capacity.rows.find((row) => row.branchId === 'branch-east')?.riskLevel, 'High')

  const heatmap = regionalOperations.getRegionalHeatmap('region-gauteng', hqContext, commonOptions)
  assert.equal(heatmap.length, 2)
  assert.equal(heatmap.some((row) => row.riskLevel === 'High'), true)

  const bottlenecks = regionalOperations.getRegionalBottlenecks('region-gauteng', hqContext, commonOptions)
  assert.equal(bottlenecks.find((row) => row.branchId === 'branch-east' && row.type === 'Awaiting Documents')?.count > 0, true)
  assert.equal(bottlenecks.find((row) => row.branchId === 'branch-east' && row.type === 'Awaiting Submission')?.count > 0, true)

  const partnerIntel = regionalOperations.getRegionalPartnerIntelligence('region-gauteng', hqContext, commonOptions)
  assert.equal(partnerIntel.rows.length, 2)
  assert.equal(partnerIntel.rows.some((row) => row.partnerName === 'Harcourts Bedfordview'), true)
  assert.equal(partnerIntel.metrics.openRequests >= 2, true)
  assert.equal(partnerIntel.metrics.supportVolume >= 3, true)

  const escalations = regionalOperations.getRegionalEscalations('region-gauteng', hqContext, commonOptions)
  assert.equal(escalations.some((row) => row.issue === 'SLA Breach' || row.issue === 'Partner Escalation'), true)
  assert.equal(escalations.every((row) => row.branchId !== 'branch-coast'), true)

  const managerPerformance = regionalOperations.getBranchManagerPerformance('region-gauteng', hqContext, commonOptions)
  assert.equal(managerPerformance.length, 2)
  assert.equal(managerPerformance.some((row) => row.branchManager === 'Naledi Maseko'), true)

  const target = regionalOperations.setRegionalTargets('region-gauteng', {
    period: '2026-06',
    applicationTarget: 140,
    approvalTarget: 76,
    slaTarget: 92,
    partnerHealthTarget: 80,
    growthTarget: 12,
  }, hqContext, commonOptions)
  assert.equal(target.applicationTarget, 140)
  const updatedTarget = regionalOperations.setRegionalTargets('region-gauteng', { period: '2026-06', applicationTarget: 150 }, hqContext, commonOptions)
  assert.equal(updatedTarget.applicationTarget, 150)
  assert.equal(regionalOperations.getRegionalTargets('region-gauteng', hqContext, { ...commonOptions, period: '2026-06' }).length, 1)

  const forecast = regionalOperations.getRegionalForecast('region-gauteng', hqContext, commonOptions)
  assert.deepEqual(forecast.map((row) => row.periodDays), [7, 30, 90])
  assert.equal(forecast.some((row) => row.expectedCapacityRisk === 'High'), true)

  const recommendations = regionalOperations.getRegionalRecommendations('region-gauteng', hqContext, commonOptions)
  assert.equal(recommendations.length >= 1, true)
  assert.equal(recommendations.some((row) => row.type === 'Capacity' || row.type === 'Partner Risk' || row.type === 'Branch Support'), true)

  const regionalDashboard = regionalOperations.getRegionalOperationsDashboard(makeContext({
    userId: 'regional-gauteng',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-gauteng',
  }), commonOptions)
  assert.deepEqual(regionalDashboard.regions.map((row) => row.id), ['region-gauteng'])
  assert.deepEqual(regionalDashboard.branchComparison.map((row) => row.branchId).sort(), ['branch-east', 'branch-west'])

  assert.throws(
    () => regionalOperations.getRegionalOperationsDashboard(makeContext({
      userId: 'regional-gauteng',
      workspaceRole: 'regional_manager',
      scopeLevel: 'region',
      regionId: 'region-gauteng',
    }), { ...commonOptions, regionId: 'region-coast' }),
    /not available/i,
  )

  assert.throws(
    () => regionalOperations.getRegionalOperationsDashboard(makeContext({
      userId: 'branch-east-manager',
      workspaceRole: 'branch_manager',
      scopeLevel: 'branch',
      regionId: 'region-gauteng',
      branchId: 'branch-east',
    }), commonOptions),
    /regional managers/i,
  )

  assert.throws(
    () => regionalOperations.getRegionalOperationsDashboard(makeContext({
      userId: 'consultant-john',
      workspaceRole: 'consultant',
      scopeLevel: 'assigned',
      regionId: 'region-gauteng',
      branchId: 'branch-east',
    }), commonOptions),
    /regional managers/i,
  )

  const activity = regionalOperations.__bondRegionalOperationsServiceTestUtils.getActivity(workspaceId)
  assert.equal(activity.some((row) => row.eventType === regionalOperations.BOND_REGIONAL_OPERATIONS_EVENTS.regionalHealthUpdated), true)
  assert.equal(activity.some((row) => row.eventType === regionalOperations.BOND_REGIONAL_OPERATIONS_EVENTS.regionalTargetSet), true)
  assert.equal(activity.some((row) => row.eventType === regionalOperations.BOND_REGIONAL_OPERATIONS_EVENTS.regionalTargetUpdated), true)
  assert.equal(activity.some((row) => row.eventType === regionalOperations.BOND_REGIONAL_OPERATIONS_EVENTS.regionalForecastUpdated), true)
  assert.equal(activity.some((row) => row.eventType === regionalOperations.BOND_REGIONAL_OPERATIONS_EVENTS.regionalInterventionCreated), true)
  assert.equal(activity.some((row) => row.eventType === regionalOperations.BOND_REGIONAL_OPERATIONS_EVENTS.regionalCapacityAlert), true)

  console.log('bond regional operations tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
