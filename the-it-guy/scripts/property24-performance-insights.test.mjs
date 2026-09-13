import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [service, component] = await Promise.all([
  readFile(new URL('../src/services/marketingOverviewService.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/components/marketing/Property24PerformanceInsights.jsx', import.meta.url), 'utf8'),
])

assert.match(service, /export function deriveProperty24PerformanceInsights/)
assert.match(service, /key: 'stale'/)
assert.match(service, /key: 'no-contacts'/)
assert.match(service, /key: 'whatsapp-share'/)
assert.match(service, /property24Performance\.insights = deriveProperty24PerformanceInsights/)
assert.match(component, /Property24 insights/)
assert.match(component, /mo-insight is-/)
console.log('Property24 performance insights contract passed.')
