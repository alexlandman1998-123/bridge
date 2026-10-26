// Signatures are structured data, never stored HTML. Every renderer escapes text
// and validates destinations so browser previews and future mail delivery agree.
const text = value => String(value ?? '').trim()
const escape = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
export const EMPTY_INBOX_SIGNATURE = Object.freeze({ name: '', title: '', company: '', phone: '', email: '', website: '', logoUrl: '', body: [] })
export function signatureUrl(value, image = false) {
  const url = text(value)
  if (!url || /[\s<>"']/.test(url) || [...url].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) || /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i.test(url)) return ''
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:' && parsed.hostname && !parsed.username && !parsed.password) return parsed.href
    if (!image && parsed.protocol === 'mailto:' && /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(parsed.pathname) && !parsed.search) return url
    if (!image && parsed.protocol === 'tel:' && /^\+?[0-9().-]+$/.test(parsed.pathname)) return url
  } catch { /* Invalid destinations are never rendered. */ }
  return ''
}
export function normalizeInboxSignature(input = {}) {
  const signature = {}
  for (const field of ['name', 'title', 'company', 'phone', 'email', 'website', 'logoUrl']) {
    signature[field] = text(input[field])
    if (signature[field].length > (field === 'logoUrl' || field === 'website' ? 2048 : 500)) throw new Error('Signature details are too long.')
  }
  if (signature.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signature.email) || !signatureUrl(`mailto:${signature.email}`))) throw new Error('Enter a valid signature email address.')
  for (const field of ['website', 'logoUrl']) if (signature[field] && !signatureUrl(signature[field], true)) throw new Error('Use a complete https:// address for the website and logo.')
  if (!Array.isArray(input.body ?? [])) throw new Error('Signature text could not be read.')
  signature.body = (input.body || []).map(run => {
    if (!run || typeof run.text !== 'string' || run.text.length > 2000) throw new Error('Signature text is too long.')
    if (run.href && !signatureUrl(run.href)) throw new Error('Use an https://, mailto: or tel: link.')
    return { text: run.text, bold: run.bold === true, italic: run.italic === true, ...(run.href ? { href: signatureUrl(run.href) } : {}) }
  }).filter(run => run.text)
  if (signature.body.length > 100 || JSON.stringify(signature).length > 16000) throw new Error('Keep the signature under 16,000 characters.')
  return signature
}
export function renderSignatureBody(runs = []) {
  return runs.map(run => {
    let html = escape(run.text).replaceAll('\n', '<br>')
    if (run.bold === true) html = `<strong>${html}</strong>`
    if (run.italic === true) html = `<em>${html}</em>`
    const href = signatureUrl(run.href)
    return href ? `<a href="${escape(href)}" rel="noreferrer noopener">${html}</a>` : html
  }).join('')
}
export function renderInboxSignature(input) {
  const signature = normalizeInboxSignature(input)
  const lines = []
  if (signature.logoUrl) lines.push(`<img src="${escape(signatureUrl(signature.logoUrl, true))}" alt="${escape(signature.company || 'Logo')}" width="140" style="max-width:140px;max-height:80px;object-fit:contain;display:block;margin-bottom:12px">`)
  if (signature.name) lines.push(`<strong>${escape(signature.name)}</strong>`)
  if (signature.title) lines.push(escape(signature.title))
  if (signature.company) lines.push(escape(signature.company))
  if (signature.phone) {
    const phone = signature.phone.replace(/[\s()-]/g, '')
    lines.push(signatureUrl(`tel:${phone}`) ? `<a href="${escape(`tel:${phone}`)}">${escape(signature.phone)}</a>` : escape(signature.phone))
  }
  if (signature.email) lines.push(`<a href="${escape(`mailto:${signature.email}`)}">${escape(signature.email)}</a>`)
  if (signature.website) lines.push(`<a href="${escape(signatureUrl(signature.website))}">${escape(signature.website)}</a>`)
  if (signature.body.length) lines.push(`<div style="margin-top:12px">${renderSignatureBody(signature.body)}</div>`)
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#243746">${lines.join('<br>')}</div>`
}
export function inboxSignatureText(input) {
  const signature = normalizeInboxSignature(input)
  return [signature.name, signature.title, signature.company, signature.phone, signature.email, signature.website, signature.body.map(run => run.text).join('')].filter(Boolean).join('\n')
}
