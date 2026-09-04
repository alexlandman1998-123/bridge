import { isMissingTableError, normalizeText, requireClient } from './attorneyFirmServiceShared'

function emptySnapshot(view = 'all', page = 1, pageSize = 20) {
  return {
    contract: 'arch9-attorney-matter-list-snapshot-v1',
    view,
    pagination: { page, pageSize, totalRows: 0 },
    kpis: {
      activeMatters: 0,
      awaitingClient: 0,
      lodgementToday: 0,
      registrationThisWeek: 0,
      delayedMatters: 0,
      appointmentsToday: 0,
    },
    rows: [],
    access: { activeMembership: false, scope: 'assigned' },
  }
}

function listingLabel(listing = {}) {
  return [
    listing.formatted_address,
    listing.street_address,
    listing.address_line_1,
    listing.title,
    [listing.suburb, listing.city].filter(Boolean).join(', '),
  ]
    .map((value) => normalizeText(value))
    .find(Boolean) || ''
}

function needsPropertyLabel(value) {
  const normalized = normalizeText(value).toLowerCase()
  return !normalized || normalized === 'property pending' || normalized === 'property details pending'
}

export async function hydratePropertyLabelsFromListings(client, snapshot) {
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : []
  const transactionIds = rows
    .filter((row) => needsPropertyLabel(row.propertyLabel) && normalizeText(row.transactionId))
    .map((row) => row.transactionId)
  if (!transactionIds.length) return snapshot

  // The attorney snapshot is intentionally assignment-first. Some historical
  // matters have their address only on the linked listing, so resolve it here
  // rather than exposing a generic "Property pending" title.
  const transactionResult = await client
    .from('transactions')
    .select('id, listing_id')
    .in('id', transactionIds)
  if (transactionResult.error || !Array.isArray(transactionResult.data)) return snapshot

  const listingIdsByTransactionId = new Map(
    transactionResult.data
      .filter((transaction) => transaction?.id && transaction?.listing_id)
      .map((transaction) => [transaction.id, transaction.listing_id]),
  )
  const listingIds = [...new Set(listingIdsByTransactionId.values())]
  if (!listingIds.length) return snapshot

  const listingResult = await client
    .from('private_listings')
    .select('id, title, formatted_address, street_address, address_line_1, suburb, city')
    .in('id', listingIds)
  if (listingResult.error || !Array.isArray(listingResult.data)) return snapshot

  const labelsByListingId = new Map(listingResult.data.map((listing) => [listing.id, listingLabel(listing)]))
  return {
    ...snapshot,
    rows: rows.map((row) => {
      if (!needsPropertyLabel(row.propertyLabel)) return row
      const listingLabelValue = labelsByListingId.get(listingIdsByTransactionId.get(row.transactionId))
      return listingLabelValue ? { ...row, propertyLabel: listingLabelValue } : row
    }),
  }
}

export async function getAttorneyMatterListSnapshot({
  firmId = '',
  view = 'all',
  page = 1,
  pageSize = 20,
  search = '',
  filters = {},
} = {}) {
  const normalizedFirmId = normalizeText(firmId)
  const normalizedView = normalizeText(view).toLowerCase() || 'all'
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedPageSize = Math.min(100, Math.max(1, Number(pageSize) || 20))
  if (!normalizedFirmId) return emptySnapshot(normalizedView, normalizedPage, normalizedPageSize)

  const client = requireClient()
  const result = await client.rpc('bridge_attorney_matter_list_snapshot', {
    p_attorney_firm_id: normalizedFirmId,
    p_view: normalizedView,
    p_page: normalizedPage,
    p_page_size: normalizedPageSize,
    p_search: normalizeText(search),
    p_filters: filters && typeof filters === 'object' && !Array.isArray(filters) ? filters : {},
  })

  if (result.error) {
    if (isMissingTableError(result.error, 'bridge_attorney_matter_list_snapshot')) {
      return null
    }
    throw result.error
  }

  const snapshot = result.data && typeof result.data === 'object'
    ? result.data
    : emptySnapshot(normalizedView, normalizedPage, normalizedPageSize)
  return hydratePropertyLabelsFromListings(client, snapshot)
}
