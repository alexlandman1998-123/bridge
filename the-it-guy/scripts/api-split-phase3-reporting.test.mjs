import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const server = await createServer({
  root: appRoot,
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const reporting = await server.ssrLoadModule('/src/domains/reporting/api.js')
  const legacy = await server.ssrLoadModule('/src/lib/api/dashboardApi.js')

  for (const name of [
    'fetchDashboardOverview',
    'fetchTransactionsByParticipantSummary',
    'fetchTransactionsListSummary',
  ]) {
    assert.equal(typeof reporting[name], 'function', `reporting domain must expose ${name}`)
    assert.equal(legacy[name], reporting[name], `legacy dashboard API must preserve ${name}`)
  }
  assert.equal(typeof reporting.enrichDashboardSummaryRows, 'function')

  console.log('API-split Phase 3 reporting compatibility tests passed.')
} finally {
  await server.close()
}
