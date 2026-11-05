import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import sharp from 'sharp'

const text = (value) => String(value || '').trim()
const escapeHtml = (value) => text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const safeSlug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text(value)) ? text(value) : ''
const assetOfType = (assets, type) => (Array.isArray(assets) ? assets : []).find((asset) => text(asset?.documentType || asset?.document_type).toLowerCase() === type)?.fileUrl || ''

function requestOrigin(headers = {}) {
  const host = text(headers['x-forwarded-host'] || headers.host).toLowerCase()
  if (['app.arch9.co.za', 'madisonplace.co.za', 'www.madisonplace.co.za'].includes(host) || /^[a-z0-9-]+\.vercel\.app$/.test(host)) return `https://${host}`
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`
  return 'https://app.arch9.co.za'
}

function metadata(data, slug, origin) {
  const marketing = data.marketing || {}
  const seo = marketing.listingOverview || {}
  const media = marketing.mediaLibrary || {}
  const name = text(data.name) || 'Development'
  const cover = text(media.coverImageUrl || assetOfType(data.assets, 'cover') || media.heroImageUrl)
  const coverVersion = cover ? createHash('sha256').update(cover.split('?')[0]).digest('hex').slice(0, 12) : ''
  return {
    title: text(seo.seoTitle) || text(seo.listingTitle) || name,
    description: text(seo.seoMetaDescription) || text(seo.listingDescription) || text(data.description) || `Explore ${name}.`,
    url: slug === 'madison-place-abcf1b8a' && ['https://madisonplace.co.za', 'https://www.madisonplace.co.za'].includes(origin)
      ? 'https://madisonplace.co.za/'
      : `${origin}/development/${encodeURIComponent(slug)}`,
    image: cover ? `${origin}/api/public/development-share-image?slug=${encodeURIComponent(slug)}&v=${coverVersion}` : '',
  }
}

function setMeta(html, attribute, key, content) {
  const tag = `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`
  const expression = new RegExp(`<meta\\s+${attribute}="${key}"[^>]*>`, 'i')
  return expression.test(html) ? html.replace(expression, tag) : html.replace('</head>', `    ${tag}\n  </head>`)
}

export function buildDevelopmentPageHtml(shell, meta) {
  let html = String(shell || '')
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(meta.title)}</title>`)
  for (const [attribute, key, value] of [
    ['name', 'description', meta.description],
    ['property', 'og:title', meta.title],
    ['property', 'og:description', meta.description],
    ['property', 'og:url', meta.url],
    ['name', 'twitter:title', meta.title],
    ['name', 'twitter:description', meta.description],
    ['property', 'og:image', meta.image],
    ['name', 'twitter:image', meta.image],
    ['property', 'og:image:width', meta.image ? '1200' : ''],
    ['property', 'og:image:height', meta.image ? '630' : ''],
    ['property', 'og:image:type', meta.image ? 'image/jpeg' : ''],
  ]) {
    if (value) html = setMeta(html, attribute, key, value)
    else if (key === 'og:image' || key === 'twitter:image')
      html = html.replace(new RegExp(`<meta\\s+${attribute}="${key}"[^>]*>`, 'i'), '')
  }
  html = setMeta(html, 'name', 'twitter:card', 'summary_large_image')
  html = html.replace(/<link\s+rel="canonical"[^>]*>/i, '')
  return html.replace('</head>', `    <link rel="canonical" href="${escapeHtml(meta.url)}" />\n  </head>`)
}

async function loadLanding(slug, env = process.env) {
  const url = text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)
  const key = text(env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_KEY)
  if (!url || !key) throw new Error('Public development data is not configured.')
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.rpc('get_public_development_landing', { requested_slug: slug })
  if (error) throw error
  return data
}

