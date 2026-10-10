import type { PublicProperty } from './types'

export function listingStatusLabel(property: Pick<PublicProperty, 'transactionType' | 'listingStatus'>): string {
  if (property.transactionType === 'rental') return 'To let'
  if (property.listingStatus === 'sold') return 'Sold'
  if (property.listingStatus === 'under_offer') return 'Under offer'
  return 'For sale'
}
