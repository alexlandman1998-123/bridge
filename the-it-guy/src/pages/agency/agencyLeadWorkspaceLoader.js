import {
  beginBuyerLeadWorkspaceChunkLoad,
  completeBuyerLeadWorkspaceChunkLoad,
} from '../../services/observability/buyerLeadWorkspaceChunkTrace.js'

let workspaceModulePromise = null

export function loadAgencyLeadWorkspace() {
  if (!workspaceModulePromise) {
    beginBuyerLeadWorkspaceChunkLoad()
    workspaceModulePromise = import('./AgencyPipelinePage')
      .then((module) => {
        completeBuyerLeadWorkspaceChunkLoad()
        return module
      })
      .catch((error) => {
        workspaceModulePromise = null
        throw error
      })
  }
  return workspaceModulePromise
}

export function preloadAgencyLeadWorkspace() {
  return loadAgencyLeadWorkspace().catch(() => null)
}
