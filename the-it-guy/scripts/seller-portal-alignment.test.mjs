import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const serviceSource = await fs.readFile(new URL('../src/services/clientPortalWorkspaceService.js', import.meta.url), 'utf8')
assert.match(serviceSource, /buildSellerJourney/)
assert.match(serviceSource, /buildSellerPortalJourneyView/)
assert.match(serviceSource, /sellerPortalStatusCards/)
assert.match(
  serviceSource,
  /if \(isSellerOnboardingToken\(token\)\) \{[\s\S]*return fetchSellerClientPortalDataByToken\(token/,
  'seller portal links should use the password-gated seller workspace loader before generic client portal loading',
)

const privateListingServiceSource = await fs.readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8')
const sellerPortalPayloadLoader = privateListingServiceSource.match(/async function fetchSellerClientPortalPayloadByToken[\s\S]*?\n}\n\nfunction getSellerClientPortalEmail/)?.[0] || ''
assert.match(
  sellerPortalPayloadLoader,
  /isMissingRpcError\(rpc\.error, 'bridge_private_listing_seller_portal_payload'\)[\s\S]*p_token: normalizedToken/,
  'seller portal payload loading should retry the legacy token-only RPC while production schema reconciliation is pending',
)
const sellerOnboardingLoader = privateListingServiceSource.match(/export async function getSellerOnboardingByToken[\s\S]*?\n}\n\nasync function maybeResolveCanonicalSellerRequirements/)?.[0] || ''
assert.match(sellerOnboardingLoader, /fetchOrganisationBrandingSnapshot\(client, portalPayload\.listing\.organisationId\)/, 'seller onboarding portal should fetch latest organisation branding for RPC payloads')
assert.match(sellerOnboardingLoader, /fetchOrganisationBrandingSnapshot\(client, listing\?\.organisationId\)/, 'seller onboarding portal should fetch latest organisation branding for fallback listing payloads')
assert.doesNotMatch(sellerOnboardingLoader, /branding\?\.logoUrl[\s\S]*\?\s*null[\s\S]*fetchOrganisationBrandingSnapshot/, 'seller onboarding portal must not skip latest branding when a stale logo snapshot exists')

