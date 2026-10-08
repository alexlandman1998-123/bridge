import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
const [marketing, service] = await Promise.all([
  readFile(new URL('../src/components/marketing/MarketingDashboard.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../src/services/marketingOverviewService.js', import.meta.url), 'utf8'),
])
assert.equal(existsSync(new URL('../src/services/property24AnalyticsExport.js', import.meta.url)), false)
assert.doesNotMatch(marketing + service, /downloadProperty24AnalyticsCsv|buildProperty24AnalyticsCsv|property24AnalyticsExport|Export CSV/)
console.log('The legacy Property24 analytics CSV path is retired.')
