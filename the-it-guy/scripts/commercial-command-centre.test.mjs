import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {
  COMMAND_CENTRE_SNAPSHOT_VIEWS,
  buildCommercialCommandCentreSnapshot,
} from '../src/modules/commercial/commercialCommandCentre.js'

const dashboardSource = await fs.readFile(new URL('../src/modules/commercial/components/CommercialExecutiveCommandCenter.jsx', import.meta.url), 'utf8')
const dashboardApiSource = await fs.readFile(new URL('../src/modules/commercial/services/commercialDashboardApi.js', import.meta.url), 'utf8')
const navigationSource = await fs.readFile(new URL('../src/modules/commercial/commercialNavigation.js', import.meta.url), 'utf8')
const appSource = await fs.readFile(new URL('../src/App.jsx', import.meta.url), 'utf8')

const oldDate = new Date(Date.now() - 140 * 86400000).toISOString()
const staleDealDate = new Date(Date.now() - 20 * 86400000).toISOString()
const future30 = new Date(Date.now() + 20 * 86400000).toISOString()
const future90 = new Date(Date.now() + 70 * 86400000).toISOString()

const snapshot = buildCommercialCommandCentreSnapshot({
  prospects: [
    { id: 'p1', propertyCategory: 'industrial', source: 'Referrals', broker_id: 'b1', created_at: oldDate },
    { id: 'p2', propertyCategory: 'retail', source: 'Website', broker_id: 'b2', dealType: 'sale' },
  ],
  companies: [
    { id: 'seller-1', prospectRole: 'seller', propertyCategory: 'industrial', source: 'Referrals', broker_id: 'b1', created_at: oldDate },
    { id: 'buyer-1', prospectRole: 'buyer', propertyCategory: 'industrial', source: 'Referrals', broker_id: 'b1' },
  ],
  landlords: [{ id: 'll1', propertyCategory: 'industrial', broker_id: 'b1' }],
  tenants: [{ id: 'tn1', propertyCategory: 'industrial', broker_id: 'b2' }],
  requirements: [
    { id: 'req-1', propertyCategory: 'industrial', broker_id: 'b1', budget_max: 160, created_at: oldDate },
    { id: 'buyer-req-1', prospectRole: 'buyer', propertyCategory: 'industrial', broker_id: 'b1', budget_max: 12000000 },
  ],
  vacancies: [
    { id: 'vac-1', propertyCategory: 'industrial', broker_id: 'b1', asking_rental: 120, available_area_m2: 1000, created_at: oldDate },
  ],
  listings: [
    { id: 'list-1', listing_type: 'sale', propertyCategory: 'industrial', broker_id: 'b1', pricing: 12000000, status: 'published', created_at: oldDate, expected_close_date: future90 },
  ],
  deals: [
    { id: 'deal-lease', dealType: 'lease', propertyCategory: 'industrial', broker_id: 'b1', stage: 'negotiation', deal_value: 850000, updated_at: staleDealDate, expected_close_date: future30 },
    { id: 'deal-sale', dealType: 'sale', propertyCategory: 'industrial', broker_id: 'b1', stage: 'offer', deal_value: 12000000, updated_at: staleDealDate, expected_close_date: future90 },
  ],
  leases: [{ id: 'lease-1', status: 'signed', updated_at: new Date().toISOString() }],
  viewings: [{ id: 'view-1', broker_id: 'b1', propertyCategory: 'industrial', status: 'completed', viewing_date: new Date().toISOString() }],
  activity: [
    { id: 'act-1', broker_id: 'b1', activity_type: 'call', created_at: new Date().toISOString() },
    { id: 'act-2', broker_id: 'b1', activity_type: 'meeting', created_at: new Date().toISOString() },
  ],
  commissions: [{ id: 'comm-1', broker_id: 'b1', commission_amount: 500000 }],
  brokers: [{ id: 'b1', firstName: 'John', lastName: 'Smith' }, { id: 'b2', fullName: 'Sarah Broker' }],
}, { scopeLevel: 'organisation', canManageBrokerage: true })

