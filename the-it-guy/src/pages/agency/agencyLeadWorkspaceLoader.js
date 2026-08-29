let workspaceModulePromise = null

export function loadAgencyLeadWorkspace() {
  if (!workspaceModulePromise) {
    workspaceModulePromise = import('./AgencyPipelinePage').catch((error) => {
      workspaceModulePromise = null
      throw error
    })
  }
  return workspaceModulePromise
}

export function preloadAgencyLeadWorkspace() {
  return loadAgencyLeadWorkspace().catch(() => null)
}
