import { normalizePropertyCategory, normalizeListingSource } from '../../lib/propertyTaxonomy.js'

export const LISTING_INDEX_TABS = Object.freeze([
  { key: 'all', label: 'All' },
  { key: 'residential', label: 'Residential' },
  { key: 'commercial', label: 'Commercial' },
  { key: 'developments', label: 'Developments' },
])
export const DEFAULT_LISTING_INDEX_FILTERS = Object.freeze({
  collectionView: 'current', location: '', agent: '', minPrice: '', maxPrice: '',
  propertyType: '', bedrooms: '', bathrooms: '', parking: '', commercialCategory: '',
  minArea: '', maxArea: '', developmentId: '', phase: '', block: '', availability: '', propertyCategory: '',
})
const text = value => String(value ?? '').trim()
const key = value => text(value).toLowerCase().replace(/[\s-]+/g, '_')
const numeric = (...values) => {
  const value = values.find(item => item !== null && item !== undefined && item !== '')
  const number = Number(value)
  return value !== undefined && Number.isFinite(number) && number >= 0 ? number : null
}
const first = (...values) => values.map(text).find(Boolean) || ''

export function resolveListingIndexTab(pathname = '', search = '') {
  if (new URLSearchParams(search).get('developmentId')) return 'developments'
  const section = pathname.split('/')[2]
  return LISTING_INDEX_TABS.some(tab => tab.key === section) ? section : 'all'
}

export function readListingIndexFilters(storage, storageKey) {
  if (!storage || !storageKey) return {}
  try {
    const saved = JSON.parse(storage.getItem(storageKey) || '{}')
    return Object.fromEntries(LISTING_INDEX_TABS.filter(tab => saved?.[tab.key] && typeof saved[tab.key] === 'object').map(tab => [tab.key, Object.fromEntries(Object.entries(DEFAULT_LISTING_INDEX_FILTERS).map(([field, fallback]) => [field, typeof saved[tab.key][field] === 'string' ? saved[tab.key][field] : fallback]))]))
  } catch { return {} }
}

export function getListingIndexFacts(card = {}, { unitsById = new Map(), developmentNames = new Map() } = {}) {
  const listing = card.listingRecord || card
  const property = listing.sellerCanonicalFacts?.property || listing.propertyDetails || {}
  const publication = listing.listingPublicationData || listing.publicationData || {}
  const developmentId = first(listing.developmentId, listing.development_id, property.developmentId, property.development_id)
  const unitId = first(listing.unitId, listing.unit_id, property.unitId, property.unit_id)
  const unit = unitsById.get(unitId) || {}
  const category = normalizePropertyCategory(card.propertyCategory || listing.propertyCategory || listing.property_category || property.propertyCategory || listing.propertyType || listing.property_type, { fallback: 'residential' })
  const source = normalizeListingSource(card.listingSource || listing.listingSource || listing.listing_source || listing.stockSource || listing.stock_source || listing.listingCategory)
  const isDevelopment = Boolean(developmentId || source === 'development' || card.developerDirectListing)
  const propertyType = first(listing.propertyType, listing.property_type, property.propertyType, unit.property_type)
  const price = numeric(card.price, listing.askingPrice, listing.asking_price)
  return {
    category, tab: isDevelopment ? 'developments' : category === 'residential' ? 'residential' : 'commercial',
    developmentId, developmentName: first(developmentNames.get(developmentId), listing.developmentName, listing.development_name, property.developmentName, developmentId),
    propertyType: key(propertyType), propertyTypeLabel: propertyType.replace(/_/g, ' '),
    location: first(listing.suburb, listing.city, property.suburb, property.city),
    agent: first(listing.assignedAgentId, listing.assigned_agent_id, card.agentEmail, card.agentName),
    agentLabel: first(card.agentName, listing.assignedAgentEmail, 'Unassigned'),
    price: price > 0 ? price : null,
    bedrooms: numeric(listing.bedrooms, property.bedrooms, publication.bedrooms, unit.bedrooms),
    bathrooms: numeric(listing.bathrooms, property.bathrooms, publication.bathrooms, unit.bathrooms),
    parking: numeric(listing.parkingCount, listing.parking_count, property.parkingCount, publication.parkingCount, listing.garages, property.garages),
    area: numeric(listing.floorSize, listing.floor_size, property.floorSize, publication.floorSize, publication.floor_size, unit.floor_size, listing.erfSize, property.erfSize),
    phase: first(listing.phase, listing.developmentPhase, property.phase, unit.phase),
    block: first(listing.block, listing.blockName, property.block, unit.block, unit.block_name),
    // Availability describes recorded stock, never inferred from a marketing status.
    availability: first(unit.status, listing.unitStatus, listing.unit_status),
  }
}

