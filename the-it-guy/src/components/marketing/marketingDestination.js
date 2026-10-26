import { mapDesktopRouteToMobile } from '../../config/mobileRouteMappings'

const MOBILE_MARKETING = /^\/mobile\/marketing(?:\/|$)/

function mobilePath(path) {
  // Translate only routes with an existing mobile workspace. Other destinations
  // (including public RSVP pages and integration setup) keep their own route.
  const [pathname] = path.split(/[?#]/)
  const supported = pathname === '/marketing' || pathname === '/marketing/' ||
    /^\/(?:pipeline\/)?leads(?:\/[^/]+)?\/?$/.test(pathname) ||
    /^\/agent\/listings\/[^/]+\/?$/.test(pathname) ||
    /^\/listings(?:\/new|\/[^/]+\/edit)?\/?$/.test(pathname)
  if (!supported) return path
  const suffix = path.slice(pathname.length)
  return `${mapDesktopRouteToMobile(pathname)}${suffix}`
}

export function marketingDestination(to, currentPathname) {
  if (!MOBILE_MARKETING.test(currentPathname || '')) return to
  if (typeof to === 'string') return mobilePath(to)
  if (!to || typeof to !== 'object' || typeof to.pathname !== 'string') return to
  const pathname = mobilePath(to.pathname)
  return pathname === to.pathname ? to : { ...to, pathname }
}
