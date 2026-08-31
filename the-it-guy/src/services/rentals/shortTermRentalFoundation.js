/**
 * Phase 0 contract only. It deliberately owns no routes, tables, or UI.
 *
 * These values are the vocabulary future migrations and workflows must share;
 * keeping them here prevents a booking being modelled as a tenancy by accident.
 */
export const SHORT_TERM_RENTAL_CONTRACT_VERSION = 'arch9_short_term_rentals_v1'

export const RENTAL_OPERATING_MODES = Object.freeze({
  longTerm: 'long_term',
  shortTerm: 'short_term',
})

export const RENTAL_OPERATING_MODE_HOME_ROUTES = Object.freeze({
  [RENTAL_OPERATING_MODES.longTerm]: '/agent/rentals/long-term/dashboard',
  [RENTAL_OPERATING_MODES.shortTerm]: '/agent/rentals/short-term/dashboard',
})

export function normalizeRentalOperatingMode(value = '', fallback = RENTAL_OPERATING_MODES.longTerm) {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (normalized === RENTAL_OPERATING_MODES.shortTerm || normalized === 'shortterm') return RENTAL_OPERATING_MODES.shortTerm
  if (normalized === RENTAL_OPERATING_MODES.longTerm || normalized === 'longterm') return RENTAL_OPERATING_MODES.longTerm
  return fallback
}

export function getRentalOperatingModeHomeRoute(mode = RENTAL_OPERATING_MODES.longTerm) {
  return RENTAL_OPERATING_MODE_HOME_ROUTES[normalizeRentalOperatingMode(mode)] || RENTAL_OPERATING_MODE_HOME_ROUTES[RENTAL_OPERATING_MODES.longTerm]
}

export const SHORT_TERM_BOOKING_STATUSES = Object.freeze([
  'enquiry',
  'provisional',
  'confirmed',
  'checked_in',
  'checked_out',
  'cancelled',
])

export const SHORT_TERM_STAY_STATUSES = Object.freeze([
  'upcoming',
  'in_house',
  'checked_out',
  'cancelled',
])

export const RENTAL_OCCUPANCY_BLOCK_SOURCES = Object.freeze([
  'tenancy',
  'booking',
  'owner_block',
  'maintenance',
  'manual',
])

export const RENTAL_OCCUPANCY_BLOCK_STATUSES = Object.freeze([
  'held',
  'confirmed',
  'active',
  'released',
  'cancelled',
])

export const SHORT_TERM_ACTIVITY_ENTITY_TYPES = Object.freeze([
  'rental_short_term_booking',
  'rental_short_term_stay',
  'rental_short_term_turnover',
])

function enabled(value) {
  return value === true || value === 'true' || value === '1'
}

/**
 * Long-Term remains backward-compatible with the existing rentals flag.
 * Short-Term is opt-in until Phase 1 exposes the toolbar mode switch.
 */
export function resolveRentalOperatingModeAvailability(featureFlags = {}) {
  const rentalsEnabled = enabled(featureFlags.rentalsEnabled)
  return Object.freeze({
    [RENTAL_OPERATING_MODES.longTerm]: rentalsEnabled && featureFlags.rentalLongTermEnabled !== false,
    [RENTAL_OPERATING_MODES.shortTerm]: rentalsEnabled && enabled(featureFlags.rentalShortTermEnabled),
  })
}

export function isShortTermBookingStatus(value = '') {
  return SHORT_TERM_BOOKING_STATUSES.includes(String(value || '').trim().toLowerCase())
}
