import sharp from 'sharp'

export const PROPERTY24_PHOTO_PREPARATION_VERSION = 'publishing-photos-v1'
export const PROPERTY24_PHOTO_PAYLOAD_LIMIT = 25_000_000
export const PROPERTY24_PHOTO_GALLERY_TARGET = 18_000_000
export const PROPERTY24_PHOTO_SOURCE_LIMIT = 50 * 1024 * 1024

// Always encode from the original, never from an already compressed attempt.
// Equal per-photo allocations reserve room for the whole gallery before work
// starts. The final request is checked again including base64 and JSON overhead.
const PROFILES = [
  [1600, 84], [1600, 76], [1440, 68], [1280, 60], [1024, 52], [800, 45],
]

export async function prepareProperty24PublishingPhoto(buffer, targetBytes) {
  if (buffer.byteLength > PROPERTY24_PHOTO_SOURCE_LIMIT) {
    throw new Error('This original is too large to process safely. Contact support for help preparing it; the original has not been changed.')
  }
  let metadata
  try {
    metadata = await sharp(buffer, { limitInputPixels: 80_000_000, failOn: 'warning' }).metadata()
    if (!metadata.width || !metadata.height || (metadata.pages || 1) > 1) throw new Error('Unsupported image')
  } catch {
    throw new Error('This file cannot be read as a complete photo. Replace it with a working JPEG, PNG or WebP, save, then check again.')
  }
  for (const [maxDimension, quality] of PROFILES) {
    let output
    try {
      output = await sharp(buffer, { limitInputPixels: 80_000_000, failOn: 'warning', sequentialRead: true })
        .rotate()
        .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .toColourspace('srgb')
        .jpeg({ quality, mozjpeg: true })
        .toBuffer({ resolveWithObject: true })
    } catch {
      throw new Error('This photo could not be decoded completely. Replace the damaged file, save, then check again.')
    }
    if (output.data.byteLength <= targetBytes) {
      return { buffer: output.data, width: output.info.width, height: output.info.height, quality,
        originalWidth: metadata.width, originalHeight: metadata.height, originalFormat: metadata.format }
    }
  }
  throw new Error('A readable publishing copy could not fit the gallery size allowance. Contact support before publishing; no photos will be omitted.')
}
