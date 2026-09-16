import type { PublicProperty } from './types'

const SALE_VALUES = new Set(['sale', 'for sale', 'for-sale'])
const RENTAL_VALUES = new Set(['rental', 'rent', 'to rent', 'to-rent', 'to let', 'to-let', 'let'])

/**
 * Returns a public transaction type only when the source value is explicit.
 * Ambiguous values such as "Both", "Unknown", or blank are excluded rather
 * than being silently presented as a sale.
 */
export function resolveListingTransactionType(value: unknown): PublicProperty['transactionType'] | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (SALE_VALUES.has(normalized)) return 'sale'
  if (RENTAL_VALUES.has(normalized)) return 'rental'
  return null
}
