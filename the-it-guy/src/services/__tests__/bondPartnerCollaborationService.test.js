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
  workspaceId,
  userId = 'user-hq',
  workspaceRole = 'hq_manager',
  scopeLevel = 'workspace_hq',
  regionId = '',
  branchId = '',
} = {}) {
  return {
    role: 'bond_originator',
    appRole: 'bond_originator',
    userId,
    profile: { id: userId, email: `${userId}@example.test`, role: 'bond_originator' },
    currentWorkspace: { id: workspaceId, type: 'bond_originator' },
    currentMembership: {
      id: `membership-${userId}`,
      userId,
      organisationId: workspaceId,
      workspaceId,
      workspaceType: 'bond_originator',
      workspaceRole,
      organisationRole: workspaceRole,
      scope_level: scopeLevel,
      regionId,
      branchId,
      workspaceUnitId: branchId,
      status: 'active',
    },
    activeMemberships: [],
  }
}

try {
  const portal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const collaboration = await server.ssrLoadModule('/src/services/bondPartnerCollaborationService.js')
  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  collaboration.__bondPartnerCollaborationServiceTestUtils.clearStores()

  const workspaceId = 'workspace-partner-collaboration'
  const partners = [
    { id: 'partner-agency', organisationId: workspaceId, name: 'Harcourts Bedfordview', type: 'agency', status: 'active' },
    { id: 'partner-other', organisationId: workspaceId, name: 'Other Agency', type: 'agency', status: 'active' },
  ]
  const portalUsers = [
    { id: 'portal-user-agency', partnerId: 'partner-agency', email: 'agency@example.test', name: 'Agency User', token: 'agency-token', status: 'active' },
    { id: 'portal-user-other', partnerId: 'partner-other', email: 'other@example.test', name: 'Other User', token: 'other-token', status: 'active' },
  ]
  const applications = [
    {
      id: 'app-agency-1',
      partnerId: 'partner-agency',
      partnerName: 'Harcourts Bedfordview',
      client: 'John Buyer',
      property: '12 Main Road',
      applicationReference: 'BO-2026-010',
      consultant: 'Sarah Jacobs',
      assignedConsultantId: 'consultant-sarah',
      assignedBranchId: 'branch-east',
      assignedRegionId: 'region-gauteng',
      status: 'active',
      financeStageLabel: 'Documents Received',
    },
    {
      id: 'app-other-1',
      partnerId: 'partner-other',
      partnerName: 'Other Agency',
      client: 'Other Buyer',
      property: '9 Side Road',
      applicationReference: 'BO-2026-011',
      consultant: 'Peter North',
      assignedConsultantId: 'consultant-peter',
      assignedBranchId: 'branch-coast',
      assignedRegionId: 'region-coast',
      status: 'active',
      financeStageLabel: 'Bank Feedback',
    },
  ]
  const documentRequests = [
    { id: 'request-payslip', applicationId: 'app-agency-1', documentName: 'Payslip', requestedBy: 'Sarah Jacobs', status: 'requested' },
  ]
  const commonOptions = { workspaceId, partners, portalUsers, applications, documentRequests }
  const agencyContext = { token: 'agency-token' }
  const hqContext = makeContext({ workspaceId })

  portal.uploadPartnerDocument('app-agency-1', {
    id: 'uploaded-payslip',
    name: 'Payslip',
    documentType: 'payslip',
    requestId: 'request-payslip',
  }, agencyContext, commonOptions)
  portal.addPartnerComment('app-agency-1', { id: 'comment-1', message: 'Buyer has uploaded the requested payslip.' }, agencyContext, commonOptions)
  portal.createPartnerSupportTicket({
    id: 'support-1',
    type: 'Application Query',
    applicationId: 'app-agency-1',
    subject: 'Status update',
    message: 'Can we confirm bank submission?',
  }, agencyContext, commonOptions)

  const requests = collaboration.getPartnerRequests(hqContext, commonOptions)
  assert.ok(requests.some((row) => row.sourceKey === 'document:uploaded-payslip'), 'partner upload creates review item')
  assert.ok(requests.some((row) => row.sourceKey === 'comment:comment-1'), 'partner comment creates inbox item')
  assert.ok(requests.some((row) => row.sourceKey === 'support:support-1'), 'support ticket creates operational request')

  const inbox = collaboration.getPartnerInbox(hqContext, commonOptions)
  assert.equal(inbox.categories.documentsUploaded.length, 1)
  assert.equal(inbox.categories.awaitingResponse.length, 2)
  assert.equal(inbox.categories.supportTickets.length, 1)

  const documentRequest = requests.find((row) => row.sourceKey === 'document:uploaded-payslip')
  const reviewed = collaboration.reviewPartnerDocument(documentRequest.id, 'accepted', hqContext, commonOptions)
  assert.equal(reviewed.status, collaboration.BOND_PARTNER_REQUEST_STATUSES.resolved)
  assert.ok(collaboration.__bondPartnerCollaborationServiceTestUtils.getActivity(workspaceId).some((row) => row.eventType === collaboration.BOND_PARTNER_REQUEST_EVENTS.documentAccepted))

  const supportRequest = collaboration.getPartnerRequests(hqContext, commonOptions).find((row) => row.sourceKey === 'support:support-1')
  const assigned = collaboration.assignPartnerRequest(supportRequest.id, 'consultant-sarah', hqContext, { ...commonOptions, ownerName: 'Sarah Jacobs' })
  assert.equal(assigned.ownerConsultantId, 'consultant-sarah')
  assert.ok(collaboration.__bondPartnerCollaborationServiceTestUtils.getNotifications(workspaceId).some((row) => row.type === collaboration.BOND_PARTNER_REQUEST_EVENTS.assigned))

  const reply = collaboration.replyToPartnerRequest(assigned.id, { message: 'We are checking the bank submission now.' }, hqContext, commonOptions)
  assert.equal(reply.request.status, collaboration.BOND_PARTNER_REQUEST_STATUSES.waitingOnPartner)
  assert.ok(collaboration.__bondPartnerCollaborationServiceTestUtils.getReplies(workspaceId).some((row) => row.visibleToPartner === true))

  const internalNote = collaboration.addInternalNote(assigned.id, { note: 'Watch SLA for this agency relationship.' }, hqContext, commonOptions)
  assert.equal(internalNote.visibleToPartner, false)
  const partnerWorkspace = portal.getPartnerApplication('app-agency-1', agencyContext, commonOptions)
  assert.ok(!partnerWorkspace.comments.some((row) => row.note === internalNote.note), 'internal notes are hidden externally')

  const breachedSla = collaboration.calculatePartnerSLA({
    requestType: 'document_review',
    status: 'assigned',
    createdAt: '2026-06-01T08:00:00.000Z',
    dueAt: '2026-06-01T16:00:00.000Z',
  }, new Date('2026-06-02T08:00:00.000Z'))
  assert.equal(breachedSla.breached, true)
  assert.equal(breachedSla.statusLabel, 'Breached')

  collaboration.__bondPartnerCollaborationServiceTestUtils.seedRequests(workspaceId, [
    ...collaboration.__bondPartnerCollaborationServiceTestUtils.getRequests(workspaceId),
    {
      id: 'overdue-comment',
      partnerId: 'partner-agency',
      partnerName: 'Harcourts Bedfordview',
      applicationId: 'app-agency-1',
      requestType: 'comment',
      priority: 'normal',
      status: 'assigned',
      ownerConsultantId: 'consultant-sarah',
      branchId: 'branch-east',
      regionId: 'region-gauteng',
      title: 'Overdue partner response',
      sourceKey: 'manual:overdue-comment',
      createdAt: '2026-06-01T08:00:00.000Z',
      dueAt: '2026-06-02T08:00:00.000Z',
    },
  ])
  const breachedInbox = collaboration.getPartnerInbox(hqContext, { ...commonOptions, now: '2026-06-03T08:00:00.000Z' })
  const autoEscalated = breachedInbox.rows.find((row) => row.id === 'overdue-comment')
  assert.equal(autoEscalated.escalated, true)
  assert.equal(autoEscalated.priority, 'urgent')
  assert.ok(collaboration.__bondPartnerCollaborationServiceTestUtils.getActivity(workspaceId).some((row) => row.eventType === collaboration.BOND_PARTNER_REQUEST_EVENTS.slaBreached))

  const escalated = collaboration.escalatePartnerRequest(assigned.id, { reason: 'SLA at risk' }, hqContext, commonOptions)
  assert.equal(escalated.escalated, true)
  assert.equal(escalated.priority, 'urgent')
  assert.ok(collaboration.__bondPartnerCollaborationServiceTestUtils.getActivity(workspaceId).some((row) => row.eventType === collaboration.BOND_PARTNER_REQUEST_EVENTS.escalated))

  const dashboard = collaboration.getPartnerOperationsDashboard(hqContext, commonOptions)
  assert.ok(dashboard.metrics.openRequests >= 1)
  assert.ok(dashboard.metrics.escalations >= 1)
  assert.ok(dashboard.branches.some((row) => row.id === 'branch-east'))
  assert.ok(dashboard.regions.some((row) => row.id === 'region-gauteng'))
  assert.ok(dashboard.consultants.some((row) => row.id === 'consultant-sarah'))
  assert.ok(['Excellent', 'Healthy', 'At Risk', 'Critical'].includes(dashboard.health.health))

  const regionalContext = makeContext({
    workspaceId,
    userId: 'regional-gauteng',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-gauteng',
  })
  const regionalRequests = collaboration.getPartnerRequests(regionalContext, commonOptions)
  assert.ok(regionalRequests.length >= 1)
  assert.ok(regionalRequests.every((row) => row.regionId === 'region-gauteng'))

  const branchContext = makeContext({
    workspaceId,
    userId: 'branch-east-manager',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    regionId: 'region-gauteng',
    branchId: 'branch-east',
  })
  const branchRequests = collaboration.getPartnerRequests(branchContext, commonOptions)
  assert.ok(branchRequests.length >= 1)
  assert.ok(branchRequests.every((row) => row.branchId === 'branch-east'))

  const consultantContext = makeContext({
    workspaceId,
    userId: 'consultant-sarah',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    regionId: 'region-gauteng',
    branchId: 'branch-east',
  })
  const consultantRequests = collaboration.getPartnerRequests(consultantContext, commonOptions)
  assert.ok(consultantRequests.length >= 1)
  assert.ok(consultantRequests.every((row) => row.ownerConsultantId === 'consultant-sarah'))

  const outsiderBranchContext = makeContext({
    workspaceId,
    userId: 'branch-coast-manager',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    regionId: 'region-coast',
    branchId: 'branch-coast',
  })
  assert.equal(collaboration.getPartnerRequests(outsiderBranchContext, commonOptions).length, 0)

  const resolved = collaboration.resolveSupportTicket(escalated.id, { resolution: 'Confirmed and closed.' }, hqContext, commonOptions)
  assert.equal(resolved.status, collaboration.BOND_PARTNER_REQUEST_STATUSES.resolved)
  assert.ok(collaboration.__bondPartnerCollaborationServiceTestUtils.getActivity(workspaceId).some((row) => row.eventType === collaboration.BOND_PARTNER_REQUEST_EVENTS.supportResolved))

  console.log('bondPartnerCollaborationService tests passed')
} finally {
  await server.close()
}
