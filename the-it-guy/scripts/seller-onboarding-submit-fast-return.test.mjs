import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202607310001_seller_onboarding_submit_fast_return.sql', import.meta.url),
  'utf8',
)
const privateListingService = await readFile(
  new URL('../src/services/privateListingService.js', import.meta.url),
  'utf8',
)
const sellerOnboardingPage = await readFile(
  new URL('../src/pages/SellerOnboarding.jsx', import.meta.url),
  'utf8',
)
const sellerOnboardingCoreApi = await readFile(
  new URL('../server/services/sellerOnboardingCoreApi.js', import.meta.url),
  'utf8',
)

assert.match(
  migration,
  /create or replace function public\.bridge_complete_private_listing_seller_onboarding\(/,
  'migration should replace the seller onboarding completion RPC',
)
assert.match(
  migration,
  /return jsonb_build_object\([\s\S]*?'listing', to_jsonb\(v_listing\),[\s\S]*?'onboarding', to_jsonb\(v_onboarding\) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash'[\s\S]*?'requirements', '\[\]'::jsonb,[\s\S]*?'documents', '\[\]'::jsonb,[\s\S]*?'appointments', '\[\]'::jsonb,/,
  'seller onboarding submit should return a minimal payload after core writes',
)
assert.doesNotMatch(
  migration,
  /bridge_private_listing_seller_portal_core_payload\(p_token\)/,
  'seller onboarding submit should not depend on optional core payload enrichment',
)
assert.doesNotMatch(
  migration,
  /return public\.bridge_private_listing_seller_portal_payload\(p_token\);/,
  'seller onboarding submit must not depend on the heavy portal payload enrichment',
)
assert.match(
  privateListingService,
  /function mapSellerClientPortalPayload\(payload\)[\s\S]*?const requirements = normalizeRequirementRows\(Array\.isArray\(payload\?\.requirements\) \? payload\.requirements : \[\]\)/,
  'client submit mapper should tolerate the empty requirements array returned by core payload',
)
assert.match(
  privateListingService,
  /function isRecoverableSellerPortalPayloadRpcError\(error\)[\s\S]*?isStatementTimeoutError\(error\)/,
  'seller onboarding payload lookups should treat statement timeouts as recoverable and fall back to the lightweight lookup',
)
assert.match(
  privateListingService,
  /function recoverSellerOnboardingSubmitAfterTimeout\(token, timeoutError\)[\s\S]*?getSellerOnboardingByToken\(normalizedToken, \{[\s\S]*?includeRequirementsAndDocuments: false,[\s\S]*?corePayload: true,[\s\S]*?\}\)/,
  'seller onboarding submit should re-read the lightweight payload after a statement timeout before surfacing an error',
)
assert.match(
  privateListingService,
  /if \(isStatementTimeoutError\(rpc\.error\)\) \{[\s\S]*?recoverSellerOnboardingSubmitAfterTimeout\(normalizedToken, rpc\.error\)[\s\S]*?return recoveredContext/,
  'seller onboarding submit should accept a recovered completed context after a timeout',
)
assert.match(
  sellerOnboardingPage,
  /getSellerOnboardingByToken\(token, \{[\s\S]*?includeRequirementsAndDocuments: false,[\s\S]*?corePayload: true,[\s\S]*?\}\)/,
  'seller onboarding page should use the lightweight core payload on initial load',
)
assert.match(
  sellerOnboardingPage,
  /message\.toLowerCase\(\)\.includes\('statement timeout'\)[\s\S]*?refresh once/,
  'seller onboarding page should not show raw database statement timeout wording',
)
assert.match(
  sellerOnboardingPage,
  /catch \(loadError\) \{[\s\S]*?isSellerOnboardingTimeoutError\(loadError\)[\s\S]*?setError\('The onboarding service took too long to load this link\. Please refresh in a moment\.'\)[\s\S]*?return/,
  'seller onboarding page should not convert load-time statement timeouts into invalid-link errors',
)
assert.match(
  privateListingService,
  /fetchSellerOnboardingCoreApiPayload\(normalizedToken, \{[\s\S]*?onboardingId: query\.data\.id[\s\S]*?listingId: query\.data\.private_listing_id/,
  'seller onboarding should use the Vercel core API fallback with token-scoped onboarding identifiers',
)
assert.match(
  privateListingService,
  /\/api\/public\/seller-onboarding-core\?\$\{params\.toString\(\)\}/,
  'seller onboarding core API fallback should call the token-scoped public endpoint with encoded query params',
)
assert.match(
  sellerOnboardingCoreApi,
  /seller_portal_password_hash[\s\S]*?seller_portal_access_token_hash[\s\S]*?seller_portal_invite_token_hash/,
  'seller onboarding core API must strip portal secret hashes from the response',
)
assert.match(
  sellerOnboardingCoreApi,
  /resolveSellerOnboarding\(client, token, \{ onboardingId, listingId \}\)[\s\S]*?maybeSingle\(client, 'private_listings', '\*', 'id', onboarding\.private_listing_id\)/,
  'seller onboarding core API must resolve the listing only after a valid token-scoped onboarding row',
)
assert.match(
  sellerOnboardingCoreApi,
  /tokenMatchesOnboarding\(onboarding, normalizedToken\)[\s\S]*?normalizedListingId && normalizeText\(onboarding\.private_listing_id\) !== normalizedListingId/,
  'seller onboarding core API must verify provided onboarding/listing identifiers against the token',
)

console.log('seller onboarding submit fast-return contract ok')
