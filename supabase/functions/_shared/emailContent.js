import { parse } from 'parse5'
import { emailIssues, escapeHtml, mergeEmail, renderEmail } from './emailDocument.js'
import { emailHtmlAssetIssues, rewriteEmailAssets, visitEmailHtml } from './emailHtmlAssets.js'

export const EMAIL_HTML_MAX_BYTES = 750 * 1024
const sizeOf = (value) => new TextEncoder().encode(value).length
const activeTags = new Set(['script', 'noscript', 'plaintext', 'xmp', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'form', 'input', 'button', 'textarea', 'select', 'svg', 'math', 'template', 'audio', 'video'])
const unique = (items) => [...new Set(items)]
const imageTags = new Set(['img', 'v:image', 'v:fill', 'v:imagedata'])

function publicUrl(value, link = false) {
  const raw = String(value).trim()
  if (link && (/^mailto:[^\s<>]+$/i.test(raw) || /^tel:[+\d() .-]+$/i.test(raw) || /^#[\w-]+$/.test(raw))) return true
  try {
    const url = new URL(raw.startsWith('//') ? `https:${raw}` : raw)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false
    const host = url.hostname.toLowerCase()
    if (!host.includes('.') || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(host) || host.includes(':')) return false
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a, b] = host.split('.').map(Number)
      if ([0, 10, 127].includes(a) || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0)) return false
    }
    return true
  } catch { return false }
}

function temporaryUrl(value) {
  try {
    const url = new URL(value.startsWith('//') ? `https:${value}` : value)
    return /\/storage\/v1\/(?:object|render\/image)\/(?:sign|authenticated)\//i.test(url.pathname)
      || [...url.searchParams.keys()].some((key) => /^(?:token|expires?|signature|sig|x-amz-signature|x-goog-signature|se)$/i.test(key))
  } catch { return false }
}

