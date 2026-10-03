const galleryKeys = ['images', 'photos', 'gallery', 'galleryImages', 'gallery_images', 'imageGallery', 'image_gallery', 'imageUrls', 'image_urls', 'media', 'mediaItems', 'media_items']
const urlKeys = ['url', 'secureUrl', 'secure_url', 'imageUrl', 'image_url', 'publicUrl', 'public_url', 'signedUrl', 'signed_url', 'src']

function collectImages(value, result) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectImages(item, result))
  } else if (typeof value === 'string') {
    const url = value.trim()
    if (/^(https?:\/\/|\/)/i.test(url) && !/\.(mp4|webm|mov|pdf)(?:[?#]|$)/i.test(url)) result.push(url)
  } else if (value && typeof value === 'object') {
    const type = String(value.mimeType || value.mime_type || value.type || '').toLowerCase()
    if (/video|document|pdf/.test(type)) return
    const url = urlKeys.map((key) => value[key]).find((item) => typeof item === 'string' && item.trim())
    if (url) collectImages(url, result)
    else galleryKeys.forEach((key) => collectImages(value[key], result))
  }
}

export function resolveListingPropertyImages({ listing = {}, activeSellingContext = {}, unit = {}, formData = {}, coverImageUrl = '' } = {}) {
  const images = []
  collectImages(coverImageUrl, images)
  for (const source of [listing, listing?.marketing, listing?.propertyDetails, activeSellingContext, unit]) {
    galleryKeys.forEach((key) => collectImages(source?.[key], images))
  }
  // Onboarding photos are a fallback until the linked listing has its own media.
  if (!images.length) galleryKeys.forEach((key) => collectImages(formData?.[key], images))
  return [...new Set(images)]
}
