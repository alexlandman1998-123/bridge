import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildLeadListingLinkPatch,
  resolveLeadPropertyAddress,
  resolveListingPropertyAddress,
} from '../agencyLeadSelection.js'
import { buildListingBuyerLeadPayload } from '../../services/listings/listingBuyerActionsModel.js'

test('listing-linked leads use the physical address without losing the marketing headline', () => {
  const listing = {
    id: 'listing-1',
    listingTitle: 'Spacious family home with commercial potential',
    formattedAddress: '395 Paul Kruger Street, Capital Park, Pretoria',
    askingPrice: 2050000,
  }

  assert.equal(resolveListingPropertyAddress(listing), '395 Paul Kruger Street, Capital Park, Pretoria')
  assert.deepEqual(buildLeadListingLinkPatch(listing), {
    listingId: 'listing-1',
    enquiredListingId: 'listing-1',
    enquiredPropertyTitle: 'Spacious family home with commercial potential',
    enquiredPropertyAddress: '395 Paul Kruger Street, Capital Park, Pretoria',
    enquiredPropertyPrice: 2050000,
  })

  const payload = buildListingBuyerLeadPayload({ listing, buyer: {}, actor: {} })
  assert.equal(payload.propertyInterest, '395 Paul Kruger Street, Capital Park, Pretoria')
  assert.equal(payload.enquiredPropertyTitle, 'Spacious family home with commercial potential')
  assert.equal(payload.enquiredPropertyAddress, '395 Paul Kruger Street, Capital Park, Pretoria')
})

test('lead presentation prefers a captured address over a listing headline', () => {
  assert.equal(resolveLeadPropertyAddress({
    propertyInterest: 'Spacious family home with commercial potential',
    enquiredPropertyTitle: 'Spacious family home with commercial potential',
    enquiredPropertyAddress: '395 Paul Kruger Street, Capital Park, Pretoria',
  }), '395 Paul Kruger Street, Capital Park, Pretoria')
})

test('headline remains a safe fallback when an older lead has no address', () => {
  assert.equal(resolveLeadPropertyAddress({
    enquiredPropertyTitle: 'Legacy listing headline',
  }), 'Legacy listing headline')
})
