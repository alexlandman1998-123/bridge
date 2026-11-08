import { getPrivateListing } from '../privateListingService'
import { getWebsiteListingPublicationStatus } from '../websiteListingPublicationService'
import { normalizeListingChannelReference } from './listingMarketingChannelPresentation'
import { getRentalPortalStatus } from '../rentals/rentalListingChannelService'
import { getListingFieldIssues } from './listingFieldRequirements'
import { publishInitialListingChannels, requireSettledListingPublication } from './listingInitialPublicationService'

const LABELS = { property24: 'Property24', private_property: 'Private Property', agency_website: 'Agency Website' }
const ACTIVE = new Set(['active', 'published', 'live', 'tolet', 'underoffer'])
const INACTIVE = new Set(['inactive', 'expired', 'withdrawn', 'removed', 'notpublished', 'rented', 'sold'])
const normalizedStatus = value => String(value || '').toLowerCase().replace(/[\s_-]/g, '')

export function hasActivePortalAdvert(listing, key, payload) {
  const prefix = key === 'property24' ? 'property24' : 'privateProperty'
  const publication = listing.listingPublicationData || listing.publicationData || {}
  const observed = key === 'property24' ? payload?.lifecycle || payload?.status?.lifecycle : payload?.monitor
  if (payload && (!observed || observed.isOnPortal === false || payload.submissionAttempt?.requiresReconciliation)) return false
  const status = observed ? observed.property24Status || observed.state || observed.externalStatus : listing[`${prefix}Status`] || listing[`${key}_status`] || publication[`${prefix}Status`] || publication[`${key}_status`]
  const reference = observed?.listingNumber || observed?.statusProbe?.privatePropertyRef || listing[`${prefix}Reference`] || listing[`${key}_reference`] || publication[`${prefix}Reference`] || publication[`${key}_reference`]
  const identity = normalizeListingChannelReference(reference) || (key === 'private_property' && observed?.propertyId && observed.branchGuid)
  const live = ACTIVE.has(normalizedStatus(status)) || (observed?.isOnPortal === true && !INACTIVE.has(normalizedStatus(status)))
  return live && Boolean(identity)
}

// Save/verification is the caller's responsibility. Re-read advert identities
// afterwards: old channel selections alone must never create or relist adverts.
export async function updateExistingListingAdverts({ listingId, listingStatus, channels = [], requestKey, onResult, retryOnly = false, form, rental = false }, dependencies = {}) {
  if (!['active', 'under_offer'].includes(listingStatus)) return []
  const selected = [...new Set(channels)].filter(key => LABELS[key])
  if (!selected.length) return []
  let listing
  try {
    listing = await (dependencies.loadListing || getPrivateListing)(listingId, { includeRequirementsAndDocuments: false })
    if (!listing?.id) throw new Error('The saved listing could not be checked. No updates were sent.')
  } catch (error) {
    return selected.map(key => {
      const result = { key, label: LABELS[key], status: 'uncertain', retryable: false, notSent: true,
        message: error?.message || 'The saved listing could not be checked. No updates were sent.' }
      onResult?.(result)
      return result
    })
  }
  if (!['active', 'under_offer'].includes(listing.listingStatus || listing.listing_status || listingStatus)) return []
  const results = []
  for (const key of selected) {
    let result
    let sending = false
    try {
      const receipts = await (dependencies.settled || requireSettledListingPublication)(listingId, [key])
      if (retryOnly && !receipts.some(row => row.key === key && row.retryable)) continue
      const website = key === 'agency_website' ? await (dependencies.websiteStatus || getWebsiteListingPublicationStatus)(listingId) : null
      const portal = key !== 'agency_website' ? await (dependencies.portalStatus || getRentalPortalStatus)(listingId, key, {
        listingType: (listing.listingCategory || listing.listing_category || listing.listingType) === 'rental' ? 'rental' : 'sale', recordSync: false }) : null
      if (portal?.submissionAttempt?.requiresReconciliation) throw new Error('The previous portal request is unconfirmed. Check its status before sending these changes.')
      const eligible = website ? website.status === 'published' && website.websiteStatus === 'published' : hasActivePortalAdvert(listing, key, portal)
      if (!eligible) {
        result = { key, label: LABELS[key], status: 'skipped', retryable: false,
          message: 'No active advert to update. Publish or relist this channel separately when you are ready.' }
      } else {
        const issues = form ? getListingFieldIssues(form, { channels: [key], rental }) : []
        if (issues.length) {
          result = { key, label: LABELS[key], status: 'needs_attention', retryable: false, notSent: true,
            message: [...new Set(issues.map(issue => issue.message))].join(' '), fixStep: issues[0].step }
          results.push(result); onResult?.(result)
          continue
        }
        onResult?.({ key, label: LABELS[key], status: 'publishing', message: 'Checking requirements and queuing the update…' })
        sending = true
        const rows = await (dependencies.publish || publishInitialListingChannels)({ listingId, listingStatus, channels: [key], action: 'update', requestKey })
        result = rows.find(row => row.key === key)
      }
    } catch (error) {
      result = { key, label: LABELS[key], status: 'uncertain', retryable: false, notSent: !sending,
        message: error?.message || 'The update could not be confirmed. Check status before sending again.' }
    }
    if (result) { results.push(result); onResult?.(result) }
  }
  return results
}
