import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const clientPortalSource = await readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const demoPortalSource = await readFile(new URL('../src/pages/ProspectBuyerDemo.jsx', import.meta.url), 'utf8')
const sharedOverviewSource = await readFile(new URL('../src/components/client-portal/BuyerPortalOverview.jsx', import.meta.url), 'utf8')

test('demo and production render the canonical overview shell and hero', () => {
  assert.match(clientPortalSource, /<BuyerPortalOverviewShell/)
  assert.match(clientPortalSource, /<SharedBuyerPortalOverviewHero/)
  assert.match(demoPortalSource, /<BuyerPortalOverviewShell/)
  assert.match(demoPortalSource, /<BuyerPortalOverviewHero/)
  assert.doesNotMatch(clientPortalSource, /function BuyerOverviewHero/)
  assert.doesNotMatch(demoPortalSource, /function OverviewSection/)
})

test('the shared overview owns the canonical region ordering', () => {
  const heroIndex = sharedOverviewSource.indexOf('data-buyer-overview-region="hero"')
  const progressIndex = sharedOverviewSource.indexOf('data-buyer-overview-region="progress"')
  const activityIndex = sharedOverviewSource.indexOf('data-buyer-overview-region="activity-documents"')
  const insightsIndex = sharedOverviewSource.indexOf('data-buyer-overview-region="insights"')
  const supportIndex = sharedOverviewSource.indexOf('data-buyer-overview-region="support"')

  assert.ok(heroIndex >= 0)
  assert.ok(heroIndex < progressIndex)
  assert.ok(progressIndex < activityIndex)
  assert.ok(activityIndex < insightsIndex)
  assert.ok(insightsIndex < supportIndex)
})

test('production keeps live actions and data outside the presentation component', () => {
  assert.match(clientPortalSource, /getClientPortalWorkspaceData/)
  assert.match(clientPortalSource, /SellerPortalAction action=\{primaryAction\}/)
  assert.match(clientPortalSource, /onCommentSubmit=\{onCommentSubmit\}/)
  assert.match(clientPortalSource, /<BuyerDocumentSummary[\s\S]*?model=\{documentModel\}/)
  assert.match(clientPortalSource, /theme=\{buyerPortalTheme\}/)
  assert.doesNotMatch(sharedOverviewSource, /getClientPortalWorkspaceData|uploadClientPortalDocument|submitClientPortalComment/)
})

test('demo fixtures adapt to the same overview without entering production services', () => {
  assert.match(demoPortalSource, /function DemoBuyerOverview/)
  assert.match(demoPortalSource, /propertyName=\{config\.samplePropertyAddress\}/)
  assert.match(demoPortalSource, /progress=\{\(<DemoBuyerJourney/)
  assert.doesNotMatch(sharedOverviewSource, /DEMO_JOURNEY_STAGES|DEMO_TEAM_UPDATES/)
})
