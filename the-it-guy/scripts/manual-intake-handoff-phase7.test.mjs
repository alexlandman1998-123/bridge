import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'
import { buildDirectListingOperationalSummary } from '../src/lib/directListingOperationalSummary.js'

const detailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const intake = buildDirectListingIntakePayload({
  sellerName: 'Offline Seller',
  sellerEmail: 'offline@example.test',
  propertyAddress: '12 Handoff Road',
  sellerPortalAccessIntent: 'agent_managed',
  hasSignedMandate: true,
  mandateCaptureSource: 'in_person',
})
const listing = {
  ...intake.listing,
  sellerOnboarding: { formData: intake.sellerOnboardingFormData },
  sellerCanonicalFacts: intake.sellerCanonicalFacts,
  directListingIntake: { version: intake.version, source: intake.source },
}
const summary = buildDirectListingOperationalSummary(listing)

assert.equal(summary.hasIntake, true)
assert.equal(summary.portalInvite.agentManaged, true)
assert.ok(summary.followUpActions.some((action) => action.status === 'reported_held_pending_upload'))
assert.ok(summary.followUpActions.some((action) => action.key === 'seller_portal' && action.complete))
assert.match(detailSource, /Manual intake handoff/)
assert.match(detailSource, /Open document workspace/)
assert.match(detailSource, /directListingPostCreateActions\.map/)

console.log('Manual intake handoff phase 7 checks passed.')
