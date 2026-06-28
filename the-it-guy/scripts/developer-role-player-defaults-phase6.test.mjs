import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  api: await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8'),
  transactionsTable: await readFile(new URL('../src/components/AgentTransactionsTable.jsx', import.meta.url), 'utf8'),
  statusBadge: await readFile(new URL('../src/components/ui/StatusBadge.jsx', import.meta.url), 'utf8'),
}

for (const requiredApiToken of [
  'resolveBuyerBondOriginatorRequestFromOnboardingData',
  'summarizeBuyerBondOriginatorRequestForOperations',
  "from('onboarding_form_data')",
  'buyerBondOriginatorRequestSummary',
  'buyerBondOriginatorRequestActionRequired',
  'buyer_bond_originator_request_action_required',
]) {
  assert(files.api.includes(requiredApiToken), `api.js should include ${requiredApiToken}`)
}

assert(
  files.api.includes('Agent or developer approval is required') &&
    files.api.includes('Buyer originator review'),
  'transaction enrichment should provide practical operations copy for pending buyer-originator approvals',
)

for (const requiredTableToken of [
  "{ key: 'needs_review', label: 'Needs Review' }",
  'getBuyerBondOriginatorRequestSummary',
  "filterKey === 'needs_review'",
  'buyer-originator-request-chip',
  'Buyer originator review',
]) {
  assert(
    files.transactionsTable.includes(requiredTableToken),
    `AgentTransactionsTable should include ${requiredTableToken}`,
  )
}

assert(
  files.statusBadge.includes('...props') &&
    files.statusBadge.includes('{...props}'),
  'StatusBadge should pass through span props so operations badges can expose native title labels',
)

console.log('Developer role-player defaults Phase 6 contract passed.')
