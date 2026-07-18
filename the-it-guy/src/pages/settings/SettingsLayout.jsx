import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { buildVisibleSettingsGroups } from './settingsNavigation'

function SettingsNavigation({ groups, onNavigate }) {
  if (!groups.length) {
    return (
      <div className="rounded-[12px] border border-dashed border-[#d6e2ee] bg-[#f9fbfe] p-4 text-sm font-medium text-[#6b7d93]">
        No settings are available for this workspace.
      </div>
    )
  }

  return (
    <nav className="grid gap-4" aria-label="Settings navigation">
      {groups.map((group) => (
        <div key={group.label} className="grid gap-1">
          <p className="px-2 text-[0.68rem] font-bold uppercase tracking-[0.12em] text-[#8493a8]">{group.label}</p>
          {group.items.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end
                onClick={onNavigate}
                className={({ isActive }) =>
                  [
                    'flex min-h-9 items-center gap-2.5 rounded-[10px] px-3 text-sm font-semibold transition duration-150 ease-out',
                    isActive
                      ? 'bg-[#eaf7f1] text-[#0f7f4f] shadow-[inset_0_0_0_1px_rgba(15,127,79,0.1)]'
                      : 'text-[#52667d] hover:bg-white hover:text-[#162334] hover:shadow-[0_6px_16px_rgba(15,23,42,0.04)]',
                  ].join(' ')
                }
              >
                <Icon size={15} strokeWidth={1.9} />
                <span className="truncate">{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

export default function SettingsLayout() {
  const {
    can,
    role,
    currentWorkspace,
    organisationMembershipRole,
    workspaceRole,
    workspaceType,
  } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const membershipRole = normalizeOrganisationMembershipRole(organisationMembershipRole || workspaceRole || 'viewer', {
    appRole: role,
    workspaceType: resolvedWorkspaceType,
  })

  const canManage = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
    workspaceType: resolvedWorkspaceType,
  })
  const navGroups = buildVisibleSettingsGroups({ role, canManage, can })
  const workspaceName = currentWorkspace?.name || currentWorkspace?.organisationName || 'Personal workspace'
  const membershipLabel = membershipRole.replaceAll('_', ' ')

  return (
    <section className="settings-shell min-h-[calc(100vh-96px)] pb-10 pt-1">
      <div className="mx-auto grid w-full max-w-[1420px] gap-6">
        <header className="settings-shell-heading flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-[#718499]">Settings</p>
            <h1 className="mt-1 truncate text-[2rem] font-semibold leading-tight tracking-[-0.035em] text-[#111827]">{workspaceName}</h1>
            <p className="mt-1 text-sm text-[#6b7280]">Manage your personal preferences and workspace configuration.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-medium">
            <span className="rounded-full bg-[#eaf6f0] px-3 py-1.5 capitalize text-[#176c4b]">{membershipLabel}</span>
            <span className="rounded-full bg-[#f0f3f6] px-3 py-1.5 capitalize text-[#667085]">{resolvedWorkspaceType.replaceAll('_', ' ') || 'workspace'}</span>
          </div>
        </header>

        <div className="flex items-center justify-between lg:hidden">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#d8e3ee] bg-white px-4 text-sm font-semibold text-[#24364b] shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:bg-[#f7fafc]"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
            aria-controls="mobile-settings-navigation"
          >
            {mobileNavOpen ? <X size={15} /> : <Menu size={15} />}
            Settings sections
          </button>
        </div>
        {mobileNavOpen ? (
          <aside id="mobile-settings-navigation" className="rounded-[18px] border border-[#dde7f0] bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)] lg:hidden">
            <SettingsNavigation groups={navGroups} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[248px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="settings-secondary-nav sticky top-4 border-r border-[#e8edf2] py-2 pr-5">
              <SettingsNavigation groups={navGroups} />
            </div>
          </aside>

          <main className="settings-content min-w-0">
            <Outlet />
          </main>
        </div>
      </div>
    </section>
  )
}
