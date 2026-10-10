import { describe, expect, it } from 'vitest'
import { buildListingIndexModel, DEFAULT_LISTING_INDEX_FILTERS, getListingIndexFacts, readListingIndexFilters, resolveListingIndexTab } from '../listingIndexFilterModel.js'

const filters = patch => ({ ...DEFAULT_LISTING_INDEX_FILTERS, ...patch })
const cards = [
  { id: 'home', title: 'Sea Point home', price: 3000000, propertyCategory: 'residential', collectionView: 'current', listingRecord: { propertyType: 'House', suburb: 'Sea Point', bedrooms: 3, bathrooms: 2, parkingCount: 2 } },
  { id: 'shop', title: 'Retail opportunity', price: 1500000, propertyCategory: 'retail', collectionView: 'current', listingRecord: { propertyType: 'retail_store', suburb: 'City Bowl', floorSize: 100 } },
  { id: 'warehouse', title: 'Warehouse', propertyCategory: 'industrial', collectionView: 'current', listingRecord: { propertyType: 'Warehouse' } },
  { id: 'unit', title: 'A-01', price: 2200000, propertyCategory: 'residential', collectionView: 'current', listingRecord: { developmentId: 'harbour', unitId: 'a1', propertyType: 'Apartment', sellerCanonicalFacts: { property: { bedrooms: 2 } } } },
  { id: 'development-shop', title: 'B-01', propertyCategory: 'commercial', listingSource: 'development', collectionView: 'current', listingRecord: { developmentId: 'harbour', propertyType: 'Office', floorSize: 80 } },
  { id: 'old', title: 'Previous home', propertyCategory: 'residential', collectionView: 'archived' },
  { id: 'review', title: 'Imported home', propertyCategory: 'residential', collectionView: 'review' },
]
const context = { unitsById: new Map([['a1', { phase: 'Phase 1', block: 'A', status: 'Available' }]]), developmentNames: new Map([['harbour', 'Harbour Heights']]) }
const model = (tab = 'all', patch = {}, extra = {}) => buildListingIndexModel({ cards, tab, filters: filters(patch), factsContext: context, ...extra })

describe('listing category and contextual filters', () => {
  it('shows each listing once in All and gives development links precedence over property category', () => {
    expect(model().counts).toEqual({ all: 5, residential: 1, commercial: 2, developments: 2 })
    expect(model('residential').rows.map(row => row.id)).toEqual(['home'])
    expect(model('commercial').rows.map(row => row.id)).toEqual(['shop', 'warehouse'])
    expect(model('developments').rows.map(row => row.id)).toEqual(['unit', 'development-shop'])
    expect(model('all', {}, { cards: [...cards, cards[0]] }).rows).toHaveLength(5)
  })
  it('keeps previous and review inventory separate while counting the chosen collection consistently', () => {
    expect(model('all', { collectionView: 'archived' }).counts).toEqual({ all: 1, residential: 1, commercial: 0, developments: 0 })
    expect(model('residential', { collectionView: 'review' }).rows.map(row => row.id)).toEqual(['review'])
  })
  it('applies residential facts and ignores fields irrelevant to All or Commercial', () => {
    expect(model('residential', { bedrooms: '4' }).rows).toEqual([])
    expect(model('residential', { bedrooms: '3', bathrooms: '2', parking: '2' }).rows.map(row => row.id)).toEqual(['home'])
    expect(model('all', { bedrooms: '99', commercialCategory: 'retail' }).rows).toHaveLength(5)
    expect(model('commercial', { bedrooms: '99', commercialCategory: 'retail', minArea: '90', maxArea: '110' }).rows.map(row => row.id)).toEqual(['shop'])
  })
  it('filters recorded phase, block, stock availability and property category within developments', () => {
    expect(model('developments', { developmentId: 'harbour', phase: 'Phase 1', block: 'A', availability: 'Available', propertyCategory: 'residential', bedrooms: '2' }).rows.map(row => row.id)).toEqual(['unit'])
    expect(model('developments', { propertyCategory: 'commercial', minArea: '90' }).rows).toEqual([])
    expect(getListingIndexFacts(cards[3], context).developmentName).toBe('Harbour Heights')
  })
  it('does not treat missing price, area or stock status as zero or available', () => {
    expect(model('commercial', { minPrice: '1' }).rows.map(row => row.id)).toEqual(['shop'])
    expect(model('commercial', { minArea: '1' }).rows.map(row => row.id)).toEqual(['shop'])
    expect(model('developments', { availability: 'Available' }).rows.map(row => row.id)).toEqual(['unit'])
    expect(model('all', {}, { search: 'Harbour Heights' }).rows.map(row => row.id)).toEqual(['unit', 'development-shop'])
  })
  it('supports all category URLs and legacy development links', () => {
    expect(resolveListingIndexTab('/listings')).toBe('all')
    expect(resolveListingIndexTab('/listings/residential')).toBe('residential')
    expect(resolveListingIndexTab('/listings/commercial')).toBe('commercial')
    expect(resolveListingIndexTab('/listings/developments')).toBe('developments')
    expect(resolveListingIndexTab('/listings', '?developmentId=harbour')).toBe('developments')
  })
  it('restores only the current workspace session filters and tolerates blocked or corrupt storage', () => {
    const saved = new Map([['org-a:user', JSON.stringify({ residential: filters({ bedrooms: '3' }), commercial: filters({ minArea: '100' }), unknown: { minPrice: '1' } })]])
    const storage = { getItem: key => saved.get(key) }
    expect(readListingIndexFilters(storage, 'org-a:user').residential.bedrooms).toBe('3')
    expect(readListingIndexFilters(storage, 'org-a:user').commercial.minArea).toBe('100')
    expect(readListingIndexFilters(storage, 'org-b:user')).toEqual({})
    expect(readListingIndexFilters(storage, 'org-a:user').unknown).toBeUndefined()
    expect(readListingIndexFilters({ getItem: () => { throw new Error('Blocked') } }, 'org-a:user')).toEqual({})
    expect(readListingIndexFilters({ getItem: () => 'broken' }, 'org-a:user')).toEqual({})
  })
})
