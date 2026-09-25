import { normalizeListingChannelPublicUrl } from './listingMarketingChannelPresentation.js'

function text(value) {
  return String(value ?? '').trim()
}

function mediaUrl(item) {
  if (typeof item === 'string') return normalizeListingChannelPublicUrl(item)
  return normalizeListingChannelPublicUrl(item?.publicUrl || item?.url || item?.signedUrl)
}

export function buildListingShowDaySnapshot(listing = {}, draft = {}, agent = {}) {
  listing = listing && typeof listing === 'object' ? listing : {}
  draft = draft && typeof draft === 'object' ? draft : {}
  agent = agent && typeof agent === 'object' ? agent : {}

  const rawImages = Array.isArray(draft.galleryImages)
    ? draft.galleryImages
    : Array.isArray(listing.images)
      ? listing.images
      : []
  const coverId = text(draft.coverImageId)
  const orderedImages = [...rawImages].sort((left, right) => {
    const leftCover = coverId && text(left?.id) === coverId ? 1 : 0
    const rightCover = coverId && text(right?.id) === coverId ? 1 : 0
    return rightCover - leftCover
  })
  const images = [...new Set(orderedImages.map(mediaUrl).filter(Boolean))]
  const address = text(
    draft.formattedAddress ||
      listing.formattedAddress ||
      listing.formatted_address ||
      draft.streetAddress ||
      draft.addressLine1 ||
      listing.propertyAddress ||
      listing.address ||
      [draft.suburb || listing.suburb, draft.city || listing.city].filter(Boolean).join(', '),
  )
  const title = text(draft.headline || listing.listingTitle || listing.title || address) || 'Untitled listing'

  return {
    id: text(listing.id),
    title,
    address: address || 'Address to be confirmed',
    price: Number(draft.price || listing.askingPrice || listing.price || 0) || 0,
    reference: text(listing.arch9Reference || listing.listingReference || listing.listingCode),
    image: images[0] || normalizeListingChannelPublicUrl(listing.coverImageUrl || listing.coverImage),
    images,
    agentName: text(agent.name || listing.assignedAgentName || listing.assignedAgent),
    agentId: text(agent.id || listing.assignedAgentId || listing.assigned_agent_id),
    publicListingUrl: normalizeListingChannelPublicUrl(
      draft.bridgeListingPublicUrl || draft.property24ListingUrl || draft.privatePropertyListingUrl,
    ),
  }
}

export function validateListingShowDayDraft(values = {}, { listing = {}, publicListingReady = false, publish = true } = {}) {
  const errors = []
  if (!text(listing.id)) errors.push('Save the listing before creating a show day.')
  if (!text(values.date)) errors.push('Choose the show-day date.')
  if (!text(values.startTime)) errors.push('Choose a start time.')
  if (!text(values.endTime)) errors.push('Choose an end time.')
  if (text(values.startTime) && text(values.endTime) && values.endTime <= values.startTime) errors.push('The end time must be after the start time.')
  if (!text(values.hostName)) errors.push('Add the host agent.')
  if (publish && !publicListingReady) errors.push('Publish the property on at least one listing channel before activating the public RSVP link.')
  return errors
}

export function buildListingShowDayPayload(listing = {}, values = {}, { publish = true } = {}) {
  return {
    title: text(values.title) || listing.title,
    subjectId: listing.id,
    subjectLabel: listing.title,
    address: listing.address,
    image: listing.image,
    startDate: text(values.date),
    startTime: text(values.startTime),
    endTime: text(values.endTime),
    hostUserId: text(values.hostUserId || listing.agentId) || null,
    hostName: text(values.hostName || listing.agentName),
    visibility: text(values.visibility) || 'public',
    registrationEnabled: true,
    registrationMessage: text(values.registrationMessage),
    attendeeCheckInEnabled: true,
    createLeadsForRegistrations: true,
    listingSnapshot: listing,
    status: publish ? 'upcoming' : 'draft',
    description: text(values.registrationMessage),
  }
}

export function buildListingShowDayRsvpPath(event = {}) {
  event = event && typeof event === 'object' ? event : {}
  const token = text(event.publicToken || event.public_token)
  return token ? `/marketing/rsvp/${encodeURIComponent(token)}` : ''
}
