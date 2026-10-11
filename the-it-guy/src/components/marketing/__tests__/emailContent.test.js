import { expect, it } from 'vitest'
import { appendEmailFooter, campaignEmailSource, emailPlainText, inspectCampaignEmail, inspectEmailHtml, renderCampaignDelivery } from '../../../../../supabase/functions/_shared/emailContent.js'
import { createEmailDocument } from '../../../../../supabase/functions/_shared/emailDocument.js'

const advanced = (html) => ({ content_json: { ...createEmailDocument(), mode: 'advanced', advancedHtml: html }, html: '<script>stale()</script>' })
const context = { agencyName: 'Agency & Team', senderEmail: 'agent@example.com', unsubscribeUrl: 'https://project.supabase.co/functions/v1/email-unsubscribe?token=personal' }

it('uses the saved advanced document instead of a different HTML field', () => {
  const campaign = advanced('<p>Approved content</p>')
  expect(campaignEmailSource(campaign)).toBe('<p>Approved content</p>')
  expect(inspectCampaignEmail(campaign).ready).toBe(true)
  expect(inspectCampaignEmail({ content_json: { version: 9 }, html: '<p>Bypass</p>' }).ready).toBe(false)
})

it.each([
  '<script>send()</script>', '<img src="https://example.com/a.png" onerror=send()>',
  '<a href="&#x6a;avascript:alert(1)">Click</a>', '<a href="vbscript:run()">Click</a>',
  '<iframe src="https://example.com"></iframe>', '<form action="https://example.com"><input></form>',
  '<svg><image href="https://example.com/a.png"/></svg>', '<object data="https://example.com/a"></object>',
  '<meta http-equiv="refresh" content="0;url=https://example.com">', '<plaintext>hidden footer',
  '<!-- unclosed', '<style>.a { color: red }', '<noscript><img src="local.png"></noscript>',
  '<div style="width:expression(alert(1))">Bad CSS</div>', '<div style="background:u\\72l(javascript:alert(1))">Bad CSS</div>',
  '<style>@\\69mport "https://example.com/style.css";</style>',
  '<div style="background:u\\72l(http://127.0.0.1/image.png)">Encoded image</div>',
  '<div style="background:image-set(\'local.png\' 1x)">Dynamic image</div>',
  '<!--[if mso]><img src="https://example.com/a.png" onload=bad()><![endif]-->',
])('blocks executable or unsupported HTML: %s', (source) => {
  expect(inspectEmailHtml(source).ready).toBe(false)
})

it.each([
  'images/hero.png', 'cid:hero', 'data:image/png;base64,eA==', 'https://example.com/hero.png?Expires=100&Signature=abc',
  'https://project.supabase.co/storage/v1/object/sign/private/a.png?token=abc',
  'http://127.1/image.png', 'http://169.254.169.254/image.png', 'https://user:secret@example.com/image.png', 'http://[::1]/image.png',
])('blocks missing, expiring and private image URLs: %s', (src) => {
  expect(inspectEmailHtml(`<img src="${src}" alt="Hero">`).ready).toBe(false)
})

it('allows normal email HTML, merge fields, public links, styles and Outlook conditional VML', () => {
  const source = '<html><head><style>@media(max-width:600px){.column{display:block}}</style></head><body><table><tr><td background="https://example.com/bg.png"><p>Hello {{first_name}}</p><a href="https://example.com/?x=1&amp;y=2">View</a><a href="tel:+27123456789">Call</a><a href="mailto:agent@example.com">Email</a></td></tr></table><!--[if mso]><v:rect><v:fill src="https://example.com/bg.png" /></v:rect><![endif]--></body></html>'
  expect(inspectEmailHtml(source)).toMatchObject({ ready: true, errors: [], warnings: [] })
})

it('distinguishes compatibility warnings from delivery blockers', () => {
  const report = inspectEmailHtml('<style>@font-face{font-family:Brand;src:url(https://example.com/font.woff)}</style><div style="display:flex"><img src="http://example.com/hero.webp" srcset="https://example.com/big.png 2x"></div>')
  expect(report.ready).toBe(true)
  expect(report.warnings.join(' ')).toMatch(/flex/)
  expect(report.warnings.join(' ')).toMatch(/Custom fonts/)
  expect(report.warnings.join(' ')).toMatch(/alternative text/)
  expect(report.warnings.join(' ')).toMatch(/WebP/)
  expect(report.warnings.join(' ')).toMatch(/HTTPS/)
})

it('enforces the byte limit for UTF-8 HTML and warns about long messages', () => {
  expect(inspectEmailHtml('<p>' + 'é'.repeat(400000) + '</p>').ready).toBe(false)
  const long = inspectEmailHtml('<p>' + 'a'.repeat(101 * 1024) + '</p>')
  expect(long.ready).toBe(true)
  expect(long.warnings.join(' ')).toContain('clip')
})

it('retains visual-block validation and rejects malformed documents', () => {
  expect(inspectCampaignEmail({ content_json: createEmailDocument() }).errors.join(' ')).toContain('Choose an image')
  expect(inspectCampaignEmail({ content_json: { version: 1, blocks: null } }).ready).toBe(false)
})

it('puts the protected footer inside the body without rebuilding designer markup', () => {
  const source = '<!DOCTYPE html>\n<html><body><table cellpadding=0><tr><td>Hello {{first_name}}</td></tr></table><!--[if mso]><v:rect></v:rect><![endif]--></body></html>'
  const output = renderCampaignDelivery(advanced(source), context, { first_name: '<Alex>' })
  expect(output.html).toContain('<table cellpadding=0>')
  expect(output.html).toContain('<!--[if mso]><v:rect></v:rect><![endif]-->')
  expect(output.html).toContain('Hello &lt;Alex&gt;')
  expect(output.html).toContain('Agency &amp; Team')
  expect(output.html.indexOf('>Unsubscribe</a>')).toBeLessThan(output.html.indexOf('</body>'))
  expect(output.text).toContain('Hello <Alex>')
  expect(output.text).toContain(context.unsubscribeUrl)
  expect(output.text).not.toContain('v:rect')
})

it('handles HTML fragments and test footers and produces real plain text', () => {
  expect(appendEmailFooter('<p>Hello</p>', '<p>Footer</p>')).toBe('<p>Hello</p><p>Footer</p>')
  const output = renderCampaignDelivery(advanced('<p>A property update</p>'), context, {}, true)
  expect(output.html).toContain('Test email from')
  expect(output.text).toContain('A property update')
  expect(output.text).toContain('Personal unsubscribe links')
  expect(emailPlainText('<head><style>.bad{color:red}</style></head><p style="display:none">Hidden</p><h1>Visible</h1><p>News &amp; updates</p>')).toBe('Visible\nNews & updates')
})
