import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectAuthoritativeListingOptionSource } from '../src/services/listingOptionAuthorityService.js'

const listingId = 'd8c01acb-a4ca-422f-b11a-d4a4fe0c3c45'
const hydrated = {
  id: listingId,
  sourceAuthority: 'canonical_listing',
  updatedAt: '2026-08-29T19:28:44.614Z',
  sourceListing: {
    id: listingId,
    sellerLeadId: 'seller-1',
    listingStatus: 'onboarding_completed',
    mandateStatus: 'not_started',
    sellerOnboardingStatus: 'completed',
    sellerOnboarding: { status: 'completed', submittedAt: '2026-08-29T19:28:44.614Z' },
    documents: [],
  },
}
const newerLeadProjection = {
  id: listingId,
  sourceAuthority: 'lead_projection',
  updatedAt: '2026-08-30T14:21:58.781Z',
  sourceListing: {
    id: listingId,
    address: '130 Nahoon Singel',
    updatedAt: '2026-08-30T14:21:58.781Z',
  },
}

assert.equal(
  selectAuthoritativeListingOptionSource(hydrated, newerLeadProjection).sourceListing.sellerOnboarding.status,
  'completed',
  'a newer CRM projection must not replace canonical onboarding evidence',
)
assert.equal(
  selectAuthoritativeListingOptionSource(newerLeadProjection, hydrated).sourceListing.mandateStatus,
  'not_started',
  'canonical listing selection must be independent of hydration order',
)

const newerCompactListing = {
  id: listingId,
  sourceAuthority: 'canonical_listing',
  updatedAt: '2026-08-30T15:00:00.000Z',
  sourceListing: { id: listingId, listingStatus: 'onboarding_completed' },
}
assert.ok(
  selectAuthoritativeListingOptionSource(hydrated, newerCompactListing).sourceListing.sellerOnboarding,
  'a compact listing query must not replace a richer hydrated listing of equal authority',
)

const pageSource = await readFile(new URL('../src/pages/agency/AgencyPipelinePage.jsx', import.meta.url), 'utf8')
assert.match(pageSource, /listingOptionSourceAuthority:\s*'lead_projection'/)
assert.match(pageSource, /selectAuthoritativeListingOptionSource\(existing, option\)/)

console.log('seller listing hydration authority tests passed')
