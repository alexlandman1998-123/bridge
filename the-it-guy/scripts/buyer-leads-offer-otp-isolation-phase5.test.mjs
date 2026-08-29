import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const pipeline = readFileSync(resolve(root, 'src/pages/agency/AgencyPipelinePage.jsx'), 'utf8')
const loader = readFileSync(resolve(root, 'src/pages/agency/buyerOfferWorkspaceDataLoader.js'), 'utf8')
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

const loaderRequest = pipeline.indexOf('loadBuyerOfferWorkspaceData({')
assert.notEqual(loaderRequest, -1, 'the buyer setup tab should use the isolated offer loader')
const effectStart = pipeline.lastIndexOf('useEffect(() => {', loaderRequest)
const effectEnd = pipeline.indexOf('\n  useEffect(() => {', loaderRequest)
const offersEffect = pipeline.slice(effectStart, effectEnd === -1 ? pipeline.length : effectEnd)

assert.match(offersEffect, /LEAD_WORKSPACE_REQUEST_FAMILIES\.offers/)
assert.match(offersEffect, /buyerWorkspaceTab === BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY/)
assert.ok(offersEffect.indexOf('shouldLoadLeadWorkspaceRequest') < offersEffect.indexOf('loadBuyerOfferWorkspaceData({'))
assert.ok(offersEffect.indexOf('BUYER_ONBOARDING_OTP_WORKSPACE_TAB_KEY') < offersEffect.indexOf('loadBuyerOfferWorkspaceData({'))
assert.match(offersEffect, /revision: selectedLeadOffersRefreshTick/)
assert.doesNotMatch(pipeline, /listCanonicalOffersForLead\(\{/)
assert.doesNotMatch(pipeline, /listOfferPortalSessions\(\{/)

assert.match(loader, /const pendingLoads = new Map\(\)/)
assert.match(loader, /const completedLoads = new Map\(\)/)
assert.match(loader, /revision: Number\(revision\) \|\| 0/)
assert.match(loader, /listOfferPortalSessions\(payload\)\.catch\(\(\) => \[\]\)/)

assert.match(
  packageJson.scripts['verify:buyer-leads-performance'],
  /test:buyer-leads-offer-otp-isolation-phase5(?: && |$)/,
)

console.log('buyer leads Phase 5 offer and OTP isolation checks passed')
