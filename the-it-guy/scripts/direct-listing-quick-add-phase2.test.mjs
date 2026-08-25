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
    'propertyStructureType',
    'estateOrHoa',
    'onAuction',
    'priceOnApplication',
    'showReducedBanner',
    'noTransferDuty',
  ]) {
    assert.match(agentListingsSource, new RegExp(`${field}:`), `${field} should be initialized`)
  }
})

test('Sales new listing Step 2 exposes portal-critical property fields', () => {
  for (const copy of [
    'Ownership scheme',
    'In an estate / HOA?',
    'Descriptive property type',
    'Smallholding',
    'New Development',
    'On Auction',
    'Price on Application',
    'Show Reduced Banner on Listing',
    'No Transfer Duty',
    'Section number',
    'Sectional title number',
  ]) {
    assert.match(agentListingsSource, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${copy} should be visible in new listing capture`)
  }
})

test('Quick Add exposes the required global seller ownership options', () => {
  for (const sellerType of ['individual', 'multiple_owners', 'company', 'trust', 'foreign_individual']) {
    assert.match(agentListingsSource, new RegExp(`value: '${sellerType}'`), `${sellerType} option missing`)
  }
})

test('Quick Add exposes existing-document cards and seller portal actions without upload gates', () => {
  assert.match(agentListingsSource, /Existing Documents/)
  assert.match(agentListingsSource, /Signed Mandate/)
  assert.match(agentListingsSource, /Property Disclosure/)
  assert.match(agentListingsSource, /Seller FICA/)
  assert.match(agentListingsSource, /Send Seller Portal/)
  assert.match(agentListingsSource, /Uploads are optional later and do not block Quick Add/)

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
    propertyStructureType: 'sectional_title',
    estateOrHoa: true,
    estateName: 'Bridge Estate',
    onAuction: true,
    priceOnApplication: true,
    showReducedBanner: true,
    noTransferDuty: true,
  })

  assert.equal(payload.uploadsRequired, false)
  assert.equal(payload.evidenceRequired, false)
  assert.equal(payload.complianceDeclarations.uploadsRequired, false)
  assert.equal(payload.sellerPortalInvite.requested, true)
  assert.equal(payload.seller.sellerLegalType, 'company')
  assert.equal(payload.listing.property_structure_type, 'sectional_title')
  assert.equal(payload.sellerCanonicalFacts.property.estate_or_hoa, true)
  assert.equal(payload.sellerCanonicalFacts.property.on_auction, true)
  assert.equal(payload.sellerCanonicalFacts.property.price_on_application, true)
  assert.equal(payload.sellerCanonicalFacts.property.show_reduced_banner, true)
  assert.equal(payload.sellerCanonicalFacts.property.no_transfer_duty, true)
})
