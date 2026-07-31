import assert from 'node:assert/strict'
import { buildAttorneyMatterScope } from '../attorneyMatterScope.js'

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

const requiredLaneKeys = ['transfer', 'bond', 'cancellation']

test('transfer attorney receives the full coordinator matter scope', () => {
  const scope = buildAttorneyMatterScope({
    requiredLaneKeys,
    laneAccessContexts: {
      transfer: {
        canViewMatter: true,
        canActAsAttorney: true,
        isAssignedAttorney: true,
        isAssignedParticipant: true,
      },
      bond: { canViewMatter: true },
      cancellation: { canViewMatter: true },
    },
  })

  assert.deepEqual(scope.visibleLaneKeys, ['transfer', 'bond', 'cancellation'])
  assert.deepEqual(scope.editableLaneKeys, ['transfer'])
  assert.deepEqual(scope.summaryLaneKeys, [])
  assert.equal(scope.defaultLaneKey, 'transfer')
  assert.equal(scope.matterRole, 'transfer')
  assert.equal(scope.canSeeFullMatter, true)
  assert.equal(scope.canSeeCoordinatorContext, true)
})

test('bond attorney receives a bond workbench with other lanes summarized', () => {
  const scope = buildAttorneyMatterScope({
    requiredLaneKeys,
    laneAccessContexts: {
      transfer: { canViewMatter: true },
      bond: {
        canViewMatter: true,
        canActAsAttorney: true,
        isAssignedAttorney: true,
        isAssignedParticipant: true,
      },
      cancellation: { canViewMatter: true },
    },
  })

  assert.deepEqual(scope.visibleLaneKeys, ['bond'])
  assert.deepEqual(scope.editableLaneKeys, ['bond'])
  assert.deepEqual(scope.summaryLaneKeys, ['transfer', 'cancellation'])
  assert.equal(scope.defaultLaneKey, 'bond')
  assert.equal(scope.matterRole, 'bond')
  assert.equal(scope.canSeeFullMatter, false)
  assert.equal(scope.canSeeCoordinatorContext, false)
})

test('cancellation attorney receives a cancellation workbench with other lanes summarized', () => {
  const scope = buildAttorneyMatterScope({
    requiredLaneKeys,
    laneAccessContexts: {
      transfer: { canViewMatter: true },
      bond: { canViewMatter: true },
      cancellation: {
        canViewMatter: true,
        canActAsAttorney: true,
        isAssignedAttorney: true,
        isAssignedParticipant: true,
      },
    },
  })

  assert.deepEqual(scope.visibleLaneKeys, ['cancellation'])
  assert.deepEqual(scope.editableLaneKeys, ['cancellation'])
  assert.deepEqual(scope.summaryLaneKeys, ['transfer', 'bond'])
  assert.equal(scope.defaultLaneKey, 'cancellation')
  assert.equal(scope.matterRole, 'cancellation')
  assert.equal(scope.canSeeFullMatter, false)
})

test('firm management sees all lanes but only edits lanes with authority', () => {
  const scope = buildAttorneyMatterScope({
    requiredLaneKeys,
    laneAccessContexts: {
      transfer: {
        canViewMatter: true,
        canManageMatter: true,
        canAssignLane: true,
        isManagementUser: true,
      },
      bond: {
        canViewMatter: true,
        canManageMatter: true,
        canAssignLane: true,
        isManagementUser: true,
        canActAsAttorney: true,
        managementOverrideEnabled: true,
      },
      cancellation: {
        canViewMatter: true,
        canManageMatter: true,
        canAssignLane: true,
        isManagementUser: true,
      },
    },
  })

  assert.deepEqual(scope.visibleLaneKeys, ['transfer', 'bond', 'cancellation'])
  assert.deepEqual(scope.editableLaneKeys, ['bond'])
  assert.deepEqual(scope.summaryLaneKeys, [])
  assert.equal(scope.defaultLaneKey, 'transfer')
  assert.equal(scope.matterRole, 'management')
  assert.equal(scope.canAssignLane, true)
  assert.equal(scope.canSeeFullMatter, true)
})

test('non-required lanes are excluded from the contract', () => {
  const scope = buildAttorneyMatterScope({
    requiredLaneKeys: ['transfer', 'bond'],
    laneAccessContexts: {
      bond: {
        canViewMatter: true,
        canActAsAttorney: true,
        isAssignedAttorney: true,
        isAssignedParticipant: true,
      },
      cancellation: {
        canViewMatter: true,
        canActAsAttorney: true,
        isAssignedAttorney: true,
        isAssignedParticipant: true,
      },
    },
  })

  assert.deepEqual(scope.requiredLaneKeys, ['transfer', 'bond'])
  assert.deepEqual(scope.visibleLaneKeys, ['bond'])
  assert.deepEqual(scope.editableLaneKeys, ['bond'])
  assert.equal(scope.laneScopes.cancellation, undefined)
})

console.log('attorneyMatterScope tests passed')
