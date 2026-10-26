import { createContactProvenance } from '../campaignContactProvenance'
import { expect, it } from 'vitest'
import {
  cleanListingBuilder,
  justListedCopy,
  justListedGaps,
  justListedPayload,
  justListedSource,
} from '../justListedCampaignModel'
const listingId = '11111111-1111-4111-8111-111111111111'
const agency = {
  agencyName: 'Oak & Stone',
  language: 'en-ZA',
  tone: 'warm',
  buyerDestination: 'agent',
}
const agent = { name: 'Sarah', email: 'sarah@example.test' }
const listing = {
  id: listingId,
  title: 'Sunny home',
  askingPrice: 1250000,
  suburb: 'Gardens',
  city: 'Cape Town',
  addressLine1: '99 Secret Road',
  bedrooms: 3,
  sellerName: 'Private seller',
  sellerOnboarding: { formData: { sellerEmail: 'secret@example.test' } },
  images: [
    { id: 'a', url: 'https://example.test/a.jpg' },
    { id: 'b', url: 'https://example.test/b.jpg' },
  ],
  coverImageId: 'b',
}
it('uses public facts and the selected cover without leaking seller or private address data', () => {
  const result = justListedSource(listing, agency, agent)
  expect(result.source).toMatchObject({
    title: 'Sunny home',
    price: expect.stringMatching(/R 1\s250\s000/),
    location: 'Gardens, Cape Town',
    imageId: 'b',
    destination: 'sarah@example.test',
  })
  expect(result.coverUrl).toBe('https://example.test/b.jpg')
  expect(JSON.stringify(result)).not.toMatch(
    /Secret Road|Private seller|secret@example/,
  )
})
it('never uses an address-derived legacy title and never invents a price', () => {
  const result = justListedSource(
    {
      ...listing,
      title: '',
      listingTitle: '99 Secret Road',
      askingPrice: null,
    },
    agency,
    agent,
  )
  expect(result.source.title).toBe('')
  expect(result.source.price).toBe('')
  expect(justListedGaps(result.source).join(' ')).toMatch(/listing headline/)
})
it('does not replace a removed public agent name with an older listing label', () => {
  const result = justListedSource({ ...listing, assignedAgentName: 'Previously stored agent label' }, agency, {})
  expect(result.source.agentName).toBe('')
  expect(result.source.destination).toBe('')
  expect(justListedGaps(result.source).join(' ')).toContain('public name')
})
it('honours each public address visibility and keeps unknown visibility private', () => {
  for (const [visibility, expected] of [
    ['show_exact_address', '99 Secret Road'],
    ['hide_street_number', 'Secret Road, Gardens, Cape Town'],
    ['complex_only', 'The Oaks, Gardens, Cape Town'],
    ['unknown', 'Gardens, Cape Town'],
  ]) {
    expect(
      justListedSource(
        {
          ...listing,
          exactAddressVisibility: visibility,
          streetName: 'Secret Road',
          complexName: 'The Oaks',
        },
        agency,
        agent,
      ).source.location,
    ).toBe(expected)
  }
})
it('uses price on application and zero-valued facts without fabricating claims', () => {
  const result = justListedSource(
    { ...listing, priceOnApplication: true, bedrooms: 0 },
    agency,
    agent,
  )
  expect(result.source.price).toBe('Price on application')
  expect(result.source.facts).toContain('0 bedrooms')
  expect(justListedCopy(result.source).social.body).not.toMatch(
    /free valuation|guaranteed/i,
  )
})
it('honours shared enquiry routing and rejects unsafe link destinations', () => {
  expect(
    justListedSource(
      listing,
      { ...agency, buyerDestination: 'agency', agencyPhone: '0215551234' },
      agent,
    ).source.destination,
  ).toBe('0215551234')
  expect(
    justListedSource(
      listing,
      {
        ...agency,
        buyerDestination: 'link',
        buyerUrl: 'https://user:password@example.test',
      },
      agent,
    ).source.destination,
  ).toBe('')
})
it('builds a versioned draft with editable copy and no expiring photo URLs or private fields', () => {
  const { source } = justListedSource(listing, agency, agent)
  const payload = justListedPayload(
    { version: 1, template: 'new-listing', listingId, source, contactProvenance: { ...createContactProvenance(source), confirmed: true } },
    justListedCopy(source),
  )
  expect(payload.status).toBe('draft')
  expect(payload.cover_url).toBe('')
  expect(payload.planned_channels).toEqual(['social', 'email', 'whatsapp'])
  expect(payload.channel_content.whatsapp.body).toContain('Book a viewing')
  expect(
    cleanListingBuilder({
      ...payload.listing_builder,
      source: { ...source, sellerEmail: 'secret' },
    }).source.sellerEmail,
  ).toBeUndefined()
  expect(() =>
    cleanListingBuilder({ ...payload.listing_builder, version: 2 }),
  ).toThrow(/Reopen/)
})
it('supports Afrikaans deterministic copy and explicitly flags other languages', () => {
  const { source } = justListedSource(
    listing,
    { ...agency, language: 'af-ZA' },
    agent,
  )
  expect(justListedCopy(source).email.body).toContain('Bespreek ’n besigtiging')
  expect(justListedGaps({ ...source, language: 'zu-ZA' }).join(' ')).toContain(
    'English or Afrikaans',
  )
})
it('tailors channel wording, keeps WhatsApp concise, and rejects unusable enquiry contacts', () => {
  const { source } = justListedSource(listing, { ...agency, tone: 'Professional and clear' }, agent)
  const copy = justListedCopy({ ...source, description: 'Agent-authored property details.' })
  expect(copy.email.body).toContain('Property details for your consideration.')
  expect(copy.whatsapp.body).not.toContain('Agent-authored property details.')
  expect(copy.social.body).toContain('Agent-authored property details.')
  expect(justListedGaps({ ...source, destination: 'contact me' }).join(' ')).toContain('valid public enquiry')
})
