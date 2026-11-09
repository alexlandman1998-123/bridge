import { emitAgencyCrmUpdated } from '../lib/agencyCrmUpdateBus.js'
import { invalidateAgencyLeadListCache } from '../pages/agency/agencyLeadListReadRepository.js'
import { clearBuyerLeadWorkspaceDataLoaderCache } from '../pages/agency/buyerLeadWorkspaceDataLoader.js'
import { clearAgencyLeadWorkspaceSnapshotCache } from '../pages/agency/agencyLeadWorkspaceSnapshotCache.js'


// Publish only identities; each screen reloads through its existing authorised reader.
export function notifyDevelopmentLeadChange(data, { stockChanged = false } = {}) {
  for (const organisationId of new Set([data.developerOrgId, data.sourceAgencyOrgId].filter(Boolean))) {
    invalidateAgencyLeadListCache(organisationId, data.sourceLeadId)
    emitAgencyCrmUpdated({ organisationId, leadId: data.sourceLeadId, mutation: 'development_lead_updated' })
  }
  clearBuyerLeadWorkspaceDataLoaderCache()
  clearAgencyLeadWorkspaceSnapshotCache()
  if (typeof window !== 'undefined') {
    const detail = { organisationId: data.sourceAgencyOrgId || data.developerOrgId, leadId: data.sourceLeadId, stockChanged, updatedAt: Date.now() }
    if (stockChanged) window.dispatchEvent(new Event('itg:developments-changed'))
    window.dispatchEvent(new Event('itg:developer-leads-changed'))
    window.dispatchEvent(new CustomEvent('bridge:buyer-lifecycle-refresh', { detail }))
    try { window.localStorage.setItem('bridge:buyer-lifecycle-refresh:v1', JSON.stringify(detail)) } catch { /* Same-tab refresh remains available. */ }
  }
}
