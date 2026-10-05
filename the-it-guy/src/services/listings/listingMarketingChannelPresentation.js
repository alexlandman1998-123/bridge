function text(value) {
  return String(value ?? '').trim()
}

export function getPrivatePropertyReadinessMessages(payload = {}) {
  const preview = payload?.preview || payload?.readiness?.preview || payload?.report?.preview || {}
  const list = (value) => Array.isArray(value) ? value : []
  const format = (value) => text(value).replace(/^missing_/, 'missing ').replace(/^private_property_/, 'Private Property ').replace(/_/g, ' ')
  const recovery = payload?.readiness?.recovery || payload?.report?.recovery
  const formatBlocker = (value) => recovery?.message && list(recovery.blockers).includes(value) ? '' : format(value)
  const issues = [
    recovery?.message,
    payload?.readiness?.locationResolution?.message || payload?.report?.locationResolution?.message,
    ...list(payload?.missingConfiguration).map((item) => `Setup: ${format(item)}`),
    ...list(preview.dataBlockers).map(formatBlocker),
    ...list(preview.technicalBlockers).map(formatBlocker),
    ...list(payload?.readiness?.blockers).map(formatBlocker),
    ...list(payload?.report?.readiness?.blockers).map(formatBlocker),
    ...list(payload?.report?.blockers).map(formatBlocker),
  ]
  const warnings = [
    ...list(payload?.readiness?.warnings),
    ...list(payload?.report?.readiness?.warnings),
    ...list(payload?.report?.warnings),
  ].map((value) => value === 'using_organisation_default_private_property_config'
    ? 'Using your organisation’s Private Property connection. This does not prevent submission.'
    : format(value))
  return {
    issues: [...new Set(issues.filter(Boolean))],
    warnings: [...new Set(warnings.filter(Boolean))],
  }
}

export function normalizeListingChannelPublicUrl(value = '') {
  const candidate = text(value)
  if (!candidate) return ''
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(candidate)
    ? candidate
    : `https://${candidate.replace(/^\/+/, '')}`

  try {
    const parsed = new URL(withProtocol)
    if (!['http:', 'https:'].includes(parsed.protocol)) return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

export function buildWebsiteListingPublicUrl(publication = {}, listingId = '', listingTitle = '') {
  if (!publication?.hostname || !text(listingId)) return ''
  const homeSeekers = publication.websiteSiteId === 'c2fcb2e4-23c1-4302-b490-7332f5075669'
  // The original platform preview domain does not serve the standalone site.
  // Keep using its Vercel alias until the CRM has an active custom domain.
  const hostname = homeSeekers && text(publication.hostname).endsWith('.sites.propdata.co.za')
    ? 'home-seekers-website-alpha.vercel.app'
    : text(publication.hostname)
  const safeTitle = text(listingTitle || 'property').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'property'
  const path = homeSeekers
    ? `/demo/homeseekers/properties/${encodeURIComponent(text(listingId))}`
    : `/properties/${safeTitle}-${encodeURIComponent(text(listingId))}`
  return normalizeListingChannelPublicUrl(`https://${hostname}${path}`)
}

export function normalizeListingChannelReference(value = '') {
  return text(value).replace(/^ref(?:erence)?\s*:\s*/i, '')
}

const CHANNEL_HOSTS = Object.freeze({
  property24: 'property24.com',
  private_property: 'privateproperty.co.za',
  arch9_catalogue: 'arch9.co.za',
})

export function getListingChannelViewUrl(channel = '', value = '') {
  const url = normalizeListingChannelPublicUrl(value)
  const expectedHost = CHANNEL_HOSTS[channel]
  if (!url || !expectedHost) return ''
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    if (host !== expectedHost && !host.endsWith(`.${expectedHost}`)) return ''
    if (!parsed.pathname || parsed.pathname === '/') return ''
    return parsed.toString()
  } catch {
    return ''
  }
}

export function buildListingChannelPublicationDisplay({
  key = '', label = '', live = false, reference = '', publicUrl = '',
  publicationState = {}, updateState = {}, activityAvailable = true,
  actionBusy = false, withdrawn = false, submitted = false, issueCount = 0,
  externalStatus = '',
} = {}) {
  const stage = text(publicationState?.stage).toLowerCase()
  const updateStatus = text(updateState?.status).toLowerCase()
  const observedStatus = text(externalStatus).toLowerCase()
  const inactive = ['inactive', 'removed', 'paused', 'failed'].includes(observedStatus)
  if (inactive) live = false
  const tracked = Boolean(live || reference || publicUrl || (stage && stage !== 'not_published'))
  let status = 'not_published'
  let statusLabel = 'Not published'
  if (withdrawn || stage === 'withdrawn') {
    status = live ? 'needs_attention' : 'not_published'
    statusLabel = live ? 'Still reported live' : 'Withdrawn'
  } else if (actionBusy) {
    status = 'syncing'; statusLabel = 'Syncing'
  } else if (inactive) {
    status = 'needs_attention'
    statusLabel = { inactive: 'Inactive', removed: 'Removed', paused: 'Paused', failed: 'Failed' }[observedStatus]
  } else if (stage === 'failed' || stage === 'withdrawal_failed' || Number(publicationState?.changeCount || 0) > 0 || updateStatus === 'needs_attention' || (!activityAvailable && tracked)) {
    status = 'needs_attention'
    statusLabel = Number(publicationState?.changeCount || 0) > 0 ? 'Changes not published' : 'Needs attention'
  } else if (updateStatus === 'awaiting_verification') {
    status = 'awaiting_verification'; statusLabel = 'Awaiting verification'
  } else if (updateStatus === 'current') {
    status = 'current'; statusLabel = 'Current'
  } else if (live) {
    status = 'live'; statusLabel = 'Live'
  } else if (submitted) {
    status = 'syncing'; statusLabel = 'Submitted'
  } else if (issueCount > 0) {
    status = 'needs_attention'; statusLabel = 'Needs attention'
  }
  const safeUrl = getListingChannelViewUrl(key, publicUrl)
  return {
    key, label, status, statusLabel,
    href: safeUrl && live && !withdrawn && stage !== 'withdrawn' ? safeUrl : '',
    linkAvailable: Boolean(safeUrl),
    live: Boolean(live),
  }
}
