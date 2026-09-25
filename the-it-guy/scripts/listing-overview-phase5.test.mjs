import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildSellerEmailDeliveryOverview } from '../src/services/listings/listingSellerOverviewModel.js'

assert.deepEqual(
  buildSellerEmailDeliveryOverview({}, { error: 'Network unavailable' }),
  { label: 'Unavailable', status: 'attention', hasEvidence: false },
  'A failed delivery-history load must not be shown as an empty or healthy result.',
)

const pageSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const overviewStart = pageSource.indexOf("{sellerWorkspaceTab === 'overview'")
const leadsStart = pageSource.indexOf("{sellerWorkspaceTab === 'leads'")
const overview = pageSource.slice(overviewStart, leadsStart)

assert.match(pageSource, /const refreshListingOverview = useCallback/)
assert.match(pageSource, /void refreshInterestedLeads\(\)/)
assert.match(pageSource, /void refreshSentProperties\(\)/)
assert.match(pageSource, /refreshListingViewings\(\)/)
assert.match(overview, /overviewReliability\.status/)
assert.match(pageSource, /Overview up to date/)
assert.match(pageSource, /data source/)
assert.match(pageSource, /unavailable/)
assert.match(overview, /onClick=\{refreshListingOverview\}/)
assert.match(overview, /Buyer activity could not be loaded\. This is not a confirmed empty result\./)
assert.doesNotMatch(overview, /Seller email delivery history could not be loaded/)
assert.match(overview, /Lead sync unavailable/)
assert.doesNotMatch(overview, /Offer sync unavailable/)
assert.match(overview, /Viewing data unavailable/)
assert.match(overview, /aria-live="polite"/)

console.log('Listing Overview Phase 5 reliability close-out contract passed')
