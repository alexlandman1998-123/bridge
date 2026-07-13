export const MEMBERSHIP_STATUSES = Object.freeze({
  invited: 'invited',
  active: 'active',
  pending: 'pending',
  suspended: 'suspended',
  removed: 'removed',
  deactivated: 'deactivated',
})

export const MEMBERSHIP_STATUS_VALUES = Object.freeze(Object.values(MEMBERSHIP_STATUSES))

export function normalizeMembershipStatus(value, fallback = MEMBERSHIP_STATUSES.pending) {
  const normalized = String(value || '').trim().toLowerCase()
  if (MEMBERSHIP_STATUS_VALUES.includes(normalized)) return normalized
  if (normalized === 'accepted') return MEMBERSHIP_STATUSES.active
  if (normalized === 'inactive') return MEMBERSHIP_STATUSES.deactivated
  return fallback
}

export function isActiveMembershipStatus(value) {
  return normalizeMembershipStatus(value) === MEMBERSHIP_STATUSES.active
}
