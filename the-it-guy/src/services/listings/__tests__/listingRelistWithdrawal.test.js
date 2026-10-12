import { expect, it, vi } from 'vitest'
import { createListingRelistPortalActions, readListingRelistCheckpoints, relistListingChannels } from '../listingRelistService.js'

const channels = ['Property24', 'Private Property']
const snapshot = { price: '1000000', description: 'Saved edits', listingStatus: 'active' }
function fixture(initial = true) {
  const events = [], histories = {}, live = Object.fromEntries(channels.map(c => [c, initial]))
  const dependencies = Object.fromEntries(channels.map(channel => [channel, {
    prepare: vi.fn(async () => channel === 'Property24' ? { canSubmit: true, identity: { listingNumber: '123' } } : { ready: live[channel], blockers: live[channel] ? [] : ['private_property_reactivation_required'], recovery: { checked: true, propertyId: 'pp-id', branchGuid: 'branch', externalStatus: live[channel] ? 'active' : 'inactive', canReactivate: !live[channel], listingType: 'Sale' } }),
    observeState: vi.fn(async () => live[channel]),
    withdraw: vi.fn(async () => { events.push(`withdraw:${channel}`); live[channel] = false }),
    activate: vi.fn(async () => { events.push(`activate:${channel}`); live[channel] = true; return { confirmed: true } }),
    publish: vi.fn(async () => { events.push(`publish:${channel}`); live[channel] = true; return { status: 'SUBMITTED', reference: '123' } }),
    observe: vi.fn(async () => live[channel]), beforeSend: vi.fn(async () => {}),
    recordCheckpoint: vi.fn(async row => { histories[channel] = row }), recordPublication: vi.fn(async () => {}),
  }]))
  const run = previousResults => relistListingChannels({ listingId: 'listing', channels, snapshot, previousResults, checkpoints: histories }, c => dependencies[c])
  return { events, dependencies, live, histories, run }
}
it('withdraws both live adverts and confirms both offline before publishing either', async () => {
  const f = fixture()
  expect((await f.run()).every(r => r.status === 'completed')).toBe(true)
  expect(f.events).toEqual(['withdraw:Property24', 'withdraw:Private Property', 'publish:Property24', 'activate:Private Property', 'publish:Private Property'])
})
it('skips withdrawal for already inactive adverts', async () => {
  const f = fixture(false)
  expect((await f.run()).every(r => r.status === 'completed')).toBe(true)
  channels.forEach(c => expect(f.dependencies[c].withdraw).not.toHaveBeenCalled())
})
it('waits for delayed removal on one portal and resumes without withdrawing the other twice', async () => {
  const f = fixture()
  f.dependencies['Private Property'].withdraw.mockImplementation(async () => { f.events.push('withdraw:Private Property') })
  const first = await f.run()
  expect(first.map(r => r.status)).toEqual(['ready', 'pending'])
  channels.forEach(c => expect(f.dependencies[c].publish).not.toHaveBeenCalled())
  await f.run(first)
  channels.forEach(c => expect(f.dependencies[c].withdraw).toHaveBeenCalledOnce())
  f.live['Private Property'] = false
  expect((await f.run(first)).every(r => r.status === 'completed')).toBe(true)
  channels.forEach(c => expect(f.dependencies[c].withdraw).toHaveBeenCalledOnce())
})
it('retains withdrawal intent after a lost response and checks removal after a page refresh', async () => {
  const f = fixture()
  f.dependencies.Property24.withdraw.mockImplementation(async () => { throw new Error('Lost response') })
  expect((await f.run()).find(r => r.channel === 'Property24').status).toBe('pending')
  await f.run()
  expect(f.dependencies.Property24.withdraw).toHaveBeenCalledOnce()
  f.live.Property24 = false
  expect((await f.run()).every(r => r.status === 'completed')).toBe(true)
  expect(f.dependencies.Property24.withdraw).toHaveBeenCalledOnce()
})
it('blocks an address mismatch before withdrawing either portal', async () => {
  const f = fixture()
  f.dependencies['Private Property'].prepare.mockResolvedValue({ blockers: ['private_property_locked_address_mismatch'], recovery: { checked: true, propertyId: 'pp-id' } })
  expect((await f.run()).every(r => r.status === 'blocked')).toBe(true)
  channels.forEach(c => { expect(f.dependencies[c].withdraw).not.toHaveBeenCalled(); expect(f.dependencies[c].publish).not.toHaveBeenCalled() })
})
it('cannot infer removal from an unknown status and never sends without durable intent', async () => {
  const f = fixture()
  f.dependencies.Property24.observeState.mockResolvedValue(null)
  await f.run()
  channels.forEach(c => expect(f.dependencies[c].withdraw).not.toHaveBeenCalled())
  const second = fixture()
  second.dependencies.Property24.recordCheckpoint.mockRejectedValue(new Error('History unavailable'))
  await second.run()
  expect(second.dependencies.Property24.withdraw).not.toHaveBeenCalled()
  channels.forEach(c => expect(second.dependencies[c].publish).not.toHaveBeenCalled())
})
it('a continuation after accepted content never withdraws the republished adverts again', async () => {
  const f = fixture()
  f.dependencies['Private Property'].observe.mockResolvedValue(false)
  const first = await f.run()
  expect(first.find(r => r.channel === 'Private Property').status).toBe('pending')
  f.dependencies['Private Property'].observe.mockResolvedValue(true)
  const result = await relistListingChannels({ listingId: 'listing', channels: ['Private Property'], snapshot, previousResults: first, checkpoints: f.histories }, c => f.dependencies[c])
  expect(result.every(r => r.status === 'completed')).toBe(true)
  expect(f.dependencies['Private Property'].withdraw).toHaveBeenCalledOnce()
  expect(f.dependencies['Private Property'].publish).toHaveBeenCalledOnce()
})
it('uses explicit inactive/withdrawn contracts and requires known matching portal state', async () => {
  const callProperty24 = vi.fn(async () => ({ status: { listingNumber: '123', lifecycle: { isOnPortal: false } } }))
  const callPrivateProperty = vi.fn(async () => ({ monitor: { externalStatus: 'inactive' } }))
  const p24 = createListingRelistPortalActions({ listingId: 'listing', channel: 'Property24', property24Reference: '123', callProperty24 })
  const pp = createListingRelistPortalActions({ listingId: 'listing', channel: 'Private Property', callPrivateProperty })
  await p24.withdraw(); await pp.withdraw()
  expect(callProperty24).toHaveBeenCalledWith('status-update', { environment: 'production', listingNumber: '123', status: 'Withdrawn' })
  expect(callPrivateProperty).toHaveBeenCalledWith('status-update', { propertyStatus: 'Inactive' })
  expect(await p24.observeState()).toBe(false); expect(await pp.observeState()).toBe(false)
  callProperty24.mockResolvedValue({ status: { listingNumber: 'wrong', lifecycle: { isOnPortal: false } } })
  expect(await p24.observeState()).toBeNull()
  callPrivateProperty.mockResolvedValue({ monitor: { externalStatus: 'unknown' } })
  expect(await pp.observeState()).toBeNull()
})

