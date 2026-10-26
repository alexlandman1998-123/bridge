import { forwardRef, useCallback } from 'react'
import {
  Link,
  useInRouterContext,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { marketingDestination } from './marketingDestination.js'

export const MarketingLink = forwardRef(function MarketingLink({ to, ...props }, ref) {
  const { pathname } = useLocation()
  return <Link {...props} ref={ref} to={marketingDestination(to, pathname)} />
})

// Listing builders can also be rendered on their own, outside a Router.
export function MarketingAnchor({ href, ...props }) {
  const inRouter = useInRouterContext()
  return inRouter
    ? <MarketingLink {...props} to={href} />
    : <a {...props} href={href} />
}

// Shared marketing routing keeps links and programmatic handoffs together.
// eslint-disable-next-line react-refresh/only-export-components
export function useMarketingNavigate() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return useCallback((to, options) => navigate(marketingDestination(to, pathname), options), [navigate, pathname])
}
