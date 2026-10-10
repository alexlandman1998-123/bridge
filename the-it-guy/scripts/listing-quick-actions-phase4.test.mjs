import assert from 'node:assert/strict'
import vm from 'node:vm'
import test from 'node:test'
import { saveListingChannelManagement } from '../src/services/listings/listingChannelManagement.js'
import { readFileSync } from 'node:fs'
import { isQuickListingPortalUpdateAccepted } from '../src/services/listings/listingQuickActionDelivery.js'

assert.equal(isQuickListingPortalUpdateAccepted('Property24', 'price_reduction', { status: 'SUBMITTED' }), true)
assert.equal(isQuickListingPortalUpdateAccepted('Property24', 'price_reduction', { status: 'READY_TO_APPLY' }), false)
assert.equal(isQuickListingPortalUpdateAccepted('Property24', 'sold', { status: 'FAILED' }), false)
assert.equal(isQuickListingPortalUpdateAccepted('Private Property', 'price_reduction', { status: 'SUBMITTED' }), true)
assert.equal(isQuickListingPortalUpdateAccepted('Private Property', 'sold', { update: { status: 'UPDATED' } }), true)
assert.equal(isQuickListingPortalUpdateAccepted('Private Property', 'sold', { status: 'SUBMITTED' }), false)

