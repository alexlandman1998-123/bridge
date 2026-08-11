import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const sources = {
  agentLeads: await readSource('src/pages/AgentLeadsPage.jsx'),
  agencyPipeline: await readSource('src/pages/agency/AgencyPipelinePage.jsx'),
  sellerOnboarding: await readSource('src/pages/SellerOnboarding.jsx'),
  clientPortal: await readSource('src/pages/ClientPortal.jsx'),
  transactionStageWorkspace: await readSource('src/components/client-portal/seller/TransactionStageWorkspace.jsx'),
  privateListingService: await readSource('src/services/privateListingService.js'),
  sellerDocumentRequirementsService: await readSource('src/services/sellerDocumentRequirementsService.js'),
  sellerOnboardingFactTransformer: await readSource('src/services/documents/sellerOnboardingFactTransformer.js'),
}

function assertIncludes(source, text, message) {
  assert.ok(source.includes(text), message)
}

function assertMatches(source, pattern, message) {
  assert.match(source, pattern, message)
}

assertIncludes(
  sources.agentLeads,
  'Send seller requests first',
  'Agent leads should retain seller-first viewing request guidance.',
)
assertIncludes(
  sources.agentLeads,
  "{ key: 'seller', label: 'Seller Profile' }",
  'Agent leads seller workspace should expose the Seller Profile tab.',
)
assertIncludes(
  sources.agentLeads,
  "{ key: 'listing_journey', label: 'Listing Journey' }",
  'Agent leads seller workspace should expose the Listing Journey tab.',
)
assertIncludes(
  sources.agentLeads,
  'function buildSellerProfileLeadSyncPatch',
  'Agent leads should keep seller profile lead/contact sync logic.',
)
assertIncludes(
  sources.agentLeads,
  'await updatePrivateListingOnboardingFormData(listingId, formPatch',
  'Agent leads should persist seller profile edits to private listing onboarding data.',
)
assertIncludes(
  sources.agentLeads,
  'await updateAgencyCrmContactRecord(organisationId, contactId, contactPatch)',
  'Agent leads should sync seller profile edits back to CRM contacts.',
)

assertIncludes(
  sources.agencyPipeline,
  ": 'Contact Seller First'",
  'Agency pipeline seller leads should preserve the Contact Seller First primary action.',
)
assertIncludes(
  sources.agencyPipeline,
  "label: 'Track Seller Onboarding'",
  'Agency pipeline should expose the seller onboarding tracking action.',
)
assertIncludes(
  sources.agencyPipeline,
  "{ key: 'seller', label: 'Seller Profile', meta: '' }",
  'Agency pipeline seller workspace should expose the Seller Profile tab.',
)
assertIncludes(
  sources.agencyPipeline,
  "{ key: 'listing_journey', label: 'Listing Journey', meta: '' }",
  'Agency pipeline seller workspace should expose the Listing Journey tab.',
)
assertIncludes(
  sources.agencyPipeline,
  'buyer_viewing_planner_seller_first',
  'Agency pipeline should preserve seller-first buyer viewing request telemetry.',
)
assertIncludes(
  sources.agencyPipeline,
  'Log the first seller contact so the journey can move to onboarding.',
  'Agency pipeline should keep the first seller contact logging workspace.',
)

assertIncludes(
  sources.sellerOnboarding,
  'Secure seller onboarding',
  'Seller onboarding should keep the branded secure onboarding shell.',
)
assertIncludes(
  sources.sellerOnboarding,
  'const factValidation = validateSellerOnboardingFacts',
  'Seller onboarding should validate canonical seller facts before submit.',
)
assertIncludes(
  sources.sellerOnboarding,
  'Please finish the required items before submitting',
  'Seller onboarding should block incomplete required seller facts.',
)

assertIncludes(
  sources.clientPortal,
  'Complete seller onboarding',
  'Client portal seller workspace should retain the seller onboarding action.',
)
assertIncludes(
  sources.clientPortal,
  '<TransactionStageWorkspace',
  'Client portal should render the seller transaction stage workspace.',
)
assertIncludes(
  sources.clientPortal,
  'sellerPortalAccessToken',
  'Client portal should preserve seller portal token handling.',
)

assertIncludes(
  sources.transactionStageWorkspace,
  'Capturing the sale agreement',
  'Seller transaction stage workspace should describe sale agreement capture.',
)
assertIncludes(
  sources.transactionStageWorkspace,
  'Confirming seller and buyer details',
  'Seller transaction stage workspace should describe seller/buyer detail confirmation.',
)

assertIncludes(
  sources.privateListingService,
  'function deferSellerOnboardingFollowUp',
  'Private listing service should keep deferred seller onboarding follow-up handling.',
)
assertIncludes(
  sources.privateListingService,
  'seller onboarding progress',
  'Private listing service should keep seller onboarding progress projection handling.',
)
assertIncludes(
  sources.privateListingService,
  'sellerFirstName',
  'Private listing service should keep seller first-name form mapping.',
)

assertIncludes(
  sources.sellerDocumentRequirementsService,
  "'seller_contact_confirmation'",
  'Seller document requirements should include seller contact confirmation.',
)
assertMatches(
  sources.sellerDocumentRequirementsService,
  /buildKingstonsSellerDocumentRequirementPack/,
  'Seller document requirements should preserve Kingstons seller requirement pack generation.',
)

assertIncludes(
  sources.sellerOnboardingFactTransformer,
  'Seller name is required.',
  'Seller onboarding fact transformer should require seller names.',
)
assertIncludes(
  sources.sellerOnboardingFactTransformer,
  'Property Disclosure declaration is required before seller onboarding can be completed.',
  'Seller onboarding fact transformer should require the Property Disclosure declaration.',
)

console.log('forward-port seller workspace Phase 3 checks passed')
