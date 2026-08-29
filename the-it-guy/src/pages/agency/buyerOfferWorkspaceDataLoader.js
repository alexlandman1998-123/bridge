const DEFAULT_CACHE_TTL_MS = 3000
const pendingLoads = new Map()
const completedLoads = new Map()

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeText).filter(Boolean))].sort()
}

function workspaceKey({
  organisationId = '',
  leadId = '',
  contactId = '',
  appointmentIds = [],
  listingIds = [],
  buyerEmail = '',
  buyerPhone = '',
  buyerName = '',
  revision = 0,
} = {}) {
  const workspaceId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  if (!workspaceId || !scopedLeadId) return ''

  return JSON.stringify({
    workspaceId,
    leadId: scopedLeadId,
    contactId: normalizeText(contactId),
    appointmentIds: normalizeIds(appointmentIds),
    listingIds: normalizeIds(listingIds),
    buyerEmail: normalizeText(buyerEmail).toLowerCase(),
    buyerPhone: normalizeText(buyerPhone),
    buyerName: normalizeText(buyerName),
    revision: Number(revision) || 0,
  })
}

async function fetchBuyerOfferWorkspaceFromRepository(payload) {
  const {
    listCanonicalOffersForLead,
    listOfferPortalSessions,
  } = await import('../../lib/buyerLifecycleService.js')

  const [offers, sessions] = await Promise.all([
    listCanonicalOffersForLead(payload),
    listOfferPortalSessions(payload).catch(() => []),
  ])
  return { offers, sessions }
}

export function clearBuyerOfferWorkspaceDataLoaderCache() {
  pendingLoads.clear()
  completedLoads.clear()
}

export function loadBuyerOfferWorkspaceData({
  organisationId = '',
  leadId = '',
  contactId = '',
  appointmentIds = [],
  listingIds = [],
  buyerEmail = '',
  buyerPhone = '',
  buyerName = '',
  revision = 0,
  fetchWorkspace = fetchBuyerOfferWorkspaceFromRepository,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = Date.now,
} = {}) {
  const payload = {
    organisationId: normalizeText(organisationId),
    leadId: normalizeText(leadId),
    contactId: normalizeText(contactId),
    appointmentIds: normalizeIds(appointmentIds),
    listingIds: normalizeIds(listingIds),
    buyerEmail: normalizeText(buyerEmail),
    buyerPhone: normalizeText(buyerPhone),
    buyerName: normalizeText(buyerName),
  }
  const key = workspaceKey({ ...payload, revision })
  if (!key) return Promise.reject(new Error('Buyer offer loading requires an organisation and lead.'))

  const timestamp = Number(now())
  const cached = completedLoads.get(key)
  if (cached && timestamp - cached.completedAt <= Math.max(0, Number(cacheTtlMs) || 0)) {
    return Promise.resolve(cached.result)
  }

  const pending = pendingLoads.get(key)
  if (pending) return pending

  const request = Promise.resolve()
    .then(() => fetchWorkspace(payload))
    .then((result = {}) => {
      const normalizedResult = {
        offers: Array.isArray(result.offers) ? result.offers : [],
        sessions: Array.isArray(result.sessions) ? result.sessions : [],
      }
      completedLoads.set(key, { result: normalizedResult, completedAt: Number(now()) })
      return normalizedResult
    })
    .finally(() => {
      if (pendingLoads.get(key) === request) pendingLoads.delete(key)
    })

  pendingLoads.set(key, request)
  return request
}
