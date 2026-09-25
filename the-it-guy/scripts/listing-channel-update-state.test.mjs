import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { deriveListingChannelUpdateStates } from '../src/services/listings/listingChannelUpdateState.js'

const event = (type, at, metadata) => ({ activity_type: type, created_at: at, metadata })
const failed = event('listing_price_changed', '2026-09-24T08:00:00Z', {
  action: 'price_reduction', channelResults: [
    { channel: 'Property24', status: 'sent' },
    { channel: 'Private Property', status: 'failed', detail: 'Timed out.' },
  ],
})
let state = deriveListingChannelUpdateStates([failed])
assert.equal(state.Property24.status, 'awaiting_verification')
assert.equal(state['Private Property'].status, 'needs_attention')
assert.equal(state['Private Property'].action, 'price_reduction')
assert.equal(state['Private Property'].detail, 'Timed out.')
assert.equal(deriveListingChannelUpdateStates([event('listing_under_offer', '2026-09-24T08:00:00Z', { channelResults: [{ channel: 'Property24', status: 'failed' }] })]).Property24.action, 'under_offer')

const started = event('listing_portal_update_started', '2026-09-24T07:00:00Z', {
  action: 'price_reduction', channelResults: [{ channel: 'Property24', status: 'pending' }],
})
assert.equal(deriveListingChannelUpdateStates([started], [{ channel: 'Property24', status: 'sent' }]).Property24.status, 'needs_attention', 'an unrecorded completion must not hide a durable pending update')

const retried = event('listing_portal_update_retried', '2026-09-24T09:00:00Z', {
  action: 'price_reduction', channelResults: [{ channel: 'Private Property', status: 'sent' }],
})
state = deriveListingChannelUpdateStates([failed, retried])
assert.equal(state['Private Property'].status, 'awaiting_verification')
assert.equal(state.Property24.status, 'awaiting_verification')

const verified = event('listing_portal_update_verified', '2026-09-24T10:00:00Z', {
  channel: 'Property24', action: 'price_reduction',
})
state = deriveListingChannelUpdateStates([verified, failed, retried])
assert.equal(state.Property24.status, 'current')
assert.equal(state['Private Property'].status, 'awaiting_verification')

const laterFailure = event('listing_sold', '2026-09-24T11:00:00Z', {
  action: 'sold', channelResults: [{ channel: 'Property24', status: 'failed', detail: 'Rejected.' }],
})
state = deriveListingChannelUpdateStates([failed, retried, verified, laterFailure])
assert.equal(state.Property24.status, 'needs_attention', 'a newer failed update must supersede earlier verification')
assert.equal(state.Property24.action, 'sold')
assert.equal(deriveListingChannelUpdateStates([], [{ channel: 'Property24', status: 'failed' }]).Property24.status, 'needs_attention')
assert.equal(deriveListingChannelUpdateStates([verified, event('listing_under_offer', '2026-09-24T12:00:00Z', { action: 'under_offer', channelResults: [{ channel: 'Property24', status: 'not_connected' }] })]).Property24.retriable, false)
assert.equal(deriveListingChannelUpdateStates([], [{ channel: 'Property24', status: 'failed' }], 'sold').Property24.action, 'sold')
assert.equal(deriveListingChannelUpdateStates([]).Property24, null)

const page = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
assert.match(page, /getPrivateListingActivity\(listingId, \{ requireAvailable: true \}\)/)
assert.match(page, /property24Update\?\.status === 'needs_attention' \? 'Needs attention'/)
assert.match(page, /privatePropertyUpdate\?\.status === 'awaiting_verification' \? 'Awaiting verification'/)
assert.match(page, /retryListingChannelUpdate\('Property24', property24Update.action\)/)
assert.match(page, /retryListingChannelUpdate\('Private Property', privatePropertyUpdate.action\)/)
assert.match(page, /confirmListingChannelCurrent\('Property24'/)
assert.match(page, /confirmListingChannelCurrent\('Private Property'/)
assert.match(page, /channelActivityUnavailable && property24HasReference/)
assert.match(page, /channelUpdateStates\.Property24\?\.status === 'current' && \['expired', 'removed', 'withdrawn'\]\.includes\(property24StatusKey\)/)
assert.match(page, /channelUpdateStates\['Private Property'\]\?\.status === 'current' && \['expired', 'removed', 'withdrawn'\]\.includes\(privatePropertyStatusKey\)/)

console.log('Listing channel update state contract passed')
