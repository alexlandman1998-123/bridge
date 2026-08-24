import {
  RENTAL_LISTING_DETAIL_TABS,
  RENTAL_LISTING_ROUTES,
} from './rentalListingArchitecture.js'
import {
  buildRentalListingIndexRow,
  formatRentalIndexStatusLabel,
} from './rentalListingIndexModel.js'

export const RENTAL_LISTING_DETAIL_VERSION = 'arch9_rental_listing_detail_v1'

const MANDATE_READY_STATUSES = new Set(['signed', 'signed_uploaded'])
const MARKETING_READY_STATUSES = new Set(['approved', 'ready'])
const PROPERTY24_PUBLISHED_STATUSES = new Set(['published', 'live', 'active', 'on_portal'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase().replace(/[\s-]+/g, '_')
}

function hasValue(value) {
  return normalizeText(value) !== '' && value !== null && value !== undefined
}

function replaceListingId(path = '', listingId = '') {
  return normalizeText(path).replace(':listingId', encodeURIComponent(normalizeText(listingId)))
}

export function getRentalListingDetailTabs(listingId = '') {
  return RENTAL_LISTING_DETAIL_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    path: replaceListingId(RENTAL_LISTING_ROUTES[tab.routeKey], listingId),
    salesParity: tab.salesParity,
    intent: tab.intent,
  }))
}

export function resolveRentalListingDetailTab(tabKey = '') {
  const normalized = normalizeKey(tabKey || 'overview')
  return RENTAL_LISTING_DETAIL_TABS.some((tab) => tab.key === normalized) ? normalized : 'overview'
}

export function buildRentalListingDetailPath(listingId = '', tabKey = 'overview') {
  const normalizedTab = resolveRentalListingDetailTab(tabKey)
  const tab = RENTAL_LISTING_DETAIL_TABS.find((item) => item.key === normalizedTab) || RENTAL_LISTING_DETAIL_TABS[0]
  return replaceListingId(RENTAL_LISTING_ROUTES[tab.routeKey], listingId)
}

export function buildRentalListingReadinessItems(row = {}) {
  const mandateReady = MANDATE_READY_STATUSES.has(normalizeKey(row.mandateStatus))
  const marketingReady = MARKETING_READY_STATUSES.has(normalizeKey(row.marketingApprovalStatus))
  const property24Published = PROPERTY24_PUBLISHED_STATUSES.has(normalizeKey(row.property24Status))
  return [
    {
      key: 'property',
      label: 'Property basics',
      complete: Boolean(hasValue(row.address) && hasValue(row.monthlyRent) && hasValue(row.availableFrom)),
      detail: 'Address, rent, and availability',
    },
    {
      key: 'landlord',
      label: 'Landlord',
      complete: Boolean(hasValue(row.landlordName) && hasValue(row.landlordContact)),
      detail: 'Name and contact details',
    },
    {
      key: 'mandate',
      label: 'Rental mandate',
      complete: mandateReady,
      detail: formatRentalIndexStatusLabel(row.mandateStatus),
    },
    {
      key: 'marketing',
      label: 'Marketing approval',
      complete: marketingReady,
      detail: formatRentalIndexStatusLabel(row.marketingApprovalStatus),
    },
    {
      key: 'syndication',
      label: 'Property24',
      complete: property24Published,
      detail: property24Published ? 'Published' : 'Not published',
    },
  ]
}

export function buildRentalListingDetailView(listing = {}) {
  const row = buildRentalListingIndexRow(listing)
  const readinessItems = buildRentalListingReadinessItems(row)
  const completedReadinessCount = readinessItems.filter((item) => item.complete).length
  return {
    version: RENTAL_LISTING_DETAIL_VERSION,
    listing,
    row,
    tabs: getRentalListingDetailTabs(row.id),
    readinessItems,
    completedReadinessCount,
    totalReadinessCount: readinessItems.length,
    readinessPercent: readinessItems.length ? Math.round((completedReadinessCount / readinessItems.length) * 100) : 0,
    statusLabel: formatRentalIndexStatusLabel(row.statusGroup),
    property24StatusLabel: formatRentalIndexStatusLabel(row.property24Status),
    mandateStatusLabel: formatRentalIndexStatusLabel(row.mandateStatus),
    marketingApprovalStatusLabel: formatRentalIndexStatusLabel(row.marketingApprovalStatus),
  }
}
