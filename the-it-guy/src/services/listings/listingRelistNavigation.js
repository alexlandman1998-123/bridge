const channelKeys = { Property24: 'property24', 'Private Property': 'private_property' }

export function relistChannelFromSearch(search) {
  const key = new URLSearchParams(search || '').get('relist')
  return Object.keys(channelKeys).find(channel => channelKeys[channel] === key) || ''
}

export function listingRelistEditorPath(listingId, channel) {
  const params = new URLSearchParams({ step: 'property', scope: 'listing-publication' })
  if (channelKeys[channel]) params.set('relist', channelKeys[channel])
  return `/listings/${encodeURIComponent(listingId)}/edit?${params}`
}

export function listingRelistReturnPath(listingId, channel) {
  const params = new URLSearchParams({ tab: 'marketing' })
  if (channelKeys[channel]) params.set('relist', channelKeys[channel])
  return `/agent/listings/${encodeURIComponent(listingId)}?${params}`
}
