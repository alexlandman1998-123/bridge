export const LISTING_PUBLICATION_CHANNELS = Object.freeze([
  { key: 'property24', label: 'Property24' },
  { key: 'private_property', label: 'Private Property' },
  { key: 'arch9_catalogue', label: 'Arch9 public catalogue' },
  { key: 'agency_website', label: 'Agency Website' },
])

const SNAPSHOT_FIELDS = Object.freeze([
  ['headline', 'Headline', 'Content'],
  ['description', 'Description', 'Content'],
  ['listingPreviewDescription', 'Preview description', 'Content'],
  ['price', 'Price', 'Pricing'],
  ['pricePresentation', 'Price presentation', 'Pricing'],
  ['listingStatus', 'Listing status', 'Status'],
  ['address', 'Address', 'Property'],
  ['propertyType', 'Property type', 'Property'],
  ['propertySubtype', 'Property subtype', 'Property'],
  ['bedrooms', 'Bedrooms', 'Property'],
  ['bathrooms', 'Bathrooms', 'Property'],
  ['garages', 'Garages', 'Property'],
  ['parkingBays', 'Parking bays', 'Property'],
  ['erfSize', 'Erf size', 'Property'],
  ['floorSize', 'Floor size', 'Property'],
  ['features', 'Features', 'Features'],
  ['amenities', 'Amenities', 'Features'],
  ['coverImage', 'Cover image', 'Media'],
  ['gallery', 'Gallery order', 'Media'],
  ['floorplans', 'Floorplans', 'Media'],
  ['videoLink', 'Video link', 'Media'],
  ['virtualTourLink', 'Virtual tour', 'Media'],
])

function text(value) {
  return String(value ?? '').trim()
}

function numberText(value) {
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) && parsed !== 0 ? String(parsed) : ''
}

function normalizedList(value, { preserveOrder = false } = {}) {
  const list = (Array.isArray(value) ? value : [])
    .map((item) => text(item))
    .filter(Boolean)
  return preserveOrder ? list : [...new Set(list)].sort((left, right) => left.localeCompare(right))
}

function mediaIdentity(item = {}) {
  return text(item.path || item.publicUrl || item.url || item.signedUrl || item.id || item.name)
}

function channelKey(value = '') {
  const normalized = text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (normalized.includes('property24')) return 'property24'
  if (normalized.includes('private_property') || normalized === 'privateproperty') return 'private_property'
  if (normalized.includes('agency_website') || normalized === 'website') return 'agency_website'
  if (normalized.includes('arch9') || normalized.includes('catalogue')) return 'arch9_catalogue'
  return normalized
}

function eventTime(row = {}) {
  return text(row.created_at || row.createdAt)
}

function eventMetadata(row = {}) {
  return row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
}

function eventType(row = {}) {
  return text(row.activity_type || row.activityType)
}

export function buildListingPublicationSnapshot(draft = {}) {
  const gallery = Array.isArray(draft.galleryImages) ? draft.galleryImages : []
  const floorplans = Array.isArray(draft.floorplans) ? draft.floorplans : []
  const cover = gallery.find((item) => text(item?.id) === text(draft.coverImageId)) || gallery[0] || null
  return {
    version: 1,
    headline: text(draft.headline),
    description: text(draft.description),
    listingPreviewDescription: text(draft.listingPreviewDescription),
    price: numberText(draft.price),
    pricePresentation: text(draft.pricePresentation),
    listingStatus: text(draft.listingStatus),
    address: text(draft.formattedAddress || draft.addressLine1 || draft.streetAddress),
    propertyType: text(draft.propertyType),
    propertySubtype: text(draft.propertySubtype),
    bedrooms: numberText(draft.bedrooms),
    bathrooms: numberText(draft.bathrooms),
    garages: numberText(draft.garages),
    parkingBays: numberText(draft.parkingBays),
    erfSize: numberText(draft.erfSize),
    floorSize: numberText(draft.floorSize),
    features: normalizedList(draft.selectedFeatures),
    amenities: normalizedList(draft.amenities),
    coverImage: mediaIdentity(cover || {}),
    gallery: normalizedList(gallery.map(mediaIdentity), { preserveOrder: true }),
    floorplans: normalizedList(floorplans.map(mediaIdentity), { preserveOrder: true }),
    videoLink: text(draft.videoLink),
    virtualTourLink: text(draft.virtualTourLink),
  }
}

