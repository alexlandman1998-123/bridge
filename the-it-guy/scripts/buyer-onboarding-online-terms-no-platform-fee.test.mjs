import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const consentSource = await readFile(new URL('../src/lib/platformFeeConsent.js', import.meta.url), 'utf8')
const onboardingSource = await readFile(new URL('../src/pages/ClientOnboarding.jsx', import.meta.url), 'utf8')
const apiSource = await readFile(new URL('../src/lib/api.js', import.meta.url), 'utf8')

const buyerConsentConfig = consentSource.match(/buyer:\s*Object\.freeze\(\{[\s\S]*?\n\s*\}\),/)
assert.ok(buyerConsentConfig, 'buyer consent config should remain explicit')

assert.match(
  buyerConsentConfig[0],
  /title:\s*'Online Terms and Transaction Permissions'/,
  'buyer onboarding consent should be online terms and permissions, not a platform fee heading',
)

assert.match(
  buyerConsentConfig[0],
  /consentType:\s*BUYER_ONBOARDING_TERMS_CONSENT_TYPE/,
  'buyer onboarding should store a terms consent type instead of the platform-fee consent type',
)

assert.match(
  buyerConsentConfig[0],
  /feeAmount:\s*''/,
  'buyer onboarding terms consent must not carry the transaction platform-fee amount',
)

assert.doesNotMatch(
  buyerConsentConfig[0],
  /R750|Transaction Platform Fee|transfer cost account|remit it to ARCH9/i,
  'buyer onboarding consent copy must not mention the ARCH9 transaction platform fee',
)

assert.doesNotMatch(
  onboardingSource,
  /R750\.00|Transaction Platform Fee/,
  'buyer onboarding page must not show the platform-fee badge or heading',
)

const helperStart = apiSource.indexOf('async function acceptBuyerPlatformFeeConsent')
assert.notEqual(helperStart, -1, 'buyer onboarding platform-fee helper should remain explicit while deferred')
const nextHelperStart = apiSource.indexOf('async function fetchTransactionRequiredDocumentByKeyIfPossible', helperStart)
assert.notEqual(nextHelperStart, -1, 'buyer onboarding platform-fee helper should be followed by the document helper')
const acceptBuyerPlatformFeeConsent = apiSource.slice(helperStart, nextHelperStart)

assert.match(
  acceptBuyerPlatformFeeConsent,
  /reason:\s*'platform_fee_deferred_to_otp'/,
  'buyer onboarding completion should defer platform-fee capture to the OTP stage',
)

assert.doesNotMatch(
  acceptBuyerPlatformFeeConsent,
  /bridge_accept_transaction_platform_fee_consent|client\.rpc/,
  'buyer onboarding completion must not call the transaction platform-fee consent RPC',
)

console.log('buyer onboarding online terms without platform fee test passed')