function cssChecks(value, errors, warnings) {
  const uncommented = value.replace(/\/\*[\s\S]*?\*\//g, '')
  const css = uncommented.replace(/\\([\da-f]{1,6})\s?|\\([^\r\n])/gi, (_, hex, char) => hex ? String.fromCodePoint(Math.min(parseInt(hex, 16) || 0xfffd, 0x10ffff)) : char)
  if (/expression\s*\(|javascript\s*:|vbscript\s*:|(?:behavior|-moz-binding)\s*:/i.test(css)) errors.push('Remove executable CSS from the email.')
  if (/@import\b|(?:-webkit-)?image-set\s*\(/i.test(css) || (css.match(/\burl\s*\(/gi) || []).length !== (value.replace(/\/\*[\s\S]*?\*\//g, ' ').match(/\burl\s*\(/gi) || []).length) errors.push('Ask the designer to inline stylesheets and use ordinary image URLs instead of encoded or dynamic CSS resources.')
  if (/display\s*:\s*(?:inline-)?(?:flex|grid)\b|position\s*:\s*(?:absolute|fixed)\b/i.test(css)) warnings.push('Some email clients may change flex, grid or positioned layouts. Ask the designer for a table-based fallback.')
  if (/@font-face\b/i.test(css)) warnings.push('Custom fonts may be replaced by a fallback font in some inboxes.')
}

export function inspectEmailHtml(input) {
  if (typeof input !== 'string' || !input.trim()) return { ready: false, errors: ['Add email content.'], warnings: [], imageUrls: [], byteSize: 0 }
  const byteSize = sizeOf(input)
  if (byteSize > EMAIL_HTML_MAX_BYTES) return { ready: false, errors: ['HTML must be 750 KB or smaller.'], warnings: [], imageUrls: [], byteSize }
  const errors = [], warnings = []
  let references = []
  try {
    errors.push(...emailHtmlAssetIssues(input))
    references = rewriteEmailAssets(input).references
    visitEmailHtml(input, (node, { source }) => {
      const tag = node.tagName
      if (node.nodeName === '#comment' && !source.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset).endsWith('-->')) errors.push('Close all HTML comments before sending.')
      if (activeTags.has(tag)) { errors.push('Remove scripts, forms, embedded content and interactive controls from the email.'); return false }
      const attributes = new Map((node.attrs || []).map((attr) => [attr.name, attr.value]))
      if (tag === 'meta' && attributes.has('http-equiv')) errors.push('Remove HTTP instruction meta tags, including automatic redirects, from the email.')
      if (tag === 'link') errors.push('Ask the designer to inline external stylesheets and remove linked resources before sending.')
      for (const [name, value] of attributes) {
        if (/^on/i.test(name) || ['srcdoc', 'formaction', 'action'].includes(name)) errors.push('Remove event handlers and executable attributes from the email.')
        if ((name === 'href' || name === 'xlink:href') && !publicUrl(value, true)) errors.push('Use public HTTP/HTTPS, mailto or telephone links for email destinations.')
        if (name === 'style') cssChecks(value, errors, warnings)
      }
      if (tag === 'style') {
        if (!node.sourceCodeLocation?.endTag) errors.push('Close every style block before sending.')
        cssChecks((node.childNodes || []).map((child) => child.value || '').join(''), errors, warnings)
      }
      if (tag === 'img' && !attributes.has('alt')) warnings.push('Add alternative text to images so recipients can understand the email when images are blocked.')
      if (attributes.has('srcset')) warnings.push('Some inboxes ignore responsive image sources. Include a normal image source as a fallback.')
      if (imageTags.has(tag) && attributes.get('src') && /\.webp(?:[?#]|$)/i.test(attributes.get('src'))) warnings.push('WebP images may not display in older email clients. Use JPG or PNG for the widest support.')
    })
    for (const ref of references.filter((ref) => ref.kind === 'external')) {
      if (!publicUrl(ref.value)) errors.push('Image links must use a public HTTP or HTTPS address without credentials or private network addresses.')
      if (temporaryUrl(ref.value)) errors.push('Replace signed or expiring image links with permanent public image links.')
      if (/^http:/i.test(ref.value)) warnings.push('Use HTTPS image links to reduce the chance of blocked images.')
    }
  } catch (cause) { errors.push(cause.message || 'The HTML could not be checked. Export it again.') }
  if (byteSize > 100 * 1024) warnings.push('This email exceeds 100 KB of HTML. Some inboxes may clip the message; shorten it and test the footer.')
  const imageUrls = unique(references.filter((ref) => ref.kind === 'external').map((ref) => ref.value.startsWith('//') ? `https:${ref.value}` : ref.value))
  if (imageUrls.length > 199) errors.push('Use at most 199 different image links in an email.')
  return { ready: errors.length === 0, errors: unique(errors), warnings: unique(warnings), imageUrls, byteSize }
}

// A versioned document is authoritative. A stale client-supplied HTML field
// cannot substitute for the advanced HTML that was actually saved/reviewed.
export function campaignEmailSource(campaign, context = {}) {
  const document = campaign?.content_json ?? campaign?.contentJson
  if (document?.version === 1) {
    if (document.mode === 'advanced') return typeof document.advancedHtml === 'string' ? document.advancedHtml : ''
    return renderEmail(document, context)
  }
  return typeof campaign?.html === 'string' ? campaign.html : ''
}

export function inspectCampaignEmail(campaign, context = {}) {
  try {
    const document = campaign?.content_json ?? campaign?.contentJson
    if (document && document.version !== undefined && document.version !== 1) throw new Error('This email document version is not supported.')
    const html = campaignEmailSource(campaign, context)
    const report = inspectEmailHtml(html)
    const errors = unique([...(document?.version === 1 ? emailIssues(document) : []), ...report.errors])
    return { ...report, ready: !errors.length, errors, html }
  } catch (cause) { return { ready: false, errors: [cause.message || 'This email document could not be checked.'], warnings: [], imageUrls: [], byteSize: 0, html: '' } }
}

export function appendEmailFooter(html, footer) {
  const root = parse(html, { sourceCodeLocationInfo: true })
  const htmlNode = root.childNodes.find((node) => node.tagName === 'html')
  const body = htmlNode?.childNodes.find((node) => node.tagName === 'body')
  const position = body?.sourceCodeLocation?.endTag?.startOffset ?? htmlNode?.sourceCodeLocation?.endTag?.startOffset ?? html.length
  return html.slice(0, position) + footer + html.slice(position)
}

export function emailPlainText(html) {
  const parts = []
  visitEmailHtml(html, (node, { depth }) => {
    if (['head', 'style', 'script', 'template'].includes(node.tagName)) return false
    const attrs = new Map((node.attrs || []).map((attr) => [attr.name, attr.value]))
    if (/display\s*:\s*none/i.test(attrs.get('style') || '') || attrs.has('hidden')) return false
    if (depth > 0) return false
    if (node.nodeName === '#text') parts.push(node.value)
    if (node.tagName === 'img' && attrs.get('alt')) parts.push(attrs.get('alt'))
    if (node.tagName === 'a' && publicUrl(attrs.get('href') || '', true)) parts.push(`(${attrs.get('href')})`)
    if (['p', 'div', 'br', 'tr', 'h1', 'h2', 'h3', 'hr', 'li'].includes(node.tagName)) parts.push('\n')
  })
  return parts.join(' ').replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

export function renderCampaignDelivery(campaign, context = {}, values = {}, test = false) {
  const document = campaign?.content_json ?? campaign?.contentJson
  let html = campaignEmailSource(campaign, context)
  if (document?.version !== 1 || document.mode === 'advanced') {
    const details = `${escapeHtml(context.agencyName)}${context.senderEmail ? ` &lt;${escapeHtml(context.senderEmail)}&gt;` : ''}`
    const footer = `<hr style="border:0;border-top:1px solid #e5e7eb;margin:28px 0 16px"><p style="font:12px Arial;color:#667085">${test ? 'Test email' : 'You received this marketing email'} from ${details}. ${test ? 'Personal unsubscribe links are added on campaign delivery.' : `<a href="${escapeHtml(context.unsubscribeUrl)}">Unsubscribe</a>`}</p>`
    html = appendEmailFooter(html, footer)
  }
  html = rewriteEmailAssets(mergeEmail(html, values)).html
  return { html, text: emailPlainText(html) }
}
