import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('production derives buyer presentation from the canonical snapshot with a live fallback', async () => {
  const source = await read('src/pages/ClientPortal.jsx')

  assert.match(source, /legacyBuyerJourneyPresentationModel = buildBuyerJourneyPresentationModel\(\{[\s\S]*?steps: clientJourneySteps,[\s\S]*?currentStepId,[\s\S]*?source: 'production'/)
  assert.match(source, /buildTransactionJourneyPresentation\(\{[\s\S]*?snapshot: workspaceData\?\.transactionJourneySnapshot[\s\S]*?fallbackModel: legacyBuyerJourneyPresentationModel/)
  assert.match(source, /journeyModel=\{buyerJourneyPresentationModel\}/)
  assert.match(source, /function BuyerProgressJourney[\s\S]*?<BuyerPortalJourney/)
  assert.doesNotMatch(source, /function BuyerProgressJourney[\s\S]{0,800}<PortalProgressJourney/)
})
test('demo overview uses the canonical fixture model and progress restores the conveyancing guide', async () => {
  const source = await read('src/pages/ProspectBuyerDemo.jsx')

  assert.match(source, /DEMO_BUYER_JOURNEY_MODEL = buildBuyerJourneyPresentationModel/)
  assert.match(source, /progress=\{\(<DemoBuyerJourney brand=\{brand\} token=\{token\}/)
  assert.match(source, /activeSection === 'progress' \? <ConveyancingJourneySection brand=\{brand\} \/>/)
  assert.match(source, /The conveyancing process/)
  assert.match(source, /stage\.estimatedDuration \|\| 'Timeline to be confirmed'/)
  assert.match(source, /model=\{DEMO_BUYER_JOURNEY_MODEL\}/)
  assert.doesNotMatch(source, /function PurchaseJourneySection/)
})

test('shared model and renderer remain presentation-only boundaries', async () => {
  const [model, buyerRenderer, sharedRenderer] = await Promise.all([
    read('src/core/clientPortal/buyerJourneyPresentationModel.js'),
    read('src/components/client-portal/BuyerPortalJourney.jsx'),
    read('src/components/transaction/TransactionJourneyTracker.jsx'),
  ])

  assert.doesNotMatch(model, /services\/|supabase|fetch\(|localStorage|sessionStorage/)
  assert.doesNotMatch(buyerRenderer, /services\/|supabase|buildClientJourney|DEMO_JOURNEY_STAGES/)
  assert.doesNotMatch(sharedRenderer, /services\/|supabase|buildClientJourney|DEMO_JOURNEY_STAGES/)
  assert.match(buyerRenderer, /data-buyer-journey="shared"/)
  assert.match(sharedRenderer, /data-journey-status=\{step\.status\}/)
})
