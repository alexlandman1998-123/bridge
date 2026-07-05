import {
  BadgePercent,
  Bell,
  Building2,
  Code2,
  CreditCard,
  FileText,
  HelpCircle,
  Library,
  Mail,
  Menu,
  Palette,
  PlugZap,
  Search,
  Shield,
  UserCircle2,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchAccountSettings, fetchOrganisationSettings } from '../../lib/settingsApi'

const SETTINGS_NAV_GROUPS = [
  {
    label: 'PERSONAL',
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
    label: 'COMPANY',
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
        to: '/settings/users',
        label: 'Users',
        icon: UsersRound,
        roles: ['developer', 'agent'],
        requiresManage: true,
        keywords: 'members team roles invites access permissions',
      },
      {
        to: '/settings/commission-structures',
        label: 'Commission',
        icon: BadgePercent,
        roles: ['developer', 'agent'],
        requiresManage: true,
        keywords: 'commission splits payout structures agent sales levels targets trackers referrals templates',
      },
    ],
  },
  {
    label: 'TRANSACTIONS',
    items: [
      {
        to: '/settings/signing-templates',
        label: 'Document Builder',
        icon: FileText,
        roles: ['developer', 'agent'],
        requiresManage: true,
        keywords: 'document builder templates signing documents mandate otp communication',
      },
      {
        to: '/settings/legal-templates',
        label: 'Documents',
        icon: Library,
        roles: ['developer', 'agent'],
        requiresManage: true,
        keywords: 'documents library document builder contracts uploads templates',
      },
      {
        to: '/settings/lead-capture',
        label: 'Lead Capture',
        icon: Mail,
        roles: ['agent'],
        keywords: 'leads email capture aliases portal inbound parsing',
      },
    ],
  },
  {
    label: 'PLATFORM',
    items: [
      {
        to: '/settings/integrations',
        label: 'Integrations',
        icon: PlugZap,
        keywords: 'connected services property24 whatsapp resend google supabase integrations',
      },
      {
        to: '/settings/api',
        label: 'API',
        icon: Code2,
        keywords: 'api keys webhooks developer access integrations platform',
      },
      {
        to: '/settings/billing',
        label: 'Billing',
        icon: CreditCard,
        roles: ['developer', 'agent'],
        requiresManage: true,
        keywords: 'billing subscription invoices plan entitlements usage',
      },
    ],
  },
  {
    label: 'SUPPORT',
    items: [
      {
        to: '/settings/help',
        label: 'Help Centre',
        icon: HelpCircle,
        keywords: 'support help centre knowledge base contact',
      },
    ],
  },
]

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeSearch(value = '') {
  return normalizeText(value).toLowerCase()
}

function formatRoleLabel(value = '') {
  const role = normalizeText(value || 'Member').replace(/_/g, ' ')
  return role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Member'
}

function getInitials(source = '') {
  return normalizeText(source || 'User')
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

function resolveDisplayName(account = {}, profile = {}) {
  return (
    normalizeText([account?.firstName, account?.lastName].filter(Boolean).join(' ')) ||
    normalizeText(profile?.fullName || profile?.name) ||
    normalizeText(account?.email || profile?.email) ||
    'Arch9 User'
  )
}

function resolveOrganisationName(account = {}, organisation = {}, currentWorkspace = {}) {
  return (
    normalizeText(account?.companyName) ||
    normalizeText(organisation?.displayName || organisation?.display_name || organisation?.name) ||
    normalizeText(currentWorkspace?.displayName || currentWorkspace?.name) ||
    'Organisation pending'
  )
}

function calculateProfileCompleteness(account = {}, profile = {}) {
  const values = [
    account?.firstName || profile?.firstName,
    account?.lastName || profile?.lastName,
    account?.email || profile?.email,
    account?.phoneNumber || profile?.phoneNumber,
    account?.title || profile?.title,
    account?.companyName || profile?.companyName,
    account?.avatarUrl || profile?.avatarUrl || profile?.avatar_url,
    account?.timezone,
  ]
  const completed = values.filter((value) => normalizeText(value)).length
  return Math.max(10, Math.round((completed / values.length) * 100))
}

function canShowSettingsItem(item, { role, canManage }) {
  if (item.roles && !item.roles.includes(role)) return false
  if (item.requiresManage && !canManage) return false
  return true
}

function itemMatchesSearch(item, query) {
  if (!query) return true
  const haystack = normalizeSearch(`${item.label} ${item.keywords || ''}`)
  return haystack.includes(query)
}

function SettingsSearch({ searchTerm, onSearchTermChange, onToggleMobileNav, mobileNavOpen }) {
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6b7d93]" strokeWidth={1.8} />
        <input
          type="search"
          className="h-11 w-full rounded-[12px] border border-[#d8e3ee] bg-white pl-10 pr-3 text-sm font-medium text-[#162334] outline-none transition placeholder:text-[#8b9aac] focus:border-[#9bb7ce] focus:ring-4 focus:ring-[#dbeaf5]"
          value={searchTerm}
          onChange={(event) => onSearchTermChange(event.target.value)}
          placeholder="Search settings..."
        />
      </label>
      <button
        type="button"
        className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] border border-[#d8e3ee] bg-white px-4 text-sm font-semibold text-[#24364b] transition hover:bg-[#f7fafc] lg:hidden"
        onClick={onToggleMobileNav}
        aria-expanded={mobileNavOpen}
      >
        {mobileNavOpen ? <X size={17} /> : <Menu size={17} />}
        Sections
      </button>
    </div>
  )
}