const clientPortalSource = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
assert.match(clientPortalSource, /sharedSellerPortalJourney/)
assert.match(clientPortalSource, /SellerPortalDashboard/)
assert.match(clientPortalSource, /buildSellerPortalProgressModelFromSharedJourney/)
assert.match(clientPortalSource, /SELLER_PORTAL_NAV_GROUPS[\s\S]*Your Sale[\s\S]*Property[\s\S]*Account/)
assert.match(clientPortalSource, /SellerPropertyHero/)
assert.match(clientPortalSource, /SellerTransactionHealthCard/)
assert.match(clientPortalSource, /SellerPropertyPerformance/)
assert.match(clientPortalSource, /SellerMarketingActivity/)
assert.match(clientPortalSource, /SellerJourneyTimeline/)
assert.match(clientPortalSource, /SellerImportantDocuments/)
assert.match(clientPortalSource, /SELLER_SALE_PROGRESS_STEPS[\s\S]*OTP[\s\S]*Finance[\s\S]*Transfer[\s\S]*Registration/)
assert.match(clientPortalSource, /function buildSellerSaleProgressModel/)
assert.match(
  clientPortalSource,
  /const sellerProgressModel =[\s\S]*buildSellerSaleProgressModel\([\s\S]*buildSellerPortalProgressModelFromSharedJourney/,
  'completed seller document progress should hand off to the OTP / Finance / Transfer / Registration sale journey before the legacy onboarding rail',
)
assert.match(clientPortalSource, /sellerStageMeta/)

const sellerOnboardingSource = await fs.readFile(new URL('../src/pages/SellerOnboarding.jsx', import.meta.url), 'utf8')
assert.match(sellerOnboardingSource, /assignedAgentId/, 'seller onboarding submit notification should pass the assigned agent id when email is not on the listing payload')
assert.match(sellerOnboardingSource, /!hasValidAssignedAgentEmail && !assignedAgentId && !leadId && !listingId/, 'seller onboarding submit notification should still run when ids can resolve the agent email server-side')

const submittedEmailHandler = await fs.readFile(new URL('../../supabase/functions/send-email/handlers/sellerOnboardingSubmitted.ts', import.meta.url), 'utf8')
assert.match(submittedEmailHandler, /resolveAssignedAgentRecipient/, 'seller onboarding submitted email should resolve an agent recipient when no explicit to email is supplied')
assert.match(submittedEmailHandler, /\.from\("private_listings"\)/, 'seller onboarding submitted email should resolve recipients from the private listing')
assert.match(submittedEmailHandler, /\.from\("leads"\)/, 'seller onboarding submitted email should resolve recipients from the linked lead')
assert.match(submittedEmailHandler, /\.from\("profiles"\)/, 'seller onboarding submitted email should resolve recipients from the assigned agent profile')
assert.doesNotMatch(submittedEmailHandler, /Missing required field: to/, 'seller onboarding submitted email must not fail before server-side recipient resolution')

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { buildSellerJourney } = await server.ssrLoadModule('/src/services/sellerJourneyService.js')
  const { buildSellerPortalJourneyView } = await server.ssrLoadModule('/src/services/clientPortalWorkspaceService.js')
  const journey = buildSellerJourney({
    lead: {
      leadId: 'seller-portal-1',
      leadCategory: 'seller',
      sellerPropertyAddress: '7 Portal Road',
      sellerOnboardingToken: 'seller-token',
      sellerOnboardingStatus: 'completed',
      listingId: 'listing-portal-1',
      mandatePacketId: 'packet-portal-1',
      createdAt: '2026-06-01T08:00:00Z',
    },
    appointments: [
      {
        leadId: 'seller-portal-1',
        appointmentType: 'seller_valuation',
        status: 'completed',
        completedAt: '2026-06-02T08:00:00Z',
      },
    ],
    listing: {
      id: 'listing-portal-1',
      sellerLeadId: 'seller-portal-1',
      listingStatus: 'active',
      listingVisibility: 'active_market',
      mandateStatus: 'signed',
      createdAt: '2026-06-04T08:00:00Z',
      activatedAt: '2026-06-05T08:00:00Z',
    },
    mandatePacketStatus: {
      packet: { id: 'packet-portal-1', status: 'completed' },
      signingSummary: { allSignersSigned: true },
    },
    documents: [
      { id: 'doc-1', documentType: 'id', status: 'approved', url: '/id.pdf' },
      { id: 'doc-2', documentType: 'title_deed', status: 'uploaded', url: '/title.pdf' },
    ],
  })

  const portalView = buildSellerPortalJourneyView({
    journey,
    requiredDocuments: [
      { key: 'id', label: 'ID', status: 'approved', complete: true },
      { key: 'rates', label: 'Rates Account', status: 'required', complete: false },
    ],
    documents: [
      { id: 'doc-1', document_type: 'id', status: 'approved' },
    ],
    offers: [
      { id: 'offer-1', status: 'seller_review', amount: 2300000 },
      { id: 'offer-2', status: 'rejected', amount: 2100000 },
    ],
  })

  assert.equal(portalView.currentStage.key, 'listing_live')
  assert.equal(portalView.stageMeta.currentStage.key, 'listing_live')
  assert.equal(portalView.stageMeta.currentStage.message.includes('listing is live'), true)
  assert.equal(portalView.progressPercent, 88)
  assert.equal(portalView.stages.find((step) => step.key === 'mandate_signed').state, 'completed')
  assert.equal(portalView.statusCards.find((card) => card.key === 'mandate').value, 'Signed')
  assert.equal(portalView.statusCards.find((card) => card.key === 'listing').value, 'Live')
  assert.equal(portalView.statusCards.find((card) => card.key === 'documents').value, '1 Outstanding')
  assert.equal(portalView.statusCards.find((card) => card.key === 'offers').value, '1 Received')
  assert.equal(portalView.statusCards.find((card) => card.key === 'readiness').value, 'Listing Live')
  assert.equal(portalView.readiness.status, 'completed')
  assert.equal(portalView.documents.some((document) => document.status === 'Approved'), true)
} finally {
  await server.close()
}

console.log('seller portal alignment tests passed')
