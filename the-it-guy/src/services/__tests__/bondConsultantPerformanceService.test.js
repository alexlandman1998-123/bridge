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

const workspaceId = 'workspace-consultant-performance'
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

function makeApplication(consultantId, index, overrides = {}) {
  const branchId = overrides.branchId || (consultantId === 'consultant-lindi' ? 'branch-coast' : 'branch-east')
  const regionId = overrides.regionId || (consultantId === 'consultant-lindi' ? 'region-coast' : 'region-gauteng')
  return {
    id: `${consultantId}-app-${index}`,
    partnerId: overrides.partnerId || (consultantId === 'consultant-lindi' ? 'partner-coast' : 'partner-gauteng'),
    partnerName: overrides.partnerName || (consultantId === 'consultant-lindi' ? 'Atlantic Realty' : 'Harcourts Bedfordview'),
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
    createdAt: overrides.createdAt || '2026-05-01T08:00:00.000Z',
    submittedAt: overrides.submittedAt || '2026-05-02T08:00:00.000Z',
    updatedAt: overrides.updatedAt || '2026-05-10T08:00:00.000Z',
    missingDocumentsCount: overrides.missingDocumentsCount || 0,
    reassignmentCount: overrides.reassignmentCount || 0,
  }
}

function range(count, factory) {
  return Array.from({ length: count }, (_, index) => factory(index + 1))
}

