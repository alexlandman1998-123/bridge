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
  'Performance',
  'Buyer Interest Funnel',
  'Latest Buyer Activity',
  'Upcoming Viewings',
  'Seller',
  'Marketing',
  'Price Position',
  'Recent Activity',
]
let previousIndex = -1
for (const heading of overviewSections) {
  const nextIndex = overviewBlock.indexOf(`>${heading}<`)
  assert.ok(nextIndex > previousIndex, `${heading} should appear in the requested Overview order.`)
  previousIndex = nextIndex
}

for (const removedOverviewCopy of [
  'Listing Follow-Ups',
  'Portal Security',
  'Seller Onboarding Email Diagnostics',
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
assert.ok(overviewBlock.includes("openSellerWorkspaceSection('activity')"), 'Overview recent activity CTA should open Activity.')
assert.ok(source.includes('const totalViews = explicitViews || portalViews + bridgeViews || 0'), 'Overview views should not use estimated/demo view counts.')
assert.ok(source.includes('areaAverageDays,') && !source.includes('Math.max(metrics.daysOnMarket + 15, 30)'), 'Area average days should only render when real data exists.')

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
assert.ok(leadsBlock.includes('openShowDayCaptureModal'), 'Leads tab should use the existing add-lead capture workflow.')
assert.ok(leadsBlock.includes('listingLeadRows.length'), 'Leads tab should render from listing-specific lead rows.')

console.log('Listing detail seller workspace tabs, overview, and leads guard passed.')
