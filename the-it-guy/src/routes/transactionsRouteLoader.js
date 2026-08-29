let transactionsRouteModulePromise = null
let transactionsListApiPromise = null
let agentTransactionsTableModulePromise = null

export function loadTransactionsRouteModule() {
  transactionsRouteModulePromise ||= import('../pages/Units')
  return transactionsRouteModulePromise
}

function loadTransactionsListApi() {
  transactionsListApiPromise ||= import('../lib/transactionsListApi')
  return transactionsListApiPromise
}

export function loadAgentTransactionsTableModule() {
  if (!agentTransactionsTableModulePromise) {
    agentTransactionsTableModulePromise = import('../components/AgentTransactionsTable').catch((error) => {
      agentTransactionsTableModulePromise = null
      throw error
    })
  }
  return agentTransactionsTableModulePromise
}

export function preloadAgentTransactionsRoute({
  userId = '',
  organisationId = '',
  identityContext = {},
  principalView = false,
} = {}) {
  const routePromise = loadTransactionsRouteModule()
  const tablePromise = loadAgentTransactionsTableModule()
  const apiPromise = loadTransactionsListApi()
  if (!userId || !organisationId) {
    return Promise.all([routePromise, tablePromise, apiPromise]).then(([routeModule]) => routeModule)
  }
  const dataPromise = apiPromise.then((api) => api.preloadTransactionsListApi({
    mode: principalView ? 'organisation' : 'participant',
    userId,
    roleType: 'agent',
    organisationId,
    identityContext,
    activeTransactionsOnly: true,
    stage: 'all',
    financeType: 'all',
  }))
  return Promise.all([routePromise, tablePromise, dataPromise]).then(([routeModule]) => routeModule)
}
