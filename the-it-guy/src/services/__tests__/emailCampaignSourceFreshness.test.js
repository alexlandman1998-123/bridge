import { expect, it, vi } from 'vitest'
import { CAMPAIGN_MARKET_READY_STATUSES, checkCampaignSourceFreshness, inspectCampaignEventFreshness, inspectCampaignSourceFreshness, isCampaignListingMarketReady, isCampaignShowDayMarketReady } from '../../../../supabase/functions/_shared/emailCampaignSourceFreshness.js'

const org = '11111111-1111-4111-8111-111111111111'
const listingId = '22222222-2222-4222-8222-222222222222'
const eventId = '33333333-3333-4333-8333-333333333333'
const now = new Date('2026-10-25T10:00:00Z')
const listing = { id: listingId, organisation_id: org, asking_price: 2400000, listing_status: 'active', is_active: true, updated_at: '2026-10-25T09:00:00Z' }
const campaign = (source = {}) => ({ organisation_id: org, content_json: { ai_campaign: { listing_id: listingId, objective: 'new_listing', source_snapshot: { version: 1, listing_id: listingId, organisation_id: org, asking_price: 2400000, listing_status: 'active', is_active: true }, ...source } } })
const savedEvent = { id: eventId, organisation_id: org, event_type: 'show_day', subject_type: 'listing', subject_id: listingId, status: 'upcoming', metadata: { visibility: 'public' }, starts_at: '2026-10-25T10:30:00.000Z', ends_at: '2026-10-25T12:00:00.000Z' }
const showDay = () => campaign({ objective: 'show_day', event: { id: eventId, start: '2026-10-25T12:30:00+02:00', end: '2026-10-25T14:00:00+02:00' } })

it('uses the same explicit market-ready statuses for generation and dispatch', () => {
  for (const listing_status of CAMPAIGN_MARKET_READY_STATUSES) {
    expect(isCampaignListingMarketReady({ ...listing, listing_status })).toBe(true)
    expect(isCampaignListingMarketReady({ ...listing, listing_status, is_active: false })).toBe(false)
  }
  for (const listing_status of ['seller_lead', 'mandate_sent', 'intake', 'under_offer', 'transaction_created', 'sold', 'withdrawn', '', null]) expect(isCampaignListingMarketReady({ ...listing, listing_status })).toBe(false)
  expect(isCampaignListingMarketReady({ ...listing, is_active: false })).toBe(false)
})

it('leaves ordinary manual emails independent of a listing and makes no database read', async () => {
  const from = vi.fn()
  expect(await checkCampaignSourceFreshness({ db: { from }, campaign: { content_json: {} }, now })).toMatchObject({ ready: true, code: 'not_applicable' })
  expect(from).not.toHaveBeenCalled()
})

it('accepts unchanged facts, numeric database prices, and unrelated source edits', () => {
  expect(inspectCampaignSourceFreshness(campaign(), { ...listing, asking_price: '2400000.00', updated_at: '2026-10-25T09:59:00Z' }, now)).toMatchObject({ ready: true, code: 'source_current' })
  expect(inspectCampaignSourceFreshness(campaign({ source_snapshot: { ...campaign().content_json.ai_campaign.source_snapshot, asking_price: null } }), { ...listing, asking_price: null }, now).ready).toBe(true)
})

it.each(['mandate_signed', 'in_progress', 'listing_active'])('accepts the repository live lifecycle state %s in both snapshot and current row', (listing_status) => {
  const value = campaign()
  value.content_json.ai_campaign.source_snapshot.listing_status = listing_status
  expect(inspectCampaignSourceFreshness(value, { ...listing, listing_status }, now)).toMatchObject({ ready: true, code: 'source_current' })
  expect(inspectCampaignSourceFreshness(value, { ...listing, listing_status, is_active: false }, now)).toMatchObject({ ready: false, code: 'source_inactive' })
})

it.each([null, {}, { listing_id: listingId }, { ...campaign().content_json.ai_campaign, source_snapshot: null }])('requires a fresh review for legacy or malformed provenance: %j', (source) => {
  const value = { organisation_id: org, content_json: { ai_campaign: source } }
  expect(inspectCampaignSourceFreshness(value, listing, now)).toMatchObject({ ready: false, code: 'source_review_required', retryable: false })
})

