import { Suspense, useMemo } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings } from '../../lib/organisationAccess'
import { buildVisibleSettingsGroups } from './settingsNavigation'
import { SettingsLoadingState } from './settingsUi'

function normalizeHashRoute(value = '') {
  const [path = '', hash = ''] = String(value || '').split('#')
  return { path, hash: hash ? `#${hash}` : '' }
}

function targetMatchesLocation(location, target = '') {
  const { path, hash } = normalizeHashRoute(target)
  const pathname = location.pathname || ''
  if (pathname !== path && !pathname.startsWith(`${path}/`)) return false
  if (!hash) return true
  return location.hash === hash
}

function SettingsSidebar() {
  const location = useLocation()
  const workspaceContext = useWorkspace()
  const { can, role, currentWorkspace, organisationMembershipRole, workspaceRole, workspaceType } = workspaceContext
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const membershipRole = organisationMembershipRole || workspaceRole || 'viewer'
  const canManage = canManageOrganisationSettings({ appRole: role, membershipRole, workspaceType: resolvedWorkspaceType })
  const groups = useMemo(
    () => buildVisibleSettingsGroups({ role, canManage, can: typeof can === 'function' ? can : () => true }),
    [can, canManage, role],
  )

  return (
    <aside className="settings-workspace-sidebar" aria-label="Settings navigation">
      <div className="settings-workspace-sidebar-header">
        <NavLink to="/settings" className="settings-workspace-title">Settings</NavLink>
        <span className="settings-workspace-context">{currentWorkspace?.name || 'Workspace'}</span>
      </div>

      <details className="settings-workspace-mobile-nav">
        <summary>Settings menu</summary>
        <div className="settings-workspace-mobile-nav-body">
          {groups.map((group) => (
            <div key={group.label} className="settings-workspace-nav-group">
              <p>{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon
                const active = targetMatchesLocation(location, item.to)
                return (
                  <NavLink key={item.to} to={item.to} className={`settings-workspace-nav-link ${active ? 'active' : ''}`.trim()}>
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}
        </div>
      </details>

      <nav className="settings-workspace-nav" aria-label="Settings sections">
        {groups.map((group) => (
          <div key={group.label} className="settings-workspace-nav-group">
            <p>{group.label}</p>
            {group.items.map((item) => {
              const Icon = item.icon
              const active = targetMatchesLocation(location, item.to)
              return (
                <NavLink key={item.to} to={item.to} className={`settings-workspace-nav-link ${active ? 'active' : ''}`.trim()}>
                  <Icon size={16} />
                  <span>{item.label}</span>
                </NavLink>
              )
            })}
          </div>
        ))}
      </nav>
    </aside>
  )
}

export default function SettingsLayout() {
  return (
    <section className="settings-shell min-h-[calc(100vh-96px)] pb-12 pt-0">
      <div className="settings-workspace mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <SettingsSidebar />
        <main className="settings-content min-w-0">
          <Suspense fallback={<SettingsLoadingState label="Loading settings section..." compact />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </section>
  )
}
