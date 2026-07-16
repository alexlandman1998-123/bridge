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

  const joinedWorkspaceOnly = buildWorkspaceResolution({
    user,
    profile,
    organisationRows: [],
    organisationMembershipRows: [{
      id: 'membership-joined-workspace',
      organisations: organisation,
      user_id: user.id,
      role: 'principal',
      status: 'active',
    }],
    requestedWorkspaceId: organisation.id,
  })

  assert.equal(joinedWorkspaceOnly.ok, true)
  assert.equal(joinedWorkspaceOnly.currentWorkspace.id, organisation.id)
  assert.equal(joinedWorkspaceOnly.currentMembership.workspaceId, organisation.id)

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
    organisation_id: '44444444-4444-4444-8444-444444444444',
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
  assert.equal(attorney.currentWorkspace.organisationId, attorneyFirm.organisation_id)
  assert.equal(attorney.currentWorkspace.logoUrl, attorneyFirm.logo_url)

  function resolveDuplicateAttorneyWorkspace({ organisationMembershipId, attorneyMembershipId }) {
    const sharedWorkspaceId = '55555555-5555-4555-8555-555555555555'
    const sharedOrganisation = {
      id: sharedWorkspaceId,
      name: 'Young Law Fixture',
      type: 'attorney_firm',
    }
    const sharedAttorneyFirm = {
      id: sharedWorkspaceId,
      organisation_id: sharedWorkspaceId,
      name: 'Young Law Fixture',
      logo_url: 'https://example.test/young-law-logo.png',
    }

    return buildWorkspaceResolution({
      user,
      profile: {
        ...attorneyProfile,
        primary_attorney_firm_id: sharedWorkspaceId,
      },
      organisationRows: [sharedOrganisation],
      attorneyFirmRows: [sharedAttorneyFirm],
      organisationMembershipRows: [{
        id: organisationMembershipId,
        organisation_id: sharedWorkspaceId,
        user_id: user.id,
        role: 'owner',
        workspace_role: 'owner',
        workspace_type: 'attorney_firm',
        status: 'active',
      }],
      attorneyMembershipRows: [{
        id: attorneyMembershipId,
        firm_id: sharedWorkspaceId,
        user_id: user.id,
        role: 'firm_admin',
        status: 'active',
      }],
      requestedWorkspaceId: sharedWorkspaceId,
    })
  }

  const duplicateOrganisationFirst = resolveDuplicateAttorneyWorkspace({
    organisationMembershipId: '100-organisation-membership',
    attorneyMembershipId: '900-attorney-membership',
  })
  const duplicateAttorneyFirst = resolveDuplicateAttorneyWorkspace({
    organisationMembershipId: '900-organisation-membership',
    attorneyMembershipId: '100-attorney-membership',
  })

  for (const resolution of [duplicateOrganisationFirst, duplicateAttorneyFirst]) {
    assert.equal(resolution.ok, true)
    assert.equal(resolution.currentWorkspace.id, '55555555-5555-4555-8555-555555555555')
    assert.equal(resolution.currentWorkspace.logoUrl, 'https://example.test/young-law-logo.png')
    assert.equal(resolution.currentWorkspace.brandingSource, 'attorney_firm_members')
    assert.equal(resolution.currentMembership.source, 'attorney_firm_members')
    assert.equal(resolution.currentMemberships.length, 2)
    assert.equal(resolution.membershipContexts.effective.source, 'attorney_firm_members')
    assert.equal(resolution.membershipContexts.attorneyFirm.source, 'attorney_firm_members')
    assert.equal(resolution.membershipContexts.organisation.source, 'organisation_users')
    assert.equal(resolution.diagnostics.currentMembershipSource, 'attorney_firm_members')
    assert.equal(resolution.diagnostics.membershipSourceOverlap, true)
    assert.deepEqual(resolution.diagnostics.membershipSources, ['attorney_firm_members', 'organisation_users'])
    assert.deepEqual(resolution.diagnostics.branding, {
      logoPresent: true,
      source: 'attorney_firm_members',
    })
    assert.deepEqual(
      resolution.currentMemberships.map((membership) => membership.source).sort(),
      ['attorney_firm_members', 'organisation_users'],
    )
  }

  assert.deepEqual(
    {
      workspace: duplicateOrganisationFirst.currentWorkspace,
      effectiveMembershipSource: duplicateOrganisationFirst.currentMembership.source,
    },
    {
      workspace: duplicateAttorneyFirst.currentWorkspace,
      effectiveMembershipSource: duplicateAttorneyFirst.currentMembership.source,
    },
  )

  const splitIdentityFirm = {
    id: '66666666-6666-4666-8666-666666666666',
    organisation_id: '77777777-7777-4777-8777-777777777777',
    name: 'Split Identity Law',
    logo_url: 'https://example.test/split-identity-logo.png',
  }
  const splitIdentityResolution = buildWorkspaceResolution({
    user,
    profile: { ...attorneyProfile, primary_attorney_firm_id: splitIdentityFirm.id },
    organisationRows: [{
      id: splitIdentityFirm.organisation_id,
      name: splitIdentityFirm.name,
      type: 'attorney_firm',
    }],
    attorneyFirmRows: [splitIdentityFirm],
    organisationMembershipRows: [{
      id: 'split-organisation-membership',
      organisation_id: splitIdentityFirm.organisation_id,
      user_id: user.id,
      role: 'owner',
      workspace_type: 'attorney_firm',
      status: 'active',
    }],
    attorneyMembershipRows: [{
      id: 'split-attorney-membership',
      firm_id: splitIdentityFirm.id,
      user_id: user.id,
      role: 'firm_admin',
      status: 'active',
    }],
    requestedWorkspaceId: splitIdentityFirm.id,
  })

  assert.equal(splitIdentityResolution.currentWorkspace.id, splitIdentityFirm.id)
  assert.equal(splitIdentityResolution.currentWorkspace.logoUrl, splitIdentityFirm.logo_url)
  assert.equal(splitIdentityResolution.currentMembership.source, 'attorney_firm_members')
  assert.equal(splitIdentityResolution.currentMemberships.length, 2)
  assert.equal(splitIdentityResolution.membershipContexts.organisation.workspaceId, splitIdentityFirm.id)
  assert.equal(splitIdentityResolution.diagnostics.membershipSourceOverlap, true)

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
