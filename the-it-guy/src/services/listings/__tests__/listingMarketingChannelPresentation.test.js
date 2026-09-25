import test from 'node:test'
import assert from 'node:assert/strict'

import {
  normalizeListingChannelPublicUrl,
  normalizeListingChannelReference,
} from '../listingMarketingChannelPresentation.js'

test('channel URLs support saved portal links without allowing unsafe schemes', () => {
  assert.equal(normalizeListingChannelPublicUrl('www.property24.com/listing/123'), 'https://www.property24.com/listing/123')
  assert.equal(normalizeListingChannelPublicUrl('https://www.privateproperty.co.za/listing/456'), 'https://www.privateproperty.co.za/listing/456')
  assert.equal(normalizeListingChannelPublicUrl('javascript:alert(1)'), '')
  assert.equal(normalizeListingChannelPublicUrl('data:text/html,bad'), '')
  assert.equal(normalizeListingChannelPublicUrl(''), '')
})

test('channel references are displayed without a duplicated Ref label', () => {
  assert.equal(normalizeListingChannelReference('Ref: P24-123'), 'P24-123')
  assert.equal(normalizeListingChannelReference('Reference: PP-456'), 'PP-456')
  assert.equal(normalizeListingChannelReference('ARCH9-789'), 'ARCH9-789')
})
