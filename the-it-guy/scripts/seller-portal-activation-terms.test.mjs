import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import {
  buildSellerPortalActivationTermsAcceptance,
  getSellerPortalActivationTermsConfig,
  normalizeSellerPortalActivationTermsConfig,
  SELLER_PORTAL_ACTIVATION_TERMS_VERSION,
} from '../src/lib/sellerPortalActivationTerms.js'

const clientPortalPage = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
const privateListingService = await fs.readFile(
  new URL('../src/services/privateListingService.js', import.meta.url),
  'utf8',
)
const migration = await fs.readFile(
  new URL('../../supabase/migrations/202607280001_seller_portal_activation_lifecycle.sql', import.meta.url),
  'utf8',
)
const wordingMigration = await fs.readFile(
  new URL('../../supabase/migrations/202607270006_arch9_transaction_platform_fee_consent.sql', import.meta.url),
  'utf8',
)

const config = getSellerPortalActivationTermsConfig()
const acceptedAt = '2026-08-13T14:31:00.000Z'
const acceptance = buildSellerPortalActivationTermsAcceptance({
  acceptedAt,
  acceptedByEmail: 'seller@example.com',
})
const liveConfig = normalizeSellerPortalActivationTermsConfig({
  title: 'Updated Seller Platform Fee',
  body: 'Updated seller fee wording.',
  checkbox_label: 'I accept the updated wording.',
  fee_amount: '875.00',
  currency: 'ZAR',
  wording_version: 'seller-platform-fee-v2',
})
const liveAcceptance = buildSellerPortalActivationTermsAcceptance({
  termsConfig: liveConfig,
  acceptedAt,
  acceptedByEmail: 'seller@example.com',
})

assert.equal(config.wordingVersion, 'seller-platform-fee-v1')
assert.equal(SELLER_PORTAL_ACTIVATION_TERMS_VERSION, 'seller-platform-fee-v1')
assert.equal(acceptance.accepted, true)
assert.equal(acceptance.acceptedAt, acceptedAt)
assert.equal(acceptance.accepted_at, acceptedAt)
assert.equal(acceptance.wordingVersion, 'seller-platform-fee-v1')
assert.equal(acceptance.wording_version, 'seller-platform-fee-v1')
assert.equal(acceptance.feeAmount, '750.00')
assert.equal(acceptance.fee_amount, '750.00')
assert.equal(acceptance.currency, 'ZAR')
assert.equal(acceptance.privacyPolicyVersion, 'arch9-seller-terms-popi-v1')
assert.equal(acceptance.acceptedByEmail, 'seller@example.com')
assert.equal(liveAcceptance.wordingVersion, 'seller-platform-fee-v2')
assert.equal(liveAcceptance.wording_version, 'seller-platform-fee-v2')
assert.equal(liveAcceptance.feeAmount, '875.00')
assert.equal(liveAcceptance.fee_amount, '875.00')
assert.equal(liveAcceptance.wordingSnapshot, 'Updated seller fee wording.')
assert.equal(liveAcceptance.checkboxLabel, 'I accept the updated wording.')
assert.equal(liveAcceptance.termsConfig, undefined)

assert.match(wordingMigration, /'seller'[\s\S]*'seller-platform-fee-v1'/)
assert.match(migration, /p_acceptance ->> 'feeAmount'[\s\S]*p_acceptance ->> 'fee_amount'/)
assert.match(migration, /v_terms_version is distinct from v_wording\.wording_version/)
assert.match(privateListingService, /function fetchSellerPortalActivationTermsConfig/)
assert.match(privateListingService, /transaction_consent_wording_versions/)
assert.match(privateListingService, /order\('effective_at', \{ ascending: false \}\)/)
assert.match(clientPortalPage, /getSellerPortalActivationTermsConfig/)
assert.match(clientPortalPage, /fetchSellerPortalActivationTermsConfig/)
assert.match(clientPortalPage, /buildSellerPortalActivationTermsAcceptance\(\{[\s\S]*acceptedAt,[\s\S]*acceptedByEmail:/)
assert.match(clientPortalPage, /termsConfig=\{sellerPortalTermsConfig\}/)
assert.match(clientPortalPage, /termsConfigForAcceptance = await fetchSellerPortalActivationTermsConfig\(\)/)
assert.match(clientPortalPage, /termsConfig: termsConfigForAcceptance/)
assert.match(clientPortalPage, /portalLoadRequestRef = useRef\(0\)/)
assert.match(clientPortalPage, /sellerPortalAccessTokenOverride = ''/)
assert.match(clientPortalPage, /sellerPortalAccessToken: isSellerPortalToken \? effectiveSellerPortalAccessToken : ''/)
assert.match(clientPortalPage, /if \(!isCurrentLoad\(\)\) return/)
assert.match(clientPortalPage, /loadPortal\(\{ sellerPortalAccessTokenOverride: accessToken \}\)/)
assert.doesNotMatch(clientPortalPage, /buildArch9SellerTermsAcceptance/)

console.log('seller portal activation terms checks passed')
