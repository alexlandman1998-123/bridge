const prefetchedRoutes = new Map()
const readyRoutes = new Set()

const BLOCKED_PREFETCH_ROUTES = new Set(['/reports', '/mobile/reports'])

function normalizeRouteTarget(target = '') {
  const value = String(target || '').trim()
  if (!value) return ''
  try {
    const parsed = new URL(value, 'https://arch9.local')
    return parsed.pathname.replace(/\/$/, '') || '/'
  } catch {
    return value.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/'
  }
}

function getRouteCacheKey(target, context = {}) {
  return `${String(context.role || '')}:${normalizeRouteTarget(target)}`
}

function dashboardLoader(role = '') {
  if (role === 'bond_originator') return () => import('../pages/bond/BondDashboardPage')
  if (role === 'attorney') return () => import('../pages/AttorneyDashboardPage')
  if (role === 'client') return () => import('../pages/ClientModulePage')
  return () => import('../pages/Dashboard')
}

function resolveRouteLoader(pathname, { role = '' } = {}) {
  if (!pathname || BLOCKED_PREFETCH_ROUTES.has(pathname)) return null
  if (pathname === '/dashboard') return dashboardLoader(role)

  if (pathname.startsWith('/agent/rentals/tenancies')) return () => import('../pages/rentals/RentalTenanciesPage')
  if (pathname.startsWith('/agent/rentals/pipeline/applications')) return () => import('../pages/rentals/RentalApplicationsPage')
  if (pathname.startsWith('/agent/rentals/listings')) return () => import('../pages/rentals/RentalListingsPage')

  if (pathname.startsWith('/pipeline/canvassing')) return () => import('../pages/PipelineCanvassingPage')
  if (pathname.startsWith('/pipeline/overview')) return () => import('../pages/PipelineOverviewPage')
  if (pathname.startsWith('/pipeline/enquiries')) return () => import('../pages/AgentEnquiriesPage')
  if (pathname.startsWith('/pipeline')) return () => import('../pages/Pipeline')

  if (pathname.startsWith('/listings')) return () => import('../pages/AgentListings')
  if (pathname.startsWith('/transactions') || pathname.startsWith('/units') || pathname === '/deals') return () => import('../pages/Units')
  if (pathname.startsWith('/clients') || pathname.startsWith('/bond/clients')) return () => import('../pages/Clients')
  if (pathname.startsWith('/developer/leads')) return () => import('../pages/DeveloperLeadsPage')
  if (pathname.startsWith('/developer/partners')) return () => import('../pages/DeveloperPartnersPage')
  if (pathname.startsWith('/developments')) {
    return role === 'attorney' || role === 'bond_originator'
      ? () => import('../pages/ConveyancerDevelopments')
      : () => import('../pages/Developments')
  }
  if (pathname.startsWith('/agency/branches')) return () => import('../pages/agency/AgencyBranchesPage')
  if (pathname.startsWith('/agency/agents')) return () => import('../pages/Agents')
  if (pathname.startsWith('/agency/commission')) return () => import('../pages/settings/SettingsCommissionStructuresPage')
  if (pathname.startsWith('/partners') || pathname.startsWith('/bond/partners')) return () => import('../pages/PartnersPage')
  if (pathname.startsWith('/documents')) return () => import('../pages/Documents')
  if (pathname.startsWith('/settings')) {
    return () => Promise.all([
      import('../pages/settings/SettingsLayout'),
      import('../pages/settings/SettingsLanding'),
    ])
  }
  if (pathname.startsWith('/team')) return () => import('../pages/Team')
  if (pathname.startsWith('/bond/applications') || pathname.startsWith('/bond/transactions') || pathname.startsWith('/bond/pipeline')) return () => import('../pages/Units')
  if (pathname.startsWith('/bond/developments')) return () => import('../pages/bond/BondDevelopmentsPage')

  return null
}

export function prefetchRouteModule(target, context = {}) {
  if (typeof window === 'undefined') return Promise.resolve(false)
  const pathname = normalizeRouteTarget(target)
  const loader = resolveRouteLoader(pathname, context)
  if (!loader) return Promise.resolve(false)

  const cacheKey = getRouteCacheKey(pathname, context)
  const existing = prefetchedRoutes.get(cacheKey)
  if (existing) return existing

  const request = Promise.resolve()
    .then(loader)
    .then(() => {
      readyRoutes.add(cacheKey)
      return true
    })
    .catch((error) => {
      prefetchedRoutes.delete(cacheKey)
      if (import.meta.env.DEV) console.debug(`[PREFETCH] ${pathname} skipped`, error)
      return false
    })
  prefetchedRoutes.set(cacheKey, request)
  return request
}

export function isRouteModuleReady(target, context = {}) {
  return readyRoutes.has(getRouteCacheKey(target, context))
}

export function markRouteModuleReady(target, context = {}) {
  const pathname = normalizeRouteTarget(target)
  if (!pathname || BLOCKED_PREFETCH_ROUTES.has(pathname)) return false
  readyRoutes.add(getRouteCacheKey(pathname, context))
  return true
}

export function scheduleIdleRoutePrefetch(targets, context = {}, { delayMs = 1500, maxRoutes = 4 } = {}) {
  if (typeof window === 'undefined') return () => {}
  const uniqueTargets = [...new Set((targets || []).map(normalizeRouteTarget).filter(Boolean))]
    .filter((target) => !BLOCKED_PREFETCH_ROUTES.has(target))
    .slice(0, maxRoutes)
  if (!uniqueTargets.length) return () => {}

  let cancelled = false
  let idleHandle = null
  let delayHandle = null
  const run = async () => {
    for (const target of uniqueTargets) {
      if (cancelled) return
      await prefetchRouteModule(target, context)
    }
  }
  const schedule = () => {
    if (cancelled) return
    if ('requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(() => void run(), { timeout: 3000 })
      return
    }
    idleHandle = window.setTimeout(() => void run(), 0)
  }

  delayHandle = window.setTimeout(schedule, delayMs)
  return () => {
    cancelled = true
    if (delayHandle !== null) window.clearTimeout(delayHandle)
    if (idleHandle === null) return
    if ('cancelIdleCallback' in window) window.cancelIdleCallback(idleHandle)
    else window.clearTimeout(idleHandle)
  }
}

export const __routePrefetchTestUtils = {
  normalizeRouteTarget,
  resolveRouteLoader,
  reset: () => {
    prefetchedRoutes.clear()
    readyRoutes.clear()
  },
}
