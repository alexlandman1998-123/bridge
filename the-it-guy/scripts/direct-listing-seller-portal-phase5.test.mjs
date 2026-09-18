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

test('direct listing defers the Seller Portal until signing is complete', () => {
  assert.match(agentListingsSource, /function buildDeferredQuickAddSellerPortalInvite/)
  assert.match(agentListingsSource, /status: 'pending_signing'/)
  assert.match(agentListingsSource, /signing_pack_completion/)
  assert.doesNotMatch(agentListingsSource, /activateSellerPortalForListing/)
})

test('existing listing activation requires uploaded signed mandate evidence without full seller onboarding', () => {
  assert.match(agentListingDetailSource, /sellerPortalMandateEvidenceReady/)
  assert.match(agentListingDetailSource, /sellerPortalPhysicalDocsReportedHeld/)
  assert.doesNotMatch(agentListingDetailSource, /physicalDocumentsHeld/)
  assert.match(agentListingDetailSource, /Upload the signed mandate before activating the Seller Portal\./)
  assert.doesNotMatch(
    agentListingDetailSource,
    /Sign the seller mandate before resending the seller portal password setup link\./,
  )
})

test('direct intake records the deferred portal plan on both create and merge', () => {
  const createIndex = agentListingsSource.indexOf("direct_listing_intake_created")
  const mergeIndex = agentListingsSource.indexOf("direct_listing_intake_merged")
  const deferredInviteCount = agentListingsSource.match(/buildDeferredQuickAddSellerPortalInvite\(/g)?.length || 0

  assert.ok(createIndex > -1)
  assert.ok(mergeIndex > -1)
  assert.ok(deferredInviteCount >= 3)
})

test('deferred seller portal status is visible in the success state', () => {
  assert.match(agentListingsSource, /Seller portal will be sent after every required signer completes the document pack\./)
  assert.match(agentListingsSource, /sellerPortalInvite: directListingSellerPortalInvite/)
})

test('local fallback also waits for signing rather than fabricating a portal link', () => {
  assert.match(agentListingsSource, /buildLocalQuickAddSellerPortalInvite/)
  assert.match(agentListingsSource, /return buildDeferredQuickAddSellerPortalInvite\(\{ form, directListingPersistence \}\)/)
})
