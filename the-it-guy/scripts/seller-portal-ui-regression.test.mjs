import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const source = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const privateListingSource = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const workspaceServiceSource = await fs.readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
const stageWorkspaceSource = await fs.readFile(new URL('../src/components/client-portal/seller/TransactionStageWorkspace.jsx', import.meta.url), 'utf8')
const sellerOffersSource = await fs.readFile(new URL('../src/components/client-portal/offers/SellerOffersPage.jsx', import.meta.url), 'utf8')
const sellerAppointmentsSource = await fs.readFile(new URL('../src/components/client-portal/appointments/SellerAppointmentsPage.jsx', import.meta.url), 'utf8')
const sellerDocumentsSource = await fs.readFile(new URL('../src/components/client-portal/documents/SellerDocumentWorkspace.jsx', import.meta.url), 'utf8')
const linkNormalizer = source.match(/function normalizeSellerVisibleListingLinks[\s\S]*?\n}\n\nfunction getFriendlySellerStatusLabel/)?.[0] || ''
const marketingBuilder = source.match(/function buildSellerMarketingChannels[\s\S]*?\n}\n\nfunction buildSellerAgentUpdate/)?.[0] || ''
const sellerHero = source.match(/function SellerPropertyHero[\s\S]*?\n}\n\nfunction SellerTransactionHealthCard/)?.[0] || ''
const sellerDashboard = source.match(/function SellerPortalDashboard[\s\S]*?\n}\n\nfunction SellerPortalPasswordGate/)?.[0] || ''
const sellerLogoResolver = source.match(/const sellerAgencyLogoUrl = pickFirstText\([\s\S]*?\n  \)/)?.[0] || ''

