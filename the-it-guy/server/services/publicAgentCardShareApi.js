import { createPublicAgencyIntakeResponse } from './publicAgencyIntakeApi.js'
import sharp from 'sharp'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function escapeHtml(value = '') {
  return normalizeText(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function truncate(value = '', length = 180) {
  const text = normalizeText(value)
  return text.length > length ? `${text.slice(0, Math.max(0, length - 1)).trimEnd()}…` : text
}

function getRequestUrl(url = '', headers = {}) {
  const host = normalizeText(headers.host || headers.Host) || 'app.arch9.co.za'
  const protocol = normalizeText(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto']) || 'https'
  return new URL(url || '/share/card', `${protocol}://${host}`)
}

function getPublicHost(headers = {}) {
  const host = normalizeText(headers.host || headers.Host) || 'app.arch9.co.za'
  const protocol = normalizeText(headers['x-forwarded-proto'] || headers['X-Forwarded-Proto']) || 'https'
  return host === 'app.arch9.co.za' ? 'https://app.arch9.co.za' : `${protocol}://${host}`
}

function buildCardUrls({ slug = '', host = '' } = {}) {
  const safeSlug = encodeURIComponent(normalizeText(slug))
  const origin = normalizeText(host).replace(/\/+$/, '') || 'https://app.arch9.co.za'
  return {
    cardUrl: `${origin}/card/${safeSlug}`,
    shareUrl: `${origin}/share/card/${safeSlug}`,
    imageUrl: `${origin}/api/public/agent-card-image?slug=${safeSlug}`,
  }
}

function buildCardDescription(intake = {}) {
  const introduction = truncate(intake?.intake?.introduction, 180)
  if (introduction) return introduction
  const agentName = normalizeText(intake?.card?.agent?.name) || 'Your property expert'
  const agencyName = normalizeText(intake?.agency?.name)
  return truncate([agentName, agencyName ? `at ${agencyName}` : '', 'is ready to help with your next property move.'].filter(Boolean).join(' '), 180)
}

export function buildAgentCardShareDocument({ intake = {}, host = '', search = '' } = {}) {
  const agentName = normalizeText(intake?.card?.agent?.name) || 'Property expert'
  const agencyName = normalizeText(intake?.agency?.name) || 'ARCH9'
  const jobTitle = normalizeText(intake?.card?.agent?.jobTitle) || 'Property Practitioner'
  const title = `${agentName} | ${agencyName}`
  const description = buildCardDescription(intake)
  const urls = buildCardUrls({ slug: intake?.slug, host })
  const visitUrl = new URL(urls.cardUrl)
  const incoming = new URLSearchParams(normalizeText(search).replace(/^\?/, ''))
  for (const key of ['source', 'campaign', 'campaign_code', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
    const value = normalizeText(incoming.get(key))
    if (value) visitUrl.searchParams.set(key, value)
  }
  const escapedTitle = escapeHtml(title)
  const escapedDescription = escapeHtml(description)
  const escapedImage = escapeHtml(urls.imageUrl)
  const escapedCardUrl = escapeHtml(urls.cardUrl)

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}" />
    <link rel="canonical" href="${escapedCardUrl}" />
    <meta property="og:type" content="profile" />
    <meta property="og:title" content="${escapedTitle}" />
    <meta property="og:description" content="${escapedDescription}" />
    <meta property="og:url" content="${escapedCardUrl}" />
    <meta property="og:image" content="${escapedImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="profile:first_name" content="${escapeHtml(agentName.split(/\s+/)[0] || agentName)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapedTitle}" />
    <meta name="twitter:description" content="${escapedDescription}" />
    <meta name="twitter:image" content="${escapedImage}" />
    <meta http-equiv="refresh" content="0; url=${escapeHtml(visitUrl.toString())}" />
  </head>
  <body>
    <p>Opening <a href="${escapeHtml(visitUrl.toString())}">${escapeHtml(agentName)}’s digital card</a> at ${escapeHtml(agencyName)}.</p>
    <script>window.location.replace(${JSON.stringify(visitUrl.toString())})</script>
  </body>
</html>`
}

export function buildAgentCardShareImageSvg({ intake = {} } = {}) {
  const agency = intake?.agency || {}
  const agent = intake?.card?.agent || {}
  const primary = /^#[0-9a-f]{6}$/i.test(normalizeText(agency.primaryColour)) ? agency.primaryColour : '#102236'
  const secondary = /^#[0-9a-f]{6}$/i.test(normalizeText(agency.secondaryColour)) ? agency.secondaryColour : '#21445f'
  const accent = /^#[0-9a-f]{6}$/i.test(normalizeText(agency.accentColour)) ? agency.accentColour : '#f5b83c'
  const agentName = truncate(agent.name || 'Property expert', 44)
  const agencyName = truncate(agency.name || 'ARCH9', 44)
  const jobTitle = truncate(agent.jobTitle || 'Property Practitioner', 54)
  const initials = escapeHtml(agentName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || 'A')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escapeHtml(`${agentName} at ${agencyName}`)}">
  <defs><linearGradient id="background" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${escapeHtml(primary)}"/><stop offset="1" stop-color="${escapeHtml(secondary)}"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#background)"/>
  <circle cx="1090" cy="-30" r="280" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="76"/>
  <circle cx="130" cy="500" r="92" fill="#ffffff" fill-opacity=".14"/>
  <circle cx="175" cy="315" r="106" fill="#ffffff"/>
  <text x="175" y="340" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="${escapeHtml(primary)}">${initials}</text>
  <text x="330" y="210" font-family="Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="4" fill="#ffffff" fill-opacity=".72">DIGITAL PROPERTY CARD</text>
  <text x="330" y="305" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#ffffff">${escapeHtml(agentName)}</text>
  <text x="330" y="365" font-family="Arial, sans-serif" font-size="32" fill="${escapeHtml(accent)}">${escapeHtml(jobTitle)}</text>
  <rect x="330" y="425" width="440" height="2" fill="#ffffff" fill-opacity=".25"/>
  <text x="330" y="485" font-family="Arial, sans-serif" font-size="34" font-weight="600" fill="#ffffff">${escapeHtml(agencyName)}</text>
  </svg>`
}

async function resolveAgentCardIntake({ url = '', headers = {}, dependencies = {} } = {}) {
  const requestUrl = getRequestUrl(url, headers)
  const slug = normalizeText(requestUrl.searchParams.get('slug'))
  if (!slug) {
    const error = new Error('Agent card slug is required.')
    error.status = 400
    throw error
  }
  const createIntakeResponse = dependencies.createIntakeResponse || createPublicAgencyIntakeResponse
  const response = await createIntakeResponse({
    method: 'GET',
    url: `/api/public/agency-intake?slug=${encodeURIComponent(slug)}&surface=agent_digital_card`,
    headers,
  })
  if (response.status !== 200 || !response.body?.intake?.card?.enabled) {
    const error = new Error(response.body?.message || 'This digital card is not available.')
    error.status = response.status === 404 ? 404 : 500
    throw error
  }
  return response.body.intake
}

function buildHtmlResponse(status, html) {
  return {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400',
      'X-Robots-Tag': 'noindex',
    },
    body: html,
  }
}

export async function createPublicAgentCardShareResponse({ method = 'GET', url = '', headers = {}, dependencies = {} } = {}) {
  if (!['GET', 'HEAD'].includes(normalizeText(method).toUpperCase())) return buildHtmlResponse(405, '<h1>Method not allowed</h1>')
  try {
    const intake = await resolveAgentCardIntake({ url, headers, dependencies })
    const body = normalizeText(method).toUpperCase() === 'HEAD' ? null : buildAgentCardShareDocument({ intake, host: getPublicHost(headers), search: getRequestUrl(url, headers).search })
    return { ...buildHtmlResponse(200, body), body }
  } catch (error) {
    return buildHtmlResponse(Number(error?.status || 500), '<!doctype html><title>Digital card unavailable</title><h1>Digital card unavailable</h1>')
  }
}

export async function createPublicAgentCardImageResponse({ method = 'GET', url = '', headers = {}, dependencies = {} } = {}) {
  if (!['GET', 'HEAD'].includes(normalizeText(method).toUpperCase())) return { status: 405, headers: { Allow: 'GET, HEAD', 'Cache-Control': 'no-store' }, body: null }
  try {
    const intake = await resolveAgentCardIntake({ url, headers, dependencies })
    const svg = buildAgentCardShareImageSvg({ intake })
    const png = normalizeText(method).toUpperCase() === 'HEAD'
      ? null
      : await sharp(Buffer.from(svg)).png().toBuffer()
    return {
      status: 200,
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=86400' },
      body: png,
    }
  } catch {
    return { status: 404, headers: { 'Cache-Control': 'no-store' }, body: null }
  }
}

export function writeNodeTextResponse(response, payload) {
  response.statusCode = payload.status || 200
  for (const [key, value] of Object.entries(payload.headers || {})) response.setHeader(key, value)
  response.end(payload.body || '')
}