export function getListingIndexFilterKeys(tab, filters = DEFAULT_LISTING_INDEX_FILTERS) {
  const shared = ['collectionView', 'location', 'agent', 'minPrice', 'maxPrice']
  const residential = ['propertyType', 'bedrooms', 'bathrooms', 'parking']
  const commercial = ['commercialCategory', 'propertyType', 'minArea', 'maxArea']
  if (tab === 'residential') return [...shared, ...residential]
  if (tab === 'commercial') return [...shared, ...commercial]
  if (tab === 'developments') return [...shared, 'developmentId', 'phase', 'block', 'availability', 'propertyCategory', 'propertyType', ...(filters.propertyCategory === 'residential' ? ['bedrooms', 'bathrooms', 'parking'] : filters.propertyCategory ? ['minArea', 'maxArea'] : [])]
  return shared
}

export function buildListingIndexModel({ cards = [], tab = 'all', filters = DEFAULT_LISTING_INDEX_FILTERS, search = '', factsContext = {} } = {}) {
  const seen = new Set()
  const entries = cards.filter(card => {
    const id = text(card.id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  }).map(card => ({ card, facts: getListingIndexFacts(card, factsContext) }))
  const collection = filters.collectionView || 'current'
  const inCollection = entries.filter(({ card }) => (card.collectionView || 'current') === collection)
  const counts = Object.fromEntries(LISTING_INDEX_TABS.map(item => [item.key, item.key === 'all' ? inCollection.length : inCollection.filter(({ facts }) => facts.tab === item.key).length]))
  const candidates = inCollection.filter(({ facts }) => tab === 'all' || facts.tab === tab)
  const activeKeys = new Set(getListingIndexFilterKeys(tab, filters))
  const query = text(search).toLowerCase()
  const matchesNumber = (value, min, max) => (!text(min) && !text(max)) || (value !== null && (!text(min) || value >= Number(min)) && (!text(max) || value <= Number(max)))
  const rows = candidates.filter(({ card, facts }) => {
    if (query && ![card.title, card.addressLabel, card.suburb, card.typeLabel, card.agentName, card.originLabel, card.listingSourceLabel, facts.developmentName, facts.phase, facts.block, ...(card.followUpQueue || []).map(item => item.label)].join(' ').toLowerCase().includes(query)) return false
    for (const field of ['location', 'agent', 'propertyType', 'developmentId', 'phase', 'block', 'availability']) {
      if (activeKeys.has(field) && text(filters[field]) && key(facts[field]) !== key(filters[field])) return false
    }
    if (activeKeys.has('commercialCategory') && filters.commercialCategory && facts.category !== filters.commercialCategory) return false
    if (activeKeys.has('propertyCategory') && filters.propertyCategory && facts.category !== filters.propertyCategory) return false
    if (!matchesNumber(facts.price, filters.minPrice, filters.maxPrice)) return false
    if (activeKeys.has('minArea') && !matchesNumber(facts.area, filters.minArea, filters.maxArea)) return false
    for (const field of ['bedrooms', 'bathrooms', 'parking']) {
      if (activeKeys.has(field) && text(filters[field]) && (facts[field] === null || facts[field] < Number(filters[field]))) return false
    }
    return true
  }).map(({ card }) => card)
  return { rows, counts, candidates, collectionCounts: Object.fromEntries(['current', 'archived', 'review'].map(value => [value, entries.filter(({ card, facts }) => (card.collectionView || 'current') === value && (tab === 'all' || facts.tab === tab)).length])) }
}
