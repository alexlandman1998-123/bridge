import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const listingsSource = await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const listingDetailSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const routePrefetchSource = await readFile(new URL('../src/lib/routePrefetch.js', import.meta.url), 'utf8')

test('listing intent preloads the detail bundle without starting a data query', () => {
  assert.match(listingsSource, /onPointerEnter=\{\(\) => prefetchListingWorkspace\(card\)\}/)
  assert.match(listingsSource, /onFocus=\{\(\) => prefetchListingWorkspace\(card\)\}/)
  assert.match(listingsSource, /prefetchRouteModule\(path, \{ role: 'agent' \}\)/)

  const helperStart = listingsSource.indexOf('function prefetchListingWorkspace')
  const helperEnd = listingsSource.indexOf('function openListingWorkspace', helperStart)
  const helperSource = listingsSource.slice(helperStart, helperEnd)
  assert.doesNotMatch(helperSource, /getPrivateListing|supabase|fetch\(/)
})

test('listing navigation hands the existing summary to the detail route', () => {
  assert.match(listingsSource, /listingShell: card\?\.listingRecord \|\| null/)
  assert.match(listingsSource, /fromListingsSummary: true/)
  assert.match(listingDetailSource, /const navigationListingShell = useMemo/)
  assert.match(listingDetailSource, /source: 'list_summary_handoff'/)
  assert.match(listingDetailSource, /setLoading\(!navigationListingShell\)/)
})

test('the handed-off shell is identity checked before it can render', () => {
  assert.match(listingDetailSource, /candidateIds\.includes\(listingId\) \? candidate : null/)
  assert.match(listingDetailSource, /getPrivateListingRecordId\(candidate\)/)
  assert.match(listingDetailSource, /getPrivateListingRemoteRecordId\(candidate\)/)
})

test('detail routes preload their real bundles instead of list-page bundles', () => {
  const detailListingRule = routePrefetchSource.indexOf("pathname.startsWith('/agent/listings/')")
  const listListingRule = routePrefetchSource.indexOf("pathname.startsWith('/listings')")
  assert.ok(detailListingRule >= 0 && detailListingRule < listListingRule)
  assert.match(routePrefetchSource, /pathname\.startsWith\('\/agent\/listings\/'\).*AgentListingDetail/)
  assert.match(routePrefetchSource, /pathname\.startsWith\('\/transactions\/'\).*AttorneyTransactionDetail/)
  assert.match(routePrefetchSource, /pathname\.startsWith\('\/units\/'\).*UnitDetail/)
  assert.match(routePrefetchSource, /pathname === '\/transactions'.*pathname === '\/units'.*pages\/Units/)
})

test('legal subroutes keep ownership of their dedicated workspace bundle', () => {
  const listingLegalRule = routePrefetchSource.indexOf("pathname.startsWith('/agent/listings/') && pathname.includes('/legal/')")
  const listingDetailRule = routePrefetchSource.indexOf("pathname.startsWith('/agent/listings/'))")
  const transactionLegalRule = routePrefetchSource.indexOf("pathname.startsWith('/transactions/') && pathname.includes('/legal/')")
  const transactionDetailRule = routePrefetchSource.indexOf("pathname.startsWith('/transactions/'))")

  assert.ok(listingLegalRule >= 0 && listingLegalRule < listingDetailRule)
  assert.ok(transactionLegalRule >= 0 && transactionLegalRule < transactionDetailRule)
  assert.ok((routePrefetchSource.match(/LegalDocumentWorkspacePage/g) || []).length >= 2)
})
