export const LISTING_IMAGE_MAX_BYTES = 25 * 1024 * 1024
export const LISTING_IMAGE_MAX_PIXELS = 50_000_000
export const LISTING_IMAGE_ALLOWED_TYPES = Object.freeze(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])

export function validateListingImageFile(file, { width = null, height = null } = {}) {
  const errors = []
  const type = String(file?.type || '').toLowerCase()
  const size = Number(file?.size || 0)
  if (!file) errors.push('Select a valid image file.')
  else {
    if (!LISTING_IMAGE_ALLOWED_TYPES.includes(type)) errors.push('Use a JPEG, PNG, WebP, or AVIF image.')
    if (!size || size > LISTING_IMAGE_MAX_BYTES) errors.push('Images must be 25 MB or smaller.')
  }
  if (Number(width) > 0 && Number(height) > 0 && Number(width) * Number(height) > LISTING_IMAGE_MAX_PIXELS) {
    errors.push('Images must not exceed 50 megapixels.')
  }
  return { valid: errors.length === 0, errors }
}

export async function readListingImageDimensions(file) {
  if (typeof Image === 'undefined' || typeof URL === 'undefined' || !file) return { width: null, height: null }
  const objectUrl = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth || null, height: image.naturalHeight || null })
      image.onerror = () => reject(new Error('The selected image could not be read.'))
      image.src = objectUrl
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
