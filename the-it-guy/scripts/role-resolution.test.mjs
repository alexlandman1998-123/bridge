import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const migration = fs.readFileSync(path.join(root, '../supabase/migrations/202605240013_canonical_role_resolution.sql'), 'utf8')

assert.match(migration, /add column if not exists system_role text/i, 'profiles.system_role must be added')
assert.match(migration, /add column if not exists workspace_role text/i, 'organisation_users.workspace_role must be added')
assert.match(migration, /add column if not exists transaction_role text/i, 'transaction_participants.transaction_role must be added')
assert.match(migration, /bridge_current_workspace_role/i, 'workspace role SQL helper must exist')
assert.match(migration, /bridge_current_transaction_role/i, 'transaction role SQL helper must exist')
assert.match(migration, /bridge_has_workspace_permission/i, 'workspace permission SQL helper must exist')
assert.match(migration, /bridge_has_transaction_permission/i, 'transaction permission SQL helper must exist')

const server = await createServer({
  root,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    SYSTEM_ROLES,
    TRANSACTION_ROLES,
    resolveSystemRole,
    resolveWorkspaceRole,
    resolveTransactionRole,
  } = await server.ssrLoadModule('/src/services/roleResolutionService.js')
  const {
    resolvePermissionContext,
    can,
  } = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')
  const { PERMISSIONS } = await server.ssrLoadModule('/src/auth/permissions/permissionRegistry.js')
  const {
    buildWorkspaceResolution,
  } = await server.ssrLoadModule('/src/services/workspaceResolutionService.js')

  assert.equal(resolveSystemRole({ role: 'agent' }), SYSTEM_ROLES.professional)
  assert.equal(resolveSystemRole({ role: 'client' }), SYSTEM_ROLES.client)
  assert.equal(resolveSystemRole({ role: 'platform_admin' }), SYSTEM_ROLES.admin)
  assert.equal(resolveSystemRole({ system_role: 'super_admin', role: 'agent' }), SYSTEM_ROLES.superAdmin)

  assert.equal(resolveWorkspaceRole({ role: 'agency_owner', app_role: 'agent', workspace_type: 'agency' }), 'principal')
  assert.equal(resolveWorkspaceRole({ organisation_role: 'admin', app_role: 'agent', workspace_type: 'agency' }), 'admin_staff')
  assert.equal(resolveWorkspaceRole({ workspace_role: 'branch manager', app_role: 'agent', workspace_type: 'agency' }), 'branch_manager')

  assert.equal(resolveTransactionRole({ role_type: 'attorney', legal_role: 'transfer' }), TRANSACTION_ROLES.transferAttorney)
  assert.equal(resolveTransactionRole({ role_type: 'attorney', legal_role: 'bond' }), TRANSACTION_ROLES.bondAttorney)
  assert.equal(resolveTransactionRole({ role_type: 'agent' }), TRANSACTION_ROLES.listingAgent)
  assert.equal(resolveTransactionRole({ transaction_role: 'selling_agent', role_type: 'agent' }), TRANSACTION_ROLES.sellingAgent)

  const permissionContext = resolvePermissionContext({
    profile: { id: 'principal-user', role: 'agent', system_role: 'professional' },
    currentWorkspace: { id: 'workspace-1', type: 'agency' },
    currentMembership: {
      id: 'membership-1',
      status: 'active',
      workspaceRole: 'principal',
      workspaceType: 'agency',
      workspace: { id: 'workspace-1', type: 'agency' },
    },
  })
  assert.equal(permissionContext.systemRole, SYSTEM_ROLES.professional)
  assert.equal(permissionContext.workspaceRole, 'principal')
  assert.equal(can(PERMISSIONS.manageUsers, {
    profile: { id: 'principal-user', role: 'agent', system_role: 'professional' },
    currentWorkspace: { id: 'workspace-1', type: 'agency' },
    currentMembership: {
      id: 'membership-1',
      status: 'active',
      workspaceRole: 'principal',
      workspaceType: 'agency',
      workspace: { id: 'workspace-1', type: 'agency' },
    },
  }), true)

  const resolution = buildWorkspaceResolution({
    user: { id: 'agent-user', email: 'agent@example.test' },
    profile: {
      id: 'agent-user',
      email: 'agent@example.test',
      firstName: 'Alex',
      lastName: 'Agent',
      role: 'agent',
      system_role: 'professional',
      onboardingCompleted: true,
    },
    organisationRows: [{ id: 'workspace-1', name: 'Agency', type: 'agency' }],
    organisationMembershipRows: [{
      id: 'membership-agent',
      organisation_id: 'workspace-1',
      user_id: 'agent-user',
      organisation_role: 'sales_agent',
      status: 'active',
    }],
  })
  assert.equal(resolution.ok, true)
  assert.equal(resolution.profile.systemRole, SYSTEM_ROLES.professional)
  assert.equal(resolution.workspaceRole, 'agent')

  console.log('role-resolution tests passed')
} finally {
  await server.close()
}
