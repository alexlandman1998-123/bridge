import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import {
  BUYER_LEADS_PERFORMANCE_BUDGETS_MS,
  BUYER_LEADS_PERFORMANCE_METRICS,
} from '../src/services/observability/buyerLeadsPerformanceBaseline.js'
import { BUYER_LEADS_RELEASE_GATE_LIMITS } from '../src/services/observability/buyerLeadsReleaseGate.js'

const root = resolve(import.meta.dirname, '..')
const [pageSource, panelSource, packageSource] = await Promise.all([
  readFile(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8'),
  readFile(resolve(root, 'src/pages/agency/BuyerJourneyOverviewPanel.jsx'), 'utf8'),
  readFile(resolve(root, 'package.json'), 'utf8'),
])

assert.match(panelSource, /export default memo\(BuyerJourneyOverviewPanel\)/, 'Buyer Journey must be protected by a memoized render boundary')
assert.match(panelSource, /data-render-boundary="buyer-journey"/, 'the render boundary must remain inspectable')
assert.match(pageSource, /import BuyerJourneyOverviewPanel from '\.\/BuyerJourneyOverviewPanel'/, 'the workspace must use the isolated Journey presentation')
assert.match(pageSource, /const handleBuyerJourneyOverviewStageSelect = useCallback\(/, 'Journey selection must use a stable callback')
assert.match(pageSource, /<BuyerJourneyOverviewPanel[\s\S]*?onStageSelect=\{handleBuyerJourneyOverviewStageSelect\}/, 'the stable callback must cross the memo boundary')
assert.doesNotMatch(pageSource, /<section[^>]+data-testid="buyer-journey-overview"/, 'the Journey presentation must not remain inline in the monolithic workspace')

assert.equal(BUYER_LEADS_PERFORMANCE_BUDGETS_MS[BUYER_LEADS_PERFORMANCE_METRICS.coreLeadReady], 1500)
assert.equal(BUYER_LEADS_PERFORMANCE_BUDGETS_MS[BUYER_LEADS_PERFORMANCE_METRICS.overviewFirstRendered], 2500)
assert.equal(BUYER_LEADS_PERFORMANCE_BUDGETS_MS[BUYER_LEADS_PERFORMANCE_METRICS.journeyFirstRendered], 2500)
assert.equal(BUYER_LEADS_PERFORMANCE_BUDGETS_MS[BUYER_LEADS_PERFORMANCE_METRICS.journeyEnrichmentComplete], 4000)
assert.equal(BUYER_LEADS_PERFORMANCE_BUDGETS_MS[BUYER_LEADS_PERFORMANCE_METRICS.assignmentMenuOpened], 100)
assert.equal(BUYER_LEADS_RELEASE_GATE_LIMITS.workspaceReadyMs, 2500)
assert.equal(BUYER_LEADS_RELEASE_GATE_LIMITS.duplicateSupabaseRequestCount, 0)
assert.equal(BUYER_LEADS_RELEASE_GATE_LIMITS.inactiveSpecialistRequestCount, 0)

const panelBuild = await build({
  entryPoints: [resolve(root, 'src/pages/agency/BuyerJourneyOverviewPanel.jsx')],
  bundle: true,
  write: false,
  minify: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'lucide-react'],
})
const panelAsset = panelBuild.outputFiles[0]?.contents
assert.ok(panelAsset, 'the isolated Buyer Journey panel must build independently')
assert.ok(panelAsset.byteLength <= 20_000, `Buyer Journey panel exceeded its 20 KB raw budget (${panelAsset.byteLength} bytes)`)
assert.ok(gzipSync(panelAsset).byteLength <= 7_000, 'Buyer Journey panel exceeded its 7 KB gzip budget')

const packageJson = JSON.parse(packageSource)
assert.ok(
  packageJson.scripts['verify:buyer-lead-overview']?.startsWith('npm run test:buyer-lead-overview-phase0 && npm run test:buyer-lead-overview-phase1 && npm run test:buyer-lead-overview-phase2 && npm run test:buyer-lead-overview-phase3 && npm run test:buyer-lead-overview-phase4 && npm run test:buyer-lead-overview-phase5'),
  'Phase 0–5 must remain in the release verification command',
)

console.log('buyer lead overview Phase 5 render containment and release budgets passed')
