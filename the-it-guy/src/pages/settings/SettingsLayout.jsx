import {
  BadgePercent,
  Bell,
  Building2,
  Code2,
  CreditCard,
  Mail,
  Menu,
  Palette,
  PlugZap,
  Shield,
  UserCircle2,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchOrganisationSettings } from '../../lib/settingsApi'

const SETTINGS_NAV_GROUPS = [
  {
    label: 'ACCOUNT',
    items: [
      {
        to: '/settings/profile',
        label: 'Profile',
        icon: UserCircle2,
        keywords: 'account personal information avatar photo job title bio language timezone preferences fields',
      },
      {
        to: '/settings/security',
        label: 'Security',
        icon: Shield,
        keywords: 'password mfa sessions devices permissions authentication',
      },
      {
        to: '/settings/notifications',
        label: 'Notifications',
        icon: Bell,
        keywords: 'email push sms alerts messages workflow documents',
      },
    ],
  },
  {
    label: 'WORKSPACE',
    items: [
      {
        to: '/settings/organisation',
        label: 'Organisation',
        icon: Building2,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        keywords: 'company agency principal branches permissions visibility governance',
      },
      {
        to: '/settings/branding',
        label: 'Branding',
        icon: Palette,
        roles: ['developer', 'agent', 'attorney', 'bond_originator'],
        keywords: 'logo colours colors brand portal reports primary icon dark',
      },
      {
        to: '/settings/commission',
        label: 'Commission',
        icon: BadgePercent,
        roles: ['developer', 'agent'],
        requiresManage: true,
        keywords: 'commission splits targets referrals overrides templates finance agency performance',
      },
      {
        to: '/settings/users',
        label: 'Users',
        icon: UsersRound,
        roles: ['developer', 'agent'],
        requiresManage: true,
        keywords: 'members team roles invites access permissions',
      },
    ],
  },
  {
    label: 'PLATFORM',
    items: [
      {
        to: '/settings/billing',
        label: 'Billing',
        icon: CreditCard,
        roles: ['developer', 'agent'],
        requiresManage: true,
        keywords: 'billing subscription invoices plan entitlements usage',
      },
      {
        to: '/settings/integrations',
        label: 'Integrations',
        icon: PlugZap,
        keywords: 'connected services property24 whatsapp resend google supabase integrations',
      },
      {
        to: '/settings/lead-capture',
        label: 'Lead Capture',
        icon: Mail,
        roles: ['agent'],
        keywords: 'lead capture forwarding addresses agent activation inbound enquiry health property24 private property website parser review queue',
      },
      {
        to: '/settings/api',
        label: 'API',
        icon: Code2,
        keywords: 'api keys webhooks developer access integrations platform',
      },
    ],
  },
  {
    label: 'ADVANCED',
    items: [
      {
        to: '/settings/audit-log',
        label: 'Developer',
        icon: Code2,
        keywords: 'developer audit log advanced events diagnostics platform',
      },
      {
        to: '/settings/danger-zone',
        label: 'Danger Zone',
        icon: X,
        keywords: 'danger zone account deletion destructive controls',
      },
    ],
  },
]

function canShowSettingsItem(item, { role, canManage }) {
  if (item.roles && !item.roles.includes(role)) return false
  if (item.requiresManage && !canManage) return false
  return true
}

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
  const { role, currentWorkspace, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    let active = true

    async function loadSettingsContext() {
      try {
        const context = role === 'client' ? null : await fetchOrganisationSettings().catch(() => null)
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

    void loadSettingsContext()
    return () => {
      active = false
    }
  }, [role, resolvedWorkspaceType])

  const canManage = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
    workspaceType: resolvedWorkspaceType,
  })
  const navGroups = useMemo(
    () =>
      SETTINGS_NAV_GROUPS
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => canShowSettingsItem(item, { role, canManage })),
        }))
        .filter((group) => group.items.length),
    [canManage, role],
  )

  return (
    <section className="min-h-[calc(100vh-96px)] pt-1">
      <div className="mx-auto grid w-full max-w-[1240px] gap-4">
        <div className="lg:hidden">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-[12px] border border-[#d8e3ee] bg-white px-4 text-sm font-semibold text-[#24364b] shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:bg-[#f7fafc]"
            onClick={() => setMobileNavOpen((open) => !open)}
            aria-expanded={mobileNavOpen}
          >
            {mobileNavOpen ? <X size={15} /> : <Menu size={15} />}
            Settings sections
          </button>
        </div>
        {mobileNavOpen ? (
          <aside className="rounded-[16px] border border-[#dde7f0] bg-[#fbfcfe] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:hidden">
            <SettingsNavigation groups={navGroups} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-4 rounded-[18px] border border-[#dde7f0] bg-[#fbfcfe] p-3 shadow-[0_12px_30px_rgba(15,23,42,0.045)]">
              <SettingsNavigation groups={navGroups} />
            </div>
          </aside>

          <main className="min-w-0 pb-8">
            <Outlet />
          </main>
        </div>
      </div>
    </section>
  )
}
