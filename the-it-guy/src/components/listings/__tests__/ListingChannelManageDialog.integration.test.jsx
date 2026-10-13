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
import { buildWebsiteListingPublicUrl, buildKingdomWebsiteListingPublicUrl, getListingChannelViewUrl, validateListingPortalPublicUrl, getWebsiteListingReadiness, getPrivatePropertyReadinessMessages } from '../../../services/listings/listingMarketingChannelPresentation'
import { getListingPublicationChannelKey } from '../../../services/listings/listingPublicationState'
import { sellerOnboardingDraftPublicationBlocker } from '../../../core/documents/sellerOnboardingDraftComparison'

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
    buildWebsiteListingPublicUrl, buildKingdomWebsiteListingPublicUrl, validateListingPortalPublicUrl, getWebsiteListingReadiness, getPrivatePropertyReadinessMessages,
    saveListingChannelManagement, isQuickListingPortalUpdateAccepted, getListingChannelManageActivity, sellerOnboardingDraftPublicationBlocker,
    listingId: 'listing-1', listingRecord: { id: 'listing-1', arch9Reference: 'A9-TEST-100001', listingStatus: 'active' },
    marketingDraft: { listingStatus: 'active', listingType: 'sale', price: '2450000', formattedAddress: '24 Oak Avenue', headline: 'Oak Avenue', property24ExpiryDate: '2026-11-30', property24Reference: '116284', property24ListingUrl: 'https://www.property24.com/for-sale/example/116284', privatePropertyReference: 'T498201', privatePropertyListingUrl: 'https://www.privateproperty.co.za/for-sale/example/T498201' },
    channelExpiries: [], channelExpiryAvailable: true, LISTING_EXPIRY_CHANNELS: { Property24: 'property24', 'Private Property': 'private_property', 'Agency Website': 'agency_website', 'Kingdom Website': 'kingdom_website' },
    saveListingChannelExpiry: vi.fn(async (_, values) => ({ ok: true, settings: [], results: [], values })),
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
    getProperty24ReadinessIssues: response => [...(response.preview?.dataBlockers || []), ...(response.preview?.technicalBlockers || [])],
    getProperty24ApiMessage: response => response.message || 'Portal error',
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
  for (const name of ['setProperty24ManageOpen', 'setPrivatePropertyManageOpen', 'setManagedWebsiteChannel', 'setChannelManageCheckedAt', 'setChannelExpiries', 'setProperty24Action', 'setPrivatePropertyAction', 'setDetailError', 'setDetailMessage', 'setProperty24Preview', 'setPrivatePropertyPreview', 'setProperty24StatusCheck', 'setPrivatePropertyStatusCheck', 'setMarketingDraft', 'setChannelManageBusy', 'setQuickListingBusy', 'setQuickListingResults', 'setQuickListingResultAction', 'setWebsiteRefreshKey', 'setAgencyWebsitePublication', 'setKingdomWebsitePublication']) ctx[name] = vi.fn()
  Object.assign(ctx, overrides)
  vm.createContext(ctx)
  for (const name of ['previewProperty24Listing', 'previewPrivatePropertyListing', 'publishProperty24Listing', 'publishPrivatePropertyListing', 'refreshProperty24ListingStatus', 'refreshPrivatePropertyListingStatus', 'sendQuickListingPortalUpdate', 'saveSimpleChannelManagement', 'saveManagedListingExpiry', 'removeSelectedChannel', 'saveConfirmedPortalLink', 'simpleChannelMenu', 'renderSimpleChannelManagePanel']) {
    const code = transformSync(controllerSource(name), { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement' }).code
    vm.runInContext(code, ctx)
  }
  const close = vi.fn()
  return { ctx, calls, close, popup: channel => ctx.renderSimpleChannelManagePanel(channel, close).props }
}

it.each(['Property24', 'Private Property'])('Manage blocks %s updates while seller draft differences await review', async channel => {
  const { ctx, popup } = fixture({ listingRecord: { id: 'listing-1', sellerOnboarding: {
    status: 'completed', draftComparison: { differences: [{ key: 'askingPrice', status: 'pending' }] },
  } } })
  await expect(popup(channel).onUpdate()).rejects.toThrow('Review 1 difference')
  expect(ctx.callProperty24ListingAction).not.toHaveBeenCalled()
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
})

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
it.each([false, true])('expiry saves the selected scope (all=%s) through the real controller', async all => {
  const { ctx, popup } = fixture()
  const outcome = await popup('Property24').onSaveExpiry({ expiryDate: '2099-12-31', applyToAllChannels: all })
  expect(outcome.ok).toBe(true)
  expect(ctx.saveListingChannelExpiry).toHaveBeenCalledWith('listing-1', { expiryDate: '2099-12-31', channels: all ? ['Property24', 'Private Property', 'Agency Website', 'Kingdom Website'] : ['Property24'], previous: [] })
  expect(ctx.expireProperty24Listing).not.toHaveBeenCalled()
  expect(ctx.saveMarketingDraft).not.toHaveBeenCalled()
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

it.each(['Property24', 'Private Property'])('%s readiness reports the actual result without publishing an advert', async channel => {
  const response = { ready: true, preview: { canSubmit: true, dataBlockers: [], technicalBlockers: [] } }
  const api = vi.fn(async () => response)
  const { ctx, popup } = fixture({ [channel === 'Property24' ? 'callProperty24ListingAction' : 'callPrivatePropertyListingAction']: api })
  expect(await popup(channel).onPreview()).toEqual({ ok: true, message: `${channel} requirements passed. No advert was sent.` })
  expect(api.mock.calls.map(row => row[0])).toEqual(['preview'])
  expect(ctx.recordListingPublicationStage).not.toHaveBeenCalled()
})
it.each(['Property24', 'Private Property'])('%s readiness cannot report blockers or an incomplete response as success', async channel => {
  const api = vi.fn().mockResolvedValueOnce({ ready: false, preview: { canSubmit: false, dataBlockers: ['Add a listing photo.'] } }).mockResolvedValueOnce({})
  const { popup } = fixture({ [channel === 'Property24' ? 'callProperty24ListingAction' : 'callPrivatePropertyListingAction']: api })
  expect(await popup(channel).onPreview()).toMatchObject({ ok: false, error: expect.stringContaining('Add a listing photo.') })
  expect(await popup(channel).onPreview()).toMatchObject({ ok: false, error: expect.stringContaining('Readiness could not be confirmed') })
})
it('Agency Website hides internal preparation blockers and offers the complete publication path', async () => {
  const publication = { websiteSiteId: 'agency-site', hostname: 'agency.test', websiteStatus: 'published', projectionStatus: 'Draft', status: 'not_published', blockers: ['Publish the listing projection before enabling the agency-website channel.', 'Prepare durable website copies for every listing image.'] }
  const next = { ...publication, projectionStatus: 'Published', status: 'published', blockers: [] }
  const { ctx, popup } = fixture({ agencyWebsitePublication: publication, setWebsiteListingPublication: vi.fn(async () => next) })
  const props = popup('Agency Website')
  expect(props.portal.issues).toEqual([])
  expect(props.portal.publicUrl).toBe('')
  expect(props.canPublish).toBe(true)
  expect(props.preparationMessage).toContain('automatically')
  expect(props.onUpdate).toBeUndefined()
  expect(await props.onPublish()).toMatchObject({ ok: true, message: 'Agency Website listing published.' })
  expect(ctx.prepareAgencyWebsiteListing).toHaveBeenCalledOnce()
  expect(ctx.setWebsiteListingPublication).toHaveBeenCalledWith('listing-1', 'publish', { includePartner: false })
  expect(ctx.recordListingPublicationStage).toHaveBeenLastCalledWith('Agency Website', 'accepted', ctx.marketingDraft, { action: 'publish', publicUrl: 'https://agency.test/properties/oak-avenue-listing-1' })
  expect(ctx.publishKingdomWebsiteListing).not.toHaveBeenCalled()
})
it('a website with a published channel but a hidden projection keeps a repair action and withholds its public link', async () => {
  const { popup } = fixture({ agencyWebsitePublication: { status: 'published', hostname: 'agency.test', websiteStatus: 'published', projectionStatus: 'Draft', blockers: ['Publish the listing projection before enabling the agency-website channel.'] } })
  expect(popup('Agency Website').portal).toMatchObject({ statusLabel: 'Not visible on website', publicUrl: '', issues: [] })
  expect(popup('Agency Website').canUpdate).toBe(true)
})
it('real website setup and missing-photo issues stay visible', () => {
  const { popup } = fixture({ agencyWebsitePublication: { status: 'not_published', websiteStatus: 'draft', blockers: ['Publish the organisation website before publishing listing stock.', 'Add at least one public HTTPS listing image.'] } })
  expect(popup('Agency Website').canPublish).toBe(false)
  expect(popup('Agency Website').portal.issues).toEqual(['Make your agency website live in Website settings.', 'Add at least one photo to this listing.'])
})
it('Kingdom publication prepares its own saved snapshot without requiring an Agency Website projection', async () => {
  const { ctx, popup } = fixture({ kingdomWebsitePublication: { status: 'not_published', hostname: 'kingdom.test', websiteStatus: 'published' } })
  await popup('Kingdom Website').onPublish()
  expect(ctx.saveMarketingDraft).toHaveBeenCalledOnce()
  expect(ctx.prepareAgencyWebsiteListing).not.toHaveBeenCalled()
  expect(ctx.publishKingdomWebsiteListing).toHaveBeenCalledWith('listing-1', 'publish')
  expect(ctx.setWebsiteListingPublication).not.toHaveBeenCalled()
})
it.each(['Property24', 'Private Property'])('a %s confirmation-save failure is not recorded as a rejected portal submission', async channel => {
  const saveMarketingDraft = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false, error: new Error('Save conflict.') })
  const { ctx, popup } = fixture({ saveMarketingDraft })
  await expect(popup(channel).onUpdate()).rejects.toThrow('accepted the request, but Arch9 could not save its confirmation')
  expect(ctx.recordListingPublicationStage.mock.calls.some(row => row[1] === 'failed')).toBe(false)
  expect(ctx.recordListingPublicationStage.mock.calls.some(row => row[1] === 'submitted')).toBe(true)
})
