let transactionsRouteModulePromise = null

export function loadTransactionsRouteModule() {
  transactionsRouteModulePromise ||= import('../pages/Units')
  return transactionsRouteModulePromise
}

export function preloadAgentTransactionsRoute() {
  return loadTransactionsRouteModule()
}
