import {
  BadgePercent,
  Building2,
  CreditCard,
  FileSignature,
  Handshake,
  Home,
  Mail,
  SlidersHorizontal,
  Route,
  Settings2,
  Shield,
  UserCircle2,
  Workflow,
} from 'lucide-react'
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
  { to: '/settings/partner-routing-rules', label: 'Partner Routing Rules', icon: Route },
  { to: '/settings/commission-structures', label: 'Commission Structures', icon: BadgePercent },
  { to: '/settings/developments', label: 'Developments', icon: Home },
  { to: '/settings/workflows', label: 'Workflows & Rules', icon: Workflow },
  { to: '/settings/legal-templates', label: 'Legal Templates', icon: FileSignature },
  { to: '/settings/communications/templates', label: 'Communications Templates', icon: Mail },
  { to: '/settings/users', label: 'Users & Permissions', icon: Shield },
  { to: '/settings/billing', label: 'Billing', icon: CreditCard },
]

const BOND_SETTINGS_NAV = [
  { to: '/settings', label: 'Overview', icon: Settings2, end: true },
  { to: '/settings/account', label: 'Account', icon: UserCircle2 },
  { to: '/settings/organisation', label: 'Organisation', icon: Building2 },
  { to: '/bond/automation', label: 'Automation & Rules', icon: SlidersHorizontal },
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
    }

    return () => {
      active = false
    }
  }, [role])

  const canManage = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
  })
  const baseNavItems = role === 'bond_originator' ? BOND_SETTINGS_NAV : SETTINGS_NAV
  const navItems = baseNavItems.filter((item) => {
    if (
      !canManage &&
      (item.to === '/settings/users' ||
        item.to === '/settings/billing' ||
        item.to === '/settings/commission-structures' ||
        item.to === '/settings/developments' ||
        item.to === '/settings/partner-routing-rules')
    ) {
      return false
    }
    return true
  })

  return (
    <section className="grid items-stretch gap-6 xl:grid-cols-[282px_minmax(0,1fr)]">
      <aside className="h-full rounded-[24px] border border-[#dbe4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] xl:self-stretch">
        <nav className="grid gap-1.5">
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
