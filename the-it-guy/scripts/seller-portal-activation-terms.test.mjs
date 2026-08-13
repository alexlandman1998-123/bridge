import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

import {
  buildSellerPortalActivationTermsAcceptance,
  getSellerPortalActivationTermsConfig,
  SELLER_PORTAL_ACTIVATION_TERMS_VERSION,
} from '../src/lib/sellerPortalActivationTerms.js'

const clientPortalPage = await fs.readFile(new URL('../src/pages/ClientPortal.jsx', import.meta.url), 'utf8')
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

assert.match(wordingMigration, /'seller'[\s\S]*'seller-platform-fee-v1'/)
assert.match(migration, /p_acceptance ->> 'feeAmount'[\s\S]*p_acceptance ->> 'fee_amount'/)
assert.match(migration, /v_terms_version is distinct from v_wording\.wording_version/)
assert.match(clientPortalPage, /getSellerPortalActivationTermsConfig/)
assert.match(clientPortalPage, /buildSellerPortalActivationTermsAcceptance\(\{[\s\S]*acceptedAt,[\s\S]*acceptedByEmail:/)
assert.doesNotMatch(clientPortalPage, /buildArch9SellerTermsAcceptance/)

console.log('seller portal activation terms checks passed')
