export const PRIMARY_ROUTE_QUERY_OWNERSHIP = Object.freeze({
  '/dashboard': Object.freeze(['principal-dashboard']),
  '/pipeline/overview': Object.freeze(['pipeline-overview']),
  '/pipeline': Object.freeze(['pipeline-board']),
  '/transactions': Object.freeze(['transaction-list']),
  '/units': Object.freeze(['transaction-list']),
  '/listings': Object.freeze(['listing-workspace']),
  '/developments': Object.freeze(['development-list']),
  '/clients': Object.freeze(['client-directory']),
  '/reports': Object.freeze([]),
  '/mobile/reports': Object.freeze([]),
})

export function getRouteQueryOwners(pathname = '') {
  const normalized = String(pathname || '').trim().replace(/\/$/, '') || '/'
  if (PRIMARY_ROUTE_QUERY_OWNERSHIP[normalized]) return PRIMARY_ROUTE_QUERY_OWNERSHIP[normalized]
  const match = Object.keys(PRIMARY_ROUTE_QUERY_OWNERSHIP)
    .filter((route) => route !== '/')
    .sort((left, right) => right.length - left.length)
    .find((route) => normalized.startsWith(`${route}/`))
  return match ? PRIMARY_ROUTE_QUERY_OWNERSHIP[match] : Object.freeze([])
}
