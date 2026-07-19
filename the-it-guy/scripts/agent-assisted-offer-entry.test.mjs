import assert from 'node:assert/strict'
import { buildAgentAssistedOfferEntry } from '../src/lib/agentAssistedOfferEntry.js'

const incomplete = buildAgentAssistedOfferEntry({ buyer: { name: 'TEST Buyer' }, draft: {} })
assert.equal(incomplete.ok, false)
assert.match(incomplete.blockers[0], /offer amount/i)

const entry = buildAgentAssistedOfferEntry({
  buyer: { name: 'TEST Buyer', email: 'buyer@example.test', phone: '0820000000' },
  draft: { offerAmount: '2500000', depositAmount: '250000', financeType: 'hybrid', specialConditions: 'Subject to finance.' },
  now: '2026-07-19T08:00:00.000Z',
})
assert.equal(entry.ok, true)
assert.equal(entry.payload.offerAmount, 2500000)
assert.equal(entry.payload.financeType, 'hybrid')
assert.equal(entry.payload.conditionsJson.offerEntryMode, 'agent_assisted')
assert.equal(entry.payload.conditionsJson.agentAssisted, true)
console.log('agent-assisted-offer-entry: passed')
