import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildListingShowDayPayload,
  buildListingShowDayRsvpPath,
  buildListingShowDaySnapshot,
  validateListingShowDayDraft,
} from '../listingShowDayModel.js'

test('listing show-day snapshot carries canonical property details and cover-first media', () => {
  const snapshot = buildListingShowDaySnapshot(
    { id: 'listing-1', listingTitle: 'Old title', listingReference: 'A-19' },
    {
      headline: 'Modern family home', formattedAddress: '1 Main Road, Sandton', price: '3500000', coverImageId: 'cover',
      galleryImages: [
        { id: 'second', publicUrl: 'https://cdn.example.test/second.jpg' },
        { id: 'cover', publicUrl: 'https://cdn.example.test/cover.jpg' },
      ],
    },
    { id: 'agent-1', name: 'Alex Agent' },
  )
  assert.equal(snapshot.title, 'Modern family home')
  assert.equal(snapshot.image, 'https://cdn.example.test/cover.jpg')
  assert.deepEqual(snapshot.images, ['https://cdn.example.test/cover.jpg', 'https://cdn.example.test/second.jpg'])
  assert.equal(snapshot.agentId, 'agent-1')
})

test('listing show-day snapshot tolerates an unloaded marketing draft', () => {
  const snapshot = buildListingShowDaySnapshot(
    { id: 'listing-1', listingTitle: 'Family home', propertyAddress: '1 Main Road' },
    null,
    null,
  )

  assert.equal(snapshot.title, 'Family home')
  assert.equal(snapshot.address, '1 Main Road')
  assert.deepEqual(snapshot.images, [])
})

test('show-day publish validation protects time order and requires a live listing channel', () => {
  const errors = validateListingShowDayDraft(
    { date: '2026-10-03', startTime: '14:00', endTime: '12:00', hostName: 'Alex Agent' },
    { listing: { id: 'listing-1' }, publicListingReady: false, publish: true },
  )
  assert.ok(errors.includes('The end time must be after the start time.'))
  assert.ok(errors.some((error) => error.includes('listing channel')))
  assert.equal(validateListingShowDayDraft(
    { date: '2026-10-03', startTime: '10:00', endTime: '14:00', hostName: 'Alex Agent' },
    { listing: { id: 'listing-1' }, publicListingReady: false, publish: false },
  ).length, 0)
})

test('show-day payload links the canonical listing and creates the RSVP route', () => {
  const listing = { id: 'listing-1', title: 'Modern family home', address: '1 Main Road', image: 'https://cdn.example.test/cover.jpg', agentId: 'agent-1', agentName: 'Alex Agent' }
  const payload = buildListingShowDayPayload(listing, { date: '2026-10-03', startTime: '10:00', endTime: '14:00', hostName: 'Alex Agent' })
  assert.equal(payload.subjectId, 'listing-1')
  assert.equal(payload.status, 'upcoming')
  assert.equal(payload.registrationEnabled, true)
  assert.equal(payload.listingSnapshot.image, listing.image)
  assert.equal(buildListingShowDayRsvpPath({ publicToken: 'token-123' }), '/marketing/rsvp/token-123')
  assert.equal(buildListingShowDayRsvpPath(null), '')
})
