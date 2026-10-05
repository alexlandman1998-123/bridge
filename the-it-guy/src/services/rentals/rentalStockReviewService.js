import { getAgentPrivateListings, getPrivateListingActivity } from '../privateListingService'
import { isRentalListingRecord } from './rentalListingDraftService'
import { buildRentalListingIndexRow } from './rentalListingIndexModel'
import { buildRentalPortalChannels, buildRentalPublicationSnapshot } from './rentalListingChannelModel'
import { getListingChannelViewUrl, normalizeListingChannelReference } from '../listings/listingMarketingChannelPresentation'
import { buildRentalListingQueryOptions } from './rentalWorkspaceScope'

import { buildRentalHistoryChanges, buildRentalAuditMediaEvidence } from './rentalListingHistoryModel'

const text = value => String(value ?? '').trim()
export function isRentalStockInScope(listing, scope) {
  if (!scope.organisationId || !scope.assignedAgentId || listing.organisationId !== scope.organisationId) return false
  if (scope.listingBranchId && listing.branchId !== scope.listingBranchId) return false
  return scope.includeAllOrganisationListings === true || listing.assignedAgentId === scope.assignedAgentId
}

export function buildRentalStockReviewRow(listing) {
  const index = buildRentalListingIndexRow(listing)
  const archived = (listing.listingVisibility || '').toLowerCase() === 'archived' || (listing.listingStatus || '').toLowerCase() === 'archived'
  const withdrawn = (listing.listingStatus || '').toLowerCase() === 'withdrawn'
  const channels = buildRentalPortalChannels(listing)
  const issues = []
  if (archived || withdrawn) issues.push({ code: 'hidden_stock', label: 'Excluded from normal rental stock', action: 'Confirm why this rental was archived or withdrawn with the responsible agent before requesting recovery.' })
  for (const channel of channels) {
    if (channel.live && (!channel.reference || !channel.publicUrl)) issues.push({ code: `${channel.key}_metadata`, label: `${channel.label}: published status has incomplete reference or public link`, action: 'Inspect saved publication history and the portal record; confirm the exact listing before saving a link in Marketing.' })
    if ((archived || withdrawn) && channel.live) issues.push({ code: `${channel.key}_live_hidden`, label: `${channel.label}: saved status still reports live`, action: 'Check the actual portal status before taking any withdrawal or recovery action.' })
  }
  const snapshot = buildRentalPublicationSnapshot(listing)
  if (!snapshot.gallery.length) issues.push({ code: 'photos_missing', label: 'No saved gallery photos', action: 'Ask the agent whether photos were removed intentionally. Historical evidence or original files are needed for recovery.' })
  return { id: listing.id, title: index.title, reference: listing.listingReference || '', updatedAt: listing.updatedAt || '',
    state: archived ? 'Archived' : withdrawn ? 'Withdrawn' : 'Current', channels, issues }
}

export async function loadRentalStockReview(scope) {
  if (!scope.organisationId || !scope.assignedAgentId) throw new Error('Select an organisation and sign in before reviewing rental stock.')
  const listings = await getAgentPrivateListings(scope.assignedAgentId, {
    ...buildRentalListingQueryOptions(scope), includeMedia: true,
    includeArchivedListings: true, includeWithdrawnListings: true, requireAvailable: true,
  })
  return listings.filter(listing => isRentalListingRecord(listing) && isRentalStockInScope(listing, scope))
}

// Historical snapshots are evidence only: intentional edits and deletions cannot be inferred.
export function buildRentalStockHistoryReview(listing, activity = []) {
  const snapshot = buildRentalPublicationSnapshot(listing)
  const evidence = []
  for (const event of activity) {
    if (event.private_listing_id !== listing.id) continue
    evidence.push(...buildRentalAuditMediaEvidence(listing, event))
    const previous = event.metadata?.snapshot
    if (!previous || typeof previous !== 'object') continue
    for (const [key, label] of [['gallery', 'Photos'], ['floorplans', 'Floor plans'], ['videoLink', 'Video'], ['virtualTourLink', 'Virtual tour']]) {
      const old = Array.isArray(previous[key]) ? previous[key].map(text).filter(Boolean) : [text(previous[key])].filter(Boolean)
      const current = Array.isArray(snapshot[key]) ? snapshot[key] : [snapshot[key]]
      const missing = old.filter(value => !current.includes(value))
      if (missing.length) evidence.push({ id: `${event.id}:${key}`, label, count: missing.length, recordedAt: event.created_at, source: event.activity_title || event.activity_type || 'Listing history' })
    }
  }
  return { evidence, events: activity.filter(event => event.private_listing_id === listing.id).map(event => ({ id: event.id, title: event.activity_title || event.activity_type, recordedAt: event.created_at, description: text(event.activity_description),
    actor: text(event.performed_by), changes: buildRentalHistoryChanges(event.metadata),
    channel: ['property24', 'private_property'].includes(event.metadata?.channel) ? event.metadata.channel : '',
    reference: ['property24', 'private_property'].includes(event.metadata?.channel) ? normalizeListingChannelReference(event.metadata?.reference) : '',
    publicUrl: getListingChannelViewUrl(event.metadata?.channel, event.metadata?.publicUrl),
  })) }
}

export async function loadRentalStockHistoryReview(listing, scope) {
  if (!isRentalListingRecord(listing) || !isRentalStockInScope(listing, scope)) throw new Error('This rental is outside the selected workspace scope.')
  const activity = await getPrivateListingActivity(listing.id, { requireAvailable: true })
  return buildRentalStockHistoryReview(listing, activity)
}
