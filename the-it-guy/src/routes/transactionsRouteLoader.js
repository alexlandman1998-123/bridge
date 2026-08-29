let transactionsRouteModulePromise = null
let transactionsListApiPromise = null

export function loadTransactionsRouteModule() {
  transactionsRouteModulePromise ||= import('../pages/Units')
  return transactionsRouteModulePromise
}

function loadTransactionsListApi() {
  transactionsListApiPromise ||= import('../lib/transactionsListApi')
  return transactionsListApiPromise
}

export function preloadAgentTransactionsRoute({
  userId = '',
  organisationId = '',
  identityContext = {},
  principalView = false,
} = {}) {
  const routePromise = loadTransactionsRouteModule()
  if (!userId || !organisationId) return routePromise
  const dataPromise = loadTransactionsListApi().then((api) => api.preloadTransactionsListApi({
    mode: principalView ? 'organisation' : 'participant',
    userId,
    roleType: 'agent',
    organisationId,
    identityContext,
    activeTransactionsOnly: true,
    stage: 'all',
    financeType: 'all',
  }))
  return Promise.all([routePromise, dataPromise])
}
