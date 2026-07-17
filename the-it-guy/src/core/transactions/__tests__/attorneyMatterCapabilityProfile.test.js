import assert from 'node:assert/strict'
import { buildAttorneyMatterCapabilityProfile } from '../attorneyMatterCapabilityProfile.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

function context({ assigned = false, manager = false, override = false, capabilities = {}, assignmentId = null } = {}) {
  return {
    canViewLane: true,
    isAssignedAttorney: assigned,
    isFirmManagement: manager,
    managementOverrideEnabled: override,
    assignment: assignmentId ? { id: assignmentId } : null,
    assignmentScopedCapabilities: {
      canEdit: false,
      canUpdateLane: false,
      canRequestDocuments: false,
      canUploadDocuments: false,
      canReviewDocuments: false,
      canManageSigning: false,
      canAddInternalNote: false,
      canAddSharedUpdate: false,
      canPublishClientVisibleUpdate: false,
      ...capabilities,
    },
  }
}

const editable = {
  canEdit: true,
  canUpdateLane: true,
  canRequestDocuments: true,
  canUploadDocuments: true,
  canReviewDocuments: true,
  canManageSigning: true,
  canAddInternalNote: true,
  canAddSharedUpdate: true,
}

test('transfer attorney resolves to the transfer lane only', () => {
  const profile = buildAttorneyMatterCapabilityProfile({
    userId: 'user-transfer',
    appRole: 'attorney',
    requiredLaneKeys: ['transfer', 'bond'],
    lanePermissionContexts: {
      transfer: context({ assigned: true, capabilities: editable, assignmentId: 'assignment-transfer' }),
      bond: context(),
      cancellation: context(),
    },
  })

  assert.equal(profile.matterRole, 'transfer_attorney')
  assert.equal(profile.primaryAttorneyRole, 'transfer_attorney')
  assert.equal(profile.defaultLaneKey, 'transfer')
  assert.deepEqual(profile.assignedLaneKeys, ['transfer'])
  assert.deepEqual(profile.editableLaneKeys, ['transfer'])
  assert.equal(profile.lanes.transfer.assignmentId, 'assignment-transfer')
  assert.equal(profile.lanes.bond.canView, true)
  assert.equal(profile.lanes.bond.canEdit, false)
})

test('bond and cancellation attorneys resolve to their own workflows', () => {
  const bondProfile = buildAttorneyMatterCapabilityProfile({
    appRole: 'attorney',
    requiredLaneKeys: ['transfer', 'bond'],
    lanePermissionContexts: {
      transfer: context(),
      bond: context({ assigned: true, capabilities: editable }),
      cancellation: context(),
    },
  })
  const cancellationProfile = buildAttorneyMatterCapabilityProfile({
    appRole: 'attorney',
    requiredLaneKeys: ['transfer', 'cancellation'],
    lanePermissionContexts: {
      transfer: context(),
      bond: context(),
      cancellation: context({ assigned: true, capabilities: editable }),
    },
  })

  assert.equal(bondProfile.matterRole, 'bond_attorney')
  assert.equal(bondProfile.defaultLaneKey, 'bond')
  assert.deepEqual(bondProfile.editableLaneKeys, ['bond'])
  assert.equal(cancellationProfile.matterRole, 'cancellation_attorney')
  assert.equal(cancellationProfile.defaultLaneKey, 'cancellation')
  assert.deepEqual(cancellationProfile.editableLaneKeys, ['cancellation'])
})

test('multiple active assignments produce a multi-role profile', () => {
  const profile = buildAttorneyMatterCapabilityProfile({
    appRole: 'attorney',
    requiredLaneKeys: ['transfer', 'bond', 'cancellation'],
    lanePermissionContexts: {
      transfer: context({ assigned: true, capabilities: editable }),
      bond: context({ assigned: true, capabilities: editable }),
      cancellation: context(),
    },
  })

  assert.equal(profile.matterRole, 'multi_role')
  assert.equal(profile.isMultiRole, true)
  assert.equal(profile.primaryAttorneyRole, null)
  assert.deepEqual(profile.assignedRoles, ['transfer_attorney', 'bond_attorney'])
  assert.deepEqual(profile.editableLaneKeys, ['transfer', 'bond'])
})

test('manager access stays view-only until an override grants lane authority', () => {
  const viewOnly = buildAttorneyMatterCapabilityProfile({
    appRole: 'attorney',
    requiredLaneKeys: ['transfer', 'bond'],
    lanePermissionContexts: {
      transfer: context({ manager: true }),
      bond: context({ manager: true }),
      cancellation: context({ manager: true }),
    },
  })
  const override = buildAttorneyMatterCapabilityProfile({
    appRole: 'attorney',
    requiredLaneKeys: ['bond'],
    lanePermissionContexts: {
      transfer: context({ manager: true }),
      bond: context({ manager: true, override: true, capabilities: editable }),
      cancellation: context({ manager: true }),
    },
  })

  assert.equal(viewOnly.matterRole, 'manager')
  assert.deepEqual(viewOnly.editableLaneKeys, [])
  assert.equal(viewOnly.defaultLaneKey, 'transfer')
  assert.equal(override.hasManagementOverride, true)
  assert.deepEqual(override.editableLaneKeys, ['bond'])
  assert.equal(override.defaultLaneKey, 'bond')
  assert.equal(override.lanes.bond.accessReason, 'management_override')
})

test('assignment flags are preserved as granular capabilities', () => {
  const profile = buildAttorneyMatterCapabilityProfile({
    appRole: 'attorney',
    requiredLaneKeys: ['bond'],
    lanePermissionContexts: {
      bond: context({
        assigned: true,
        capabilities: {
          canEdit: true,
          canUpdateLane: true,
          canRequestDocuments: true,
          canUploadDocuments: true,
          canManageSigning: false,
        },
      }),
    },
  })

  assert.equal(profile.lanes.bond.canEdit, true)
  assert.equal(profile.lanes.bond.canRequestDocuments, true)
  assert.equal(profile.lanes.bond.canManageSigning, false)
})
