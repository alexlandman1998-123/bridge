import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import test from 'node:test'
import { applyListingWithdrawalResults, buildListingWithdrawalPlan, listingWithdrawalIsComplete } from '../src/services/listings/listingWithdrawalModel.js'

const detailSource = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const modelSource = readFileSync(new URL('../src/services/listings/listingWithdrawalModel.js', import.meta.url), 'utf8')

assert.match(detailSource, /Other channels stay as they are\./, 'The Marketing tab must explain selected-channel withdrawal.')
assert.doesNotMatch(detailSource, /Need to remove this listing from the market\?/, 'The Marketing tab must not add a competing global withdrawal shortcut.')
assert.match(detailSource, /callProperty24ListingAction\('withdraw'/, 'Unified withdrawal must remove the Property24 listing.')
assert.match(detailSource, /propertyStatus: 'Inactive'/, 'Unified withdrawal must inactivate Private Property.')
assert.match(detailSource, /setWebsiteListingPublication\(listingRecord\.id, 'unpublish'\)/, 'Unified withdrawal must unpublish the agency website listing.')
assert.match(detailSource, /publishKingdomWebsiteListing\(listingRecord\.id, 'unpublish'\)/, 'Unified withdrawal must unpublish the Kingdom website listing.')
assert.match(detailSource, /Retry remaining channels/, 'Failed channel withdrawals must remain retryable.')
assert.match(detailSource, /activityType: completeBeforeSave \? 'listing_withdrawn' : 'listing_withdrawal_incomplete'/, 'Complete and partial withdrawal attempts must be auditable.')
assert.match(modelSource, /listingWithdrawalIsComplete/, 'The listing must have an explicit all-channel completion gate.')
assert.match(modelSource, /listingStatus: 'withdrawn'/, 'The listing must only transition to withdrawn through the completion model.')

console.log('Listing marketing phase 5 withdrawal contract passed')

// Execute the controller's real withdrawal functions with local service doubles.
// These probes never call a database or a marketing portal.
function controllerFunction(name, nextName) {
  const start = detailSource.indexOf(`  async function ${name}(`)
  const end = detailSource.indexOf(`\n  async function ${nextName}(`, start)
  assert.ok(start >= 0 && end > start)
  return detailSource.slice(start, end)
}

function withdrawalContext({ dirty = true, saveResult, savedListing } = {}) {
  const events = []
  const original = { id: 'fixture-listing', listingStatus: 'active', status: 'active', description: 'Original description', askingPrice: 1000000, propertyDetails: { listingStatus: 'active', description: 'Original description', price: 1000000 } }
  const draft = { listingStatus: 'active', publicationStatus: 'Published', price: '1250000', description: 'Edited description', galleryImages: [{ id: 'photo', url: 'blob:pending-photo' }], floorplans: [], selectedFeatures: [], amenities: [], externalLinks: [], headline: 'Fixture', addressLine1: 'Fixture address', suburb: 'Fixture suburb', province: 'Fixture province', propertyType: 'House', listingType: 'Sale' }
  let persisted = original
  const context = {
    marketingDraft: draft,
    marketingDraftDirtyRef: { current: dirty },
    listingRecord: original,
    listingWithdrawalResults: [],
    property24Reference: 'fixture-reference',
    getListingWithdrawalPlan: () => buildListingWithdrawalPlan({ property24Live: true, property24Reference: 'fixture-reference', agencyWebsiteLive: true, arch9Live: true }),
    applyListingWithdrawalResults, listingWithdrawalIsComplete,
    saveMarketingDraft: async value => {
      events.push('save')
      context.saveDraft = value
      if (!saveResult || saveResult.ok && !saveResult.localOnly) {
        persisted = { ...original, askingPrice: Number(value.price), description: value.description, propertyDetails: { ...original.propertyDetails, price: Number(value.price), description: value.description } }
        context.marketingDraftDirtyRef.current = false
      }
      return saveResult ?? { ok: true, draft: { ...value, galleryImages: [{ id: 'photo', url: 'https://fixture.invalid/saved-photo.jpg' }] } }
    },
    callProperty24ListingAction: async () => { events.push('property24'); },
    callPrivatePropertyListingAction: async () => { events.push('private-property'); },
    setWebsiteListingPublication: async () => { events.push('website'); return {}; },
    publishKingdomWebsiteListing: async () => { events.push('kingdom'); return {}; },
    setAgencyWebsitePublication: () => {}, setKingdomWebsitePublication: () => {},
    setListingWithdrawalResults: value => { context.results = value; },
    setListingWithdrawalComplete: value => { context.complete = value; },
    setPublicationSaving: value => { context.busy = value; },
    setDetailMessage: value => { context.message = value; },
    setDetailError: value => { context.error = value; },
    recordListingWithdrawalChannelResults: async () => {},
    createPrivateListingActivity: async () => ({}),
    loadListingData: async () => { events.push('reload'); },
    window: { dispatchEvent: () => {} }, Event: class {},
    updatePrivateListing: async (_id, patch) => { context.patch = patch; persisted = { ...persisted, ...patch }; return savedListing ?? persisted; },
    syncPrivateListingDistributionData: async (_id, payload) => { context.distribution = payload; return { publication: { listing_id: original.id } }; },
    setMarketingDraft: value => { context.nextDraft = value; },
    markMarketingDraftDirty: value => { context.markedDirty = value; },
    clearStoredMarketingDraft: () => { context.clearedRecovery = true; },
    setPrivateListings: updater => { context.displayRecord = updater([original])[0]; },
    upsertListingRecord: (_rows, incoming) => [incoming],
  }
  vm.createContext(context)
  const mergeStart = detailSource.indexOf('function mergeListingRecord(')
  const mergeEnd = detailSource.indexOf('\nfunction upsertListingRecord(', mergeStart)
  vm.runInContext(`${detailSource.slice(mergeStart, mergeEnd)}\n${controllerFunction('persistListingWithdrawalState', 'recordListingWithdrawalChannelResults')}\n${controllerFunction('withdrawListingFromMarketing', 'prepareAgencyWebsiteListing')}\nthis.withdraw = withdrawListingFromMarketing; this.persist = persistListingWithdrawalState;`, context)
  return { context, events, draft, original }
}

test('withdrawal saves pending edits before any channel changes and uses uploaded media', async () => {
  const { context, events } = withdrawalContext()
  await context.withdraw()
  assert.deepEqual(events, ['save', 'property24', 'website', 'reload'])
  assert.equal(context.saveDraft.publicationStatus, 'Draft', 'Saving for withdrawal must not publish the edits')
  assert.equal(context.distribution.publicationData.askingPrice, 1250000)
  assert.equal(context.distribution.publicationData.description, 'Edited description')
  assert.equal(context.distribution.media.galleryImages[0].url, 'https://fixture.invalid/saved-photo.jpg')
  assert.equal(context.complete, true)
  assert.equal(context.displayRecord.listingStatus, 'withdrawn')
  assert.equal(context.displayRecord.description, 'Edited description')
  assert.equal(context.displayRecord.askingPrice, 1250000)
})

test('failed edit saves stop withdrawal and retain the recovery draft', async () => {
  const { context, events } = withdrawalContext({ saveResult: { ok: false, error: new Error('Fixture save failed') } })
  await context.withdraw()
  assert.deepEqual(events, ['save'])
  assert.equal(context.clearedRecovery, undefined)
  assert.equal(context.markedDirty, undefined)
  assert.equal(context.marketingDraftDirtyRef.current, true)
  assert.equal(context.busy, false)
  assert.match(context.error, /Fixture save failed/)
})

test('browser-only saves never authorize remote withdrawal', async () => {
  const { context, events } = withdrawalContext({ saveResult: { ok: true, localOnly: true } })
  await context.withdraw()
  assert.deepEqual(events, ['save'])
  assert.equal(context.clearedRecovery, undefined)
  assert.equal(context.busy, false)
})

test('clean listings can be withdrawn without resaving content', async () => {
  const { context, events } = withdrawalContext({ dirty: false })
  await context.withdraw()
  assert.deepEqual(events, ['property24', 'website', 'reload'])
  assert.equal(context.displayRecord.listingStatus, 'withdrawn')
})

test('freshly saved listing values and status win over the old screen snapshot', async () => {
  const savedListing = { id: 'fixture-listing', listingStatus: 'withdrawn', status: 'withdrawn', description: 'Edited description', askingPrice: 1250000, updatedAt: '2026-10-09T06:00:00Z', propertyDetails: { listingStatus: 'withdrawn', description: 'Edited description', price: 1250000 } }
  const { context, draft } = withdrawalContext({ dirty: false, savedListing })
  await context.persist(applyListingWithdrawalResults(draft, [], { complete: true }), true)
  assert.equal(context.displayRecord.listingStatus, 'withdrawn')
  assert.equal(context.displayRecord.description, 'Edited description')
  assert.equal(context.displayRecord.askingPrice, 1250000)
  assert.equal(context.displayRecord.propertyDetails.price, 1250000)
  assert.equal(context.displayRecord.updatedAt, savedListing.updatedAt)
})

test('partial channel failures keep saved edits and retain successful removals for retry', async () => {
  const { context, events } = withdrawalContext()
  context.callProperty24ListingAction = async () => { events.push('property24'); throw new Error('Fixture portal failed'); }
  await context.withdraw()
  assert.equal(context.complete, false)
  assert.equal(context.displayRecord.description, 'Edited description')
  assert.equal(context.displayRecord.askingPrice, 1250000)
  assert.equal(context.displayRecord.listingStatus, 'active')
  context.listingWithdrawalResults = context.results
  context.marketingDraft = context.nextDraft
  context.callProperty24ListingAction = async () => { events.push('property24-retry'); }
  await context.withdraw()
  assert.deepEqual(events, ['save', 'property24', 'website', 'reload', 'property24-retry', 'reload'])
  assert.equal(context.complete, true)
  assert.equal(context.displayRecord.listingStatus, 'withdrawn')
  assert.equal(context.displayRecord.description, 'Edited description')
  assert.equal(context.displayRecord.askingPrice, 1250000)
})

test('unified withdrawal calls the Kingdom service and records the returned status', async () => {
  const { context, events } = withdrawalContext({ dirty: false })
  context.getListingWithdrawalPlan = () => buildListingWithdrawalPlan({ kingdomWebsiteLive: true })
  context.setKingdomWebsitePublication = publication => { context.kingdomStatus = publication }
  await context.withdraw()
  assert.deepEqual(events, ['kingdom', 'reload'])
  assert.deepEqual(context.kingdomStatus, {})
  assert.equal(context.complete, true)
})


test('each simplified removal acts on exactly the selected channel and keeps the property status', async () => {
  const removeStart = detailSource.indexOf('  async function removeSelectedChannel()')
  const removeEnd = detailSource.indexOf('  async function applyQuickListingAction()', removeStart)
  const source = detailSource.slice(removeStart, removeEnd)
  for (const [channel, action, expected] of [
    ['Property24', 'withdraw', 'p24-withdraw'], ['Property24', 'expire', 'p24-expire'],
    ['Private Property', 'withdraw', 'pp-withdraw'], ['Agency Website', 'withdraw', 'agency-withdraw'], ['Kingdom Website', 'withdraw', 'kingdom-withdraw'],
  ]) {
    const calls = []
    const context = {
      channelRemoval: { channel, action }, channelMutationRef: { current: false },
      listingRecord: { id: 'fixture-listing', listingStatus: 'active' }, marketingDraft: { listingStatus: 'active' },
      setChannelManageBusy() {}, setChannelRemovalError() {}, setAgencyWebsitePublication() {}, setKingdomWebsitePublication() {},
      setWebsiteRefreshKey() {}, setChannelRemoval() {}, setDetailMessage() {}, setQuickListingResults() {},
      loadListingData: async () => {},
      expireProperty24Listing: async (options) => { assert.equal(options.skipConfirmation, true); calls.push('p24-expire'); return { status: 'SUBMITTED' } },
      withdrawProperty24Listing: async (options) => { assert.equal(options.skipConfirmation, true); calls.push('p24-withdraw'); return { status: 'SUBMITTED' } },
      expirePrivatePropertyListing: async (options) => { assert.equal(options.skipConfirmation, true); calls.push('pp-withdraw'); return { update: { status: 'UPDATED' } } },
      setWebsiteListingPublication: async (_, selectedAction) => { assert.equal(selectedAction, 'unpublish'); calls.push('agency-withdraw'); return { status: 'unpublished' } },
      publishKingdomWebsiteListing: async (_, selectedAction) => { assert.equal(selectedAction, 'unpublish'); calls.push('kingdom-withdraw'); return { status: 'unpublished' } },
      createPrivateListingActivity: async (event) => { assert.equal(event.metadata.channel, channel); return { id: 'event' } },
    }
    vm.createContext(context)
    vm.runInContext(`${source}; this.removeSelected = removeSelectedChannel`, context)
    await context.removeSelected()
    assert.deepEqual(calls, [expected])
    assert.equal(context.marketingDraft.listingStatus, 'active')
    assert.equal(context.listingRecord.listingStatus, 'active')
    assert.equal(context.channelMutationRef.current, false)
  }
})
