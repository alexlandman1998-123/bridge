import { Building2, CreditCard, Handshake, Home, Settings2, Shield, UserCircle2, Workflow } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings } from '../../lib/settingsApi'

const SETTINGS_NAV = [
  { to: '/settings', label: 'Overview', icon: Settings2, end: true },
  { to: '/settings/account', label: 'Account', icon: UserCircle2 },
  { to: '/settings/organisation', label: 'Organisation', icon: Building2 },
  { to: '/settings/preferred-partners', label: 'Preferred Partners', icon: Handshake },
  { to: '/settings/developments', label: 'Developments', icon: Home },
  { to: '/settings/workflows', label: 'Workflows & Rules', icon: Workflow },
  { to: '/settings/users', label: 'Users & Permissions', icon: Shield },
  { to: '/settings/billing', label: 'Billing', icon: CreditCard },
]

export default function SettingsLayout() {
  const { role } = useWorkspace()
  const [membershipRole, setMembershipRole] = useState('viewer')

  useEffect(() => {
    let active = true

    async function loadMembershipRole() {
      try {
        const context = await fetchOrganisationSettings()
        if (!active) return
        setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole))
      } catch {
        if (active) {
          setMembershipRole('viewer')
        }
      }
    }

    if (role === 'agent' || role === 'developer') {
      void loadMembershipRole()
    } else {
      setMembershipRole('viewer')
    }

    return () => {
      active = false
    }
  }, [role])

  const canManage = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
  })
  const navItems = SETTINGS_NAV.filter((item) => {
    if (!canManage && (item.to === '/settings/users' || item.to === '/settings/billing')) {
      return false
    }
    return true
  })

  return (
    <section className="grid gap-6 xl:grid-cols-[282px_minmax(0,1fr)]">
      <aside className="rounded-[24px] border border-[#dbe4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] xl:sticky xl:top-5 xl:h-[calc(100vh-2.5rem)] xl:self-start">
        <div className="space-y-3 border-b border-[#e8eef5] pb-5">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-[#162334]">Settings</h1>
            <p className="text-sm leading-6 text-[#6b7d93]">Configuration for account, organisation, developments, and platform defaults.</p>
          </div>
          <span className="inline-flex rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[#6b7d93]">
            {role.replaceAll('_', ' ')}
          </span>
          <span className="inline-flex rounded-full border border-[#dbe5ef] bg-[#f8fbff] px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-[#6b7d93]">
            {canManage ? 'Organisation Admin' : 'Read Only'}
          </span>
        </div>

        <nav className="mt-5 grid gap-1.5">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-3 rounded-[14px] px-4 py-2.5 text-sm font-semibold transition duration-150 ease-out',
                    isActive
                      ? 'border border-[#c8d7e6] bg-[#edf3f8] text-[#162334]'
                      : 'border border-transparent text-[#5f7288] hover:border-[#e1e8f0] hover:bg-[#f8fbff] hover:text-[#162334]',
                  ].join(' ')
                }
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      </aside>

      <div className="min-w-0">
        <Outlet />
      </div>
    </section>
  )
}
