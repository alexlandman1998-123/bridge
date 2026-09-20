import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const signer = read('../src/pages/ListingMandateSigning.jsx')
const pipeline = read('../src/pages/agency/AgencyPipelinePage.jsx')
const listing = read('../src/pages/AgentListingDetail.jsx')

assert.match(signer, /function signingHeaderLogoCandidates/)
assert.match(signer, /branding\.logoDarkUrl, branding\.logoLightUrl, branding\.logoIconUrl/)
assert.match(signer, /data-agency-brand="text-fallback"/)
assert.match(pipeline, /resolveOnboardingBranding\(/)
assert.match(pipeline, /branding: signingBranding/)
assert.match(listing, /branding: signingBranding/)

console.log('seller signing branding phase 1 checks passed')
