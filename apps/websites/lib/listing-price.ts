import type { PublicProperty } from './types'

export const rentalPriceFrequencies = ['monthly', 'weekly', 'daily', 'annual', 'per_square_metre'] as const
export type RentalPriceFrequency = typeof rentalPriceFrequencies[number]

export function resolveRentalPriceFrequency(value: unknown): RentalPriceFrequency | undefined {
  if (value === undefined || value === null || value === '') return 'monthly'
  return rentalPriceFrequencies.find(frequency => frequency === value)
}

export function rentalPriceSuffix(property: Pick<PublicProperty, 'transactionType' | 'rentalPriceFrequency'>): string {
  if (property.transactionType !== 'rental') return ''
  const frequency = property.rentalPriceFrequency
  return frequency ? ({ monthly: ' / month', weekly: ' / week', daily: ' / day', annual: ' / year', per_square_metre: ' / m²' })[frequency] : ''
}
