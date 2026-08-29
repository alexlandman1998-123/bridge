import { inferLeadCategoryFromRecord } from '../../lib/leadCategory.js'

const DEFAULT_CACHE_TTL_MS = 5000
const pendingLoads = new Map()
const completedLoads = new Map()

function normalizeText(value = '') {
  return String(value || '').trim()
}

function workspaceKey(organisationId = '', leadId = '') {
  const workspaceId = normalizeText(organisationId)
  const scopedLeadId = normalizeText(leadId)
  return workspaceId && scopedLeadId ? `${workspaceId}:${scopedLeadId}` : ''
}

function isBuyerSnapshot(snapshot = {}) {
  const lead = Array.isArray(snapshot?.leads) ? snapshot.leads[0] : null
  return Boolean(lead && inferLeadCategoryFromRecord(lead) === 'buyer')
}

async function fetchBuyerWorkspaceFromRepository(organisationId, leadId) {
  const { fetchAgencyCrmLeadWorkspace } = await import('../../lib/agencyCrmRepository.js')
  return fetchAgencyCrmLeadWorkspace(organisationId, leadId)
}

export function clearBuyerLeadWorkspaceDataLoaderCache() {
  pendingLoads.clear()
  completedLoads.clear()
}

export function loadBuyerLeadWorkspaceData({
  organisationId = '',
  leadId = '',
  fetchWorkspace = fetchBuyerWorkspaceFromRepository,
  cacheTtlMs = DEFAULT_CACHE_TTL_MS,
  now = Date.now,
} = {}) {
  const key = workspaceKey(organisationId, leadId)
  if (!key) return Promise.reject(new Error('Buyer workspace loading requires an organisation and lead.'))

  const timestamp = Number(now())
  const cached = completedLoads.get(key)
  if (cached && timestamp - cached.completedAt <= Math.max(0, Number(cacheTtlMs) || 0)) {
    return Promise.resolve(cached.snapshot)
  }

  const pending = pendingLoads.get(key)
  if (pending) return pending

  const request = Promise.resolve()
    .then(() => fetchWorkspace(organisationId, leadId))
    .then((snapshot) => {
      if (isBuyerSnapshot(snapshot)) {
        completedLoads.set(key, { snapshot, completedAt: Number(now()) })
      }
      return snapshot
    })
    .finally(() => {
      if (pendingLoads.get(key) === request) pendingLoads.delete(key)
    })

  pendingLoads.set(key, request)
  return request
}
