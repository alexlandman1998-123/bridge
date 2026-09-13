import assert from 'node:assert/strict'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import { buildDirectListingOperationalSummary } from '../src/lib/directListingOperationalSummary.js'

const intake = buildDirectListingIntakePayload({
  sellerName: 'Offline Seller',
  sellerEmail: 'offline@example.test',
  propertyAddress: '10 Offline Road',
  sellerPortalAccessIntent: 'agent_managed',
  sellerPortalOptOutReason: 'Seller prefers to hand documents to the agent.',
})

assert.equal(intake.sellerPortalInvite.requested, false)
assert.equal(intake.sellerPortalInvite.accessIntent, 'agent_managed')
assert.equal(intake.sellerPortalInvite.optedOut, true)
assert.equal(intake.sellerOnboardingFormData.sellerPortalOptedOut, true)

const listing = {
  ...intake.listing,
  sellerOnboarding: { formData: intake.sellerOnboardingFormData },
  sellerCanonicalFacts: intake.sellerCanonicalFacts,
  directListingIntake: { version: intake.version, source: intake.source },
}
const operational = buildDirectListingOperationalSummary(listing)
const portalAction = operational.followUpActions.find((action) => action.key === 'seller_portal')

assert.equal(operational.portalInvite.agentManaged, true)
assert.equal(operational.portalInvite.label, 'Agent-managed (no portal)')
assert.equal(portalAction.complete, true)
assert.equal(portalAction.status, 'agent_managed')
assert.match(portalAction.detail, /Seller prefers to hand documents/i)

console.log('Direct listing offline seller phase 5 checks passed.')
