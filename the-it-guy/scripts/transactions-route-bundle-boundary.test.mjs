import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const units = await readFile('src/pages/Units.jsx', 'utf8')
const app = await readFile('src/App.jsx', 'utf8')
const sidebar = await readFile('src/components/Sidebar.jsx', 'utf8')
const dataApi = await readFile('src/lib/transactionsListApi.js', 'utf8')
const routeLoader = await readFile('src/routes/transactionsRouteLoader.js', 'utf8')
const routeShell = await readFile('src/components/transactions/TransactionsRouteShell.jsx', 'utf8')

assert.doesNotMatch(units, /from ['"]\.\.\/lib\/api['"]/)
assert.match(units, /from ['"]\.\.\/lib\/transactionsListApi['"]/)
for (const component of [
  'AgentTransactionsTable',
  'AttorneyTransfersTable',
  'BondApplicationsTable',
  'UnitCardsView',
  'UnitsTable',
]) {
  assert.match(units, new RegExp(`const ${component} = lazy\\(`))
}
assert.match(units, /<Suspense fallback=\{<LoadingSkeleton/)
assert.match(units, /return <TransactionsRouteShell \/>/)

for (const query of [
  'fetchTransactionsByParticipantSummary',
  'fetchTransactionsListSummary',
  'fetchUnitsDataSummary',
]) {
  assert.match(dataApi, new RegExp(`export(?: async)? function ${query}\\(`))
}
assert.match(dataApi, /from ['"]\.\/supabaseClient['"]/)
assert.match(dataApi, /buyer:buyers\(id, name, phone, email\)/)
assert.match(dataApi, /transactionIds = await resolveAccessibleTransactionIds/)
assert.match(dataApi, /Mutations and detail prefetches are loaded only after an explicit user action/)
assert.match(routeLoader, /loadTransactionsRouteModule\(\)/)
assert.match(routeLoader, /preloadTransactionsListApi/)
assert.match(routeLoader, /Promise\.all\(\[routePromise, dataPromise\]\)/)

assert.match(app, /<Suspense fallback=\{<TransactionsRouteShell \/>\}>/)
assert.match(routeShell, /Loading transactions/)
assert.match(routeShell, />Transactions</)

assert.match(sidebar, /role === 'agent' && item\.key === 'transactions'/)
assert.match(sidebar, /organisationId: activeOrganisationId === 'all' \? '' : activeOrganisationId/)
assert.match(sidebar, /onMouseEnter=\{preloadTransactions\}/)
assert.match(sidebar, /onFocus=\{preloadTransactions\}/)

console.log('Transactions route bundle boundary checks passed.')
