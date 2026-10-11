// Install before the router mounts: a router pop listener can synchronously
// unmount an editor before a listener registered by that editor gets called.
// Keep the bridge through hot reloads; editors remove their own subscriptions.
const state = import.meta.hot?.data?.listingNavigationGuard || { guards: new Set() }
if (!state.listener && typeof window !== 'undefined') {
  state.listener = event => {
    for (const guard of state.guards) if (guard(event)) break
  }
  window.addEventListener('popstate', state.listener, true)
}
if (typeof import.meta.hot?.dispose === 'function') import.meta.hot.dispose(data => { data.listingNavigationGuard = state })

export function registerListingNavigationGuard(guard) {
  state.guards.add(guard)
  return () => state.guards.delete(guard)
}
