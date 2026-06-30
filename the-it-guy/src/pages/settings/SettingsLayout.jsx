import {
  Bell,
  Building2,
  ClipboardList,
  FileSignature,
  Handshake,
  KeyRound,
  Mail,
  PlugZap,
  SlidersHorizontal,
  Shield,
  User,
  UserCircle2,
  Workflow,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings } from '../../lib/settingsApi'

const SETTINGS_NAV_GROUPS = [
  {
    label: 'Account',
    items: [
      { to: '/settings/profile', label: 'Profile', icon: UserCircle2 },
      { to: '/settings/security', label: 'Security', icon: Shield },
      { to: '/settings/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Organisation',
    items: [
      { to: '/settings/organisation', label: 'Organisation', icon: Building2 },
      { to: '/settings/preferred-partners', label: 'Preferred Partners', icon: Handshake },
      { to: '/settings/legal-templates', label: 'Legal Templates', icon: FileSignature },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/settings/lead-capture', label: 'Lead Capture', icon: Mail },
      { to: '/settings/workflows', label: 'Workflows & Rules', icon: Workflow },
      { to: '/settings/communications/templates', label: 'Communications Templates', icon: Mail },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings/integrations', label: 'Integrations', icon: PlugZap },
      { to: '/settings/audit-log', label: 'Audit Log', icon: ClipboardList },
    ],
  },
]

const BOND_SETTINGS_NAV_GROUPS = [
  {
    label: 'Account',
    items: [
      { to: '/settings/profile', label: 'Profile', icon: UserCircle2 },
      { to: '/settings/security', label: 'Security', icon: Shield },
      { to: '/settings/notifications', label: 'Notifications', icon: Bell },
    ],
  },
  {
    label: 'Organisation',
    items: [
      { to: '/settings/organisation', label: 'Organisation', icon: Building2 },
    ],
  },
  {
    label: 'Platform',
    items: [
      { to: '/settings/automation', label: 'Automation & Rules', icon: SlidersHorizontal },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings/integrations', label: 'Integrations', icon: PlugZap },
      { to: '/settings/audit-log', label: 'Audit Log', icon: ClipboardList },
    ],
  },
]

function getInitials(name = '') {
  return String(name || 'User')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

export default function SettingsLayout() {
  const { role, currentWorkspace, workspaceType, profile } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [membershipRole, setMembershipRole] = useState('viewer')

  useEffect(() => {
    let active = true

    async function loadMembershipRole() {
      try {
        const context = await fetchOrganisationSettings()
        if (!active) return
        setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole, {
          appRole: role,
          workspaceType: context?.organisation?.type || resolvedWorkspaceType,
        }))
      } catch {
        if (active) {
          setMembershipRole('viewer')
        }
      }
    }

    if (role !== 'client') {
      void loadMembershipRole()
    }

    return () => {
      active = false
    }
  }, [role, resolvedWorkspaceType])

  const canManage = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
    workspaceType: resolvedWorkspaceType,
  })
  const baseNavGroups = role === 'bond_originator' ? BOND_SETTINGS_NAV_GROUPS : SETTINGS_NAV_GROUPS
  const navGroups = baseNavGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!canManage && ['/settings/users', '/settings/billing', '/settings/commission-structures', '/settings/developments', '/settings/partner-routing-rules'].includes(item.to)) {
          return false
        }
        return true
      }),
    }))
    .filter((group) => group.items.length)
  const displayName = [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.fullName || profile?.name || profile?.email || 'Arch9 User'
  const roleLabel = String(membershipRole || role || 'Member').replace(/_/g, ' ')

  return (
    <section className="grid min-h-[calc(100vh-96px)] gap-6 xl:grid-cols-[268px_minmax(0,1fr)]">
      <aside className="h-full rounded-[20px] border border-[#dbe4ee] bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.05)] xl:self-stretch">
        <NavLink
          to="/settings"
          end
          className={({ isActive }) =>
            [
              'mb-5 flex items-center gap-3 rounded-[14px] border px-3 py-3 transition duration-150 ease-out',
              isActive ? 'border-[#bcd8ca] bg-[#eef8f2]' : 'border-[#e4ebf2] bg-white hover:bg-[#f8fbff]',
            ].join(' ')
          }
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#178657] text-sm font-semibold text-white">
            {getInitials(displayName)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-[#162334]">{displayName}</span>
            <span className="block truncate text-xs font-normal capitalize text-[#607387]">{roleLabel}</span>
          </span>
        </NavLink>

        <nav className="grid gap-6">
          {navGroups.map((group) => (
            <div key={group.label} className="grid gap-1.5">
              <p className="px-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[#7b8da6]">{group.label}</p>
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      [
                        'flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm font-medium transition duration-150 ease-out',
                        isActive
                          ? 'bg-[#eaf7ef] text-[#0f7f4f]'
                          : 'text-[#42566d] hover:bg-[#f7fbff] hover:text-[#162334]',
                      ].join(' ')
                    }
                  >
                    <Icon size={16} strokeWidth={1.8} />
                    <span>{item.label}</span>
                  </NavLink>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <Outlet />
      </div>
    </section>
  )
}
