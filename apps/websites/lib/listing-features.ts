export const LISTING_FEATURES = {
  modern_kitchen: { label: 'Modern kitchen', icon: 'utensils' },
  spacious_living_areas: { label: 'Spacious living areas', icon: 'armchair' },
  low_maintenance: { label: 'Low maintenance', icon: 'leaf' },
  great_location: { label: 'Great location', icon: 'map-pin' },
  pet_friendly: { label: 'Pet friendly', icon: 'paw-print' },
  fibre_ready: { label: 'Fibre ready', icon: 'wifi' },
  swimming_pool: { label: 'Swimming pool', icon: 'waves' },
  security_estate: { label: 'Secure estate', icon: 'shield-check' },
  backup_power: { label: 'Backup power', icon: 'battery-charging' },
  borehole: { label: 'Borehole', icon: 'droplet' },
  study: { label: 'Study', icon: 'book-open' },
  staff_quarters: { label: 'Staff accommodation', icon: 'house' },
  solar: { label: 'Solar power', icon: 'sun' },
} as const

export type ListingFeatureKey = keyof typeof LISTING_FEATURES
export type ListingFeature = { key: string; label: string; icon?: (typeof LISTING_FEATURES)[ListingFeatureKey]['icon'] }

function normalise(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

/** Turns persisted checkbox keys into the public presentation model.
 * Older free-text values remain visible, but deliberately have no invented icon. */
export function presentListingFeatures(values: string[]): ListingFeature[] {
  return values.map((value) => {
    const rawKey = normalise(String(value || ''))
    // These labels were used by the first CRM listing workflow. They map to
    // the same canonical website treatment without guessing at other text.
    const key = ({ pool: 'swimming_pool', fibre: 'fibre_ready' } as Record<string, string>)[rawKey] || rawKey
    const known = LISTING_FEATURES[key as ListingFeatureKey]
    return known ? { key, ...known } : { key: `legacy:${key || value}`, label: String(value).trim() }
  }).filter((feature) => feature.label)
}
