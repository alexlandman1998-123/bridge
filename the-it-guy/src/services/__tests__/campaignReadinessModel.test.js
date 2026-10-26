import { createContactProvenance, confirmCampaignContacts, withContactOverride } from '../campaignContactProvenance'
import { expect, it } from 'vitest'
import { buildCampaignReadiness } from '../campaignReadinessModel'

const id = (n) => `${String(n).padStart(8, '0')}-1111-4111-8111-111111111111`
const now = '2026-10-25T08:00:00Z'
const source = { title: 'Garden apartment', price: 'R 2 500 000', location: 'Brooklyn, Pretoria', facts: '2 bedrooms', description: 'A garden apartment.', agencyName: 'Oak', agentName: 'Alex', agentEmail: 'alex@example.test', agentPhone: '+27820000000', destination: 'alex@example.test', language: 'en-ZA', tone: 'Professional and clear', primaryColor: '#326650', imageId: 'cover', listingUpdatedAt: now }
const builder = { version: 1, template: 'new-listing', listingId: id(1), agentId: id(2), source, contactProvenance: { ...createContactProvenance(source), confirmed: true } }
const campaign = { id: 'campaign', revision: 3, status: 'draft', planned_channels: ['email'], listing_builder: builder, channel_content: { email: { title: 'A garden home', body: 'Book a viewing.' } } }
const current = { listingId: id(1), agentId: id(2), listingStatus: 'active', source, images: [{ id: 'cover', url: 'https://example.test/photo.jpg' }] }
const options = { currents: [current], sourceState: 'available', checkedAt: now, now }
const check = (result, name) => result.checks.find((item) => item.id.endsWith(name))

it('reports concrete fresh source checks and keeps delivery review separate', () => {
  const result = buildCampaignReadiness(campaign, options)
  expect(result.readyToPrepare).toBe(true)
  expect(result.blockers).toEqual([])
  expect(result.revision).toBe(3)
  expect(result.sourceCheckedAt).toBe(now)
  expect(check(result, ':facts').status).toBe('ready')
  expect(check(result, ':time').detail).toContain('not proof')
  expect(check(result, 'delivery').status).toBe('unchecked')
  expect(result.label).toBe('Ready for channel review')
})

it('distinguishes not-yet-checked, failed and missing listing reads', () => {
  const unchecked = buildCampaignReadiness(campaign)
  expect(unchecked.readyToPrepare).toBe(false)
  expect(check(unchecked, 'source').status).toBe('unchecked')
  const failed = buildCampaignReadiness(campaign, { sourceState: 'unavailable' })
  expect(check(failed, 'source').status).toBe('blocked')
  const missing = buildCampaignReadiness(campaign, { ...options, currents: [] })
  expect(missing.blockers[0].label).toBe('Listing unavailable')
})

it('blocks factual changes, proven changed enquiry routes and changed owner even when timestamps are unchanged', () => {
  for (const changed of [{ price: 'R 2 400 000' }, { location: 'Changed suburb' }, { destination: 'other@example.test' }, { agentEmail: 'other@example.test' }, { language: 'af-ZA' }]) {
    const result = buildCampaignReadiness(campaign, { ...options, currents: [{ ...current, source: { ...source, ...changed } }] })
    expect(result.blockers.length).toBeGreaterThan(0)
    expect(result.readyToPrepare).toBe(false)
  }
  expect(check(buildCampaignReadiness(campaign, { ...options, currents: [{ ...current, agentId: id(3) }] }), ':facts').detail).toContain('assigned agent')
})

it('blocks removed public contacts and only accepts missing-source contacts with explicit override provenance', () => {
  const result = buildCampaignReadiness(campaign, { ...options, currents: [{ ...current, source: { ...source, destination: '', agentEmail: '' } }] })
  expect(result.readyToPrepare).toBe(false)
  expect(check(result, ':contact-review').status).toBe('blocked')
  expect(check(result, ':contact-review').detail).toContain('removed')
  const missing = { ...source, destination: '' }
  const explicit = confirmCampaignContacts(withContactOverride({ ...builder, source: missing, contactProvenance: createContactProvenance(missing) }, 'destination', 'campaign@example.test'))
  expect(buildCampaignReadiness({ ...campaign, listing_builder: explicit }, { ...options, currents: [{ ...current, source: missing }] }).readyToPrepare).toBe(true)
  expect(campaign.listing_builder.source.destination).toBe('alex@example.test')
})

