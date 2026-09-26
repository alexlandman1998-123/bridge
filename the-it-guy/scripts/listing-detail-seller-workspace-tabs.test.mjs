import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

const tabsMatch = source.match(/const SELLER_WORKSPACE_TABS = \[([\s\S]*?)\]/)
assert.ok(tabsMatch, 'Seller workspace tab config should exist.')

const labels = [...tabsMatch[1].matchAll(/label: '([^']+)'/g)].map((match) => match[1])
const keys = [...tabsMatch[1].matchAll(/key: '([^']+)'/g)].map((match) => match[1])

assert.deepEqual(labels, ['Overview', 'Leads', 'Seller', 'Marketing', 'Documents', 'Commission', 'Activity'])
assert.deepEqual(keys, ['overview', 'leads', 'seller', 'marketing', 'documents', 'commission', 'activity'])
assert.equal(tabsMatch[1].includes("label: 'Offers'"), false)
assert.equal(tabsMatch[1].includes("label: 'Listing'"), false)
assert.ok(source.includes("requestedTab === 'offers' ? 'leads'"), 'Old offer tab links should route to Leads.')
assert.ok(source.includes("requestedTab === 'listing' ? 'marketing'"), 'Old listing tab links should route to Marketing.')
assert.ok(source.includes("returnTo: `/agent/listings/${encodeURIComponent(String(listingRecord?.id || ''))}?tab=leads`"), 'OTP return path should use the Leads tab.')

const overviewStart = source.indexOf("{sellerWorkspaceTab === 'overview'")
const leadsStart = source.indexOf("{sellerWorkspaceTab === 'leads'")
const sellerStart = source.indexOf("{sellerWorkspaceTab === 'seller'")
assert.ok(overviewStart > -1 && leadsStart > overviewStart, 'Seller workspace overview render block should exist before Leads.')
assert.ok(sellerStart > leadsStart, 'Seller workspace Seller render block should exist after Leads.')

const overviewBlock = source.slice(overviewStart, leadsStart)
const overviewSections = [
  'Latest Buyer Activity',
  'Upcoming Viewings',
  'Seller',
  'Marketing',
  'Price Position',
]
let previousIndex = -1
for (const heading of overviewSections) {
  const nextIndex = overviewBlock.indexOf(`>${heading}<`)
  assert.ok(nextIndex > previousIndex, `${heading} should appear in the requested Overview order.`)
  previousIndex = nextIndex
}

for (const removedOverviewCopy of [
  'Listing Follow-Ups',
  'Key Information',
  'Offer vs Asking Price',
  'Upload signed seller pack',
  'Add seller contact',
  'Add seller ID',
  'Add seller FICA',
  'Complete seller facts',
]) {
  assert.equal(overviewBlock.includes(removedOverviewCopy), false, `${removedOverviewCopy} should not be surfaced on the Overview tab.`)
}

assert.ok(overviewBlock.includes("openSellerWorkspaceSection('leads')"), 'Overview buyer activity CTA should open Leads.')
assert.ok(overviewBlock.includes("openSellerWorkspaceSection('seller')"), 'Overview seller snapshot CTA should open Seller.')
assert.ok(overviewBlock.includes("openSellerWorkspaceSection('marketing')"), 'Overview marketing/pricing CTAs should open Marketing.')
assert.equal(overviewBlock.includes('>Recent Activity<'), false, 'Overview should not repeat the retired recent activity block.')
assert.equal(overviewBlock.includes('No offers received yet.'), false, 'Price Position should not reference the retired offer workflow.')
assert.ok(
  overviewBlock.indexOf('ListingAgentReassignmentPanel') < overviewBlock.indexOf('data-testid="listing-overview-marketing-hero"'),
  'Overview should show the listing agent picker above Marketing.',
)
assert.ok(source.includes('buildListingOverviewPerformance({'), 'Overview should build performance from canonical sources.')
assert.equal(overviewBlock.includes("label: 'Views'"), false, 'Overview must not display unsupported view analytics.')
assert.equal(source.includes('const totalViews = explicitViews || portalViews + bridgeViews || 0'), false, 'Overview should not use legacy listing payload totals.')
assert.equal(source.includes('leadCount * 6 + syncedActiveOffers.length * 8 + 12'), false, 'Overview should not estimate views from lead and offer counts.')
assert.ok(source.includes('areaAverageDays,') && !source.includes('Math.max(metrics.daysOnMarket + 15, 30)'), 'Area average days should only render when real data exists.')

const sellerPortalLifecycleStatusIndex = source.indexOf('const sellerPortalLifecycleStatus = useMemo')
const overviewSellerSnapshotIndex = source.indexOf('const overviewSellerSnapshot = useMemo')
assert.ok(sellerPortalLifecycleStatusIndex > -1, 'Seller portal lifecycle status memo should exist.')
assert.ok(overviewSellerSnapshotIndex > -1, 'Overview seller snapshot memo should exist.')
assert.ok(
  sellerPortalLifecycleStatusIndex < overviewSellerSnapshotIndex,
  'Seller portal lifecycle status must be initialized before the overview seller snapshot reads it.',
)

const leadsBlock = source.slice(leadsStart, sellerStart)
const requiredLeadsCopy = [
  'Leads for this listing',
  'All enquiries and leads that came in through this property.',
  'Total leads',
  'New this week',
  'Contacted',
  'Viewings booked',
  'Offers',
  'Converted',
  '>Lead<',
  '>Source<',
  '>Status<',
  '>Contacted<',
  '>Viewing<',
  '>Offer<',
  'Date added',
  'No leads yet',
]

for (const copy of requiredLeadsCopy) {
  assert.ok(leadsBlock.includes(copy), `Leads tab should include ${copy}.`)
}

for (const removedLeadsCopy of [
  'Offer Table',
  'Secure Offer Links',
  'Historical offer records',
  'Open Full Offer Workspace',
  'Offer Workflow Retired',
  'No offer audit rows',
]) {
  assert.equal(leadsBlock.includes(removedLeadsCopy), false, `${removedLeadsCopy} should not be surfaced on the Leads tab.`)
}

assert.ok(source.includes('const listingLeadRows = useMemo'), 'Leads tab should derive listing-specific lead rows.')
assert.ok(leadsBlock.includes('handleExportListingLeads'), 'Leads tab should expose listing lead export.')
assert.ok(leadsBlock.includes('openBuyerLeadModal'), 'Leads tab should use canonical buyer lead capture.')
assert.equal(leadsBlock.includes('openShowDayCaptureModal'), false, 'Generic Leads actions should not use show-day capture.')
assert.ok(leadsBlock.includes('listingLeadRows.length'), 'Leads tab should render from listing-specific lead rows.')

console.log('Listing detail seller workspace tabs, overview, and leads guard passed.')
