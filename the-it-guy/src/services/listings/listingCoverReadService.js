// Cover reads are independent of seller uploads, signing and listing mutations.
import { refreshListingPhotoUrls } from './listingPhotoStorage.js'
import { requireClient, normalizeText, normalizeUuid, isMissingTableError, isMissingSchemaError, isPermissionDeniedError } from './listingReadPrimitives.js'

export const privateCoverFallbacks = new Map()

export async function getPrivateListingCoverImageUrls(listingIds = [], { client = requireClient(), onCover = () => {}, thumbnail = false } = {}) {
  const ids = [...new Set((Array.isArray(listingIds) ? listingIds : []).map(normalizeUuid).filter(Boolean))]
  if (!ids.length) return {}

  const coverQuery = await client
    .from('listing_media')
    .select('listing_id, media_type, file_url, is_cover, sort_order, storage_bucket, storage_path')
    .in('listing_id', ids)
    .eq('media_type', 'image')
    .eq('is_cover', true)
    .order('sort_order', { ascending: true })
  if (coverQuery.error) {
    if (
      isMissingTableError(coverQuery.error, 'listing_media') ||
      isMissingSchemaError(coverQuery.error) ||
      isPermissionDeniedError(coverQuery.error)
    ) return {}
    throw coverQuery.error
  }

  const coverUrls = {}
  const publishCover = async (row) => {
    const listingId = normalizeText(row?.listing_id)
    if (!listingId || coverUrls[listingId]) return
    const [photo] = await refreshListingPhotoUrls(client, [row])
    let url = normalizeText(photo?.file_url)
    if (thumbnail && url && photo.storage_bucket && photo.storage_path) {
      try {
        const { data, error } = await client.storage.from(photo.storage_bucket).createSignedUrl(photo.storage_path, 3600, {
          transform: { width: 480, height: 264, resize: 'cover', quality: 72 },
        })
        if (!error && data?.signedUrl) {
          privateCoverFallbacks.set(data.signedUrl, url)
          if (privateCoverFallbacks.size > 500) privateCoverFallbacks.delete(privateCoverFallbacks.keys().next().value)
          url = data.signedUrl
        }
      } catch { /* Keep the original private link when resizing is unavailable. */ }
    }
    coverUrls[listingId] = url
    onCover({ [listingId]: url })
  }
  const coversById = new Map()
  for (const row of coverQuery.data || []) if (!coversById.has(row.listing_id)) coversById.set(row.listing_id, row)
  // Resolve each card independently. Never retrieve/sign a whole gallery for its cover.
  for (let index = 0; index < ids.length; index += 6) {
    await Promise.all(ids.slice(index, index + 6).map(async (id) => {
      let row = coversById.get(id)
      if (!row) {
        const fallback = await client.from('listing_media')
          .select('listing_id, media_type, file_url, is_cover, sort_order, storage_bucket, storage_path')
          .in('listing_id', [id]).eq('media_type', 'image')
          .order('sort_order', { ascending: true }).order('id', { ascending: true }).limit(1)
        if (fallback.error) throw fallback.error
        row = fallback.data?.[0]
      }
      if (row) await publishCover(row)
    }))
  }

  return coverUrls
}
