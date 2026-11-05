import { expect, it, vi } from 'vitest'
import { hasActivePortalAdvert, updateExistingListingAdverts } from '../listingAdvertUpdates'

vi.mock('../../privateListingService', () => ({ getPrivateListing: vi.fn() }))
vi.mock('../../websiteListingPublicationService', () => ({ getWebsiteListingPublicationStatus: vi.fn() }))
vi.mock('../listingInitialPublicationService', () => ({ publishInitialListingChannels: vi.fn(), requireSettledListingPublication: vi.fn() }))
vi.mock('../../rentals/rentalListingChannelService', () => ({ getRentalPortalStatus: vi.fn() }))

function fixture(listing = {}) {
  const dependencies = {
    loadListing: vi.fn(async () => ({ id: 'listing', listingStatus: 'active', property24Status: 'published', property24Reference: '123', privatePropertyStatus: 'active', privatePropertyReference: 'RR1', ...listing })),
    websiteStatus: vi.fn(async () => ({ status: 'published', websiteStatus: 'published' })),
    portalStatus: vi.fn(async (_id, key) => key === 'property24' ? { lifecycle: { property24Status: listing.property24Status || 'published', listingNumber: listing.property24Reference ?? '123' } } : { monitor: { externalStatus: listing.privatePropertyStatus || 'active' } }),
    settled: vi.fn(async () => []),
    publish: vi.fn(async ({ channels }) => channels.map(key => ({ key, label: key, status: 'publishing', jobId: `job-${key}` }))),
  }
  const input = { listingId: 'listing', listingStatus: 'active', channels: ['property24', 'private_property', 'agency_website'], requestKey: 'one-edit' }
  return { dependencies, input, run: overrides => updateExistingListingAdverts({ ...input, ...overrides }, dependencies) }
}

it('checks saved identities and queues each active advert with the same edit key', async () => {
  const { run, dependencies } = fixture()
  const results = await run()
  expect(results).toHaveLength(3)
  expect(dependencies.publish.mock.calls.map(([input]) => input)).toEqual(['property24', 'private_property', 'agency_website'].map(key => expect.objectContaining({ channels: [key], action: 'update', requestKey: 'one-edit' })))
  expect(dependencies.loadListing.mock.invocationCallOrder[0]).toBeLessThan(dependencies.publish.mock.invocationCallOrder[0])
})
it.each(['withdrawn', 'expired', 'inactive', 'removed', 'not_published', 'draft', 'unknown'])('never relists an advert with %s status', async status => {
  const { run, dependencies } = fixture({ property24Status: status })
  const results = await run({ channels: ['property24'] })
  expect(results[0].status).toBe('skipped')
  expect(dependencies.publish).not.toHaveBeenCalled()
})
it('never creates a new portal advert from an old channel selection', async () => {
  const { run, dependencies } = fixture({ property24Reference: '' })
  await run({ channels: ['property24'] })
  expect(dependencies.publish).not.toHaveBeenCalled()
})
it('never republishes a withdrawn website advert', async () => {
  const { run, dependencies } = fixture()
  dependencies.websiteStatus.mockResolvedValue({ status: 'unpublished', websiteStatus: 'published' })
  expect((await run({ channels: ['agency_website'] }))[0].status).toBe('skipped')
  expect(dependencies.publish).not.toHaveBeenCalled()
})
it('uses the newer channel status instead of an old published listing flag', async () => {
  const { run, dependencies } = fixture()
  dependencies.portalStatus.mockResolvedValue({ lifecycle: { property24Status: 'withdrawn', listingNumber: '123' } })
  expect((await run({ channels: ['property24'] }))[0].status).toBe('skipped')
  expect(dependencies.publish).not.toHaveBeenCalled()
})
it('keeps a blocked channel separate and still updates the other settled channels', async () => {
  const { run, dependencies } = fixture()
  dependencies.settled.mockImplementation(async (_id, [channel]) => {
    if (channel === 'property24') throw new Error('Previous request is unconfirmed.')
    return []
  })
  const results = await run()
  expect(results[0]).toMatchObject({ key: 'property24', status: 'uncertain', retryable: false, notSent: true })
  expect(dependencies.publish.mock.calls.map(([input]) => input.channels)).toEqual([['private_property'], ['agency_website']])
})
it('does not offer a blind retry after a lost queue response', async () => {
  const { run, dependencies } = fixture()
  dependencies.publish.mockRejectedValue(new Error('Response lost. Check status.'))
  expect((await run({ channels: ['property24'] }))[0]).toMatchObject({ status: 'uncertain', retryable: false, notSent: false })
  expect(dependencies.publish).toHaveBeenCalledTimes(1)
})
it('shows a failed status read per channel without sending or claiming that saving failed', async () => {
  const { run, dependencies } = fixture()
  dependencies.loadListing.mockRejectedValue(new Error('Status read unavailable.'))
  const onResult = vi.fn()
  const results = await run({ onResult })
  expect(results).toHaveLength(3)
  expect(results.every(row => row.notSent && !row.retryable)).toBe(true)
  expect(onResult).toHaveBeenCalledTimes(3)
  expect(dependencies.publish).not.toHaveBeenCalled()
})
it('rechecks durable failures and excludes accepted channels from a targeted retry', async () => {
  const { run, dependencies } = fixture()
  dependencies.settled.mockResolvedValue([{ key: 'property24', retryable: false }, { key: 'private_property', retryable: true }])
  await run({ retryOnly: true })
  expect(dependencies.publish).toHaveBeenCalledTimes(1)
  expect(dependencies.publish).toHaveBeenCalledWith(expect.objectContaining({ channels: ['private_property'] }))
})
it('does not send when the current saved listing is no longer active', async () => {
  const { run, dependencies } = fixture({ listingStatus: 'withdrawn' })
  expect(await run()).toEqual([])
  expect(dependencies.publish).not.toHaveBeenCalled()
})
it('automatically blocks incomplete public copy after saving, before queuing any advert', async () => {
  const { run, dependencies } = fixture()
  const results = await run({ form: { propertyAddress: '12 Test Road', monthlyRent: 12000, selectedSyndicationChannels: ['property24'] }, rental: true, channels: ['property24'] })
  expect(results[0]).toMatchObject({ status: 'needs_attention', notSent: true, retryable: false })
  expect(results[0].message).toMatch(/description|photo/)
  expect(dependencies.publish).not.toHaveBeenCalled()
})
it('recognizes the stored snake-case portal fields', () => {
  expect(hasActivePortalAdvert({ private_property_status: 'ToLet', private_property_reference: 'rr123' }, 'private_property')).toBe(true)
})
it('retains an existing active Private Property feed identity while its public number is unavailable', () => {
  expect(hasActivePortalAdvert({}, 'private_property', { monitor: { externalStatus: 'active', propertyId: 'existing-feed', branchGuid: 'existing-branch' } })).toBe(true)
})
it('allows correction of a failed update when the portal still confirms the existing advert is live', () => {
  expect(hasActivePortalAdvert({}, 'property24', { lifecycle: { property24Status: 'failed', isOnPortal: true, listingNumber: '123' } })).toBe(true)
  expect(hasActivePortalAdvert({}, 'property24', { lifecycle: { property24Status: 'withdrawn', isOnPortal: true, listingNumber: '123' } })).toBe(false)
})
