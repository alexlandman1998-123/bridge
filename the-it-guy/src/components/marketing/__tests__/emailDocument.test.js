import { describe, it, expect } from 'vitest'
import { createEmailDocument, newBlock, normalizeDocument, renderEmail, mergeEmail, emailIssues, sanitizeRichText } from '../../../../../supabase/functions/_shared/emailDocument.js'

describe('Email document delivery contract', () => {
  it('restores a single protected footer and rejects unknown schema versions', () => {
    const doc = createEmailDocument()
    doc.blocks = doc.blocks.filter((b) => b.type !== 'footer')
    expect(normalizeDocument(doc).blocks.at(-1).type).toBe('footer')
    expect(() => normalizeDocument({ version: 2, blocks: [] })).toThrow(/version/)
  })
  it('escapes text, rejects unsafe destinations and preserves attribution', () => {
    const doc = createEmailDocument({ name: '<script>bad</script>' })
    doc.blocks = [{ ...newBlock('button'), url: 'javascript:alert(1)', text: '<img onerror=alert(1)>' }, { ...newBlock('button'), url: 'https://example.com/listing?utm_campaign=abc&source=email' }]
    const html = renderEmail(doc)
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;img')
    expect(html).toContain('utm_campaign=abc&amp;source=email')
  })
  it('renders listing snapshots without accessing mutable source data', () => {
    const listing = { id: '1', price: 'R1,200,000', address: 'A home', url: 'https://example.com/1' }
    const doc = createEmailDocument()
    doc.blocks = [{ ...newBlock('property'), listings: [structuredClone(listing)] }]
    listing.price = 'R9,000,000'
    expect(renderEmail(doc)).toContain('R1,200,000')
    expect(renderEmail(doc)).not.toContain('R9,000,000')
  })
  it('supplies safe personalisation fallbacks and actual unsubscribe handling', () => {
    expect(mergeEmail('Hello {{first_name}}', { first_name: '' })).toBe('Hello there')
    expect(mergeEmail('{{first_name}}', { first_name: '<b>Alex</b>' })).toBe('&lt;b&gt;Alex&lt;/b&gt;')
    expect(renderEmail(createEmailDocument(), { unsubscribeUrl: 'https://example.com/unsubscribe?token=abc', agencyName: 'Agency' })).toContain('href="https://example.com/unsubscribe?token=abc"')
  })
  it('blocks incomplete image/button/listing content and sanitizes rich text', () => {
    expect(emailIssues(createEmailDocument())).toHaveLength(2)
    const html = sanitizeRichText('<p onclick="bad()"><strong>Hi</strong><script>bad()</script><a href="javascript:bad()">X</a><img src=x onerror=bad()></p>')
    expect(html).toBe('<p><strong>Hi</strong><a>X</a></p>')
  })
})
