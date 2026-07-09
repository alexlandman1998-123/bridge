export const UX_DIAGNOSTICS_STORAGE_KEY = 'arch9.ux.diagnostics.v1'
export const UX_DIAGNOSTICS_HISTORY_LIMIT = 20

const SENSITIVE_QUERY_KEY_PATTERN = /(token|password|secret|key|authorization|cookie|otp|session|email|phone|name|code|invite)/i
const SENSITIVE_METADATA_KEY_PATTERN = /(password|token|secret|key|authorization|cookie|otp|session|email|phone|name)/i
const REDACTED_SEGMENT = '[redacted]'

function normalizeText(value = '', fallback = '') {
  const text = String(value || '').trim()
  return text || fallback
}

function canUseStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage)
}

function getSafeRouteFromWindow() {
  if (typeof window === 'undefined') return ''
  return buildSafeRoute({
    pathname: window.location?.pathname || '',
    search: window.location?.search || '',
    hash: window.location?.hash || '',
  })
}

function normalizeSeverity(value = '') {
  const normalized = normalizeText(value, 'medium').toLowerCase()
  if (['critical', 'high', 'medium', 'low', 'info', 'warning', 'error'].includes(normalized)) return normalized
  return 'medium'
}

function redactDiagnosticMetadata(metadata = {}) {
  if (Array.isArray(metadata)) return metadata.map((value) => (value && typeof value === 'object' ? redactDiagnosticMetadata(value) : value))
  if (!metadata || typeof metadata !== 'object') return {}
  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => {
      if (SENSITIVE_METADATA_KEY_PATTERN.test(key)) return [key, REDACTED_SEGMENT]
      if (value && typeof value === 'object') return [key, redactDiagnosticMetadata(value)]
      if (typeof value === 'string' && value.length > 500) return [key, `${value.slice(0, 500)}...`]
      return [key, value]
    }),
  )
}

function stableHash(value = '') {
  const text = String(value || '')
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) + hash) + text.charCodeAt(index)
    hash &= 0xffffffff
  }
  return Math.abs(hash).toString(36).slice(0, 6).toUpperCase()
}