it('a reopened unfinished batch retains its completed portal without another withdrawal', async () => {
  const f = fixture()
  f.dependencies['Private Property'].observe.mockResolvedValue(false)
  await f.run()
  const rows = channels.map(channel => ({ activity_type: 'listing_relist_progress', created_at: new Date().toISOString(), metadata: f.histories[channel] }))
  const checkpoints = readListingRelistCheckpoints(rows)
  expect(checkpoints.Property24.phase).toBe('completed')
  f.dependencies['Private Property'].observe.mockResolvedValue(true)
  const results = await relistListingChannels({ listingId: 'listing', channels, snapshot, checkpoints }, c => f.dependencies[c])
  expect(results.every(row => row.status === 'completed')).toBe(true)
  channels.forEach(c => { expect(f.dependencies[c].withdraw).toHaveBeenCalledOnce(); expect(f.dependencies[c].publish).toHaveBeenCalledOnce() })
  const completed = channels.map(channel => ({ activity_type: 'listing_relist_progress', created_at: new Date().toISOString(), metadata: f.histories[channel] }))
  expect(readListingRelistCheckpoints(completed)).toEqual({})
})

it('retains the full selected scope when a withdrawal is definitely rejected', async () => {
  const f = fixture()
  f.dependencies.Property24.withdraw.mockRejectedValueOnce(Object.assign(new Error('Rejected'), { definiteRejection: true }))
  const failed = await f.run()
  expect(new Set(failed.map(row => row.channel))).toEqual(new Set(channels))
  expect(failed.find(row => row.channel === 'Property24').status).toBe('failed')
  expect(f.dependencies['Private Property'].withdraw).not.toHaveBeenCalled()
  expect((await f.run(failed)).every(row => row.status === 'completed')).toBe(true)
  expect(f.events.indexOf('publish:Property24')).toBeGreaterThan(f.events.indexOf('withdraw:Private Property'))
})
