import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function activeMembership(role) {
  const practiceQualificationsByRole = {
    transfer_attorney: ['transfer', 'cancellation'],
    bond_attorney: ['bond'],
    firm_admin: ['transfer', 'bond', 'cancellation'],
  }
  const professionalRole = ['transfer_attorney', 'bond_attorney'].includes(role) ? 'attorney_conveyancer' : role
  return {
    id: `membership-${role}`,
    firmId: 'firm-1',
    role,
    professionalRole,
    practiceQualifications: practiceQualificationsByRole[role] || [],
    status: 'active',
    isActive: true,
  }
}

function assignment(overrides = {}) {
  return {
    id: 'assignment-target',
    can_manage_documents: true,
    can_manage_signing: true,
    can_update_workflow_lane: true,
    can_add_internal_notes: true,
    can_add_shared_updates: true,
    ...overrides,
  }
}

function laneAccess(overrides = {}) {
  return {
    canViewMatter: true,
    firmId: 'firm-1',
    isAssignedAttorney: true,
    isAssignedParticipant: true,
    isManagementUser: false,
    isTransferAttorneyController: false,
    managementOverrideEnabled: false,
    assignment: assignment(),
    ...overrides,
  }
}

function assertOperationalActionsDenied(result, label) {
  for (const key of [
    'canUpdateLane',
    'canRequestDocuments',
    'canUploadDocuments',
    'canReviewDocuments',
    'canManageSigning',
    'canAddInternalNote',
    'canAddSharedUpdate',
    'canPublishClientVisibleUpdate',
  ]) {
    assert.equal(result[key], false, `${label}: ${key} must be denied`)
  }
}

function verifySourceContracts() {
  const workflowPanel = read('src/components/attorney/workflow/AttorneyWorkflowLanesPanel.jsx')
  const workflowService = read('src/services/attorneyWorkflow/attorneyWorkflowLaneService.js')
  const permissionService = read('src/services/permissions/attorneyPermissionService.js')
  const lanePermissions = read('src/lib/attorneyPermissions.js')
  const dbGuardMigration = read('../supabase/migrations/202607209904_attorney_workflow_transfer_controller_guard_phase4.sql')

  assert.match(workflowPanel, /const ROLE_VIEW_ORDER = \['transfer', 'bond', 'cancellation'\]/)
  assert.match(workflowPanel, /transfer:\s*'Transfer Attorney'/)
  assert.match(workflowPanel, /bond:\s*'Bond Attorney'/)
  assert.match(workflowPanel, /cancellation:\s*'Cancellation Attorney'/)
  assert.match(workflowPanel, /const roleViewLanes = useMemo/)
  assert.match(workflowPanel, /ROLE_VIEW_ORDER\.map/)
  assert.match(workflowPanel, /const activeLane = useMemo/)
  assert.match(workflowPanel, /laneCanManageBlockers\(activeLane\)/)
  assert.match(workflowPanel, /getLaneAccessLabel/)
  assert.match(workflowPanel, /Controller/)
  assert.match(workflowPanel, /Activity & Audit Trail/)
  assert.match(workflowPanel, /item\.authorizationReason/)
  assert.match(workflowPanel, /item\.authorizationLabel/)

  assert.match(permissionService, /isTransferAttorneyController = Boolean\(attorneyAccess\?\.isTransferAttorneyController\)/)
  assert.match(permissionService, /isAssignedParticipant \|\| isTransferAttorneyController \|\| managementOverrideEnabled/)
  assert.match(permissionService, /attorneyAccess\?\.isTransferAttorneyController[\s\S]*can_edit_transfer_workflow/)
  assert.match(permissionService, /controllerAssignmentId: attorneyAccess\?\.controllerAssignment\?\.id/)
  assert.match(permissionService, /controlledAssignmentId: attorneyAccess\?\.controlledAssignment\?\.id/)
  assert.match(permissionService, /authorizingAssignmentId: attorneyAccess\?\.controllerAssignment\?\.id \|\| attorneyAccess\?\.assignment\?\.id \|\| null/)

  assert.match(lanePermissions, /transfer_attorney_controller/)
  assert.match(lanePermissions, /controlledAssignment/)
  assert.match(lanePermissions, /controllerAssignment/)
  assert.match(lanePermissions, /controllerLaneRole/)

  assert.match(workflowService, /isTransferAttorneyController: Boolean\(permissionContext\?\.isTransferAttorneyController\)/)
  assert.match(workflowService, /function buildAttorneyWorkflowAuditMetadata/)
  assert.match(workflowService, /auditVersion: 'attorney_workflow_audit_v1'/)
  assert.match(workflowService, /permissionReason: auditMetadata\.permissionReason/)
  assert.match(workflowService, /authorizationReason: item\.metadata\?\.permissionReason/)
  assert.match(workflowService, /authorizationLabel: item\.metadata\?\.permissionLabel/)

  assert.match(dbGuardMigration, /bridge_resolve_attorney_workflow_lane_guard/)
  assert.match(dbGuardMigration, /'assigned_attorney'::text/)
  assert.match(dbGuardMigration, /'transfer_attorney_controller'::text/)
  assert.match(dbGuardMigration, /'management_override'::text/)
  assert.match(dbGuardMigration, /if v_lane_key <> 'transfer' then[\s\S]*'transfer_attorney_controller'::text/)
  assert.match(dbGuardMigration, /firm\.allow_management_lane_override = true/)
  assert.match(dbGuardMigration, /'permissionReason', v_guard\.access_reason/)
  assert.match(dbGuardMigration, /'authorizingAssignmentId', v_guard\.assignment_id/)
  assert.doesNotMatch(dbGuardMigration, /assignment\.secretary_id = p_actor_id/)
  assert.doesNotMatch(dbGuardMigration, /assignment\.admin_handler_id = p_actor_id/)
}

