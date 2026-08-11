import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')

assert.match(
  source,
  /const BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY = 'offers'/,
  'Legacy buyer onboarding / OTP tab key should route to the Offers workspace.',
)
assert.match(
  source,
  /BUYER_LEAD_WORKSPACE_TAB_KEYS = new Set\(\['overview', 'properties', 'appointments', 'documents', 'activity', 'offers'\]\)/,
  'Buyer lead workspace route allow-list should include Documents and Offers.',
)
assert.match(
  source,
  /\{ key: 'documents', label: 'Documents', meta: '' \}/,
  'Buyer workspace should expose a Documents tab.',
)
assert.match(
  source,
  /\{ key: BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY, label: 'Offers', meta: selectedLeadOfferSummary\.total \}/,
  'Buyer workspace should expose Offers instead of the legacy Onboarding / OTP tab.',
)
assert.match(
  source,
  /const BUYER_OFFER_DOCUMENT_LABEL = 'Signed OTP'/,
  'Signed OTP should be stored as the canonical buyer offer document.',
)
assert.match(
  source,
  /source: 'agent_signed_otp_upload'/,
  'Signed OTP uploads should be tagged as agent signed OTP uploads.',
)
assert.match(
  source,
  /status: 'accepted'/,
  'Signed OTP upload should create an accepted canonical offer record.',
)
assert.match(
  source,
  /createCanonicalOffer\(\{/,
  'Signed OTP upload should use canonical offer creation.',
)
assert.doesNotMatch(
  source,
  /createTransactionFromLeadOverride/,
  'Signed OTP upload should not directly create a transaction from the lead.',
)
assert.doesNotMatch(
  source,
  /Buyer Onboarding \+ OTP Transaction|Open Onboarding \/ OTP|Upload OTP|Uploaded OTP|OTP Transaction History/,
  'Agency pipeline buyer workspace should not render legacy OTP transaction copy.',
)

console.log('agency pipeline buyer offer workspace Phase 2 checks passed')
