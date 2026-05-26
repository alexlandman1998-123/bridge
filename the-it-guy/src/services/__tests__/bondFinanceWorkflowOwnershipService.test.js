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

function makeContext({
  userId,
  workspaceRole,
  scopeLevel,
  workspaceId = 'workspace-1',
  regionId = null,
  unitId = null,
  email = null,
} = {}) {
  return {
    appRole: 'bond_originator',
    workspaceType: 'bond_originator',
    userId,
    profile: email ? { email } : undefined,
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
  id: 'tx-1',
  organisation_id: 'workspace-1',
  bond_workspace_id: 'workspace-1',
  bond_region_id: 'region-1',
  bond_workspace_unit_id: 'unit-1',
  primary_bond_consultant_user_id: '11111111-1111-4111-8111-111111111111',
  assigned_bond_processor_user_id: '22222222-2222-4222-8222-222222222222',
  assigned_bond_manager_user_id: '33333333-3333-4333-8333-333333333333',
  assigned_bond_compliance_user_id: '44444444-4444-4444-8444-444444444444',
  assigned_bond_originator_email: 'legacy-consultant@example.test',
  bond_originator: 'Legacy Consultant',
}

try {
  const service = await server.ssrLoadModule('/src/services/bondFinanceWorkflowOwnershipService.js')

  const owners = service.resolveFinanceWorkflowOwners(transaction)
  assert.equal(owners.primaryConsultantUserId, '11111111-1111-4111-8111-111111111111')
  assert.equal(owners.processorUserId, '22222222-2222-4222-8222-222222222222')
  assert.equal(owners.managerUserId, '33333333-3333-4333-8333-333333333333')
  assert.equal(owners.complianceUserId, '44444444-4444-4444-8444-444444444444')

  const consultant = makeContext({
    userId: '11111111-1111-4111-8111-111111111111',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
    email: 'legacy-consultant@example.test',
  })
  assert.equal(service.canViewFinanceWorkflow(consultant, transaction), true)
  assert.equal(service.canEditFinanceWorkflow(consultant, transaction), true)
  assert.equal(service.canRequestFinanceDocuments(consultant, transaction), true)
  assert.equal(service.canSubmitToBanks(consultant, transaction), false)

  const processorAssigned = makeContext({
    userId: '22222222-2222-4222-8222-222222222222',
    workspaceRole: 'processor',
    scopeLevel: 'assigned',
  })
  assert.equal(service.canViewFinanceWorkflow(processorAssigned, transaction), true)
  assert.equal(service.canEditFinanceWorkflow(processorAssigned, transaction), true)
  assert.equal(service.canUpdateBankFeedback(processorAssigned, transaction), true)

  const processorTeam = makeContext({
    userId: 'processor-team',
    workspaceRole: 'processor',
    scopeLevel: 'team',
    unitId: 'unit-1',
  })
  assert.equal(service.canViewFinanceWorkflow(processorTeam, transaction), true)

  const branchManager = makeContext({
    userId: '33333333-3333-4333-8333-333333333333',
    workspaceRole: 'branch_manager',
    scopeLevel: 'branch',
    unitId: 'unit-1',
    regionId: 'region-1',
  })
  assert.equal(service.canViewFinanceWorkflow(branchManager, transaction), true)
  assert.equal(service.canEscalateFinanceApplication(branchManager, transaction), true)

  const regionalManager = makeContext({
    userId: 'regional-manager-1',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-1',
  })
  assert.equal(service.canViewFinanceWorkflow(regionalManager, transaction), true)

  const regionalManagerOtherRegion = makeContext({
    userId: 'regional-manager-2',
    workspaceRole: 'regional_manager',
    scopeLevel: 'region',
    regionId: 'region-2',
  })
  assert.equal(service.canViewFinanceWorkflow(regionalManagerOtherRegion, transaction), false)

  const hqManager = makeContext({
    userId: 'hq-manager-1',
    workspaceRole: 'hq_manager',
    scopeLevel: 'workspace_hq',
  })
  assert.equal(service.canViewFinanceWorkflow(hqManager, transaction), true)
  assert.equal(service.canEditFinanceWorkflow(hqManager, transaction), true)

  const complianceAssigned = makeContext({
    userId: '44444444-4444-4444-8444-444444444444',
    workspaceRole: 'compliance',
    scopeLevel: 'assigned',
  })
  assert.equal(service.canViewFinanceWorkflow(complianceAssigned, transaction), true)
  assert.equal(service.canReviewFinanceCompliance(complianceAssigned, transaction), true)
  assert.equal(service.canCompleteFinanceStep(complianceAssigned, transaction, 'compliance_review_pending'), true)
  assert.equal(service.canCompleteFinanceStep(complianceAssigned, transaction, 'submitted_to_banks'), false)

  const unassignedConsultant = makeContext({
    userId: 'consultant-2',
    workspaceRole: 'consultant',
    scopeLevel: 'assigned',
  })
  assert.equal(service.canViewFinanceWorkflow(unassignedConsultant, transaction), false)
  assert.equal(service.canEditFinanceWorkflow(unassignedConsultant, transaction), false)

  console.log('bondFinanceWorkflowOwnershipService tests passed')
} finally {
  await server.close()
}
