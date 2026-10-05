// Viewing URLs expire; bucket/path identify the original private object.
export async function refreshListingPhotoUrls(client, rows = [], { strict = false } = {}) {
  const groups = new Map()
  const result = rows.map((row) => ({ ...row }))
  for (const row of result) {
    if (row.media_type !== 'image') continue
    let bucket = row.storage_bucket
    let path = row.storage_path
    if (!bucket || !path) {
      try {
        const url = new URL(row.file_url)
        if (url.origin !== new URL(client.supabaseUrl).origin) continue
        const match = url.pathname.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/)
        if (!match) continue
        bucket = decodeURIComponent(match[1])
        path = decodeURIComponent(match[2])
      } catch { continue }
    }
    // Only this listing's private upload namespace belongs to this flow.
    if (!path.startsWith(`private-listings/${row.listing_id}/`) || path.split('/').some((part) => part === '..' || part === '.')) continue
    row.storage_bucket = bucket
    row.storage_path = path
    if (!groups.has(bucket)) groups.set(bucket, [])
    groups.get(bucket).push(row)
  }
  // Bound both requests and payload size for large galleries.
  for (const [bucket, photos] of groups) {
    for (let index = 0; index < photos.length; index += 100) {
      const batch = photos.slice(index, index + 100)
      const paths = [...new Set(batch.map((row) => row.storage_path))]
      let response
      try { response = await client.storage.from(bucket).createSignedUrls(paths, 60 * 60 * 24 * 30) }
      catch (error) { response = { error } }
      const signed = new Map((response.data || []).map((item) => [item.path, item]))
      for (const row of batch) {
        const item = signed.get(row.storage_path)
        if (response.error || item?.error || !item?.signedUrl) {
          if (strict) throw new Error('Unable to refresh a rental photo viewing link. Reload or check storage access.', { cause: response.error || item?.error })
          row.file_url = ''
          row.mediaLoadError = 'Photo viewing link unavailable'
        } else row.file_url = item.signedUrl
      }
    }
  }
  return result
}
