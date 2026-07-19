import assert from 'node:assert/strict'
import fs from 'node:fs'
import { buildMvpControlledTestRoleSet, buildMvpTransactionParticipantBootstrap, MVP_CONTROLLED_TEST_ROLE_SET } from '../src/core/transactions/mvpTransactionParticipantBootstrap.js'

const cashRoles = buildMvpControlledTestRoleSet({ routingProfile: { financeType: 'cash' } })
assert.deepEqual(cashRoles.map((role) => role.roleKey), ['buyer', 'seller', 'transfer_attorney', 'agent'])
assert.ok(cashRoles.every((role) => role.name.startsWith('TEST — DO NOT ACTION')))
assert.ok(cashRoles.every((role) => role.email.endsWith('.invalid')))
assert.ok(cashRoles.every((role) => role.userId === null))

const hybridBootstrap = buildMvpTransactionParticipantBootstrap({
  routingProfile: { financeType: 'hybrid', transactionType: 'resale', buyerEntityType: 'trust' },
  buyer: { name: 'Real Buyer', email: 'buyer@example.test' }, seller: { name: 'Real Seller', email: 'seller@example.test' },
  agent: { id: 'agent-1', name: 'Real Agent', email: 'agent@example.test' }, controlledTestRoleSet: MVP_CONTROLLED_TEST_ROLE_SET,
})
assert.equal(hybridBootstrap.controlledTestRoleSet, MVP_CONTROLLED_TEST_ROLE_SET)
assert.deepEqual(hybridBootstrap.participants.map((role) => role.roleKey), ['buyer', 'seller', 'agent', 'transfer_attorney', 'buyer_trustee', 'bond_originator', 'bond_attorney'])
assert.ok(hybridBootstrap.participants.every((role) => role.email.endsWith('.invalid')))
assert.ok(hybridBootstrap.participants.every((role) => role.userId === null))
assert.deepEqual(
  hybridBootstrap.requirements.map((role) => role.roleKey).sort(),
  hybridBootstrap.participants.map((role) => role.roleKey).sort(),
)

const normalBootstrap = buildMvpTransactionParticipantBootstrap({ routingProfile: { financeType: 'cash' }, buyer: { name: 'Real Buyer', email: 'buyer@example.test' } })
assert.equal(normalBootstrap.controlledTestRoleSet, null)
assert.equal(normalBootstrap.participants[0].email, 'buyer@example.test')

assert.throws(
  () => buildMvpControlledTestRoleSet({ routingProfile: { buyerEntityType: 'company', sellerEntityType: 'trust' } }),
  /MVP_CONTROLLED_TEST_ROLE_SET_CLIENT_ROLE_COLLISION/,
)

const lifecycleSource = fs.readFileSync('src/lib/transactionLifecycleService.js', 'utf8')
assert.match(lifecycleSource, /payload\?\.testMode === true/)
assert.match(lifecycleSource, /payload\?\.controlledTestRoleSet === MVP_CONTROLLED_TEST_ROLE_SET/)
console.log('mvp-controlled-test-role-set: passed')
