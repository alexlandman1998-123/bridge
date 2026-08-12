import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'

const agentListingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Quick Add persists direct listing form data through the seller onboarding form-data helper', () => {
  assert.match(agentListingsSource, /persistSellerProfileOnboardingFormData/)
  assert.match(agentListingsSource, /buildQuickAddDirectListingPersistencePayload/)
  assert.match(agentListingsSource, /sellerOnboardingFormData/)
  assert.match(agentListingsSource, /status: 'not_started'/)
})

test('Quick Add create and merge paths persist direct listing intake form data', () => {
  const persistenceCallCount = (agentListingsSource.match(/persistSellerProfileOnboardingFormData\(/g) || []).length
  assert.ok(persistenceCallCount >= 2, 'expected persistence calls for create and merge paths')
  assert.match(agentListingsSource, /direct listing intake form data persistence skipped after quick add create/)
  assert.match(agentListingsSource, /direct listing intake form data persistence skipped during merge/)
})

test('Quick Add stores direct listing canonical facts and readiness on listing records', () => {
  assert.match(agentListingsSource, /\.\.\.directListingPersistence\.sellerCanonicalFacts/)
  assert.match(agentListingsSource, /\.\.\.directListingPersistence\.sellerCanonicalFactReadiness/)
  assert.match(agentListingsSource, /sellerCanonicalFacts,\s*\n\s*sellerCanonicalFactReadiness,/)
})

test('Quick Add local fallback mirrors direct listing persistence data', () => {
  assert.match(agentListingsSource, /directListingIntake: directListingPersistence/)
  assert.match(agentListingsSource, /complianceDeclarations: directListingPersistence\.complianceDeclarations/)
  assert.match(agentListingsSource, /formData: directListingPersistence\.sellerOnboardingFormData/)
})

test('direct listing persistence payload remains declaration-only and portal-aware', () => {
  const payload = buildDirectListingIntakePayload({
    sellerType: 'trust',
    sellerName: 'Trust contact',
    sellerEmail: 'trustee@example.com',
    trustName: 'The Phase Three Trust',
    trustees: [{ name: 'Tessa', surname: 'Trustee' }],
    hasSignedMandate: true,
    mandateType: 'open',
    hasSignedPropertyConditionDisclosure: false,
    hasSignedFicaForm: false,
    sellerPortalInviteRequested: true,
  })

  assert.equal(payload.sellerCanonicalFacts.seller.legal_type, 'trust')
  assert.equal(payload.sellerOnboardingFormData.trust.trustees.length, 1)
  assert.equal(payload.complianceDeclarations.uploadsRequired, false)
  assert.equal(payload.complianceDeclarations.evidenceRequired, false)
  assert.equal(payload.sellerPortalInvite.requested, true)
})
