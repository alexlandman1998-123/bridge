let leadListRouteModulePromise = null
let leadWorkspaceRouteModulePromise = null
let leadReadRepositoryPromise = null

function loadLeadReadRepository() {
  if (!leadReadRepositoryPromise) {
    leadReadRepositoryPromise = import('../pages/agency/agencyLeadListReadRepository').catch((error) => {
      leadReadRepositoryPromise = null
      throw error
    })
  }
  return leadReadRepositoryPromise
}

export function loadAgencyLeadListRouteModule() {
  if (!leadListRouteModulePromise) {
    leadListRouteModulePromise = import('../pages/agency/AgencyLeadListRoutePage').catch((error) => {
      leadListRouteModulePromise = null
      throw error
    })
  }
  return leadListRouteModulePromise
}

export function loadAgencyLeadWorkspaceRouteModule() {
  if (!leadWorkspaceRouteModulePromise) {
    leadWorkspaceRouteModulePromise = import('../pages/agency/AgencyLeadWorkspaceRoutePage').catch((error) => {
      leadWorkspaceRouteModulePromise = null
      throw error
    })
  }
  return leadWorkspaceRouteModulePromise
}

export function preloadAgencyLeadsRoute({ organisationId = '' } = {}) {
  const routePromise = loadAgencyLeadListRouteModule()
  const repositoryPromise = loadLeadReadRepository()
  const dataPromise = organisationId
    ? repositoryPromise.then((repository) => repository.preloadAgencyLeadListRecords(organisationId))
    : Promise.resolve(null)
  return Promise.all([routePromise, repositoryPromise, dataPromise]).then(([routeModule]) => routeModule)
}

export function preloadAgencyLeadWorkspaceRoute({ organisationId = '', leadId = '' } = {}) {
  const routePromise = loadAgencyLeadWorkspaceRouteModule()
  const repositoryPromise = loadLeadReadRepository()
  const dataPromise = organisationId && leadId
    ? repositoryPromise.then((repository) => repository.preloadAgencyLeadCoreRecord(organisationId, leadId))
    : Promise.resolve(null)
  return Promise.all([routePromise, repositoryPromise, dataPromise]).then(([routeModule]) => routeModule)
}
