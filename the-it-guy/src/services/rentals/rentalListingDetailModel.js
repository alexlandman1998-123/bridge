import {
  RENTAL_LISTING_DETAIL_TABS,
  RENTAL_LISTING_ROUTES,
} from './rentalListingArchitecture.js'
import {
  buildRentalListingIndexRow,
  formatRentalIndexStatusLabel,
} from './rentalListingIndexModel.js'
import {
  buildRentalProperty24Readiness,
} from './rentalListingProperty24ReadinessModel.js'
import {
  normalizeRentalDistributionChannels,
  RENTAL_DISTRIBUTION_CHANNELS,
} from './rentalListingDraftModel.js'

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

function isPublishedChannelStatus(value) {
  return PROPERTY24_PUBLISHED_STATUSES.has(normalizeKey(value))
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
  if (normalized === 'syndication') return 'marketing'
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
  const facts = listing.sellerCanonicalFacts && typeof listing.sellerCanonicalFacts === 'object' ? listing.sellerCanonicalFacts : {}
  const publication = listing.listingPublicationData && typeof listing.listingPublicationData === 'object'
    ? listing.listingPublicationData
    : listing.publicationData && typeof listing.publicationData === 'object' ? listing.publicationData : {}
  const selectedDistributionChannels = normalizeRentalDistributionChannels(
    facts.distribution?.selectedChannels || facts.distribution?.selected_channels || publication.selectedSyndicationChannels || publication.selected_syndication_channels,
  )
  const readinessItems = buildRentalListingReadinessItems(row)
  const property24Readiness = buildRentalProperty24Readiness(listing)
  const completedReadinessCount = readinessItems.filter((item) => item.complete).length
  const channels = [
    { key: 'property24', label: 'Property24', status: row.property24Status, selected: selectedDistributionChannels.includes('property24') },
    { key: 'private_property', label: 'Private Property', status: row.privatePropertyStatus, selected: selectedDistributionChannels.includes('private_property') },
    { key: 'agency_website', label: 'Agency Website', status: row.websiteStatus, selected: selectedDistributionChannels.includes('agency_website') },
  ]
  return {
    version: RENTAL_LISTING_DETAIL_VERSION,
    listing,
    row,
    tabs: getRentalListingDetailTabs(row.id),
    readinessItems,
    property24Readiness,
    completedReadinessCount,
    totalReadinessCount: readinessItems.length,
    readinessPercent: readinessItems.length ? Math.round((completedReadinessCount / readinessItems.length) * 100) : 0,
    channels,
    selectedDistributionChannels: selectedDistributionChannels.map((key) => RENTAL_DISTRIBUTION_CHANNELS.find((channel) => channel.key === key)).filter(Boolean),
    liveChannelCount: channels.filter((channel) => isPublishedChannelStatus(channel.status)).length,
    channelCount: channels.length,
    lastUpdatedAt: row.updatedAt || null,
    statusLabel: formatRentalIndexStatusLabel(row.statusGroup),
    property24StatusLabel: formatRentalIndexStatusLabel(row.property24Status),
    mandateStatusLabel: formatRentalIndexStatusLabel(row.mandateStatus),
    marketingApprovalStatusLabel: formatRentalIndexStatusLabel(row.marketingApprovalStatus),
  }
}
