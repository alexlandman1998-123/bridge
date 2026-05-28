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
    requireResolvedWorkspaceContext,
    WorkspaceContextError,
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

  const attorneyFirm = {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Tuckers Mock',
    type: 'attorney_firm',
    logo_url: 'https://example.test/tuckers-logo.png',
  }
  const attorneyProfile = {
    ...profile,
    role: 'attorney',
    primary_attorney_firm_id: attorneyFirm.id,
  }
  const attorney = buildWorkspaceResolution({
    user,
    profile: attorneyProfile,
    attorneyFirmRows: [attorneyFirm],
    attorneyMembershipRows: [{
      id: 'attorney-membership-1',
      firm_id: attorneyFirm.id,
      user_id: user.id,
      role: 'firm_admin',
      status: 'active',
    }],
    requestedWorkspaceId: attorneyFirm.id,
  })

  assert.equal(attorney.ok, true)
  assert.equal(attorney.currentWorkspace.id, attorneyFirm.id)
  assert.equal(attorney.currentWorkspace.logoUrl, attorneyFirm.logo_url)

  assert.throws(
    () => assertResolvedWorkspaceContext({ organisationId: 'default', appRole: 'agent' }),
    /resolved workspace context|required/i,
  )

  assert.throws(
    () => assertResolvedWorkspaceContext({ organisationId: 'ALL_WORKSPACE', appRole: 'agent' }),
    /resolved workspace context|required/i,
  )

  assert.throws(
    () => requireResolvedWorkspaceContext({
      workspaceId: organisation.id,
      appRole: 'agent',
      currentMembership: null,
    }),
    WorkspaceContextError,
  )

  const guarded = requireResolvedWorkspaceContext({
    workspaceId: organisation.id,
    appRole: 'agent',
    currentMembership: {
      id: 'membership-1',
      workspaceId: organisation.id,
      workspaceRole: 'principal',
      status: 'active',
    },
  })
  assert.equal(guarded.workspaceId, organisation.id)
  assert.equal(guarded.workspaceRole, 'principal')

  console.log('workspace-resolution tests passed')
} finally {
  await server.close()
}
