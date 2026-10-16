// @vitest-environment node
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { expect, it, vi } from 'vitest'
import ListingChannelManageDialog from '../ListingChannelManageDialog'
import { saveListingChannelManagement } from '../../../services/listings/listingChannelManagement'
import { isQuickListingPortalUpdateAccepted } from '../../../services/listings/listingQuickActionDelivery'
import { deriveListingChannelUpdateStates, getListingChannelManageActivity } from '../../../services/listings/listingChannelUpdateState'
import { buildListingChannelPublicationDisplay, buildWebsiteListingPublicUrl, buildKingdomWebsiteListingPublicUrl, getListingChannelViewUrl, normalizeListingChannelPublicUrl, normalizeListingChannelReference, validateListingPortalPublicUrl, getWebsiteListingReadiness, getPrivatePropertyReadinessMessages } from '../../../services/listings/listingMarketingChannelPresentation'
import { buildListingPublicationSnapshot, getListingPublicationChannelKey } from '../../../services/listings/listingPublicationState'
import { readListingRelistCheckpoints, relistListingChannels } from '../../../services/listings/listingRelistService'
import { applyListingSellerOnboardingSaveSnapshot } from '../../../services/listings/listingSellerCanonicalUpdateModel'
import { sellerOnboardingDraftPublicationBlocker } from '../../../core/documents/sellerOnboardingDraftComparison'
import { shouldRequireSyndicationReview, canAcknowledgeSyndicationChannel } from '../../../services/syndicationReviewGateService'
import { persistSellerProfileOnboardingFormData } from '../../../services/privateListingService'

const source = readFileSync(new URL('../../../pages/AgentListingDetail.jsx', import.meta.url), 'utf8')
function distributionRow(display, publicationState) {
  const start = source.indexOf('function DistributionChannel(')
  const end = source.indexOf('\nfunction InfoTile(', start)
  const ctx = {
    React, ExternalLink: 'span', PlatformLogo: () => null, ListingChannelLastUpdate: () => null, ListingChannelManageMenu: 'div',
    normalizeKey: value => String(value || '').toLowerCase(), formatStatusLabel: value => value,
    normalizeListingChannelPublicUrl, normalizeListingChannelReference,
  }
  vm.createContext(ctx)
  vm.runInContext(transformSync(source.slice(start, end), { loader: 'jsx', jsxFactory: 'React.createElement' }).code, ctx)
  return renderToStaticMarkup(React.createElement(ctx.DistributionChannel, {
    name: display.label, reference: display.reference, publicUrl: display.href,
    live: display.live, status: display.status, statusLabel: display.statusLabel, publicationState,
  }))
}

