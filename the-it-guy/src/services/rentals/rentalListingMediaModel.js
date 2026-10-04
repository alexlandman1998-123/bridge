const text = (value) => String(value ?? '').trim()

export function isRentalMediaLink(value) {
  try {
    const url = new URL(text(value))
    return ['https:', 'http:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password
  } catch { return false }
}

export function getRentalMediaLinks(listing = {}) {
  const facts = listing.sellerCanonicalFacts || listing.seller_canonical_facts_json || {}
  const captured = facts.marketingMedia || {}
  const rows = listing.listingMedia || listing.media || []
  const publication = listing.listingPublicationData || listing.publicationData || {}
  const result = {}
  for (const [field, type, legacy] of [['videoLink', 'video', 'video_link'], ['virtualTourLink', 'virtual_tour', 'virtual_tour_link']]) {
    const hasCaptured = Object.hasOwn(captured, field)
    const capturedUrl = text(captured[field])
    const row = rows.find((item) => (item.media_type || item.mediaType) === type && (!hasCaptured || text(item.file_url || item.url) === capturedUrl))
    result[field] = hasCaptured ? capturedUrl : text(row?.file_url || row?.url || listing[field] || listing[legacy] || publication[field] || publication[legacy])
    result[`${field}MediaId`] = row?.id || ''
  }
  return result
}

export function buildRentalMediaEdits(form, listing) {
  const existing = getRentalMediaLinks(listing)
  return [['videoLink', 'video'], ['virtualTourLink', 'virtual_tour']]
    .filter(([field]) => Object.hasOwn(form, field))
    .map(([field, type]) => ({ type, id: existing[`${field}MediaId`] || null, url: text(form[field]) }))
}

export function buildRentalMediaProgress(listing = {}) {
  const rows = listing.listingMedia || listing.media || listing.galleryImages || []
  const links = getRentalMediaLinks(listing)
  const photos = rows.filter((row) => (row.media_type || row.mediaType || 'image') === 'image')
  return [
    { key: 'photos', label: 'Photos', complete: photos.length > 0, detail: `${photos.length} saved` },
    { key: 'cover', label: 'Cover', complete: photos.some((row) => row.is_cover || row.isCover), detail: photos.some((row) => row.is_cover || row.isCover) ? 'Selected' : 'Not selected' },
    { key: 'video', label: 'Video', complete: isRentalMediaLink(links.videoLink), detail: isRentalMediaLink(links.videoLink) ? 'Added' : 'Not added (optional)' },
    { key: 'virtual_tour', label: 'Virtual tour', complete: isRentalMediaLink(links.virtualTourLink), detail: isRentalMediaLink(links.virtualTourLink) ? 'Added' : 'Not added (optional)' },
    { key: 'floor_plan', label: 'Floor plan', complete: rows.some((row) => (row.media_type || row.mediaType) === 'floor_plan'), detail: rows.some((row) => (row.media_type || row.mediaType) === 'floor_plan') ? 'Added' : 'Not added (optional)' },
  ]
}

export function changeRentalPhotoGallery(form, imageId, action) {
  const images = [...form.galleryImages]
  const index = images.findIndex((image) => image.id === imageId)
  if (index < 0) throw new Error('This photo is no longer in the gallery. Reload before editing.')
  let coverImageId = form.coverImageId
  if (action === 'remove') {
    images.splice(index, 1)
    if (coverImageId === imageId) coverImageId = images[0]?.id || ''
  } else if (action === 'cover') {
    coverImageId = imageId
  } else if (action === 'earlier' || action === 'later') {
    const target = index + (action === 'earlier' ? -1 : 1)
    if (target >= 0 && target < images.length) [images[index], images[target]] = [images[target], images[index]]
  } else throw new Error('Unsupported photo action.')
  return { ...form, galleryImages: images, coverImageId }
}
