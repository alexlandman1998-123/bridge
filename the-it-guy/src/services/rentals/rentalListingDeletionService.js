import { deletePrivateListing, getPrivateListing, getPrivateListingActivity } from '../privateListingService'
import { deleteAgentPrivateListingCascade } from '../../lib/agentListingStorage'
import { getWebsiteListingPublicationStatus } from '../websiteListingPublicationService'
import { getKingdomWebsitePublicationStatus } from '../kingdomWebsitePublicationService'
import { isRentalListingRecord } from './rentalListingDraftService'
import { buildRentalPortalChannels } from './rentalListingChannelModel'
import { getRentalPortalStatus } from './rentalListingChannelService'

const key = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
const LIVE = new Set(['active', 'live', 'published', 'on_portal', 'current', 'tolet', 'to_let', 'torent', 'to_rent', 'backonmarket', 'back_on_market'])
const OFF = new Set(['withdrawn', 'expired', 'removed', 'inactive', 'not_published', 'unpublished', 'draft', 'not_on_portal'])
const PENDING = new Set(['submitted', 'accepted', 'pending', 'queued', 'publishing', 'updating', 'syncing', 'awaiting_verification', 'uncertain'])

export async function inspectRentalListingDeletion(listingId, options = {}) {
  const listing = await getPrivateListing(listingId, { includeRequirementsAndDocuments: false })
  if (!listing || !isRentalListingRecord(listing) || !options.organisationId ||
      String(listing.organisationId || listing.organisation_id) !== String(options.organisationId) ||
      (options.branchId && String(listing.branchId || listing.branch_id) !== String(options.branchId))) {
    throw new Error('This rental listing is no longer available in the current workspace. Refresh before deleting.')
  }
  const activity = await getPrivateListingActivity(listing.id, { requireAvailable: true })
  const channels = buildRentalPortalChannels(listing, { activity })
  const liveChannels = []
  const unconfirmedChannels = []
  const candidates = channels.filter(channel => channel.reference || !OFF.has(key(channel.status)) ||
    ['submitted', 'accepted', 'verified'].includes(channel.publicationState?.stage))
  const checks = await Promise.allSettled([
    ...candidates.map(channel => getRentalPortalStatus(listing.id, channel.key, { refresh: true })),
    getWebsiteListingPublicationStatus(listing.id), getKingdomWebsitePublicationStatus(listing.id),
  ])
  checks.forEach((check, index) => {
    const channel = candidates[index] || { label: index === candidates.length ? 'Agency Website' : 'Kingdom Website' }
    if (check.status === 'rejected') { unconfirmedChannels.push(channel.label); return }
    const data = check.value
    if (index >= candidates.length) {
      if (data?.available === false) return
      if (LIVE.has(key(data?.status))) liveChannels.push(channel.label)
      else if (!OFF.has(key(data?.status))) unconfirmedChannels.push(channel.label)
      return
    }
    const observed = channel.key === 'property24' ? data?.lifecycle || data?.status?.lifecycle || {} : data?.monitor || {}
    const status = key(observed.property24Status || observed.state || observed.externalStatus)
    if (observed.isOnPortal === true || observed.statusProbe?.activeListing || LIVE.has(status)) liveChannels.push(channel.label)
    else if (PENDING.has(status) || data?.submissionAttempt?.requiresReconciliation || ['uncertain', 'failed', 'blocked'].includes(key(data?.status)) ||
      !(observed.isOnPortal === false || OFF.has(status))) unconfirmedChannels.push(channel.label)
  })
  return { listing, liveChannels, unconfirmedChannels, canDelete: !liveChannels.length && !unconfirmedChannels.length }
}

export async function deleteRentalListing(listingId, options = {}) {
  // Recheck at confirmation: a listing can be published while its dialog is open.
  const state = await inspectRentalListingDeletion(listingId, options)
  if (!state.canDelete) {
    const error = new Error(state.liveChannels.length
      ? 'Withdraw this listing from all live channels before deleting it.'
      : 'Confirm removal from every channel before deleting this listing.')
    error.deletionState = state
    throw error
  }
  const result = await deletePrivateListing(state.listing.id, {
    organisationId: options.organisationId,
    listingReference: state.listing.listingReference || state.listing.listing_reference,
  })
  if (!result?.deleted) throw new Error('The rental listing deletion could not be confirmed.')
  deleteAgentPrivateListingCascade({ ...state.listing, ...result.listing })
  return result
}
