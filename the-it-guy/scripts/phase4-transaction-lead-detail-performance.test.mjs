import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const transactionApi = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')
const transactionPage = await readFile(new URL('../src/pages/AttorneyTransactionDetail.jsx', import.meta.url), 'utf8')
const transactionFacade = await readFile(new URL('../src/lib/transactionWorkspaceApi.js', import.meta.url), 'utf8')
const leadRepository = await readFile(new URL('../src/lib/agencyCrmRepository.js', import.meta.url), 'utf8')
const buyerLoader = await readFile(new URL('../src/pages/agency/buyerLeadWorkspaceDataLoader.js', import.meta.url), 'utf8')

assert.match(
  transactionApi,
  /const TRANSACTION_ROUTE_CORE_SELECT\s*=\s*\n\s*'id, development_id, unit_id, buyer_id, finance_type, stage, attorney, bond_originator, next_action, updated_at, created_at'/,
  'Transaction first paint must use the stable route-core projection.',
)
assert.match(
  transactionApi,
  /export async function fetchTransactionRouteCoreById\(transactionId\)/,
  'Transaction route-core loading must have a dedicated API.',
)
assert.match(
  transactionFacade,
  /'fetchTransactionRouteCoreById'/,
  'The lazy transaction API facade must expose route-core loading.',
)

const transactionCoreIndex = transactionPage.indexOf('await fetchTransactionRouteCoreById(transactionId)')
const transactionRollupIndex = transactionPage.indexOf('requestTransactionRollup(transactionId)', transactionCoreIndex)
const transactionEnrichmentIndex = transactionPage.indexOf('void fetchTransactionCoreById(transactionId)', transactionCoreIndex)
const transactionInteractiveIndex = transactionPage.indexOf("markRouteMilestone('interactive_ready')", transactionCoreIndex)

assert.ok(transactionCoreIndex > 0, 'Transaction detail must await only the stable core on its foreground path.')
assert.ok(
  transactionRollupIndex > transactionCoreIndex,
  'Transaction roll-up work must start after the route core is available.',
)
assert.ok(
  transactionEnrichmentIndex > transactionCoreIndex && transactionEnrichmentIndex < transactionInteractiveIndex,
  'Rich transaction metadata must be launched without being awaited before the route is marked interactive.',
)

assert.match(
  leadRepository,
  /async function fetchLeadRouteCoreRowById[\s\S]*?\.select\(LEGACY_LEAD_SELECT_FIELDS\)[\s\S]*?\.eq\('lead_id', leadUuid\)/,
  'Lead route readiness must use one stable, indexed core query.',
)
assert.match(
  leadRepository,
  /const leadResult = await fetchLeadRouteCoreRowById\(workspaceId, leadUuid\)/,
  'Lead route hydration must use the route-core query before compatibility hydration.',
)
assert.match(leadRepository, /routeCoreOnly: true/, 'Route-core lead snapshots must be tagged as incomplete.')
assert.match(
  leadRepository,
  /const seededLead = !seedSnapshot\?\.routeCoreOnly/,
  'A route-only seed must not suppress richer lead hydration.',
)
assert.match(
  buyerLoader,
  /isBuyerSnapshot\(seedSnapshot\) && seedSnapshot\?\.routeCoreOnly !== true/,
  'Buyer hydration must fetch the full lead when its seed is route-only.',
)
assert.match(
  leadRepository,
  /let preferredLeadSelectFields = ''/,
  'Lead compatibility queries must remember the supported schema projection.',
)

console.log('Phase 4 transaction and lead-detail performance checks passed.')