const listingPage = readFileSync(new URL('../src/pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
const privatePropertyStatus = readFileSync(new URL('../server/services/privatePropertyListingStatusUpdateService.js', import.meta.url), 'utf8')

assert.match(listingPage, /data-testid="listing-quick-actions"/)
assert.match(listingPage, /openQuickListingAction\('under_offer'\)/)
assert.match(listingPage, /openQuickListingAction\('sold'\)/)
assert.match(listingPage, /openQuickListingAction\('price_reduction'\)/)
assert.ok(listingPage.indexOf('Selling Points') < listingPage.indexOf('{renderListingQuickActions()}', listingPage.indexOf('Selling Points')))
assert.match(listingPage, /isActive: \['active', 'under_offer'\]/)
assert.match(listingPage, /status: action === 'sold' \? 'Sold' : 'Pending'/)
assert.match(listingPage, /photosChanged: false/)
assert.match(listingPage, /\? 'Pending' : 'ReducedPrice'/)
assert.match(listingPage, /propertyStatus: action === 'sold' \? 'Sold' : 'PendingOffer'/)
assert.match(listingPage, /activityType: isPriceChange \? 'listing_price_changed' : isSold \? 'listing_sold' : 'listing_under_offer'/)
assert.match(listingPage, /previousPrice, nextPrice/)
assert.match(listingPage, /results\.push\(\{ channel, status: 'failed'/)
assert.match(listingPage, /isQuickListingPortalUpdateAccepted\(channel, quickListingAction, response\)/)
const applyActionSource = listingPage.slice(listingPage.indexOf('async function applyQuickListingAction()'), listingPage.indexOf('async function verifyArch9PublicListing('))
assert.ok(applyActionSource.indexOf('await saveMarketingDraft(nextDraft') < applyActionSource.indexOf('await sendQuickListingPortalUpdate(channel, quickListingAction)'))
assert.ok(applyActionSource.indexOf("activityType: 'listing_portal_update_started'") < applyActionSource.indexOf('await sendQuickListingPortalUpdate(channel, quickListingAction)'))
assert.match(listingPage, /Retry failed updates/)
assert.match(listingPage, /nextPrice >= previousPrice/)
assert.match(listingPage, /!isPriceChange && !isSold && normalizeKey\(marketingDraft\.listingStatus\) === 'under_offer'/)
assert.match(listingPage, /showReducedBanner: false/)
assert.match(listingPage, /portal support not confirmed/)
assert.match(listingPage, /draft\.showReducedBanner \? \['reduced_banner'\] : \[\]/)
assert.match(privatePropertyStatus, /propertyStatus,/)

console.log('Listing quick actions phase 4 contract passed')


function simpleController() {
  const calls = []
  const context = {
    channelMutationRef: { current: false }, listingId: 'listing-1', listingRecord: { id: 'listing-1' }, isSupabaseConfigured: true,
    marketingDraft: { listingStatus: 'active', listingType: 'sale', property24ExpiryDate: '2026-11-30' }, marketingDraftDirtyRef: { current: false },
    property24Published: true, property24Reference: 'p24-1', privatePropertyExternalStatus: 'active', privatePropertyStatusKey: 'published',
    agencyWebsitePublication: { status: 'published' }, kingdomWebsitePublication: { status: 'published' },
    getWebsiteListingPublicationStatus: async () => { calls.push(['read-agency']); return { status: 'published', websiteStatus: 'published', projectionStatus: 'Published' } },
    getKingdomWebsitePublicationStatus: async () => { calls.push(['read-kingdom']); return { status: 'published', websiteStatus: 'published', projectionStatus: 'Published' } },
    getProperty24ExpiryDateError: () => '', readInitialListingChannelResults: () => [], getProperty24ActionContext: () => ({ listingNumber: 'p24-1' }),
    saveListingChannelManagement, isQuickListingPortalUpdateAccepted, normalizeKey: value => String(value || '').toLowerCase(),
    setChannelManageBusy() {}, setDetailError() {}, setDetailMessage() {}, setAgencyWebsitePublication() {}, setKingdomWebsitePublication() {},
    setWebsiteRefreshKey() {}, setQuickListingResults() {}, setQuickListingResultAction() {},
    saveMarketingDraft: async (draft) => { calls.push(['save', { ...draft }]); return { ok: true } },
    callProperty24ListingAction: async (action, body) => { calls.push(['Property24', action, body]); return { status: 'SUBMITTED' } },
    callPrivatePropertyListingAction: async (action, body) => { calls.push(['Private Property', action, body]); return action === 'publish' ? { status: 'SUBMITTED' } : { update: { status: 'UPDATED' } } },
    setWebsiteListingPublication: async (_, action) => { calls.push(['Agency Website', action]); return { status: 'published', websiteStatus: 'published', projectionStatus: 'Published' } },
    publishKingdomWebsiteListing: async (_, action) => { calls.push(['Kingdom Website', action]); return { status: 'published', websiteStatus: 'published', projectionStatus: 'Published' } },
    createPrivateListingActivity: async () => ({ id: 'event' }), recordListingPublicationStage: async () => {}, loadListingData: async () => {},
    window: { dispatchEvent() {} }, Event: class {},
  }
  vm.createContext(context)
  const send = listingPage.slice(listingPage.indexOf('  async function sendQuickListingPortalUpdate('), listingPage.indexOf('  async function retryFailedQuickListingChannels('))
  const save = listingPage.slice(listingPage.indexOf('  async function saveSimpleChannelManagement('), listingPage.indexOf('  async function removeSelectedChannel('))
  vm.runInContext(`${send}\n${save}; this.saveSimple = saveSimpleChannelManagement`, context)
  return { context, calls }
}

test('the real simple controller saves sale status and sends its mapped status to portals and both websites', async () => {
  for (const status of ['sold', 'under_offer']) {
    const { context, calls } = simpleController()
    const outcome = await context.saveSimple('Private Property', { listingStatus: status, expiryDate: '2026-11-30', retryResults: [] })
    assert.equal(outcome.ok, true)
    assert.equal(calls.find(([name]) => name === 'save')[1].listingStatus, status)
    assert.equal(calls.find(([name]) => name === 'Property24')[2].status, status === 'sold' ? 'Sold' : 'Pending')
    assert.equal(calls.find(([name]) => name === 'Private Property')[2].propertyStatus, status === 'sold' ? 'Sold' : 'PendingOffer')
    assert.deepEqual(calls.filter(([name]) => ['Agency Website', 'Kingdom Website'].includes(name)), [['Agency Website', 'update'], ['Kingdom Website', 'update']])
  }
})

test('the real simple controller sends a changed expiry only to Property24', async () => {
  const { context, calls } = simpleController()
  const outcome = await context.saveSimple('Property24', { listingStatus: 'active', expiryDate: '2026-12-31', retryResults: [] })
  assert.equal(outcome.ok, true)
  const sends = calls.filter(([name]) => name !== 'save')
  assert.equal(sends.length, 1)
  assert.equal(sends[0][0], 'Property24')
  assert.equal(sends[0][1], 'publish')
  assert.equal(sends[0][2].expiryDate, '2026-12-31')
  assert.equal(sends[0][2].photosChanged, false)
})

test('the simple controller rejects content publication retries', async () => {
  for (const channel of ['Property24', 'Private Property']) {
    const { context, calls } = simpleController()
    await assert.rejects(context.saveSimple(channel, { listingStatus: 'active', expiryDate: '2026-11-30', retryResults: [{ channel, action: 'publish', status: 'failed' }] }), /listing setup/)
    assert.equal(calls.some(([name]) => ['save', 'Property24', 'Private Property'].includes(name)), false)
  }
})
