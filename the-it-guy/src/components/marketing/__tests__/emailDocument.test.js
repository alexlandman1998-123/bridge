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

it('normalises incomplete saved layouts, duplicate IDs and a single footer without losing metadata',()=>{
 const doc=normalizeDocument({version:1,arch9_campaign:{id:'plan'},blocks:[null,{id:'same',type:'property'},{id:'same',type:'social',links:null},{type:'unknown'},{type:'footer'},{type:'footer'}]})
 expect(doc.globalStyles.fontFamily).toBe('Arial');expect(doc.blocks.map(b=>b.type)).toEqual(['property','social','footer']);expect(new Set(doc.blocks.map(b=>b.id)).size).toBe(3);expect(doc.blocks[0].listings).toEqual([]);expect(doc.blocks[1].links).toEqual([]);expect(doc.arch9_campaign.id).toBe('plan');expect(()=>renderEmail(doc)).not.toThrow()
})
it('uses font, colour, spacing and alignment settings in the rendered email',()=>{
 const doc=createEmailDocument();doc.globalStyles.fontFamily='Verdana';doc.blocks=[{...newBlock('header'),text:'Brand',textColour:'#123456',background:'#abcdef',align:'right',padding:30},{...newBlock('button'),text:'Open',url:'https://example.test',textColour:'#654321',colour:'#112233',variant:'outline'}];const html=renderEmail(doc);expect(html).toContain('font-family:Verdana,sans-serif;color:#123456;background:#abcdef');expect(html).toContain('align="right"');expect(html).toContain('padding:30px');expect(html).not.toContain('28px Georgia');expect(html).toContain('color:#654321;text-decoration:none')
})
it('retains rich formatting when a whole text block is linked and avoids nested anchors',()=>{
 const doc=createEmailDocument();doc.blocks=[{...newBlock('text'),text:'Hello world',richText:'<strong>Hello</strong> <a href="https://old.example">world</a>',url:'https://new.example'}];const html=renderEmail(doc);expect(html).toContain('<a href="https://new.example" style="color:#18765b"><strong>Hello</strong> world</a>');expect(html).not.toContain('old.example')
})

it('blocks footer-only emails and incomplete buttons or social links before sending',()=>{
 const doc=createEmailDocument();doc.blocks=[newBlock('footer')];expect(emailIssues(doc)).toContain('Add at least one content block before sending.');doc.blocks=[{...newBlock('text'),richText:'<p>&nbsp;<br></p>'},{...newBlock('social'),links:[]},newBlock('footer')];expect(emailIssues(doc)).toContain('Add at least one content block before sending.');doc.blocks=[{...newBlock('button'),text:'',url:'https://example.test'},newBlock('social'),newBlock('footer')];expect(emailIssues(doc)).toContain('Add a label to each button.');expect(emailIssues(doc)).toContain('Add a valid destination to each social link.');
})
