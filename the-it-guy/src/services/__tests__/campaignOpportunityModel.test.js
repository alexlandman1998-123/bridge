import { describe, expect, it } from 'vitest'
import { buildCampaignOpportunities, campaignOpportunityHref, campaignSourceTime } from '../campaignOpportunityModel'
import { isCampaignListingMarketReady } from '../../../../supabase/functions/_shared/emailCampaignSourceFreshness.js'

const now = '2026-10-25T08:00:00Z'
const listing = (patch = {}) => ({ id: 'listing-1', organisationId: 'agency', listingCategory: 'private_sale', listingStatus: 'active', isActive: true, title: 'Garden apartment', suburb: 'Brooklyn', city: 'Pretoria', askingPrice: 2500000, createdAt: '2026-10-22T08:00:00Z', updatedAt: '2026-10-24T08:00:00Z', ...patch })
const event = (patch = {}) => ({ id: 'event-1', organisationId: 'agency', listingId: 'listing-1', visibility: 'public', status: 'upcoming', startsAt: '2026-10-27T08:00:00Z', endsAt: '2026-10-27T10:00:00Z', updatedAt: now, ...patch })
const plan = (patch = {}) => ({ id: 'plan-1', organisation_id: 'agency', name: 'Earlier introduction', status: 'completed', revision: 1, updated_at: '2026-10-22T09:00:00Z', listing_builder: { listingId: 'listing-1', template: 'new-listing', source: { price: 'R 2 800 000' } }, ...patch })
const build = (patch = {}) => buildCampaignOpportunities({ organisationId: 'agency', listings: [listing()], now, ...patch })

