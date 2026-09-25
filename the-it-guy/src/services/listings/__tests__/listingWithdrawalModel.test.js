import test from 'node:test'
import assert from 'node:assert/strict'

import {
  applyListingWithdrawalResults,
  buildListingWithdrawalPlan,
  listingWithdrawalIsComplete,
} from '../listingWithdrawalModel.js'

test('withdrawal plan includes every public channel and exposes missing portal references', () => {
  const plan = buildListingWithdrawalPlan({ property24Live: true, privatePropertyLive: true, agencyWebsiteLive: true, arch9Live: true })
  assert.deepEqual(plan.map((item) => item.key), ['property24', 'private_property', 'agency_website', 'arch9_catalogue'])
  assert.match(plan[0].blockedReason, /no listing reference/i)
  assert.equal(plan.every((item) => item.status === 'pending'), true)
})

test('partial withdrawal persists successful channel outcomes without marking the listing withdrawn', () => {
  const draft = applyListingWithdrawalResults(
    {
      listingStatus: 'active', publicationStatus: 'Published', property24Status: 'published', privatePropertyStatus: 'published',
      externalLinks: [
        { platform: 'Property24', status: 'Live', visibleToSeller: true, url: 'https://property24.example/listing' },
        { platform: 'Private Property', status: 'Live', visibleToSeller: true, url: 'https://privateproperty.example/listing' },
      ],
    },
    [
      { key: 'property24', status: 'succeeded' },
      { key: 'private_property', status: 'failed' },
      { key: 'arch9_catalogue', status: 'succeeded' },
    ],
  )
  assert.equal(draft.property24Status, 'removed')
  assert.equal(draft.privatePropertyStatus, 'published')
  assert.equal(draft.bridgeListingStatus, 'paused')
  assert.equal(draft.listingStatus, 'active')
  assert.equal(draft.externalLinks[0].status, 'Withdrawn')
  assert.equal(draft.externalLinks[0].visibleToSeller, false)
  assert.equal(draft.externalLinks[1].status, 'Live')
})

test('complete withdrawal marks the listing withdrawn only after all active channels succeed', () => {
  const results = [
    { key: 'property24', status: 'succeeded' },
    { key: 'private_property', status: 'not_live' },
    { key: 'agency_website', status: 'succeeded' },
    { key: 'arch9_catalogue', status: 'succeeded' },
  ]
  assert.equal(listingWithdrawalIsComplete(results), true)
  const draft = applyListingWithdrawalResults({ listingStatus: 'active' }, results, { complete: true })
  assert.equal(draft.listingStatus, 'withdrawn')
  assert.equal(draft.publicationStatus, 'Draft')
})
