import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pageSource = readFileSync(new URL('../src/pages/AttorneyDashboardPage.jsx', import.meta.url), 'utf8')
const serviceSource = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')

const requiredPageCopy = [
  'Conveyancing Matter Control Centre',
  'Good morning',
  'You have',
  'Active Matters',
  'Awaiting Client',
  'Registrations',
  'Lodgements',
  'Document Requests',
  'Revenue Pipeline',
  'Needs Attention',
  'Active Matters by Type',
  'Transfer Matters',
  'Bond Matters',
  'Cancellation Matters',
  'Partner Analytics',
  'Conveyancing Performance',
  'Matter Health',
  'No active transfer matters yet.',
  'Partner analytics appears once matters are linked to referring partners.',
  'Performance appears once completed registered matters are available.',
]

for (const expected of requiredPageCopy) {
  assert.ok(pageSource.includes(expected), `Attorney dashboard should render "${expected}".`)
}

const removedPageCopy = [
  'Create Matter',
  'Request Document',
  'Schedule Appointment',
  "Today's Calendar",
  'Matter Pipelines',
  'Recent Activity',
]

for (const removed of removedPageCopy) {
  assert.ok(!pageSource.includes(removed), `Attorney dashboard should not render the old "${removed}" module.`)
}

const requiredServiceFields = [
  'originating_partner_organisation_id',
  'referral_source_organisation_id',
  'buildAttentionMetrics',
  'buildPartnerAnalytics',
  'buildConveyancingPerformance',
  'buildMatterHealth',
  'attentionMetrics',
  'partnerAnalytics',
  'conveyancingPerformance',
  'matterHealth',
  'revenuePipelineValue',
  'documentRequestsOutstanding',
]

for (const expected of requiredServiceFields) {
  assert.ok(serviceSource.includes(expected), `Attorney dashboard service should expose "${expected}".`)
}

console.log('attorney dashboard control centre contract ok')
