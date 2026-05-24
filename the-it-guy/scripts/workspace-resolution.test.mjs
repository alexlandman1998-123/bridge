import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const {
    buildWorkspaceResolution,
    assertResolvedWorkspaceContext,
    WORKSPACE_RESOLUTION_STATUSES,
  } = await server.ssrLoadModule('/src/services/workspaceResolutionService.js')

  const user = { id: 'user-1', email: 'agent@example.test' }
  const profile = {
    id: 'user-1',
    email: 'agent@example.test',
    firstName: 'Alex',
    lastName: 'Agent',
    role: 'agent',
    onboardingCompleted: true,
  }
  const organisation = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Deterministic Agency',
    type: 'agency',
  }

  const normal = buildWorkspaceResolution({
    user,
    profile,
    organisationRows: [organisation],
    organisationMembershipRows: [{
      id: 'membership-1',
      organisation_id: organisation.id,
      user_id: user.id,
      role: 'principal',
      status: 'active',
    }],
    requestedWorkspaceId: organisation.id,
  })

  assert.equal(normal.ok, true)
  assert.equal(normal.status, WORKSPACE_RESOLUTION_STATUSES.resolved)
  assert.equal(normal.currentWorkspace.id, organisation.id)
  assert.equal(normal.workspaceRole, 'principal')
  assert.ok(normal.permissions.view_dashboard)

  const broken = buildWorkspaceResolution({
    user,
    profile,
    organisationRows: [],
    organisationMembershipRows: [],
  })

  assert.equal(broken.ok, false)
  assert.equal(broken.status, WORKSPACE_RESOLUTION_STATUSES.membershipRequired)
  assert.equal(broken.reason, 'no_active_membership')

  const security = buildWorkspaceResolution({
    user,
    profile,
    organisationRows: [organisation],
    organisationMembershipRows: [{
      id: 'membership-2',
      organisation_id: organisation.id,
      user_id: 'other-user',
      role: 'principal',
      status: 'active',
    }],
    requestedWorkspaceId: '22222222-2222-4222-8222-222222222222',
  })

  assert.equal(security.ok, true)
  assert.equal(security.currentWorkspace.id, organisation.id)
  assert.ok(security.diagnostics.warnings.includes('requested_workspace_invalid'))

  assert.throws(
    () => assertResolvedWorkspaceContext({ organisationId: 'default', appRole: 'agent' }),
    /resolved workspace context|required/i,
  )

  console.log('workspace-resolution tests passed')
} finally {
  await server.close()
}
