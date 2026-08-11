import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { createBuyerOfferBrandingResponse } from '../server/services/buyerOfferBrandingApi.js'

const files = {
  buyerOfferBrandingApi: await readFile(new URL('../server/services/buyerOfferBrandingApi.js', import.meta.url), 'utf8'),
  buyerOfferBrandingRoute: await readFile(new URL('../api/public/buyer-offer-branding.js', import.meta.url), 'utf8'),
  buyerVerificationSubmission: await readFile(new URL('../src/pages/BuyerOfferSubmission.jsx', import.meta.url), 'utf8'),
  viteConfig: await readFile(new URL('../vite.config.js', import.meta.url), 'utf8'),
  packageJson: await readFile(new URL('../package.json', import.meta.url), 'utf8'),
}

assert.match(files.buyerOfferBrandingApi, /from\('offers'\)[\s\S]*offer_token/, 'buyer offer branding must resolve branding from the offer token')
assert.match(files.buyerOfferBrandingApi, /buyerOfferLinkIsActive/, 'buyer offer branding must validate token-scoped offer state before exposing branding')
assert.match(files.buyerOfferBrandingApi, /from\('organisation_settings'\)[\s\S]*settings_json/, 'buyer offer branding must read organisation settings CI')
assert.match(files.buyerOfferBrandingApi, /from\('organisation_branding'\)/, 'buyer offer branding should preserve organisation branding row fallback')
assert.match(files.buyerOfferBrandingApi, /resolveOnboardingBranding\([\s\S]*branding,[\s\S]*organisationBranding,[\s\S]*settingsBranding,[\s\S]*settings/, 'buyer offer branding must use the shared onboarding branding resolver')
assert.match(files.buyerOfferBrandingApi, /createSignedUrl\(normalizedPath, 60 \* 60 \* 24 \* 7\)/, 'buyer offer branding must mint fresh URLs for stored logo paths')
assert.match(files.buyerOfferBrandingRoute, /createBuyerOfferBrandingResponse/, 'buyer offer branding route should delegate to the token-scoped API service')
assert.match(files.viteConfig, /server\.middlewares\.use\('\/api\/public\/buyer-offer-branding'/, 'local dev server should expose the buyer offer branding API')
assert.match(files.buyerVerificationSubmission, /fetchBuyerVerificationBrandingSnapshot/, 'buyer verification submission should fetch token-scoped branding')
assert.match(files.buyerVerificationSubmission, /resolveOnboardingBranding\(verificationBrandingSnapshot \|\| \{\}, conditions, listing \|\| \{\}, invite \|\| \{\}\)/, 'live settings branding should be merged before embedded invite fallbacks')
assert.match(files.buyerVerificationSubmission, /agencyLogo=\{verificationBrand\.logoDarkUrl \|\| verificationBrand\.logoLightUrl \|\| verificationBrand\.logoIconUrl \|\| ''\}/, 'buyer verification landing should render the resolved organisation logo')
assert.match(files.buyerVerificationSubmission, /data-testid="buyer-offer-action-dock"/, 'buyer verification page should preserve the legacy mobile action dock test hook')
assert.match(files.buyerVerificationSubmission, /data-testid="buyer-offer-action-summary"[^>]*hidden[^>]*sm:grid/, 'buyer verification mobile action dock should hide the amount summary on narrow screens')
assert.match(files.buyerVerificationSubmission, /pb-\[calc\(8rem\+env\(safe-area-inset-bottom\)\)\]/, 'buyer verification page should reserve mobile bottom space for the fixed action dock')
assert.match(files.packageJson, /"test:buyer-offer-branding-regression": "node scripts\/buyer-offer-branding-regression\.test\.mjs"/)

const optionsResponse = await createBuyerOfferBrandingResponse({ method: 'OPTIONS' })
assert.equal(optionsResponse.status, 204)
assert.equal(optionsResponse.body, null)

const missingTokenResponse = await createBuyerOfferBrandingResponse({ method: 'GET', url: '/api/public/buyer-offer-branding' })
assert.equal(missingTokenResponse.status, 400)
assert.equal(missingTokenResponse.body.error, 'token_required')

const methodResponse = await createBuyerOfferBrandingResponse({ method: 'POST', url: '/api/public/buyer-offer-branding?token=abc' })
assert.equal(methodResponse.status, 405)
assert.equal(methodResponse.body.error, 'method_not_allowed')

console.log('Buyer offer branding regression contract passed.')