const rowPortals = [
  ['private_property', 'Private Property', 'T5656136', 'https://www.privateproperty.co.za/T5656136'],
  ['property24', 'Property24', '117721873', 'https://www.property24.com/for-sale/example/117721873'],
]
it.each(rowPortals.flatMap(([key, label, reference, publicUrl]) => ['inactive', 'removed', 'withdrawn', 'expired', 'paused', 'failed'].map(externalStatus => ({ key, label, reference, publicUrl, externalStatus }))))('$label hides its $externalStatus advert link despite old accepted activity', ({ key, label, reference, publicUrl, externalStatus }) => {
  const publicationState = { stage: 'accepted', publicUrl }
  const display = buildListingChannelPublicationDisplay({ key, label, reference, publicUrl, live: true, externalStatus, publicationState, lifecycleOnly: true })
  const html = distributionRow({ ...display, reference }, publicationState)
  expect(html).not.toContain('View listing')
  expect(html).not.toContain('href=')
  expect(html).toContain('No live listing link')
  expect(html).toContain(reference)
})
it.each(rowPortals)('keeps the confirmed live %s advert link visible', (key, label, reference, publicUrl) => {
  const display = buildListingChannelPublicationDisplay({ key, label, reference, publicUrl, live: true, externalStatus: 'active', lifecycleOnly: true })
  const html = distributionRow({ ...display, reference })
  expect(html).toContain(`href="${publicUrl}"`)
  expect(html).toContain('View listing')
})
it.each(rowPortals)('does not restore a cleared %s link from historical activity', (key, label, reference, oldUrl) => {
  const publicationState = { stage: 'accepted', publicUrl: oldUrl }
  const display = buildListingChannelPublicationDisplay({ key, label, reference, publicUrl: '', live: true, externalStatus: 'active', publicationState, lifecycleOnly: true })
  const html = distributionRow({ ...display, reference }, publicationState)
  expect(html).not.toContain('View listing')
  expect(html).toContain('Listing link unavailable')
})

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
    React, URL, URLSearchParams, ListingChannelManageDialog, ListingRelistDialog: () => null, Button: 'button', SlidersHorizontal: 'span', getListingPublicationChannelKey, getListingChannelViewUrl,
    buildListingPublicationSnapshot, readListingRelistCheckpoints, relistListingChannels,
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
    syndicationReviewContinuationRef: { current: { listingId: 'listing-1', pending: null } }, syndicationReviewUpdateChannel: '',
    normalizeKey: value => String(value || '').toLowerCase(), formatDateInputValue: value => value, addDaysToDateInput: () => '2026-10-13', formatCurrency: value => 'R '+value, formatStatusLabel: value => value,
    getPrivatePropertyStatusCheckedAt: () => '', getProperty24ExpiryDateError: () => '', ensureMarketingMediaReady: () => true,
    requireSettledListingPublication: vi.fn(async () => {}), requireSyndicationReviewBeforePublish: vi.fn(async () => true),
    getProperty24ActionContext: () => ({ listingNumber: '116284', expiryDate: '2026-11-30' }),
    getProperty24ListingNumberFromResponse: response => response.report?.databaseWrite?.listingNumber || '116284',
    getPrivatePropertyReferenceFromResponse: () => 'T498201', getPrivatePropertyApiMessage: response => response.monitor?.apiError?.message || 'Portal error',
    getProperty24ReadinessCounts: () => ({ dataBlockers: 0, technicalBlockers: 0 }), getPrivatePropertyReadinessCounts: () => ({ dataBlockers: 0, technicalBlockers: 0, readinessBlockers: 0 }),
    getProperty24ReadinessIssues: response => [...(response.preview?.dataBlockers || []), ...(response.preview?.technicalBlockers || [])],
    getProperty24ApiMessage: response => response.message || 'Portal error',
    saveMarketingDraft: vi.fn(async draft => { calls.push(['save', draft]); return { ok: true, draft, listing: ctx.listingRecord } }),
    getPrivateListing: vi.fn(async () => ctx.listingRecord), buildPropertyDraft: vi.fn(() => ctx.marketingDraft), getPrivateListingActivity: vi.fn(async () => []),
    createListingRelistPortalActions: vi.fn(({ channel }) => {
      let live = false
      return {
        prepare: vi.fn(async () => channel === 'Property24' ? { canSubmit: true, identity: { listingNumber: '116284' } } : { ready: live, blockers: live ? [] : ['private_property_reactivation_required'], recovery: { checked: true, propertyId: 'existing-feed', externalStatus: live ? 'active' : 'inactive', canReactivate: true, listingType: 'Sale' } }),
        observeState: vi.fn(async () => live), withdraw: vi.fn(async () => { live = false }),
        activate: vi.fn(async () => { live = true; return { confirmed: true } }),
        publish: vi.fn(async () => { calls.push(['relist', channel]); live = true; return { status: 'SUBMITTED', reference: channel === 'Property24' ? '116284' : 'T498201' } }),
        observe: vi.fn(async () => live),
      }
    }),
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
  for (const name of ['setSyndicationReviewUpdateChannel', 'setProperty24ManageOpen', 'setPrivatePropertyManageOpen', 'setManagedWebsiteChannel', 'setChannelManageCheckedAt', 'setChannelExpiries', 'setProperty24Action', 'setPrivatePropertyAction', 'setDetailError', 'setDetailMessage', 'setProperty24Preview', 'setPrivatePropertyPreview', 'setProperty24StatusCheck', 'setPrivatePropertyStatusCheck', 'setMarketingDraft', 'setChannelManageBusy', 'setQuickListingBusy', 'setQuickListingResults', 'setQuickListingResultAction', 'setWebsiteRefreshKey', 'setAgencyWebsitePublication', 'setKingdomWebsitePublication']) ctx[name] = vi.fn()
  Object.assign(ctx, overrides)
  vm.createContext(ctx)
  for (const name of ['persistListingSnapshot', 'previewProperty24Listing', 'previewPrivatePropertyListing', 'publishProperty24Listing', 'publishPrivatePropertyListing', 'refreshProperty24ListingStatus', 'refreshPrivatePropertyListingStatus', 'sendQuickListingPortalUpdate', 'relistSavedListing', 'saveSimpleChannelManagement', 'saveManagedListingExpiry', 'removeSelectedChannel', 'saveConfirmedPortalLink', 'simpleChannelMenu', 'renderSimpleChannelManagePanel']) {
    const code = transformSync(controllerSource(name), { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement' }).code
    vm.runInContext(code, ctx)
  }
  const close = vi.fn()
  const relistDialog = initialChannel => {
    ctx.relistChannel = initialChannel
    const element = source.match(/\{relistChannel !== null \? (<ListingRelistDialog[\s\S]*?\/>) : null\}/)?.[1]
    if (!element) throw new Error('Missing relist dialog')
    const code = transformSync(`(${element})`, { loader: 'jsx', jsx: 'transform', jsxFactory: 'React.createElement' }).code
    return vm.runInContext(code, ctx).props
  }
  return { ctx, calls, close, relistDialog, popup: channel => ctx.renderSimpleChannelManagePanel(channel, close).props }
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
it.each(['Property24', 'Private Property'])('updating saved %s content does not rewrite the seller record', async channel => {
  const { ctx, popup } = fixture({ saveMarketingDraft: vi.fn(async () => ({ ok: false, error: new Error('Someone else saved changes to this seller record.') })) })
  expect((await popup(channel).onUpdate()).ok).toBe(true)
  expect(ctx.saveMarketingDraft).not.toHaveBeenCalled()
})
it.each(['Property24', 'Private Property'])('unsaved %s content is saved once before sending and never rewritten for the receipt', async channel => {
  const dirty = { current: true }
  const saveMarketingDraft = vi.fn(async () => {
    if (!dirty.current) return { ok: false, error: new Error('Someone else saved changes to this seller record.') }
    dirty.current = false
    return { ok: true }
  })
  const { ctx, popup } = fixture({ marketingDraftDirtyRef: dirty, saveMarketingDraft })
  expect((await popup(channel).onUpdate()).ok).toBe(true)
  expect(saveMarketingDraft).toHaveBeenCalledOnce()
  const send = channel === 'Property24' ? ctx.callProperty24ListingAction : ctx.callPrivatePropertyListingAction
  expect(send).toHaveBeenCalledOnce()
  expect(saveMarketingDraft.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0])
})
it.each([false, true])('Private Property review and submission share one guarded save (dirty=%s)', async initiallyDirty => {
  const { ctx, popup } = fixture({ marketingDraftDirtyRef: { current: initiallyDirty } })
  ctx.syndicationReview = null
  ctx.syndicationReviewAcknowledgements = {}
  ctx.shouldRequireSyndicationReview = shouldRequireSyndicationReview
  ctx.setSyndicationReviewLoading = vi.fn()
  ctx.setSyndicationReview = vi.fn()
  ctx.setSyndicationReviewOpen = vi.fn()
  ctx.setSyndicationReviewAcknowledgements = vi.fn()
  ctx.saveMarketingDraft = vi.fn(async () => {
    if (!ctx.marketingDraftDirtyRef.current) return { ok: false, error: new Error('Someone else saved changes to this seller record.') }
    ctx.marketingDraftDirtyRef.current = false
    return { ok: true }
  })
  ctx.callPrivatePropertyListingAction.mockImplementation(async action => action === 'syndication-review'
    ? { review: { rollout: { enabled: false } } }
    : { status: 'SUBMITTED', report: { syncResult: { arch9Status: 'submitted' } } })
  for (const name of ['openSyndicationReview', 'requireSyndicationReviewBeforePublish']) {
    vm.runInContext(transformSync(controllerSource(name), { loader: 'jsx' }).code, ctx)
  }
  expect((await popup('Private Property').onUpdate()).ok).toBe(true)
  expect(ctx.saveMarketingDraft).toHaveBeenCalledTimes(initiallyDirty ? 1 : 0)
  expect(ctx.callPrivatePropertyListingAction.mock.calls.map(row => row[0])).toEqual(['syndication-review', 'publish'])
})
it.each(['Property24', 'Private Property'])('a real seller conflict blocks unsaved %s changes before submission', async channel => {
  const { ctx, popup } = fixture({ marketingDraftDirtyRef: { current: true }, saveMarketingDraft: vi.fn(async () => ({ ok: false, error: new Error('Someone else saved changes to this seller record.') })) })
  await expect(popup(channel).onUpdate()).rejects.toThrow('Someone else saved changes to this seller record.')
  expect(ctx.callProperty24ListingAction).not.toHaveBeenCalled()
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
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
it('a cancelled Private Property update review sends nothing', async () => {
  const { ctx, popup } = fixture({ requireSyndicationReviewBeforePublish: async () => false })
  expect(await popup('Private Property').onUpdate()).toEqual({ cancelled: true })
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
})
it.each(['Property24', 'Private Property'])('relisting from %s keeps that channel selected and offers the other connected portal', channel => {
  const { ctx, popup, close, relistDialog } = fixture()
  popup(channel).onRelist()
  expect(close).toHaveBeenCalledOnce()
  expect(ctx.setRelistChannel).toHaveBeenCalledWith(channel)
  const dialog = relistDialog(channel)
  expect(dialog.initialChannel).toBe(channel)
  expect(dialog.channels).toEqual(['Property24', 'Private Property'])
})
it.each([
  [{ property24Reference: '', privatePropertyHasChannel: true }, 'Private Property'],
  [{ property24Reference: '116284', privatePropertyHasChannel: false }, 'Property24'],
])('offers only existing portal adverts for relisting', (availability, channel) => {
  const { relistDialog } = fixture(availability)
  expect(relistDialog(channel).channels).toEqual([channel])
})
it.each([['Property24'], ['Private Property'], ['Property24', 'Private Property']])('relisting saved adverts does not rewrite the seller record: %j', async (...channels) => {
  const { ctx } = fixture({ saveMarketingDraft: vi.fn(async () => ({ ok: false, error: new Error('Someone else saved changes to this seller record.') })) })
  const results = await ctx.relistSavedListing({ channels, expiryDate: ctx.marketingDraft.property24ExpiryDate })
  expect(results).toHaveLength(channels.length)
  expect(results.every(row => row.status === 'completed')).toBe(true)
  expect(ctx.saveMarketingDraft).not.toHaveBeenCalled()
  expect(ctx.getPrivateListing).toHaveBeenCalledWith('listing-1', { includeRequirementsAndDocuments: false, includePreviousListings: true, requireDistributionData: true })
})
it('relisting a clean form uses current saved details and the current expiry instead of stale browser values', async () => {
  const { ctx } = fixture()
  const current = { ...ctx.listingRecord, sellerOnboarding: { saveRevision: { onboardingId: 'seller-1', updatedAt: 'current' } } }
  const currentDraft = { ...ctx.marketingDraft, price: '2600000', property24ExpiryDate: '2027-01-15' }
  ctx.getPrivateListing.mockResolvedValue(current)
  ctx.buildPropertyDraft.mockReturnValue(currentDraft)
  await ctx.relistSavedListing({ channels: ['Property24'], expiryDate: ctx.marketingDraft.property24ExpiryDate })
  expect(ctx.buildPropertyDraft).toHaveBeenCalledWith(current)
  expect(ctx.createListingRelistPortalActions.mock.calls[0][0].property24Context().expiryDate).toBe('2027-01-15')
  expect(ctx.recordListingPublicationStage).toHaveBeenLastCalledWith('Property24', 'accepted', currentDraft, { action: 'relist', reference: '116284' })
  expect(ctx.saveMarketingDraft).not.toHaveBeenCalled()
})
it('a genuine conflict on unsaved relist edits blocks all portal actions and preserves the draft', async () => {
  const error = Object.assign(new Error('Someone else saved changes to this seller record.'), { code: 'SELLER_UPDATE_CONFLICT' })
  const { ctx } = fixture({ marketingDraftDirtyRef: { current: true }, saveMarketingDraft: vi.fn(async () => ({ ok: false, error })) })
  const draft = ctx.marketingDraft
  await expect(ctx.relistSavedListing({ channels: ['Property24', 'Private Property'], expiryDate: draft.property24ExpiryDate })).rejects.toBe(error)
  expect(ctx.getPrivateListing).not.toHaveBeenCalled()
  expect(ctx.createListingRelistPortalActions).not.toHaveBeenCalled()
  expect(ctx.createPrivateListingActivity).not.toHaveBeenCalled()
  expect(ctx.marketingDraft).toBe(draft)
  expect(ctx.marketingDraftDirtyRef.current).toBe(true)
  expect(ctx.channelMutationRef.current).toBe(false)
})
it('an edited Property24 expiry still uses guarded saving before relisting', async () => {
  const { ctx } = fixture()
  await ctx.relistSavedListing({ channels: ['Property24'], expiryDate: '2027-02-01' })
  expect(ctx.saveMarketingDraft).toHaveBeenCalledOnce()
  expect(ctx.saveMarketingDraft.mock.calls[0][0].property24ExpiryDate).toBe('2027-02-01')
  expect(ctx.getPrivateListing).not.toHaveBeenCalled()
})
it('restores withdrawn stock once using the freshly read seller revision for both portals', async () => {
  const { ctx } = fixture()
  const listing = { ...ctx.listingRecord, sellerOnboarding: { saveRevision: { onboardingId: 'seller-1', updatedAt: 'current' } } }
  ctx.getPrivateListing.mockResolvedValue(listing)
  ctx.buildPropertyDraft.mockReturnValue({ ...ctx.marketingDraft, listingStatus: 'withdrawn' })
  const results = await ctx.relistSavedListing({ channels: ['Property24', 'Private Property'], expiryDate: ctx.marketingDraft.property24ExpiryDate })
  expect(results.every(row => row.status === 'completed')).toBe(true)
  expect(ctx.saveMarketingDraft).toHaveBeenCalledOnce()
  expect(ctx.saveMarketingDraft.mock.calls[0]).toEqual([
    expect.objectContaining({ listingStatus: 'active', publicationStatus: 'Draft' }),
    expect.objectContaining({ listingSnapshot: listing, listingVisibility: 'private', includePreviousListings: true }),
  ])
})
it('a portal address blocker prevents restoring withdrawn stock or sending on the other portal', async () => {
  const { ctx, calls } = fixture()
  ctx.buildPropertyDraft.mockReturnValue({ ...ctx.marketingDraft, listingStatus: 'withdrawn' })
  const portalActions = ctx.createListingRelistPortalActions.getMockImplementation()
  ctx.createListingRelistPortalActions.mockImplementation(options => {
    const actions = portalActions(options)
    if (options.channel === 'Private Property') actions.prepare.mockResolvedValue({ blockers: ['private_property_locked_address_mismatch'], recovery: { checked: true, propertyId: 'existing-feed' } })
    return actions
  })
  const results = await ctx.relistSavedListing({ channels: ['Property24', 'Private Property'], expiryDate: ctx.marketingDraft.property24ExpiryDate })
  expect(results.every(row => row.status === 'blocked')).toBe(true)
  expect(ctx.saveMarketingDraft).not.toHaveBeenCalled()
  expect(ctx.createPrivateListingActivity).not.toHaveBeenCalled()
  expect(calls.filter(row => row[0] === 'relist')).toEqual([])
})
it('uses the confirmed edit receipt when restoring a withdrawn listing instead of saving its old revision twice', async () => {
  const { ctx } = fixture({ marketingDraftDirtyRef: { current: true } })
  ctx.marketingDraft.listingStatus = 'withdrawn'
  const receipt = { ...ctx.listingRecord, sellerOnboarding: { saveRevision: { onboardingId: 'seller-1', updatedAt: 'after-edits' } } }
  ctx.saveMarketingDraft.mockImplementation(async (draft, options) => {
    if (ctx.saveMarketingDraft.mock.calls.length > 1 && options.listingSnapshot !== receipt) return { ok: false, error: new Error('Someone else saved changes to this seller record.') }
    return { ok: true, draft, listing: receipt }
  })
  const results = await ctx.relistSavedListing({ channels: ['Property24', 'Private Property'], expiryDate: ctx.marketingDraft.property24ExpiryDate })
  expect(results.every(row => row.status === 'completed')).toBe(true)
  expect(ctx.saveMarketingDraft).toHaveBeenCalledTimes(2)
  expect(ctx.saveMarketingDraft.mock.calls[1][1].listingSnapshot).toBe(receipt)
})
it.each([null, { id: 'different-listing' }, { id: 'listing-1', listingStatus: 'sold' }])('refuses relisting when the latest saved listing is missing, changed or sold', async latest => {
  const { ctx } = fixture({ getPrivateListing: vi.fn(async () => latest) })
  ctx.buildPropertyDraft.mockReturnValue({ ...ctx.marketingDraft, listingStatus: 'active' })
  await expect(ctx.relistSavedListing({ channels: ['Property24'], expiryDate: ctx.marketingDraft.property24ExpiryDate })).rejects.toThrow()
  expect(ctx.createListingRelistPortalActions).not.toHaveBeenCalled()
  expect(ctx.saveMarketingDraft).not.toHaveBeenCalled()
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
it.each(['Property24', 'Private Property'])('clearing a %s URL removes its saved copies without restoring the activity link', async channel => {
  const key = channel === 'Property24' ? 'property24' : 'private_property'
  const field = channel === 'Property24' ? 'property24ListingUrl' : 'privatePropertyListingUrl'
  const { ctx, popup } = fixture()
  const oldUrl = ctx.marketingDraft[field]
  const otherChannel = channel === 'Property24' ? 'Private Property' : 'Property24'
  const otherLink = { platform: otherChannel, url: ctx.marketingDraft[channel === 'Property24' ? 'privatePropertyListingUrl' : 'property24ListingUrl'], status: 'Published' }
  ctx.marketingDraft.externalLinks = [{ platform: channel, url: oldUrl, status: 'Published' }, otherLink]
  ctx.listingPublicationStates[key] = { stage: 'accepted', publicUrl: oldUrl }
  ctx.privatePropertyLink = { url: ctx.marketingDraft.privatePropertyListingUrl, reference: 'T498201' }
  ctx.saveMarketingDraft.mockImplementation(async draft => { ctx.marketingDraft = draft; return { ok: true, draft } })
  const outcome = await popup(channel).onSavePublicUrl('')
  const saved = ctx.saveMarketingDraft.mock.calls[0][0]
  expect(saved[field]).toBe('')
  expect(saved.externalLinks).toEqual([otherLink])
  expect(saved.property24Reference).toBe('116284')
  expect(saved.privatePropertyReference).toBe('T498201')
  expect(popup(channel).portal.publicUrl).toBe('')
  expect(popup(channel).portal.reference).toBe(channel === 'Property24' ? '116284' : 'T498201')
  expect(ctx.loadListingData).toHaveBeenCalledWith({ showLoading: false })
  expect(outcome.message).toContain('removed')
  expect(ctx.callProperty24ListingAction).not.toHaveBeenCalled()
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
})
it.each(['property24ListingUrl', 'privatePropertyListingUrl'])('clears %s through the real seller-profile merge instead of reviving the old URL', async field => {
  const id = '00000000-0000-4000-8000-000000000001'
  const onboardingId = '00000000-0000-4000-8000-000000000002'
  let stored = { id: onboardingId, private_listing_id: id, token: 'local-token', status: 'in_progress', updated_at: '2026-10-16T08:00:00Z', form_data: { [field]: 'https://old.example/advert', property24Reference: '116284', privatePropertyReference: 'T498201' } }
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: stored, error: null }) }
  const client = { from: vi.fn(() => query), rpc: vi.fn(async (name, args) => {
    expect(name).toBe('save_private_listing_seller_onboarding_profile')
    stored = { ...stored, form_data: args.p_form_data }
    return { data: stored, error: null }
  }) }
  const { ctx } = fixture({ listingId: id, listingRecord: { id, sellerOnboarding: { id: onboardingId, updatedAt: stored.updated_at } } })
  Object.assign(ctx, {
    isSupabaseConfigured: true, patchListing: () => ctx.listingRecord,
    buildListingSnapshotFormData: draft => ({ [field]: draft[field] }),
    persistSellerProfileOnboardingFormData: options => persistSellerProfileOnboardingFormData({ ...options, client }),
    applyListingSellerOnboardingSaveSnapshot: (listing, onboarding) => ({ ...listing, sellerOnboarding: { formData: onboarding.form_data } }),
    setPrivateListings: vi.fn(),
  })
  const saved = await ctx.persistListingSnapshot({ galleryImages: [], [field]: '' })
  expect(saved.sellerOnboarding.formData[field]).toBe('')
  expect(stored.form_data[field]).toBe('')
  expect(stored.form_data.property24Reference).toBe('116284')
  expect(stored.form_data.privatePropertyReference).toBe('T498201')
})
it('uses an explicitly confirmed revision for restoration while the real seller guard still rejects an old revision', async () => {
  const id = '00000000-0000-4000-8000-000000000001'
  const onboardingId = '00000000-0000-4000-8000-000000000002'
  const oldSnapshot = { id, sellerOnboarding: { id: onboardingId, updatedAt: '2026-10-16T08:00:00Z' } }
  let stored = { id: onboardingId, private_listing_id: id, token: 'local-token', status: 'in_progress', updated_at: '2026-10-16T08:01:00Z', form_data: {} }
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: stored, error: null }) }
  const client = { from: vi.fn(() => query), rpc: vi.fn(async (_, args) => {
    if (args.p_revision.updatedAt !== stored.updated_at) return { error: { code: '40001' } }
    stored = { ...stored, form_data: args.p_form_data, updated_at: new Date(Date.parse(stored.updated_at) + 1000).toISOString() }
    return { data: stored, error: null }
  }) }
  const { ctx } = fixture({ listingId: id, listingRecord: oldSnapshot })
  Object.assign(ctx, {
    patchListing: () => oldSnapshot, buildListingSnapshotFormData: draft => ({ listingStatus: draft.listingStatus }),
    persistSellerProfileOnboardingFormData: options => persistSellerProfileOnboardingFormData({ ...options, client }),
    applyListingSellerOnboardingSaveSnapshot, setPrivateListings: vi.fn(),
  })
  const draft = { galleryImages: [], listingStatus: 'active' }
  await expect(ctx.persistListingSnapshot(draft)).rejects.toMatchObject({ code: 'SELLER_UPDATE_CONFLICT' })
  const confirmedSnapshot = applyListingSellerOnboardingSaveSnapshot(oldSnapshot, stored)
  const restored = await ctx.persistListingSnapshot(draft, { listingSnapshot: confirmedSnapshot })
  expect(restored.sellerOnboarding.saveRevision.updatedAt).toBe(stored.updated_at)
  await expect(ctx.persistListingSnapshot(draft)).rejects.toMatchObject({ code: 'SELLER_UPDATE_CONFLICT' })
  expect(oldSnapshot.sellerOnboarding.updatedAt).toBe('2026-10-16T08:00:00Z')
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
it.each(['Property24', 'Private Property'])('a %s confirmation-history failure is not recorded as a rejected portal submission', async channel => {
  const recordListingPublicationStage = vi.fn(async (_, stage) => { if (stage === 'accepted') throw new Error('History unavailable.') })
  const { ctx, popup } = fixture({ recordListingPublicationStage })
  await expect(popup(channel).onUpdate()).rejects.toThrow('accepted the request, but Arch9 could not save its confirmation')
  expect(ctx.recordListingPublicationStage.mock.calls.some(row => row[1] === 'failed')).toBe(false)
  expect(ctx.recordListingPublicationStage.mock.calls.some(row => row[1] === 'submitted')).toBe(true)
})


function enableUpdateReview(ctx, { ready = true } = {}) {
  const review = { rollout: { enabled: true, mode: 'review' }, channels: { privateProperty: { dataReady: ready } } }
  Object.assign(ctx, {
    syndicationReview: review, syndicationReviewAcknowledgements: {}, syndicationReviewUpdateChannel: 'privateProperty', shouldRequireSyndicationReview, canAcknowledgeSyndicationChannel,
    syndicationReviewContinuationRef: { current: { listingId: 'listing-1', pending: null } },
    openSyndicationReview: vi.fn(async () => review), setSyndicationReviewOpen: vi.fn(), setSyndicationReviewAcknowledgements: vi.fn(),
  })
  for (const name of ['requireSyndicationReviewBeforePublish', 'continueSyndicationReview', 'closeSyndicationReview']) {
    vm.runInContext(transformSync(controllerSource(name), { loader: 'jsx' }).code, ctx)
  }
}
it('continues the original Private Property update exactly once after its required review', async () => {
  const { ctx, popup } = fixture()
  enableUpdateReview(ctx)
  const outcome = popup('Private Property').onUpdate()
  await vi.waitFor(() => expect(ctx.setSyndicationReviewOpen).toHaveBeenCalledWith(true))
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
  const preview = vi.fn()
  ctx.continueSyndicationReview('privateProperty', preview)
  ctx.continueSyndicationReview('privateProperty', preview)
  expect((await outcome).ok).toBe(true)
  expect(ctx.callPrivatePropertyListingAction).toHaveBeenCalledOnce()
  expect(ctx.callPrivatePropertyListingAction.mock.calls[0][0]).toBe('publish')
  expect(preview).not.toHaveBeenCalled()
  expect(ctx.callProperty24ListingAction).not.toHaveBeenCalled()
})
it.each(['cancel', 'blocked', 'other-channel'])('an update review cannot send on %s', async action => {
  const { ctx, popup } = fixture()
  enableUpdateReview(ctx, { ready: action !== 'blocked' })
  const outcome = popup('Private Property').onUpdate()
  await vi.waitFor(() => expect(ctx.setSyndicationReviewOpen).toHaveBeenCalledWith(true))
  if (action !== 'cancel') ctx.continueSyndicationReview(action === 'other-channel' ? 'property24' : 'privateProperty', vi.fn())
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
  ctx.closeSyndicationReview()
  expect(await outcome).toEqual({ cancelled: true })
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
})
it('blocks an update when review could not load or the listing changed during review loading', async () => {
  const { ctx, popup } = fixture()
  enableUpdateReview(ctx)
  ctx.openSyndicationReview.mockResolvedValueOnce(null)
  await expect(popup('Private Property').onUpdate()).rejects.toThrow('could not be reviewed')
  ctx.syndicationReviewContinuationRef.current.listingId = 'another-listing'
  expect(await popup('Private Property').onUpdate()).toEqual({ cancelled: true })
  expect(ctx.callPrivatePropertyListingAction).not.toHaveBeenCalled()
})
