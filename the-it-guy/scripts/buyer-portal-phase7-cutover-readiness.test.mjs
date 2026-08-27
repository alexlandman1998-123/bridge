import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('demo and production expose the same fail-closed Phase 7 release marker', async () => {
  const [production, demo] = await Promise.all([
    read('src/pages/ClientPortal.jsx'),
    read('src/pages/ProspectBuyerDemo.jsx'),
  ])

  for (const source of [production, demo]) {
    assert.match(source, /buildBuyerPortalCutoverReadiness\(\{/)
    assert.match(source, /data-buyer-portal-release=/)
    assert.match(source, /data-buyer-portal-aligned=/)
    assert.match(source, /data-buyer-portal-source=/)
  }
  assert.match(production, /effectiveWorkspace === 'seller' \? undefined : buyerPortalCutoverReadiness\.phase/)
  assert.match(demo, /source: 'demo'/)
  assert.match(production, /source: 'production'/)
})

test('production cutover readiness is bound to live mutations, not demo fixtures', async () => {
  const source = await read('src/pages/ClientPortal.jsx')

  assert.match(source, /documentActions: typeof handleDocumentCentreUpload === 'function' && typeof handleOpenPortalDocument === 'function'/)
  assert.match(source, /financeActions: typeof handleBondApplicationSubmit === 'function' && typeof handleUploadMatterAccountProof === 'function'/)
  assert.match(source, /portalComments: typeof handleSubmitPortalComment === 'function'/)
  assert.match(source, /contactActions: buyerTeamPresentationModel\.contactableCount > 0/)
  assert.doesNotMatch(source, /FINANCE_APPLICATION|TRANSACTION_TEAM|DEMO_BUYER_JOURNEY_MODEL/)
})

test('all canonical buyer surfaces use shared presentation boundaries at cutover', async () => {
  const [production, demo] = await Promise.all([
    read('src/pages/ClientPortal.jsx'),
    read('src/pages/ProspectBuyerDemo.jsx'),
  ])

  for (const component of ['BuyerPortalDesktopSidebar', 'BuyerPortalOverviewShell', 'BuyerPortalJourney', 'BuyerDocumentWorkspace', 'BuyerFinanceWorkspace', 'BuyerTeamWorkspace']) {
    assert.match(production, new RegExp(component))
    assert.match(demo, new RegExp(component))
  }
  for (const legacyInvocation of ['<FinanceSummary', '<BankApplicationsSection', '<BankOffersSection', '<ApplicationDetailsSection', '<TeamContextSummary', '<TeamMemberCard', '<ContactRouteCard']) {
    assert.equal(demo.includes(legacyInvocation), false, `${legacyInvocation} must not be active at cutover`)
  }
})

test('cutover contract remains a pure presentation and release gate', async () => {
  const source = await read('src/core/clientPortal/buyerPortalCutoverReadiness.js')
  assert.doesNotMatch(source, /services\/|supabase|fetch\(|localStorage|sessionStorage|process\.env/)
  assert.match(source, /BUYER_PORTAL_CANONICAL_SURFACES/)
  assert.match(source, /releaseLabel: missing\.length === 0 \? 'aligned' : 'blocked'/)
})
