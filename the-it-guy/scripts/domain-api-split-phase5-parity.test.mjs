import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const listingSource = await fs.readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const facadeSource = await fs.readFile(new URL('../src/lib/api/agentListingDetailApi.js', import.meta.url), 'utf8')
const packageJson = await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')

const heavyStaticImports = [
  '../lib/agencyCrmRepository',
  '../lib/agencyPipelineService',
  '../lib/buyerLifecycleService',
  '../lib/listingOffersService',
  '../lib/offerLinkDeliveryPlan',
  '../services/communicationDeliveryService',
  '../services/leadAnalyticsService',
  '../services/leadListingInterestService',
  '../services/leadPropertySharingService',
  '../services/leadSuggestionService',
  '../services/notificationOutboxService',
  '../services/sellerDocumentReviewWorkflowService',
  '../services/sellerPortalActivationService',
  '../services/showDayLeadCaptureService',
]

for (const importPath of heavyStaticImports) {
  assert.doesNotMatch(
    listingSource,
    new RegExp(`^import[\\s\\S]*?from ['"]${escapeRegex(importPath)}['"]`, 'm'),
    `AgentListingDetail should not statically import ${importPath}.`,
  )
}

const loaderExpectations = [
  ['loadPrivateListingActions', '../services/privateListingService'],
  ['loadAgencyPipelineActions', '../lib/agencyPipelineService'],
  ['loadAgencyCrmRepository', '../lib/agencyCrmRepository'],
  ['loadBuyerLifecycleActions', '../lib/buyerLifecycleService'],
  ['loadCommunicationDeliveryService', '../services/communicationDeliveryService'],
  ['loadLeadListingInterestService', '../services/leadListingInterestService'],
  ['loadLeadPropertySharingService', '../services/leadPropertySharingService'],
  ['loadLeadSuggestionService', '../services/leadSuggestionService'],
  ['loadListingOffersService', '../lib/listingOffersService'],
  ['loadNotificationOutboxService', '../services/notificationOutboxService'],
  ['loadSellerDocumentReviewActions', '../services/sellerDocumentReviewWorkflowService'],
  ['loadSellerPortalActivationActions', '../services/sellerPortalActivationService'],
  ['loadShowDayLeadCaptureActions', '../services/showDayLeadCaptureService'],
]

for (const [loaderName, importPath] of loaderExpectations) {
  assert.match(
    listingSource,
    new RegExp(`async function ${loaderName}\\(\\) \\{\\s*return import\\('${escapeRegex(importPath)}'\\)\\s*\\}`),
    `${loaderName} should dynamically import ${importPath}.`,
  )
}

const wrapperExpectations = [
  ['fetchAgencyCrmLeadWorkspace', 'loadAgencyCrmRepository'],
  ['listAgencyCrmLeadContacts', 'loadAgencyCrmRepository'],
  ['updateAgencyCrmContactRecord', 'loadAgencyCrmRepository'],
  ['updateAgencyCrmLeadRecord', 'loadAgencyCrmRepository'],
  ['createAppointmentAsync', 'loadAgencyPipelineActions'],
  ['createCanonicalOffer', 'loadBuyerLifecycleActions'],
  ['createOfferSellerReviewSession', 'loadBuyerLifecycleActions'],
  ['createTransactionFromAcceptedCanonicalOffer', 'loadBuyerLifecycleActions'],
  ['listCanonicalOffersForListing', 'loadBuyerLifecycleActions'],
  ['recordBuyerLeadActivity', 'loadBuyerLifecycleActions'],
  ['updateCanonicalOfferStatus', 'loadBuyerLifecycleActions'],
  ['getLeadCommunicationPreferences', 'loadCommunicationDeliveryService'],
  ['listCommunicationDeliveries', 'loadCommunicationDeliveryService'],
  ['prepareNotificationOutbox', 'loadNotificationOutboxService'],
  ['updateNotificationOutboxStatus', 'loadNotificationOutboxService'],
  ['deletePrivateListing', 'loadPrivateListingActions'],
  ['issueSellerPortalInvite', 'loadPrivateListingActions'],
  ['manageSellerPortalAccess', 'loadPrivateListingActions'],
  ['resetSellerPortalPassword', 'loadPrivateListingActions'],
  ['sendSellerOnboarding', 'loadPrivateListingActions'],
  ['syncPrivateListingDistributionData', 'loadPrivateListingActions'],
  ['updatePrivateListing', 'loadPrivateListingActions'],
  ['updatePrivateListingOnboardingFormData', 'loadPrivateListingActions'],
  ['uploadPrivateListingDocument', 'loadPrivateListingActions'],
  ['uploadPrivateListingMediaAsset', 'loadPrivateListingActions'],
  ['listListingLeadInterests', 'loadLeadListingInterestService'],
  ['listListingPropertyShares', 'loadLeadPropertySharingService'],
  ['createOfferInvite', 'loadListingOffersService'],
  ['markOfferAgentAction', 'loadListingOffersService'],
  ['acceptSuggestion', 'loadLeadSuggestionService'],
  ['generateSuggestionsForListing', 'loadLeadSuggestionService'],
  ['getSuggestionsForListing', 'loadLeadSuggestionService'],
  ['rejectSuggestion', 'loadLeadSuggestionService'],
  ['reviewSellerDocument', 'loadSellerDocumentReviewActions'],
  ['sendSellerDocumentManualReminder', 'loadSellerDocumentReviewActions'],
  ['activateSellerPortalForListing', 'loadSellerPortalActivationActions'],
  ['captureShowDayLead', 'loadShowDayLeadCaptureActions'],
  ['captureShowDayLeadBatch', 'loadShowDayLeadCaptureActions'],
  ['parseShowDayVisitorRows', 'loadShowDayLeadCaptureActions'],
]

