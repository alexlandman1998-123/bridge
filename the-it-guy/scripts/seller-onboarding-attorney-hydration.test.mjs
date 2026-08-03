import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)

const privateListingService = await fs.readFile(new URL('src/services/privateListingService.js', appRoot), 'utf8')
const sellerOnboardingPage = await fs.readFile(new URL('src/pages/SellerOnboarding.jsx', appRoot), 'utf8')

assert.match(
  sellerOnboardingPage,
  /getSellerOnboardingByToken\(token,\s*\{[\s\S]*corePayload: true/,
  'Seller onboarding page should load through the core portal payload path.',
)
assert.match(
  privateListingService,
  /function fetchSellerPortalOnboardingRowByToken\(client, token = '', listingId = ''\)/,
  'Seller portal onboarding loads should be able to read the persisted token row.',
)
assert.match(
  privateListingService,
  /\.eq\('seller_portal_token', normalizedToken\)|\['seller_portal_token', normalizedToken\]/,
  'Stable seller portal links should be looked up by seller_portal_token, not only the legacy token column.',
)
assert.match(
  privateListingService,
  /function mergeSellerPortalOnboardingFormData\(context = null, persistedOnboarding = null\)/,
  'Core portal payloads should merge persisted onboarding form data back into the page context.',
)
assert.match(
  privateListingService,
  /const mergedFormData = \{[\s\S]*\.\.\.persistedFormData[\s\S]*\.\.\.getSellerOnboardingFormData\(contextOnboarding\)[\s\S]*\.\.\.getSellerOnboardingFormData\(listingOnboarding\)[\s\S]*\}/,
  'Persisted form data should seed the merge so trimmed RPC payloads do not drop setup fields.',
)
assert.match(
  privateListingService,
  /formData: mergedFormData/,
  'The seller page should receive hydrated formData after the merge.',
)
assert.match(
  privateListingService,
  /fetchSellerPortalOnboardingRowByToken\(client, normalizedToken, portalPayload\.listing\.id\)/,
  'The core payload path should hydrate from the persisted onboarding row before returning.',
)
assert.match(
  privateListingService,
  /resolveSellerOnboardingBrandingSnapshot\(client, normalizedToken, hydratedPortalPayload\.listing\)/,
  'Branding and media should be applied after attorney hydration, not to the stripped payload.',
)

console.log('Seller onboarding attorney hydration checks passed.')
