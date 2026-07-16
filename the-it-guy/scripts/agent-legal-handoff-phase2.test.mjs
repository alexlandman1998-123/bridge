import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'

const migration = await readFile(new URL('../../supabase/migrations/202607160022_agent_legal_handoff_phase2.sql', import.meta.url), 'utf8')
const lifecycleSource = await readFile(new URL('../src/lib/buyerLifecycleService.js', import.meta.url), 'utf8')
const leadPageSource = await readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')

for (const signal of [
  'bridge_prepare_agent_legal_handoff',
  "array['transfer']",
  "array_append(v_required_lanes, 'bond')",
  "array_append(v_required_lanes, 'cancellation')",
  'on conflict (transaction_id, process_type) do nothing',
  'missingAttorneyRoles',
]) {
  assert.ok(migration.includes(signal), `Phase 2 migration should include ${signal}.`)
}

assert.ok(lifecycleSource.includes(".from('private_listings')"), 'accepted-offer conversion should hydrate the canonical listing before routing')
assert.ok(lifecycleSource.includes('attachLegalHandoff'), 'new and reused transactions should both prepare the same legal handoff')
assert.ok(leadPageSource.includes('Legal handoff ready on transaction'), 'agent lead conversion should show the handoff result')

const server = await createServer({ root: process.cwd(), logLevel: 'silent', server: { middlewareMode: true } })
try {
  const { resolveTransactionRoutingProfile } = await server.ssrLoadModule('/src/services/transactionRoutingProfileService.js')
  const { normalizeAgentLegalHandoffResult } = await server.ssrLoadModule('/src/services/agentLegalHandoffService.js')

  const cash = resolveTransactionRoutingProfile({
    transaction: { id: 'cash-tx', finance_type: 'cash', transaction_type: 'private_sale', purchaser_type: 'individual' },
    listing: { property_tenure: 'freehold', seller_type: 'individual', seller_has_existing_bond: false },
  })
  assert.equal(cash.requiresTransferAttorney, true)
  assert.equal(cash.requiresBondAttorney, false)
  assert.equal(cash.requiresCancellationAttorney, false)

  const financedCancellation = resolveTransactionRoutingProfile({
    transaction: { id: 'bond-tx', finance_type: 'bond', transaction_type: 'private_sale', purchaser_type: 'company' },
    listing: { property_tenure: 'sectional_title', seller_type: 'trust', seller_has_existing_bond: true },
  })
  assert.equal(financedCancellation.requiresBondAttorney, true)
  assert.equal(financedCancellation.requiresCancellationAttorney, true)
  assert.deepEqual(
    financedCancellation.requiredWorkflowKeys.filter((key) => key.startsWith('attorney_') || key === 'seller_bond_cancellation'),
    ['attorney_transfer', 'attorney_bond', 'seller_bond_cancellation'],
  )

  const handoff = normalizeAgentLegalHandoffResult({
    transactionId: 'bond-tx',
    requiredLaneKeys: ['transfer', 'bond', 'cancellation', 'bond'],
    assignedAttorneyRoles: ['transfer_attorney'],
    missingAttorneyRoles: ['bond_attorney', 'cancellation_attorney'],
  })
  assert.deepEqual(handoff.requiredLaneKeys, ['transfer', 'bond', 'cancellation'])
  assert.equal(handoff.readyForAttorneyAssignment, true)
  assert.equal(handoff.transactionId, 'bond-tx')
} finally {
  await server.close()
}

console.log('agent legal handoff phase 2 tests passed')
