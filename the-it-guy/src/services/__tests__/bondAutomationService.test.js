/* global process */
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const workspaceId = 'workspace-bond-automation'
const now = '2026-06-04T08:00:00.000Z'

function makeContext({
  userId = 'user-hq',
  workspaceRole = 'operations_manager',
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

const regions = [
  { id: 'region-gauteng', name: 'Gauteng', forecastCapacityRisk: 88 },
]

const branches = [
  { id: 'branch-east', name: 'East Rand Branch', regionId: 'region-gauteng', healthScore: 35 },
]

const consultants = [
  { id: 'consultant-john', name: 'John Smith', regionId: 'region-gauteng', branchId: 'branch-east', activeApplications: 44, approvalRate: 58 },
]

const applications = [
  {
    id: 'app-auto-1',
    applicationReference: 'AUTO-1',
    assignedConsultantId: 'consultant-john',
    assignedUserId: 'consultant-john',
    assignedBranchId: 'branch-east',
    branchId: 'branch-east',
    assignedRegionId: 'region-gauteng',
    regionId: 'region-gauteng',
    status: 'submitted to bank instruction issued',
    financeStatus: 'submitted to bank instruction issued',
    revenueStatus: 'Payable',
    submittedAt: '2026-05-28T08:00:00.000Z',
    updatedAt: '2026-05-25T08:00:00.000Z',
  },
]

const documents = [
  { id: 'doc-auto-1', applicationId: 'app-auto-1', status: 'requested', requestedAt: '2026-05-30T08:00:00.000Z' },
]

const partners = [
  { id: 'partner-risk', name: 'Harcourts Bedfordview', healthScore: 42 },
]

const banks = [
  { id: 'bank-fnb', name: 'FNB', responseDelayPercent: 34, healthScore: 58 },
]

const slaRequests = [
  { id: 'sla-auto-1', status: 'open', slaConsumedPercent: 85 },
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
  slaRequests,
}

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const portal = await server.ssrLoadModule('/src/services/bondPartnerPortalService.js')
  const engine = await server.ssrLoadModule('/src/services/bondAutomationEngine.js')
  const automation = await server.ssrLoadModule('/src/services/bondAutomationService.js')

  portal.__bondPartnerPortalServiceTestUtils.clearStores()
  automation.__bondAutomationServiceTestUtils.clearStores()

  const hqContext = makeContext()
  const dashboard = automation.getAutomationDashboard(hqContext, commonOptions)
  assert.equal(dashboard.permissions.canManageRules, true)
  assert.equal(dashboard.summary.activeRules >= 10, true)
  assert.equal(dashboard.templates.some((template) => template.name === 'Document Reminder'), true)

  const customRule = automation.createRule({
    name: 'Test no feedback escalation',
    category: 'Applications',
    trigger: { event: 'no_bank_feedback', entityType: 'application' },
    conditions: [{ field: 'daysSinceSubmitted', operator: 'gte', threshold: 5 }],
    actions: [{ type: 'create_escalation', target: 'branch_manager' }, { type: 'send_notification', target: 'consultant' }],
  }, hqContext, commonOptions)
  assert.equal(customRule.name, 'Test no feedback escalation')
  assert.equal(automation.__bondAutomationServiceTestUtils.getRules(workspaceId).length, 1)

  const entity = {
    id: 'app-auto-1',
    entityType: 'application',
    eventType: 'no_bank_feedback',
    daysSinceSubmitted: 7,
  }
  const evaluated = automation.evaluateRule(customRule, entity, hqContext, commonOptions)
  assert.equal(evaluated.matched, true)

  const simulation = automation.simulateRule(customRule, hqContext, { ...commonOptions, entities: [entity] })
  assert.equal(simulation.triggerCount, 1)
  assert.equal(simulation.created.escalations, 1)
  assert.equal(simulation.created.notifications, 1)

  const execution = automation.executeRule(customRule, entity, hqContext, commonOptions)
  assert.equal(execution.executed, true)
  assert.equal(automation.__bondAutomationServiceTestUtils.getRuns(workspaceId).length, 1)
  assert.equal(automation.__bondAutomationServiceTestUtils.getHistory(workspaceId).some((row) => row.actionType === 'create_escalation'), true)

  const updated = automation.updateRule(customRule.id, { name: 'Updated no feedback escalation' }, hqContext, commonOptions)
  assert.equal(updated.name, 'Updated no feedback escalation')
  assert.equal(automation.disableRule(customRule.id, hqContext, commonOptions).status, 'disabled')
  assert.equal(automation.enableRule(customRule.id, hqContext, commonOptions).status, 'active')

  const documentRule = dashboard.rules.find((rule) => rule.id === 'auto-document-missing')
  const documentSimulation = automation.simulateRule(documentRule, hqContext, commonOptions)
  assert.equal(documentSimulation.triggerCount, 1)
  assert.equal(documentSimulation.created.tasks, 1)

  const partnerRule = dashboard.rules.find((rule) => rule.id === 'auto-partner-health-risk')
  assert.equal(automation.simulateRule(partnerRule, hqContext, commonOptions).created.escalations, 1)

  const consultantRule = dashboard.rules.find((rule) => rule.id === 'auto-consultant-overloaded')
  assert.equal(automation.simulateRule(consultantRule, hqContext, commonOptions).created.recommendations, 1)

  const slaRule = dashboard.rules.find((rule) => rule.id === 'auto-sla-at-risk')
  assert.equal(automation.simulateRule(slaRule, hqContext, commonOptions).created.notifications, 2)

  const revenueRule = dashboard.rules.find((rule) => rule.id === 'auto-commission-ready')
  assert.equal(automation.simulateRule(revenueRule, hqContext, commonOptions).created.payouts, 2)

  const branchRule = dashboard.rules.find((rule) => rule.id === 'auto-branch-critical')
  assert.equal(automation.simulateRule(branchRule, hqContext, commonOptions).created.recommendations, 1)

  const regionRule = dashboard.rules.find((rule) => rule.id === 'auto-regional-capacity-risk')
  assert.equal(automation.simulateRule(regionRule, hqContext, commonOptions).created.recommendations, 1)

  const bankRule = dashboard.rules.find((rule) => rule.id === 'auto-bank-response-delay')
  assert.equal(automation.simulateRule(bankRule, hqContext, commonOptions).created.escalations, 1)

  const analytics = automation.getAutomationAnalytics(hqContext, commonOptions)
  assert.equal(analytics.rulesTriggered, 1)
  assert.equal(analytics.successRate, 100)
  assert.equal(analytics.escalationsCreated, 1)

  const recommendations = automation.getAutomationRecommendations(hqContext, commonOptions)
  assert.equal(recommendations.some((row) => row.id === 'recommend-no-bank-feedback'), true)
  assert.equal(recommendations.some((row) => row.id === 'recommend-document-reminders'), true)
  assert.equal(recommendations.some((row) => row.id === 'recommend-capacity-rebalancing'), true)

  const history = automation.getAutomationHistory(hqContext, { ...commonOptions, ruleId: customRule.id })
  assert.equal(history.length >= 2, true)

  const pureResult = engine.executeRule(customRule, entity)
  assert.equal(pureResult.executed, true)
  assert.equal(engine.disableRule(customRule).status, 'disabled')
  assert.equal(engine.enableRule(customRule).status, 'active')
  assert.equal(engine.getRuleHistory(customRule.id, history).length, history.length)

  const regionalContext = makeContext({ userId: 'regional-user', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-gauteng' })
  const regionalDashboard = automation.getAutomationDashboard(regionalContext, commonOptions)
  assert.equal(regionalDashboard.permissions.canManageRules, false)
  assert.throws(
    () => automation.createRule({ name: 'Not allowed' }, regionalContext, commonOptions),
    /Only HQ and operations managers/i,
  )

  const branchContext = makeContext({ userId: 'branch-user', workspaceRole: 'branch_manager', scopeLevel: 'branch', regionId: 'region-gauteng', branchId: 'branch-east' })
  assert.throws(
    () => automation.getAutomationDashboard(branchContext, commonOptions),
    /access is not permitted/i,
  )

  const consultantContext = makeContext({ userId: 'consultant-john', workspaceRole: 'consultant', scopeLevel: 'assigned', regionId: 'region-gauteng', branchId: 'branch-east' })
  assert.throws(
    () => automation.getAutomationDashboard(consultantContext, commonOptions),
    /access is not permitted/i,
  )

  console.log('bond automation service tests passed')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await server.close()
}
