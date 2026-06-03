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

function makeContext({
  workspaceId = 'workspace-partner-intelligence',
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

const workspaceId = 'workspace-partner-intelligence'
const partners = [
  { id: 'partner-excellent', organisationId: workspaceId, name: 'Harcourts Bedfordview', type: 'agency', previousHealthScore: 82, previousSatisfactionScore: 82, portalUsageScore: 92 },
  { id: 'partner-risk', organisationId: workspaceId, name: 'Vista Developments', type: 'development', previousHealthScore: 72, previousSatisfactionScore: 68, portalUsageScore: 50 },
  { id: 'partner-coast', organisationId: workspaceId, name: 'Atlantic Realty', type: 'agency', previousHealthScore: 65, previousSatisfactionScore: 70, portalUsageScore: 80 },
]
const applications = [
  {
    id: 'app-excellent-1',
    partnerId: 'partner-excellent',
    partnerName: 'Harcourts Bedfordview',
    applicationReference: 'BO-2026-101',
    assignedConsultantId: 'consultant-sarah',
    assignedBranchId: 'branch-east',
    assignedRegionId: 'region-gauteng',
    financeStatus: 'approved',
    createdAt: '2026-03-01T08:00:00.000Z',
    updatedAt: '2026-03-10T08:00:00.000Z',
  },
  {
    id: 'app-excellent-2',
    partnerId: 'partner-excellent',
    partnerName: 'Harcourts Bedfordview',
    applicationReference: 'BO-2026-102',
    assignedConsultantId: 'consultant-sarah',
    assignedBranchId: 'branch-east',
    assignedRegionId: 'region-gauteng',
    financeStatus: 'grant accepted',
    createdAt: '2026-04-01T08:00:00.000Z',
    updatedAt: '2026-04-08T08:00:00.000Z',
  },
  {
    id: 'app-risk-1',
    partnerId: 'partner-risk',
    partnerName: 'Vista Developments',
    applicationReference: 'BO-2026-201',
    assignedConsultantId: 'consultant-peter',
    assignedBranchId: 'branch-west',
    assignedRegionId: 'region-gauteng',
    financeStatus: 'declined',
    createdAt: '2026-05-01T08:00:00.000Z',
    updatedAt: '2026-05-20T08:00:00.000Z',
    missingDocumentsCount: 2,
  },
  {
    id: 'app-risk-2',
    partnerId: 'partner-risk',
    partnerName: 'Vista Developments',
    applicationReference: 'BO-2026-202',
    assignedConsultantId: 'consultant-peter',
    assignedBranchId: 'branch-west',
    assignedRegionId: 'region-gauteng',
    financeStatus: 'bank feedback delayed',
    createdAt: '2026-05-05T08:00:00.000Z',
    updatedAt: '2026-05-25T08:00:00.000Z',
    missingDocumentsCount: 1,
  },
  {
    id: 'app-coast-1',
    partnerId: 'partner-coast',
    partnerName: 'Atlantic Realty',
    applicationReference: 'BO-2026-301',
    assignedConsultantId: 'consultant-lindi',
    assignedBranchId: 'branch-coast',
    assignedRegionId: 'region-coast',
    financeStatus: 'approved',
    createdAt: '2026-04-12T08:00:00.000Z',
    updatedAt: '2026-04-28T08:00:00.000Z',
  },
]
const regions = [
  { id: 'region-gauteng', name: 'Gauteng' },
  { id: 'region-coast', name: 'Coastal' },
]
const branches = [
  { id: 'branch-east', name: 'East Rand Branch', regionId: 'region-gauteng' },
  { id: 'branch-west', name: 'West Rand Branch', regionId: 'region-gauteng' },
  { id: 'branch-coast', name: 'Atlantic Branch', regionId: 'region-coast' },
]
const consultants = [
  { id: 'consultant-sarah', name: 'Sarah Jacobs', regionId: 'region-gauteng', branchId: 'branch-east' },
  { id: 'consultant-peter', name: 'Peter North', regionId: 'region-gauteng', branchId: 'branch-west' },
  { id: 'consultant-lindi', name: 'Lindi Mokoena', regionId: 'region-coast', branchId: 'branch-coast' },
]
const requests = [
  {
    id: 'request-excellent-doc',
    partnerId: 'partner-excellent',
    partnerName: 'Harcourts Bedfordview',
    applicationId: 'app-excellent-1',
    requestType: 'document_review',
    status: 'resolved',
    title: 'Payslip review required',
    priority: 'normal',
    ownerConsultantId: 'consultant-sarah',
    branchId: 'branch-east',
    regionId: 'region-gauteng',
    createdAt: '2026-05-01T08:00:00.000Z',
    firstResponseAt: '2026-05-01T09:00:00.000Z',
    dueAt: '2026-05-01T16:00:00.000Z',
    resolvedAt: '2026-05-01T12:00:00.000Z',
  },
  {
    id: 'request-excellent-support',
    partnerId: 'partner-excellent',
    partnerName: 'Harcourts Bedfordview',
    applicationId: 'app-excellent-2',
    requestType: 'support_ticket',
    status: 'resolved',
    title: 'Bank submission update',
    message: 'Please confirm bank submission.',
    priority: 'normal',
    ownerConsultantId: 'consultant-sarah',
    branchId: 'branch-east',
    regionId: 'region-gauteng',
    createdAt: '2026-05-02T08:00:00.000Z',
    firstResponseAt: '2026-05-02T10:00:00.000Z',
    dueAt: '2026-05-03T08:00:00.000Z',
    resolvedAt: '2026-05-02T15:00:00.000Z',
  },
  {
    id: 'request-risk-complaint',
    partnerId: 'partner-risk',
    partnerName: 'Vista Developments',
    applicationId: 'app-risk-1',
    requestType: 'support_ticket',
    status: 'assigned',
    title: 'Partner complaint about consultant delay',
    message: 'Repeat complaint: no response on missing documents and bank delay.',
    priority: 'urgent',
    escalated: true,
    ownerConsultantId: 'consultant-peter',
    branchId: 'branch-west',
    regionId: 'region-gauteng',
    createdAt: '2026-05-10T08:00:00.000Z',
    firstResponseAt: '2026-05-12T08:00:00.000Z',
    dueAt: '2026-05-10T12:00:00.000Z',
  },
  {
    id: 'request-risk-docs',
    partnerId: 'partner-risk',
    partnerName: 'Vista Developments',
    applicationId: 'app-risk-2',
    requestType: 'document_review',
    status: 'assigned',
    title: 'Missing documents replacement required',
    message: 'Replacement bank statements still outstanding.',
    priority: 'high',
    ownerConsultantId: 'consultant-peter',
    branchId: 'branch-west',
    regionId: 'region-gauteng',
    createdAt: '2026-05-11T08:00:00.000Z',
    dueAt: '2026-05-11T16:00:00.000Z',
  },
  {
    id: 'request-coast-support',
    partnerId: 'partner-coast',
    partnerName: 'Atlantic Realty',
    applicationId: 'app-coast-1',
    requestType: 'support_ticket',
    status: 'resolved',
    title: 'General support request',
    priority: 'normal',
    ownerConsultantId: 'consultant-lindi',
    branchId: 'branch-coast',
    regionId: 'region-coast',
    createdAt: '2026-04-18T08:00:00.000Z',
    firstResponseAt: '2026-04-18T12:00:00.000Z',
    dueAt: '2026-04-19T08:00:00.000Z',
    resolvedAt: '2026-04-18T18:00:00.000Z',
  },
]

const commonOptions = {
  workspaceId,
  partners,
  applications,
  regions,
  branches,
  consultants,
  now: '2026-06-03T08:00:00.000Z',
}

try {
  const portal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const collaboration = await server.ssrLoadModule('/src/services/bondPartnerCollaborationService.js')
  const intelligence = await server.ssrLoadModule('/src/services/bondPartnerIntelligenceService.js')

  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.clearStores()
  intelligence.__bondPartnerIntelligenceServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.seedRequests(workspaceId, requests)

  const hqContext = makeContext()
  const directExcellent = intelligence.calculatePartnerHealth({
    applications: applications.filter((row) => row.partnerId === 'partner-excellent'),
    requests: requests.filter((row) => row.partnerId === 'partner-excellent'),
  })
  assert.equal(directExcellent.status, 'Excellent')
  assert.equal(directExcellent.components.slaCompliance, 100)

  const directRisk = intelligence.calculatePartnerHealth({
    applications: applications.filter((row) => row.partnerId === 'partner-risk'),
    requests: requests.filter((row) => row.partnerId === 'partner-risk'),
  })
  assert.equal(['At Risk', 'Critical'].includes(directRisk.status), true)

  const health = intelligence.getPartnerHealth(hqContext, commonOptions)
  assert.equal(health.rows.length, 3)
  assert.equal(health.summary.excellentPartners >= 1, true)
  assert.equal(health.rows.find((row) => row.partnerId === 'partner-risk').status, 'Critical')
  assert.equal(health.rows.find((row) => row.partnerId === 'partner-risk').satisfaction.status, 'At Risk')

  const sla = intelligence.getSLAPerformance(hqContext, commonOptions)
  assert.equal(sla.metrics.totalRequests, 5)
  assert.equal(sla.metrics.resolvedWithinSLA, 3)
  assert.equal(sla.metrics.breachedSLA >= 2, true)
  assert.ok(sla.byRegion.some((row) => row.id === 'region-gauteng'))
  assert.ok(sla.byBranch.some((row) => row.id === 'branch-west'))
  assert.ok(sla.byConsultant.some((row) => row.id === 'consultant-peter'))
  assert.ok(sla.byPartner.some((row) => row.id === 'Vista Developments'))

  const consultantResponsiveness = intelligence.getConsultantResponsiveness(hqContext, commonOptions)
  const peter = consultantResponsiveness.rows.find((row) => row.consultantId === 'consultant-peter')
  assert.equal(peter.openRequests, 2)
  assert.equal(peter.status, 'Critical')

  const branchQuality = intelligence.getBranchServiceQuality(hqContext, commonOptions)
  assert.ok(branchQuality.rows.some((row) => row.branchId === 'branch-west' && row.escalations >= 1))

  const regionalQuality = intelligence.getRegionalServiceQuality(hqContext, commonOptions)
  assert.ok(regionalQuality.rows.some((row) => row.regionId === 'region-gauteng'))
  assert.equal(regionalQuality.metrics.applications, 5)

  const recurringIssues = intelligence.getRecurringIssues(hqContext, commonOptions)
  assert.ok(recurringIssues.rows.some((row) => row.issueType === 'Missing Documents'))
  assert.ok(recurringIssues.rows.some((row) => row.issueType === 'Bank Delays' || row.issueType === 'Partner Complaints'))

  const escalationAnalysis = intelligence.getEscalationAnalysis(hqContext, commonOptions)
  assert.equal(escalationAnalysis.metrics.volume >= 1, true)
  assert.equal(escalationAnalysis.highlights.mostEscalatedPartner.name, 'Vista Developments')

  const report = intelligence.generatePartnerReport('partner-risk', hqContext, commonOptions)
  assert.equal(report.partnerName, 'Vista Developments')
  assert.equal(report.sections.applicationsSubmitted, 2)
  assert.equal(Boolean(report.formats.pdf.filename), true)
  assert.equal(Boolean(report.formats.excel.filename), true)

  const timeline = intelligence.getPartnerRelationshipTimeline('partner-risk', hqContext, commonOptions)
  assert.equal(timeline.partner.name, 'Vista Developments')
  assert.equal(timeline.rows.length >= 1, true)

  const trends = intelligence.getTrendReporting(hqContext, commonOptions)
  assert.deepEqual(trends.rows.map((row) => row.period), ['30d', '90d', '180d', '12m'])
  assert.ok(trends.rows.every((row) => ['Improving', 'Stable', 'Declining'].includes(row.trend)))

  const executive = intelligence.getExecutiveReporting(hqContext, commonOptions)
  assert.equal(executive.accessDenied, undefined)
  assert.equal(executive.widgets.atRiskPartners.some((row) => row.partnerId === 'partner-risk'), true)
  assert.equal(executive.widgets.escalationHotspots.partner.name, 'Vista Developments')

  const branchContext = makeContext({
    userId: 'branch-west-manager',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    regionId: 'region-gauteng',
    branchId: 'branch-west',
  })
  const branchScopedQuality = intelligence.getBranchServiceQuality(branchContext, commonOptions)
  assert.equal(branchScopedQuality.accessDenied, undefined)
  assert.equal(branchScopedQuality.rows.length, 1)
  assert.equal(branchScopedQuality.rows[0].branchId, 'branch-west')

  const regionalContext = makeContext({
    userId: 'regional-gauteng',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-gauteng',
  })
  const regionalScopedQuality = intelligence.getRegionalServiceQuality(regionalContext, commonOptions)
  assert.equal(regionalScopedQuality.accessDenied, undefined)
  assert.ok(regionalScopedQuality.rows.every((row) => row.regionId === 'region-gauteng'))

  const consultantContext = makeContext({
    userId: 'consultant-sarah',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    regionId: 'region-gauteng',
    branchId: 'branch-east',
  })
  const consultantMetrics = intelligence.getConsultantResponsiveness(consultantContext, commonOptions)
  assert.deepEqual(consultantMetrics.rows.map((row) => row.consultantId), ['consultant-sarah'])
  assert.equal(intelligence.getBranchServiceQuality(consultantContext, commonOptions).accessDenied, true)
  assert.equal(intelligence.getRegionalServiceQuality(consultantContext, commonOptions).accessDenied, true)
  assert.equal(intelligence.getExecutiveReporting(consultantContext, commonOptions).accessDenied, true)
  assert.throws(
    () => intelligence.generatePartnerReport('partner-excellent', consultantContext, commonOptions),
    /Only HQ users/,
  )

  const activity = intelligence.__bondPartnerIntelligenceServiceTestUtils.getActivity(workspaceId)
  assert.ok(activity.some((row) => row.eventType === intelligence.BOND_PARTNER_INTELLIGENCE_EVENTS.partnerHealthUpdated))
  assert.ok(activity.some((row) => row.eventType === intelligence.BOND_PARTNER_INTELLIGENCE_EVENTS.slaMetricRecorded))
  assert.ok(activity.some((row) => row.eventType === intelligence.BOND_PARTNER_INTELLIGENCE_EVENTS.partnerSatisfactionUpdated))
  assert.ok(activity.some((row) => row.eventType === intelligence.BOND_PARTNER_INTELLIGENCE_EVENTS.partnerReportGenerated))
  assert.ok(activity.some((row) => row.eventType === intelligence.BOND_PARTNER_INTELLIGENCE_EVENTS.partnerFlaggedAtRisk))

  console.log('bondPartnerIntelligenceService tests passed')
} finally {
  await server.close()
}
