import {
  ArrowRight,
  Bell,
  Building2,
  ClipboardList,
  Download,
  FileSignature,
  FileText,
  Handshake,
  KeyRound,
  Laptop,
  Mail,
  Pencil,
  PlugZap,
  ShieldCheck,
  UserCircle2,
  Workflow,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings, normalizeOrganisationMembershipRole } from '../../lib/organisationAccess'
import { fetchAccountSettings, fetchOrganisationSettings } from '../../lib/settingsApi'
import { SettingsLoadingState, SettingsPageHeader, settingsPageClass } from './settingsUi'

const SETTINGS_CATEGORIES = [
  {
    to: '/settings/profile',
    title: 'Profile',
    description: 'Manage your personal information and profile.',
    cta: 'Edit profile',
    icon: UserCircle2,
  },
  {
    to: '/settings/organisation',
    title: 'Organisation',
    description: 'Manage organisation details, branding and members.',
    cta: 'Manage organisation',
    icon: Building2,
  },
  {
    to: '/settings/security',
    title: 'Security',
    description: 'Passwords, MFA, active sessions and login history.',
    cta: 'Manage security',
    icon: ShieldCheck,
  },
  {
    to: '/settings/notifications',
    title: 'Notifications',
    description: 'Email, push and SMS preferences.',
    cta: 'Manage notifications',
    icon: Bell,
  },
  {
    to: '/settings/preferences',
    title: 'Preferences',
    description: 'Timezone, language, regional settings.',
    cta: 'Manage preferences',
    icon: FileText,
  },
  {
    to: '/settings/integrations',
    title: 'Integrations',
    description: 'Third-party services and API connections.',
    cta: 'Manage integrations',
    icon: PlugZap,
  },
  {
    to: '/settings/preferred-partners',
    title: 'Preferred Partners',
    description: 'Manage preferred attorneys, bond originators and service providers.',
    cta: 'Manage partners',
    icon: Handshake,
  },
  {
    to: '/settings/legal-templates',
    title: 'Legal Templates',
    description: 'Manage organisation legal templates and defaults.',
    cta: 'Manage templates',
    icon: FileSignature,
  },
  {
    to: '/settings/workflows',
    title: 'Workflow Rules',
    description: 'Automation and workflow settings.',
    cta: 'Manage workflows',
    icon: Workflow,
  },
  {
    to: '/settings/communications/templates',
    title: 'Communication Templates',
    description: 'Email, SMS and WhatsApp templates.',
    cta: 'Manage templates',
    icon: Mail,
  },
  {
    to: '/settings/audit-log',
    title: 'Audit Log',
    description: 'View account activity and changes.',
    cta: 'View audit log',
    icon: ClipboardList,
  },
]

const QUICK_ACTIONS = [
  { to: '/settings/security', label: 'Reset password', icon: KeyRound },
  { to: '/settings/security', label: 'Enable two-factor auth', icon: ShieldCheck },
  { to: '/settings/security', label: 'Manage devices', icon: Laptop },
  { to: '/settings/profile', label: 'Download my data', icon: Download },
  { to: '/settings/audit-log', label: 'View audit log', icon: ClipboardList },
]

function getInitials(account = {}) {
  const source = [account.firstName, account.lastName].filter(Boolean).join(' ') || account.email || 'User'
  return String(source)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U'
}

function displayValue(value, fallback = 'Not available') {
  const text = String(value || '').trim()
  return text || fallback
}

function createFallbackAccount(role) {
  return {
    firstName: 'Arch9',
    lastName: 'User',
    email: '',
    phoneNumber: '',
    companyName: '',
    role: role || 'member',
    avatarUrl: '',
  }
}

