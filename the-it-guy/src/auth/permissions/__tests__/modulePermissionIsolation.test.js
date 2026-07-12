import assert from 'node:assert/strict'
import process from 'node:process'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function context({ appRole, workspaceType, workspaceRole = 'owner' }) {
  return {
    appRole,
    role: appRole,
    workspaceType,
    currentWorkspace: { id: `${workspaceType}-workspace`, type: workspaceType },
    currentMembership: {
      id: `${workspaceType}-${workspaceRole}-membership`,
      workspaceId: `${workspaceType}-workspace`,
      status: 'active',
      workspaceRole,
      role: workspaceRole,
    },
  }
}

function visibleKeys(items = []) {
  const keys = []
  for (const item of items) {
    keys.push(item.key)
    if (Array.isArray(item.children)) keys.push(...visibleKeys(item.children))
  }
  return keys
}

try {
  const { getRoleNavItems } = await server.ssrLoadModule('/src/lib/roles.js')
  const { PERMISSIONS } = await server.ssrLoadModule('/src/auth/permissions/permissionRegistry.js')
  const { navPermissionByKey, filterNavigationItems } = await server.ssrLoadModule('/src/auth/permissions/navigationPermissions.js')
  const { can, evaluateAccessRequirement, getRouteAccessRequirement } = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')
  const { isCommercialProfessionalMember } = await server.ssrLoadModule('/src/modules/commercial/utils/resolveCommercialRole.js')

  assert.equal(navPermissionByKey.agency_pipeline, PERMISSIONS.viewLeads)
  assert.equal(navPermissionByKey.developer_pipeline, PERMISSIONS.viewSalesPipeline)
  assert.equal(navPermissionByKey.client_snags, PERMISSIONS.viewClientPortal)
  assert.equal(navPermissionByKey.developer_snags, PERMISSIONS.viewDevelopments)

  const agencyContext = context({ appRole: 'agent', workspaceType: 'agency', workspaceRole: 'principal' })
  const agencyItems = filterNavigationItems(getRoleNavItems('agent'), agencyContext)
  const agencyKeys = visibleKeys(agencyItems)
  const agencyPipelineChildren = agencyItems.find((item) => item.key === 'agency_pipeline')?.children || []
  assert.equal(agencyKeys.includes('agency_pipeline'), true)
  assert.deepEqual(agencyPipelineChildren.map((item) => item.label), ['Leads', 'Canvassing', 'Calendar'])
  assert.equal(agencyKeys.includes('developer_pipeline'), false)
  assert.equal(can(PERMISSIONS.viewLeads, agencyContext), true)
  assert.equal(can(PERMISSIONS.viewSalesPipeline, agencyContext), false)

  for (const workspaceRole of ['agent', 'agency_agent', 'estate agent', 'property_practitioner', 'broker', 'consultant', 'senior_agent']) {
    const agentContext = context({ appRole: 'agent', workspaceType: 'agency', workspaceRole })
    const agentKeys = visibleKeys(filterNavigationItems(getRoleNavItems('agent'), agentContext))
    assert.equal(agentKeys.includes('agency_pipeline'), true, `${workspaceRole} should see agency pipeline navigation`)
    assert.equal(can(PERMISSIONS.viewLeads, agentContext), true, `${workspaceRole} should view residential leads`)
    assert.equal(can(PERMISSIONS.createLeads, agentContext), true, `${workspaceRole} should create residential leads`)
    assert.equal(evaluateAccessRequirement(getRouteAccessRequirement('/pipeline/leads'), agentContext).ok, true, `${workspaceRole} should access residential leads`)
    assert.equal(evaluateAccessRequirement(getRouteAccessRequirement('/pipeline/canvassing'), agentContext).ok, true, `${workspaceRole} should access residential canvassing`)
  }

  const agencyTeamLeadContext = context({ appRole: 'agent', workspaceType: 'agency', workspaceRole: 'team_lead' })
  assert.equal(can(PERMISSIONS.viewAgencyDashboard, agencyTeamLeadContext), true, 'agency team lead should view dashboard after invite acceptance')
  assert.equal(can(PERMISSIONS.viewLeads, agencyTeamLeadContext), true, 'agency team lead should view residential leads')
  assert.equal(can(PERMISSIONS.assignLeads, agencyTeamLeadContext), true, 'agency team lead should assign leads')

  const developerContext = context({ appRole: 'developer', workspaceType: 'developer_company', workspaceRole: 'owner' })
  const developerKeys = visibleKeys(filterNavigationItems(getRoleNavItems('developer'), developerContext))
  assert.equal(developerKeys.includes('developer_pipeline'), true)
  assert.equal(developerKeys.includes('developer_snags'), true)
  assert.equal(developerKeys.includes('agency_pipeline'), false)
  assert.equal(can(PERMISSIONS.viewSalesPipeline, developerContext), true)
  assert.equal(can(PERMISSIONS.viewLeads, developerContext), false)

  const clientKeys = visibleKeys(filterNavigationItems(getRoleNavItems('client'), {
    appRole: 'client',
    role: 'client',
    workspaceType: '',
    currentWorkspace: null,
    currentMembership: null,
  }))
  assert.equal(clientKeys.includes('client_snags'), true)
  assert.equal(clientKeys.includes('developer_snags'), false)

  assert.equal(getRouteAccessRequirement('/pipeline'), null)
  assert.equal(getRouteAccessRequirement('/pipeline/leads')?.workspaceType, 'agency')
  assert.equal(getRouteAccessRequirement('/pipeline/canvassing')?.permission, PERMISSIONS.createLeads)
  const newTransactionRequirement = getRouteAccessRequirement('/new-transaction')
  assert.equal(evaluateAccessRequirement(newTransactionRequirement, agencyContext).ok, true)
  assert.equal(evaluateAccessRequirement(newTransactionRequirement, developerContext).ok, true)
  assert.equal(evaluateAccessRequirement(newTransactionRequirement, context({ appRole: 'attorney', workspaceType: 'attorney_firm', workspaceRole: 'owner' })).ok, true)
  assert.equal(evaluateAccessRequirement(newTransactionRequirement, context({ appRole: 'developer', workspaceType: 'developer_company', workspaceRole: 'sales_agent' })).ok, false)
  assert.equal(isCommercialProfessionalMember({ module_context: 'commercial', commercial_role: 'commercial_principal' }), true)
  assert.equal(isCommercialProfessionalMember({ module_context: 'commercial', commercial_role: 'commercial_broker' }), true)
  assert.equal(isCommercialProfessionalMember({ module_context: 'commercial', commercial_role: 'landlord' }), false)

  console.log('module permission isolation tests passed')
} finally {
  await server.close()
}
