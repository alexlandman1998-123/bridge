import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)
const privateListingService = await fs.readFile(new URL('src/services/privateListingService.js', appRoot), 'utf8')
const agencyPipelinePage = await fs.readFile(new URL('src/pages/agency/AgencyPipelinePage.jsx', appRoot), 'utf8')
const sellerOnboardingPage = await fs.readFile(new URL('src/pages/SellerOnboarding.jsx', appRoot), 'utf8')

const sendSellerOnboarding = privateListingService.match(/export async function sendSellerOnboarding\([\s\S]*?\n}\n\nexport async function/)?.[0] || ''
const submitSellerOnboarding = privateListingService.match(/export async function submitSellerOnboarding\([\s\S]*?\n}\n\nasync function updateSellerOnboardingProgressInternal/)?.[0] || ''

assert.doesNotMatch(
  sendSellerOnboarding,
  /Configure an active preferred transfer attorney before sending seller onboarding/,
  'seller onboarding send must not hard-block when no active preferred transfer attorney exists.',
)
assert.doesNotMatch(
  sendSellerOnboarding,
  /preferredTransferAttorney|transferAttorneyChoice|preferredTransferAttorneyAccepted|preferredTransferAttorneyAcceptance/,
  'seller onboarding send should not seed transfer attorney fields into seller form data.',
)
assert.match(
  agencyPipelinePage,
  /Send without attorney/,
  'the agent modal should allow sending onboarding without selecting an attorney.',
)
assert.match(
  agencyPipelinePage,
  /disabled=\{loading \|\| sending \|\| \(hasAttorneyOptions && !selectedAttorney\)\}/,
  'the send button should only require a selected attorney when attorney options are available.',
)
for (const pattern of [
  /Transfer attorney preference/,
  /Transferring Attorney/,
  /getTransferAttorneyMissingItems/,
  /handleTransferAttorneyChoiceChange/,
  /preferredTransferAttorneyAccepted/,
  /transferAttorneyChoice/,
  /nominatedTransferAttorney/,
]) {
  assert.doesNotMatch(
    sellerOnboardingPage,
    pattern,
    'seller onboarding page should not render or validate transfer attorney preference.',
  )
}
for (const pattern of [
  /Nominate another transferring attorney before submitting seller onboarding\./,
  /The preferred transferring attorney must be configured before seller onboarding can be completed\./,
  /Accept the preferred transferring attorney before submitting seller onboarding\./,
  /ensureAcceptedPreferredTransferAttorneyAllocation/,
]) {
  assert.doesNotMatch(
    submitSellerOnboarding,
    pattern,
    'seller onboarding submit should not require or allocate transfer attorney preferences.',
  )
}
assert.match(
  privateListingService,
  /stripSellerOnboardingTransferAttorneyFields/,
  'seller onboarding service should sanitize legacy transfer attorney fields from form data.',
)
assert.doesNotMatch(
  sellerOnboardingPage,
  /Attorney:/,
  'seller onboarding final required items should not include attorney requirements.',
)

console.log('seller onboarding transfer attorney removal checks passed')
