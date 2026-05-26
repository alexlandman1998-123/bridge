import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')

const server = await createServer({
  root: PROJECT_ROOT,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

function makeContext({
  userId,
  workspaceRole,
  scopeLevel,
  workspaceId = 'workspace-1',
  regionId = null,
  unitId = null,
} = {}) {
  return {
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    userId,
    currentWorkspace: { id: workspaceId, type: 'bond_originator' },
    currentMembership: {
      id: `membership-${userId || workspaceRole}`,
      workspaceId,
      organisation_id: workspaceId,
      user_id: userId,
      status: 'active',
      workspaceRole,
      workspace_role: workspaceRole,
      scopeLevel,
      scope_level: scopeLevel,
      region_id: regionId,
      workspace_unit_id: unitId,
      branch_id: unitId,
    },
  }
}

const transaction = {
  id: 'tx-permissions-1',
  organisation_id: 'workspace-1',
  bond_workspace_id: 'workspace-1',
  bond_region_id: 'region-1',
  bond_workspace_unit_id: 'unit-1',
  primary_bond_consultant_user_id: '11111111-1111-4111-8111-111111111111',
  assigned_bond_processor_user_id: '22222222-2222-4222-8222-222222222222',
  assigned_bond_manager_user_id: '33333333-3333-4333-8333-333333333333',
  assigned_bond_compliance_user_id: '44444444-4444-4444-8444-444444444444',
  finance_status: 'application_in_progress',
}

try {
  const ownership = await server.ssrLoadModule('/src/services/bondFinanceWorkflowOwnershipService.js')
  const resolver = await server.ssrLoadModule('/src/auth/permissions/permissionResolver.js')

  const consultant = makeContext({
    userId: '11111111-1111-4111-8111-111111111111',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
  })
  assert.equal(ownership.canRequestFinanceDocuments(consultant, transaction), true)
  assert.equal(ownership.canSubmitToBanks(consultant, transaction), false)
  assert.equal(ownership.canEscalateFinanceApplication(consultant, transaction), false)

  const processor = makeContext({
    userId: '22222222-2222-4222-8222-222222222222',
    workspaceRole: 'processor',
    scopeLevel: 'assigned',
  })
  assert.equal(ownership.canUpdateBankFeedback(processor, transaction), true)
  assert.equal(ownership.canSubmitToBanks(processor, transaction), false)

  const manager = makeContext({
    userId: '33333333-3333-4333-8333-333333333333',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    unitId: 'unit-1',
  })
  assert.equal(ownership.canEscalateFinanceApplication(manager, transaction), true)
  assert.equal(ownership.canCompleteFinanceStep(manager, transaction, 'ready_for_transfer'), true)

  const compliance = makeContext({
    userId: '44444444-4444-4444-8444-444444444444',
    workspaceRole: 'compliance',
    scopeLevel: 'assigned',
  })
  assert.equal(ownership.canReviewFinanceCompliance(compliance, transaction), true)
  assert.equal(ownership.canCompleteFinanceStep(compliance, transaction, 'compliance_review_pending'), true)
  assert.equal(ownership.canCompleteFinanceStep(compliance, transaction, 'submitted_to_banks'), false)
  assert.equal(resolver.canAssignBondManager(compliance, { workspaceUnitId: 'unit-1' }), false)

  const adminStaff = makeContext({
    userId: 'admin-1',
    workspaceRole: 'admin_staff',
    scopeLevel: 'assigned',
  })
  assert.equal(ownership.canViewFinanceWorkflow(adminStaff, transaction), false)
  assert.equal(ownership.canEditFinanceWorkflow(adminStaff, transaction), false)

  console.log('bondFinanceWorkflowPermissions tests passed')
} finally {
  await server.close()
}
