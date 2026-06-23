import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FEATURE_FLAGS } from '../../lib/featureFlags'
import { userCanAccessMobile, getDesktopLandingRoute } from '../../lib/mobileAccess'
import { trackMobileMetric } from '../../services/observability/monitoring'
import { useWorkspace } from '../../context/WorkspaceContext'

export default function MobileRouteGuard() {
  const location = useLocation()
  const workspace = useWorkspace()
  const destination = getDesktopLandingRoute(workspace)
  const allowed = FEATURE_FLAGS.enableMobileShell && userCanAccessMobile(workspace)

  if (!allowed) {
    void trackMobileMetric(FEATURE_FLAGS.enableMobileShell ? 'mobile_redirect_skipped' : 'mobile_shell_disabled', {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: location.pathname,
      metadata: {
        role: workspace.role || workspace.baseRole || '',
        sourceRoute: location.pathname,
        destinationRoute: destination,
        mobileShellEnabled: FEATURE_FLAGS.enableMobileShell,
      },
    })
    return <Navigate to={destination} replace />
  }

  return <Outlet />
}
