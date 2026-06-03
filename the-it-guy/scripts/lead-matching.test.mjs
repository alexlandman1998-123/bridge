import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'

const pageSource = await fs.readFile(new URL('../src/pages/AgentLeadsPage.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /Find Matches/)
assert.match(pageSource, /RequirementMatchPanel/)
assert.match(pageSource, /Add Selected/)
assert.match(pageSource, /Already linked/)
assert.match(pageSource, /Agent selected/)

const serviceSource = await fs.readFile(new URL('../src/services/leadMatchingService.js', import.meta.url), 'utf8')
assert.match(serviceSource, /export async function findListingsForRequirement/)
assert.match(serviceSource, /export async function findListingsForLead/)
assert.match(serviceSource, /export function scoreListingAgainstRequirement/)
assert.match(serviceSource, /export function buildMatchReasons/)
assert.match(serviceSource, /export async function addMatchesToLead/)
assert.match(serviceSource, /source: 'manual_match'/)
assert.match(serviceSource, /status: 'suggested'/)
assert.match(serviceSource, /requirementId/)
assert.match(serviceSource, /upsertLeadListingInterest/)

const server = await createServer({
  root: process.cwd(),
  logLevel: 'silent',
  server: { middlewareMode: true },
})

try {
  const { __leadMatchingServiceTestUtils } = await server.ssrLoadModule('/src/services/leadMatchingService.js')
  const { scoreListingAgainstRequirement, buildMatchReasons, decorateMatches, getListingStatusBucket } = __leadMatchingServiceTestUtils

  const requirement = {
    requirementId: 'requirement-one',
    leadId: 'lead-one',
    contactId: 'contact-one',
    intentType: 'buy',
    propertyTypes: ['Townhouse'],
    suburbs: ['Bartlett'],
    areas: ['Boksburg'],
    city: 'Boksburg',
    budgetMin: 1800000,
    budgetMax: 2200000,
    bedroomsMin: 3,
    bathroomsMin: 2,
    garagesMin: 1,
    parkingMin: 2,
    erfSizeMin: 250,
    floorSizeMin: 140,
    mustHaves: ['garden', 'fibre'],
    status: 'active',
  }

  const listing = {
    id: 'listing-one',
    title: 'Bartlett townhouse',
    address: '1 Example Street',
    suburb: 'Bartlett',
    city: 'Boksburg',
    province: 'Gauteng',
    price: 2100000,
    propertyType: 'Townhouse',
    bedrooms: 3,
    bathrooms: 2,
    garages: 2,
    coveredParking: 1,
    openParking: 1,
    erfSize: 300,
    floorSize: 160,
    features: ['Garden', 'Fibre'],
    status: 'active',
  }

  const score = scoreListingAgainstRequirement({ listing, requirement })
  assert.equal(score.matchScore, 100)
  assert.ok(score.matchReasons.some((reason) => reason.text === 'Price within budget'))
  assert.ok(score.matchReasons.some((reason) => reason.text === 'Suburb matches preferred area'))
  assert.ok(score.matchReasons.some((reason) => reason.text === 'Property type matches Townhouse'))
  assert.ok(score.matchReasons.some((reason) => reason.text === '3 bedrooms meets minimum'))
  assert.ok(score.matchReasons.some((reason) => reason.text === '2 bathrooms meets minimum'))

  const expensive = scoreListingAgainstRequirement({ listing: { ...listing, id: 'listing-two', price: 2600000 }, requirement })
  assert.ok(expensive.matchScore < score.matchScore)
  assert.ok(expensive.matchReasons.some((reason) => reason.text === 'Price above max budget'))

  const outsideArea = scoreListingAgainstRequirement({
    listing: { ...listing, id: 'listing-three', title: 'Sandton apartment', address: '99 Other Road', suburb: 'Sandton', city: 'Johannesburg' },
    requirement,
  })
  assert.ok(outsideArea.matchReasons.some((reason) => reason.text === 'Suburb outside preferred areas'))

  const missingData = scoreListingAgainstRequirement({ listing: { id: 'listing-four', title: 'Sparse listing' }, requirement })
  assert.doesNotThrow(() => scoreListingAgainstRequirement({ listing: { id: 'listing-four' }, requirement }))
  assert.ok(missingData.matchReasons.some((reason) => reason.type === 'missing'))

  const reasons = buildMatchReasons({ listing, requirement })
  assert.ok(Array.isArray(reasons))
  assert.ok(reasons.length > 0)

  const decorated = decorateMatches({
    listings: [
      { ...listing, id: 'listing-one' },
      { ...listing, id: 'listing-sold', status: 'sold', price: 1900000 },
      { ...listing, id: 'listing-two', suburb: 'Sandton', price: 2100000 },
    ],
    requirement,
    existingInterests: [{ listingId: 'listing-one', interestId: 'interest-one' }],
  })
  assert.equal(decorated.some((item) => item.id === 'listing-sold'), false, 'sold listings should be filtered out')
  assert.equal(decorated[0].id, 'listing-one')
  assert.equal(decorated[0].alreadyLinked, true)
  assert.equal(getListingStatusBucket({ status: 'active' }), 'available')
  assert.equal(getListingStatusBucket({ status: 'archived' }), 'unavailable')
} finally {
  await server.close()
}

console.log('lead matching tests passed')
