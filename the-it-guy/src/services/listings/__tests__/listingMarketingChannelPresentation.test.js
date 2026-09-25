import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildListingChannelPublicationDisplay,
  getListingChannelViewUrl,
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

test('overview links require the correct portal host and a listing path', () => {
  assert.equal(getListingChannelViewUrl('property24', 'https://www.property24.com/for-sale/123'), 'https://www.property24.com/for-sale/123')
  assert.equal(getListingChannelViewUrl('property24', 'https://property24.com.evil.example/for-sale/123'), '')
  assert.equal(getListingChannelViewUrl('private_property', 'https://www.privateproperty.co.za/for-sale/456'), 'https://www.privateproperty.co.za/for-sale/456')
  assert.equal(getListingChannelViewUrl('arch9_catalogue', 'https://www.arch9.co.za/buy/example'), 'https://www.arch9.co.za/buy/example')
  assert.equal(getListingChannelViewUrl('arch9_catalogue', 'https://www.arch9.co.za/'), '')
})

test('publication display distinguishes live, pending, withdrawn and unpublished changes', () => {
  const base = { key: 'property24', label: 'Property24', live: true, reference: '123', publicUrl: 'https://www.property24.com/for-sale/123' }
  assert.equal(buildListingChannelPublicationDisplay(base).status, 'live')
  assert.equal(buildListingChannelPublicationDisplay(base).href, base.publicUrl)
  assert.equal(buildListingChannelPublicationDisplay({ ...base, publicationState: { changeCount: 2 } }).statusLabel, 'Changes not published')
  assert.equal(buildListingChannelPublicationDisplay({ ...base, activityAvailable: false }).status, 'needs_attention')
  const withdrawn = buildListingChannelPublicationDisplay({ ...base, live: false, withdrawn: true })
  assert.equal(withdrawn.statusLabel, 'Withdrawn')
  assert.equal(withdrawn.href, '')
  assert.equal(buildListingChannelPublicationDisplay({ ...base, live: false, submitted: true }).statusLabel, 'Submitted')
})

test('overview stays renderable before any portal update state exists', () => {
  const display = buildListingChannelPublicationDisplay({
    key: 'property24', label: 'Property24', publicationState: null, updateState: null,
  })
  assert.equal(display.status, 'not_published')
  assert.equal(display.statusLabel, 'Not published')
  assert.equal(display.href, '')
})

test('channel references are displayed without a duplicated Ref label', () => {
  assert.equal(normalizeListingChannelReference('Ref: P24-123'), 'P24-123')
  assert.equal(normalizeListingChannelReference('Reference: PP-456'), 'PP-456')
  assert.equal(normalizeListingChannelReference('ARCH9-789'), 'ARCH9-789')
})