const partners = [
  { id: 'partner-gauteng', organisationId: workspaceId, name: 'Harcourts Bedfordview', type: 'agency', portalUsageScore: 80 },
  { id: 'partner-coast', organisationId: workspaceId, name: 'Atlantic Realty', type: 'agency', portalUsageScore: 75 },
]
const regions = [
  { id: 'region-gauteng', name: 'Gauteng' },
  { id: 'region-coast', name: 'Coastal' },
]
const branches = [
  { id: 'branch-east', name: 'East Rand Branch', regionId: 'region-gauteng' },
  { id: 'branch-coast', name: 'Atlantic Branch', regionId: 'region-coast' },
]
const consultants = [
  { id: 'consultant-john', name: 'John Smith', regionId: 'region-gauteng', branchId: 'branch-east', status: 'active' },
  { id: 'consultant-sarah', name: 'Sarah Jacobs', regionId: 'region-gauteng', branchId: 'branch-east', status: 'active' },
  { id: 'consultant-lindi', name: 'Lindi Mokoena', regionId: 'region-coast', branchId: 'branch-coast', status: 'active' },
]
const applications = [
  ...range(42, (index) => makeApplication('consultant-john', index, {
    financeStatus: index <= 3 ? 'approved' : 'submitted to bank',
    status: index <= 3 ? 'approved' : 'submitted',
    missingDocumentsCount: index <= 8 ? 1 : 0,
    reassignmentCount: index <= 3 ? 1 : 0,
  })),
  ...range(14, (index) => makeApplication('consultant-sarah', index, {
    financeStatus: index <= 10 ? 'approval submitted' : 'submitted to bank',
    status: index <= 10 ? 'approval submitted' : 'submitted',
    createdAt: '2026-05-08T08:00:00.000Z',
    updatedAt: '2026-05-14T08:00:00.000Z',
  })),
  ...range(5, (index) => makeApplication('consultant-lindi', index, {
    financeStatus: index <= 4 ? 'approval submitted' : 'submitted to bank',
    status: index <= 4 ? 'approval submitted' : 'submitted',
    branchId: 'branch-coast',
    regionId: 'region-coast',
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
    message: 'Missing documents and bank statements still outstanding.',
    priority: 'high',
    ownerConsultantId: 'consultant-john',
    branchId: 'branch-east',
    regionId: 'region-gauteng',
    createdAt: '2026-05-11T08:00:00.000Z',
    firstResponseAt: '2026-05-12T08:00:00.000Z',
    dueAt: '2026-05-11T16:00:00.000Z',
  },
  {
    id: 'request-sarah-fast',
    partnerId: 'partner-gauteng',
    partnerName: 'Harcourts Bedfordview',
    applicationId: 'consultant-sarah-app-1',
    requestType: 'support_ticket',
    status: 'resolved',
    title: 'Bank submission update',
    priority: 'normal',
    ownerConsultantId: 'consultant-sarah',
    branchId: 'branch-east',
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
    branchId: 'branch-coast',
    regionId: 'region-coast',
    createdAt: '2026-05-15T08:00:00.000Z',
    firstResponseAt: '2026-05-15T10:00:00.000Z',
    dueAt: '2026-05-16T08:00:00.000Z',
    resolvedAt: '2026-05-15T16:00:00.000Z',
  },
]

const commonOptions = {
  workspaceId,
  partners,
  applications,
  regions,
  branches,
  consultants,
  now,
}

try {
  const portal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const collaboration = await server.ssrLoadModule('/src/services/bondPartnerCollaborationService.js')
  const intelligence = await server.ssrLoadModule('/src/services/bondPartnerIntelligenceService.js')
  const performance = await server.ssrLoadModule('/src/services/bondConsultantPerformanceService.js')

  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.clearStores()
  intelligence.__bondPartnerIntelligenceServiceTestUtils.clearStores()
  performance.__bondConsultantPerformanceServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.seedRequests(workspaceId, requests)

  const hqContext = makeContext()
  const dashboard = performance.getConsultantPerformanceDashboard(hqContext, commonOptions)
  assert.equal(dashboard.summary.totalConsultants, 3)
  assert.equal(dashboard.summary.activeConsultants, 3)
  assert.equal(dashboard.summary.overloadedConsultants, 1)
  assert.equal(dashboard.summary.openApplications > 0, true)
  assert.equal(dashboard.rows.find((row) => row.consultantId === 'consultant-john')?.capacityStatus, 'Overloaded')
  assert.equal(dashboard.rows.find((row) => row.consultantId === 'consultant-sarah')?.capacityStatus, 'Normal')
  assert.equal(dashboard.rows.find((row) => row.consultantId === 'consultant-lindi')?.capacityStatus, 'Light')
  assert.equal(dashboard.rows.find((row) => row.consultantId === 'consultant-john')?.partnerResponseTime > 8, true)
  assert.equal(dashboard.rows.find((row) => row.consultantId === 'consultant-john')?.slaCompliance < 85, true)

  const regionalDashboard = performance.getConsultantPerformanceDashboard(makeContext({
    userId: 'regional-gauteng',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-gauteng',
  }), commonOptions)
  assert.deepEqual(regionalDashboard.rows.map((row) => row.consultantId).sort(), ['consultant-john', 'consultant-sarah'])
  assert.equal(regionalDashboard.regionComparison.length, 1)

  const branchDashboard = performance.getConsultantPerformanceDashboard(makeContext({
    userId: 'branch-east-manager',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    regionId: 'region-gauteng',
    branchId: 'branch-east',
  }), commonOptions)
  assert.deepEqual(branchDashboard.rows.map((row) => row.consultantId).sort(), ['branch-east-manager', 'consultant-john', 'consultant-sarah'].filter((id) => id !== 'branch-east-manager'))
  assert.equal(branchDashboard.branchComparison[0]?.name, 'East Rand Branch')

  const consultantContext = makeContext({
    userId: 'consultant-john',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    regionId: 'region-gauteng',
    branchId: 'branch-east',
  })
  const consultantDashboard = performance.getConsultantPerformanceDashboard(consultantContext, commonOptions)
  assert.deepEqual(consultantDashboard.rows.map((row) => row.consultantId), ['consultant-john'])
  assert.equal(consultantDashboard.rankings.accessDenied, true)
  assert.throws(
    () => performance.setConsultantTarget('consultant-john', { period: '2026-06' }, consultantContext, commonOptions),
    /cannot manage targets/i,
  )

  const directCapacity = performance.calculateConsultantCapacity('consultant-john', hqContext, commonOptions)
  assert.equal(directCapacity.capacityStatus, 'Overloaded')
  assert.equal(directCapacity.capacityScore >= 41, true)

  const target = performance.setConsultantTarget('consultant-sarah', {
    period: '2026-06',
    applicationsTarget: 12,
    approvalsTarget: 8,
    approvalRateTarget: 70,
    turnaroundTarget: 8,
    slaComplianceTarget: 95,
    responseTimeTarget: 4,
  }, hqContext, commonOptions)
  assert.equal(target.applicationsTarget, 12)
  const updatedTarget = performance.setConsultantTarget('consultant-sarah', {
    period: '2026-06',
    applicationsTarget: 16,
  }, hqContext, commonOptions)
  assert.equal(updatedTarget.applicationsTarget, 16)
  assert.equal(performance.getConsultantTargets('consultant-sarah', hqContext, { ...commonOptions, period: '2026-06' }).length, 1)

  const progress = performance.getConsultantTargetProgress('consultant-sarah', hqContext, { ...commonOptions, period: '2026-06' })
  assert.equal(progress.progress.approvals.actual, 10)
  assert.equal(progress.progress.applicationsSubmitted.target, 16)
  assert.equal(progress.progress.slaCompliance.percent > 0, true)

  const flags = performance.getCoachingFlags('consultant-john', hqContext, commonOptions)
  assert.equal(flags.some((flag) => flag.type === 'Overloaded'), true)
  assert.equal(flags.some((flag) => flag.type === 'Slow Response Time'), true)
  assert.equal(flags.some((flag) => flag.type === 'High SLA Breaches'), true)
  assert.equal(flags.some((flag) => flag.type === 'High Partner Complaints'), true)
  assert.equal(flags.some((flag) => flag.type === 'Document Delay Bottleneck'), true)
  assert.equal(flags.some((flag) => flag.type === 'Repeated Reassignments'), true)

  const recommendations = performance.getWorkloadRecommendations(hqContext, commonOptions)
  assert.equal(recommendations.length >= 1, true)
  assert.equal(recommendations[0].fromConsultantId, 'consultant-john')
  assert.equal(recommendations[0].toConsultantId, 'consultant-sarah')

  const forecast = performance.getConsultantForecast('consultant-john', hqContext, commonOptions)
  assert.deepEqual(forecast.map((row) => row.periodDays), [7, 14, 30])
  assert.equal(forecast.some((row) => row.riskLevel === 'High'), true)

  const rankings = performance.getPerformanceRankings(hqContext, commonOptions)
  assert.equal(rankings.topApprovalRate[0].consultantId, 'consultant-lindi')
  assert.equal(rankings.highestVolume[0].consultantId, 'consultant-john')
  assert.equal(rankings.atRiskConsultants.some((row) => row.consultantId === 'consultant-john'), true)

  const workspace = performance.getConsultantWorkspace('consultant-sarah', hqContext, commonOptions)
  assert.equal(workspace.performance.consultantName, 'Sarah Jacobs')
  assert.equal(workspace.targets.length, 1)
  assert.equal(workspace.forecast.length, 3)

  const activity = performance.__bondConsultantPerformanceServiceTestUtils.getActivity(workspaceId)
  assert.equal(activity.some((row) => row.eventType === performance.BOND_CONSULTANT_PERFORMANCE_EVENTS.consultantTargetSet), true)
  assert.equal(activity.some((row) => row.eventType === performance.BOND_CONSULTANT_PERFORMANCE_EVENTS.consultantTargetUpdated), true)
  assert.equal(activity.some((row) => row.eventType === performance.BOND_CONSULTANT_PERFORMANCE_EVENTS.consultantCoachingFlagCreated), true)
  assert.equal(activity.some((row) => row.eventType === performance.BOND_CONSULTANT_PERFORMANCE_EVENTS.workloadRecommendationCreated), true)

  console.log('bond consultant performance tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
