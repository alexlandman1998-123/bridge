import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const privateListingSource = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const workspaceServiceSource = await fs.readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
const linkNormalizer = source.match(/function normalizeSellerVisibleListingLinks[\s\S]*?\n}\n\nfunction getFriendlySellerStatusLabel/)?.[0] || ''
const marketingBuilder = source.match(/function buildSellerMarketingChannels[\s\S]*?\n}\n\nfunction buildSellerAgentUpdate/)?.[0] || ''

assert.match(linkNormalizer, /const linksByChannel = new Map\(\)/, 'seller-visible links should be deduplicated before dashboard models are built')
assert.match(linkNormalizer, /const channelKey = platformKey \|\| urlKey/, 'marketing channels should deduplicate by platform with URL fallback')
assert.match(marketingBuilder, /const channels = new Map\(\)/, 'marketing cards should retain a defensive channel-level dedupe')
assert.match(source, /const sellerAgencyLogoUrl = pickFirstText\(/, 'seller portal should resolve the agent entity logo from listing branding')
assert.match(source, /src=\{sellerAgencyLogoUrl\}/, 'seller sidebar should render the agent entity logo')
assert.doesNotMatch(source, /return `Seller Onboarding \$\{label\}`/, 'seller sidebar should not render the redundant onboarding completion badge')
assert.match(source, /Your property is live and everything is on track\./, 'seller hero should lead with the listing status message')
assert.doesNotMatch(source, /Property Performance/, 'seller dashboard should not render the removed property performance panel')
assert.match(source, /portal\?\.listing\?\.marketing\?\.imageGallery/, 'seller hero should resolve the agent listing gallery')
assert.match(privateListingSource, /\.from\('listing_media'\)/, 'seller portal listing data should load the agent-platform media rows')
assert.match(privateListingSource, /heroImageUrl: coverImage\.url/, 'seller portal listing data should expose the selected agent-platform cover image')
assert.match(source, /function pickSellerBrandText/, 'seller portal should reject workflow labels as agency branding')
assert.doesNotMatch(source, /portal\?\.unit\?\.development\?\.name,\n\s+'Arch9'/, 'seller branding should not fall back to the selling workspace label')
assert.match(workspaceServiceSource, /branding: sellerPortalBranding/, 'seller portal payload should carry the organisation branding snapshot explicitly')
assert.doesNotMatch(workspaceServiceSource, /name: listing\?\.agencyName \|\| listing\?\.organisationName \|\| 'Selling'/, 'seller portal payload should not use Selling as an agency name')
assert.match(source, /sellerListedDateLabel/, 'seller hero should display listing metadata when available')

console.log('Seller portal UI regression checks passed.')
