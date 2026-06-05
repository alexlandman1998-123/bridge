/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const workspaceId = 'workspace-bank-relationships'
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

function application(consultantId, index, overrides = {}) {
  const bank = overrides.bank || 'FNB'
  return {
    id: `${consultantId}-${bank.replaceAll(' ', '-')}-${index}`,
    applicationReference: `BO-BANK-${consultantId}-${index}`,
    assignedConsultantId: consultantId,
    assignedUserId: consultantId,
    consultantName: overrides.consultantName || 'John Smith',
    assignedBranchId: overrides.branchId || 'branch-east',
    branchId: overrides.branchId || 'branch-east',
    branchName: overrides.branchName || 'East Rand Branch',
    assignedRegionId: overrides.regionId || 'region-gauteng',
    regionId: overrides.regionId || 'region-gauteng',
    bank,
    banksSubmittedTo: overrides.banksSubmittedTo || [bank],
    status: overrides.status || 'submitted to bank feedback received',
    financeStatus: overrides.financeStatus || 'submitted to bank feedback received',
    declineReason: overrides.declineReason || '',
    createdAt: overrides.createdAt || '2026-05-01T08:00:00.000Z',
    submittedAt: overrides.submittedAt || '2026-05-02T08:00:00.000Z',
    bankFeedbackAt: overrides.bankFeedbackAt || '2026-05-05T08:00:00.000Z',
    approvedAt: overrides.approvedAt || '',
    updatedAt: overrides.updatedAt || '2026-05-06T08:00:00.000Z',
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
  { id: 'consultant-john', name: 'John Smith', regionId: 'region-gauteng', branchId: 'branch-east', status: 'active' },
  { id: 'consultant-sarah', name: 'Sarah Jacobs', regionId: 'region-gauteng', branchId: 'branch-east', status: 'active' },
  { id: 'consultant-peter', name: 'Peter Jacobs', regionId: 'region-gauteng', branchId: 'branch-west', status: 'active' },
  { id: 'consultant-lindi', name: 'Lindi Mokoena', regionId: 'region-coast', branchId: 'branch-coast', status: 'active' },
]

const applications = [
  ...range(20, (index) => application('consultant-john', index, {
    bank: 'FNB',
    consultantName: 'John Smith',
    financeStatus: index <= 12 ? 'approval submitted quote approved instruction sent' : index <= 16 ? 'submitted to bank feedback received' : 'declined by bank',
    status: index <= 12 ? 'approval submitted quote approved instruction sent' : index <= 16 ? 'submitted to bank feedback received' : 'declined by bank',
    approvedAt: index <= 12 ? '2026-05-04T08:00:00.000Z' : '',
    declineReason: index > 16 ? 'Affordability' : '',
    bankFeedbackAt: '2026-05-05T08:00:00.000Z',
  })),
  ...range(12, (index) => application('consultant-sarah', index, {
    bank: 'ABSA',
    consultantName: 'Sarah Jacobs',
    financeStatus: index <= 8 ? 'approval submitted instruction sent' : index <= 10 ? 'submitted acknowledged reviewed' : 'declined by bank',
    status: index <= 8 ? 'approval submitted instruction sent' : index <= 10 ? 'submitted acknowledged reviewed' : 'declined by bank',
    approvedAt: index <= 8 ? '2026-05-03T08:00:00.000Z' : '',
    declineReason: index > 10 ? 'Credit profile' : '',
    bankFeedbackAt: '2026-05-03T12:00:00.000Z',
  })),
  ...range(8, (index) => application('consultant-peter', index, {
    bank: 'Nedbank',
    consultantName: 'Peter Jacobs',
    branchId: 'branch-west',
    branchName: 'Johannesburg Branch',
    regionId: 'region-gauteng',
    financeStatus: index <= 3 ? 'approval submitted quote approved' : 'submitted to bank',
    status: index <= 3 ? 'approval submitted quote approved' : 'submitted to bank',
    approvedAt: index <= 3 ? '2026-05-06T08:00:00.000Z' : '',
    bankFeedbackAt: '2026-05-10T08:00:00.000Z',
  })),
  ...range(6, (index) => application('consultant-lindi', index, {
    bank: 'Standard Bank',
    consultantName: 'Lindi Mokoena',
    branchId: 'branch-coast',
    branchName: 'Atlantic Branch',
    regionId: 'region-coast',
    financeStatus: index <= 2 ? 'approval submitted instruction sent' : 'declined by bank',
    status: index <= 2 ? 'approval submitted instruction sent' : 'declined by bank',
    approvedAt: index <= 2 ? '2026-05-08T08:00:00.000Z' : '',
    declineReason: index > 2 ? 'Documentation incomplete' : '',
    bankFeedbackAt: '2026-05-18T08:00:00.000Z',
  })),
  application('consultant-lindi', 1, {
    bank: 'Investec',
    consultantName: 'Lindi Mokoena',
    branchId: 'branch-coast',
    branchName: 'Atlantic Branch',
    regionId: 'region-coast',
    financeStatus: 'submitted to bank feedback received',
    status: 'submitted to bank feedback received',
    bankFeedbackAt: '2026-05-25T08:00:00.000Z',
  }),
]

const originatorBanks = [
  { id: 'panel-fnb', bankId: 'fnb', status: 'active', primaryContactName: 'FNB Relationship Desk', slaDays: 3, supportedProducts: ['Residential Bond'] },
  { id: 'panel-absa', bankId: 'absa', status: 'active', primaryContactName: 'ABSA Relationship Desk', slaDays: 3, supportedProducts: ['Residential Bond'] },
  { id: 'panel-nedbank', bankId: 'nedbank', status: 'active', primaryContactName: 'Nedbank Relationship Desk', slaDays: 4, supportedProducts: ['Residential Bond'] },
  { id: 'panel-standard-bank', bankId: 'standard-bank', status: 'active', primaryContactName: 'Standard Bank Relationship Desk', slaDays: 5, supportedProducts: ['Residential Bond'] },
  { id: 'panel-investec', bankId: 'investec', status: 'active', primaryContactName: 'Investec Relationship Desk', slaDays: 5, supportedProducts: ['Residential Bond'] },
  { id: 'panel-capitec', bankId: 'capitec', status: 'inactive', primaryContactName: 'Capitec Relationship Desk', slaDays: 5, supportedProducts: ['Residential Bond'] },
]

const commonOptions = {
  workspaceId,
  applications,
  regions,
  branches,
  consultants,
  originatorBanks,
  now,
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const portal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const service = await server.ssrLoadModule('/src/services/bondBankRelationshipService.js')

  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  service.__bondBankRelationshipServiceTestUtils.clearStores()
  const hqContext = makeContext()

  service.__bondBankRelationshipServiceTestUtils.seedEscalations(workspaceId, [
    {
      id: 'esc-fnb-slow',
      bankId: 'fnb',
      applicationId: 'consultant-john-FNB-18',
      consultantId: 'consultant-john',
      consultantName: 'John Smith',
      branchId: 'branch-east',
      regionId: 'region-gauteng',
      issue: 'Missing bank feedback',
      issueType: 'Missing Feedback',
      priority: 'High',
      status: 'open',
      createdAt: '2026-05-20T08:00:00.000Z',
    },
  ])
  service.__bondBankRelationshipServiceTestUtils.seedFeedback(workspaceId, [
    {
      id: 'feedback-fnb-positive',
      bankId: 'fnb',
      feedbackType: 'Positive Experience',
      message: 'FNB credit team was helpful on a complex application.',
      consultantId: 'consultant-john',
      branchId: 'branch-east',
      regionId: 'region-gauteng',
      createdAt: '2026-05-22T08:00:00.000Z',
    },
    {
      id: 'feedback-standard-negative',
      bankId: 'standard-bank',
      feedbackType: 'Negative Experience',
      message: 'Standard Bank delayed response on documentation review.',
      consultantId: 'consultant-lindi',
      branchId: 'branch-coast',
      regionId: 'region-coast',
      createdAt: '2026-05-22T08:00:00.000Z',
    },
  ])

  const dashboard = service.getBankDashboard(hqContext, commonOptions)
  assert.equal(dashboard.summary.applicationsSubmitted, applications.length)
  assert.equal(dashboard.summary.approvals > 0, true)
  assert.equal(dashboard.summary.activeBanks >= 5, true)

  const commandCentre = service.getBankRelationshipCommandCentre(hqContext, { ...commonOptions, platformRevenuePerBond: 500 })
  assert.equal(commandCentre.kpis.totalApplications, applications.length)
  assert.equal(commandCentre.kpis.fastestBank.bankName, 'ABSA')
  assert.equal(commandCentre.kpis.mostUsedBank.bankName, 'FNB')
  assert.equal(commandCentre.kpis.revenueGenerated, commandCentre.performanceMatrix.reduce((sum, row) => sum + row.approvals, 0) * 500)
  assert.equal(commandCentre.leaderboard.topBanks.length > 0, true)
  assert.equal(commandCentre.performanceMatrix.some((row) => row.bankName === 'FNB' && row.revenueGenerated > 0), true)
  assert.equal(commandCentre.performanceMatrix.some((row) => row.bankName === 'Capitec'), false)
  assert.equal(commandCentre.performanceMatrix.every((row) => ['Excellent', 'Good', 'Fair', 'Poor', 'Critical', 'Not enough data'].includes(row.healthStatus)), true)
  assert.equal(commandCentre.distribution[0].bankName, 'FNB')
  assert.equal(commandCentre.approvalFunnel.some((row) => row.stage === 'Applications Submitted'), true)
  assert.equal(commandCentre.approvalFunnel.some((row) => row.stage === 'Approved'), true)
  assert.equal(commandCentre.approvalFunnel.some((row) => row.stage === 'Instruction Issued'), true)
  assert.equal(commandCentre.regionalSlaHeatmap.rows.some((row) => row.regionName === 'Gauteng' && row.cells.some((cell) => cell.bankName === 'FNB' && cell.responseTime > 0)), true)
  assert.equal(commandCentre.trends.length, 4)
  assert.equal(commandCentre.insights.length > 0, true)
  assert.equal(commandCentre.profiles.some((profile) => profile.bankName === 'FNB'), true)

  const unconfiguredCommandCentre = service.getBankRelationshipCommandCentre(hqContext, {
    workspaceId: 'workspace-without-bank-panel',
    applications,
    regions,
    branches,
    consultants,
    now,
  })
  assert.equal(unconfiguredCommandCentre.performanceMatrix.length, 0)

  const customRevenue = service.getBankRelationshipCommandCentre(hqContext, { ...commonOptions, platformRevenuePerBond: 750 })
  assert.equal(customRevenue.kpis.revenueGenerated, commandCentre.kpis.revenueGenerated * 1.5)
  assert.equal(service.calculateBankRelationshipCommandHealthScore({ applications: 0 }), null)
  assert.equal(service.calculateBankRelationshipCommandHealthScore({
    applications: 20,
    approvalRate: 80,
    averageResponseTime: 48,
    instructionRate: 70,
    escalationCount: 0,
  }) > 70, true)

  const workspace = service.getBankWorkspace('fnb', hqContext, commonOptions)
  assert.equal(workspace.bank.name, 'FNB')
  assert.equal(workspace.tabs.includes('Contacts'), true)
  assert.equal(workspace.applications.length, 20)

  const health = service.calculateBankRelationshipHealth('fnb', hqContext, commonOptions)
  assert.equal(health.score >= 0 && health.score <= 100, true)
  assert.equal(['Excellent', 'Healthy', 'At Risk', 'Critical'].includes(health.status), true)

  const rankings = service.getBankRankings(hqContext, commonOptions)
  assert.equal(rankings.bestOverall.length > 0, true)
  assert.equal(rankings.fastest[0].bankName, 'ABSA')
  assert.equal(rankings.mostAtRisk.some((row) => row.bankName === 'Standard Bank'), true)

  const comparison = service.getBankComparison(hqContext, commonOptions)
  assert.equal(comparison.some((row) => row.bankName === 'FNB' && row.applications === 20), true)
  assert.equal(comparison.some((row) => row.bankName === 'ABSA' && row.approvalRate > 0), true)

  const createdEscalation = service.createBankEscalation({
    bankId: 'absa',
    applicationId: 'consultant-sarah-ABSA-11',
    consultantId: 'consultant-sarah',
    consultantName: 'Sarah Jacobs',
    branchId: 'branch-east',
    regionId: 'region-gauteng',
    issue: 'Slow response on approval pack',
    issueType: 'Slow Responses',
    priority: 'Medium',
  }, hqContext, commonOptions)
  assert.equal(createdEscalation.bankId, 'absa')
  assert.equal(service.getBankEscalations('absa', hqContext, commonOptions).length, 1)

  const contact = service.createBankContact({
    bankId: 'fnb',
    name: 'Mpho Dlamini',
    role: 'Business Development Manager',
    email: 'mpho@example.test',
    phone: '+27 11 555 0100',
    region: 'Gauteng',
    notes: 'Primary national relationship contact.',
  }, hqContext, commonOptions)
  assert.equal(service.getBankContacts('fnb', hqContext, commonOptions).length, 1)
  const updatedContact = service.updateBankContact(contact.id, { phone: '+27 11 555 0101' }, hqContext, commonOptions)
  assert.equal(updatedContact.phone, '+27 11 555 0101')

  const declineAnalysis = service.getDeclineAnalysis(hqContext, commonOptions)
  assert.equal(declineAnalysis.some((row) => row.reason === 'Affordability' && row.affectedBank === 'FNB'), true)
  assert.equal(declineAnalysis.some((row) => row.reason === 'Credit Profile' && row.affectedBank === 'ABSA'), true)

  const feedback = service.createConsultantFeedback('nedbank', {
    feedbackType: 'Negative Experience',
    message: 'Nedbank delayed response on latest file.',
    consultantId: 'consultant-peter',
    consultantName: 'Peter Jacobs',
    branchId: 'branch-west',
    regionId: 'region-gauteng',
  }, makeContext({ userId: 'consultant-peter', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-gauteng', branchId: 'branch-west' }), commonOptions)
  assert.equal(feedback.bankId, 'nedbank')
  assert.equal(service.getConsultantFeedback('nedbank', hqContext, commonOptions).some((row) => row.id === feedback.id), true)

  const regionalPerformance = service.getRegionalBankPerformance(makeContext({
    userId: 'regional-gauteng',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-gauteng',
  }), commonOptions)
  assert.equal(regionalPerformance.some((row) => row.regionName === 'Gauteng' && row.bankName === 'FNB'), true)
  assert.equal(regionalPerformance.some((row) => row.regionName === 'Coastal'), false)

  const branchPerformance = service.getBranchBankPerformance(makeContext({
    userId: 'branch-east-manager',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    regionId: 'region-gauteng',
    branchId: 'branch-east',
  }), commonOptions)
  assert.equal(branchPerformance.every((row) => row.branchName === 'East Rand Branch'), true)

  const submissionAnalytics = service.getBankSubmissionAnalytics('fnb', hqContext, commonOptions)
  assert.equal(submissionAnalytics.map((row) => row.stage).includes('Instructed'), true)
  assert.equal(submissionAnalytics.find((row) => row.stage === 'Declined')?.count, 4)

  assert.throws(
    () => service.getBankDashboard(makeContext({ userId: 'consultant-john', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-gauteng', branchId: 'branch-east' }), commonOptions),
    /Bank Relationship Centre/i,
  )
  assert.throws(
    () => service.createBankContact({ bankId: 'absa', name: 'Nope', role: 'Credit Manager' }, makeContext({ userId: 'regional-gauteng', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-gauteng' }), commonOptions),
    /Only HQ/i,
  )

  const activity = service.__bondBankRelationshipServiceTestUtils.getActivity(workspaceId)
  assert.equal(activity.some((row) => row.eventType === service.BOND_BANK_RELATIONSHIP_EVENTS.bankContactAdded), true)
  assert.equal(activity.some((row) => row.eventType === service.BOND_BANK_RELATIONSHIP_EVENTS.bankContactUpdated), true)
  assert.equal(activity.some((row) => row.eventType === service.BOND_BANK_RELATIONSHIP_EVENTS.bankEscalationCreated), true)
  assert.equal(activity.some((row) => row.eventType === service.BOND_BANK_RELATIONSHIP_EVENTS.bankFeedbackAdded), true)
  assert.equal(activity.some((row) => row.eventType === service.BOND_BANK_RELATIONSHIP_EVENTS.bankHealthUpdated), true)

  console.log('bond bank relationship tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