// Only renew files already selected by the published landing RPC. The caller
// supplies a slug, never a storage path or a URL to sign with server credentials.
export async function createDevelopmentLandingResponse({ method = 'GET', url = '', headers = {}, dependencies = {}, env = process.env } = {}) {
  const response = (status, data) => ({ status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, body: method === 'HEAD' ? '' : JSON.stringify(data) })
  if (!['GET', 'HEAD'].includes(method)) return { ...response(405, { error: 'Method not allowed.' }), headers: { ...response(405, {}).headers, Allow: 'GET, HEAD' } }
  const slug = safeSlug(new URL(url || '/', requestOrigin(headers)).searchParams.get('slug'))
  if (!slug) return response(400, { error: 'Invalid development.' })
  try {
    const data = await (dependencies.loadLanding || loadLanding)(slug, env)
    if (!data) return response(404, { error: 'This development page is not published.' })
    if (method === 'HEAD') return response(200, {})
    const storageOrigin = new URL(text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)).origin
    const pathFor = (value) => {
      try {
        const parsed = new URL(value)
        const pathname = decodeURIComponent(parsed.pathname)
        if (pathname.includes(String.fromCharCode(0))) return ''
        const match = pathname.match(/^\/storage\/v1\/object\/(?:sign|public)\/documents\/(developments\/([a-zA-Z0-9-]+)\/(?:cover|floorplan|site_plan|marketing|logo|logo-dark|logo-light|brochure)\/[^/\\]+)$/)
        return parsed.origin === storageOrigin && match && match[2] === data.id ? match[1] : ''
      } catch { return '' }
    }
    const publicPaths = new Set()
    const visitMedia = (value) => {
      if (typeof value === 'string') {
        for (const url of value.match(/https:\/\/[^\s,]+/g) || []) {
          const path = pathFor(url)
          if (path) publicPaths.add(path)
        }
      } else if (Array.isArray(value)) value.forEach(visitMedia)
      else if (value && typeof value === 'object') Object.values(value).forEach(visitMedia)
    }
    visitMedia((Array.isArray(data.assets) ? data.assets : []).map((asset) => asset.fileUrl))
    // Variant logos can be saved only in the published media library, rather
    // than the RPC's legacy asset-type list. Both are existing public evidence.
    visitMedia(data.marketing?.mediaLibrary)
    visitMedia(data.marketing?.floorplans)
    const paths = [...publicPaths]
    if (paths.length > 250) throw new Error('Too many public media files.')
    const replacements = new Map()
    if (paths.length) {
      const signPaths = dependencies.signPaths || (async (values) => {
        const key = text(env.SUPABASE_SERVICE_ROLE_KEY)
        if (!key) throw new Error('Media signing is not configured.')
        const client = createClient(storageOrigin, key, { auth: { persistSession: false, autoRefreshToken: false } })
        return client.storage.from('documents').createSignedUrls(values, 3600)
      })
      const { data: signed, error } = await signPaths(paths)
      if (error) throw error
      for (const asset of signed || []) {
        if (paths.includes(asset.path) && asset.signedUrl && !asset.error) replacements.set(asset.path, asset.signedUrl)
      }
      if (replacements.size !== paths.length) throw new Error('Public media unavailable.')
    }
    const renew = (value) => {
      if (typeof value === 'string') return value.replace(/https:\/\/[^\s,]+/g, (url) => replacements.get(pathFor(url)) || url)
      if (Array.isArray(value)) return value.map(renew)
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renew(item)]))
      return value
    }
    return response(200, renew(data))
  } catch {
    return response(503, { error: 'Development temporarily unavailable. Please try again.' })
  }
}

export async function createDevelopmentPageResponse({ method = 'GET', url = '', headers = {}, dependencies = {} } = {}) {
  if (!['GET', 'HEAD'].includes(method)) return { status: 405, headers: { Allow: 'GET, HEAD' }, body: '' }
  const slug = safeSlug(new URL(url || '/', requestOrigin(headers)).searchParams.get('slug'))
  if (!slug) return { status: 400, headers: { 'Cache-Control': 'no-store' }, body: 'Invalid development.' }
  try {
    const data = await (dependencies.loadLanding || loadLanding)(slug)
    if (!data) return { status: 404, headers: { 'Cache-Control': 'no-store' }, body: 'Development unavailable.' }
    const origin = requestOrigin(headers)
    const shellResponse = await (dependencies.fetchShell || fetch)(`${origin}/index.html`)
    if (!shellResponse.ok) throw new Error('Website shell unavailable.')
    const body = method === 'HEAD' ? '' : buildDevelopmentPageHtml(await shellResponse.text(), metadata(data, slug, origin))
    return { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' }, body }
  } catch {
    return { status: 503, headers: { 'Cache-Control': 'no-store' }, body: 'Development temporarily unavailable.' }
  }
}

export async function createDevelopmentShareImageResponse({ method = 'GET', url = '', headers = {}, dependencies = {}, env = process.env } = {}) {
  if (!['GET', 'HEAD'].includes(method)) return { status: 405, headers: { Allow: 'GET, HEAD' }, body: '' }
  const slug = safeSlug(new URL(url || '/', requestOrigin(headers)).searchParams.get('slug'))
  if (!slug) return { status: 400, headers: { 'Cache-Control': 'no-store' }, body: '' }
  try {
    const data = await (dependencies.loadLanding || loadLanding)(slug)
    if (!data) return { status: 404, headers: { 'Cache-Control': 'no-store' }, body: '' }
    const media = data.marketing?.mediaLibrary || {}
    const image = text(media.coverImageUrl || assetOfType(data.assets, 'cover') || media.heroImageUrl)
    const storageOrigin = new URL(text(env.SUPABASE_URL || env.VITE_SUPABASE_URL)).origin
    const parsed = new URL(image)
    const match = parsed.pathname.match(/^\/storage\/v1\/object\/(?:sign|public)\/documents\/(developments\/[^/]+\/cover\/[^/]+)$/)
    if (parsed.origin !== storageOrigin || !match) throw new Error('Invalid cover asset.')
    const serviceKey = text(env.SUPABASE_SERVICE_ROLE_KEY)
    if (!serviceKey) throw new Error('Storage signing is not configured.')
    const client = createClient(storageOrigin, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: signed, error } = await (dependencies.signCover || ((path) => client.storage.from('documents').createSignedUrl(path, 3600)))(match[1])
    if (error || !signed?.signedUrl) throw error || new Error('Cover unavailable.')
    let body = ''
    if (method !== 'HEAD') {
      const imageResponse = await (dependencies.fetchImage || fetch)(signed.signedUrl)
      if (!imageResponse.ok) throw new Error('Cover download failed.')
      body = await sharp(Buffer.from(await imageResponse.arrayBuffer()))
        .resize(1200, 630, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer()
    }
    return {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
      body,
    }
  } catch {
    return { status: 404, headers: { 'Cache-Control': 'no-store' }, body: '' }
  }
}
