const HOME_MAPPINGS = new Set([
  '/',
  '/dashboard',
  '/agent/dashboard',
  '/principal/dashboard',
  '/attorney/dashboard',
  '/bond/dashboard',
  '/commercial',
  '/commercial/dashboard',
])

const DIRECT_MAPPINGS = Object.freeze({
  '/transactions': '/mobile/transactions',
  '/units': '/mobile/transactions',
  '/pipeline/leads': '/mobile/leads',
  '/leads': '/mobile/leads',
  '/documents': '/mobile/documents',
  '/notifications': '/mobile/notifications',
  '/attorney/matters': '/mobile/matters',
  '/attorney/transactions': '/mobile/matters',
  '/bond/applications': '/mobile/applications',
  '/bond/pipeline': '/mobile/applications',
  '/commercial/leads': '/mobile/leads',
  '/commercial/deals': '/mobile/deals',
  '/commercial/listings': '/mobile/listings',
  '/commercial/pipeline': '/mobile/pipeline',
})

const MOBILE_HOME_UNSUPPORTED = '/mobile/home?mobileNotice=unsupported'

function normalizePath(path = '') {
  const [pathname] = String(path || '').split(/[?#]/)
  const normalized = pathname.replace(/\/+$/, '') || '/'
  return normalized
}

export function isPortalOrPublicRoute(path = '') {
  const pathname = normalizePath(path)
  return (
    pathname.startsWith('/auth') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/agent/invite') ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/attorney/onboarding') ||
    pathname.startsWith('/client-access') ||
    pathname.startsWith('/client/') ||
    pathname.startsWith('/seller/') ||
    pathname.startsWith('/seller-portal') ||
    pathname.startsWith('/buyer') ||
    pathname.startsWith('/buyer-portal') ||
    pathname.startsWith('/public') ||
    pathname.startsWith('/external/') ||
    pathname.startsWith('/partner-portal') ||
    pathname.startsWith('/partners/portal') ||
    pathname.startsWith('/commercial/portal') ||
    pathname.startsWith('/commercial/onboarding') ||
    pathname.startsWith('/commercial/landlord-onboarding') ||
    pathname.startsWith('/sign/') ||
    pathname.startsWith('/appointment-rsvp') ||
    pathname.startsWith('/offers') ||
    pathname.startsWith('/transaction-invite') ||
    pathname.startsWith('/snapshot/') ||
    pathname.startsWith('/status/')
  )
}

export function mapDesktopRouteToMobile(path = '') {
  const pathname = normalizePath(path)
  if (pathname.startsWith('/mobile')) return pathname
  if (HOME_MAPPINGS.has(pathname)) return '/mobile/home'
  if (DIRECT_MAPPINGS[pathname]) return DIRECT_MAPPINGS[pathname]

  const transactionMatch = pathname.match(/^\/transactions\/([^/]+)/) || pathname.match(/^\/units\/([^/]+)/)
  if (transactionMatch?.[1]) return `/mobile/transaction/${encodeURIComponent(transactionMatch[1])}`
  const leadMatch = pathname.match(/^\/pipeline\/leads\/([^/]+)/) || pathname.match(/^\/leads\/([^/]+)/)
  if (leadMatch?.[1]) return `/mobile/lead/${encodeURIComponent(leadMatch[1])}`
  if (/^\/documents\/[^/]+/.test(pathname)) return MOBILE_HOME_UNSUPPORTED
  const matterMatch = pathname.match(/^\/attorney\/(?:matters|transactions)\/([^/]+)/)
  if (matterMatch?.[1]) return `/mobile/matter/${encodeURIComponent(matterMatch[1])}`
  const applicationMatch = pathname.match(/^\/bond\/applications\/([^/]+)/)
  if (applicationMatch?.[1]) return `/mobile/application/${encodeURIComponent(applicationMatch[1])}`
  const commercialDealMatch = pathname.match(/^\/commercial\/(?:deals|transactions)\/([^/]+)/)
  if (commercialDealMatch?.[1]) return `/mobile/deal/${encodeURIComponent(commercialDealMatch[1])}`
  const commercialLeadMatch = pathname.match(/^\/commercial\/(?:leads|leasing\/leads|sales\/leads)\/([^/]+)/)
  if (commercialLeadMatch?.[1]) return `/mobile/commercial-lead/${encodeURIComponent(commercialLeadMatch[1])}`
  const commercialListingMatch = pathname.match(/^\/commercial\/(?:listings|sales\/listings)\/([^/]+)/)
  if (commercialListingMatch?.[1]) return `/mobile/listing/${encodeURIComponent(commercialListingMatch[1])}`
  if (/^\/commercial\//.test(pathname)) return '/mobile/home?mobileNotice=unsupported'

  return MOBILE_HOME_UNSUPPORTED
}
