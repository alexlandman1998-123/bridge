const CHANNELS = [
  { key: 'property24', label: 'Property24' },
  { key: 'private_property', label: 'Private Property' },
  { key: 'agency_website', label: 'Agency Website' },
  { key: 'arch9_catalogue', label: 'Arch9 public catalogue' },
]

export function buildListingWithdrawalPlan(state = {}) {
  const active = {
    property24: Boolean(state.property24Live),
    private_property: Boolean(state.privatePropertyLive),
    agency_website: Boolean(state.agencyWebsiteLive),
    arch9_catalogue: Boolean(state.arch9Live),
  }
  return CHANNELS.map((channel) => ({
    ...channel,
    active: active[channel.key],
    status: active[channel.key] ? 'pending' : 'not_live',
    detail: active[channel.key] ? 'Ready to withdraw' : 'Not currently live',
    blockedReason: channel.key === 'property24' && active[channel.key] && !String(state.property24Reference || '').trim()
      ? 'Property24 is marked live but has no listing reference.'
      : '',
  }))
}

export function applyListingWithdrawalResults(draft = {}, results = [], { complete = false } = {}) {
  const succeeded = new Set(results.filter((result) => result.status === 'succeeded').map((result) => result.key))
  const externalLinks = (Array.isArray(draft.externalLinks) ? draft.externalLinks : []).map((link) => {
    const platform = String(link?.platform || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (succeeded.has('property24') && platform.includes('property24')) {
      return { ...link, status: 'Withdrawn', visibleToSeller: false }
    }
    if (succeeded.has('private_property') && platform.includes('privateproperty')) {
      return { ...link, status: 'Inactive', visibleToSeller: false }
    }
    return link
  })
  return {
    ...draft,
    externalLinks,
    ...(succeeded.has('property24') ? { property24Status: 'removed' } : {}),
    ...(succeeded.has('private_property') ? { privatePropertyStatus: 'inactive' } : {}),
    ...(succeeded.has('arch9_catalogue') ? { publicationStatus: 'Draft', bridgeListingStatus: 'paused' } : {}),
    ...(complete ? { listingStatus: 'withdrawn', publicationStatus: 'Draft', bridgeListingStatus: 'paused' } : {}),
  }
}

export function listingWithdrawalIsComplete(results = []) {
  return results.every((result) => result.status === 'succeeded' || result.status === 'not_live')
}
