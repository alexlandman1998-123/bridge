function positivePrice(value) {
  const price = Number(value)
  return Number.isFinite(price) && price > 0 ? price : 0
}

function activityMetadata(row = {}) {
  if (row.metadata && typeof row.metadata === 'object') return row.metadata
  if (typeof row.metadata === 'string') {
    try { return JSON.parse(row.metadata) || {} } catch { return {} }
  }
  return {}
}

export function buildListingOverviewPricePosition({ listing = {}, draft = {}, activityRows = [], activityAvailable = true } = {}) {
  const askingPrice = positivePrice(listing.askingPrice || listing.asking_price) || positivePrice(draft.price)
  const history = (Array.isArray(activityRows) ? activityRows : [])
    .filter((row) => String(row.activity_type || row.activityType || '') === 'listing_price_changed')
    .map((row) => {
      const metadata = activityMetadata(row)
      const previousPrice = positivePrice(metadata.previousPrice)
      const nextPrice = positivePrice(metadata.nextPrice)
      if (!previousPrice || !nextPrice || previousPrice === nextPrice) return null
      return {
        id: String(row.id || `${row.created_at || row.createdAt}-${previousPrice}-${nextPrice}`),
        previousPrice,
        nextPrice,
        direction: nextPrice < previousPrice ? 'reduced' : 'increased',
        recordedAt: row.created_at || row.createdAt || '',
      }
    })
    .filter(Boolean)
    .sort((left, right) => new Date(right.recordedAt || 0).getTime() - new Date(left.recordedAt || 0).getTime())
  const latestChange = history.find((change) => change.nextPrice === askingPrice) || null
  return {
    askingPrice,
    history,
    latestChange,
    reductionActive: latestChange?.direction === 'reduced',
    historyAvailable: activityAvailable,
  }
}
