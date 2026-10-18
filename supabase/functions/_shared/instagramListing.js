import { httpsUrl, isMetaId, isUuid, publicListingPost, text } from './metaIntegrationCore.js'

export const INSTAGRAM_SCOPES = ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement']
export const instagramConnectionReady = row => row?.connection_status === 'connected'
  && INSTAGRAM_SCOPES.every(scope => row.granted_scopes?.includes(scope))
  && row.page_tasks?.some(task => ['CREATE_CONTENT', 'MANAGE', 'PROFILE_PLUS_CREATE_CONTENT'].includes(task))

const objectPath = path => path.split('/').map(encodeURIComponent).join('/')

export function instagramPhotos(media, origin, listingId) {
  return media.flatMap(item => {
    if (item.media_type !== 'image') return []
    let bucket = text(item.storage_bucket), path = text(item.storage_path)
    if (!bucket && !path) {
      try {
        const url = new URL(item.file_url)
        const match = url.origin === origin && url.protocol === 'https:' && !url.username && !url.password && !url.hash
          && url.pathname.match(/^\/storage\/v1\/object\/(?:sign|authenticated|public)\/(documents)\/(.+)$/)
        if (match) { bucket = match[1]; path = decodeURIComponent(match[2]) }
      } catch { /* Legacy viewing URLs can expire; their object identity still belongs to this listing. */ }
    }
    if ((bucket || path) && bucket !== 'listing-media') {
      if (bucket !== 'documents' || !isUuid(listingId) || item.listing_id !== listingId
        || !path.startsWith(`private-listings/${listingId}/gallery/`) || /[\\%?#]/.test(path)
        || Array.from(path).some(char => char.codePointAt(0) < 32 || char.codePointAt(0) === 127)
        || path.split('/').some(part => !part || part === '.' || part === '..')) return []
      return [{ id: item.id, url: `${origin}/storage/v1/object/authenticated/documents/${objectPath(path)}`, bucket, path, private: true, isCover: item.is_cover }]
    }
    try {
      const url = new URL(item.file_url)
      if (url.origin === origin && url.protocol === 'https:'
        && !url.username && !url.password && !url.search && !url.hash
        && url.pathname.startsWith('/storage/v1/object/public/listing-media/')) return [{ id: item.id, url: item.file_url, isCover: item.is_cover }]
    } catch { /* Arbitrary URLs are never fetched or sent to Meta. */ }
    return []
  }).map((photo, index) => ({ ...photo, label: `Listing photo ${index + 1}${photo.isCover ? ' · cover' : ''}` }))
}

function signedPhotoUrl(photo, value, origin) {
  try {
    const url = new URL(value)
    if (photo.private && url.origin === origin && url.protocol === 'https:' && !url.username && !url.password && !url.hash
      && url.pathname === `/storage/v1/object/sign/${photo.bucket}/${objectPath(photo.path)}`
      && url.searchParams.get('token') && [...url.searchParams.keys()].every(key => key === 'token')) return url.href
  } catch { /* Do not propagate signed URLs or storage errors in an error message. */ }
  throw new Error('The selected listing photo viewing link could not be prepared. Refresh Instagram and try again.')
}

// Use the caller's RLS-protected client, never the service-role storage client.
// Signed links are response-only; canonical object URLs remain in saved previews.
export async function signInstagramPhotos(client, photos, origin) {
  const privatePhotos = photos.filter(photo => photo.private)
  if (!privatePhotos.length) return photos
  const paths = [...new Set(privatePhotos.map(photo => photo.path))]
  let response
  try { response = await client.storage.from('documents').createSignedUrls(paths, 3600) }
  catch { throw new Error('Listing photo access could not be verified. Refresh Instagram and try again.') }
  const { data, error } = response
  if (error) throw new Error('Listing photo access could not be verified. Refresh Instagram and try again.')
  const signed = new Map((data || []).map(item => [item.path, item]))
  return photos.map(photo => {
    if (!photo.private) return photo
    const item = signed.get(photo.path)
    if (item?.error) throw new Error('Listing photo access could not be verified. Refresh Instagram and try again.')
    return { ...photo, url: signedPhotoUrl(photo, item?.signedUrl, origin) }
  })
}

export function instagramSnapshot(listing, media, input, origin) {
  if (listing?.is_active === false || !['active', 'under_offer'].includes(text(listing?.listing_status).toLowerCase())) throw new Error('Choose a saved, active listing before posting to Instagram.')
  if (input.caption !== undefined && (!text(input.caption) || Array.from(text(input.caption)).length > 2200)) throw new Error('Write an Instagram caption of 1 to 2,200 characters, including the listing link.')
  const photos = instagramPhotos(media, origin, listing.id)
  const photo = input.imageId ? photos.find(row => row.id === input.imageId) : photos[0]
  if (!photo) throw new Error('Choose a saved listing gallery photo or public listing photo for Instagram.')
  const base = publicListingPost(listing, [], { mode: 'text', ...(input.caption === undefined ? {} : { caption: input.caption }) }, origin)
  const link = [listing.bridge_listing_public_url, listing.property24_listing_url, listing.private_property_listing_url].map(httpsUrl).find(Boolean)
  const caption = input.caption === undefined ? [base.caption, link].filter(Boolean).join('\n\n') : text(input.caption)
  if (!caption || Array.from(caption).length > 2200) throw new Error('Write an Instagram caption of 1 to 2,200 characters, including the listing link.')
  return { title: base.title, caption, mode: 'photo', imageId: photo.id, imageUrl: photo.url, listingUpdatedAt: base.listingUpdatedAt }
}

export function jpegDimensions(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 8 * 1024 * 1024) throw new Error('Instagram photos must be JPEG files of at most 8 MB.')
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Instagram requires a JPEG photo. Choose a JPG from the listing gallery.')
  for (let offset = 2; offset + 4 < bytes.length;) {
    if (bytes[offset++] !== 0xff) break
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === 0xda || marker === 0xd9) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    const length = (bytes[offset] << 8) + bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) break
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8 && bytes[offset + 2] === 8) {
      const height = (bytes[offset + 3] << 8) + bytes[offset + 4]
      const width = (bytes[offset + 5] << 8) + bytes[offset + 6]
      if (width < 320 || !height || width / height < 0.8 || width / height > 1.91) throw new Error('Choose a JPEG at least 320 pixels wide with an aspect ratio between 4:5 and 1.91:1.')
      return { width, height, bytes: bytes.length }
    }
    offset += length
  }
  throw new Error('This listing photo is not a supported JPEG image.')
}

