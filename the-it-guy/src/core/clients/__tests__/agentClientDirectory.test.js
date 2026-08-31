import { expect, test } from 'vitest'
import { getAgentClientOpenPath } from '../agentClientDirectory.js'

test('manual buyers open by their stable buyer id', () => {
  const path = getAgentClientOpenPath({
    id: 'name:rls smoke test buyer',
    linkedRecords: [{
      kind: 'client',
      path: '/clients/buyer%3Ae7f0b435-3595-451e-8796-ae2cdb845aaa',
      lastActivityAt: '2026-08-31T15:49:04.069Z',
    }],
  })

  expect(path).toBe('/clients/buyer%3Ae7f0b435-3595-451e-8796-ae2cdb845aaa')
})

test('legacy manual contacts keep their existing directory identity route', () => {
  const path = getAgentClientOpenPath({
    id: 'name:existing contact',
    linkedRecords: [{ kind: 'client', path: '/clients/contact%3Acontact-id' }],
  })

  expect(path).toBe('/clients/name%3Aexisting%20contact')
})

test('transaction-backed clients still open the transaction workspace', () => {
  const path = getAgentClientOpenPath({
    id: 'name:transaction buyer',
    linkedRecords: [{ kind: 'transaction', path: '/transactions/transaction-id' }],
  })

  expect(path).toBe('/transactions/transaction-id')
})
