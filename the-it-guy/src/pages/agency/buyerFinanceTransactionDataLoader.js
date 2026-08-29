const DEFAULT_CACHE_TTL_MS = 3000
const BUYER_FINANCE_TRANSACTION_TABS = new Set(['buyer_profile', 'onboarding_otp'])
const pendingLoads = new Map()
const completedLoads = new Map()

function normalizeText(value = '') {
  return String(value || '').trim()
}

function workspaceKey({
  organisationId = '',
  leadId = '',
  offerId = '',
  transactionId = '',
  revision = 0,
} = {}) {
  const workspaceId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  if (!workspaceId || !scopedLeadId) return ''

  return JSON.stringify({
    workspaceId,
    leadId: scopedLeadId,
    offerId: normalizeText(offerId),
    transactionId: normalizeText(transactionId),
    revision: Number(revision) || 0,
  })
}

async function fetchBuyerFinanceTransactionFromRepository(payload) {
  const { getBuyerLeadLifecycleDiagnostic } = await import('../../lib/buyerLifecycleService.js')
  return getBuyerLeadLifecycleDiagnostic(payload)
}

export function shouldLoadBuyerFinanceTransactionTab(tabKey = '') {
  return BUYER_FINANCE_TRANSACTION_TABS.has(normalizeText(tabKey).toLowerCase())
}

export function clearBuyerFinanceTransactionDataLoaderCache() {
  pendingLoads.clear()
  completedLoads.clear()
}

export function loadBuyerFinanceTransactionData({
  organisationId = '',
  leadId = '',
  offerId = '',
  transactionId = '',
  revision = 0,
  fetchDiagnostic = fetchBuyerFinanceTransactionFromRepository,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = Date.now,
} = {}) {
  const payload = {
    organisationId: normalizeText(organisationId),
    leadId: normalizeText(leadId),
    offerId: normalizeText(offerId),
    transactionId: normalizeText(transactionId),
  }
  const key = workspaceKey({ ...payload, revision })
  if (!key) return Promise.reject(new Error('Buyer finance and transaction loading requires an organisation and lead.'))
  if (!payload.offerId && !payload.transactionId) {
    return Promise.reject(new Error('Buyer finance and transaction loading requires an offer or transaction.'))
  }

  const timestamp = Number(now())
  const cached = completedLoads.get(key)
  if (cached && timestamp - cached.completedAt <= Math.max(0, Number(cacheTtlMs) || 0)) {
    return Promise.resolve(cached.diagnostic)
  }

  const pending = pendingLoads.get(key)
  if (pending) return pending

  const request = Promise.resolve()
    .then(() => fetchDiagnostic(payload))
    .then((diagnostic) => {
      const normalizedDiagnostic = diagnostic && typeof diagnostic === 'object' ? diagnostic : null
      completedLoads.set(key, { diagnostic: normalizedDiagnostic, completedAt: Number(now()) })
      return normalizedDiagnostic
    })
    .finally(() => {
      if (pendingLoads.get(key) === request) pendingLoads.delete(key)
    })

  pendingLoads.set(key, request)
  return request
}
