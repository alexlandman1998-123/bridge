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

test('Quick Add imports and uses the direct listing intake model for Phase 2 preview', () => {
  assert.match(agentListingsSource, /buildDirectListingIntakePayload/)
  assert.match(agentListingsSource, /buildDirectListingPartyFacts/)
  assert.match(agentListingsSource, /directListingIntakePreview/)
})

test('Quick Add initial state includes ownership, declaration, and seller portal fields', () => {
  for (const field of [
    'companyDirectorsText',
    'trusteesText',
    'multipleOwnersText',
    'foreignOwnerCountry',
    'hasSignedMandate',
    'hasSignedPropertyConditionDisclosure',
    'hasSignedFicaForm',
    'sellerPortalInviteRequested',
  ]) {
    assert.match(agentListingsSource, new RegExp(`${field}:`), `${field} should be initialized`)
  }
})

test('Quick Add exposes the required global seller ownership options', () => {
  for (const sellerType of ['individual', 'multiple_owners', 'company', 'trust', 'foreign_individual']) {
    assert.match(agentListingsSource, new RegExp(`value: '${sellerType}'`), `${sellerType} option missing`)
  }
})

test('Quick Add exposes declaration tickboxes without making upload evidence required', () => {
  assert.match(agentListingsSource, /Signed mandate held/)
  assert.match(agentListingsSource, /Signed property disclosure/)
  assert.match(agentListingsSource, /Signed FICA form held/)
  assert.match(agentListingsSource, /Send seller portal link/)
  assert.match(agentListingsSource, /No uploads are required for these answers/)

  const payload = buildDirectListingIntakePayload({
    sellerType: 'company',
    sellerName: 'Agent captured seller',
    sellerEmail: 'seller@example.com',
    companyName: 'Global Holdings',
    companyDirectors: [{ name: 'Dana', surname: 'Director' }],
    hasSignedMandate: true,
    hasSignedPropertyConditionDisclosure: false,
    hasSignedFicaForm: true,
    sellerPortalInviteRequested: true,
  })

  assert.equal(payload.uploadsRequired, false)
  assert.equal(payload.evidenceRequired, false)
  assert.equal(payload.complianceDeclarations.uploadsRequired, false)
  assert.equal(payload.sellerPortalInvite.requested, true)
  assert.equal(payload.seller.sellerLegalType, 'company')
})
