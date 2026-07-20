import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), 'utf8')
}

function activeMembership(role) {
  const professionalRole = ['transfer_attorney', 'bond_attorney'].includes(role) ? 'attorney_conveyancer' : role
  const practiceQualifications = role === 'transfer_attorney' ? ['transfer'] : role === 'bond_attorney' ? ['bond'] : []
  return { id: `membership-${role}`, role, professionalRole, practiceQualifications, status: 'active', isActive: true }
}

function assignment(overrides = {}) {
  return {
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
    isAssignedAttorney: true,
    isAssignedParticipant: true,
    isManagementUser: false,
    managementOverrideEnabled: false,
    assignment: assignment(),
    ...overrides,
  }
}

function assertAllOperationalActionsDenied(result, label) {
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

function verifyFailClosedSourceContracts() {
  const hook = read('src/hooks/useAttorneyPermissions.js')
  const operations = read('src/services/attorneyOperations.js')
  const incomingQueue = read('src/services/attorneyIncomingMatterQueue.js')
  const members = read('src/services/attorneyFirmMembers.js')
  const firms = read('src/services/attorneyFirms.js')
  const dashboard = read('src/services/attorneyDashboard.js')
  const membershipPermissions = read('src/lib/attorneyPermissions.js')
  const legalPermissions = read('src/services/permissions/attorneyPermissionService.js')

  assert.doesNotMatch(hook, /buildBootstrapMembership|role:\s*'firm_admin'/)
  assert.doesNotMatch(operations, /buildBootstrapMembership|user_metadata\?\.attorney_role/)
  assert.doesNotMatch(incomingQueue, /user_metadata\?\.attorney_role/)
  assert.doesNotMatch(members, /recovery-admin-|using current user firm-admin recovery membership/)
  assert.doesNotMatch(firms, /buildSyntheticFirmAdminMembership|owner-admin-|\.from\('attorney_firm_members'\)\s*\.upsert\(membershipPayload/)
  assert.match(firms, /client\.rpc\('bootstrap_attorney_firm_admin_membership'/)
  assert.doesNotMatch(dashboard, /buildOwnerDashboardMember|owner-admin-/)
  assert.doesNotMatch(membershipPermissions, /owner-admin-|resolveOwnerAdminMembershipFallback/)
  assert.doesNotMatch(legalPermissions, /PHASE_ONE_SHARED_WORKFLOW_EDITING|canEditAllWorkflowLanesInPhaseOne/)
  assert.match(legalPermissions, /membership\?\.isActive/)
  assert.match(legalPermissions, /isAssignedParticipant \|\| managementOverrideEnabled/)
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
  const { getAttorneyRolePermissions } = await server.ssrLoadModule('/src/lib/attorneyPermissions.js')

  verifyFailClosedSourceContracts()

  assert.equal(
    Object.values(getAttorneyRolePermissions('not-a-real-role')).some(Boolean),
    false,
    'Unknown roles must resolve to no permissions.',
  )

  const transferAttorney = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('transfer_attorney'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assert.equal(transferAttorney.canUpdateLane, true)
  assert.equal(transferAttorney.canReviewDocuments, true)
  assert.equal(transferAttorney.canManageSigning, true)
  assert.equal(transferAttorney.canPublishClientVisibleUpdate, true)

  const transferAttorneyOnBond = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('transfer_attorney'),
    attorneyRole: 'bond_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assert.equal(transferAttorneyOnBond.canUpdateLane, false)

  const bondAttorneyOnTransfer = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('bond_attorney'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assert.equal(bondAttorneyOnTransfer.canUpdateLane, false)

  const candidate = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('candidate_attorney'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess({ isAssignedAttorney: false }),
    canViewAsAttorney: true,
  })
  assert.equal(candidate.canUploadDocuments, true)
  assert.equal(candidate.canAddInternalNote, true)
  assert.equal(candidate.canRequestDocuments, false)
  assert.equal(candidate.canReviewDocuments, false)
  assert.equal(candidate.canManageSigning, false)
  assert.equal(candidate.canUpdateLane, false)
  assert.equal(candidate.canPublishClientVisibleUpdate, false)

  const receptionist = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('reception_scheduling'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess({ isAssignedAttorney: false }),
    canViewAsAttorney: true,
  })
  assert.equal(receptionist.canManageSigning, true)
  assert.equal(receptionist.canAddInternalNote, true)
  assert.equal(receptionist.canRequestDocuments, false)
  assert.equal(receptionist.canReviewDocuments, false)
  assert.equal(receptionist.canUpdateLane, false)

  const adminStaff = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('admin_staff'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess({ isAssignedAttorney: false }),
    canViewAsAttorney: true,
  })
  assert.equal(adminStaff.canRequestDocuments, true)
  assert.equal(adminStaff.canReviewDocuments, true)
  assert.equal(adminStaff.canUploadDocuments, true)
  assert.equal(adminStaff.canManageSigning, false)
  assert.equal(adminStaff.canPublishClientVisibleUpdate, false)

  const missingMembership = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: null,
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assertAllOperationalActionsDenied(missingMembership, 'missing membership')
  assert.equal(missingMembership.canViewInternalNotes, false)

  const suspendedMembership = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: { role: 'firm_admin', professionalRole: 'firm_admin', status: 'suspended', isActive: false },
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assertAllOperationalActionsDenied(suspendedMembership, 'suspended membership')

  const unassignedCandidate = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('candidate_attorney'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess({ isAssignedAttorney: false, isAssignedParticipant: false }),
    canViewAsAttorney: true,
  })
  assertAllOperationalActionsDenied(unassignedCandidate, 'unassigned candidate')

  const assignmentRestrictedAttorney = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('transfer_attorney'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess({
      assignment: assignment({
        can_manage_documents: false,
        can_manage_signing: false,
        can_update_workflow_lane: false,
        can_add_internal_notes: false,
        can_add_shared_updates: false,
      }),
    }),
    canViewAsAttorney: true,
  })
  assertAllOperationalActionsDenied(assignmentRestrictedAttorney, 'assignment-restricted attorney')

  const managerWithoutOverride = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('firm_admin'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess({
      isAssignedAttorney: false,
      isAssignedParticipant: false,
      isManagementUser: true,
      managementOverrideEnabled: false,
    }),
    canViewAsAttorney: true,
  })
  assertAllOperationalActionsDenied(managerWithoutOverride, 'unassigned manager without override')
  assert.equal(managerWithoutOverride.canViewInternalNotes, true)

  const managerWithOverride = resolveAttorneyActionPermissions({
    appRole: 'attorney',
    membership: activeMembership('firm_admin'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess({
      isAssignedAttorney: false,
      isAssignedParticipant: false,
      isManagementUser: true,
      managementOverrideEnabled: true,
    }),
    canViewAsAttorney: true,
  })
  assert.equal(managerWithOverride.canUpdateLane, true)
  assert.equal(managerWithOverride.canReviewDocuments, true)
  assert.equal(managerWithOverride.canManageSigning, true)

  const nonAttorneyAppUser = resolveAttorneyActionPermissions({
    appRole: 'agent',
    membership: activeMembership('firm_admin'),
    attorneyRole: 'transfer_attorney',
    attorneyAccess: laneAccess(),
    canViewAsAttorney: true,
  })
  assertAllOperationalActionsDenied(nonAttorneyAppUser, 'non-attorney app user')

  console.log('Attorney role security Phase 1 verification passed.')
} finally {
  await server.close()
}
