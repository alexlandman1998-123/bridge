import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { buildWorkspaceResolution, WORKSPACE_RESOLUTION_STATUSES } = await server.ssrLoadModule('/src/services/workspaceResolutionService.js')

  const profile = {
    id: 'user-1',
    email: 'owner@example.test',
    role: 'bond_originator',
    firstName: 'Owner',
    lastName: 'Example',
    first_name: 'Owner',
    last_name: 'Example',
    onboardingCompleted: true,
  }
  const user = { id: 'user-1', email: 'owner@example.test' }

  const personalWorkspace = {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'bond_originator',
    workspace_kind: 'personal_originator',
    name: 'Personal Bond Originator',
  }
  const personalMembership = {
    id: 'membership-personal-owner',
    organisation_id: personalWorkspace.id,
    user_id: user.id,
    status: 'active',
    role: 'owner',
    workspace_role: 'owner',
    scope_level: 'workspace_hq',
  }

  const personalResolution = buildWorkspaceResolution({
    user,
    profile,
    organisationRows: [personalWorkspace],
    organisationMembershipRows: [personalMembership],
    requestedWorkspaceId: personalWorkspace.id,
  })

  assert.equal(personalResolution.ok, true)
  assert.equal(personalResolution.status, WORKSPACE_RESOLUTION_STATUSES.resolved)
  assert.equal(personalResolution.currentWorkspace.id, personalWorkspace.id)
  assert.equal(personalResolution.currentWorkspace.type, 'bond_originator')
  assert.equal(personalResolution.currentWorkspace.raw.workspace_kind, 'personal_originator')
  assert.equal(personalResolution.currentMembership.scopeLevel, 'workspace_hq')
  assert.equal(personalResolution.diagnostics.warnings.length, 0)

  const companyWorkspace = {
    id: '22222222-2222-4222-8222-222222222222',
    type: 'bond_originator',
    workspace_kind: 'bond_company',
    name: 'Bond Originator Company',
  }
  const companyMembership = {
    id: 'membership-company-owner',
    organisation_id: companyWorkspace.id,
    user_id: user.id,
    status: 'active',
    role: 'owner',
    workspace_role: 'owner',
    scope_level: 'workspace_hq',
  }

  const companyResolution = buildWorkspaceResolution({
    user,
    profile,
    organisationRows: [companyWorkspace],
    organisationMembershipRows: [companyMembership],
    requestedWorkspaceId: companyWorkspace.id,
  })
  assert.equal(companyResolution.ok, true)
  assert.equal(companyResolution.currentWorkspace.id, companyWorkspace.id)
  assert.equal(companyResolution.currentWorkspace.raw.workspace_kind, 'bond_company')

  const companyWithoutHierarchy = buildWorkspaceResolution({
    user,
    profile,
    organisationRows: [companyWorkspace],
    organisationMembershipRows: [
      { ...companyMembership, id: 'membership-company-minimal', region_id: null, workspace_unit_id: null, scope_level: 'workspace_hq' },
    ],
    requestedWorkspaceId: companyWorkspace.id,
  })
  assert.equal(companyWithoutHierarchy.ok, true)
  assert.equal(companyWithoutHierarchy.currentWorkspace.id, companyWorkspace.id)
  assert.equal(companyWithoutHierarchy.currentWorkspace.raw.workspace_kind, 'bond_company')
  assert.equal(companyWithoutHierarchy.currentMembership.scopeLevel, 'workspace_hq')

  const companyWithHierarchy = buildWorkspaceResolution({
    user,
    profile,
    organisationRows: [companyWorkspace],
    organisationMembershipRows: [
      {
        id: 'membership-company-structured',
        organisation_id: companyWorkspace.id,
        user_id: user.id,
        status: 'active',
        role: 'regional_manager',
        workspace_role: 'regional_manager',
        scope_level: 'region',
        region_id: 'region-cape-town',
        workspace_unit_id: null,
      },
      {
        id: 'membership-company-branch',
        organisation_id: companyWorkspace.id,
        user_id: 'partner-1',
        status: 'active',
        role: 'branch_manager',
        workspace_role: 'branch_manager',
        scope_level: 'branch',
        region_id: 'region-cape-town',
        workspace_unit_id: 'branch-cpt',
      },
    ],
    requestedWorkspaceId: companyWorkspace.id,
  })
  assert.equal(companyWithHierarchy.ok, true)
  assert.equal(companyWithHierarchy.currentWorkspace.id, companyWorkspace.id)
  assert.equal(['region', 'branch'].includes(companyWithHierarchy.currentMembership.scopeLevel), true)
  assert.equal(companyWithHierarchy.currentMembership.regionId, 'region-cape-town')
  assert.equal(companyWithHierarchy.currentWorkspace.raw.workspace_kind, 'bond_company')

  const hqNotSeparateWorkspace = buildWorkspaceResolution({
    user,
    profile,
    organisationRows: [companyWorkspace],
    organisationMembershipRows: [companyMembership],
    requestedWorkspaceId: companyWorkspace.id,
  })
  assert.equal(hqNotSeparateWorkspace.ok, true)
  assert.equal(hqNotSeparateWorkspace.currentWorkspace.id, companyWorkspace.id)

  const attorneyWorkspaceId = '33333333-3333-4333-8333-333333333333'
  const attorneyProfile = {
    ...profile,
    role: 'attorney',
    primary_attorney_firm_id: attorneyWorkspaceId,
  }
  const attorneyOrganisation = {
    id: attorneyWorkspaceId,
    name: 'Young Law Fixture',
    type: 'attorney_firm',
  }
  const attorneyFirm = {
    id: attorneyWorkspaceId,
    organisation_id: attorneyWorkspaceId,
    name: 'Young Law Fixture',
    logo_url: 'https://example.test/young-law-logo.png',
  }

  function resolveDuplicateAttorneyMemberships({ organisationMembershipId, attorneyMembershipId }) {
    return buildWorkspaceResolution({
      user,
      profile: attorneyProfile,
      organisationRows: [attorneyOrganisation],
      attorneyFirmRows: [attorneyFirm],
      organisationMembershipRows: [{
        id: organisationMembershipId,
        organisation_id: attorneyWorkspaceId,
        user_id: user.id,
        status: 'active',
        role: 'owner',
        workspace_role: 'owner',
        workspace_type: 'attorney_firm',
      }],
      attorneyMembershipRows: [{
        id: attorneyMembershipId,
        firm_id: attorneyWorkspaceId,
        user_id: user.id,
        status: 'active',
        role: 'firm_admin',
      }],
      requestedWorkspaceId: attorneyWorkspaceId,
    })
  }

  const organisationMembershipSortsFirst = resolveDuplicateAttorneyMemberships({
    organisationMembershipId: '100-organisation-membership',
    attorneyMembershipId: '900-attorney-membership',
  })
  const attorneyMembershipSortsFirst = resolveDuplicateAttorneyMemberships({
    organisationMembershipId: '900-organisation-membership',
    attorneyMembershipId: '100-attorney-membership',
  })

  for (const resolution of [organisationMembershipSortsFirst, attorneyMembershipSortsFirst]) {
    assert.equal(resolution.currentWorkspace.id, attorneyWorkspaceId)
    assert.equal(resolution.currentWorkspace.logoUrl, attorneyFirm.logo_url)
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
  }

  assert.equal(
    organisationMembershipSortsFirst.currentWorkspace.logoUrl,
    attorneyMembershipSortsFirst.currentWorkspace.logoUrl,
  )
  assert.equal(
    organisationMembershipSortsFirst.currentMembership.source,
    attorneyMembershipSortsFirst.currentMembership.source,
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

  console.log('workspaceResolutionService tests passed')
} finally {
  await server.close()
}
