import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterAttorneyModuleNavigationItems,
  isAttorneyMatterViewEnabled,
  normalizeAttorneyModuleKey,
  resolveAttorneyModuleSettings,
} from '../attorneyModuleSettings.js'

test('attorney matter modules default to enabled for existing firms', () => {
  assert.deepEqual(resolveAttorneyModuleSettings({}), {
    transfer: true,
    bond: true,
    cancellation: true,
  })
  assert.equal(isAttorneyMatterViewEnabled('bond', {}), true)
  assert.equal(isAttorneyMatterViewEnabled('cancellation', {}), true)
})

test('attorney module aliases resolve to canonical matter keys', () => {
  assert.equal(normalizeAttorneyModuleKey('bond attorney'), 'bond')
  assert.equal(normalizeAttorneyModuleKey('bond_cancellation'), 'cancellation')
  assert.equal(normalizeAttorneyModuleKey('transferring_attorney'), 'transfer')
})

test('disabled attorney modules are removed from navigation children', () => {
  const items = [
    {
      key: 'attorney_matters',
      children: [
        { key: 'attorney_matters_all', label: 'All Matters' },
        { key: 'attorney_matters_bond', label: 'Bond Matters', moduleKey: 'bond' },
        { key: 'attorney_matters_cancellation', label: 'Cancellation Matters', moduleKey: 'cancellation' },
      ],
    },
  ]

  const filtered = filterAttorneyModuleNavigationItems(items, {
    attorneyModules: { bond: false, cancellation: true },
  })

  assert.deepEqual(filtered[0].children.map((item) => item.key), [
    'attorney_matters_all',
    'attorney_matters_cancellation',
  ])
})
