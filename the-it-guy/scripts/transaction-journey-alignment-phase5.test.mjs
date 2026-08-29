import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('developer unit workspace consumes the canonical transaction journey snapshot', async () => {
  const source = await read('src/pages/UnitDetail.jsx')

  assert.match(source, /transactionRollup\?\.transactionJourneySnapshot[\s\S]*?buildTransactionJourneyPresentation/)
  assert.match(source, /<TransactionJourneyTracker[\s\S]*?audience="developer-agent"/)
  assert.match(source, /<TransactionJourneyTracker[\s\S]*?audience="developer"/)
})

test('professional overview workspaces receive the same canonical presentation model', async () => {
  const source = await read('src/pages/AttorneyTransactionDetail.jsx')

  assert.match(source, /function AttorneyMatterCommandCenter\(\{[\s\S]*?journeyModel = null/)
  assert.match(source, /audience="attorney"/)
  assert.match(source, /function BondConsultantOverviewWorkspace\(\{[\s\S]*?journeyModel = null/)
  assert.match(source, /audience="bond-originator"/)
  assert.match(source, /<BondConsultantOverviewWorkspace[\s\S]*?journeyModel=\{agentOverviewJourneyModel\}/)
  assert.match(source, /<AttorneyMatterCommandCenter[\s\S]*?journeyModel=\{agentOverviewJourneyModel\}/)
})

test('bond specialist application tracker remains available beneath the shared macro journey', async () => {
  const source = await read('src/pages/AttorneyTransactionDetail.jsx')

  assert.match(source, /Application journey/)
  assert.match(source, /<BondOriginatorAgentProgressView/)
})

test('shared tracker has a stable six-milestone loading shell', async () => {
  const source = await read('src/components/transaction/TransactionJourneyTracker.jsx')

  assert.match(source, /loading = false/)
  assert.match(source, /data-journey-source="loading"/)
  assert.match(source, /Array\.from\(\{ length: 6 \}/)
  assert.match(source, /aria-busy="true"/)
})
