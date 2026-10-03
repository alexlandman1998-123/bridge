export function marketingPlatformKey(value = '') {
  const key = String(value).toLowerCase().replace(/[^a-z0-9]/g, '')
  if (key.includes('property24')) return 'property24'
  if (key.includes('privateproperty')) return 'privateProperty'
  if (['agencywebsite', 'website', 'agency', 'arch9website'].includes(key)) return 'website'
  return key || 'other'
}

export function buildSellerPublicationCards(channels = [], channelLeads = null) {
  const cards = new Map([
    ['property24', { id: 'property24', label: 'Property24', logoUrl: '/lead-sources/property24.png' }],
    ['privateProperty', { id: 'privateProperty', label: 'Private Property', logoUrl: '/lead-sources/private-property.jpeg' }],
    ['website', { id: 'website', label: 'Agency website' }],
  ])
  for (const channel of channels) {
    const key = marketingPlatformKey(channel.label)
    const existing = cards.get(key) || { id: key, label: channel.label }
    // Keep the first shared link for each platform, as on the overview.
    if (existing.href) continue
    let href = ''
    try {
      const url = new URL(channel.href)
      if (['http:', 'https:'].includes(url.protocol)) href = url.href
    } catch { /* No usable shared link. */ }
    cards.set(key, { ...existing, ...channel, id: key, href })
  }
  return [...cards.values()].map((card) => ({
    ...card,
    leadCount: channelLeads && Object.hasOwn(channelLeads, card.id) && Number.isInteger(channelLeads[card.id]) && channelLeads[card.id] >= 0
      ? channelLeads[card.id]
      : null,
  }))
}
