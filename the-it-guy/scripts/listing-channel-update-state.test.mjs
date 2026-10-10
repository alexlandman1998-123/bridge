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
assert.doesNotMatch(page, /contextTitle: property24Update/)
assert.doesNotMatch(page, /contextTitle: privatePropertyUpdate/)
assert.match(page, /initialResults=\{failedUpdates\}/)
assert.match(page, /saveSimpleChannelManagement\(channelName, values\)/)
assert.match(page, /channelUpdateStates\.Property24\?\.status === 'current' && \['expired', 'removed', 'withdrawn'\]\.includes\(property24StatusKey\)/)
assert.match(page, /channelUpdateStates\['Private Property'\]\?\.status === 'current' && \['expired', 'removed', 'withdrawn'\]\.includes\(privatePropertyStatusKey\)/)

const retrySource = page.slice(page.indexOf('async function retryListingChannelUpdate('), page.indexOf('async function confirmListingChannelCurrent('))
const calls = []
const retry = new Function('listingRecord', 'publishProperty24Listing', 'publishPrivatePropertyListing', 'setDetailError', `${retrySource}; return retryListingChannelUpdate;`)(
  { id: 'listing-1' },
  async () => { calls.push('Property24'); return 'p24-result' },
  async () => { calls.push('Private Property'); return 'pp-result' },
  (message) => calls.push(message),
)
for (const action of ['publish', 'update']) {
  assert.equal(await retry('Property24', action), 'p24-result')
  assert.equal(await retry('Private Property', action), 'pp-result')
}
assert.deepEqual(calls, ['Property24', 'Private Property', 'Property24', 'Private Property'])
await retry('Private Property', 'unknown')
assert.match(calls.at(-1), /cannot be retried/)

// Drive retries from the same failed-publication activity used by channel cards.
// A missing action on older failures defaults to publish, rather than a status update.
for (const channel of ['Property24', 'Private Property']) {
  for (const action of [undefined, 'publish', 'update']) {
    const failedPublication = event('listing_channel_publication_failed', '2026-10-01T07:10:43Z', {
      channel, action, error: 'Supplier rejected the previous request.',
    })
    const channelState = deriveListingChannelUpdateStates([failedPublication])[channel]
    assert.equal(channelState.status, 'needs_attention')
    assert.equal(await retry(channel, channelState.action), channel === 'Property24' ? 'p24-result' : 'pp-result')
    assert.equal(calls.at(-1), channel)
  }
}

const missingListingErrors = []
const retryWithoutListing = new Function('listingRecord', 'publishProperty24Listing', 'publishPrivatePropertyListing', 'setDetailError', `${retrySource}; return retryListingChannelUpdate;`)(
  null,
  async () => assert.fail('A missing listing must not be submitted'),
  async () => assert.fail('A missing listing must not be submitted'),
  (message) => missingListingErrors.push(message),
)
await retryWithoutListing('Private Property', 'publish')
assert.match(missingListingErrors.at(-1), /Reload this listing/)

console.log('Listing channel update state contract passed')

const websiteFailure = event('listing_sold', '2026-10-10T10:00:00Z', { action: 'sold', channelResults: [{ channel: 'Agency Website', action: 'sold', status: 'failed', detail: 'Website unavailable' }, { channel: 'Property24', action: 'expiry', status: 'failed' }] })
assert.equal(deriveListingChannelUpdateStates([websiteFailure])['Agency Website'].action, 'sold')
assert.equal(deriveListingChannelUpdateStates([websiteFailure]).Property24.action, 'expiry', 'A combined expiry/status retry retains the lifecycle action')
