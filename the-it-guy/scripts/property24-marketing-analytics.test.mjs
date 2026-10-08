import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const [service, dashboard] = await Promise.all([
  readFile(new URL('../src/services/marketingOverviewService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/marketing/MarketingDashboard.jsx', import.meta.url), 'utf8'),
])
assert.doesNotMatch(service, /property24_marketing_analytics|normalizeProperty24MarketingAnalytics|property24Performance/)
assert.match(service, /const importedProperty24Leads = leadSources\.find/)
assert.match(service, /key: 'property24'.*volume: null.*leads: importedProperty24Leads/)
assert.doesNotMatch(dashboard, /Property24 portal performance|Property24Metric|contact rate/)
assert.match(dashboard, /Channel activity and CRM leads/)
assert.match(dashboard, /channel\.note \? <small className="mo-channel-note">/)
console.log('Marketing uses CRM Property24 lead counts; legacy portal aggregates are retired.')
