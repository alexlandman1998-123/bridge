import type { PublicProperty } from './types'

export function listingStatusLabel(property: Pick<PublicProperty, 'transactionType' | 'listingStatus'> & Partial<Pick<PublicProperty, 'features'>>): string {
  const reduced = property.features?.some(feature => feature.trim().toLowerCase().replace(/[ -]/g, '_') === 'reduced_banner')
  if (property.transactionType === 'rental') return reduced ? 'Reduced · To let' : 'To let'
  if (property.listingStatus === 'sold') return 'Sold'
  if (property.listingStatus === 'under_offer') return 'Under offer'
  return reduced ? 'Reduced' : 'For sale'
}
