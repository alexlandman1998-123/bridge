const LEGAL_LANES = ['transfer', 'bond', 'cancellation']

function text(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalize(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function resolveLane(event = {}) {
  const metadata = event?.metadata || {}
  const workPacket = metadata?.workPacket || {}
  const source = normalize([
    workPacket.laneKey,
    metadata.laneKey,
    metadata.processKey,
    metadata.processLabel,
    metadata.laneLabel,
    event.relatedEntityType,
    event.type,
    event.topic,
    event.title,
  ].filter(Boolean).join(' '))

  if (source.includes('cancel')) return 'cancellation'
  if (source.includes('bond')) return 'bond'
  if (source.includes('transfer') || source.includes('legal') || source.includes('attorney') || source.includes('conveyanc')) return 'transfer'
  return ''
}

function eventMatchesRole(event = {}, clientRole = 'buyer') {
  const role = normalize(clientRole)
  const metadata = event?.metadata || {}
  const contractAudience = Array.isArray(metadata?.clientAudience)
    ? metadata.clientAudience.map(normalize).filter(Boolean)
    : Array.isArray(metadata?.workPacket?.clientAudience)
      ? metadata.workPacket.clientAudience.map(normalize).filter(Boolean)
      : []
  if (contractAudience.length) return contractAudience.includes(role)

  const audience = normalize(metadata?.audience || event?.audience)
  if (!audience || ['shared', 'both', 'buyer_and_seller'].includes(audience)) return true
  return audience.includes(role)
}

function toTimestamp(value = '') {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function resolveStatus(event = {}) {
  const status = normalize(event?.metadata?.status || event?.statusLabel || event?.displayType)
  if (status.includes('complete') || status === 'milestone') return { key: 'completed', label: 'Completed' }
  if (status.includes('block') || status.includes('attention') || status.includes('action')) return { key: 'attention', label: 'Attention needed' }
  if (status.includes('wait')) return { key: 'waiting', label: 'Waiting' }
  return { key: 'in_progress', label: 'In progress' }
}

function resolveLaneLabel(lane = '') {
  if (lane === 'bond') return 'Bond registration'
  if (lane === 'cancellation') return 'Bond cancellation'
  return 'Property transfer'
}

function isLegalEvent(event = {}) {
  if (event?.visibility && normalize(event.visibility) !== 'client_visible') return false
  const lane = resolveLane(event)
  return LEGAL_LANES.includes(lane)
}

function presentLegalEvent(event = {}) {
  const metadata = event?.metadata || {}
  const lane = resolveLane(event)
  const status = resolveStatus(event)
  return {
    id: text(event?.id, `${lane}_${event?.timestamp || 'update'}`),
    lane,
    laneLabel: text(metadata?.laneLabel || metadata?.processLabel, resolveLaneLabel(lane)),
    title: text(metadata?.title, text(event?.title, 'Legal progress updated')),
    description: text(metadata?.description, text(event?.description, 'Your legal team has progressed this transaction.')),
    status: status.key,
    statusLabel: status.label,
    updatedAt: text(event?.timestamp || metadata?.updatedAt),
  }
}

export function buildClientLegalProgressModel({ activityFeed = [], clientRole = 'buyer', maxItems = 4 } = {}) {
  const legalItems = (Array.isArray(activityFeed) ? activityFeed : [])
    .filter((event) => isLegalEvent(event) && eventMatchesRole(event, clientRole))
    .map(presentLegalEvent)
    .sort((left, right) => toTimestamp(right.updatedAt) - toTimestamp(left.updatedAt))

  const deduped = []
  const seen = new Set()
  for (const item of legalItems) {
    const key = `${item.lane}:${normalize(item.title)}:${normalize(item.description)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(item)
  }

  const items = deduped.slice(0, Math.max(1, Number(maxItems) || 4))
  return {
    available: items.length > 0,
    current: items[0] || null,
    items,
    laneCount: new Set(items.map((item) => item.lane)).size,
  }
}

