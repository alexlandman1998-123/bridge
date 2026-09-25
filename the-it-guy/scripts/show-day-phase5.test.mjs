import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
const leadListSource = await readFile(new URL('../src/pages/agency/LeadListPage.jsx', import.meta.url), 'utf8')
const captureSource = await readFile(new URL('../src/services/showDayLeadCaptureService.js', import.meta.url), 'utf8')
const packageSource = await readFile(new URL('../package.json', import.meta.url), 'utf8')

assert.ok(!leadListSource.includes('Show Day Intake'), 'Buyer Leads should not render the retired Show Day Intake control.')
assert.ok(!leadListSource.includes('ShowDayIntakeModal'), 'Buyer Leads should not bundle the retired QR and visitor-book intake modal.')
assert.ok(!leadListSource.includes('show-day-follow-up-queue'), 'Buyer Leads should not render a separate Show Day Follow-Up Queue.')
assert.ok(!leadListSource.includes('Open Show Day Queue'), 'Buyer Leads should not offer a separate Show Day Queue.')
assert.ok(!pageSource.includes('showDaySummary='), 'The pipeline should not feed a separate Show Day summary into Buyer Leads.')
assert.ok(!pageSource.includes('onOpenShowDayQueue='), 'The pipeline should not wire a separate Show Day Queue into Buyer Leads.')
assert.match(captureSource, /leadCategory: 'buyer'/, 'Show Day captures should enter the Buyer Lead table.')
assert.match(captureSource, /leadSource: SHOW_DAY_SOURCE/, 'Show Day captures should retain their source for filtering and attribution.')
assert.match(captureSource, /createOrUpdateLeadFromEnquiry/, 'Show Day captures should create or update the Buyer Lead directly.')

assert.match(
  packageSource,
  /"test:show-day-phase5": "node scripts\/show-day-phase5\.test\.mjs"/,
  'package.json should expose the Phase 5 show-day workflow test.',
)

console.log('show-day buyer-lead integration checks passed')
