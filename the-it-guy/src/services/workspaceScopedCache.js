import { clearOrganisationRuntimeCache } from '../lib/organisationBootstrapApi'

const WORKSPACE_SCOPED_STORAGE_PREFIXES = Object.freeze([
  'itg:agency-pipeline:v1:',
  'itg:agency-canvassing:v1:',
  'itg:agent-demo-transactions:v1',
])

export function clearWorkspaceScopedRuntimeCaches() {
  clearOrganisationRuntimeCache()

  if (typeof window === 'undefined' || !window.localStorage) {
    return { clearedLocalStorageKeys: 0 }
  }

  const keys = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key && WORKSPACE_SCOPED_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keys.push(key)
    }
  }

  for (const key of keys) {
    window.localStorage.removeItem(key)
  }

  window.dispatchEvent(new CustomEvent('bridge:workspace-scoped-cache-cleared', {
    detail: { clearedLocalStorageKeys: keys.length },
  }))

  return { clearedLocalStorageKeys: keys.length }
}