function comparable(value) {
  return Array.isArray(value) ? JSON.stringify(value) : text(value)
}

function displayValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(', ') : 'None'
  return text(value) || 'Not set'
}

export function diffListingPublicationSnapshots(current = {}, published = {}) {
  return SNAPSHOT_FIELDS.flatMap(([key, label, group]) => {
    if (comparable(current[key]) === comparable(published[key])) return []
    return [{ key, label, group, previousValue: displayValue(published[key]), currentValue: displayValue(current[key]) }]
  })
}

export function deriveListingPublicationStates(activityRows = [], currentSnapshot = {}, fallbacks = {}) {
  const states = Object.fromEntries(LISTING_PUBLICATION_CHANNELS.map((channel) => [channel.key, {
    ...channel,
    stage: fallbacks[channel.key]?.live ? 'legacy_live' : 'not_published',
    submittedAt: '',
    acceptedAt: '',
    verifiedAt: '',
    withdrawnAt: '',
    failedAt: '',
    failureDetail: '',
    publicUrl: text(fallbacks[channel.key]?.publicUrl),
    reference: text(fallbacks[channel.key]?.reference),
    publishedSnapshot: null,
    changes: [],
    changeCount: 0,
  }]))

  const rows = [...(Array.isArray(activityRows) ? activityRows : [])]
    .sort((left, right) => Date.parse(eventTime(left) || 0) - Date.parse(eventTime(right) || 0))

  for (const row of rows) {
    const type = eventType(row)
    const metadata = eventMetadata(row)
    const key = channelKey(metadata.channel)
    if (!states[key]) continue
    const occurredAt = eventTime(row)
    const snapshot = metadata.snapshot && typeof metadata.snapshot === 'object' ? metadata.snapshot : null
    if (type === 'listing_channel_publication_submitted') {
      states[key].stage = 'submitted'
      states[key].submittedAt = text(metadata.submittedAt) || occurredAt
      states[key].failedAt = ''
      states[key].failureDetail = ''
    } else if (type === 'listing_channel_publication_accepted') {
      states[key].stage = 'accepted'
      states[key].submittedAt = text(metadata.submittedAt) || states[key].submittedAt
      states[key].acceptedAt = text(metadata.acceptedAt) || occurredAt
      states[key].publishedSnapshot = snapshot || states[key].publishedSnapshot
      states[key].publicUrl = text(metadata.publicUrl) || states[key].publicUrl
      states[key].reference = text(metadata.reference) || states[key].reference
      states[key].failedAt = ''
      states[key].failureDetail = ''
    } else if (type === 'listing_channel_publication_verified' || type === 'listing_portal_update_verified') {
      states[key].stage = 'verified'
      states[key].verifiedAt = text(metadata.verifiedAt) || occurredAt
      states[key].publishedSnapshot = snapshot || states[key].publishedSnapshot
      states[key].publicUrl = text(metadata.publicUrl) || states[key].publicUrl
    } else if (type === 'listing_channel_publication_failed') {
      states[key].stage = 'failed'
      states[key].failedAt = text(metadata.failedAt) || occurredAt
      states[key].failureDetail = text(metadata.error || metadata.detail)
    } else if (type === 'listing_channel_withdrawal_succeeded') {
      states[key].stage = 'withdrawn'
      states[key].withdrawnAt = text(metadata.withdrawnAt) || occurredAt
      states[key].failedAt = ''
      states[key].failureDetail = ''
    } else if (type === 'listing_channel_withdrawal_failed') {
      states[key].stage = 'withdrawal_failed'
      states[key].failedAt = text(metadata.failedAt) || occurredAt
      states[key].failureDetail = text(metadata.error || metadata.detail)
    }
  }

  for (const state of Object.values(states)) {
    state.changes = ['withdrawn', 'withdrawal_failed'].includes(state.stage)
      ? []
      : state.publishedSnapshot
      ? diffListingPublicationSnapshots(currentSnapshot, state.publishedSnapshot)
      : []
    state.changeCount = state.changes.length
  }
  return states
}

export function getListingPublicationChannelKey(channel = '') {
  return channelKey(channel)
}
