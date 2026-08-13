import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const appRoot = new URL('../', import.meta.url)
const privateListingService = await fs.readFile(new URL('src/services/privateListingService.js', appRoot), 'utf8')
const agencyPipelinePage = await fs.readFile(new URL('src/pages/agency/AgencyPipelinePage.jsx', appRoot), 'utf8')
const sellerOnboardingPage = await fs.readFile(new URL('src/pages/SellerOnboarding.jsx', appRoot), 'utf8')

const sendSellerOnboarding = privateListingService.match(/export async function sendSellerOnboarding\([\s\S]*?\n}\n\nexport async function/)?.[0] || ''

assert.doesNotMatch(
  sendSellerOnboarding,
  /Configure an active preferred transfer attorney before sending seller onboarding/,
  'seller onboarding send must not hard-block when no active preferred transfer attorney exists.',
)
assert.match(
  sendSellerOnboarding,
  /preferredTransferAttorney = null/,
  'unavailable transfer attorney selections should be treated as deferred nominations.',
)
assert.match(
  sendSellerOnboarding,
  /transferAttorneyChoice:[\s\S]*\?[\s\S]*'preferred'[\s\S]*:[\s\S]*'deferred'/,
  'seller onboarding form data should mark missing transfer attorney nominations as deferred.',
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
assert.match(
  sellerOnboardingPage,
  /return hasPreferredTransferAttorney\(form\.preferredTransferAttorney\) \? 'preferred' : 'deferred'/,
  'seller onboarding should default to deferred when no preferred attorney is configured.',
)
assert.match(
  sellerOnboardingPage,
  /if \(choice === 'deferred'\) return \[\]/,
  'seller onboarding validation must not treat deferred attorney assignment as missing required data.',
)
assert.match(
  sellerOnboardingPage,
  /Assign later/,
  'seller onboarding should expose an explicit assign-later attorney path.',
)

console.log('seller onboarding transfer attorney deferral checks passed')
