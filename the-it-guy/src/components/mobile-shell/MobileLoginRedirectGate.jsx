import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FEATURE_FLAGS } from '../../lib/featureFlags'
import { getDeviceType } from '../../lib/deviceDetection'
import { userPrefersDesktopOnMobile } from '../../lib/mobilePreferences'
import { clearPostLoginRedirect, resolveMobileAwareRedirect } from '../../lib/resolveMobileAwareRedirect'
import { isPortalOrPublicRoute } from '../../config/mobileRouteMappings'
import { trackMobileMetric } from '../../services/observability/monitoring'
import { useWorkspace } from '../../context/WorkspaceContext'

function buildCurrentPath(location) {
  return `${location.pathname || '/'}${location.search || ''}${location.hash || ''}`
}

function getEventName({ from = '', to = '' } = {}) {
  if (from === to) return 'mobile_redirect_skipped'
  if (isPortalOrPublicRoute(from)) return 'mobile_deep_link_preserved'
  if (to.includes('mobileNotice=unsupported')) return 'mobile_unsupported_route'
  return 'mobile_redirect_applied'
}

export default function MobileLoginRedirectGate() {
  const location = useLocation()
  const workspace = useWorkspace()
  const currentPath = buildCurrentPath(location)
  const deviceType = getDeviceType()
  const preferDesktopOnMobile = userPrefersDesktopOnMobile()
  const finalPath = resolveMobileAwareRedirect({
    intendedPath: currentPath,
    user: workspace,
    deviceType,
    featureFlags: FEATURE_FLAGS,
    userPreference: { preferDesktopOnMobile },
  })

  if (finalPath !== currentPath) {
    const eventName = getEventName({ from: currentPath, to: finalPath })
    void trackMobileMetric(eventName, {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: location.pathname,
      metadata: {
        role: workspace.role || workspace.baseRole || '',
        module: workspace.workspaceType || '',
        deviceType,
        sourceRoute: location.pathname,
        destinationRoute: finalPath.split(/[?#]/)[0],
        mobileShellEnabled: FEATURE_FLAGS.enableMobileShell,
        mobileLoginRedirectEnabled: FEATURE_FLAGS.enableMobileLoginRedirect,
        preferDesktopOnMobile,
      },
    })
    clearPostLoginRedirect()
    return <Navigate to={finalPath} replace />
  }

  if (FEATURE_FLAGS.enableMobileLoginRedirect && deviceType === 'mobile') {
    void trackMobileMetric(getEventName({ from: currentPath, to: finalPath }), {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: location.pathname,
      metadata: {
        role: workspace.role || workspace.baseRole || '',
        module: workspace.workspaceType || '',
        deviceType,
        sourceRoute: location.pathname,
        destinationRoute: finalPath.split(/[?#]/)[0],
        mobileShellEnabled: FEATURE_FLAGS.enableMobileShell,
        mobileLoginRedirectEnabled: FEATURE_FLAGS.enableMobileLoginRedirect,
        preferDesktopOnMobile,
      },
    })
  }

  return <Outlet />
}
