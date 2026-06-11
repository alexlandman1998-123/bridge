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
  const {
    __organizationHierarchyServiceTestUtils,
    getBranchRoleLabel,
  } = await server.ssrLoadModule('/src/services/organizationHierarchyService.js')

  {
    assert.equal(getBranchRoleLabel('branch_manager'), 'Branch Manager')
    assert.equal(getBranchRoleLabel('attorney'), 'Attorney')
    assert.equal(getBranchRoleLabel('unknown'), 'Member')
  }

  {
    const region = __organizationHierarchyServiceTestUtils.toRegion({
      id: 'region-gauteng',
      workspace_id: 'org-betterbond',
      name: 'Gauteng',
      code: 'GP',
      active: true,
      branch_count: 3,
      user_count: 122,
      transaction_count: 784,
    })

    assert.equal(region.organizationId, 'org-betterbond')
    assert.equal(region.name, 'Gauteng')
    assert.equal(region.status, 'active')
    assert.equal(region.branchCount, 3)
    assert.equal(region.transactionCount, 784)
  }

  {
    const branch = __organizationHierarchyServiceTestUtils.toBranch({
      id: 'branch-sandton',
      organisation_id: 'org-ooba',
      region_id: 'region-gauteng',
      region_name: 'Gauteng',
      name: 'Sandton',
      code: 'SAN',
      principal_user_id: 'user-manager',
      user_count: 12,
      transaction_count: 84,
      active_transaction_count: 17,
    })

    assert.equal(branch.organizationId, 'org-ooba')
    assert.equal(branch.regionName, 'Gauteng')
    assert.equal(branch.managerUserId, 'user-manager')
    assert.equal(branch.activeTransactionCount, 17)
  }

  {
    const member = __organizationHierarchyServiceTestUtils.toHierarchyMember({
      membership_id: 'membership-1',
      user_id: 'user-1',
      full_name: 'Sarah Jones',
      email: 'sarah@tucker.co.za',
      workspace_role: 'regional_manager',
      scope_level: 'region',
      region_id: 'region-gauteng',
    })

    assert.equal(member.membershipId, 'membership-1')
    assert.equal(member.workspaceRole, 'regional_manager')
    assert.equal(member.scopeLevel, 'region')
    assert.equal(member.branchRoleLabel, 'Member')
  }

  {
    const hierarchy = __organizationHierarchyServiceTestUtils.normalizeHierarchyPayload({
      regions: [{ id: 'region-1', name: 'Western Cape' }],
      branches: [{ id: 'branch-1', name: 'Cape Town' }],
      members: [{ membership_id: 'member-1', user_id: 'user-1', full_name: 'John Smith' }],
      canManageHierarchy: true,
      canManageRegion: true,
      canManageBranch: false,
    })

    assert.equal(hierarchy.regions.length, 1)
    assert.equal(hierarchy.branches.length, 1)
    assert.equal(hierarchy.members.length, 1)
    assert.equal(hierarchy.canManageHierarchy, true)
    assert.equal(hierarchy.canManageBranch, false)
  }

  console.log('organizationHierarchyService tests passed')
} finally {
  await server.close()
}
