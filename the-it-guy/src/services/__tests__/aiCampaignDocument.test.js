import { expect, it } from 'vitest'
import { aiCampaignDocument } from '../aiCampaignService'
import { inspectCampaignEmail } from '../../../../supabase/functions/_shared/emailContent.js'
import { renderEmail } from '../../../../supabase/functions/_shared/emailDocument.js'
const result = { listing: { id: 'listing', address_line_1: '12 Main Road', suburb: 'Sea Point', asking_price: 2000000, bedrooms: 3, bathrooms: 2, bridge_listing_public_url: 'https://agency.test/property/home' }, copy: { subject: 'Home', previewText: 'View', heading: 'Welkom', intro: 'Kom kyk gerus.', cta: 'Besigtig eiendom' }, brand: { name: 'Agency', logoUrl: 'https://agency.test/logo.png', primaryColour: '#123456' }, objective: 'show_day', language: 'af', event: { start: '2030-01-01T10:00:00+02:00', end: '2030-01-01T12:00:00+02:00' }, usageId: 'usage' }
it('renders factual values, actual photography and branding through the existing template', () => {
  const document = aiCampaignDocument(result, 'https://agency.test/photo.jpg')
  const html = renderEmail(document, { agencyName: 'Agency' })
  expect(html).toContain('12 Main Road'); expect(html).toContain('Sea Point'); expect(html).toContain('2'); expect(html).toContain('slaapkamers')
  expect(html).toContain('Skoudag'); expect(html).toContain('SAST'); expect(html).toContain('Agency'); expect(html).toContain('https://agency.test/photo.jpg')
  expect(document.ai_campaign).toMatchObject({ listing_id: 'listing', language: 'af', usage_id: 'usage' })
})
it('preserves escaped content and confirmed old/current price in reductions', () => {
  const document = aiCampaignDocument({ ...result, objective: 'price_reduction', event: null, previousPrice: 2400000, copy: { ...result.copy, heading: '<script>bad</script>' } })
  const html = renderEmail(document)
  expect(html).not.toContain('<script>'); expect(html).toContain('&lt;script&gt;'); expect(html).toContain('Vorige prys'); expect(html).toContain('Huidige prys')
})
it('gives the genuine source photograph a full-width hero once with escaped source text', () => {
  const image = 'https://cdn.example.com/property.jpg?width=1200&fit=cover'
  const document = aiCampaignDocument({ ...result, listing: { ...result.listing, title: 'Home & garden <Brooklyn>' } }, image)
  const hero = document.blocks.find((block) => block.type === 'image')
  expect(hero).toMatchObject({ src: image, alt: 'Home & garden <Brooklyn>', url: result.listing.bridge_listing_public_url })
  expect(document.blocks.find((block) => block.type === 'property').listings[0].image).toBe('')
  const html = renderEmail(document)
  expect(html).toContain('width="564"')
  expect(html).toContain('property.jpg?width=1200&amp;fit=cover')
  expect(html).toContain('alt="Home &amp; garden &lt;Brooklyn&gt;"')
  expect(html.match(/property\.jpg/g)).toHaveLength(1)
})
it('keeps factual content useful with no photograph and invents no replacement image', () => {
  for (const image of ['', '/relative/property.jpg', 'javascript:alert(1)', 'data:image/png;base64,AAAA']) {
    const document = aiCampaignDocument(result, image)
    expect(document.blocks.filter((block) => block.type === 'image')).toHaveLength(0)
    const html = renderEmail(document)
    expect(html).toContain('12 Main Road'); expect(html).toContain('Kom kyk gerus.')
    expect(html).not.toContain('Property photograph')
  }
})
it('retains established private and signed image validation without bypassing it', () => {
  for (const image of ['https://storage.example.com/storage/v1/object/sign/photos/home.jpg?token=temporary', 'http://127.0.0.1/private.jpg']) {
    const document = aiCampaignDocument({ ...result, listing: { ...result.listing, bridge_listing_public_url: 'https://agency.example.com/property/home' }, brand: { ...result.brand, logoUrl: 'https://agency.example.com/logo.jpg' } }, image)
    expect(document.blocks.find((block) => block.type === 'image').src).toBe(image)
    const check = inspectCampaignEmail({ content_json: document })
    expect(check.ready).toBe(false)
    expect(check.errors.join(' ')).toMatch(/signed or expiring|public HTTP or HTTPS/)
  }
})
