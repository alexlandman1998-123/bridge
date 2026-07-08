import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pageSource = readFileSync(new URL('../src/pages/AttorneyDashboardPage.jsx', import.meta.url), 'utf8')
const serviceSource = readFileSync(new URL('../src/services/attorneyDashboard.js', import.meta.url), 'utf8')

const requiredPageCopy = [
  'Good morning',
  'You have',
  'Active Matters',
  'Awaiting Client',
  'Registrations',
  'Lodgements',
  'Revenue Pipeline',
  'ActiveMatterStrip',
  'NeedsAttentionSection',
  'No active matters yet.',
  'Transfer Matters',
  'Bond Matters',
  'Cancellation Matters',
  'Partner Analytics',
  'Conveyancing Performance',
  'Matter Health',
  'No active transfer matters yet.',
  'AttorneyAnalyticsSection',
  'PartnerAnalyticsCard',
  'MatterHealthCard',
  'ConveyancingPerformanceCard',
  'PerformanceKPIs',
  'RegistrationForecastCard',
  'MatterDistributionCard',
  'Track which partners are bringing the most work.',
  'Overview of all active matters.',
  'Measure firm performance and forecast upcoming registrations.',
  'Partner analytics will appear once matters are linked to referring partners.',
  'Matter health will appear once work begins.',
  'Performance statistics will appear once the firm starts registering matters.',
  'Partner analytics updates automatically as matters are linked.',
  'Matter health is automatically calculated based on deadlines, activity and risks.',
]

for (const expected of requiredPageCopy) {
  assert.ok(pageSource.includes(expected), `Attorney dashboard should render "${expected}".`)
}

assert.ok(
  pageSource.indexOf('<ActiveMatterStrip lanes={lanes} />') < pageSource.indexOf('<NeedsAttentionSection metrics={dashboard.attentionMetrics || []} />'),
  'Attorney dashboard should render Active Matters before the needs-attention metrics strip.',
)
assert.ok(
  !pageSource.includes('<SectionHeading title="Needs Attention"'),
  'Attorney dashboard should not render the top Needs Attention heading above the metrics strip.',
)
assert.ok(
  !pageSource.includes("label: 'Document Requests'"),
  'Attorney dashboard header should not render Document Requests as a KPI card.',
)
assert.ok(
  !pageSource.includes('MiniTrend'),
  'Attorney dashboard KPI cards should not render decorative static trend lines.',
)
assert.ok(
  pageSource.includes('2xl:grid-cols-5'),
  'Attorney dashboard KPI cards should fill the header row as five columns on wide screens.',
)

const removedPageCopy = [
  'Conveyancing Matter Control Centre',
  'Search matters, clients, documents...',
  'Active Matters by Type',
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
  'getPartnerAnalytics',
  'getConveyancingPerformance',
  'calculateMatterHealth',
  'partnerType',
  'avatar',
  'pipelineValue',
  'matterCount',
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
