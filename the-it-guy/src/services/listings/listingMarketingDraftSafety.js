function hasOwn(source, key) {
  return Boolean(source && typeof source === 'object' && Object.prototype.hasOwnProperty.call(source, key))
}

export function resolveMarketingDraftText(draft, key, fallback = '') {
  if (!hasOwn(draft, key)) return String(fallback ?? '').trim()
  return String(draft[key] ?? '').trim()
}

export function resolveMarketingDraftList(draft, key, fallback = []) {
  if (!hasOwn(draft, key)) return Array.isArray(fallback) ? [...fallback] : []
  return Array.isArray(draft[key]) ? draft[key].map(String).filter(Boolean) : []
}

export function getPendingListingMediaUploads(draft = {}) {
  return [
    ...(Array.isArray(draft.galleryImages) ? draft.galleryImages.map((item) => ({ ...item, mediaType: 'image' })) : []),
    ...(Array.isArray(draft.floorplans) ? draft.floorplans.map((item) => ({ ...item, mediaType: 'floorplan' })) : []),
  ].filter((item) => {
    const url = String(item?.url || item?.signedUrl || item?.publicUrl || '').trim()
    return Boolean(item?.uploadWarning) || !url || /^(data|blob):/i.test(url)
  })
}

export function hasBlockingListingMediaUploads(draft = {}) {
  return getPendingListingMediaUploads(draft).length > 0
}

export function resolvePublicListingDescription(listing = {}, onboarding = {}) {
  if (!listing) return ''
  const candidates = [
    listing.marketing?.description, listing.listingPublicationData?.description,
    listing.publicationData?.description, listing.listingDescription,
    onboarding.listingDescription, onboarding.propertyDescription,
    listing.propertyDetails?.description, listing.description,
    onboarding.propertyNotes, onboarding.description,
  ]
  return candidates.map(value => String(value ?? '').trim()).find(value => value &&
    !/BRIDGE_QUICK_ADD_METADATA:|^Developer listing:\s*development unit|^Development ID:\s*[0-9a-f-]+/im.test(value)) || ''
}
