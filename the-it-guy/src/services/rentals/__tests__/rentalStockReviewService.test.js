import { beforeEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const mocks = vi.hoisted(() => ({ listings: vi.fn(), history: vi.fn() }))
vi.mock('../../privateListingService', () => ({ getAgentPrivateListings: mocks.listings, getPrivateListingActivity: mocks.history }))
vi.mock('../rentalListingDraftService', () => ({ isRentalListingRecord: listing => listing.listingCategory === 'rental' }))
import { buildRentalStockReviewRow, buildRentalStockHistoryReview, loadRentalStockReview, loadRentalStockHistoryReview } from '../rentalStockReviewService'
const scope = { organisationId: 'org', assignedAgentId: 'agent' }
const rental = { id: 'rental', title: 'Rental', listingCategory: 'rental', organisationId: 'org', assignedAgentId: 'agent' }
beforeEach(() => vi.clearAllMocks())
it('requests hidden stock only for review, preserves scope and excludes other organisations, agents and sales', async () => {
  mocks.listings.mockResolvedValue([rental, { ...rental, organisationId: 'other' }, { ...rental, listingCategory: 'sales' }, { ...rental, assignedAgentId: 'other' }])
  expect(await loadRentalStockReview(scope)).toEqual([rental])
  expect(mocks.listings).toHaveBeenCalledWith('agent', expect.objectContaining({ organisationId: 'org', includeAllOrganisationListings: false, includeArchivedListings: true, includeWithdrawnListings: true, requireAvailable: true }))
})
it('keeps organisation-wide and branch-wide scope distinct', async () => {
  mocks.listings.mockResolvedValue([{ ...rental, branchId: 'north' }, { ...rental, branchId: 'south' }])
  expect(await loadRentalStockReview({ ...scope, includeAllOrganisationListings: true, listingBranchId: 'north' })).toHaveLength(1)
  expect(await loadRentalStockReview({ ...scope, includeAllOrganisationListings: true })).toHaveLength(2)
})
it('fails closed without scope and reports read failures', async () => {
  await expect(loadRentalStockReview({})).rejects.toThrow('Select an organisation')
  expect(mocks.listings).not.toHaveBeenCalled()
  mocks.listings.mockRejectedValue(new Error('permission denied'))
  await expect(loadRentalStockReview(scope)).rejects.toThrow('permission denied')
})
it('flags hidden stock with live saved status and incomplete portal metadata', () => {
  const row = buildRentalStockReviewRow({ ...rental, listingVisibility: 'archived', property24Status: 'published' })
  expect(row.state).toBe('Archived')
  expect(row.issues.map(issue => issue.code)).toEqual(expect.arrayContaining(['hidden_stock', 'property24_metadata', 'property24_live_hidden', 'photos_missing']))
})
it('does not flag portal metadata for unpublished drafts or valid published links', () => {
  expect(buildRentalStockReviewRow(rental).issues.some(issue => issue.code.includes('metadata'))).toBe(false)
  const row = buildRentalStockReviewRow({ ...rental, property24Status: 'published', property24Reference: '123', property24ListingUrl: 'https://www.property24.com/to-rent/home/123' })
  expect(row.issues.some(issue => issue.code === 'property24_metadata')).toBe(false)
})
it('treats historical media as evidence and excludes other listing history', () => {
  const event = { id: 'event', private_listing_id: 'rental', metadata: { snapshot: { videoLink: 'https://video.test/view', gallery: ['old.jpg'] } } }
  const review = buildRentalStockHistoryReview(rental, [event, { ...event, private_listing_id: 'other' }])
  expect(review.evidence.map(item => item.label)).toEqual(['Photos', 'Video'])
  expect(review.events).toHaveLength(1)
  expect(buildRentalStockHistoryReview(rental, [{ ...event, metadata: {} }]).evidence).toEqual([])
})
it('requires accessible rental scope before history and distinguishes unavailable history', async () => {
  await expect(loadRentalStockHistoryReview({ ...rental, organisationId: 'other' }, scope)).rejects.toThrow('outside')
  expect(mocks.history).not.toHaveBeenCalled()
  mocks.history.mockRejectedValue(new Error('History unavailable'))
  await expect(loadRentalStockHistoryReview(rental, scope)).rejects.toThrow('History unavailable')
  expect(mocks.history).toHaveBeenCalledWith('rental', { requireAvailable: true })
})
it('shared visibility includes withdrawn only on request and excludes deleted records', () => {
  const source = readFileSync('src/services/privateListingService.js', 'utf8')
  const start = source.indexOf('function isDeletedPrivateListingRow(')
  const context = vm.createContext({ normalizeKey: value => String(value || '').toLowerCase(), DELETED_LISTING_STATUSES: new Set(['withdrawn', 'deleted', 'archived']), DELETED_LISTING_VISIBILITIES: new Set(['archived', 'deleted']) })
  vm.runInContext(source.slice(start, source.indexOf('function normalizeNullableText(', start)), context)
  expect(context.isVisiblePrivateListingRow({ listing_status: 'withdrawn' })).toBe(false)
  expect(context.isVisiblePrivateListingRow({ listing_status: 'withdrawn' }, { includeWithdrawnListings: true })).toBe(true)
  for (const row of [{ listing_status: 'deleted' }, { listing_status: 'withdrawn', listing_visibility: 'deleted' }, { listing_status: 'withdrawn', deleted_at: 'today' }, { listing_visibility: 'archived', is_deleted: true }]) expect(context.isVisiblePrivateListingRow(row, { includeArchivedListings: true, includeWithdrawnListings: true })).toBe(false)
})
it('strict stock reads reject truncated responses and branch-schema failures rather than reporting an empty success', async () => {
  const source = readFileSync('src/services/privateListingService.js', 'utf8')
  const start = source.indexOf('export async function getAgentPrivateListings(')
  const fn = source.slice(start, source.indexOf('export async function getAgentPrivateListingSummaries(', start)).replace('export async function', 'async function')
  let response = { data: [{ id: 'one' }], count: 2 }
  const select = vi.fn()
  const query = { select: (...args) => { select(...args); return query }, eq: () => query, in: () => query, order: () => query, then: (resolve, reject) => Promise.resolve(response).then(resolve, reject) }
  const context = vm.createContext({ requireClient: () => ({ from: () => query }), normalizeUuid: value => value || null, normalizeUuidList: values => values.filter(Boolean), applyVisiblePrivateListingFilters: builder => builder, isMissingColumnError: () => true, isMissingTableError: () => true })
  vm.runInContext(fn, context)
  await expect(context.getAgentPrivateListings('agent', { organisationId: 'org', requireAvailable: true })).rejects.toThrow('could not read all')
  expect(select).toHaveBeenCalledWith('*', expect.objectContaining({ count: 'exact' }))
  const error = new Error('branch column unavailable')
  response = { error }
  await expect(context.getAgentPrivateListings('agent', { organisationId: 'org', branchId: 'north', includeAllOrganisationListings: true, requireAvailable: true })).rejects.toBe(error)
  await expect(context.getAgentPrivateListings('agent', { organisationId: 'org', requireAvailable: true })).rejects.toBe(error)
})
it('shows historical portal references and only permits known portal URLs as evidence', () => {
  const event = { id: 'event', private_listing_id: 'rental', activity_description: 'Agent requested withdrawal', metadata: { channel: 'property24', reference: '123', publicUrl: 'https://property24.com/to-rent/home/123' } }
  const history = buildRentalStockHistoryReview(rental, [event, { ...event, id: 'bad', metadata: { channel: 'property24', publicUrl: 'https://other.test/phishing' } }])
  expect(history.events[0]).toMatchObject({ description: 'Agent requested withdrawal', reference: '123', publicUrl: event.metadata.publicUrl })
  expect(history.events[1].publicUrl).toBe('')
})
it('combines durable audit changes with media evidence without comparing signed tokens', () => {
  const photo = { id: 'photo', media_type: 'image', storage_bucket: 'documents', storage_path: 'private-listings/rental/photo', file_url: 'https://test/old-token' }
  const event = { id: 'audit', private_listing_id: rental.id, performed_by: 'agent', metadata: { schemaVersion: 1, source: 'rental_atomic_save', before: { facts: { rentalInfo: { property24ExpiryDate: '2026-12-01' } }, media: [photo] }, after: { facts: { rentalInfo: { property24ExpiryDate: '2027-04-30' } }, media: [] } } }
  const review = buildRentalStockHistoryReview({ ...rental, listingMedia: [{ ...photo, file_url: 'https://test/fresh-token' }] }, [event])
  expect(review.evidence).toEqual([])
  expect(review.events[0].actor).toBe('agent')
  expect(review.events[0].changes).toEqual(expect.arrayContaining([expect.objectContaining({ before: '2026-12-01', after: '2027-04-30' })]))
  expect(buildRentalStockHistoryReview(rental, [event]).evidence[0]).toMatchObject({ label: 'Photos', count: 1 })
})
