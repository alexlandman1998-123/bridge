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

  console.log('workspaceResolutionService tests passed')
} finally {
  await server.close()
}
