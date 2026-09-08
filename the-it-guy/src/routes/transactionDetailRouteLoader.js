let modulePromise

export function loadTransactionDetailRouteModule() {
  if (!modulePromise) {
    modulePromise = import('../pages/AttorneyTransactionDetail.jsx').catch(error => {
      modulePromise = undefined
      throw error
    })
  }
  return modulePromise
}

// Warm only the code bundle. Matter data still requires the normal access checks.
export function preloadTransactionDetailRoute() {
  void loadTransactionDetailRouteModule().catch(() => {})
}
