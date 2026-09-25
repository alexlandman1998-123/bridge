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
