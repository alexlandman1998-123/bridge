function text(value) {
  return String(value ?? '').trim()
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
} = {}) {
  const stage = text(publicationState.stage).toLowerCase()
  const updateStatus = text(updateState.status).toLowerCase()
  const tracked = Boolean(live || reference || publicUrl || (stage && stage !== 'not_published'))
  let status = 'not_published'
  let statusLabel = 'Not published'
  if (withdrawn || stage === 'withdrawn') {
    status = live ? 'needs_attention' : 'not_published'
    statusLabel = live ? 'Still reported live' : 'Withdrawn'
  } else if (actionBusy) {
    status = 'syncing'; statusLabel = 'Syncing'
  } else if (stage === 'failed' || stage === 'withdrawal_failed' || Number(publicationState.changeCount || 0) > 0 || updateStatus === 'needs_attention' || (!activityAvailable && tracked)) {
    status = 'needs_attention'
    statusLabel = Number(publicationState.changeCount || 0) > 0 ? 'Changes not published' : 'Needs attention'
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
