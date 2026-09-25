const VERIFIED_DOCUMENT_STATUSES = new Set(['approved', 'verified', 'complete', 'completed'])
const REVIEW_DOCUMENT_STATUSES = new Set(['uploaded', 'received', 'submitted', 'under_review', 'pending_review', 'reviewed'])
const ATTENTION_DOCUMENT_STATUSES = new Set(['rejected', 'declined', 'changes_requested', 'failed', 'expired'])
const OUTSTANDING_DOCUMENT_STATUSES = new Set(['missing', 'requested', 'pending', 'not_started', 'not_received'])
const SENT_DELIVERY_STATUSES = new Set(['sent', 'delivered', 'queued'])
const FAILED_DELIVERY_STATUSES = new Set(['failed', 'error', 'bounced'])

function text(value = '') {
  return String(value ?? '').trim()
}

function key(value = '') {
  return text(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function documentStatus(document = {}) {
  return key(document.status || document.documentStatus || document.document_status || document.reviewStatus || document.review_status)
}

function timestamp(value) {
  const parsed = new Date(value || 0).getTime()
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function buildSellerFicaOverview({ documents = [], profileValue = '' } = {}) {
  const statuses = (Array.isArray(documents) ? documents : []).map(documentStatus).filter(Boolean)
  if (statuses.length) {
    if (statuses.every((status) => VERIFIED_DOCUMENT_STATUSES.has(status))) {
      return { label: 'Complete', status: 'complete', complete: true, needsReview: false }
    }
    if (statuses.some((status) => ATTENTION_DOCUMENT_STATUSES.has(status))) {
      return { label: 'Needs attention', status: 'attention', complete: false, needsReview: true }
    }
    if (statuses.some((status) => OUTSTANDING_DOCUMENT_STATUSES.has(status))) {
      return { label: 'Outstanding', status: 'pending', complete: false, needsReview: true }
    }
    if (statuses.some((status) => REVIEW_DOCUMENT_STATUSES.has(status) || VERIFIED_DOCUMENT_STATUSES.has(status))) {
      return { label: 'Awaiting review', status: 'under_review', complete: false, needsReview: true }
    }
    return { label: 'Outstanding', status: 'pending', complete: false, needsReview: true }
  }

  const profileStatus = key(profileValue)
  if (VERIFIED_DOCUMENT_STATUSES.has(profileStatus)) {
    return { label: 'Complete', status: 'complete', complete: true, needsReview: false }
  }
  if (REVIEW_DOCUMENT_STATUSES.has(profileStatus)) {
    return { label: 'Awaiting review', status: 'under_review', complete: false, needsReview: true }
  }
  if (ATTENTION_DOCUMENT_STATUSES.has(profileStatus)) {
    return { label: 'Needs attention', status: 'attention', complete: false, needsReview: true }
  }
  return { label: 'Outstanding', status: 'pending', complete: false, needsReview: true }
}

export function buildSellerPortalSecurityOverview({ loading = false, portalToken = '', portalStatus = '', diagnostics = null } = {}) {
  if (loading) return { label: 'Checking', status: 'pending', available: false, failures24h: null, openAlerts: null }
  const activePortal = ['activated', 'profile_complete', 'transaction_ready'].includes(key(portalStatus))
  if (!text(portalToken) && !activePortal) {
    return { label: 'Not active', status: 'pending', available: false, failures24h: null, openAlerts: null }
  }
  if (!diagnostics || typeof diagnostics !== 'object') {
    return { label: 'Unavailable', status: 'attention', available: false, failures24h: null, openAlerts: null }
  }
  const failures24h = Number(
    diagnostics?.authentication?.failedEvents24h ??
    diagnostics?.failedEvents24h ??
    diagnostics?.authentication?.failedLoginCount ??
    0,
  )
  const openAlerts = Array.isArray(diagnostics.openAlerts) ? diagnostics.openAlerts.length : Number(diagnostics.openAlertCount || 0)
  const reportedHealth = key(diagnostics.health)
  const hasDiagnosticEvidence = Boolean(
    reportedHealth ||
    diagnostics.authentication ||
    diagnostics.failedEvents24h !== undefined ||
    diagnostics.openAlertCount !== undefined ||
    Array.isArray(diagnostics.openAlerts),
  )
  if (!hasDiagnosticEvidence) {
    return { label: 'Unavailable', status: 'attention', available: false, failures24h: null, openAlerts: null }
  }
  const needsAttention = failures24h > 0 || openAlerts > 0 || ['attention', 'warning', 'failed', 'error', 'unhealthy'].includes(reportedHealth)
  return {
    label: needsAttention ? 'Needs attention' : 'Healthy',
    status: needsAttention ? 'attention' : 'complete',
    available: true,
    failures24h,
    openAlerts,
  }
}

export function buildSellerEmailDeliveryOverview(diagnostics = {}, { loading = false, error = '' } = {}) {
  if (loading) return { label: 'Checking', status: 'pending', hasEvidence: false }
  if (text(error)) return { label: 'Unavailable', status: 'attention', hasEvidence: false }
  const rows = Array.isArray(diagnostics.rows) ? diagnostics.rows : []
  if (!rows.length) return { label: 'No delivery recorded', status: 'pending', hasEvidence: false }
  const latest = rows[0] || {}
  const latestStatus = key(latest.status || latest.deliveryStatus || latest.delivery_status)
  if (FAILED_DELIVERY_STATUSES.has(latestStatus)) {
    return { label: 'Latest delivery failed', status: 'attention', hasEvidence: true }
  }
  if (SENT_DELIVERY_STATUSES.has(latestStatus)) {
    return { label: latestStatus === 'delivered' ? 'Delivered' : latestStatus === 'queued' ? 'Queued' : 'Sent', status: latestStatus === 'queued' ? 'pending' : 'complete', hasEvidence: true }
  }
  return { label: 'Delivery pending', status: 'pending', hasEvidence: true }
}

export function resolveSellerLastContact(values = []) {
  return (Array.isArray(values) ? values : [])
    .filter(Boolean)
    .map((value) => ({ value, time: timestamp(value) }))
    .filter((entry) => entry.time)
    .sort((left, right) => right.time - left.time)[0]?.value || ''
}
