// @vitest-environment node
import React from 'react'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { expect, it, vi } from 'vitest'
import ListingChannelManageDialog from '../ListingChannelManageDialog'
import { saveListingChannelManagement } from '../../../services/listings/listingChannelManagement'
import { isQuickListingPortalUpdateAccepted } from '../../../services/listings/listingQuickActionDelivery'
import { deriveListingChannelUpdateStates, getListingChannelManageActivity } from '../../../services/listings/listingChannelUpdateState'
import { buildWebsiteListingPublicUrl, buildKingdomWebsiteListingPublicUrl, getListingChannelViewUrl, validateListingPortalPublicUrl } from '../../../services/listings/listingMarketingChannelPresentation'
import { getListingPublicationChannelKey } from '../../../services/listings/listingPublicationState'

const source = readFileSync(new URL('../../../pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
function controllerSource(name) {
  const start = source.search(new RegExp(`^  (?:async )?function ${name}\\(`, 'm'))
  if (start < 0) throw new Error(`Missing controller: ${name}`)
  const rest = source.slice(start)
  const next = /\n {2}(?:async function |function |const |useEffect\()/.exec(rest.slice(5))
  return next ? rest.slice(0, next.index + 5) : rest
}

function fixture(overrides = {}) {
  const calls = []
  const ctx = {
    React, URL, URLSearchParams, ListingChannelManageDialog, Button: 'button', SlidersHorizontal: 'span', getListingPublicationChannelKey, getListingChannelViewUrl,
    buildWebsiteListingPublicUrl, buildKingdomWebsiteListingPublicUrl, validateListingPortalPublicUrl,
    saveListingChannelManagement, isQuickListingPortalUpdateAccepted, getListingChannelManageActivity,
    listingId: 'listing-1', listingRecord: { id: 'listing-1', arch9Reference: 'A9-TEST-100001', listingStatus: 'active' },
    marketingDraft: { listingStatus: 'active', listingType: 'sale', price: '2450000', formattedAddress: '24 Oak Avenue', headline: 'Oak Avenue', property24ExpiryDate: '2026-11-30', property24Reference: '116284', property24ListingUrl: 'https://www.property24.com/for-sale/example/116284', privatePropertyReference: 'T498201', privatePropertyListingUrl: 'https://www.privateproperty.co.za/for-sale/example/T498201' },
    listingChannelActivity: [], channelActivityUnavailable: false, listingPublicationStates: {}, channelUpdateStates: {},
    property24HasReference: true, property24Published: true, property24Reference: '116284', property24StatusKey: 'published', property24StatusCheckedAt: '2026-10-12T19:40:00Z', property24ReadinessIssues: [],
    privatePropertyHasChannel: true, privatePropertyExternalStatus: 'active', privatePropertyStatusKey: 'published', privatePropertyReadinessIssues: [], privatePropertyReadinessWarnings: [], privatePropertyLink: null, privatePropertyStatusCheck: null, property24StatusCheck: null, channelManageCheckedAt: {},
    agencyWebsitePublication: { status: 'published', hostname: 'example.test', websiteStatus: 'published', projectionStatus: 'Published' },
    kingdomWebsitePublication: { status: 'published', hostname: 'kingdom.test', websiteStatus: 'published' },
    coverImage: null, channelManageBusy: false, quickListingBusy: false, property24Action: '', privatePropertyAction: '',
    marketingDraftDirtyRef: { current: false }, channelMutationRef: { current: false }, isSupabaseConfigured: true,
    normalizeKey: value => String(value || '').toLowerCase(), formatDateInputValue: value => value, addDaysToDateInput: () => '2026-10-13', formatCurrency: value => 'R '+value, formatStatusLabel: value => value,
    getPrivatePropertyStatusCheckedAt: () => '', getProperty24ExpiryDateError: () => '', ensureMarketingMediaReady: () => true,
    requireSettledListingPublication: vi.fn(async () => {}), requireSyndicationReviewBeforePublish: vi.fn(async () => true),
    getProperty24ActionContext: () => ({ listingNumber: '116284', expiryDate: '2026-11-30' }),
    getProperty24ListingNumberFromResponse: response => response.report?.databaseWrite?.listingNumber || '116284',
    getPrivatePropertyReferenceFromResponse: () => 'T498201', getPrivatePropertyApiMessage: response => response.monitor?.apiError?.message || 'Portal error',
    getProperty24ReadinessCounts: () => ({ dataBlockers: 0, technicalBlockers: 0 }), getPrivatePropertyReadinessCounts: () => ({ dataBlockers: 0, technicalBlockers: 0, readinessBlockers: 0 }),
    saveMarketingDraft: vi.fn(async draft => { calls.push(['save', draft]); return { ok: true, draft } }),
    loadListingData: vi.fn(async () => {}), openSellerWorkspaceSection: vi.fn(), profile: { id: 'agent-1' },
    recordListingPublicationStage: vi.fn(async (...args) => { calls.push(['stage', ...args]); return { id: 'event-1' } }),
    createPrivateListingActivity: vi.fn(async payload => { calls.push(['activity', payload]); return { id: 'event-1' } }),
    callProperty24ListingAction: vi.fn(async (action, body) => { calls.push(['Property24', action, body]); return { status: 'SUBMITTED', report: { databaseWrite: { listingNumber: '116284', property24Status: 'published' } } } }),
    callPrivatePropertyListingAction: vi.fn(async (action, body) => { calls.push(['Private Property', action, body]); return { status: 'SUBMITTED', update: { status: 'UPDATED' }, monitor: { status: 'ACTIVATED', externalStatus: 'active' } } }),
    getWebsiteListingPublicationStatus: vi.fn(async () => ctx.agencyWebsitePublication), getKingdomWebsitePublicationStatus: vi.fn(async () => ctx.kingdomWebsitePublication),
    prepareAgencyWebsiteListing: vi.fn(async () => ({ ok: true, publicationDraft: ctx.marketingDraft })),
    setWebsiteListingPublication: vi.fn(async (_, action) => { calls.push(['Agency Website', action]); return { status: 'published' } }), publishKingdomWebsiteListing: vi.fn(async (_, action) => { calls.push(['Kingdom Website', action]); return { status: 'published' } }),
    expireProperty24Listing: vi.fn(async () => ({ status: 'SUBMITTED' })), withdrawProperty24Listing: vi.fn(async () => ({ status: 'SUBMITTED' })), expirePrivatePropertyListing: vi.fn(async () => ({ status: 'SUBMITTED' })),
    openPropertyDetailsFromMarketing: vi.fn(), setRelistChannel: vi.fn(), setChannelRemoval: vi.fn(), setChannelRemovalError: vi.fn(),
    window: { dispatchEvent() {} }, Event: class {},
  }
  for (const name of ['setProperty24ManageOpen', 'setPrivatePropertyManageOpen', 'setManagedWebsiteChannel', 'setChannelManageCheckedAt', 'setProperty24Action', 'setPrivatePropertyAction', 'setDetailError', 'setDetailMessage', 'setProperty24Preview', 'setPrivatePropertyPreview', 'setProperty24StatusCheck', 'setPrivatePropertyStatusCheck', 'setMarketingDraft', 'setChannelManageBusy', 'setQuickListingBusy', 'setQuickListingResults', 'setQuickListingResultAction', 'setWebsiteRefreshKey', 'setAgencyWebsitePublication', 'setKingdomWebsitePublication']) ctx[name] = vi.fn()
  Object.assign(ctx, overrides)
  vm.createContext(ctx)
  for (const name of ['publishProperty24Listing', 'publishPrivatePropertyListing', 'refreshProperty24ListingStatus', 'refreshPrivatePropertyListingStatus', 'sendQuickListingPortalUpdate', 'saveSimpleChannelManagement', 'removeSelectedChannel', 'saveConfirmedPortalLink', 'simpleChannelMenu', 'renderSimpleChannelManagePanel']) {
    const code = transformSync(controllerSource(name), { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement' }).code
    vm.runInContext(code, ctx)
  }
  const close = vi.fn()
  return { ctx, calls, close, popup: channel => ctx.renderSimpleChannelManagePanel(channel, close).props }
}

it.each(['Property24', 'Private Property'])('Manage updates only the existing %s advert', async channel => {
  const { ctx, calls, popup } = fixture()
  expect((await popup(channel).onUpdate()).ok).toBe(true)
  const sends = calls.filter(row => ['Property24', 'Private Property', 'Agency Website', 'Kingdom Website'].includes(row[0]))
  expect(sends).toHaveLength(1)
  expect(sends[0][0]).toBe(channel)
  expect(sends[0][1]).toBe('publish')
  if (channel === 'Property24') expect(sends[0][2].listingNumber).toBe('116284')
  else expect(sends[0][2].confirm).toBe('PRIVATE_PROPERTY_PUBLISH:listing-1:production')
  expect(ctx.loadListingData).toHaveBeenCalledWith({ showLoading: false })
})
it('a Property24 send failure rejects the popup action and records the failed stage', async () => {
  const { ctx, popup } = fixture({ callProperty24ListingAction: vi.fn(async () => { throw new Error('P24 rejected this listing.') }) })
  await expect(popup('Property24').onUpdate()).rejects.toThrow('P24 rejected this listing.')
  expect(ctx.recordListingPublicationStage.mock.calls.some(row => row[1] === 'failed')).toBe(true)
})
it('does not report blocked HTTP-success responses as published', async () => {
  const { popup } = fixture({ callProperty24ListingAction: vi.fn(async () => ({ status: 'BLOCKED' })) })
  await expect(popup('Property24').onUpdate()).rejects.toThrow('has not confirmed acceptance')
})
it('required Private Property review opens before any send', async () => {
  const { ctx, popup } = fixture({ requireSyndicationReviewBeforePublish: async () => false })
  expect(await popup('Private Property').onUpdate()).toEqual({ deferred: true })
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
})
it.each(['Property24', 'Private Property'])('relisting from %s keeps that channel selected', channel => {
  const { ctx, popup, close } = fixture()
  popup(channel).onRelist()
  expect(close).toHaveBeenCalledOnce()
  expect(ctx.setRelistChannel).toHaveBeenCalledWith(channel)
  expect(source).toContain('channels={relistChannel ? [relistChannel]')
})
it.each(['Property24', 'Private Property', 'Agency Website', 'Kingdom Website'])('withdraw confirmation targets %s only', async channel => {
  const { ctx, popup, close } = fixture()
  popup(channel).onWithdraw()
  expect(close).toHaveBeenCalledOnce()
  expect(ctx.setChannelRemoval).toHaveBeenCalledWith({ channel, action: 'withdraw' })
  ctx.channelRemoval = { channel, action: 'withdraw' }
  if (channel.includes('Website')) {
    const name = channel === 'Agency Website' ? 'setWebsiteListingPublication' : 'publishKingdomWebsiteListing'
    ctx[name] = vi.fn(async () => ({ status: 'unpublished' }))
  }
  await ctx.removeSelectedChannel()
  if (channel === 'Property24') { expect(ctx.withdrawProperty24Listing).toHaveBeenCalledWith({ skipConfirmation: true, throwOnError: true }); expect(ctx.expirePrivatePropertyListing).not.toHaveBeenCalled() }
  if (channel === 'Private Property') { expect(ctx.expirePrivatePropertyListing).toHaveBeenCalledWith({ skipConfirmation: true, throwOnError: true }); expect(ctx.withdrawProperty24Listing).not.toHaveBeenCalled() }
  expect(ctx.createPrivateListingActivity).toHaveBeenCalled()
})
it('Expire calls the existing Property24 expiry handler only', async () => {
  const { ctx, popup } = fixture()
  popup('Property24').onExpire()
  expect(ctx.setChannelRemoval).toHaveBeenCalledWith({ channel: 'Property24', action: 'expire' })
  ctx.channelRemoval = { channel: 'Property24', action: 'expire' }
  await ctx.removeSelectedChannel()
  expect(ctx.expireProperty24Listing).toHaveBeenCalledWith({ skipConfirmation: true, throwOnError: true })
  expect(ctx.withdrawProperty24Listing).not.toHaveBeenCalled()
  expect(popup('Private Property').onExpire).toBeUndefined()
})
it('refresh bypasses Private Property cached responses and exposes provider errors', async () => {
  const { ctx, popup } = fixture({ callPrivatePropertyListingAction: vi.fn(async () => ({ monitor: { apiError: { message: 'PP status unavailable.' } } })) })
  await expect(popup('Private Property').onRefresh()).rejects.toThrow('PP status unavailable.')
  expect(ctx.callPrivatePropertyListingAction.mock.calls[0][2].query.get('cached')).toBe('false')
  expect(ctx.callProperty24ListingAction).not.toHaveBeenCalled()
})
it.each(['sold', 'under_offer'])('%s updates Arch9 and all active channels through the real controller', async status => {
  const { calls, popup } = fixture()
  const result = await popup('Private Property').onSave({ listingStatus: status, expiryDate: '2026-11-30', retryResults: [] })
  expect(result.ok).toBe(true)
  expect(calls.find(row => row[0] === 'save')[1].listingStatus).toBe(status)
  expect(calls.find(row => row[0] === 'Property24')[2].status).toBe(status === 'sold' ? 'Sold' : 'Pending')
  expect(calls.find(row => row[0] === 'Private Property')[2].propertyStatus).toBe(status === 'sold' ? 'Sold' : 'PendingOffer')
  expect(calls.filter(row => row[0].includes('Website'))).toHaveLength(2)
})
it('saved content failures expose a retry confined to that portal', async () => {
  const events = [{ activity_type: 'listing_channel_publication_failed', created_at: '2026-10-12T19:40:00Z', metadata: { channel: 'Private Property', action: 'update', error: 'Rejected.' } }]
  const { calls, popup } = fixture({ listingChannelActivity: events, channelUpdateStates: deriveListingChannelUpdateStates(events) })
  await popup('Private Property').onRetry()
  expect(calls.filter(row => ['Property24', 'Private Property'].includes(row[0])).map(row => row[0])).toEqual(['Private Property'])
})
it.each(['Property24', 'Private Property'])('saving a %s URL changes only its saved link and never publishes', async channel => {
  const value = channel === 'Property24' ? 'https://www.property24.com/for-sale/example/123' : 'https://www.privateproperty.co.za/for-sale/example/T123'
  const { ctx, popup } = fixture()
  await popup(channel).onSavePublicUrl(value)
  const saved = ctx.saveMarketingDraft.mock.calls[0][0]
  expect(saved[channel === 'Property24' ? 'property24ListingUrl' : 'privatePropertyListingUrl']).toBe(value)
  expect(ctx.callProperty24ListingAction).not.toHaveBeenCalled()
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
  expect(saved.listingStatus).toBe('active')
})
it('failed live-link persistence keeps the popup action failed', async () => {
  const { popup } = fixture({ saveMarketingDraft: async () => ({ ok: false, error: new Error('Save conflict.') }) })
  await expect(popup('Property24').onSavePublicUrl('https://www.property24.com/listing/123')).rejects.toThrow('Save conflict.')
})
it('Edit details opens the editor without automatically relisting', () => {
  const { ctx, popup } = fixture()
  popup('Private Property').onFix()
  expect(ctx.openPropertyDetailsFromMarketing).toHaveBeenCalledWith()
})

it.each(['Property24', 'Private Property', 'Agency Website', 'Kingdom Website'])('the real %s Manage button opens its popup directly', channel => {
  const { ctx } = fixture()
  const button = ctx.simpleChannelMenu(channel)
  expect(button.props['aria-label']).toBe('Manage '+channel)
  button.props.onClick()
  if (channel === 'Property24') expect(ctx.setProperty24ManageOpen).toHaveBeenCalledWith(true)
  else if (channel === 'Private Property') expect(ctx.setPrivatePropertyManageOpen).toHaveBeenCalledWith(true)
  else expect(ctx.setManagedWebsiteChannel).toHaveBeenCalledWith(channel)
})
it('withdrawal failures stay in the selected-channel confirmation', async () => {
  const { ctx } = fixture({ withdrawProperty24Listing: async () => { throw new Error('P24 cannot withdraw this advert.') } })
  ctx.channelRemoval = { channel: 'Property24', action: 'withdraw' }
  await ctx.removeSelectedChannel()
  expect(ctx.setChannelRemovalError).toHaveBeenCalledWith('P24 cannot withdraw this advert.')
  expect(ctx.setChannelRemoval).not.toHaveBeenCalledWith(null)
})

it('a stale Under offer failure cannot overwrite a later Sold status', () => {
  const { ctx, popup } = fixture({ channelUpdateStates: { 'Private Property': { status: 'needs_attention', action: 'under_offer', detail: 'Earlier failure.' } } })
  ctx.marketingDraft.listingStatus = 'sold'
  expect(popup('Private Property').onRetry).toBeUndefined()
  expect(popup('Private Property').initialResults).toEqual([])
})
