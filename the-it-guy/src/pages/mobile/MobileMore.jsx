import { Building2, CircleHelp, FileText, Inbox, ListChecks, LogOut, Search, Settings, UserCircle } from 'lucide-react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { MobileCard } from '../../components/mobile-shell/MobileShellStates'
import { FEATURE_FLAGS } from '../../lib/featureFlags'
import { getDeviceType } from '../../lib/deviceDetection'
import { getDesktopLandingRoute } from '../../lib/mobileAccess'
import { setPreferDesktopOnMobile, userPrefersDesktopOnMobile } from '../../lib/mobilePreferences'
import { trackMobileMetric } from '../../services/observability/monitoring'

const MORE_ITEMS = [
  { key: 'search', label: 'Search', icon: Search, meta: 'Find work fast', to: '/mobile/search' },
  { key: 'inbox', label: 'Inbox', icon: Inbox, meta: 'Messages and notifications', to: '/mobile/inbox' },
  { key: 'documents', label: 'Documents', icon: FileText, meta: 'Upload and review', to: '/mobile/documents' },
  { key: 'tasks', label: 'Tasks', icon: ListChecks, meta: 'Complete mobile tasks', to: '/mobile/tasks' },
  { key: 'profile', label: 'Profile', icon: UserCircle, meta: 'Account details' },
  { key: 'organisation', label: 'Organisation', icon: Building2, meta: 'Workspace context' },
  { key: 'settings', label: 'Settings', icon: Settings, meta: 'Mobile-safe settings' },
  { key: 'help', label: 'Help', icon: CircleHelp, meta: 'Support and guidance' },
]

export default function MobileMore() {
  const workspace = useWorkspace()
  const navigate = useNavigate()
  const { onLogout } = useOutletContext() || {}
  const profileName = workspace.profile?.fullName || [workspace.profile?.firstName, workspace.profile?.lastName].filter(Boolean).join(' ') || 'Arch9 user'
  const workspaceName = workspace.workspace?.name || 'Workspace'
  const prefersDesktop = userPrefersDesktopOnMobile()
  const desktopLandingRoute = getDesktopLandingRoute(workspace)

  async function handleLogout() {
    await Promise.resolve(onLogout?.())
    navigate('/auth', { replace: true })
  }

  function handleOpenDesktopVersion() {
    setPreferDesktopOnMobile(true)
    void trackMobileMetric('mobile_desktop_fallback_clicked', {
      userId: workspace.profile?.id || '',
      workspaceId: workspace.currentWorkspace?.id || workspace.workspace?.id || '',
      route: '/mobile/more',
      metadata: {
        role: workspace.role || workspace.baseRole || '',
        module: workspace.workspaceType || '',
        deviceType: getDeviceType(),
        sourceRoute: '/mobile/more',
        destinationRoute: desktopLandingRoute,
        mobileShellEnabled: FEATURE_FLAGS.enableMobileShell,
        mobileLoginRedirectEnabled: FEATURE_FLAGS.enableMobileLoginRedirect,
      },
    })
    navigate(desktopLandingRoute, { replace: true })
  }

  function handleUseMobileVersion() {
    setPreferDesktopOnMobile(false)
    navigate('/mobile/home', { replace: true })
  }

  return (
    <div className="space-y-4">
      <MobileCard className="bg-[#10243a] text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-lg font-semibold text-white">
            {profileName.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold text-white">{profileName}</h1>
            <p className="mt-1 truncate text-sm text-[#dce8f2]">{workspaceName}</p>
          </div>
        </div>
      </MobileCard>

      <section className="space-y-2">
        {MORE_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              className="flex min-h-[64px] w-full items-center gap-3 rounded-[20px] border border-[#e4ebf2] bg-white px-4 text-left shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
              onClick={item.to ? () => navigate(item.to) : undefined}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf8f2] text-[#1f7a5a]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#10243a]">{item.label}</span>
                <span className="block text-xs text-[#60758d]">{item.meta}</span>
              </span>
            </button>
          )
        })}
      </section>

      {FEATURE_FLAGS.allowDesktopFallbackOnMobile ? (
        <section className="space-y-2">
          <button
            type="button"
            className="flex min-h-[56px] w-full items-center justify-center rounded-[20px] border border-[#d7e0ea] bg-white px-4 text-sm font-semibold text-[#10243a]"
            onClick={handleOpenDesktopVersion}
          >
            Open Desktop Version
          </button>
          {prefersDesktop ? (
            <button
              type="button"
              className="flex min-h-[56px] w-full items-center justify-center rounded-[20px] bg-[#1f7a5a] px-4 text-sm font-semibold text-white"
              onClick={handleUseMobileVersion}
            >
              Use Mobile Version
            </button>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        className="flex min-h-[56px] w-full items-center justify-center gap-2 rounded-[20px] border border-[#f3d4d1] bg-white text-sm font-semibold text-[#b42318]"
        onClick={handleLogout}
      >
        <LogOut className="h-4 w-4" />
        Logout
      </button>
    </div>
  )
}
