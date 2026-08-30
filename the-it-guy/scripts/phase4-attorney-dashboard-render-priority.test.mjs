import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/AttorneyDashboardPage.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /const \[analyticsReady, setAnalyticsReady\] = useState\(false\)/,
  'Below-the-fold analytics should not be ready during the initial dashboard render.',
)
assert.match(
  source,
  /window\.requestIdleCallback\(revealAnalytics, \{ timeout: 1800 \}\)/,
  'Analytics should wait for an idle browser window before rendering.',
)
assert.match(
  source,
  /analyticsReady \? \([\s\S]*?<AttorneyAnalyticsSection[\s\S]*?\) : <AttorneyAnalyticsSkeleton \/>/,
  'The dashboard must render the analytics section only after it is ready.',
)
assert.match(
  source,
  /data-testid="attorney-dashboard-analytics-skeleton"/,
  'The deferred section should preserve visible loading continuity.',
)

console.log('phase 4 attorney dashboard render-priority contract ok')