function readStoredDiagnostics() {
  if (!canUseStorage()) return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(UX_DIAGNOSTICS_STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredDiagnostics(rows = []) {
  if (!canUseStorage()) return
  window.localStorage.setItem(UX_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(rows.slice(0, UX_DIAGNOSTICS_HISTORY_LIMIT)))
}

function redactSegment(segments, index) {
  if (!segments[index]) return
  segments[index] = REDACTED_SEGMENT
}

function redactTokenPathSegments(pathname = '') {
  const segments = String(pathname || '/').split('/')
  const first = segments[1] || ''
  const second = segments[2] || ''
  const third = segments[3] || ''

  if (first === 'external' || first === 'partner-portal' || first === 'snapshot' || first === 'status' || first === 'sign' || first === 'appointment-rsvp' || first === 'transaction-invite') {
    redactSegment(segments, 2)
  }

  if (first === 'client') {
    if (second === 'onboarding' || second === 'offer') redactSegment(segments, 3)
    else redactSegment(segments, 2)
  }

  if (first === 'seller') {
    if (second === 'onboarding') redactSegment(segments, 3)
    else if (second === 'offers' && third === 'review') redactSegment(segments, 4)
    else redactSegment(segments, 2)
  }

  if (first === 'mobile' && (second === 'buyer-onboarding' || second === 'seller-onboarding')) {
    redactSegment(segments, 3)
  }

  if (first === 'offers') {
    redactSegment(segments, second === 'session' ? 3 : 2)
  }

  if (first === 'invite') {
    redactSegment(segments, second === 'stakeholder' ? 3 : 2)
  }

  if (first === 'agent' && second === 'invite') redactSegment(segments, 3)
  if (first === 'referrals' && second === 'invite') redactSegment(segments, 3)
  if (first === 'partners' && (second === 'portal' || second === 'invite')) redactSegment(segments, 3)
  if (first === 'developer' && (second === 'access-invite' || second === 'partner-invite')) redactSegment(segments, 3)
  if (first === 'commercial' && ['portal', 'onboarding', 'landlord-onboarding'].includes(second)) redactSegment(segments, 3)

  return segments.join('/').replace(/%5Bredacted%5D/g, REDACTED_SEGMENT)
}

export function buildSafeRoute({ pathname = '', search = '', hash = '' } = {}) {
  const safePathname = redactTokenPathSegments(normalizeText(pathname, '/'))
  const params = new URLSearchParams(String(search || '').replace(/^\?/, ''))
  const safeParams = new URLSearchParams()

  Array.from(params.entries()).forEach(([key, value]) => {
    safeParams.set(key, SENSITIVE_QUERY_KEY_PATTERN.test(key) ? REDACTED_SEGMENT : String(value || '').slice(0, 80))
  })

  const safeSearch = safeParams.toString().replace(/%5Bredacted%5D/g, REDACTED_SEGMENT)
  const safeHash = hash ? `#${REDACTED_SEGMENT}` : ''
  return `${safePathname}${safeSearch ? `?${safeSearch}` : ''}${safeHash}`
}

export function getBrowserDiagnosticContext() {
  if (typeof window === 'undefined') {
    return {
      route: '',
      viewport: '',
      online: true,
      userAgent: '',
      language: '',
      timezone: '',
      storageAvailable: false,
    }
  }

  const storageAvailable = (() => {
    try {
      const key = 'arch9.ux.storage_probe'
      window.localStorage.setItem(key, '1')
      window.localStorage.removeItem(key)
      return true
    } catch {
      return false
    }
  })()

  return {
    route: getSafeRouteFromWindow(),
    viewport: `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
    userAgent: typeof navigator === 'undefined' ? '' : String(navigator.userAgent || '').slice(0, 180),
    language: typeof navigator === 'undefined' ? '' : String(navigator.language || '').slice(0, 24),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
    storageAvailable,
  }
}

export function buildUxDiagnosticSnapshot({
  source = 'unknown',
  category = 'ux_friction',
  severity = 'medium',
  message = '',
  userRole = '',
  workspaceType = '',
  metadata = {},
} = {}) {
  const browser = getBrowserDiagnosticContext()
  const timestamp = new Date().toISOString()
  const safeMetadata = redactDiagnosticMetadata(metadata)
  const baseSnapshot = {
    category: normalizeText(category, 'ux_friction'),
    source: normalizeText(source, 'unknown'),
    severity: normalizeSeverity(severity),
    message: normalizeText(message, 'User reported a confusing or broken state.').slice(0, 500),
    timestamp,
    route: browser.route,
    viewport: browser.viewport,
    online: browser.online,
    userAgent: browser.userAgent,
    language: browser.language,
    timezone: browser.timezone,
    storageAvailable: browser.storageAvailable,
    userRole: normalizeText(userRole),
    workspaceType: normalizeText(workspaceType),
    metadata: safeMetadata,
  }
  return {
    ...baseSnapshot,
    reference: `UX-${timestamp.slice(0, 10).replace(/-/g, '')}-${stableHash(JSON.stringify(baseSnapshot))}`,
  }
}

export function serializeUxDiagnosticSnapshot(snapshot = {}) {
  return JSON.stringify(snapshot, null, 2)
}

export function storeUxDiagnosticSnapshot(snapshot = {}) {
  if (!snapshot?.reference) return snapshot
  const rows = readStoredDiagnostics().filter((row) => row.reference !== snapshot.reference)
  writeStoredDiagnostics([snapshot, ...rows])
  return snapshot
}

export function getStoredUxDiagnosticSnapshots() {
  return readStoredDiagnostics()
}

export function removeStoredUxDiagnosticSnapshot(reference = '') {
  const safeReference = normalizeText(reference)
  if (!safeReference) return getStoredUxDiagnosticSnapshots()
  const nextRows = readStoredDiagnostics().filter((row) => row.reference !== safeReference)
  writeStoredDiagnostics(nextRows)
  return nextRows
}

export function clearStoredUxDiagnosticSnapshots() {
  writeStoredDiagnostics([])
  return []
}

export function summarizeUxDiagnosticSnapshots(rows = readStoredDiagnostics()) {
  const snapshots = Array.isArray(rows) ? rows : []
  const severityCounts = snapshots.reduce((counts, row) => {
    const severity = normalizeSeverity(row?.severity || 'medium')
    counts[severity] = (counts[severity] || 0) + 1
    return counts
  }, {})
  const latest = snapshots[0] || null
  return {
    total: snapshots.length,
    latestReference: latest?.reference || '',
    latestAt: latest?.timestamp || '',
    severityCounts,
    hasCritical: Boolean(severityCounts.critical || severityCounts.error),
  }
}

export function buildUxDiagnosticBundle(rows = readStoredDiagnostics()) {
  const snapshots = (Array.isArray(rows) ? rows : []).slice(0, UX_DIAGNOSTICS_HISTORY_LIMIT)
  return {
    type: 'arch9_ux_diagnostics_bundle',
    generatedAt: new Date().toISOString(),
    summary: summarizeUxDiagnosticSnapshots(snapshots),
    snapshots,
  }
}

export async function copyUxDiagnosticBundle(rows = readStoredDiagnostics()) {
  const bundle = buildUxDiagnosticBundle(rows)
  const text = serializeUxDiagnosticSnapshot(bundle)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return { copied: true, method: 'clipboard', bundle }
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand?.('copy') === true
    document.body.removeChild(textarea)
    return { copied, method: 'execCommand', bundle }
  }

  return { copied: false, method: 'unavailable', bundle }
}

export async function copyUxDiagnosticSnapshot(snapshot = {}) {
  const text = serializeUxDiagnosticSnapshot(snapshot)
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return { copied: true, method: 'clipboard' }
  }

  if (typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', '')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    document.body.appendChild(textarea)
    textarea.select()
    const copied = document.execCommand?.('copy') === true
    document.body.removeChild(textarea)
    return { copied, method: 'execCommand' }
  }

  return { copied: false, method: 'unavailable' }
}

export async function recordUxFrictionEvent({
  source = 'unknown',
  category = 'ux_friction',
  severity = 'medium',
  message = '',
  userId = '',
  workspaceId = '',
  userRole = '',
  workspaceType = '',
  metadata = {},
} = {}) {
  const snapshot = storeUxDiagnosticSnapshot(buildUxDiagnosticSnapshot({
    source,
    category,
    severity,
    message,
    userRole,
    workspaceType,
    metadata,
  }))

  const { trackTelemetryEvent } = await import('./telemetry.js')
  const telemetry = await trackTelemetryEvent({
    category: 'ux',
    eventName: 'ux_friction_reported',
    userId,
    workspaceId,
    route: snapshot.route,
    severity: snapshot.severity,
    metadata: {
      reference: snapshot.reference,
      source: snapshot.source,
      category: snapshot.category,
      message: snapshot.message,
      userRole: snapshot.userRole,
      workspaceType: snapshot.workspaceType,
      ...snapshot.metadata,
    },
  })

  return { snapshot, telemetry }
}