export default function SettingsLanding() {
  const { role, currentWorkspace, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const [loading, setLoading] = useState(true)
  const [account, setAccount] = useState(null)
  const [organisationContext, setOrganisationContext] = useState(null)
  const [membershipRole, setMembershipRole] = useState('viewer')

  useEffect(() => {
    let active = true
    async function loadSettingsHome() {
      try {
        setLoading(true)
        const [accountSettings, context] = await Promise.all([
          fetchAccountSettings().catch(() => null),
          role === 'client' ? Promise.resolve(null) : fetchOrganisationSettings().catch(() => null),
        ])
        if (!active) return
        setAccount(accountSettings || createFallbackAccount(role))
        setOrganisationContext(context)
        setMembershipRole(normalizeOrganisationMembershipRole(context?.membershipRole || 'viewer', {
          appRole: role,
          workspaceType: context?.organisation?.type || resolvedWorkspaceType,
        }))
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadSettingsHome()
    return () => {
      active = false
    }
  }, [role, resolvedWorkspaceType])

  if (loading || !account) {
    return <SettingsLoadingState label="Loading settings…" />
  }

  const canManage = canManageOrganisationSettings({
    appRole: role,
    membershipRole,
    workspaceType: resolvedWorkspaceType,
  })
  const organisation = organisationContext?.organisation || currentWorkspace || {}
  const fullName = displayValue([account.firstName, account.lastName].filter(Boolean).join(' '), 'Arch9 User')
  const roleLabel = displayValue(membershipRole || account.role || role, 'Member').replace(/_/g, ' ')
  const visibleCategories = SETTINGS_CATEGORIES.filter((card) => {
    if (!canManage && ['Organisation', 'Preferred Partners', 'Legal Templates', 'Workflow Rules', 'Communication Templates', 'Audit Log', 'Integrations'].includes(card.title)) {
      return false
    }
    return true
  })

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        title="Settings"
        description="Manage your account, organisation and platform preferences."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <section className="rounded-[18px] border border-[#e1e8f0] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] lg:items-center">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                <div className="relative h-28 w-28 shrink-0">
                  <span className="grid h-28 w-28 place-items-center overflow-hidden rounded-full border border-[#dce6f2] bg-[#eef5fb] text-xl font-semibold text-[#1f4f78]">
                    {account.avatarUrl ? <img src={account.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(account)}
                  </span>
                  <Link
                    to="/settings/profile"
                    className="absolute -bottom-1 -right-1 grid h-10 w-10 place-items-center rounded-full border border-[#dce6f2] bg-white text-[#25384d] shadow-[0_8px_18px_rgba(15,23,42,0.12)] transition hover:bg-[#f7fbff]"
                    aria-label="Edit profile picture"
                  >
                    <Pencil size={15} />
                  </Link>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xl font-bold text-[#121c2d]">{fullName}</h3>
                    <span className="rounded-full bg-[#dff3e8] px-3 py-1 text-xs font-semibold capitalize text-[#0f7f4f]">{roleLabel}</span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm font-normal text-[#42566d]">
                    <p>{displayValue(account.email)}</p>
                    <p>{displayValue(account.phoneNumber)}</p>
                    <p>{displayValue(account.companyName || organisation.name, 'Organisation pending')}</p>
                    <p>Joined date unavailable</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 border-t border-[#e8eef5] pt-5 sm:grid-cols-2 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                <div>
                  <p className="text-xs font-medium text-[#7b8ca2]">Last login</p>
                  <p className="mt-1 text-sm font-semibold text-[#162334]">Not available</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#7b8ca2]">Account status</p>
                  <p className="mt-1 text-sm font-semibold text-[#0f7f4f]">Active</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#7b8ca2]">IP address</p>
                  <p className="mt-1 text-sm font-semibold text-[#162334]">Not available</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-[#7b8ca2]">Two-factor authentication</p>
                  <p className="mt-1 text-sm font-semibold text-[#607387]">Not enabled</p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-base font-semibold text-[#121c2d]">Settings categories</h3>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {visibleCategories.map((card) => {
                const Icon = card.icon
                return (
                  <Link
                    key={card.title}
                    to={card.to}
                    className="group flex min-h-[150px] rounded-[16px] border border-[#e1e8f0] bg-white p-5 shadow-[0_10px_24px_rgba(15,23,42,0.045)] transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[#cbd9e6] hover:shadow-[0_14px_30px_rgba(15,23,42,0.08)]"
                  >
                    <span className="mr-4 grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[#eaf7ef] text-[#0f7f4f]">
                      <Icon size={21} strokeWidth={1.8} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-[#121c2d]">{card.title}</span>
                        <ArrowRight size={15} className="text-[#607387] transition group-hover:translate-x-1 group-hover:text-[#0f7f4f]" />
                      </span>
                      <span className="mt-2 text-sm font-normal leading-5 text-[#607387]">{card.description}</span>
                      <span className="mt-auto pt-4 text-sm font-semibold text-[#0f7f4f]">{card.cta} →</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-4 overflow-hidden rounded-[16px] border border-[#e1e8f0] bg-white shadow-[0_12px_28px_rgba(15,23,42,0.055)]">
            <div className="border-b border-[#e8eef5] px-4 py-4">
              <h3 className="text-sm font-semibold text-[#121c2d]">Quick actions</h3>
            </div>
            <div className="divide-y divide-[#edf2f7]">
              {QUICK_ACTIONS.map((action) => {
                const Icon = action.icon
                return (
                  <Link key={action.label} to={action.to} className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-[#25384d] transition hover:bg-[#f7fbff]">
                    <Icon size={16} strokeWidth={1.8} className="text-[#607387]" />
                    <span className="flex-1">{action.label}</span>
                    <ArrowRight size={14} className="text-[#607387]" />
                  </Link>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
