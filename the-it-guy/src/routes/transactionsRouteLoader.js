let transactionsRouteModulePromise = null
let transactionsListApiPromise = null
let agentTransactionsTableModulePromise = null

export function loadTransactionsRouteModule() {
  // The Transactions route renders AgentTransactionsTable immediately after its
  // first data response. Loading the page without its table creates a second
  // Suspense handoff on cold navigation, which visibly replaces the route
  // shell just before the workspace appears. Keep both chunks in the same
  // route-load boundary so the shell is shown once, consistently.
  transactionsRouteModulePromise ||= Promise.all([
    import('../pages/Units'),
    loadAgentTransactionsTableModule(),
  ]).then(([routeModule]) => routeModule)
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
