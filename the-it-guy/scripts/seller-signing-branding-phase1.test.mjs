import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const signer = read('../src/pages/ListingMandateSigning.jsx')
const pipeline = read('../src/pages/agency/AgencyPipelinePage.jsx')
const listing = read('../src/pages/AgentListingDetail.jsx')
const onboarding = read('../src/pages/SellerOnboarding.jsx')

assert.match(signer, /function signingHeaderLogoCandidates/)
assert.match(signer, /branding\.logoDarkUrl, branding\.logoLightUrl, branding\.logoIconUrl/)
assert.match(signer, /data-agency-brand="text-fallback"/)
assert.match(signer, /if \(loading\) \{[\s\S]*Opening your secure documents/)
assert.match(signer, /--signing-primary': validHex\(branding\.primaryColour, '#111111'\)/)
assert.doesNotMatch(signer, /--signing-primary': validHex\(branding\.primaryColour, '#173f5f'\)/)
assert.match(pipeline, /resolveOnboardingBranding\(/)
assert.match(pipeline, /branding: signingBranding/)
assert.match(listing, /branding: signingBranding/)
assert.match(onboarding, /const currentBranding = await fetchCurrentSellerOnboardingBranding\(token\)/)
assert.match(onboarding, /const submissionAgencyBrand = resolveAgencyBrand/)
assert.match(onboarding, /primaryColour: submissionAgencyBrand\.primaryColour/)

console.log('seller signing branding phase 1 checks passed')
