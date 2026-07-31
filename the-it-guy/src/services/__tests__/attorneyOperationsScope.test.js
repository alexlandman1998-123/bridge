import assert from 'node:assert/strict'

import {
  applyAttorneyOperationsScope,
  buildAttorneyOperationsScope,
} from '../../core/transactions/attorneyOperationsScope.js'

const rows = [
  { matterId: 'tx-transfer', matterType: 'Transfer' },
  { matterId: 'tx-bond', matterType: 'Bond' },
  { matterId: 'tx-cancellation', matterType: 'Cancellation' },
  { matterId: 'tx-transfer-bond', matterType: 'Transfer + Bond' },
  { matterId: 'tx-bond-cancellation', matterType: 'Bond + Cancellation' },
  { matterId: 'tx-transfer-cancellation', matterType: 'Transfer + Cancellation' },
]

const bondScope = buildAttorneyOperationsScope({
  currentUser: {
    role: 'member',
    professionalRole: 'attorney_conveyancer',
    practiceQualifications: ['bond'],
  },
  permissions: {
    can_view_all_firm_matters: false,
  },
})

assert.equal(bondScope.canViewAllOperationalQueues, false)
assert.deepEqual(bondScope.listLaneKeys, ['bond'])
assert.deepEqual(
  applyAttorneyOperationsScope(rows, bondScope).map((row) => row.matterId),
  ['tx-bond', 'tx-transfer-bond', 'tx-bond-cancellation'],
)

const cancellationScope = buildAttorneyOperationsScope({
  currentUser: {
    role: 'cancellation_attorney',
  },
  permissions: {
    can_view_all_firm_matters: false,
  },
})

assert.deepEqual(cancellationScope.listLaneKeys, ['cancellation'])
assert.deepEqual(
  applyAttorneyOperationsScope(rows, cancellationScope).map((row) => row.matterId),
  ['tx-cancellation', 'tx-bond-cancellation', 'tx-transfer-cancellation'],
)

const managementScope = buildAttorneyOperationsScope({
  currentUser: {
    role: 'firm_admin',
  },
  permissions: {
    can_view_all_firm_matters: true,
  },
})

assert.equal(managementScope.canViewAllOperationalQueues, true)
assert.deepEqual(
  applyAttorneyOperationsScope(rows, managementScope).map((row) => row.matterId),
  rows.map((row) => row.matterId),
)

console.log('attorneyOperations scope tests passed')