it.each([{ version: 2 }, { listing_id: org }, { organisation_id: listingId }, { asking_price: '' }, { asking_price: -1 }, { asking_price: 'unknown' }, { is_active: false }, { listing_status: 'seller_lead' }])('rejects an incomplete or changed snapshot: %j', (patch) => {
  const value = campaign()
  Object.assign(value.content_json.ai_campaign.source_snapshot, patch)
  expect(inspectCampaignSourceFreshness(value, listing, now)).toMatchObject({ ready: false, code: 'source_review_required' })
})

it.each([null, { ...listing, id: org }, { ...listing, organisation_id: listingId }])('rejects missing or different tenant/source records', (current) => {
  expect(inspectCampaignSourceFreshness(campaign(), current, now)).toMatchObject({ ready: false, code: 'source_missing', retryable: false })
})

it.each([{ is_active: false }, { listing_status: 'sold' }, { listing_status: 'under_offer' }, { listing_status: 'transaction_created' }])('blocks inactive availability before delivery: %j', (patch) => {
  expect(inspectCampaignSourceFreshness(campaign(), { ...listing, ...patch }, now)).toMatchObject({ ready: false, code: 'source_inactive' })
})

it.each([2500000, 2300000, null])('requires review when the current asking price changes to %j', (asking_price) => {
  expect(inspectCampaignSourceFreshness(campaign(), { ...listing, asking_price }, now)).toMatchObject({ ready: false, code: 'source_price_changed', retryable: false })
})

it('validates a price reduction against the stored current and confirmed previous price', () => {
  expect(inspectCampaignSourceFreshness(campaign({ objective: 'price_reduction', previous_price: 2700000 }), listing, now).ready).toBe(true)
  for (const previous_price of [null, '', 2300000, 2400000]) expect(inspectCampaignSourceFreshness(campaign({ objective: 'price_reduction', previous_price }), listing, now)).toMatchObject({ ready: false, code: 'source_review_required' })
})

it('checks show-day instants in their supplied timezone', () => {
  const value = campaign({ objective: 'show_day', event: { start: '2026-10-25T12:30:00+02:00', end: '2026-10-25T14:00:00+02:00' } })
  expect(inspectCampaignSourceFreshness(value, listing, now).ready).toBe(true)
  expect(inspectCampaignSourceFreshness(value, listing, new Date('2026-10-25T10:30:00Z'))).toMatchObject({ ready: false, code: 'event_started' })
})

it.each([
  null,
  { start: '2026-10-25T14:00:00', end: '2026-10-25T16:00:00' },
  { start: '2026-02-30T14:00:00+02:00', end: '2026-03-01T16:00:00+02:00' },
  { start: '2026-10-25T14:00:00+02:00', end: '2026-10-25T13:00:00+02:00' },
  { start: '2026-10-25T14:00:00+02:00', end: '2026-10-25T14:00:00+02:00' },
])('requires show-day review for malformed or reversed times: %j', (event) => {
  expect(inspectCampaignSourceFreshness(campaign({ objective: 'show_day', event }), listing, now)).toMatchObject({ ready: false, code: 'event_review_required' })
})

it('uses one narrow read bound to both agency and listing, under the supplied client permissions', async () => {
  const query = { select: vi.fn(() => query), eq: vi.fn(() => query), maybeSingle: vi.fn(async () => ({ data: listing, error: null })) }
  const from = vi.fn(() => query)
  expect(await checkCampaignSourceFreshness({ db: { from }, campaign: campaign(), now })).toMatchObject({ ready: true })
  expect(from).toHaveBeenCalledExactlyOnceWith('private_listings')
  expect(query.select).toHaveBeenCalledWith('id,organisation_id,asking_price,listing_status,is_active')
  expect(query.eq.mock.calls).toEqual([['organisation_id', org], ['id', listingId]])
})

it('keeps an unavailable listing read separate from a confirmed source change', async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: new Error('Temporary database failure') }) }
  expect(await checkCampaignSourceFreshness({ db: { from: () => query }, campaign: campaign(), now })).toMatchObject({ ready: false, code: 'source_unavailable', retryable: true })
  expect(await checkCampaignSourceFreshness({ db: { from: () => { throw new Error('Network failure') } }, campaign: campaign(), now })).toMatchObject({ ready: false, code: 'source_unavailable', retryable: true })
})

