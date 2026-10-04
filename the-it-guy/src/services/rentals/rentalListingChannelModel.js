import { buildRentalListingEditForm } from './rentalListingEditModel.js'
import { buildListingPublicationSnapshot, deriveListingPublicationStates } from '../listings/listingPublicationState.js'
import { getListingChannelViewUrl, normalizeListingChannelReference } from '../listings/listingMarketingChannelPresentation.js'
import { rentalChannelStatus } from './rentalChannelStatus.js'

export const RENTAL_PORTAL_STATUSES = Object.freeze({
  property24: ['Active', 'Pending', 'Rented', 'Withdrawn', 'Expired', 'BackOnMarket'],
  private_property: ['ToLet', 'Inactive'],
})

export function buildRentalPublicationSnapshot(listing) {
  const form = buildRentalListingEditForm(listing)
  return buildListingPublicationSnapshot({ ...form, headline: form.title, price: form.monthlyRent,
    formattedAddress: form.propertyAddress, listingStatus: listing.listingStatus || listing.listing_status,
    floorplans: (listing.listingMedia || []).filter(row => row.media_type === 'floor_plan').map(row => ({ url: row.file_url })) })
}

export function buildRentalWebsitePublicationStates(listing, activity = []) {
  const snapshot = buildRentalPublicationSnapshot(listing)
  const agency = deriveListingPublicationStates(activity, snapshot).agency_website
  const kingdom = deriveListingPublicationStates(activity.filter(row => row.metadata?.channel === 'kingdom_website')
    .map(row => ({ ...row, metadata: { ...row.metadata, channel: 'agency_website' } })), snapshot).agency_website
  return { agency_website: agency, kingdom_website: kingdom }
}

export function buildRentalPortalChannels(listing, { property24 = null, private_property: pp = null, activity = [], errors = {}, loading = false } = {}) {
  const publication = listing.listingPublicationData || listing.publicationData || {}
  const p24 = property24?.lifecycle || property24?.status?.lifecycle || {}
  const monitor = pp?.monitor || {}
  const facts = [
    { key: 'property24', label: 'Property24', prefix: 'property24', observed: p24.property24Status || p24.state,
      reference: p24.listingNumber || property24?.status?.listingNumber, url: p24.property24ListingUrl,
      externalStatus: p24.externalStatus, isOnPortal: p24.isOnPortal, lastSyncedAt: p24.lastSyncedAt, lastCheckedAt: p24.lastCheckedAt, error: p24.lastError },
    { key: 'private_property', label: 'Private Property', prefix: 'privateProperty', observed: monitor.externalStatus,
      reference: monitor.statusProbe?.privatePropertyRef, url: monitor.statusProbe?.activeListing?.listingUrl,
      lastSyncedAt: monitor.publication?.lastSyncedAt, lastCheckedAt: monitor.generatedAt,
      submittedAt: monitor.publication?.submittedAt, error: monitor.publication?.lastError },
  ]
  const channels = facts.map(channel => {
    const snakePrefix = channel.key === 'property24' ? 'property24' : 'private_property'
    const field = suffix => {
      const camel = `${channel.prefix}${suffix}`
      const snake = `${snakePrefix}_${suffix.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace(/^_/, '')}`
      return listing[camel] || publication[camel] || listing[snake] || publication[snake]
    }
    const external = (listing.listingExternalLinks || []).find(link => String(link.platform || '').toLowerCase().replace(/[^a-z0-9]/g,'') === channel.key.replaceAll('_',''))
    const status = channel.observed || field('Status') || external?.status || 'not_published'
    return { ...channel, status, live: rentalChannelStatus(status).live,
      reference: normalizeListingChannelReference(channel.reference || field('Reference')),
      publicUrl: getListingChannelViewUrl(channel.key, channel.url || field('ListingUrl') || external?.url),
      lastSyncedAt: channel.lastSyncedAt || field('LastSyncedAt') || '',
      loadError: errors[channel.key] || '', loading }
  })
  const states = deriveListingPublicationStates(activity, buildRentalPublicationSnapshot(listing), Object.fromEntries(channels.map(channel => [channel.key, channel])))
  return channels.map(channel => {
    const state = states[channel.key]
    const withdrawn = state.stage === 'withdrawn' && (!channel.lastCheckedAt || Date.parse(state.withdrawnAt) >= Date.parse(channel.lastCheckedAt))
    const confirmedLive = state.stage === 'verified' && (!channel.lastCheckedAt || Date.parse(state.verifiedAt) >= Date.parse(channel.lastCheckedAt))
    const live = confirmedLive || (channel.isOnPortal === true) || ((channel.isOnPortal ?? channel.live) && !withdrawn)
    const pending = ['submitted','accepted'].includes(state.stage) && (!channel.lastCheckedAt || Date.parse(state.acceptedAt || state.submittedAt) >= Date.parse(channel.lastCheckedAt))
    const status = withdrawn ? 'withdrawn' : !live && pending ? state.stage : channel.status
    let statusLabel = ''
    if (loading) statusLabel = 'Checking saved status…'
    else if (errors[channel.key]) statusLabel = 'Status unavailable'
    else if (channel.isOnPortal === true && (withdrawn || ['withdrawn','expired'].includes(status.toLowerCase()))) statusLabel = 'Still reported live'
    else if (confirmedLive) statusLabel = 'Public page verified'
    else if (channel.isOnPortal === false && channel.live) statusLabel = 'Not currently reported live'
    return { ...channel, live, status, statusLabel, publicUrl: live ? getListingChannelViewUrl(channel.key,state.publicUrl) || channel.publicUrl : '',
      reference: channel.reference || normalizeListingChannelReference(state.reference), publicationState: state,
      statusDetail: state.changeCount ? `${state.changeCount} saved change${state.changeCount === 1 ? '' : 's'} not sent to this channel` : '',
      activity: [
        ['Submitted', state.submittedAt || channel.submittedAt], ['Accepted', state.acceptedAt],
        ['Public page verified', state.verifiedAt], ['Withdrawn', state.withdrawnAt], ['Failed', state.failedAt],
        ['Portal updated', channel.lastSyncedAt], ['Status checked', channel.lastCheckedAt],
      ].filter(([,time]) => time).map(([label,time]) => ({ label, time })),
      error: channel.loadError || channel.error || state.failureDetail || '', }
  })
}
