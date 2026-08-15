import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const files = {
  unitDetail: await readFile(new URL('../src/pages/UnitDetail.jsx', import.meta.url), 'utf8'),
  sellerActivation: await readFile(new URL('../src/services/sellerPortalActivationService.js', import.meta.url), 'utf8'),
  privateListing: await readFile(new URL('../src/services/privateListingService.js', import.meta.url), 'utf8'),
  listingDetail: await readFile(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8'),
  listings: await readFile(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8'),
  agencyPipeline: await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8'),
  legalWorkspace: await readFile(new URL('../src/pages/LegalDocumentWorkspacePage.jsx', import.meta.url), 'utf8'),
  packageJson: JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')),
}

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Unit workspace buyer portal and onboarding actions use the canonical buyer access policy', () => {
  assert.match(files.unitDetail, /resolveBuyerAccessPolicy/)
  assert.match(files.unitDetail, /const buyerClientAccessPolicy = resolveBuyerAccessPolicy/)
  assert.match(files.unitDetail, /const kingstonsBuyerPortalLinksDisabled = !buyerPortalAccessDecision\.enabled/)
  assert.match(files.unitDetail, /const kingstonsBuyerOnboardingLinksDisabled = !buyerOnboardingAccessDecision\.enabled/)
  assert.match(files.unitDetail, /throw new Error\(buyerPortalAccessDecisionReason\)/)
  assert.match(files.unitDetail, /setError\(buyerOnboardingAccessDecisionReason\)/)
})

test('Seller portal activation service blocks non-lead invites until signed mandate evidence is uploaded', () => {
  assert.match(files.sellerActivation, /resolveSellerAccessPolicy/)
  assert.match(files.sellerActivation, /getPrivateListing\(listingId, \{ includeRequirementsAndDocuments: true \}\)/)
  assert.match(files.sellerActivation, /source !== SELLER_PORTAL_ACTIVATION_SOURCES\.sellerLead/)
  assert.match(files.sellerActivation, /sellerAccessPolicy\.actions\.activatePortal/)
  assert.match(files.sellerActivation, /error\.policyDecision = activationDecision/)
})

test('Private listing readiness delegates signed mandate evidence to the canonical policy', () => {
  assert.match(files.privateListing, /hasSignedMandateEvidence/)
  assert.doesNotMatch(files.privateListing, /SELLER_PORTAL_INVITE_READY_AFTER_MANDATE_SIGNED_STATUS_KEYS/)
  assert.match(files.privateListing, /return hasSignedMandateEvidence\(/)
})

test('Existing listing Seller Portal modal no longer has a physical-documents-held bypass', () => {
  assert.doesNotMatch(files.listingDetail, /physicalDocumentsHeld/)
  assert.match(files.listingDetail, /Upload the signed mandate before activating the Seller Portal\./)
  assert.match(files.listingDetail, /disabled=\{sellerPortalActivationSending \|\| !sellerPortalMandateEvidenceReady\}/)
})

test('Quick Add copy no longer presents mandate signing as a seller portal task', () => {
  assert.match(files.listings, /Available after the signed mandate upload is saved\./)
  assert.match(files.listings, /Track the uploaded mandate status/)
  assert.doesNotMatch(files.listings, /Complete\/sign mandate where applicable/)
})

test('Digital mandate signing sends are retired in pipeline and legal workspace handlers', () => {
  assert.match(files.agencyPipeline, /resolveSellerAccessPolicy/)
  assert.match(files.agencyPipeline, /actions\.sendMandateSigningLink/)
  assert.match(files.agencyPipeline, /getClientAccessPolicyMessage\(mandateSigningDecision\.reason\)/)
  assert.match(files.legalWorkspace, /resolveSellerAccessPolicy/)
  assert.match(files.legalWorkspace, /actions\.sendMandateSigningLink/)
  assert.match(files.legalWorkspace, /getClientAccessPolicyMessage\(mandateSigningDecision\.reason\)/)
})

test('package exposes the Phase 2 integration regression', () => {
  assert.equal(
    files.packageJson.scripts?.['test:client-access-policy-phase2'],
    'node scripts/client-access-policy-phase2-integration.test.mjs',
  )
})

console.log('client access policy phase 2 integration tests passed')
