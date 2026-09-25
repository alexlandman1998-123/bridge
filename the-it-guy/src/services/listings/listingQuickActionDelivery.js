export function isQuickListingPortalUpdateAccepted(channel, action, response = {}) {
  if (channel === 'Property24') return response?.status === 'SUBMITTED'
  if (channel === 'Private Property' && action === 'price_reduction') return response?.status === 'SUBMITTED'
  if (channel === 'Private Property' && ['under_offer', 'sold'].includes(action)) return response?.update?.status === 'UPDATED'
  return false
}