describe('evidence-backed campaign opportunities', () => {
  it('suggests a recently created available listing with explicit source and creation evidence', () => {
    const [item] = build().items
    expect(item).toMatchObject({ recipe: 'new-listing', listingId: 'listing-1', area: 'Brooklyn, Pretoria', coverUrl: '' })
    expect(item.evidence[0].label).toBe('Listing record created')
    expect(item.reason).toContain('does not confirm when it was published')
    expect(item.sourceLabel).toContain('Saved listing')
    expect(item.href).toContain('listingId=listing-1')
    expect(item.href).toContain('objective=new_listing')
  })

  it('never invents an opportunity from unknown dates, intake states or unavailable listings', () => {
    for (const patch of [{ listingStatus: 'seller_lead' }, { listingStatus: 'under_offer' }, { listingStatus: 'sold' }, { listingStatus: undefined }, { listingCategory: 'rental' }, { createdAt: null }, { createdAt: '2027-01-01' }, { createdAt: '2020-01-01' }]) expect(build({ listings: [listing(patch)] }).items).toEqual([])
    expect(build({ listings: [listing({ listingStatus: 'listing_active' })] }).items).toHaveLength(1)
  })

  it('uses exactly the same explicit active market-ready rule as AI generation and final delivery', () => {
    const marketStatuses = ['active', 'listing_active', 'in_progress', 'mandate_signed', 'live', 'published']
    for (const listingStatus of marketStatuses) {
      expect(build({ listings: [listing({ listingStatus, isActive: true })] }).items).toHaveLength(1)
      for (const isActive of [true, false, undefined, 'true']) {
        const available = build({ listings: [listing({ listingStatus, isActive })] }).items.length > 0
        expect(available).toBe(isCampaignListingMarketReady({ listing_status: listingStatus, is_active: isActive }))
        if (isActive !== true) expect(available).toBe(false)
      }
    }
    for (const listingStatus of ['seller_lead', 'mandate_sent', 'under_offer', 'sold', 'inactive', undefined]) expect(build({ listings: [listing({ listingStatus })], events: [event()] }).items).toEqual([])
  })

  it('suggests only valid future saved public show days linked to an authorised available listing', () => {
    const [item] = build({ events: [event({ image: 'https://example.test/show.jpg' })] }).items
    expect(item).toMatchObject({ recipe: 'show-day', eventId: 'event-1', coverUrl: 'https://example.test/show.jpg' })
    expect(item.href).toContain('objective=show_day')
    expect(item.sourceLabel).toContain('Public show day')
    expect(build({ events: [event({ status: 'planning' })] }).items[0].recipe).toBe('show-day')
    for (const patch of [{ visibility: 'private' }, { status: 'cancelled' }, { status: 'draft' }, { status: 'open' }, { startsAt: 'invalid' }, { endsAt: null }, { endsAt: '2026-10-27T07:00:00Z' }, { startsAt: now }, { startsAt: '2027-01-01' }, { listingId: 'not-visible' }, { organisationId: 'other' }]) expect(build({ events: [event(patch)] }).items.some((row) => row.recipe === 'show-day')).toBe(false)
  })

  it('compares a lower current price against the latest saved campaign without claiming a verified discount', () => {
    const item = build({ campaigns: [plan()] }).items.find((row) => row.recipe === 'price-reduced')
    expect(item).toMatchObject({ existingCampaignId: 'plan-1' })
    expect(item.evidence.map((entry) => entry.label)).toEqual(['Current saved asking price', 'Price in the latest saved campaign'])
    expect(item.reason).toContain('not a price-history record')
    expect(item.href).toContain('objective=price_reduction')
    expect(item.reason).not.toMatch(/%|save R/)
  })

  it('does not hunt older campaigns for stale discounts or compare unknown/currency-mismatched prices', () => {
    const latest = plan({ id: 'latest', updated_at: '2026-10-24T09:00:00Z', listing_builder: { listingId: 'listing-1', template: 'new-listing', source: { price: 'R 2 500 000' } } })
    expect(build({ campaigns: [plan(), latest] }).items.some((row) => row.recipe === 'price-reduced')).toBe(false)
    for (const price of ['Price on application', 'USD 2 800 000', '2800000', 'R -5', 'R 0', '']) {
      expect(build({ campaigns: [plan({ listing_builder: { listingId: 'listing-1', template: 'new-listing', source: { price } } })] }).items.some((row) => row.recipe === 'price-reduced')).toBe(false)
    }
  })

  it('suppresses existing recipe work while allowing distinct show days', () => {
    const campaigns = [plan({ status: 'draft' }), plan({ id: 'show', status: 'draft', listing_builder: { listingId: 'listing-1', template: 'show-day', settings: { eventId: 'event-1' } } })]
    const result = build({ campaigns, events: [event(), event({ id: 'event-2' })] })
    expect(result.items.some((row) => row.recipe === 'new-listing')).toBe(false)
    expect(result.items.filter((row) => row.recipe === 'show-day').map((row) => row.eventId)).toEqual(['event-2'])
  })

  it('resumes factual active Email work without guessing a listing association from names', () => {
    const linked = { id: 'email', status: 'draft', ai_listing_id: 'listing-1', ai_objective: 'new_listing' }
    for (const status of ['draft', 'scheduled', 'sending', 'active']) expect(build({ emailCampaigns: [{ ...linked, status }] }).items).toEqual([])
    for (const patch of [{ status: 'failed' }, { status: 'cancelled' }, { status: 'sent' }, { ai_listing_id: 'other' }, { ai_objective: 'show_day' }, { organisation_id: 'other' }]) expect(build({ emailCampaigns: [{ ...linked, ...patch }] }).items).toHaveLength(1)
    expect(build({ emailCampaigns: [{ id: 'unlinked', name: 'Garden apartment', subject: 'New listing', status: 'draft' }] }).items).toHaveLength(1)
    expect(build({ emailCampaignsAvailable: false }).warnings.join(' ')).toContain('Email drafts are unavailable')
  })

  it('uses an explicit Email event association when one is available', () => {
    const emailCampaigns = [{ id: 'email', status: 'draft', ai_listing_id: 'listing-1', ai_objective: 'show_day', ai_event_id: 'event-1' }]
    const result = build({ emailCampaigns, events: [event(), event({ id: 'event-2' })] })
    expect(result.items.filter((item) => item.recipe === 'show-day').map((item) => item.eventId)).toEqual(['event-2'])
  })

  it('keeps tenants isolated and minimises the opportunity projection', () => {
    const result = build({ listings: [listing({ organisationId: 'other' }), listing({ id: 'mine', sellerEmail: 'seller@private.test', addressLine1: '99 Private Street' })], campaigns: [plan({ organisation_id: 'other' })] })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].listingId).toBe('mine')
    expect(JSON.stringify(result)).not.toMatch(/private.test|Private Street/)
  })

  it('keeps evidence ids stable across refreshes and changes them when their evidence changes', () => {
    const original = build().items[0].id
    expect(build({ now: '2026-10-25T09:00:00Z' }).items[0].id).toBe(original)
    const reduced = build({ campaigns: [plan()] }).items.find((row) => row.recipe === 'price-reduced').id
    expect(build({ campaigns: [plan()], listings: [listing({ askingPrice: 2400000 })] }).items.find((row) => row.recipe === 'price-reduced').id).not.toBe(reduced)
  })

  it('keeps limits, missing campaign data and unknown source times explicit', () => {
    expect(build({ limit: 0 }).items).toEqual([])
    expect(build({ campaignsAvailable: false }).warnings[0]).toContain('Existing campaigns are unavailable')
    expect(campaignSourceTime(null)).toBe('Update time not recorded')
    expect(campaignSourceTime(now, 'invalid-zone')).toBe(campaignSourceTime(now))
    expect(campaignOpportunityHref({ listingId: 'one & two', recipe: 'show-day', eventId: 'event' }, { ai: true })).toContain('listingId=one+%26+two')
    expect(campaignOpportunityHref({ listingId: 'listing', recipe: 'new-listing' }, { ai: true })).toContain('ai=1')
  })
})