const server = await createServer({
  root,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { resolveAttorneyActionPermissions } = await server.ssrLoadModule(
    '/src/services/permissions/attorneyPermissionService.js',
  )

  verifySourceContracts()

  const transferOnTransfer = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('transfer_attorney'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assert.equal(transferOnTransfer.canUpdateLane, true, 'transfer attorney should control the transfer view')
  assert.equal(transferOnTransfer.isTransferAttorneyController, false)

  const transferOnBondWithoutController = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('transfer_attorney'),
    attorneyRole: 'bond_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assert.equal(
    transferOnBondWithoutController.canUpdateLane,
    false,
    'transfer attorney must need explicit controller authority to edit bond',
  )

  const transferControllerOnBond = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('transfer_attorney'),
    attorneyRole: 'bond_attorney',
    attorneyAccess: laneAccess({
      isAssignedAttorney: false,
      isAssignedParticipant: false,
      isTransferAttorneyController: true,
      reason: 'transfer_attorney_controller',
      assignment: assignment({ id: 'bond-assignment' }),
      controllerAssignment: assignment({ id: 'transfer-assignment' }),
    }),
    canViewAsAttorney: true,
  })
  assert.equal(transferControllerOnBond.canUpdateLane, true, 'transfer controller should edit bond view')
  assert.equal(transferControllerOnBond.canRequestDocuments, true)
  assert.equal(transferControllerOnBond.canManageSigning, true)
  assert.equal(transferControllerOnBond.isTransferAttorneyController, true)

  const transferControllerOnCancellation = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('transfer_attorney'),
    attorneyRole: 'cancellation_attorney',
    attorneyAccess: laneAccess({
      isAssignedAttorney: false,
      isAssignedParticipant: false,
      isTransferAttorneyController: true,
      reason: 'transfer_attorney_controller',
      assignment: assignment({ id: 'cancellation-assignment' }),
      controllerAssignment: assignment({ id: 'transfer-assignment' }),
    }),
    canViewAsAttorney: true,
  })
  assert.equal(transferControllerOnCancellation.canUpdateLane, true, 'transfer controller should edit cancellation view')
  assert.equal(transferControllerOnCancellation.canReviewDocuments, true)

  const bondOnBond = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('bond_attorney'),
    attorneyRole: 'bond_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assert.equal(bondOnBond.canUpdateLane, true, 'bond attorney should control the bond view')

  const bondOnTransfer = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('bond_attorney'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assert.equal(bondOnTransfer.canUpdateLane, false, 'bond attorney must not control the transfer view')

  const managementOverride = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('firm_admin'),
    attorneyRole: 'bond_attorney',
    attorneyAccess: laneAccess({
      isAssignedAttorney: false,
      isAssignedParticipant: false,
      isManagementUser: true,
      managementOverrideEnabled: true,
    }),
    canViewAsAttorney: true,
  })
  assert.equal(managementOverride.canUpdateLane, true, 'management override should remain a separate authority path')
  assert.equal(managementOverride.managementOverrideEnabled, true)

  const missingMembership = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: null,
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assertOperationalActionsDenied(missingMembership, 'missing membership')

  const noLaneAuthority = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('transfer_attorney'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess({
      isAssignedAttorney: false,
      isAssignedParticipant: false,
      isTransferAttorneyController: false,
      isManagementUser: false,
      managementOverrideEnabled: false,
    }),
    canViewAsAttorney: true,
  })
  assertOperationalActionsDenied(noLaneAuthority, 'no lane authority')

  console.log('Attorney workflow role views Phase 6 regression suite passed.')
} finally {
  await server.close()
}
