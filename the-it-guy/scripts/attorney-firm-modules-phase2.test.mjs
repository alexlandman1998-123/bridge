import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { PERMISSIONS } = await server.ssrLoadModule('/src/auth/permissions/permissionRegistry.js')
  const { resolveAttorneyFirmModuleCapabilities } = await server.ssrLoadModule('/src/services/attorneyFirmModulesService.js')
  const {
    resolveAttorneyModulesFirmId,
    resolveAttorneyUserModuleCapabilities,
  } = await server.ssrLoadModule('/src/services/attorneyModuleCapabilities.js')

  function permissionCheck(enabled = []) {
    const values = new Set(enabled)
    return (permission) => values.has(permission)
  }

  const firmCapabilities = resolveAttorneyFirmModuleCapabilities([
    { firm_id: 'firm-1', module_key: 'transfer', status: 'active' },
    { firm_id: 'firm-1', module_key: 'bond', status: 'winding_down' },
    { firm_id: 'firm-1', module_key: 'cancellation', status: 'inactive' },
  ], { firmId: 'firm-1' })

  const administrator = resolveAttorneyUserModuleCapabilities({
    firmCapabilities,
    membershipActive: true,
    hasAttorneyPermission: permissionCheck([
      'can_view_all_firm_matters',
      'can_manage_firm_settings',
    ]),
    hasWorkspacePermission: permissionCheck([
      PERMISSIONS.viewMatters,
      PERMISSIONS.createMatters,
      PERMISSIONS.editMatters,
      PERMISSIONS.manageWorkspaceSettings,
    ]),
  })

  assert.equal(administrator.canManageFirmModules, true)
  assert.equal(administrator.canViewModule('transfer'), true)
  assert.equal(administrator.canCreateMatter('transfer'), true)
  assert.equal(administrator.canViewModule('bond'), true)
  assert.equal(administrator.canCreateMatter('bond'), false, 'winding-down modules must reject new work')
  assert.equal(administrator.canViewModule('cancellation'), false)
  assert.equal(administrator.canViewHistoricalModule('cancellation'), true)
  assert.equal(administrator.canEditWorkflow('bond'), true)

  const bondAttorney = resolveAttorneyUserModuleCapabilities({
    firmCapabilities,
    membershipActive: true,
    hasAttorneyPermission: permissionCheck([
      'can_view_assigned_matters',
      'can_view_bond_matters',
      'can_edit_bond_workflow',
    ]),
    hasWorkspacePermission: permissionCheck([
      PERMISSIONS.viewMatters,
      PERMISSIONS.createMatters,
      PERMISSIONS.editMatters,
    ]),
  })

  assert.equal(bondAttorney.canViewModule('transfer'), false)
  assert.equal(bondAttorney.canViewModule('bond'), true)
  assert.equal(bondAttorney.canEditWorkflow('bond'), true)
  assert.equal(bondAttorney.canCreateMatter('bond'), false)

  const inactiveMember = resolveAttorneyUserModuleCapabilities({
    firmCapabilities,
    membershipActive: false,
    hasAttorneyPermission: () => true,
    hasWorkspacePermission: () => true,
  })
  assert.equal(inactiveMember.canViewModule('transfer'), false)
  assert.equal(inactiveMember.canCreateMatter('transfer'), false)
  assert.equal(inactiveMember.canManageFirmModules, false)

  assert.equal(resolveAttorneyModulesFirmId({
    currentMembership: { workspaceType: 'attorney_firm', workspaceId: 'current-firm' },
    profile: { primaryAttorneyFirmId: 'profile-firm' },
  }), 'current-firm')

  assert.equal(resolveAttorneyModulesFirmId({
    currentMembership: { workspaceType: 'agency', workspaceId: 'agency-1' },
    activeMemberships: [{ workspace_type: 'attorney_firm', workspace_id: 'active-firm' }],
    profile: { primaryAttorneyFirmId: 'profile-firm' },
  }), 'active-firm')

  assert.equal(resolveAttorneyModulesFirmId({
    profile: { primary_attorney_firm_id: 'profile-firm' },
  }), 'profile-firm')

  const providerSource = readFileSync(
    new URL('../src/context/AttorneyModulesContext.jsx', import.meta.url),
    'utf8',
  )
  const appSource = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8')

  assert.match(providerSource, /getAttorneyFirmModuleCapabilities\(firmId\)/)
  assert.match(providerSource, /useAttorneyPermissions\(\{ firmId: firmId \|\| null \}\)/)
  assert.match(providerSource, /canViewHistoricalModule/)
  assert.match(providerSource, /canReceiveInstruction/)
  assert.match(providerSource, /refreshModules/)
  assert.match(appSource, /<WorkspaceProvider[\s\S]*<AttorneyModulesProvider>[\s\S]*<OrganisationProvider>/)

  console.log('attorney firm modules Phase 2 capability context tests passed')
} finally {
  await server.close()
}
