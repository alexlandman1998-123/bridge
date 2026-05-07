export const PREFERRED_PARTNER_TYPES = [
  { value: 'bond_originator', label: 'Bond Originator' },
  { value: 'bond_attorney', label: 'Bond Attorney' },
  { value: 'transfer_attorney', label: 'Transfer Attorney' },
]

export const PREFERRED_PARTNER_TYPE_LABELS = PREFERRED_PARTNER_TYPES.reduce((accumulator, item) => {
  accumulator[item.value] = item.label
  return accumulator
}, {})

export const PREFERRED_PARTNER_TYPE_VALUES = PREFERRED_PARTNER_TYPES.map((item) => item.value)

export const PREFERRED_PARTNER_PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
]

export function normalizePreferredPartnerType(value, fallback = 'transfer_attorney') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')

  if (normalized === 'conveyancer' || normalized === 'transfer_conveyancer') {
    return 'transfer_attorney'
  }

  if (normalized === 'bond' || normalized === 'bondoriginator') {
    return 'bond_originator'
  }

  if (normalized === 'bondattorney') {
    return 'bond_attorney'
  }

  if (PREFERRED_PARTNER_TYPE_VALUES.includes(normalized)) {
    return normalized
  }

  return fallback
}

export function getPreferredPartnerTypeLabel(value) {
  return PREFERRED_PARTNER_TYPE_LABELS[normalizePreferredPartnerType(value)] || 'Preferred Partner'
}

export function sortPreferredPartners(items = []) {
  return [...items].sort((left, right) => {
    const preferredDiff = Number(Boolean(right?.isPreferredDefault)) - Number(Boolean(left?.isPreferredDefault))
    if (preferredDiff !== 0) return preferredDiff

    const activeDiff = Number(Boolean(right?.isActive)) - Number(Boolean(left?.isActive))
    if (activeDiff !== 0) return activeDiff

    const companyLeft = String(left?.companyName || '').toLowerCase()
    const companyRight = String(right?.companyName || '').toLowerCase()
    return companyLeft.localeCompare(companyRight)
  })
}

export function buildPreferredPartnerSearchIndex(partner = {}) {
  return [
    partner.companyName,
    partner.contactPerson,
    partner.email,
    partner.phone,
    partner.website,
    partner.province,
    getPreferredPartnerTypeLabel(partner.partnerType),
  ]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')
}

export function filterPreferredPartners(items = [], { type = 'all', query = '', activeOnly = false } = {}) {
  const normalizedType = String(type || '').trim().toLowerCase()
  const normalizedQuery = String(query || '').trim().toLowerCase()

  return items.filter((item) => {
    if (activeOnly && !item?.isActive) {
      return false
    }

    if (normalizedType !== 'all' && normalizePreferredPartnerType(item?.partnerType) !== normalizedType) {
      return false
    }

    if (!normalizedQuery) {
      return true
    }

    const haystack = buildPreferredPartnerSearchIndex(item)
    return haystack.includes(normalizedQuery)
  })
}

export function getDefaultPreferredPartnerByType(items = [], type) {
  const normalizedType = normalizePreferredPartnerType(type)
  const scoped = items.filter((item) => normalizePreferredPartnerType(item?.partnerType) === normalizedType && item?.isActive)
  if (!scoped.length) {
    return null
  }

  const explicit = scoped.find((item) => item?.isPreferredDefault)
  return explicit || scoped[0]
}