export async function inspectInstagramPhoto(url, origin, fetcher = fetch, photo = null) {
  if (photo?.private) signedPhotoUrl(photo, url, origin)
  else if (!instagramPhotos([{ id: 'photo', media_type: 'image', file_url: url }], origin).length) throw new Error('Choose a saved public listing photo for Instagram.')
  let response
  try { response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000) }) }
  catch { throw new Error('The selected listing photo could not be loaded. Refresh Instagram and try again.') }
  if (!response.ok || !response.body) throw new Error('The selected listing photo could not be loaded.')
  if (Number(response.headers.get('content-length')) > 8 * 1024 * 1024) throw new Error('Instagram photos must be JPEG files of at most 8 MB.')
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      size += item.value.length
      if (size > 8 * 1024 * 1024) throw new Error('Instagram photos must be JPEG files of at most 8 MB.')
      chunks.push(item.value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  const dimensions = jpegDimensions(bytes)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return { ...dimensions, sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') }
}

export async function resolveInstagramAccount(connection, token, graph) {
  if (!instagramConnectionReady(connection)) throw new Error('Reconnect this Facebook Page with Instagram publishing permission and a profile that can create content.')
  const page = await graph(token, `${connection.page_id}?fields=id,instagram_business_account{id,username,name}`)
  const account = page.instagram_business_account
  if (text(page.id) !== connection.page_id || !isMetaId(account?.id)) throw new Error('Link a professional Instagram account to this Facebook Page in Meta, then refresh.')
  return { id: account.id, username: text(account.username), name: text(account.name) || text(account.username), connectionId: connection.id, pageName: connection.page_name }
}

export function instagramPermalink(value) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:' && ['www.instagram.com', 'instagram.com'].includes(url.hostname) && !url.username && !url.password
      && /^\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)) return `${url.origin}${url.pathname}`
  } catch { /* A post can be confirmed before its public link becomes available. */ }
  return null
}
