import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { buildDirectListingIntakePayload } from '../src/lib/directListingIntakeModel.js'

const agentListingsSource = readFileSync(new URL('../src/pages/AgentListings.jsx', import.meta.url), 'utf8')
const agentListingDetailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')

function test(name, fn) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    console.error(`not ok - ${name}`)
    throw error
  }
}

test('Quick Add direct listing records the seller portal request for post-upload delivery', () => {
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

test('direct listing sends a requested portal invite once basic seller setup is complete', () => {
  assert.match(agentListingsSource, /function buildDeferredQuickAddSellerPortalInvite/)
  assert.match(agentListingsSource, /status: 'pending_setup'/)
  assert.match(agentListingsSource, /async function deliverQuickAddSellerPortalInvite/)
  assert.match(agentListingsSource, /await activateSellerPortalForListing/)
  assert.doesNotMatch(agentListingsSource, /status: 'pending_signing'/)
})

test('existing listing activation requires confirmed seller type and contact, not a signed mandate', () => {
  assert.match(agentListingDetailSource, /Confirm the seller entity type in Seller setup before sending an invitation/)
  assert.match(agentListingDetailSource, /Add a valid email for the seller representative/)
  assert.match(agentListingDetailSource, /primaryContactName:/)
  assert.doesNotMatch(agentListingDetailSource, /sellerPortalMandateEvidenceReady/)
  assert.doesNotMatch(agentListingDetailSource, /Upload the signed mandate before activating the Seller Portal\./)
  assert.doesNotMatch(
    agentListingDetailSource,
    /Sign the seller mandate before resending the seller portal password setup link\./,
  )
})

test('direct intake records the portal result on both create and merge', () => {
  const createIndex = agentListingsSource.indexOf("direct_listing_intake_created")
  const mergeIndex = agentListingsSource.indexOf("direct_listing_intake_merged")
  const deliveryCount = agentListingsSource.match(/deliverQuickAddSellerPortalInvite\(/g)?.length || 0

  assert.ok(createIndex > -1)
  assert.ok(mergeIndex > -1)
  assert.ok(deliveryCount >= 3)
})

test('seller portal setup status is visible in the success state', () => {
  assert.match(agentListingsSource, /Seller portal invitation needs the entity type and a named contact/)
  assert.match(agentListingsSource, /sellerPortalInvite: directListingSellerPortalInvite/)
})

test('local fallback records an invite request without fabricating a portal link', () => {
  assert.match(agentListingsSource, /buildLocalQuickAddSellerPortalInvite/)
  assert.match(agentListingsSource, /return buildDeferredQuickAddSellerPortalInvite\(\{ form, directListingPersistence \}\)/)
})