function AccountSummary({ account, currentWorkspace, membershipRole, organisationContext, profile, role }) {
  const organisation = organisationContext?.organisation || currentWorkspace || {}
  const displayName = resolveDisplayName(account, profile)
  const organisationName = resolveOrganisationName(account, organisation, currentWorkspace)
  const email = normalizeText(account?.email || profile?.email)
  const avatarUrl = normalizeText(account?.avatarUrl || profile?.avatarUrl || profile?.avatar_url)
  const roleLabel = formatRoleLabel(membershipRole || account?.role || role)
  const profileCompleteness = calculateProfileCompleteness(account, profile)

  return (
    <section className="rounded-[14px] border border-[#dde7f0] bg-white px-4 py-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border border-[#d6e2ee] bg-[#edf4f9] text-sm font-semibold text-[#244e70]">
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(displayName)}
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="truncate text-base font-semibold leading-5 text-[#121c2d]">{displayName}</h2>
              <span className="rounded-full border border-[#d7e6df] bg-[#f3faf6] px-2 py-0.5 text-xs font-semibold text-[#0f7f4f]">{roleLabel}</span>
            </div>
            <p className="mt-1 truncate text-sm font-medium text-[#42566d]">{organisationName}</p>
            {email ? <p className="truncate text-xs font-medium text-[#7b8ca2]">{email}</p> : null}
          </div>
        </div>
        <div className="grid gap-2 md:min-w-[220px]">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-[#51657b]">
            <span>Profile Complete</span>
            <span>{profileCompleteness}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[#e8eef5]">
            <span className="block h-full rounded-full bg-[#0f7f4f]" style={{ width: `${profileCompleteness}%` }} />
          </div>
          <Link to="/settings/profile" className="justify-self-start text-xs font-semibold text-[#0f7f4f] transition hover:text-[#0a6840] md:justify-self-end">
            Edit Profile
          </Link>
        </div>
      </div>
    </section>
  )
}

function SettingsNavigation({ groups, onNavigate }) {
  if (!groups.length) {
    return (
      <div className="rounded-[12px] border border-dashed border-[#d6e2ee] bg-[#f9fbfe] p-4 text-sm font-medium text-[#6b7d93]">
        No settings match your search.
      </div>
    )
  }

  return (
    <nav className="grid gap-5" aria-label="Settings navigation">
      {groups.map((group) => (
        <div key={group.label} className="grid gap-1">
          <p className="px-2 text-[0.68rem] font-bold uppercase text-[#7b8da6]">{group.label}</p>
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
                    'flex min-h-10 items-center gap-2.5 rounded-[10px] px-3 text-sm font-semibold transition duration-150 ease-out',
                    isActive
                      ? 'bg-[#eef7f2] text-[#0f7f4f] shadow-[inset_0_0_0_1px_rgba(15,127,79,0.08)]'
                      : 'text-[#42566d] hover:bg-[#f7fafc] hover:text-[#162334]',
                  ].join(' ')
                }
              >
                <Icon size={16} strokeWidth={1.8} />
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
  const { role, currentWorkspace, workspaceType, profile } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [account, setAccount] = useState(null)
  const [organisationContext, setOrganisationContext] = useState(null)
  const [membershipRole, setMembershipRole] = useState('viewer')
  const [searchTerm, setSearchTerm] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  useEffect(() => {
    let active = true

    async function loadSettingsContext() {
      try {
        const [accountSettings, context] = await Promise.all([
          fetchAccountSettings().catch(() => null),
          role === 'client' ? Promise.resolve(null) : fetchOrganisationSettings().catch(() => null),
        ])
        if (!active) return
        setAccount(accountSettings || null)
        setOrganisationContext(context || null)
        setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole, {
          appRole: role,
          workspaceType: context?.organisation?.type || resolvedWorkspaceType,
        }))
      } catch {
        if (active) {
          setAccount(null)
          setOrganisationContext(null)
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
  const query = normalizeSearch(searchTerm)
  const navGroups = useMemo(
    () =>
      SETTINGS_NAV_GROUPS
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => canShowSettingsItem(item, { role, canManage }) && itemMatchesSearch(item, query)),
        }))
        .filter((group) => group.items.length),
    [canManage, query, role],
  )

  return (
    <section className="min-h-[calc(100vh-96px)]">
      <div className="mx-auto grid w-full max-w-[1200px] gap-4">
        <SettingsSearch
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          mobileNavOpen={mobileNavOpen}
          onToggleMobileNav={() => setMobileNavOpen((open) => !open)}
        />

        <AccountSummary
          account={account}
          currentWorkspace={currentWorkspace}
          membershipRole={membershipRole}
          organisationContext={organisationContext}
          profile={profile}
          role={role}
        />

        {mobileNavOpen ? (
          <aside className="rounded-[14px] border border-[#dde7f0] bg-white p-3 lg:hidden">
            <SettingsNavigation groups={navGroups} onNavigate={() => setMobileNavOpen(false)} />
          </aside>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[236px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <div className="sticky top-4 rounded-[14px] border border-[#dde7f0] bg-white p-3">
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
