import assert from 'node:assert/strict'

import { buildAttorneyMatterScope } from '../attorneyMatterScope.js'
import { buildAttorneyMatterScopeAudit } from '../attorneyMatterScopeAudit.js'

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

test('coordinator scope audits as full visible matter access', () => {
  const scope = {
    ...buildAttorneyMatterScope({
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
    }),
    scoped: true,
  }

  const audit = buildAttorneyMatterScopeAudit(scope, { transactionId: 'tx-1' })

  assert.equal(audit.scopeKind, 'coordinator')
  assert.equal(audit.transactionId, 'tx-1')
  assert.equal(audit.healthy, true)
  assert.deepEqual(audit.visibleLaneKeys, requiredLaneKeys)
  assert.deepEqual(audit.hiddenLaneKeys, [])
})

test('bond scope audits hidden coordinator lanes', () => {
  const scope = {
    ...buildAttorneyMatterScope({
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
    }),
    scoped: true,
  }

  const audit = buildAttorneyMatterScopeAudit(scope, {
    transactionId: 'tx-2',
    requestedLaneKey: 'bond-registration',
  })

  assert.equal(audit.scopeKind, 'bond_lane')
  assert.equal(audit.requestedLaneKey, 'bond')
  assert.equal(audit.requestedLaneVisible, true)
  assert.deepEqual(audit.visibleLaneKeys, ['bond'])
  assert.deepEqual(audit.hiddenLaneKeys, ['transfer', 'cancellation'])
  assert.deepEqual(audit.summaryLaneKeys, ['transfer', 'cancellation'])
  assert.equal(audit.canSeeCoordinatorContext, false)
  assert.equal(audit.healthy, true)
})

test('requested hidden lane is reported as an audit issue', () => {
  const scope = {
    ...buildAttorneyMatterScope({
      requiredLaneKeys,
      laneAccessContexts: {
        bond: {
          canViewMatter: true,
          canActAsAttorney: true,
          isAssignedAttorney: true,
          isAssignedParticipant: true,
        },
      },
    }),
    scoped: true,
  }

  const audit = buildAttorneyMatterScopeAudit(scope, { requestedLaneKey: 'bond-cancellation' })

  assert.equal(audit.requestedLaneKey, 'cancellation')
  assert.equal(audit.requestedLaneVisible, false)
  assert.equal(audit.healthy, false)
  assert.ok(audit.issues.includes('requested_lane_not_visible'))
})

test('denied scope is explicit when no lane is visible', () => {
  const audit = buildAttorneyMatterScopeAudit({
    scoped: true,
    requiredLaneKeys,
    visibleLaneKeys: [],
    editableLaneKeys: [],
  })

  assert.equal(audit.scopeKind, 'denied')
  assert.equal(audit.healthy, false)
  assert.ok(audit.issues.includes('no_visible_lanes'))
})

console.log('attorneyMatterScopeAudit tests passed')
