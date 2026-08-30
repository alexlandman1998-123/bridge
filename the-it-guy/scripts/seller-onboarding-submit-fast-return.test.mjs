import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/20260829204153_seller_onboarding_completion_receipt_and_projection_rls.sql', import.meta.url),
  'utf8',
)
const progressMigration = await readFile(
  new URL('../../supabase/migrations/202608010001_seller_onboarding_progress_fast_return.sql', import.meta.url),
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
  /return jsonb_build_object\(\s*'onboardingId', v_onboarding\.id,\s*'listingId', v_listing\.id,\s*'status', v_onboarding\.status,\s*'submittedAt', v_onboarding\.submitted_at\s*\)/,
  'seller onboarding submit should return only the four-field completion receipt',
)
assert.doesNotMatch(migration, /'listing', to_jsonb\(v_listing\)|'onboarding', to_jsonb\(v_onboarding\)/, 'completion receipt must not return full rows')
assert.match(migration, /bridge_sanitize_seller_onboarding_form_data[\s\S]*?'generatedDocument'[\s\S]*?'seller_compliance_signers'/, 'completion should strip generated artifacts and duplicate compliance aliases')
assert.match(migration, /canonical_facts_json = v_canonical_facts[\s\S]*?seller_canonical_facts_json = v_canonical_facts/, 'token RPC should own both canonical projections that anonymous RLS rejected')
assert.match(migration, /insert into public\.listing_publication_data[\s\S]*?on conflict \(listing_id\) do update/, 'token RPC should own the publication projection that anonymous RLS rejected')
assert.match(migration, /create or replace function public\.bridge_get_private_listing_seller_onboarding_completion\(/, 'migration should add a lightweight completion recovery RPC')
assert.match(migration, /revoke all on function public\.bridge_complete_private_listing_seller_onboarding[\s\S]*?from public;[\s\S]*?grant execute[\s\S]*?to anon, authenticated;/, 'completion RPC must expose only explicit token-scoped execute access')
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
  progressMigration,
  /create or replace function public\.bridge_update_private_listing_seller_onboarding_progress\(/,
  'migration should replace the seller onboarding progress RPC',
)
assert.match(
  progressMigration,
  /return jsonb_build_object\([\s\S]*?'listing', to_jsonb\(v_listing\),[\s\S]*?'onboarding', to_jsonb\(v_onboarding\) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash'[\s\S]*?'requirements', '\[\]'::jsonb,[\s\S]*?'documents', '\[\]'::jsonb,[\s\S]*?'appointments', '\[\]'::jsonb,/,
  'seller onboarding progress should return a minimal payload after core draft writes',
)
assert.doesNotMatch(
  progressMigration,
  /return public\.bridge_private_listing_seller_portal_payload\(p_token\);/,
  'seller onboarding progress must not depend on the heavy portal payload enrichment',
)
assert.match(
  privateListingService,
  /function mapSellerClientPortalPayload\(payload\)[\s\S]*?const requirements = normalizeRequirementRows\(Array\.isArray\(payload\?\.requirements\) \? payload\.requirements : \[\]\)/,
  'client submit mapper should tolerate the empty requirements array returned by core payload',
)
assert.match(
  privateListingService,
  /function deferSellerOnboardingFollowUp\(label, task\)[\s\S]*?Promise\.resolve\(\)[\s\S]*?\.then\(task\)[\s\S]*?console\.warn\(`\[Private Listings\] \$\{label\} skipped`, error\)/,
  'seller onboarding follow-ups should be scheduled outside the save/submit hot path',
)
assert.match(
  privateListingService,
  /function enqueueSellerOnboardingProgressProjection\(client, \{[\s\S]*?enqueueKeyedOperation\(sellerOnboardingProjectionQueues, listingId, async \(\) => \{[\s\S]*?persistCanonicalSellerFactPayload\(client,[\s\S]*?syncPrivateListingRequirements\(listing,[\s\S]*?maybeResolveCanonicalSellerRequirements\(/,
  'seller onboarding draft projections should be queued per listing without blocking the save response',
)
assert.match(
  privateListingService,
  /void enqueueSellerOnboardingProgressProjection\(client, \{[\s\S]*?listing: rpcContext\.listing,[\s\S]*?reason: 'seller_onboarding_progress'/,
  'seller onboarding draft saves should queue projection work after the RPC returns',
)
assert.match(
  privateListingService,
  /void enqueueSellerOnboardingProgressProjection\(client, \{[\s\S]*?listing: listingForProgress,[\s\S]*?reason: 'seller_onboarding_progress_fallback'/,
  'seller onboarding fallback draft saves should queue projection work after the direct update returns',
)
assert.match(privateListingService, /SELLER_ONBOARDING_COMPLETION_TIMEOUT_MS = 12_000[\s\S]*?bridge_complete_private_listing_seller_onboarding[\s\S]*?\.abortSignal\(timeout\.signal\)/, 'completion RPC should have a 12-second client timeout')
assert.match(privateListingService, /SELLER_ONBOARDING_RECOVERY_TIMEOUT_MS = 3_000[\s\S]*?fetchSellerOnboardingCompletionReceipt[\s\S]*?bridge_get_private_listing_seller_onboarding_completion/, 'timeout recovery should use the lightweight completion receipt')
assert.match(privateListingService, /sanitizeSellerOnboardingCompletionFormData[\s\S]*?delete sanitized\[key\]/, 'client should sanitize completion form data before transport')
assert.doesNotMatch(
  privateListingService.match(/if \(!rpc\.error\) \{[\s\S]*?return rpcContext\n  \}/)?.[0] || '',
  /persistCanonicalSellerFactPayload|syncSellerOnboardingPublicationDraft|syncSellerJourneyLeadStage/,
  'successful completion must not repeat the RLS-sensitive projections in the browser',
)
assert.match(
  privateListingService,
  /function isRecoverableSellerPortalPayloadRpcError\(error\)[\s\S]*?isStatementTimeoutError\(error\)/,
  'seller onboarding payload lookups should treat statement timeouts as recoverable and fall back to the lightweight lookup',
)
assert.match(
  privateListingService,
  /bridge_update_private_listing_seller_onboarding_progress[\s\S]*?!isStatementTimeoutError\(rpc\.error\)[\s\S]*?throw rpc\.error/,
  'seller onboarding progress should fall back to the direct update path when the progress RPC times out',
)
assert.match(
  privateListingService,
  /function fetchSellerOnboardingProgressFallbackContext\(client, token\)[\s\S]*?fetchSellerOnboardingCoreApiPayload\(normalizedToken, \{[\s\S]*?onboardingId: query\.data\.id[\s\S]*?listingId: query\.data\.private_listing_id/,
  'seller onboarding progress fallback should use the fast token-scoped API context before heavy portal payload lookups',
)
assert.match(
  privateListingService,
  /fetchSellerOnboardingProgressFallbackContext\(client, normalizedToken\) \|\|[\s\S]*?getSellerOnboardingByToken\(token, \{ includeRequirementsAndDocuments: false \}\)/,
  'seller onboarding progress should only use the heavier onboarding lookup if the fast context is unavailable',
)
assert.match(
  privateListingService,
  /getPrivateListing\(context\.listing\.id, \{ includeRequirementsAndDocuments: false \}\)[\s\S]*?catch\(\(listingError\)/,
  'seller onboarding progress fallback should not fail a saved draft when listing refresh enrichment fails',
)
assert.match(
  privateListingService,
  /if \(isSellerOnboardingCompletionTimeoutError\(rpc\.error\)\) \{[\s\S]*?recoverSellerOnboardingSubmitAfterTimeout\(client, normalizedToken, rpc\.error,[\s\S]*?return recoveredContext/,
  'seller onboarding submit should accept a recovered completed context after a timeout',
)
assert.doesNotMatch(sellerOnboardingPage, /generatedDocument: disclosureDocument/, 'submit must not embed generated disclosure HTML in form_data')
assert.match(sellerOnboardingPage, /submitSellerOnboarding\(token, \{[\s\S]*?listingSnapshot: listing,/, 'submit should build the immediate UI result from the already-loaded listing')
assert.match(
  sellerOnboardingPage,
  /getSellerOnboardingByToken\(token, \{[\s\S]*?includeRequirementsAndDocuments: false,[\s\S]*?corePayload: true,[\s\S]*?\}\)/,
  'seller onboarding page should use the lightweight core payload on initial load',
)
assert.match(
  sellerOnboardingPage,
  /function resolveSellerOnboardingSubmitError\(error\)[\s\S]*?isSellerOnboardingTimeoutError\(error\)[\s\S]*?refresh once/,
  'seller onboarding page should not show raw database statement timeout wording',
)
assert.match(
  sellerOnboardingPage,
  /catch \(loadError\) \{[\s\S]*?isSellerOnboardingTimeoutError\(loadError\)[\s\S]*?setError\('The onboarding service took too long to load this link\. Please refresh in a moment\.'\)[\s\S]*?return/,
  'seller onboarding page should not convert load-time statement timeouts into invalid-link errors',
)
assert.match(
  sellerOnboardingPage,
  /function resolveSellerOnboardingDraftError\(error\)[\s\S]*?isSellerOnboardingTimeoutError\(error\)[\s\S]*?The onboarding service took too long to save your draft/,
  'seller onboarding draft save should not show raw statement-timeout errors to sellers',
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