it('compares saved public show-day instants rather than their timezone formatting', () => {
  expect(isCampaignShowDayMarketReady(savedEvent, listingId, org)).toBe(true)
  expect(inspectCampaignEventFreshness(showDay(), savedEvent, now)).toMatchObject({ ready: true, code: 'event_current' })
  expect(inspectCampaignEventFreshness(showDay(), { ...savedEvent, status: 'planning' }, now).ready).toBe(true)
})

it.each([
  ['cancelled', { status: 'cancelled' }],
  ['completed', { status: 'completed' }],
  ['draft', { status: 'draft' }],
  ['private', { metadata: { visibility: 'private' } }],
  ['unknown visibility', { metadata: {} }],
])('requires a fresh review when a saved show day becomes %s', (_label, patch) => {
  expect(inspectCampaignEventFreshness(showDay(), { ...savedEvent, ...patch }, now)).toMatchObject({ ready: false, code: 'event_inactive', retryable: false })
})

it.each([null, { ...savedEvent, id: org }, { ...savedEvent, organisation_id: listingId }, { ...savedEvent, subject_id: org }, { ...savedEvent, subject_type: 'development' }, { ...savedEvent, event_type: 'launch' }])('rejects a removed or mismatched event without disclosing another source', (current) => {
  expect(inspectCampaignEventFreshness(showDay(), current, now)).toMatchObject({ ready: false, code: 'event_missing' })
})

it.each([{ starts_at: '2026-10-25T11:00:00Z' }, { ends_at: '2026-10-25T13:00:00Z' }])('blocks rescheduled saved show-day times: %j', (patch) => {
  expect(inspectCampaignEventFreshness(showDay(), { ...savedEvent, ...patch }, now)).toMatchObject({ ready: false, code: 'event_rescheduled' })
})

it('requires valid saved event references and valid future current instants', () => {
  expect(inspectCampaignSourceFreshness(campaign({ objective: 'show_day', event: { ...showDay().content_json.ai_campaign.event, id: 'invalid' } }), listing, now)).toMatchObject({ ready: false, code: 'event_review_required' })
  expect(inspectCampaignEventFreshness(showDay(), { ...savedEvent, starts_at: '2026-10-25T09:00:00Z' }, now)).toMatchObject({ ready: false, code: 'event_started' })
  expect(inspectCampaignEventFreshness(showDay(), { ...savedEvent, ends_at: null }, now)).toMatchObject({ ready: false, code: 'event_review_required' })
})

it('makes only the source listing and saved event reads, both scoped to this agency', async () => {
  const queries = []
  const db = { from: vi.fn((table) => {
    const query = { table, fields: '', filters: [], select(fields) { query.fields = fields; return query }, eq(key, value) { query.filters.push([key, value]); return query }, maybeSingle: async () => ({ data: table === 'private_listings' ? listing : savedEvent, error: null }) }
    queries.push(query)
    return query
  }) }
  expect(await checkCampaignSourceFreshness({ db, campaign: showDay(), now })).toMatchObject({ ready: true })
  expect(db.from.mock.calls).toEqual([['private_listings'], ['marketing_events']])
  expect(queries[1].fields).toBe('id,organisation_id,event_type,subject_type,subject_id,status,metadata,starts_at,ends_at')
  expect(queries[1].filters).toEqual([['organisation_id', org], ['id', eventId]])
})

it('keeps manually confirmed show-day dates supported without guessing a saved event', async () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: listing, error: null }) }
  const from = vi.fn(() => query)
  const value = showDay()
  delete value.content_json.ai_campaign.event.id
  expect(await checkCampaignSourceFreshness({ db: { from }, campaign: value, now })).toMatchObject({ ready: true })
  expect(from).toHaveBeenCalledExactlyOnceWith('private_listings')
})

it('keeps unavailable saved-event reads queued for recovery', async () => {
  const db = { from: (table) => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => table === 'private_listings' ? ({ data: listing, error: null }) : ({ data: null, error: new Error('Event unavailable') }) }
    return query
  } }
  expect(await checkCampaignSourceFreshness({ db, campaign: showDay(), now })).toMatchObject({ ready: false, code: 'event_unavailable', retryable: true })
})
