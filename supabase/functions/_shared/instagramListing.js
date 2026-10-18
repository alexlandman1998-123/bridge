import { isMetaId, publicListingPost, text } from './metaIntegrationCore.js'

export const INSTAGRAM_SCOPES = ['instagram_basic', 'instagram_content_publish', 'pages_read_engagement']
export const instagramConnectionReady = row => row?.connection_status === 'connected'
  && INSTAGRAM_SCOPES.every(scope => row.granted_scopes?.includes(scope))
  && row.page_tasks?.some(task => ['CREATE_CONTENT', 'MANAGE', 'PROFILE_PLUS_CREATE_CONTENT'].includes(task))

export function instagramPhotos(media, origin) {
  return media.filter(item => {
    try {
      const url = new URL(item.file_url)
      return item.media_type === 'image' && url.origin === origin && url.protocol === 'https:'
        && !url.username && !url.password && !url.search && !url.hash
        && url.pathname.startsWith('/storage/v1/object/public/listing-media/')
    } catch { return false }
  }).map((item, index) => ({ id: item.id, url: item.file_url, label: `Listing photo ${index + 1}${item.is_cover ? ' · cover' : ''}` }))
}

export function instagramSnapshot(listing, media, input, origin) {
  if (listing?.is_active === false || !['active', 'under_offer'].includes(text(listing?.listing_status).toLowerCase())) throw new Error('Choose a saved, active listing before posting to Instagram.')
  if (input.caption !== undefined && (!text(input.caption) || Array.from(text(input.caption)).length > 2200)) throw new Error('Write an Instagram caption of 1 to 2,200 characters, including the listing link.')
  const photos = instagramPhotos(media, origin)
  const photo = input.imageId ? photos.find(row => row.id === input.imageId) : photos[0]
  if (!photo) throw new Error('Choose a saved public listing photo for Instagram.')
  const base = publicListingPost(listing, media, { mode: 'photo', imageId: photo.id, ...(input.caption === undefined ? {} : { caption: input.caption }) }, origin)
  const caption = input.caption === undefined ? [base.caption, base.link].filter(Boolean).join('\n\n') : text(input.caption)
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

export async function inspectInstagramPhoto(url, origin, fetcher = fetch) {
  if (!instagramPhotos([{ id: 'photo', media_type: 'image', file_url: url }], origin).length) throw new Error('Choose a saved public listing photo for Instagram.')
  const response = await fetcher(url, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok || !response.body) throw new Error('The public listing photo could not be loaded.')
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
