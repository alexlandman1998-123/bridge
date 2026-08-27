import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('production derives buyer presentation from live workflow output', async () => {
  const source = await read('src/pages/ClientPortal.jsx')

  assert.match(source, /buildBuyerJourneyPresentationModel\(\{[\s\S]*?steps: clientJourneySteps,[\s\S]*?currentStepId,[\s\S]*?source: 'production'/)
  assert.match(source, /journeyModel=\{buyerJourneyPresentationModel\}/)
  assert.match(source, /function BuyerProgressJourney[\s\S]*?<BuyerPortalJourney/)
  assert.doesNotMatch(source, /function BuyerProgressJourney[\s\S]{0,800}<PortalProgressJourney/)
})
test('demo overview and progress use the same canonical fixture model', async () => {
  const source = await read('src/pages/ProspectBuyerDemo.jsx')

  assert.match(source, /DEMO_BUYER_JOURNEY_MODEL = buildBuyerJourneyPresentationModel/)
  assert.match(source, /progress=\{\(<DemoBuyerJourney brand=\{brand\} token=\{token\}/)
  assert.match(source, /activeSection === 'progress' \? <DemoBuyerJourney brand=\{brand\} token=\{token\} detailed/)
  assert.match(source, /model=\{DEMO_BUYER_JOURNEY_MODEL\}/)
  assert.doesNotMatch(source, /function PurchaseJourneySection/)
})

test('shared model and renderer remain presentation-only boundaries', async () => {
  const [model, renderer] = await Promise.all([
    read('src/core/clientPortal/buyerJourneyPresentationModel.js'),
    read('src/components/client-portal/BuyerPortalJourney.jsx'),
  ])

  assert.doesNotMatch(model, /services\/|supabase|fetch\(|localStorage|sessionStorage/)
  assert.doesNotMatch(renderer, /services\/|supabase|buildClientJourney|DEMO_JOURNEY_STAGES/)
  assert.match(renderer, /data-buyer-journey="shared"/)
  assert.match(renderer, /data-journey-status=\{step\.status\}/)
})