assert.deepEqual(COMMAND_CENTRE_SNAPSHOT_VIEWS, [
  'commercial_pipeline_snapshot',
  'commercial_revenue_snapshot',
  'commercial_broker_snapshot',
  'commercial_asset_snapshot',
  'commercial_area_snapshot',
])
assert.equal(snapshot.permissions.can_view_executive, true)
assert.ok(snapshot.executiveSummary.leasing.active_landlords >= 1)
assert.ok(snapshot.executiveSummary.sales.active_listings >= 1)
assert.ok(snapshot.revenueForecast.leasing.potential_commission_pipeline > 0)
assert.ok(snapshot.revenueForecast.sales.potential_commission_pipeline > 0)
assert.ok(snapshot.revenueForecast.leasing.windows.some((row) => row.window === '30 Days'))
assert.ok(snapshot.revenueForecast.sales.windows.some((row) => row.window === '180 Days'))
assert.ok(snapshot.pipelineHealth.leasingFunnel.some((row) => row.label === 'Requirements' && row.conversion_percentage >= 0))
assert.ok(snapshot.pipelineHealth.salesFunnel.some((row) => row.label === 'Offers'))
assert.ok(snapshot.demandSupply.some((row) => row.label === 'Industrial' && row.leasing.result))
assert.ok(snapshot.assetClassDashboard.some((row) => row.label === 'Industrial' && row.revenue > 0))
assert.ok(snapshot.brokerPerformance.leaderboard.some((row) => row.broker === 'John Smith' && row.activity_score > 0))
assert.ok(snapshot.dealVelocity.leasing.some((row) => row.label === 'Lead -> Requirement'))
assert.ok(snapshot.sourcePerformance.some((row) => row.label === 'Referrals'))
assert.ok(snapshot.areaIntelligence.length > 0)
assert.equal(snapshot.relationshipIntelligence.landlords.label, 'Landlord Intelligence')
assert.equal(snapshot.relationshipIntelligence.tenants.label, 'Tenant Intelligence')
assert.equal(snapshot.relationshipIntelligence.sellers.label, 'Seller Intelligence')
assert.equal(snapshot.relationshipIntelligence.buyers.label, 'Buyer Intelligence')
assert.ok(snapshot.riskEngine.stale_leads > 0)
assert.ok(snapshot.riskEngine.stale_vacancies > 0)
assert.ok(snapshot.riskEngine.stale_listings > 0)
assert.ok(snapshot.riskEngine.stalled_deals > 0)
assert.ok(snapshot.recommendations.length > 0)
assert.ok(snapshot.executiveMode.forecast_revenue > 0)
assert.ok(snapshot.mobileDashboard.todays_activity > 0)
assert.ok(snapshot.snapshots.commercial_pipeline_snapshot)
assert.ok(snapshot.snapshots.commercial_revenue_snapshot)
assert.ok(snapshot.snapshots.commercial_broker_snapshot)
assert.ok(snapshot.snapshots.commercial_asset_snapshot)
assert.ok(snapshot.snapshots.commercial_area_snapshot)

const brokerSnapshot = buildCommercialCommandCentreSnapshot({ brokers: [{ id: 'b1', fullName: 'Broker Only' }] }, { scopeLevel: 'broker' })
assert.equal(brokerSnapshot.permissions.broker_visibility, 'Own Pipeline')
assert.equal(brokerSnapshot.permissions.can_view_executive, false)
assert.equal(brokerSnapshot.executiveMode, null)

for (const marker of [
  'buildCommercialCommandCentreSnapshot',
  'commandCentre',
]) {
  assert.match(dashboardApiSource, new RegExp(marker), `dashboard API should include ${marker}`)
}

for (const marker of [
  'CommercialCommandCentreLayer',
  'Commercial Command Centre',
  'Executive Summary',
  'Revenue Forecast',
  'Demand vs Supply Engine',
  'Asset Class Intelligence Dashboard',
  'Broker Performance Centre',
  'Deal Velocity Dashboard',
  'Source Performance Dashboard',
  'Area Intelligence',
  'Landlord, Tenant, Buyer, Seller Intelligence',
  'Risk Engine',
  'Alerts & Recommendations',
  'Mobile Command Snapshot',
]) {
  assert.match(dashboardSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `dashboard should render ${marker}`)
}

for (const marker of [
  'COMMERCIAL_COMMAND_CENTRE_NAV_ITEM',
  'Command Centre',
  '/commercial/command-centre',
  'Calendar',
  '/commercial/calendar',
]) {
  assert.match(navigationSource, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `navigation should include ${marker}`)
}

assert.match(appSource, /path="command-centre"/, 'App should expose the commercial command centre route')

console.log('commercial command centre tests passed')
