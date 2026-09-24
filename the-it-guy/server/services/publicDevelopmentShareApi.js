import { createClient } from '@supabase/supabase-js'

const text = (value) => String(value || '').trim()
const escapeHtml = (value) => text(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
const safeSlug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text(value)) ? text(value) : ''
const assetOfType = (assets, type) => (Array.isArray(assets) ? assets : []).find((asset) => text(asset?.documentType || asset?.document_type).toLowerCase() === type)?.fileUrl || ''

function requestOrigin(headers = {}) {
  const host = text(headers['x-forwarded-host'] || headers.host).toLowerCase()
  if (host === 'app.arch9.co.za' || /^[a-z0-9-]+\.vercel\.app$/.test(host)) return `https://${host}`
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return `http://${host}`
  return 'https://app.arch9.co.za'
}

function metadata(data, slug, origin) {
  const marketing = data.marketing || {}
  const seo = marketing.listingOverview || {}
  const media = marketing.mediaLibrary || {}
  const name = text(data.name) || 'Development'
  return {
    title: text(seo.seoTitle) || text(seo.listingTitle) || name,
    description: text(seo.seoMetaDescription) || text(seo.listingDescription) || text(data.description) || `Explore ${name}.`,
    url: `${origin}/development/${encodeURIComponent(slug)}`,
    image: text(media.coverImageUrl || assetOfType(data.assets, 'cover') || media.heroImageUrl)
      ? `${origin}/api/public/development-share-image?slug=${encodeURIComponent(slug)}` : '',
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
    return { status: 302, headers: { Location: signed.signedUrl, 'Cache-Control': 'public, s-maxage=300' }, body: '' }
  } catch {
    return { status: 404, headers: { 'Cache-Control': 'no-store' }, body: '' }
  }
}
