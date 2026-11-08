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

const unsettled = () => Object.assign(new Error('Previous advertising request is unconfirmed.'), { code: 'LISTING_PUBLICATION_UNSETTLED' })

it.each(['under_offer', 'sold'])('saves %s and updates confirmed portals when the website request is uncertain', async listingStatus => {
  const { deps } = fixture({ checkPublication: vi.fn(async target => {
    if (target.channel === 'Agency Website') throw unsettled()
  }) })
  const outcome = await saveListingChannelManagement(input({ listingStatus, activeChannels: channels.slice(0, 3) }), deps)
  expect(deps.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ listingStatus }))
  expect(deps.sendUpdate.mock.calls.map(([target]) => target.channel)).toEqual(['Property24', 'Private Property'])
  expect(deps.recordStarted).toHaveBeenCalledWith(channels.slice(0, 2).map(channel => ({ channel, action: listingStatus })))
  expect(deps.recordStage.mock.calls.some(([target]) => target.channel === 'Agency Website')).toBe(false)
  expect(outcome).toMatchObject({ ok: false, results: [
    { channel: 'Arch9', status: 'saved' },
    { channel: 'Agency Website', action: listingStatus, status: 'uncertain', retryable: false },
    { channel: 'Property24', status: 'sent' },
    { channel: 'Private Property', status: 'sent' },
  ] })
  expect(outcome.results[1].detail).toContain('No new request was sent')
  const retry = fixture()
  await saveListingChannelManagement(input({ draft: { ...draft, listingStatus }, listingStatus, retryResults: outcome.results }), retry.deps)
  expect(retry.deps.sendUpdate).not.toHaveBeenCalled()
})

it('saves the property status without starting or retrying adverts when every channel is unsettled', async () => {
  const { deps } = fixture({ checkPublication: vi.fn(async () => { throw unsettled() }) })
  const outcome = await saveListingChannelManagement(input({ listingStatus: 'under_offer' }), deps)
  expect(deps.saveDraft).toHaveBeenCalledTimes(1)
  expect(deps.recordStarted).not.toHaveBeenCalled()
  expect(deps.recordStage).not.toHaveBeenCalled()
  expect(deps.sendUpdate).not.toHaveBeenCalled()
  expect(outcome.ok).toBe(false)
  expect(outcome.results.filter(row => row.status === 'uncertain')).toHaveLength(4)
  expect(deps.recordFinished).toHaveBeenCalledWith(outcome.results, 'under_offer')
})

it('fails closed on a status-read error rather than treating it as a known unsettled request', async () => {
  const { deps } = fixture({ checkPublication: vi.fn(async () => { throw new Error('Offline') }) })
  await expect(saveListingChannelManagement(input({ listingStatus: 'under_offer' }), deps)).rejects.toThrow('Offline')
  expect(deps.saveDraft).not.toHaveBeenCalled()
  expect(deps.sendUpdate).not.toHaveBeenCalled()
})

it('retains the unsettled guard for expiry edits and explicit failed-channel retries', async () => {
  for (const values of [{ expiryDate: '2026-12-31' }, { retryResults: [{ channel: 'Property24', action: 'under_offer', status: 'failed' }] }]) {
    const { deps } = fixture({ checkPublication: vi.fn(async () => { throw unsettled() }) })
    await expect(saveListingChannelManagement(input(values), deps)).rejects.toMatchObject({ code: 'LISTING_PUBLICATION_UNSETTLED' })
    expect(deps.saveDraft).not.toHaveBeenCalled()
    expect(deps.sendUpdate).not.toHaveBeenCalled()
  }
})

it('checks only Property24 for an expiry edit, leaving unrelated website jobs untouched', async () => {
  const { deps } = fixture({ checkPublication: vi.fn(async target => {
    if (target.channel === 'Agency Website') throw unsettled()
  }) })
  const outcome = await saveListingChannelManagement(input({ expiryDate: '2026-12-31' }), deps)
  expect(outcome.ok).toBe(true)
  expect(deps.checkPublication.mock.calls.map(([target]) => target.channel)).toEqual(['Property24'])
})
