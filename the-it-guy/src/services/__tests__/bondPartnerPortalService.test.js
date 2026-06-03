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

try {
  const service = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  service.__bondPartnerPortalServiceTestUtils.clearStores()

  const workspaceId = 'workspace-partner-portal'
  const partners = [
    { id: 'partner-agency', organisationId: workspaceId, name: 'Harcourts Bedfordview', type: 'agency', status: 'active' },
    { id: 'partner-development', organisationId: workspaceId, name: 'Waterfall Estate', type: 'development', status: 'active' },
    { id: 'partner-referral', organisationId: workspaceId, name: 'Cape Referral Co', type: 'referral_partner', status: 'active' },
  ]
  const portalUsers = [
    { id: 'portal-user-agency', partnerId: 'partner-agency', email: 'agency@example.test', name: 'Agency User', token: 'agency-token-123', status: 'active' },
    { id: 'portal-user-development', partnerId: 'partner-development', email: 'dev@example.test', name: 'Development User', token: 'development-token-123', status: 'active' },
    { id: 'portal-user-referral', partnerId: 'partner-referral', email: 'ref@example.test', name: 'Referral User', token: 'referral-token-123', status: 'active' },
  ]
  const applications = [
    {
      id: 'app-agency-1',
      partnerId: 'partner-agency',
      partnerName: 'Harcourts Bedfordview',
      client: 'John Buyer',
      property: '12 Main Road',
      applicationReference: 'BO-2026-001',
      consultant: 'Sarah Jacobs',
      consultantEmail: 'sarah@example.test',
      branch: 'East Rand',
      status: 'active',
      financeStageLabel: 'Documents Received',
      financeStageKey: 'documents_received',
      bank: 'ABSA',
      createdAt: '2026-05-01T08:00:00.000Z',
      lastActivityAt: '2026-05-04T08:00:00.000Z',
    },
    {
      id: 'app-agency-2',
      partnerName: 'Harcourts Bedfordview',
      client: 'Jane Buyer',
      property: '14 Main Road',
      applicationReference: 'BO-2026-002',
      consultant: 'Sarah Jacobs',
      status: 'approved',
      financeStageLabel: 'Quote Approved',
      financeStageKey: 'quote_approved',
      bank: 'FNB',
      createdAt: '2026-05-01T08:00:00.000Z',
      lastActivityAt: '2026-05-10T08:00:00.000Z',
    },
    {
      id: 'app-development-1',
      partnerId: 'partner-development',
      partnerName: 'Waterfall Estate',
      client: 'Dev Buyer',
      property: 'Unit 101',
      applicationReference: 'BO-2026-003',
      status: 'approved',
      financeStageLabel: 'Approval Received',
      financeStageKey: 'approval',
    },
    {
      id: 'app-referral-1',
      partnerId: 'partner-referral',
      partnerName: 'Cape Referral Co',
      client: 'Referral Buyer',
      property: 'Cape Home',
      applicationReference: 'BO-2026-004',
      status: 'active',
      financeStageLabel: 'Bank Feedback',
      financeStageKey: 'bank_feedback',
    },
  ]
  const documentRequests = [
    { id: 'request-payslip', applicationId: 'app-agency-1', documentName: 'Payslip', requestedBy: 'Sarah Jacobs', dueDate: '2026-06-10', status: 'requested' },
  ]
  const documents = [
    { id: 'doc-id', applicationId: 'app-agency-1', name: 'ID Document', documentType: 'identity', status: 'received', uploadedAt: '2026-06-01T08:00:00.000Z' },
    { id: 'doc-other', applicationId: 'app-development-1', name: 'Other Partner Document', documentType: 'identity', status: 'received' },
  ]
  const commonOptions = { workspaceId, partners, portalUsers, applications, documentRequests, documents }
  const agencyContext = { token: 'agency-token-123' }

  const dashboard = service.getPartnerDashboard(agencyContext, commonOptions)
  assert.equal(dashboard.partner.name, 'Harcourts Bedfordview')
  assert.equal(dashboard.summaryCards.applicationsSubmitted, 2)
  assert.equal(dashboard.summaryCards.approvals, 1)
  assert.equal(dashboard.performance.type, 'agency')

  const agencyApplications = service.getPartnerApplications(agencyContext, commonOptions)
  assert.equal(agencyApplications.length, 2)
  assert.ok(agencyApplications.every((row) => ['BO-2026-001', 'BO-2026-002'].includes(row.reference)))

  const approvedOnly = service.getPartnerApplications(agencyContext, { ...commonOptions, filter: 'approved' })
  assert.equal(approvedOnly.length, 1)
  assert.equal(approvedOnly[0].reference, 'BO-2026-002')

  assert.throws(
    () => service.getPartnerApplication('app-development-1', agencyContext, commonOptions),
    /not permitted/,
  )

  const workspace = service.getPartnerApplication('app-agency-1', agencyContext, commonOptions)
  assert.equal(workspace.documents.outstandingDocuments.length, 1)
  assert.equal(workspace.financeProgress.documentsReceived, 1)
  assert.equal(workspace.financeProgress.documentsOutstanding, 1)

  const uploaded = service.uploadPartnerDocument('app-agency-1', {
    name: 'Payslip',
    documentType: 'payslip',
    requestId: 'request-payslip',
  }, agencyContext, commonOptions)
  assert.equal(uploaded.status, 'received')
  assert.ok(service.__bondPartnerPortalServiceTestUtils.getDocuments(workspaceId).some((row) => row.name === 'Payslip'))

  const comment = service.addPartnerComment('app-agency-1', { message: 'Buyer uploaded the requested payslip.' }, agencyContext, commonOptions)
  assert.match(comment.message, /payslip/)

  const support = service.createPartnerSupportTicket({ type: 'Document Issue', applicationId: 'app-agency-1', subject: 'Upload query', message: 'Need help replacing a bank statement.' }, agencyContext, commonOptions)
  assert.equal(support.status, 'open')
  assert.equal(service.__bondPartnerPortalServiceTestUtils.getSupportTickets(workspaceId).length, 1)

  const activity = service.getPartnerActivity(agencyContext, commonOptions)
  assert.ok(activity.some((row) => row.eventType === service.BOND_PARTNER_PORTAL_EVENTS.documentUploaded || row.title.includes('uploaded')))
  assert.ok(service.__bondPartnerPortalServiceTestUtils.getAudit(workspaceId).some((row) => row.eventType === service.BOND_PARTNER_PORTAL_EVENTS.commentAdded))
  assert.ok(service.__bondPartnerPortalServiceTestUtils.getAudit(workspaceId).some((row) => row.eventType === service.BOND_PARTNER_PORTAL_EVENTS.supportCreated))
  assert.ok(service.__bondPartnerPortalServiceTestUtils.getNotifications(workspaceId).some((row) => row.type === service.BOND_PARTNER_PORTAL_EVENTS.supportCreated))

  const developmentDashboard = service.getPartnerDashboard({ token: 'development-token-123' }, commonOptions)
  assert.equal(developmentDashboard.performance.type, 'development')
  assert.equal(developmentDashboard.performance.metrics.unitsSold, 1)

  const referralDashboard = service.getPartnerDashboard({ token: 'referral-token-123' }, commonOptions)
  assert.equal(referralDashboard.performance.type, 'referral')
  assert.equal(referralDashboard.performance.metrics.referredClients, 1)

  console.log('bondPartnerPortalService tests passed')
} finally {
  await server.close()
}
