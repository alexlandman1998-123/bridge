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
const clientDocumentCentreSource = await fs.readFile(new URL('../src/components/client-portal/documents/ClientDocumentCentre.jsx', import.meta.url), 'utf8')
const linkNormalizer = source.match(/function normalizeSellerVisibleListingLinks[\s\S]*?\n}\n\nfunction getFriendlySellerStatusLabel/)?.[0] || ''
const marketingBuilder = source.match(/function buildSellerMarketingChannels[\s\S]*?\n}\n\nfunction buildSellerAgentUpdate/)?.[0] || ''
const sellerHero = source.match(/function SellerPropertyHero[\s\S]*?\n}\n\nfunction SellerTransactionHealthCard/)?.[0] || ''
const sellerDashboard = source.match(/function SellerPortalDashboard[\s\S]*?\n}\n\nfunction BuyerOverviewActionPanel/)?.[0] || ''
const sellerHealthCard = source.match(/function SellerTransactionHealthCard[\s\S]*?\n}\n\nfunction SellerMarketingActivity/)?.[0] || ''
const agentUpdateBuilder = source.match(/function buildSellerAgentUpdate[\s\S]*?\n}/)?.[0] || ''
const buildAgentUpdate = new Function('normalizeSellerPortalKey', `${agentUpdateBuilder}; return buildSellerAgentUpdate`)(
  (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_'),
)
const automated = { message: 'Your onboarding details were received successfully.', authorRole: 'Team update', authorName: 'Arch9', eventType: 'seller_onboarding_submitted' }
assert.equal(buildAgentUpdate({ items: [automated], sellerAgentName: 'Assigned agent' }), null, 'automated milestones must not be attributed to an agent')
assert.equal(buildAgentUpdate({ items: [{ ...automated, authorRole: 'Agent' }] }), null, 'an agent role alone does not turn a milestone into an authored note')
const actualNote = { message: 'The viewing is confirmed for Saturday.', authorName: 'Actual author', authorRole: 'Agent', eventType: 'note_shared_with_client', timestampLabel: '3 October' }
assert.deepEqual(buildAgentUpdate({ items: [automated, actualNote], sellerAgentName: 'Assigned agent', sellerAgentAvatarUrl: 'assigned-photo' }), {
  message: actualNote.message, timestampLabel: '3 October', agentName: 'Actual author', avatarUrl: '',
}, 'authored notes must preserve their actual author and avoid another agent’s photo')
assert.doesNotMatch(sellerHealthCard, /score|conic-gradient|%/, 'transaction health must show status and counts instead of a percentage')
assert.match(sellerHealthCard, /View required items.*to: 'documents'/, 'health action must open the authorised document checklist')
assert.match(source, /documentSummary: sellerDocumentSummary/, 'health must use the same authoritative counts as the document centre')
const sellerLogoResolver = source.match(/const sellerAgencyLogoUrl = pickFirstText\([\s\S]*?\n  \)/)?.[0] || ''

const progressStepsSource = source.match(/const SELLER_PROGRESS_STEPS = \[[\s\S]*?\n\]/)?.[0]
const sharedProgressSource = source.slice(source.indexOf('const SELLER_PROGRESS_PORTAL_KEY_BY_JOURNEY_KEY ='), source.indexOf('function normalizeSellerSaleMainStage'))
assert.ok(progressStepsSource && sharedProgressSource, 'shared listing progress projection must be available')
const projectListingProgress = new Function(`${progressStepsSource}\n${sharedProgressSource}\nreturn buildSellerPortalProgressModelFromSharedJourney;`)()
const journeyKeys = ['new_lead', 'contacted', 'seller_onboarding_sent', 'seller_onboarding_submitted', 'mandate_sent', 'mandate_signed', 'listing_created', 'listing_live', 'documents_submitted']
const expectedPortalKeys = ['contacted', 'contacted', 'onboarding', 'submitted', 'submitted', 'mandate_signed', 'listing_created', 'listing_live', 'documents_complete']
let previousPercent = 0
for (const [index, key] of journeyKeys.entries()) {
  const model = projectListingProgress({
    currentStage: { key },
    stages: journeyKeys.map((stageKey, stageIndex) => ({ key: stageKey, state: stageIndex < index ? 'completed' : stageIndex === index ? 'current' : 'upcoming' })),
  })
  assert.equal(model.currentKey, expectedPortalKeys[index], `agent journey stage ${key} must map to the matching seller stage`)
  assert.equal(model.steps.find((step) => step.key === expectedPortalKeys[index]).state, 'current')
  assert.ok(model.percent >= previousPercent, `progress must not jump backwards at ${key}`)
  previousPercent = model.percent
}

assert.match(linkNormalizer, /const linksByChannel = new Map\(\)/, 'seller-visible links should be deduplicated before dashboard models are built')
assert.match(linkNormalizer, /const channelKey = platformKey \|\| urlKey/, 'marketing channels should deduplicate by platform with URL fallback')
assert.match(marketingBuilder, /const channels = new Map\(\)/, 'marketing cards should retain a defensive channel-level dedupe')
assert.match(source, /const sellerAgencyLogoUrl = pickFirstText\(/, 'seller portal should resolve the agent entity logo from listing branding')
assert.match(source, /src=\{sellerAgencyLogoDarkUrl\}/, 'seller dark sidebar should render the dark-background agency logo')
assert.ok(
  sellerLogoResolver.indexOf('agencyLogoLightUrl') < sellerLogoResolver.indexOf('agencyLogoDarkUrl'),
  'seller white surfaces should prefer light-background logos before dark-background fallbacks',
)
assert.match(sellerLogoResolver, /organisation_logo_light_url/, 'seller logo resolution should support legacy organisation light-logo fields')
const mobileDocumentsSource = source.slice(source.indexOf('function SellerMobileDocumentsPage('), source.indexOf('function MobileDocumentList('))
const sellerMobileSource = source.slice(source.indexOf('function SellerMobilePortal('), source.indexOf('\nfunction ', source.indexOf('function SellerMobilePortal(') + 10))
assert.match(mobileDocumentsSource, /normalizedQuery \|\| actionOnly \|\| activeFilter !== 'all' \? <MobileDocumentList/, 'mobile search and filters must render their actual matching documents')
assert.match(mobileDocumentsSource, /items=\{filteredItems\}/, 'mobile filtered results must use the selected document state and search')
assert.doesNotMatch(mobileDocumentsSource, /SellerMobileDocumentCategoryRing|min-h-\[174px\]|Things requiring your attention/, 'category rows should not repeat progress displays or document task lists')
assert.doesNotMatch(sellerMobileSource, /aria-label="Listing navigation"|Next required item|Need attention<|<SellerMarketingActivity/, 'mobile overview should not repeat navigation or document and marketing summaries')
assert.match(sellerMobileSource, /section: 'listing_marketing', label: 'Listing'/, 'listing page should be reachable in the single bottom menu')
assert.match(sellerMobileSource, /mobileSection === 'details'.*SellerMyDetailsReadonlyPage/, 'mobile details must render the details page rather than overview')
assert.match(sellerMobileSource, /mobileSection === 'appointments'/, 'agent appointment link must resolve to the mobile appointment page')
assert.doesNotMatch(source, /return `Seller Onboarding \$\{label\}`/, 'seller sidebar should not render the redundant onboarding completion badge')
assert.doesNotMatch(sellerHero, /everything is on track/, 'seller hero should not render the removed status headline')
assert.doesNotMatch(source, /Property Performance/, 'seller dashboard should not render the removed property performance panel')
assert.match(source, /portal\?\.listing\?\.marketing\?\.imageGallery/, 'seller hero should resolve the agent listing gallery')
assert.match(privateListingSource, /\.from\('listing_media'\)/, 'seller portal listing data should load the agent-platform media rows')
assert.match(privateListingSource, /heroImageUrl: coverImage\.url/, 'seller portal listing data should expose the selected agent-platform cover image')
assert.match(source, /function pickSellerBrandText/, 'seller portal should reject workflow labels as agency branding')
assert.doesNotMatch(source, /portal\?\.unit\?\.development\?\.name,\n\s+'Arch9'/, 'seller branding should not fall back to the selling workspace label')
assert.match(workspaceServiceSource, /branding: sellerPortalBranding/, 'seller portal payload should carry the organisation branding snapshot explicitly')
assert.match(workspaceServiceSource, /agencyLogoLightUrl: sellerPortalBranding\.logoLightUrl/, 'seller workspace context should expose the light logo explicitly')
assert.match(workspaceServiceSource, /const sellerPortalHeroImageUrl = resolveSellerPortalHeroImageUrl\(listing, formData\)/, 'seller portal payload should resolve the uploaded listing hero image once at the service boundary')
assert.match(workspaceServiceSource, /heroImageUrl: sellerPortalHeroImageUrl/, 'seller portal listing context should expose the uploaded listing hero image')
assert.match(workspaceServiceSource, /propertyImage: sellerPortalHeroImageUrl/, 'seller portal unit payload should expose the uploaded listing hero image for legacy dashboard consumers')
assert.match(privateListingSource, /organisationLogoLightUrl: resolvedPortalBranding\.logoLightUrl/, 'private listing payload should expose the organisation light logo explicitly')
assert.match(privateListingSource, /function mapSellerClientPortalCorePayload[\s\S]*?payloadExternalLinks[\s\S]*?external_links: payloadExternalLinks/, 'seller core payload should preserve agent-published external listing links')
assert.doesNotMatch(workspaceServiceSource, /name: listing\?\.agencyName \|\| listing\?\.organisationName \|\| 'Selling'/, 'seller portal payload should not use Selling as an agency name')
assert.doesNotMatch(sellerHero, /Your listing/i, 'seller hero should not render the redundant listing summary card')
assert.match(sellerHero, /Your agent/i, 'seller hero should retain the expanded agent card')
assert.doesNotMatch(sellerHero, /statusHeadline|everything is on track/, 'seller greeting should not claim the sale is on track')
assert.match(sellerHero, /xl:min-h-\[280px\]/, 'agent and gallery cards should use the compact desktop height')
assert.match(source, /Listing Progress[\s\S]*Sale Progress/, 'seller progress should expose both listing and sale workflow tabs')
assert.match(source, /listingProgressModel=\{sellerListingProgressModel\}/, 'seller dashboard should retain the listing workflow after sale progress starts')
const mobilePortal = source.slice(source.indexOf('function SellerMobilePortal('), source.indexOf('function SellerCompliancePackCard('))
assert.match(mobilePortal, /<SellerProgressJourney/, 'mobile overview must render the shared desktop progress model')
assert.match(source, /mode: isSellerPortalToken \? 'full' : 'core'/, 'seller reconciliation must refresh complete documents and appointments')
assert.match(source, /!isSellerPortalToken && \['', 'overview', 'progress'\]/, 'seller overview must hydrate beyond the initial core snapshot')
assert.doesNotMatch(source, /label: 'Schedule Call'|>Schedule call</, 'appointment navigation must not promise unavailable call booking')
const agentEmailResolver = source.slice(source.indexOf('  const sellerAgentEmail ='), source.indexOf('  const sellerAgentPhone ='))
assert.doesNotMatch(agentEmailResolver, /buyer\?\.email/, 'agent contact must never fall back to the seller email')
assert.match(source, /saleProgressModel=\{sellerSaleProgressModel\}/, 'seller dashboard should expose the sale workflow independently')
assert.match(source, /gridTemplateColumns: `repeat\(\$\{stepCount\}, 120px\)`/, 'seller progress nodes should stretch across the available timeline rail')
assert.doesNotMatch(sellerHero, /actively marketing|xl:min-h-\[410px\]/, 'seller hero should omit marketing copy and oversized gallery height')
assert.match(marketingBuilder, /lead-sources\/property24\.png/, 'Property24 marketing rows should use the platform logo')
assert.match(marketingBuilder, /lead-sources\/private-property\.jpeg/, 'Private Property marketing rows should use the platform logo')
assert.match(source, /buildSellerMarketingChannels\(sellerVisibleListingLinks, sellerAgencyLogoUrl\)/, 'agency website rows should receive the agency logo')
assert.match(source, /View Listing/, 'marketing rows should expose outbound listing actions')
assert.match(source, /max-h-\[250px\].*overflow-y-auto/, 'seller journey timeline should scroll within its card')
assert.doesNotMatch(source, /SellerConversationCard|Ask Your Property Team/, 'removed conversation card should not appear on desktop or mobile')
assert.doesNotMatch(sellerDashboard, /SellerCompliancePackCard/, 'overview should not duplicate seller onboarding signatures')
assert.doesNotMatch(source, /sellerActivityFallbackItems/, 'timeline should not invent events from the current stage')
assert.match(sellerDashboard, /SellerDocumentTracker/, 'seller dashboard should render the document tracker')
assert.doesNotMatch(sellerDashboard, /SellerNextMilestoneCard/, 'seller dashboard should not render the removed next milestone card')
assert.match(source, /title="Document Tracker"/, 'document tracker should replace the important-document list')
const documentTracker = source.match(/function SellerDocumentTracker[\s\S]*?\n}\n\nfunction SellerSecureSupportFooter/)?.[0] || ''
assert.doesNotMatch(documentTracker, /conic-gradient|min-h-\[390px\]|percent/, 'document tracker should use compact status counts without a ring or forced height')
assert.match(documentTracker, /sm:grid-cols-3/, 'document counts should share a desktop row and stack on small screens')
assert.match(documentTracker, /tracker.available/, 'document tracker must not show false zeros when the checklist is unavailable')
assert.match(clientDocumentCentreSource, /title: 'Sales Documents'/, 'seller document centre should expose a Sales Documents tab')
assert.match(clientDocumentCentreSource, /sellerRequirementGroup\(item\) === 'sales'/, 'seller sale documents should use the shared sales grouping')
assert.match(clientDocumentCentreSource, /disclosure\|defects\|capital improvement\|cgt\|capital-gains\|acquisition\|alteration\|building plan\|occupation certificate/, 'seller disclosure, CGT, acquisition, and alteration requirements should group under property documents')
assert.match(clientDocumentCentreSource, /sale_document\|mandate\|otp\|offer to purchase\|sale agreement\|agreement of sale\|seller instruction/, 'seller sale grouping should be limited to actual sale documents')
assert.doesNotMatch(clientDocumentCentreSource, /seller declaration\/\.test\(haystack\)\) return 'sales'/, 'seller declaration/disclosure should not be classified as a Sales document')
assert.doesNotMatch(workspaceServiceSource, /title: 'Seller Declaration \/ Disclosure'[\s\S]*?buildSellerSaleDocumentCenterItem/, 'seller disclosure should not be injected into Sales downloadable documents')
assert.match(source, /disclosure\|defects\|capital improvement\|cgt\|capital-gains\|acquisition\|alteration\|building plan\|occupation certificate/, 'seller mobile documents should classify disclosure, CGT, acquisition, and alteration records as Property')
assert.doesNotMatch(source, /seller declaration\/\.test\(haystack\)\) return 'sale'/, 'seller mobile documents should not classify seller declaration/disclosure as Sales')
assert.match(source, /seller_mandate/, 'seller mobile documents should deduplicate raw signed mandate files against the friendly mandate document')
assert.match(source, /\['sale', 'sales', 'mandate', 'transfer'\]\.includes\(explicitCategoryKey\)/, 'seller mobile documents should remap old mandate and transfer categories into Sales')
assert.match(source, /category\.total > 0 \|\| category\.key === 'sale'/, 'seller mobile documents should keep the Sales category visible even when only generated sale documents are pending')
assert.match(source, /Choose document type/, 'seller mobile upload should open a document-type picker before camera or file actions')
assert.match(source, /onOpenUploadPicker=\{openDocumentUploadPicker\}/, 'seller mobile documents should route global uploads through the picker')
assert.match(source, /openGeneratedPortalDocumentHtml/, 'seller mobile generated documents should open as rendered HTML instead of using the fragile mobile PDF renderer')
assert.match(source, /progress: true/, 'seller progress should be enabled as its own portal route')
assert.match(source, /<SellerProgressPage/, 'seller progress should render the same process page on desktop and mobile')
assert.match(source, /sellerProgressPage=\{sellerProgressPage\}/, 'mobile progress must receive the full shared seller process page')
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
