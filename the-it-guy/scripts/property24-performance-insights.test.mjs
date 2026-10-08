import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
const [service, dashboard, css] = await Promise.all([
  readFile(new URL('../src/services/marketingOverviewService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/marketing/MarketingDashboard.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/pages/MarketingDashboard.css', import.meta.url), 'utf8'),
])
assert.doesNotMatch(service, /deriveProperty24PerformanceInsights|resolveProperty24StatisticsFreshness/)
assert.doesNotMatch(dashboard, /Property24PerformanceInsights|Property24 insights/)
assert.doesNotMatch(css, /mo-property24|mo-insight/)
assert.equal(existsSync(new URL('../src/components/marketing/Property24PerformanceInsights.jsx', import.meta.url)), false)
console.log('Legacy Property24 rates, trends, insights and their styles are retired.')
