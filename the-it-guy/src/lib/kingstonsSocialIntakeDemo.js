const STORAGE_KEY = 'arch9:kingstons-social-intake:v1'

export const buyerAreaOptions = ['Boksburg', 'Benoni', 'Bedfordview', 'Edenvale', 'Kempton Park', 'Other']
export const buyerBudgetOptions = ['Under R1m', 'R1m-R1.5m', 'R1.5m-R2m', 'R2m-R3m', 'R3m+']
export const bedroomOptions = ['1+', '2+', '3+', '4+']
export const buyerPropertyTypeOptions = ['House', 'Townhouse', 'Apartment', 'Estate Home']
export const buyerFeatureOptions = ['Pool', 'Garden', 'Pet Friendly', 'Study', 'Double Garage', 'Security Estate', 'Solar']

export const sellerFeatureOptions = [
  'Pool',
  'Garden',
  'Flatlet',
  'Solar',
  'Security Estate',
  'Renovated Kitchen',
  'Entertainment Area',
]

export const sellerPriceOptions = ['Not sure', 'Under R1m', 'R1m-R1.5m', 'R1.5m-R2m', 'R2m-R3m', 'R3m+']

export const demoProperties = [
  {
    id: 'kgs-001',
    title: 'Modern Family Home',
    suburb: 'Boksburg',
    area: 'Boksburg',
    price: 1850000,
    beds: 3,
    baths: 2,
    parking: 2,
    garages: 2,
    propertyType: 'House',
    features: ['Garden', 'Open-plan living', 'Pet Friendly'],
    imageUrl: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80',
    image: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=900&q=80',
    agentName: 'Megan Botha',
    agentPhone: '+27 82 555 0142',
  },
  {
    id: 'kgs-002',
    title: 'Secure Estate Townhouse',
    suburb: 'Benoni',
    area: 'Benoni',
    price: 2250000,
    beds: 3,
    baths: 2,
    parking: 2,
    garages: 2,
    propertyType: 'Townhouse',
    features: ['Estate living', 'Solar ready', 'Low maintenance'],
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    image: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80',
    agentName: 'Jason King',
    agentPhone: '+27 83 555 0198',
  },
  {
    id: 'kgs-003',
    title: 'Starter Apartment',
    suburb: 'Bedfordview',
    area: 'Bedfordview',
    price: 1250000,
    beds: 2,
    baths: 1,
    parking: 1,
    garages: 1,
    propertyType: 'Apartment',
    features: ['Lock-up-and-go', 'Close to shops', 'Good security'],
    imageUrl: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80',
    image: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=900&q=80',
    agentName: 'Nandi Mokoena',
    agentPhone: '+27 84 555 0167',
  },
]

