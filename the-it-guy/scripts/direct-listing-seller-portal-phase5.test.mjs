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

test('Quick Add direct listing can request a seller portal link without upload requirements', () => {
  const payload = buildDirectListingIntakePayload({
    sellerType: 'individual',
    sellerName: 'Sarah',
    sellerSurname: 'Seller',
    sellerEmail: 'seller@example.com',
    sellerPhone: '+27 82 000 0000',
    sellerPortalInviteRequested: true,
    hasSignedMandate: false,
    hasSignedPropertyConditionDisclosure: false,
    hasSignedFicaForm: false,
  })

  assert.equal(payload.sellerPortalInvite.requested, true)
  assert.equal(payload.sellerPortalInvite.destinationEmail, 'seller@example.com')
  assert.equal(payload.complianceDeclarations.uploadsRequired, false)
  assert.equal(payload.complianceDeclarations.evidenceRequired, false)
})

test('Phase 5 uses the existing manual listing seller portal activation flow', () => {
  assert.match(agentListingsSource, /activateSellerPortalForListing/)
  assert.match(agentListingsSource, /SELLER_PORTAL_ACTIVATION_SOURCES/)
  assert.match(agentListingsSource, /SELLER_PORTAL_ACTIVATION_SOURCES\.manualListing/)
  assert.match(agentListingsSource, /sendQuickAddSellerPortalInvite/)
})

test('seller portal invite runs after direct intake persistence and requirement sync', () => {
  const createRequirementSyncIndex = agentListingsSource.indexOf("direct_listing_intake_created")
  const createInviteIndex = agentListingsSource.indexOf('directListingSellerPortalInvite = await sendQuickAddSellerPortalInvite', createRequirementSyncIndex)
  const mergeRequirementSyncIndex = agentListingsSource.indexOf("direct_listing_intake_merged")
  const mergeInviteIndex = agentListingsSource.indexOf('directListingSellerPortalInvite = await sendQuickAddSellerPortalInvite', mergeRequirementSyncIndex)

  assert.ok(createRequirementSyncIndex > -1)
  assert.ok(createInviteIndex > createRequirementSyncIndex)
  assert.ok(mergeRequirementSyncIndex > -1)
  assert.ok(mergeInviteIndex > mergeRequirementSyncIndex)
})

test('seller portal invite failure is non-blocking and visible in success state', () => {
  assert.match(agentListingsSource, /direct listing seller portal invite skipped/)
  assert.match(agentListingsSource, /seller_portal_invite_failed/)
  assert.match(agentListingsSource, /sellerPortalInvite: directListingSellerPortalInvite/)
  assert.match(agentListingsSource, /Seller portal invite needs a retry/)
})

test('local fallback prepares a portal link without pretending delivery happened', () => {
  assert.match(agentListingsSource, /buildLocalQuickAddSellerPortalInvite/)
  assert.match(agentListingsSource, /generateSellerOnboardingToken/)
  assert.match(agentListingsSource, /buildSellerOnboardingLink/)
  assert.match(agentListingsSource, /status: 'prepared_local'/)
  assert.match(agentListingsSource, /sent: false/)
  assert.match(agentListingsSource, /sellerPortalStatus: directListingSellerPortalInvite\.status/)
})
