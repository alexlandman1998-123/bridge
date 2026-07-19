import assert from 'node:assert/strict'
import { buildMvpTransactionParticipantBootstrap } from '../mvpTransactionParticipantBootstrap.js'

const bootstrap = buildMvpTransactionParticipantBootstrap({
  routingProfile: { transactionType: 'resale', financeType: 'hybrid', buyerEntityType: 'trust', sellerEntityType: 'company' },
  buyer: { name: 'Trust Buyer', email: 'buyer@example.test' },
  seller: { name: 'Seller Company' }, agent: { id: 'agent-1', email: 'agent@example.test' },
})

assert.deepEqual(bootstrap.participants.map((participant) => participant.roleKey), ['buyer', 'seller', 'agent'])
assert.ok(bootstrap.requirements.some((requirement) => requirement.roleKey === 'buyer_trustee'))
assert.ok(bootstrap.requirements.some((requirement) => requirement.roleKey === 'seller_company_signatory'))
assert.ok(bootstrap.requirements.some((requirement) => requirement.roleKey === 'bond_originator'))
console.log('mvp transaction participant bootstrap tests passed')
