import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const [demoConfig, buyerPortal, clientPortal, resilienceStatus, styles, docs] = await Promise.all([
  readFile(new URL('src/lib/prospectDemoConfig.js', root), 'utf8'),
  readFile(new URL('src/pages/ProspectBuyerDemo.jsx', root), 'utf8'),
  readFile(new URL('src/pages/ClientPortal.jsx', root), 'utf8'),
  readFile(new URL('src/components/client-portal/PortalResilienceStatus.jsx', root), 'utf8'),
  readFile(new URL('src/App.css', root), 'utf8'),
  readFile(new URL('docs/client-portal-launch-phase4-performance-resilience.md', root), 'utf8'),
])

test('buyer demo renders useful content while remote branding hydrates', () => {
  assert.doesNotMatch(buyerPortal, /if \(loading \|\| loadedConfigToken !== token\) return <ProspectBuyerDemoLoading/)
  assert.match(buyerPortal, /<PortalResilienceStatus refreshing=\{loading\}/)
  assert.match(demoConfig, /PROSPECT_DEMO_CONFIG_WAIT_MS = 1200/)
})

test('prospect branding requests are cached and concurrent requests are deduplicated', () => {
  assert.match(demoConfig, /prospectDemoConfigCache = new Map\(\)/)
  assert.match(demoConfig, /prospectDemoConfigRequests = new Map\(\)/)
  assert.match(demoConfig, /getCachedProspectDemoConfig/)
  assert.match(demoConfig, /PROSPECT_DEMO_CONFIG_CACHE_TTL_MS = 5 \* 60 \* 1000/)
})

test('static client portal fixtures avoid a duplicate full workspace request', () => {
  assert.match(clientPortal, /if \(isDemoRoute && hasCoreData\) \{\s*markRouteMilestone\('interactive_ready'\)\s*return/)
})

test('portal recovery status is accessible and safe-area aware', () => {
  assert.match(resilienceStatus, /role="status"/)
  assert.match(resilienceStatus, /You’re offline/)
  assert.match(resilienceStatus, /addEventListener\('online'/)
  assert.match(styles, /env\(safe-area-inset-top\)/)
  assert.match(styles, /prefers-reduced-motion: reduce/)
})

test('above-fold property imagery is prioritised and secondary imagery is deferred', () => {
  assert.match(buyerPortal, /fetchPriority="high" decoding="async"/)
  assert.match(clientPortal, /sellerPropertyImageUrl[\s\S]{0,220}fetchPriority="high" decoding="async"/)
  assert.match(buyerPortal, /loading="lazy" decoding="async"/)
})

test('Phase 4 documentation binds implementation to measurable launch budgets', () => {
  assert.match(docs, /1,500 ms/)
  assert.match(docs, /2,500 ms/)
  assert.match(docs, /100 ms/)
  assert.match(docs, /360×800/)
  assert.match(docs, /offline/i)
})
