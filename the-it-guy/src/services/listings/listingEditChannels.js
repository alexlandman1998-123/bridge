const key = value => String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
const inactive = new Set(['withdrawn', 'expired', 'removed', 'unpublished', 'inactive', 'cancelled'])
const channels = [
  ['property24', 'property24Status', ['property24Reference', 'property24ListingUrl']],
  ['private_property', 'privatePropertyStatus', ['privatePropertyReference', 'privatePropertyListingUrl']],
  ['agency_website', 'bridgeListingStatus', ['bridgeListingPublicUrl']],
]
function linkChannel(link) {
  const platform = key(link.platform)
  if (platform.includes('property24')) return 'property24'
  if (platform.includes('private')) return 'private_property'
  if (platform.includes('agency') || platform.includes('website')) return 'agency_website'
  return ''
}
export function getListingEditChannels(listing, storedChannels = []) {
  const selected = new Set(['arch9_seller_experience', ...storedChannels.filter(channel => channels.some(([name]) => name === channel))])
  const links = listing.externalLinks || listing.listingExternalLinks || []
  for (const [channel, statusField, referenceFields] of channels) {
    const status = key(listing[statusField])
    const channelLinks = links.filter(link => linkChannel(link) === channel)
    const explicitlyInactive = inactive.has(status) || ((!status || status === 'not_published') && channelLinks.length > 0 && channelLinks.every(link => inactive.has(key(link.status))))
    if (explicitlyInactive) { selected.delete(channel); continue }
    if (referenceFields.some(field => listing[field]) || (status && status !== 'not_published') || channelLinks.some(link => !inactive.has(key(link.status)))) selected.add(channel)
  }
  if (inactive.has(key(listing.websitePublication?.status))) selected.delete('agency_website')
  return [...selected]
}