export const mockListings = [
  ...demoProperties.map((property) => ({
    ...property,
    image: property.imageUrl,
  })),
  {
    id: 'kgs-004',
    title: 'Edenvale Garden Townhouse',
    area: 'Edenvale',
    price: 1675000,
    beds: 3,
    baths: 2,
    garages: 2,
    propertyType: 'Townhouse',
    features: ['Garden', 'Pet Friendly', 'Double Garage', 'Security Estate'],
    image: 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=900&q=80',
    agentName: 'Lara Naidoo',
    agentPhone: '+27 81 555 0120',
  },
  {
    id: 'kgs-005',
    title: 'Kempton Park Starter Apartment',
    area: 'Kempton Park',
    price: 890000,
    beds: 2,
    baths: 1,
    garages: 1,
    propertyType: 'Apartment',
    features: ['Security Estate', 'Pet Friendly'],
    image: 'https://images.unsplash.com/photo-1600607687644-c7171b42498b?auto=format&fit=crop&w=900&q=80',
    agentName: 'Thabo Nkosi',
    agentPhone: '+27 79 555 0185',
  },
  {
    id: 'kgs-006',
    title: 'Benoni Solar Family Residence',
    area: 'Benoni',
    price: 2250000,
    beds: 3,
    baths: 2,
    garages: 2,
    propertyType: 'House',
    features: ['Pool', 'Garden', 'Solar', 'Double Garage'],
    image: 'https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=900&q=80',
    agentName: 'Megan Botha',
    agentPhone: '+27 82 555 0142',
  },
  {
    id: 'kgs-007',
    title: 'Boksburg Lock-Up-And-Go',
    area: 'Boksburg',
    price: 1320000,
    beds: 2,
    baths: 2,
    garages: 1,
    propertyType: 'Townhouse',
    features: ['Pet Friendly', 'Security Estate', 'Garden'],
    image: 'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=900&q=80',
    agentName: 'Jason King',
    agentPhone: '+27 83 555 0198',
  },
  {
    id: 'kgs-008',
    title: 'Bedfordview Designer Estate Home',
    area: 'Bedfordview',
    price: 3825000,
    beds: 4,
    baths: 3,
    garages: 2,
    propertyType: 'Estate Home',
    features: ['Pool', 'Security Estate', 'Study', 'Solar', 'Double Garage'],
    image: 'https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=900&q=80',
    agentName: 'Nandi Mokoena',
    agentPhone: '+27 84 555 0167',
  },
  {
    id: 'kgs-009',
    title: 'Edenvale Renovated Family House',
    area: 'Edenvale',
    price: 2480000,
    beds: 4,
    baths: 2,
    garages: 2,
    propertyType: 'House',
    features: ['Pool', 'Garden', 'Study', 'Double Garage'],
    image: 'https://images.unsplash.com/photo-1598228723793-52759bba239c?auto=format&fit=crop&w=900&q=80',
    agentName: 'Lara Naidoo',
    agentPhone: '+27 81 555 0120',
  },
  {
    id: 'kgs-010',
    title: 'Kempton Park Estate Cluster',
    area: 'Kempton Park',
    price: 1980000,
    beds: 3,
    baths: 2,
    garages: 2,
    propertyType: 'Estate Home',
    features: ['Security Estate', 'Garden', 'Solar', 'Double Garage'],
    image: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=900&q=80',
    agentName: 'Thabo Nkosi',
    agentPhone: '+27 79 555 0185',
  },
  {
    id: 'kgs-011',
    title: 'Benoni Lakeside Apartment',
    area: 'Benoni',
    price: 1185000,
    beds: 2,
    baths: 1,
    garages: 1,
    propertyType: 'Apartment',
    features: ['Security Estate', 'Study'],
    image: 'https://images.unsplash.com/photo-1600607688969-a5bfcd646154?auto=format&fit=crop&w=900&q=80',
    agentName: 'Megan Botha',
    agentPhone: '+27 82 555 0142',
  },
  {
    id: 'kgs-012',
    title: 'Boksburg Premium Four Bedroom',
    area: 'Boksburg',
    price: 3275000,
    beds: 4,
    baths: 3,
    garages: 3,
    propertyType: 'House',
    features: ['Pool', 'Garden', 'Study', 'Solar', 'Double Garage'],
    image: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=900&q=80',
    agentName: 'Jason King',
    agentPhone: '+27 83 555 0198',
  },
]

