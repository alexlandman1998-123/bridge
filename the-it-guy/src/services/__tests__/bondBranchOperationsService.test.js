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

const workspaceId = 'workspace-branch-operations'
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
    financeStatus: index <= 4 ? 'approval submitted' : index <= 10 ? 'awaiting documents' : index <= 16 ? 'awaiting submission' : 'submitted to bank',
    status: index <= 4 ? 'approval submitted' : index <= 10 ? 'awaiting documents' : index <= 16 ? 'awaiting submission' : 'submitted',
    missingDocumentsCount: index <= 12 ? 1 : 0,
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
    partnerId: 'partner-coast',
    partnerName: 'Atlantic Realty',
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
    id: 'request-sarah-fast',
    partnerId: 'partner-gauteng',
    partnerName: 'Harcourts Bedfordview',
    applicationId: 'consultant-sarah-app-1',
    requestType: 'support_ticket',
    status: 'resolved',
    title: 'Bank submission update',
    priority: 'normal',
    ownerConsultantId: 'consultant-sarah',
    ownerName: 'Sarah Jacobs',
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

  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.clearStores()
  intelligence.__bondPartnerIntelligenceServiceTestUtils.clearStores()
  consultantPerformance.__bondConsultantPerformanceServiceTestUtils.clearStores()
  branchOperations.__bondBranchOperationsServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.seedRequests(workspaceId, requests)

  const hqContext = makeContext()
  const dashboard = branchOperations.getBranchOperationsDashboard(hqContext, { ...commonOptions, branchId: 'branch-east' })
  assert.equal(dashboard.branch.id, 'branch-east')
  assert.equal(dashboard.summary.activeApplications > 0, true)
  assert.equal(dashboard.summary.slaBreaches >= 2, true)
  assert.equal(dashboard.summary.overloadedConsultants, 1)
  assert.equal(dashboard.summary.pendingDocuments > 0, true)
  assert.equal(['Excellent', 'Healthy', 'At Risk', 'Critical'].includes(dashboard.health.status), true)

  const health = branchOperations.calculateBranchHealth('branch-east', hqContext, commonOptions)
  assert.equal(health.score >= 0 && health.score <= 100, true)
  assert.equal(health.components.slaCompliance < 100, true)

  const priorities = branchOperations.getBranchPriorities('branch-east', hqContext, commonOptions)
  assert.equal(priorities.some((row) => row.type === 'SLA Breaches'), true)
  assert.equal(priorities.some((row) => row.type === 'Overloaded Consultants'), true)
  assert.equal(priorities.some((row) => row.type === 'Outstanding Documents'), true)

  const capacity = branchOperations.getConsultantCapacity('branch-east', hqContext, commonOptions)
  assert.equal(capacity.find((row) => row.consultantId === 'consultant-john')?.capacityStatus, 'Overloaded')
  assert.equal(capacity.find((row) => row.consultantId === 'consultant-sarah')?.capacityStatus, 'Normal')

  const heatmap = branchOperations.getBranchHeatmap('branch-east', hqContext, commonOptions)
  assert.equal(heatmap.some((row) => row.riskLevel === 'High'), true)

  const bottlenecks = branchOperations.getApplicationBottlenecks('branch-east', hqContext, commonOptions)
  assert.equal(bottlenecks.find((row) => row.type === 'Awaiting Documents')?.count > 0, true)
  assert.equal(bottlenecks.find((row) => row.type === 'Awaiting Submission')?.count > 0, true)

  const partnerOps = branchOperations.getPartnerOperations('branch-east', hqContext, commonOptions)
  assert.equal(partnerOps.metrics.openRequests >= 2, true)
  assert.equal(partnerOps.rows[0].healthScore > 0, true)

  const documentOps = branchOperations.getDocumentOperations('branch-east', hqContext, commonOptions)
  assert.equal(documentOps.metrics.documentsUploaded, 2)
  assert.equal(documentOps.metrics.documentsRejected >= 1, true)
  assert.equal(documentOps.metrics.replacementRequests, 1)
  assert.equal(documentOps.rows.length, 4)

  const target = branchOperations.setBranchTargets('branch-east', {
    period: '2026-06',
    approvalTarget: 75,
    submissionTarget: 40,
    turnaroundTarget: 10,
    slaTarget: 92,
    satisfactionTarget: 78,
  }, hqContext, commonOptions)
  assert.equal(target.submissionTarget, 40)
  const updatedTarget = branchOperations.setBranchTargets('branch-east', { period: '2026-06', submissionTarget: 45 }, hqContext, commonOptions)
  assert.equal(updatedTarget.submissionTarget, 45)
  assert.equal(branchOperations.getBranchTargets('branch-east', hqContext, { ...commonOptions, period: '2026-06' }).length, 1)

  const recommendations = branchOperations.getWorkloadRecommendations('branch-east', hqContext, commonOptions)
  assert.equal(recommendations.length >= 1, true)
  assert.equal(recommendations[0].actions.includes('Approve'), true)

  const escalations = branchOperations.getEscalations('branch-east', hqContext, commonOptions)
  assert.equal(escalations.some((row) => row.issue === 'SLA Breach' || row.issue === 'Partner Escalation'), true)

  const coaching = branchOperations.getCoachingCentre('branch-east', hqContext, commonOptions)
  assert.equal(coaching.some((row) => row.consultantId === 'consultant-john'), true)

  const forecast = branchOperations.getBranchForecast('branch-east', hqContext, commonOptions)
  assert.deepEqual(forecast.map((row) => row.periodDays), [7, 14, 30])
  assert.equal(forecast.some((row) => row.riskLevel === 'High'), true)

  const hqRankings = branchOperations.getBranchRankings(hqContext, commonOptions)
  assert.equal(hqRankings.length, 2)
  assert.equal(hqRankings.find((row) => row.branchId === 'branch-east')?.totalBranches, 2)

  const regionalDashboard = branchOperations.getBranchOperationsDashboard(makeContext({
    userId: 'regional-gauteng',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-gauteng',
  }), commonOptions)
  assert.deepEqual(regionalDashboard.branches.map((row) => row.id), ['branch-east'])

  const branchDashboard = branchOperations.getBranchOperationsDashboard(makeContext({
    userId: 'branch-east-manager',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    regionId: 'region-gauteng',
    branchId: 'branch-east',
  }), commonOptions)
  assert.equal(branchDashboard.branch.id, 'branch-east')
  assert.throws(
    () => branchOperations.getBranchOperationsDashboard(makeContext({
      userId: 'branch-east-manager',
      workspaceRole: 'branch_manager',
      scopeLevel: 'branch',
      regionId: 'region-gauteng',
      branchId: 'branch-east',
    }), { ...commonOptions, branchId: 'branch-coast' }),
    /not available/i,
  )

  assert.throws(
    () => branchOperations.getBranchOperationsDashboard(makeContext({
      userId: 'consultant-john',
      workspaceRole: 'consultant',
      scopeLevel: 'assigned',
      regionId: 'region-gauteng',
      branchId: 'branch-east',
    }), commonOptions),
    /cannot access branch operations/i,
  )

  const activity = branchOperations.__bondBranchOperationsServiceTestUtils.getActivity(workspaceId)
  assert.equal(activity.some((row) => row.eventType === branchOperations.BOND_BRANCH_OPERATIONS_EVENTS.branchHealthUpdated), true)
  assert.equal(activity.some((row) => row.eventType === branchOperations.BOND_BRANCH_OPERATIONS_EVENTS.branchTargetSet), true)
  assert.equal(activity.some((row) => row.eventType === branchOperations.BOND_BRANCH_OPERATIONS_EVENTS.branchTargetUpdated), true)
  assert.equal(activity.some((row) => row.eventType === branchOperations.BOND_BRANCH_OPERATIONS_EVENTS.branchForecastUpdated), true)
  assert.equal(activity.some((row) => row.eventType === branchOperations.BOND_BRANCH_OPERATIONS_EVENTS.branchPriorityCreated), true)
  assert.equal(activity.some((row) => row.eventType === branchOperations.BOND_BRANCH_OPERATIONS_EVENTS.branchEscalationCreated), true)

  console.log('bond branch operations tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
