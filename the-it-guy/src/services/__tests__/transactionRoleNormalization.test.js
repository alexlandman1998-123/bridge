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

try {
  const {
    resolveTransactionParticipantShape,
    resolveTransactionRole,
  } = await server.ssrLoadModule('/src/services/roleResolutionService.js')
  const { normalizeRoleType } = await server.ssrLoadModule('/src/core/transactions/permissions.js')

  {
    assert.equal(normalizeRoleType('transfer_attorney'), 'attorney')
    assert.equal(normalizeRoleType('bond attorney'), 'attorney')
    assert.equal(normalizeRoleType('cancellation-attorney'), 'attorney')
    assert.equal(normalizeRoleType('listing_agent'), 'agent')
    assert.equal(normalizeRoleType('developer_contact'), 'developer')
  }

  {
    assert.deepEqual(resolveTransactionParticipantShape({ role_type: 'transfer_attorney' }), {
      roleType: 'attorney',
      legalRole: 'transfer',
      transactionRole: 'transfer_attorney',
    })
    assert.deepEqual(resolveTransactionParticipantShape({ role_type: 'bond_attorney' }), {
      roleType: 'attorney',
      legalRole: 'bond',
      transactionRole: 'bond_attorney',
    })
    assert.deepEqual(resolveTransactionParticipantShape({ role_type: 'cancellation_attorney' }), {
      roleType: 'attorney',
      legalRole: 'cancellation',
      transactionRole: 'cancellation_attorney',
    })
  }

  {
    assert.deepEqual(resolveTransactionParticipantShape({ role_type: 'attorney', legal_role: 'bond' }), {
      roleType: 'attorney',
      legalRole: 'bond',
      transactionRole: 'bond_attorney',
    })
    assert.deepEqual(resolveTransactionParticipantShape({ transaction_role: 'cancellation_attorney' }), {
      roleType: 'attorney',
      legalRole: 'cancellation',
      transactionRole: 'cancellation_attorney',
    })
  }

  {
    assert.deepEqual(resolveTransactionParticipantShape({ role_type: 'bond_originator' }), {
      roleType: 'bond_originator',
      legalRole: 'none',
      transactionRole: 'bond_originator',
    })
    assert.deepEqual(resolveTransactionParticipantShape({ role_type: 'buyer' }), {
      roleType: 'buyer',
      legalRole: 'none',
      transactionRole: 'buyer',
    })
    assert.deepEqual(resolveTransactionParticipantShape({ role_type: 'seller' }), {
      roleType: 'seller',
      legalRole: 'none',
      transactionRole: 'seller',
    })
  }

  {
    assert.equal(resolveTransactionRole({ role_type: 'attorney', legal_role: 'transfer' }), 'transfer_attorney')
    assert.equal(resolveTransactionRole({ role_type: 'attorney', legal_role: 'bond' }), 'bond_attorney')
    assert.equal(resolveTransactionRole({ role_type: 'attorney', legal_role: 'cancellation' }), 'cancellation_attorney')
  }

  console.log('transactionRoleNormalization tests passed')
} finally {
  await server.close()
}
