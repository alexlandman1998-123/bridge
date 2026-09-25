import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pageSource = await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const agentPanelSource = await readFile(new URL('../src/components/listings/ListingAgentReassignmentPanel.jsx', import.meta.url), 'utf8')

const overviewStart = pageSource.indexOf("{sellerWorkspaceTab === 'overview'")
const leadsStart = pageSource.indexOf("{sellerWorkspaceTab === 'leads'")
assert.ok(overviewStart > -1 && leadsStart > overviewStart, 'The listing Overview block must exist.')
const overview = pageSource.slice(overviewStart, leadsStart)

assert.equal(overview.includes('border-t-[4px]'), false, 'Overview metrics must use the neutral card treatment.')
assert.match(overview, /listingPerformance\.viewsAvailable/, 'Verified view availability must remain wired into the metric cards.')
assert.match(overview, /data-testid="listing-overview-marketing-hero"/, 'Marketing must render as a property hero.')
assert.match(overview, /getImageBlock\(coverImage\?\.url/, 'The marketing hero must use the listing cover image.')
assert.match(overview, /marketingDraft\.description/, 'The marketing hero must show public listing copy.')
assert.match(overview, />Listed on</, 'The marketing hero must show channel placement.')
assert.match(overview, /row\.href/, 'Published channels must expose their listing links.')
assert.match(overview, /data-testid="listing-overview-price-position"/, 'The compact Price Position card must remain available.')
assert.equal(overview.includes('No offers received yet.'), false, 'Retired offer empty-state copy must be removed.')
assert.match(overview, /ListingAgentReassignmentPanel/, 'The Price Position column must include the listing agent card.')
assert.match(overview, /onReassigned=/, 'The listing agent card must refresh after reassignment.')
assert.equal(overview.includes('>Recent Activity<'), false, 'The redundant Recent Activity block must be removed.')

assert.match(agentPanelSource, /currentAgentAvatarUrl/, 'The listing agent card must support a profile image.')
assert.match(agentPanelSource, /currentAgentEmail/, 'The listing agent card must show the agent email when available.')
assert.match(agentPanelSource, /currentAgentPhone/, 'The listing agent card must show the agent phone when available.')
assert.match(agentPanelSource, /Confirm reassignment/, 'The existing guarded reassignment action must remain available.')

console.log('Listing Overview Phase 3 presentation contract passed')
