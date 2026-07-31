import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(
  new URL('../../supabase/migrations/202607310001_seller_onboarding_submit_fast_return.sql', import.meta.url),
  'utf8',
)
const progressMigration = await readFile(
  new URL('../../supabase/migrations/202607310007_seller_onboarding_progress_fast_return.sql', import.meta.url),
  'utf8',
)
const privateListingService = await readFile(
  new URL('../src/services/privateListingService.js', import.meta.url),
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
  progressMigration,
  /create or replace function public\.bridge_update_private_listing_seller_onboarding_progress\(/,
  'migration should replace the seller onboarding progress RPC',
)
assert.match(
  progressMigration,
  /return jsonb_build_object\([\s\S]*?'listing', (?:to_jsonb\(v_listing\)|jsonb_build_object\([\s\S]*?'id', v_listing\.id,[\s\S]*?'updated_at', v_listing\.updated_at[\s\S]*?\)),[\s\S]*?'onboarding', to_jsonb\(v_onboarding\) - 'seller_portal_password_hash' - 'seller_portal_access_token_hash' - 'seller_portal_invite_token_hash'[\s\S]*?'requirements', '\[\]'::jsonb,[\s\S]*?'documents', '\[\]'::jsonb,[\s\S]*?'appointments', '\[\]'::jsonb,/,
  'seller onboarding progress should return only the core payload after draft writes',
)
assert.doesNotMatch(
  progressMigration,
  /return public\.bridge_private_listing_seller_portal_payload\(p_token\)/,
  'seller onboarding progress must not depend on the heavy portal payload enrichment',
)
assert.match(
  privateListingService,
  /void syncPrivateListingRequirements\(rpcContext\.listing,[\s\S]*?reason: 'seller_onboarding_progress'/,
  'progress requirement enrichment should not block the save response',
)

console.log('seller onboarding submit fast-return contract ok')
