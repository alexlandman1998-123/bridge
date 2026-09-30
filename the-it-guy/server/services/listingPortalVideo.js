const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/
const MATTERPORT_ID = /^[A-Za-z0-9_-]{8,64}$/

function parseLink(value = '') {
  const text = String(value || '').trim()
  if (!text) return null
  try {
    const url = new URL(text)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) return null
    return url
  } catch {
    return null
  }
}

export function extractYouTubeVideoId(value = '') {
  const text = String(value || '').trim()
  if (YOUTUBE_ID.test(text)) return text
  const url = parseLink(text)
  if (!url) return ''
  const host = url.hostname.toLowerCase()
  const path = url.pathname.split('/').filter(Boolean)
  let id = ''
  if (host === 'youtu.be' && path.length === 1) id = path[0]
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'www.youtube-nocookie.com'].includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v') || ''
    else if (path.length === 2 && ['shorts', 'embed', 'live'].includes(path[0])) id = path[1]
  }
  return YOUTUBE_ID.test(id) ? id : ''
}

export function extractMatterportSpaceId(value = '') {
  const text = String(value || '').trim()
  if (MATTERPORT_ID.test(text)) return text
  const url = parseLink(text)
  if (!url || url.hostname.toLowerCase() !== 'my.matterport.com' || url.pathname.replace(/\/$/, '') !== '/show') return ''
  const id = url.searchParams.get('m') || ''
  return MATTERPORT_ID.test(id) ? id : ''
}

export function resolveListingPortalVideo(media = []) {
  const rows = Array.isArray(media) ? media : []
  const video = rows.find((item) => String(item?.media_type || item?.mediaType || '').toLowerCase() === 'video')
  const tour = rows.find((item) => String(item?.media_type || item?.mediaType || '').toLowerCase() === 'virtual_tour')
  const videoLink = String(video?.file_url || video?.fileUrl || video?.sourceUrl || video?.url || '').trim()
  const virtualTourLink = String(tour?.file_url || tour?.fileUrl || tour?.sourceUrl || tour?.url || '').trim()
  const youTubeVideoId = extractYouTubeVideoId(videoLink)
  const matterportSpaceId = extractMatterportSpaceId(virtualTourLink)
  return {
    videoLinkPresent: Boolean(videoLink),
    virtualTourLinkPresent: Boolean(virtualTourLink),
    youTubeVideoId: youTubeVideoId || null,
    matterportSpaceId: matterportSpaceId || null,
    warnings: [
      ...(videoLink && !youTubeVideoId ? ['unsupported_youtube_video_link'] : []),
      ...(virtualTourLink && !matterportSpaceId ? ['unsupported_matterport_tour_link'] : []),
    ],
  }
}
