function hasValue(value) {
  return Boolean(String(value || '').trim())
}

/**
 * Chooses one authoritative refresh lane for the seller portal. Before an
 * offer creates a matter, the seller can only be kept current by re-reading
 * their authorised listing workspace. Once a transaction exists, the
 * transaction refresh signal is the authoritative lane instead.
 */
export function resolveSellerPortalSyncPolicy({
  listingId = '',
  transactionId = '',
  hasSecureSession = false,
  isDemo = false,
} = {}) {
  const hasTransaction = hasValue(transactionId)
  const hasListing = hasValue(listingId)
  const mode = hasTransaction ? 'transaction' : hasListing ? 'listing' : 'idle'

  return Object.freeze({
    mode,
    // Listing changes have no transaction refresh signal yet. Polling a
    // bounded, visible secure workspace keeps offers and marketing activity
    // current without subscribing a seller browser to protected listing rows.
    useListingRefresh: mode === 'listing' && hasSecureSession && !isDemo,
    listingPollingIntervalMs: 45_000,
  })
}
