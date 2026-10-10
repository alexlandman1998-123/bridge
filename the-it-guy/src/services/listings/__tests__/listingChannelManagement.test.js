import { describe, expect, it, vi } from 'vitest'
import { saveListingChannelManagement } from '../listingChannelManagement'

const channels = ['Property24', 'Private Property', 'Agency Website', 'Kingdom Website']
const draft = { listingStatus: 'active', listingType: 'sale', property24ExpiryDate: '2026-11-30', description: 'Saved description' }
function fixture(overrides = {}) {
  const calls = []
  const deps = {
    saveDraft: vi.fn(async (value) => { calls.push(['save', value]); return { ok: true } }),
    recordStarted: vi.fn(async () => { calls.push(['started']) }),
    recordStage: vi.fn(async (target, stage) => { calls.push([stage, target.channel]) }),
    sendUpdate: vi.fn(async (target, value) => { calls.push(['send', target.channel, target.action, value.listingStatus]) }),
    recordFinished: vi.fn(async () => {}),
    ...overrides,
  }
  return { deps, calls }
}
const input = (values = {}) => ({ channel: 'Property24', draft, listingStatus: 'active', expiryDate: draft.property24ExpiryDate, activeChannels: channels, ...values })

describe('listing channel management scope', () => {
  for (const status of ['under_offer', 'sold']) it(`${status} reaches every active channel from any selected row`, async () => {
    for (const selected of channels) {
      const { deps, calls } = fixture()
      const outcome = await saveListingChannelManagement(input({ channel: selected, listingStatus: status }), deps)
      expect(outcome.ok).toBe(true)
      expect(deps.sendUpdate.mock.calls.map(([target]) => target.channel)).toEqual(channels)
      expect(deps.sendUpdate.mock.calls.every(([, value]) => value.listingStatus === status)).toBe(true)
      expect(calls[0][0]).toBe('save')
      expect(calls.findIndex(([action]) => action === 'started')).toBeLessThan(calls.findIndex(([action]) => action === 'send'))
    }
  })
  it('expiry edits send only Property24, with one save and one send', async () => {
    const { deps } = fixture()
    await saveListingChannelManagement(input({ expiryDate: '2026-12-31' }), deps)
    expect(deps.saveDraft).toHaveBeenCalledTimes(1)
    expect(deps.saveDraft.mock.calls[0][0]).toMatchObject({ property24ExpiryDate: '2026-12-31', listingStatus: 'active' })
    expect(deps.sendUpdate.mock.calls.map(([target]) => target)).toEqual([{ channel: 'Property24', action: 'expiry' }])
  })
  it('a combined expiry and sale status update sends Property24 once and status to other live channels', async () => {
    const { deps } = fixture()
    await saveListingChannelManagement(input({ expiryDate: '2026-12-31', listingStatus: 'sold' }), deps)
    expect(deps.sendUpdate.mock.calls.map(([target]) => target)).toEqual(channels.map((channel) => ({ channel, action: channel === 'Property24' ? 'expiry' : 'sold' })))
  })
  it('never publishes an inactive channel as a side effect of a property status change', async () => {
    const { deps } = fixture()
    await saveListingChannelManagement(input({ listingStatus: 'sold', activeChannels: ['Agency Website'] }), deps)
    expect(deps.sendUpdate.mock.calls.map(([target]) => target.channel)).toEqual(['Agency Website'])
  })
  it('unchanged saves do not send listing content', async () => {
    const { deps } = fixture()
    await saveListingChannelManagement(input({ channel: 'Private Property' }), deps)
    expect(deps.sendUpdate).not.toHaveBeenCalled()
    expect(deps.saveDraft).not.toHaveBeenCalled()
  })
  it('keeps partial failures and retries only failed channels after sold was saved', async () => {
    const { deps } = fixture({ sendUpdate: vi.fn(async (target) => { if (target.channel === 'Agency Website') throw new Error('Website unavailable') }) })
    const first = await saveListingChannelManagement(input({ listingStatus: 'sold' }), deps)
    expect(first.ok).toBe(false)
    expect(first.results.filter((result) => result.status === 'failed')).toEqual([{ channel: 'Agency Website', action: 'sold', status: 'failed', detail: 'Website unavailable' }])
    const retry = fixture()
    const second = await saveListingChannelManagement(input({ draft: { ...draft, listingStatus: 'sold' }, listingStatus: 'sold', retryResults: first.results }), retry.deps)
    expect(second.ok).toBe(true)
    expect(retry.deps.sendUpdate.mock.calls.map(([target]) => target.channel)).toEqual(['Agency Website'])
  })
  it('does not send anything when save fails or is local only', async () => {
    for (const result of [{ ok: false }, { ok: true, localOnly: true }]) {
      const { deps } = fixture({ saveDraft: vi.fn(async () => result) })
      await expect(saveListingChannelManagement(input({ listingStatus: 'sold' }), deps)).rejects.toThrow()
      expect(deps.sendUpdate).not.toHaveBeenCalled()
    }
  })
  it('preserves unsent targets for retry when history cannot start', async () => {
    const { deps } = fixture({ recordStarted: vi.fn(async () => { throw new Error('History unavailable') }) })
    const outcome = await saveListingChannelManagement(input({ listingStatus: 'sold' }), deps)
    expect(outcome.ok).toBe(false)
    expect(deps.sendUpdate).not.toHaveBeenCalled()
    expect(outcome.results.filter((result) => result.status === 'failed').map((result) => result.channel)).toEqual(channels)
  })
  it('never retries an accepted submission when only its activity history fails', async () => {
    const { deps } = fixture({ recordStage: vi.fn(async (_, stage) => { if (stage === 'accepted') throw new Error('History unavailable') }) })
    const outcome = await saveListingChannelManagement(input({ listingStatus: 'sold' }), deps)
    expect(outcome.ok).toBe(false)
    expect(outcome.results.filter((result) => result.status === 'sent').map((result) => result.channel)).toEqual(channels)
    expect(outcome.results.filter((result) => result.status === 'failed').map((result) => result.channel)).toEqual(['Activity'])
    const retry = fixture()
    await saveListingChannelManagement(input({ draft: { ...draft, listingStatus: 'sold' }, listingStatus: 'sold', retryResults: outcome.results }), retry.deps)
    expect(retry.deps.sendUpdate).not.toHaveBeenCalled()
  })
  it('rejects accidental reopening of sold listings and sale statuses for rentals', async () => {
    for (const next of [{ draft: { ...draft, listingStatus: 'sold' }, listingStatus: 'under_offer' }, ...['rental', 'Rental'].map((listingType) => ({ draft: { ...draft, listingType }, listingStatus: 'sold' }))]) {
      const { deps } = fixture()
      await expect(saveListingChannelManagement(input(next), deps)).rejects.toThrow()
      expect(deps.saveDraft).not.toHaveBeenCalled()
    }
  })
})

it.each(['publish', 'update'])('rejects content %s retries in channel management', async action => {
  const { deps } = fixture()
  await expect(saveListingChannelManagement(input({ retryResults: [{ channel: 'Property24', action, status: 'failed' }] }), deps)).rejects.toThrow('listing setup')
  expect(deps.sendUpdate).not.toHaveBeenCalled()
})
it('cannot activate an unpublished Property24 listing through its expiry control', async () => {
  const { deps } = fixture()
  await expect(saveListingChannelManagement(input({ expiryDate: '2026-12-31', activeChannels: [] }), deps)).rejects.toThrow('listing setup')
  expect(deps.saveDraft).not.toHaveBeenCalled()
})
