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

assert.ok(
  agencySource.includes('const captureRouteLeadWorkspaceScroll = useCallback'),
  'route lead workspace should capture scroll before background record merges',
)

assert.ok(
  agencySource.includes('const restoreRouteLeadWorkspaceScroll = useCallback'),
  'route lead workspace should restore scroll after background record merges',
)

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