for (const [wrapperName, loaderName] of wrapperExpectations) {
  const body = extractFunctionBody(listingSource, wrapperName)
  assert.match(body, new RegExp(`await ${loaderName}\\(\\)`), `${wrapperName} should await ${loaderName}.`)
  assert.match(body, /return \w+\(\.\.\.args\)/, `${wrapperName} should forward all arguments to the loaded service function.`)
}

for (const awaitedCall of [
  'await createOfferInvite(',
  'await markOfferAgentAction(',
  'await parseShowDayVisitorRows(',
]) {
  assert.match(listingSource, new RegExp(escapeRegex(awaitedCall)), `AgentListingDetail should await ${awaitedCall}.`)
}

for (const synchronousHelper of [
  'function getOfferInvitesForListing',
  'function getOffersForListing',
  'function resolveOfferLinkDeliveryPlan',
  'function buildListingWorkspaceAnalyticsSummary',
  'function buildSellerOfferReviewPreparation',
  'function buildSellerPortalInvitationPreview',
]) {
  assert.match(listingSource, new RegExp(escapeRegex(synchronousHelper)), `${synchronousHelper} should remain local for render-time parity.`)
}

assert.match(
  facadeSource,
  /async function loadPrivateListingService\(\) \{\s*return import\('\.\.\/\.\.\/services\/privateListingService\.js'\)\s*\}/,
  'Agent Listing Detail facade should lazy-load privateListingService.',
)
assert.match(
  facadeSource,
  /async function loadAgencyPipelineService\(\) \{\s*return import\('\.\.\/agencyPipelineService\.js'\)\s*\}/,
  'Agent Listing Detail facade should lazy-load agencyPipelineService.',
)

const facadeExports = [
  'getPrivateListing',
  'createPrivateListingDocumentDownloadUrl',
  'getSellerPortalAccessState',
  'getSellerPortalSecurityDiagnostics',
  'listAppointmentsAsync',
  'isSellerPortalInviteReadyAfterSignedMandate',
]

for (const exportName of facadeExports) {
  assert.match(facadeSource, new RegExp(`export (async )?function ${exportName}\\b`), `Facade should export ${exportName}.`)
}

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const facade = await server.ssrLoadModule('/src/lib/api/agentListingDetailApi.js')
  const privateListingService = await server.ssrLoadModule('/src/services/privateListingService.js')

  const parityCases = [
    [{ status: 'signed' }, {}],
    [{ mandateStatus: 'Mandate Signed' }, {}],
    [{ mandate_packet: { status: 'fully signed' } }, {}],
    [{ mandatePacket: { version: { status: 'uploaded_signed' } } }, {}],
    [{ mandate: { finalSignedFilePath: 'mandates/signed.pdf' } }, {}],
    [{ listingStatus: 'draft' }, { mandateSigned: true }],
    [{ status: 'draft', mandate: { status: 'pending' } }, {}],
    [{}, {}],
  ]

  for (const [listing, context] of parityCases) {
    assert.equal(
      facade.isSellerPortalInviteReadyAfterSignedMandate(listing, context),
      privateListingService.isSellerPortalInviteReadyAfterSignedMandate(listing, context),
      `Seller portal invite readiness should match privateListingService for ${JSON.stringify({ listing, context })}.`,
    )
  }
} finally {
  await server.close()
}

assert.match(
  packageJson,
  /"test:domain-api-split-phase5-parity": "node scripts\/domain-api-split-phase5-parity\.test\.mjs"/,
  'package.json should expose the Phase 5 parity test.',
)

console.log('domain API split Phase 5 parity tests passed')

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractFunctionBody(source, functionName) {
  const signature = `async function ${functionName}`
  const start = source.indexOf(signature)
  assert.notEqual(start, -1, `${functionName} should exist.`)
  const bodyStart = source.indexOf('{', start)
  assert.notEqual(bodyStart, -1, `${functionName} should have a function body.`)

  let depth = 0
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index]
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth === 0) return source.slice(bodyStart + 1, index)
  }

  throw new Error(`${functionName} body was not closed.`)
}