assert.match(linkNormalizer, /const linksByChannel = new Map\(\)/, 'seller-visible links should be deduplicated before dashboard models are built')
assert.match(linkNormalizer, /const channelKey = platformKey \|\| urlKey/, 'marketing channels should deduplicate by platform with URL fallback')
assert.match(marketingBuilder, /const channels = new Map\(\)/, 'marketing cards should retain a defensive channel-level dedupe')
assert.match(source, /const sellerAgencyLogoUrl = pickFirstText\(/, 'seller portal should resolve the agent entity logo from listing branding')
assert.match(source, /src=\{sellerAgencyLogoUrl\}/, 'seller sidebar should render the agent entity logo')
assert.ok(
  sellerLogoResolver.indexOf('agencyLogoLightUrl') < sellerLogoResolver.indexOf('agencyLogoDarkUrl'),
  'seller sidebar should prefer the organisation light logo before dark-logo fallbacks',
)
assert.match(sellerLogoResolver, /organisation_logo_light_url/, 'seller logo resolution should support legacy organisation light-logo fields')
assert.doesNotMatch(source, /return `Seller Onboarding \$\{label\}`/, 'seller sidebar should not render the redundant onboarding completion badge')
assert.match(source, /Your property is live and everything is on track\./, 'seller hero should lead with the listing status message')
assert.doesNotMatch(source, /Property Performance/, 'seller dashboard should not render the removed property performance panel')
assert.match(source, /portal\?\.listing\?\.marketing\?\.imageGallery/, 'seller hero should resolve the agent listing gallery')
assert.match(privateListingSource, /\.from\('listing_media'\)/, 'seller portal listing data should load the agent-platform media rows')
assert.match(privateListingSource, /heroImageUrl: coverImage\.url/, 'seller portal listing data should expose the selected agent-platform cover image')
assert.match(source, /function pickSellerBrandText/, 'seller portal should reject workflow labels as agency branding')
assert.doesNotMatch(source, /portal\?\.unit\?\.development\?\.name,\n\s+'Arch9'/, 'seller branding should not fall back to the selling workspace label')
assert.match(workspaceServiceSource, /branding: sellerPortalBranding/, 'seller portal payload should carry the organisation branding snapshot explicitly')
assert.match(workspaceServiceSource, /agencyLogoLightUrl: sellerPortalBranding\.logoLightUrl/, 'seller workspace context should expose the light logo explicitly')
assert.match(privateListingSource, /organisationLogoLightUrl: resolvedPortalBranding\.logoLightUrl/, 'private listing payload should expose the organisation light logo explicitly')
assert.doesNotMatch(workspaceServiceSource, /name: listing\?\.agencyName \|\| listing\?\.organisationName \|\| 'Selling'/, 'seller portal payload should not use Selling as an agency name')
assert.doesNotMatch(sellerHero, /Your listing/i, 'seller hero should not render the redundant listing summary card')
assert.match(sellerHero, /Your agent/i, 'seller hero should retain the expanded agent card')
assert.match(source, /Listing Progress[\s\S]*Sale Progress/, 'seller progress should expose both listing and sale workflow tabs')
assert.match(source, /listingProgressModel=\{sellerListingProgressModel\}/, 'seller dashboard should retain the listing workflow after sale progress starts')
assert.match(source, /saleProgressModel=\{sellerSaleProgressModel\}/, 'seller dashboard should expose the sale workflow independently')
assert.match(source, /gridTemplateColumns: `repeat\(\$\{stepCount\}, 120px\)`/, 'seller progress nodes should stretch across the available timeline rail')
assert.match(sellerHero, /flex h-full min-w-0 flex-col/, 'seller agent column should stretch to align with the property image')
assert.match(marketingBuilder, /lead-sources\/property24\.png/, 'Property24 marketing rows should use the platform logo')
assert.match(marketingBuilder, /lead-sources\/private-property\.jpeg/, 'Private Property marketing rows should use the platform logo')
assert.match(source, /buildSellerMarketingChannels\(sellerVisibleListingLinks, sellerAgencyLogoUrl\)/, 'agency website rows should receive the agency logo')
assert.match(source, /View Listing/, 'marketing rows should expose outbound listing actions')
assert.match(source, /max-h-\[250px\].*overflow-y-auto/, 'seller journey timeline should scroll within its card')
assert.match(sellerDashboard, /SellerConversationCard/, 'seller dashboard should render the property-team chat card')
assert.match(sellerDashboard, /SellerDocumentTracker/, 'seller dashboard should render the document tracker')
assert.doesNotMatch(sellerDashboard, /SellerNextMilestoneCard/, 'seller dashboard should not render the removed next milestone card')
assert.match(source, /title="Document Tracker"/, 'document tracker should replace the important-document list')
assert.match(source, /progress: true/, 'seller progress should be enabled as its own portal route')
assert.match(source, /<TransactionStageWorkspace/, 'seller progress should render the dedicated transaction-stage workspace')
assert.doesNotMatch(source, /key: 'progress'.*hash: '#seller-sale-progress'/, 'seller progress navigation should not redirect into the overview dashboard')
assert.match(source, /portal\?\.transaction\?\.current_main_stage/, 'seller tracker should pass the real transaction main stage before listing fallbacks')
assert.match(source, /hasLinkedSellerTransaction[\s\S]*\? fallbackSellerStageMeta/, 'a linked transaction should override the listing-only shared journey stage')
assert.match(stageWorkspaceSource, /SELLER_TRANSACTION_STAGE_DEFINITIONS/, 'seller progress should use a central reusable stage registry')
assert.match(stageWorkspaceSource, /otp:[\s\S]*title: 'Offer to Purchase'/, 'seller progress should represent the pre-acceptance OTP milestone instead of falling through to Offer Accepted')
assert.match(stageWorkspaceSource, /instruction_sent:[\s\S]*attorney_opening_file:[\s\S]*fica_verification:[\s\S]*transfer_documents:/, 'stage registry should cover the detailed transfer workflow')
assert.match(stageWorkspaceSource, /Frequently asked at this stage/, 'stage workspace should provide stage-specific FAQs')
assert.match(stageWorkspaceSource, /Who is working on this\?/, 'stage workspace should expose assigned transaction participants')
assert.match(stageWorkspaceSource, /Recent activity/, 'stage workspace should expose seller-facing activity')
assert.match(stageWorkspaceSource, /fixed inset-x-0 bottom-0/, 'action-required stages should provide a mobile sticky CTA')
assert.doesNotMatch(sellerOffersSource, /max-w-\[1440px\]|lg:px-6/, 'seller offers should inherit the dashboard page gutter without a nested width cap or horizontal padding')
assert.doesNotMatch(sellerAppointmentsSource, /max-w-\[1440px\]/, 'seller appointments should inherit the full dashboard content width')
assert.doesNotMatch(sellerDocumentsSource, /rounded-\[32px\][^\n]*p-4/, 'seller documents should not add a second padded page shell inside the dashboard gutter')

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { resolveSellerTransactionStageKey } = await server.ssrLoadModule('/src/components/client-portal/seller/TransactionStageWorkspace.jsx')
  assert.equal(resolveSellerTransactionStageKey('listing_live', 'otp'), 'otp', 'canonical OTP progress must not fall through to Offer Accepted')
  assert.equal(resolveSellerTransactionStageKey('offer_accepted', 'finance'), 'bond_approval', 'finance progress should continue into the detailed post-acceptance workflow')
  assert.equal(resolveSellerTransactionStageKey('fica_verification', 'transfer'), 'fica_verification', 'a detailed transaction stage should take precedence over the coarse sale phase')
  assert.equal(resolveSellerTransactionStageKey('FIN'), 'bond_approval', 'FIN must resolve to the finance tracker stage')
  assert.equal(resolveSellerTransactionStageKey('ATTY'), 'attorney_opening_file', 'ATTY must resolve to the attorney tracker stage')
  assert.equal(resolveSellerTransactionStageKey('XFER'), 'instruction_sent', 'XFER must resolve to the transfer tracker stage')
  assert.equal(resolveSellerTransactionStageKey('REG'), 'registration', 'REG must resolve to the registration tracker stage')
} finally {
  await server.close()
}

console.log('Seller portal UI regression checks passed.')