const emptyState = {
  buyerLeads: [],
  sellerLeads: [],
  viewingRequests: [],
  valuationRequests: [],
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 100000)}`
}

function nowIso() {
  return new Date().toISOString()
}

function toNumber(value, fallback = 0) {
  const parsed = Number.parseInt(String(value || '').replace(/\D/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function readKingstonsDemoState() {
  if (typeof window === 'undefined' || !window.localStorage) return { ...emptyState }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      buyerLeads: Array.isArray(parsed.buyerLeads) ? parsed.buyerLeads : [],
      sellerLeads: Array.isArray(parsed.sellerLeads) ? parsed.sellerLeads : [],
      viewingRequests: Array.isArray(parsed.viewingRequests) ? parsed.viewingRequests : [],
      valuationRequests: Array.isArray(parsed.valuationRequests) ? parsed.valuationRequests : [],
    }
  } catch {
    return { ...emptyState }
  }
}

export function writeKingstonsDemoState(nextState) {
  if (typeof window === 'undefined' || !window.localStorage) return { ...emptyState }

  const safeState = {
    buyerLeads: Array.isArray(nextState?.buyerLeads) ? nextState.buyerLeads : [],
    sellerLeads: Array.isArray(nextState?.sellerLeads) ? nextState.sellerLeads : [],
    viewingRequests: Array.isArray(nextState?.viewingRequests) ? nextState.viewingRequests : [],
    valuationRequests: Array.isArray(nextState?.valuationRequests) ? nextState.valuationRequests : [],
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(safeState))
  return safeState
}

export function resetKingstonsDemoState() {
  return writeKingstonsDemoState(emptyState)
}

export function getBudgetRange(label = '') {
  switch (label) {
    case 'Under R1m':
      return { min: 0, max: 999999 }
    case 'R1m-R1.5m':
      return { min: 1000000, max: 1500000 }
    case 'R1.5m-R2m':
      return { min: 1500000, max: 2000000 }
    case 'R2m-R3m':
      return { min: 2000000, max: 3000000 }
    case 'R3m+':
      return { min: 3000000, max: Number.POSITIVE_INFINITY }
    default:
      return { min: 0, max: Number.POSITIVE_INFINITY }
  }
}

export function formatRand(value = 0) {
  const amount = Number(value || 0)
  if (amount >= 1000000) {
    const millions = amount / 1000000
    return `R${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(2)}m`
  }
  return `R${Math.round(amount / 1000)}k`
}

function scoreListingForBuyer(listing, buyer = {}) {
  const selectedFeatures = Array.isArray(buyer.features) ? buyer.features : []
  const featureOverlap = selectedFeatures.filter((feature) => listing.features.includes(feature))
  const budgetRange = getBudgetRange(buyer.budget)
  const minBeds = toNumber(buyer.beds, 1)

  const areaScore = buyer.area === 'Other' || !buyer.area ? 16 : listing.area === buyer.area ? 25 : 0
  const budgetScore = listing.price >= budgetRange.min && listing.price <= budgetRange.max
    ? 25
    : listing.price <= budgetRange.max * 1.12 && listing.price >= budgetRange.min * 0.9
      ? 12
      : 0
  const bedsScore = listing.beds >= minBeds ? 20 : listing.beds + 1 >= minBeds ? 8 : 0
  const typeScore = !buyer.propertyType || listing.propertyType === buyer.propertyType ? 15 : 0
  const featureScore = selectedFeatures.length ? Math.round((featureOverlap.length / selectedFeatures.length) * 15) : 10

  return {
    ...listing,
    matchPercentage: Math.min(100, areaScore + budgetScore + bedsScore + typeScore + featureScore),
    matchedFeatures: featureOverlap,
  }
}

export function matchPropertiesToBuyer(buyer = {}) {
  // TODO: Sync matched listings from live listings table.
  return mockListings
    .map((listing) => scoreListingForBuyer(listing, buyer))
    .sort((a, b) => b.matchPercentage - a.matchPercentage || a.price - b.price)
}

export function createBuyerLead(buyer = {}, matchedProperties = []) {
  // TODO: Replace local demo state with CRM lead creation.
  // TODO: Route buyer lead to assigned agent.
  const state = readKingstonsDemoState()
  const selectedPropertyIds = Array.isArray(buyer.selectedPropertyIds) ? buyer.selectedPropertyIds : []
  const budgetRange = getBudgetRange(buyer.budget)
  const lead = {
    id: createId('buyer'),
    type: 'buyer',
    createdAt: nowIso(),
    status: 'Buyer Lead Created',
    name: buyer.name || 'Instagram Buyer',
    phone: buyer.phone || '',
    area: buyer.area || '',
    budget: buyer.budget || '',
    budgetMin: buyer.budgetMin || budgetRange.min,
    budgetMax: buyer.budgetMax || (Number.isFinite(budgetRange.max) ? budgetRange.max : ''),
    beds: buyer.beds || '',
    baths: buyer.baths || '',
    propertyType: buyer.propertyType || '',
    features: Array.isArray(buyer.features) ? buyer.features : [],
    selectedPropertyIds,
    selectedProperties: demoProperties
      .filter((property) => selectedPropertyIds.includes(property.id))
      .map((property) => ({
        id: property.id,
        title: property.title,
        suburb: property.suburb,
        price: property.price,
        beds: property.beds,
        baths: property.baths,
        parking: property.parking,
        imageUrl: property.imageUrl,
      })),
    matchedProperties: matchedProperties.slice(0, 6).map((property) => ({
      id: property.id,
      title: property.title,
      area: property.area,
      price: property.price,
      matchPercentage: property.matchPercentage,
      agentName: property.agentName,
    })),
    viewingRequested: false,
  }
  writeKingstonsDemoState({ ...state, buyerLeads: [lead, ...state.buyerLeads] })
  return lead
}

export function createSellerLead(seller = {}) {
  // TODO: Replace local demo state with CRM lead creation.
  const state = readKingstonsDemoState()
  const lead = {
    id: createId('seller'),
    type: 'seller',
    createdAt: nowIso(),
    status: 'Seller Lead Created',
    ownerName: seller.name || 'Demo Seller',
    phone: seller.phone || '',
    address: [seller.streetAddress, seller.suburb].filter(Boolean).join(', '),
    beds: seller.beds || '',
    baths: seller.baths || '',
    garages: seller.garages || '',
    propertyType: seller.propertyType || '',
    features: Array.isArray(seller.features) ? seller.features : [],
    expectedAskingPrice: seller.expectedPrice || '',
    preferredValuationTime: [seller.preferredDay, seller.preferredTime].filter(Boolean).join(' at '),
  }
  writeKingstonsDemoState({ ...state, sellerLeads: [lead, ...state.sellerLeads] })
  return lead
}

export function createViewingRequest({ buyerLeadId = '', listing = null, request = {} } = {}) {
  const state = readKingstonsDemoState()
  const viewingRequest = {
    id: createId('viewing'),
    buyerLeadId,
    listingId: listing?.id || '',
    listingTitle: listing?.title || '',
    agentName: listing?.agentName || '',
    createdAt: nowIso(),
    status: 'Viewing request created',
    name: request.name || '',
    phone: request.phone || '',
    preferredDay: request.preferredDay || '',
    preferredTime: request.preferredTime || '',
  }
  const buyerLeads = state.buyerLeads.map((lead) => (
    lead.id === buyerLeadId
      ? {
          ...lead,
          name: request.name || lead.name,
          phone: request.phone || lead.phone,
          viewingRequested: true,
          status: 'Viewing Requested',
        }
      : lead
  ))
  writeKingstonsDemoState({
    ...state,
    buyerLeads,
    viewingRequests: [viewingRequest, ...state.viewingRequests],
  })
  return viewingRequest
}

export function createValuationRequest({ sellerLeadId = '', seller = {} } = {}) {
  // TODO: Route seller valuation request to branch/principal/agent.
  const state = readKingstonsDemoState()
  const valuationRequest = {
    id: createId('valuation'),
    sellerLeadId,
    createdAt: nowIso(),
    status: 'Valuation request created',
    name: seller.name || '',
    phone: seller.phone || '',
    address: [seller.streetAddress, seller.suburb].filter(Boolean).join(', '),
    preferredDay: seller.preferredDay || '',
    preferredTime: seller.preferredTime || '',
  }
  const sellerLeads = state.sellerLeads.map((lead) => (
    lead.id === sellerLeadId
      ? { ...lead, status: 'Valuation Requested' }
      : lead
  ))
  writeKingstonsDemoState({
    ...state,
    sellerLeads,
    valuationRequests: [valuationRequest, ...state.valuationRequests],
  })
  return valuationRequest
}
