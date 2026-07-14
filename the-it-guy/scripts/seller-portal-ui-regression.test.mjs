import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const source = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const linkNormalizer = source.match(/function normalizeSellerVisibleListingLinks[\s\S]*?\n}\n\nfunction getFriendlySellerStatusLabel/)?.[0] || ''
const marketingBuilder = source.match(/function buildSellerMarketingChannels[\s\S]*?\n}\n\nfunction buildSellerAgentUpdate/)?.[0] || ''

assert.match(linkNormalizer, /const linksByChannel = new Map\(\)/, 'seller-visible links should be deduplicated before dashboard models are built')
assert.match(linkNormalizer, /const channelKey = platformKey \|\| urlKey/, 'marketing channels should deduplicate by platform with URL fallback')
assert.match(marketingBuilder, /const channels = new Map\(\)/, 'marketing cards should retain a defensive channel-level dedupe')
assert.match(source, /const sellerAgencyLogoUrl = pickFirstText\(/, 'seller portal should resolve the agent entity logo from listing branding')
assert.match(source, /src=\{sellerAgencyLogoUrl\}/, 'seller sidebar should render the agent entity logo')
assert.doesNotMatch(source, /return `Seller Onboarding \$\{label\}`/, 'seller sidebar should not render the redundant onboarding completion badge')

console.log('Seller portal UI regression checks passed.')
