import assert from 'node:assert/strict'
import { inboxSignatureText, normalizeInboxSignature, renderInboxSignature, signatureUrl } from '../../../../../supabase/functions/_shared/inboxSignature.js'
const signature = { name: '<img src=x onerror=alert(1)>', company: 'Agency & Co', logoUrl: 'https://example.test/logo.png', email: 'agent@example.test', body: [{ text: '<script>alert(1)</script>\nRegards', bold: true, italic: true }, { text: 'Website', href: 'https://example.test/?x=1&y=2' }] }
const html = renderInboxSignature(signature)
assert(!html.includes('<script>'))
assert(!html.includes('<img src=x'))
assert(html.includes('&lt;script&gt;'))
assert(html.includes('<strong>'))
assert(html.includes('<em>'))
assert(html.includes('x=1&amp;y=2'))
assert.equal(inboxSignatureText({ name: 'Jane', body: [{ text: 'Regards' }] }), 'Jane\nRegards')
for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'https://user:pass@example.test', 'http://example.test', 'https://example.test/%0d', 'https://example.test/\u0000', 'https://example.test/" onclick="bad']) assert.equal(signatureUrl(url), '')
assert.equal(signatureUrl('mailto:agent@example.test'), 'mailto:agent@example.test')
assert.equal(signatureUrl('tel:+27115550100'), 'tel:+27115550100')
for (const patch of [{ website: 'javascript:bad' }, { logoUrl: 'data:bad' }, { body: [{ text: 'X', href: 'javascript:bad' }] }, { body: [{ text: 'x'.repeat(2001) }] }]) assert.throws(() => normalizeInboxSignature(patch))
console.log('Inbox signatures: escaped rendering, link validation, formatting and text fallback passed.')
