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
  const service = await server.ssrLoadModule('/src/services/bondRoutingRulesService.js')
  service.__bondRoutingRulesServiceTestUtils.clearStores()

  const workspaceId = 'workspace-routing'
  const regions = [
    { id: 'region-gauteng', name: 'Gauteng', defaultBranchId: 'branch-jhb' },
    { id: 'region-cape', name: 'Western Cape' },
  ]
  const branches = [
    { id: 'branch-east', name: 'East Rand Branch', regionId: 'region-gauteng', maximumCapacity: 1, overflowDestinationBranch: 'branch-jhb' },
    { id: 'branch-midrand', name: 'Midrand Branch', regionId: 'region-gauteng' },
    { id: 'branch-jhb', name: 'Johannesburg Central', regionId: 'region-gauteng' },
    { id: 'branch-cape', name: 'Cape Branch', regionId: 'region-cape' },
  ]
  const consultants = [
    { id: 'consultant-east', firstName: 'John', lastName: 'Smith', branchId: 'branch-east', regionId: 'region-gauteng', status: 'active' },
    { id: 'consultant-midrand', firstName: 'Sarah', lastName: 'Jones', branchId: 'branch-midrand', regionId: 'region-gauteng', status: 'active' },
    { id: 'consultant-jhb', firstName: 'Peter', lastName: 'Adams', branchId: 'branch-jhb', regionId: 'region-gauteng', status: 'active' },
    { id: 'consultant-cape', firstName: 'Cape', lastName: 'Owner', branchId: 'branch-cape', regionId: 'region-cape', status: 'active' },
  ]
  const applications = [
    { id: 'existing-east', assignedBranchId: 'branch-east', assignedUserId: 'consultant-east', status: 'active', partnerName: 'Harcourts Bedfordview', routingMethod: 'AGENCY_DEFAULT' },
    { id: 'approved-agency', assignedBranchId: 'branch-east', assignedUserId: 'consultant-east', status: 'approved', partnerName: 'Harcourts Bedfordview', routingMethod: 'AGENCY_DEFAULT' },
    { id: 'approved-development', assignedBranchId: 'branch-midrand', assignedUserId: 'consultant-midrand', status: 'approved', developmentName: 'Waterfall Estate', routingMethod: 'DEVELOPMENT_DEFAULT' },
    { id: 'workload-row', assignedBranchId: 'branch-jhb', assignedUserId: 'consultant-jhb', status: 'active', routingMethod: 'WORKLOAD_BALANCED' },
  ]

  function makeContext({
    userId = 'hq-owner',
    workspaceRole = 'owner',
    scopeLevel = 'workspace_hq',
    regionId = '',
    workspaceUnitId = '',
  } = {}) {
    return {
      appRole: 'bond_originator',
      workspaceType: 'bond_originator',
      userId,
      profile: { id: userId, email: `${userId}@example.test` },
      currentWorkspace: { id: workspaceId, type: 'bond_originator' },
      currentMembership: {
        id: `membership-${userId}`,
        status: 'active',
        user_id: userId,
        organisation_id: workspaceId,
        workspaceRole,
        workspace_role: workspaceRole,
        scopeLevel,
        scope_level: scopeLevel,
        regionId,
        region_id: regionId,
        workspaceUnitId,
        workspace_unit_id: workspaceUnitId,
      },
    }
  }

  const hqContext = makeContext()
  const commonOptions = { regions, branches, consultants, applications, forceLocal: true }
  const agencyRule = await service.createRoutingRule({
    ruleType: 'agency',
    sourceId: 'agency-harcourts-bedfordview',
    sourceName: 'Harcourts Bedfordview',
    branchId: 'branch-east',
    priority: 30,
  }, hqContext, workspaceId, commonOptions)
  const developmentRule = await service.createRoutingRule({
    ruleType: 'development',
    sourceId: 'development-waterfall',
    sourceName: 'Waterfall Estate',
    branchId: 'branch-midrand',
    consultantId: 'consultant-midrand',
    priority: 20,
  }, hqContext, workspaceId, commonOptions)
  const regionalRule = await service.createRoutingRule({
    ruleType: 'region',
    sourceId: 'region-gauteng',
    sourceName: 'Gauteng',
    regionId: 'region-gauteng',
    branchId: 'branch-jhb',
    priority: 50,
  }, hqContext, workspaceId, commonOptions)
  const companyRule = await service.createRoutingRule({
    ruleType: 'company',
    sourceName: 'Company Fallback',
    branchId: 'branch-jhb',
    priority: 90,
  }, hqContext, workspaceId, commonOptions)
  const routingRules = service.__bondRoutingRulesServiceTestUtils.getRules(workspaceId)

  const devRoute = service.resolveBondApplicationRouting({
    id: 'app-dev-agency',
    partnerId: 'agency-harcourts-bedfordview',
    partnerName: 'Harcourts Bedfordview',
    developmentId: 'development-waterfall',
    developmentName: 'Waterfall Estate',
    status: 'active',
  }, hqContext, workspaceId, { ...commonOptions, routingRules })
  assert.equal(devRoute.routingMethod, service.BOND_ROUTING_METHODS.developmentDefault)
  assert.equal(devRoute.branchId, 'branch-midrand')
  assert.equal(devRoute.consultantId, 'consultant-midrand')

  const agencyRoute = service.resolveBondApplicationRouting({
    id: 'app-agency',
    partnerId: 'agency-harcourts-bedfordview',
    partnerName: 'Harcourts Bedfordview',
    status: 'active',
  }, hqContext, workspaceId, { ...commonOptions, routingRules })
  assert.equal(agencyRoute.routingMethod, service.BOND_ROUTING_METHODS.overflow)
  assert.equal(agencyRoute.branchId, 'branch-jhb')
  assert.equal(agencyRoute.routingSource, 'Harcourts Bedfordview')

  const regionalRoute = service.resolveBondApplicationRouting({
    id: 'app-regional',
    assignedRegionId: 'region-gauteng',
    status: 'active',
  }, hqContext, workspaceId, { ...commonOptions, routingRules })
  assert.equal(regionalRoute.routingMethod, service.BOND_ROUTING_METHODS.regionalDefault)
  assert.equal(regionalRoute.branchId, 'branch-jhb')

  const companyRoute = service.resolveBondApplicationRouting({ id: 'app-fallback', status: 'active' }, hqContext, workspaceId, {
    ...commonOptions,
    routingRules,
  })
  assert.equal(companyRoute.routingMethod, service.BOND_ROUTING_METHODS.companyFallback)
  assert.equal(companyRoute.branchId, 'branch-jhb')

  const manualRoute = service.resolveBondApplicationRouting({ id: 'app-manual', selectedConsultantId: 'consultant-cape' }, hqContext, workspaceId, {
    ...commonOptions,
    routingRules,
  })
  assert.equal(manualRoute.routingMethod, service.BOND_ROUTING_METHODS.manualOverride)
  assert.equal(manualRoute.branchId, 'branch-cape')

  const preview = service.previewRouting({
    id: 'app-preview',
    developmentId: 'development-waterfall',
    developmentName: 'Waterfall Estate',
  }, hqContext, workspaceId, { ...commonOptions, routingRules })
  assert.equal(preview.preview.branch, 'Midrand Branch')
  assert.equal(preview.preview.consultant, 'Sarah Jones')

  const explanation = service.explainRouting({
    id: 'app-explain',
    partnerId: 'agency-harcourts-bedfordview',
    partnerName: 'Harcourts Bedfordview',
  }, hqContext, workspaceId, { ...commonOptions, routingRules })
  assert.equal(explanation.routingSource, 'Harcourts Bedfordview')
  assert.match(explanation.explanation, /capacity|Agency default/)

  await service.recordRoutingRuleUsed(devRoute, { id: 'app-dev-agency' }, hqContext, workspaceId, { forceLocal: true })
  assert.ok(service.__bondRoutingRulesServiceTestUtils.getActivity(workspaceId).some((row) => row.eventType === service.BOND_ROUTING_ACTIVITY_EVENTS.used))

  const disabled = await service.disableRoutingRule(agencyRule.id, hqContext, workspaceId, { ...commonOptions, routingRules })
  assert.equal(disabled.status, 'disabled')
  const disabledRules = service.__bondRoutingRulesServiceTestUtils.getRules(workspaceId)
  const disabledAgencyRoute = service.resolveBondApplicationRouting({
    id: 'app-agency-disabled',
    partnerId: 'agency-harcourts-bedfordview',
    partnerName: 'Harcourts Bedfordview',
    status: 'active',
  }, hqContext, workspaceId, { ...commonOptions, routingRules: disabledRules })
  assert.equal(disabledAgencyRoute.routingMethod, service.BOND_ROUTING_METHODS.companyFallback)

  const performance = service.getRoutingPerformance(hqContext, workspaceId, {
    ...commonOptions,
    routingRules: disabledRules,
    applications,
  })
  assert.ok(performance.agencyPerformance.some((row) => row.agency === 'Harcourts Bedfordview' && row.applications === 2))
  assert.ok(performance.developmentPerformance.some((row) => row.development === 'Waterfall Estate' && row.conversion === 100))
  assert.ok(performance.routingEffectiveness.some((row) => row.method === 'AGENCY_DEFAULT'))

  const dashboard = service.getRoutingRulesDashboard(hqContext, workspaceId, {
    ...commonOptions,
    routingRules: disabledRules,
  })
  assert.equal(dashboard.agencyRules.length, 1)
  assert.equal(dashboard.developmentRules.length, 1)
  assert.equal(dashboard.companyFallback.fallbackBranch, 'Johannesburg Central')

  const regionalContext = makeContext({ userId: 'regional-manager', workspaceRole: 'regional_manager', scopeLevel: 'region', regionId: 'region-gauteng' })
  await assert.rejects(
    () => service.createRoutingRule({ ruleType: 'agency', sourceId: 'agency-other', sourceName: 'Other Agency', branchId: 'branch-jhb' }, regionalContext, workspaceId, commonOptions),
    /permission/,
  )
  assert.ok(service.__bondRoutingRulesServiceTestUtils.getActivity(workspaceId).some((row) => row.eventType === service.BOND_ROUTING_ACTIVITY_EVENTS.created))
  assert.ok(service.__bondRoutingRulesServiceTestUtils.getActivity(workspaceId).some((row) => row.eventType === service.BOND_ROUTING_ACTIVITY_EVENTS.disabled))
  assert.equal(developmentRule.ruleType, 'development')
  assert.equal(regionalRule.ruleType, 'region')
  assert.equal(companyRule.ruleType, 'company')

  console.log('bondRoutingRulesService tests passed')
} finally {
  await server.close()
}