it('does not treat a harmless timestamp change as changed campaign facts', () => {
  const result = buildCampaignReadiness(campaign, { ...options, currents: [{ ...current, source: { ...source, listingUpdatedAt: '2026-10-25T09:00:00Z' } }] })
  expect(result.blockers).toEqual([])
  expect(check(result, ':facts').status).toBe('ready')
  expect(check(buildCampaignReadiness(campaign, { ...options, currents: [{ ...current, source: { ...source, listingUpdatedAt: '' } }] }), ':time').status).toBe('review')
})

it('blocks withdrawn/sold availability and checks collection members by listing identity', () => {
  expect(buildCampaignReadiness(campaign, { ...options, currents: [{ ...current, listingStatus: 'sold' }] }).readyToPrepare).toBe(false)
  const additionalListings = [3, 4].map((n) => ({ listingId: id(n), agentId: id(2), source, contactProvenance: { ...createContactProvenance(source), confirmed: true } }))
  const collection = { ...campaign, listing_builder: { ...builder, version: 2, template: 'property-collection', additionalListings, settings: {} } }
  expect(buildCampaignReadiness(collection, { ...options, currents: [{ ...current, listingId: id(4) }, current, { ...current, listingId: id(3) }] }).blockers).toEqual([])
})

it('keeps unavailable photographs explicit without blocking plain text preparation', () => {
  const result = buildCampaignReadiness(campaign, { ...options, currents: [{ ...current, images: [] }] })
  expect(result.readyToPrepare).toBe(true)
  expect(check(result, ':image').status).toBe('review')
  expect(check(result, ':image').detail).toContain('plain text email')
  const changedDefaultCover = buildCampaignReadiness(campaign, { ...options, currents: [{ ...current, source: { ...source, imageId: 'new-cover' } }] })
  expect(changedDefaultCover.readyToPrepare).toBe(true)
  expect(check(changedDefaultCover, ':image').status).toBe('ready')
})

it('checks saved public show-day identity/date/time and surfaces changes separately', () => {
  const settings = { eventId: id(9), date: '2026-10-27', startTime: '10:00', endTime: '12:00' }
  const show = { ...campaign, listing_builder: { ...builder, version: 2, template: 'show-day', settings } }
  const event = { id: id(9), listingId: id(1), date: settings.date, startTime: settings.startTime, endTime: settings.endTime }
  expect(check(buildCampaignReadiness(show, options), 'event').status).toBe('unchecked')
  expect(check(buildCampaignReadiness(show, { ...options, eventState: 'available', event }), 'event').status).toBe('ready')
  expect(check(buildCampaignReadiness(show, { ...options, eventState: 'available', event: { ...event, listingId: id(5) } }), 'event').status).toBe('blocked')
  expect(check(buildCampaignReadiness(show, { ...options, eventState: 'available', event: null }), 'event').status).toBe('blocked')
})

it('never declares unknown previous prices verified and retains recipe confirmation', () => {
  const reduced = { ...campaign, listing_builder: { ...builder, version: 2, template: 'price-reduced', settings: { priceConfirmed: false } } }
  const result = buildCampaignReadiness(reduced, options)
  expect(check(result, 'recipe').status).toBe('blocked')
  expect(check(result, 'previous-price').detail).toContain('does not establish price history')
})

it('requires saved content/revision/channel and flags revised playbook work', () => {
  const result = buildCampaignReadiness({ ...campaign, revision: null, planned_channels: [], channel_content: {}, playbook: { sourceRevision: 1 } }, options)
  expect(result.blockers.map((item) => item.id)).toEqual(expect.arrayContaining(['revision', 'content', 'channel']))
  expect(check(result, 'playbook').status).toBe('review')
  expect(buildCampaignReadiness({ ...campaign, status: 'completed' }, options).readyToPrepare).toBe(false)
})

it('keeps general campaigns reviewable without inventing a linked listing', () => {
  const result = buildCampaignReadiness({ ...campaign, listing_builder: null }, options)
  expect(check(result, 'source').status).toBe('review')
  expect(result.readyToPrepare).toBe(true)
})
