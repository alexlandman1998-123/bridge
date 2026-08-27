import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const agencySource = readFileSync(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.ok(
  agencySource.includes('const hasCompletedContextLoadRef = useRef(false)'),
  'seller lead workspace should track whether the initial blocking context load has completed',
)

assert.match(
  agencySource,
  /const shouldUseBlockingLoader = !hasCompletedContextLoadRef\.current[\s\S]*?if \(shouldUseBlockingLoader\) setLoading\(true\)/,
  'route-level workspace refreshes should not trigger the full-page loading skeleton after initial load',
)

assert.ok(
  agencySource.includes('function buildPrivateListingActivitySignature(rows = [])'),
  'seller listing activity fetches should have a stable comparison signature',
)

assert.match(
  agencySource,
  /const selectedLeadPrivateListingActivityKey = \[[\s\S]*?selectedLeadIdentityKey,[\s\S]*?selectedLeadLinkedListingId,[\s\S]*?\]\.filter\(Boolean\)\.join\(':'\)/,
  'seller listing activity hydration should be keyed by stable lead/listing identity, not full record objects',
)

assert.match(
  agencySource,
  /setSelectedLeadPrivateListingActivities\(\(previous\) =>[\s\S]*?buildPrivateListingActivitySignature\(previous\) === nextSignature \? previous : nextRows/,
  'seller listing activity hydration should no-op when fetched rows have not changed',
)

assert.doesNotMatch(
  agencySource,
  /captureRouteLeadWorkspaceScroll|restoreRouteLeadWorkspaceScroll|routeLeadScrollSnapshotRef/,
  'background record merges must not replay stale scroll coordinates after the user has moved',
)

assert.match(
  agencySource,
  /data-testid="lead-workspace" style=\{\{ overflowAnchor: 'none' \}\}/,
  'the lead workspace should opt out of browser scroll anchoring while async sections hydrate',
)

assert.doesNotMatch(
  agencySource,
  /data-testid="seller-journey-rail"\]\)\?\.scrollIntoView|data-seller-document-key="signed_mandate"\]\)\?\.scrollIntoView/,
  'seller journey actions should switch context without moving the page behind the user',
)

for (const pattern of [
  /setMessage\('Seller onboarding sent\.'\)[\s\S]{0,180}?scheduleRecordsReload\(organisationId, 850\)/,
  /setMessage\(`\$\{documentLabel\} uploaded\.`\)[\s\S]{0,120}?scheduleRecordsReload\(organisationId, 850\)/,
  /setMessage\('Listing activated\.'\)[\s\S]{0,120}?scheduleRecordsReload\(organisationId, 850\)/,
]) {
  assert.match(agencySource, pattern, 'seller actions should reconcile in the background after updating local state')
}

assert.match(
  agencySource,
  /const hasWarmRouteSnapshot = Boolean\([\s\S]*?routeLeadRecordRef\.current[\s\S]*?cachedRouteSnapshot\?\.leads/,
  'route lead hydration should warm-start from an existing record or session snapshot',
)

assert.match(
  agencySource,
  /setRouteLeadHydrationStatus\(hasWarmRouteSnapshot \? 'ready' : 'loading'\)/,
  'route lead hydration should avoid returning to loading when warm data is already available',
)

console.log('seller lead workspace hydration stability contract passed')
