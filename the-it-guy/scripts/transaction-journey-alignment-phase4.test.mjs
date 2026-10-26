import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('seller sale progress consumes the canonical transaction snapshot', async () => {
  const source = await read('src/pages/ClientPortal.jsx')

  assert.match(source, /sellerTransactionJourneyModel = hasLinkedSellerTransaction[\s\S]*?buildTransactionJourneyPresentation/)
  assert.match(source, /snapshot: effectiveWorkspace === 'seller' \? workspaceData\?\.transactionJourneySnapshot/)
  assert.match(source, /fallbackSource: 'seller-legacy'/)
  assert.match(source, /sellerTransactionJourneyModel=\{sellerTransactionJourneyModel\}/)
  assert.match(source, /transactionJourney=\{sellerTransactionJourneyModel\}/)
})

test('listing progress remains distinct while sale progress uses the shared renderer', async () => {
  const source = await read('src/pages/ClientPortal.jsx')

  assert.match(source, /function SellerProgressJourney\([\s\S]*?activeWorkflowKey === 'sale' && transactionJourneyModel/)
  assert.match(source, /<TransactionJourneyTracker[\s\S]*?model=\{transactionJourneyModel\}[\s\S]*?audience="seller"/)
  assert.match(source, /Listing Progress/)
  assert.match(source, /Sale Progress/)
})

test('seller detail page replaces its local rail when the canonical model is available', async () => {
  const source = await read('src/components/client-portal/seller/TransactionStageWorkspace.jsx')

  assert.match(source, /<TransactionJourneyTracker[\s\S]*?model=\{journeyModel\}[\s\S]*?audience="seller"/)
  assert.match(source, /\{!journeyModel \? <article[\s\S]*?What’s next\?/)
  assert.match(source, /The same transaction milestones shared with your agent and transaction team/)
})

test('seller progress page uses canonical milestones and keeps unavailable progress unknown', async () => {
  const source = await read('src/components/client-portal/seller/SellerProgressPage.jsx')
  assert.match(source, /canonicalTransaction/)
  assert.match(source, /<TransactionJourneyTracker model=\{transactionJourney\}/)
  assert.match(source, /shared milestones are temporarily unavailable/)
  assert.match(source, /transferJourney\?\.status === 'ready'/)
})
