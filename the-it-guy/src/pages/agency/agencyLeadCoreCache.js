const LEAD_CORE_CACHE_TTL_MS = 60_000
const leadCoreCache = new Map()

function cacheKey(organisationId = '', leadId = '') {
  return `${String(organisationId || '').trim()}:${String(leadId || '').trim()}`
}

export function readAgencyLeadCoreCache(organisationId, leadId) {
  const key = cacheKey(organisationId, leadId)
  const entry = leadCoreCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    leadCoreCache.delete(key)
    return null
  }
  return entry.data || null
}

export function writeAgencyLeadCoreCache(organisationId, leadId, data) {
  const key = cacheKey(organisationId, leadId)
  if (!key || !data) return data
  leadCoreCache.set(key, { data, expiresAt: Date.now() + LEAD_CORE_CACHE_TTL_MS })
  return data
}

export function deleteAgencyLeadCoreCache(organisationId, leadId) {
  leadCoreCache.delete(cacheKey(organisationId, leadId))
}
