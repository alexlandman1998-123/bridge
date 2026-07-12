import {
  BadgePercent,
  Bell,
  Building2,
  Code2,
  CreditCard,
  Mail,
  Palette,
  PlugZap,
  Shield,
  UserCircle2,
  UsersRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { settingsPageClass, SettingsPageHeader } from './settingsUi'

const SETTINGS_CARDS = [
  {
    to: '/settings/profile',
    title: 'Profile',
    description: 'Manage your personal details, avatar, and workspace identity.',
    icon: UserCircle2,
  },
  {
    to: '/settings/security',
    title: 'Security',
    description: 'Update password, sessions, and account protection settings.',
    icon: Shield,
  },
  {
    to: '/settings/notifications',
    title: 'Notifications',
    description: 'Tune email, in-app, SMS, and browser notification preferences.',
    icon: Bell,
  },
  {
    to: '/settings/organisation',
    title: 'Organisation',
    description: 'Manage company details, governance, branches, and workspace settings.',
    icon: Building2,
    roles: ['developer', 'agent', 'attorney', 'bond_originator'],
  },
  {
    to: '/settings/branding',
    title: 'Branding',
    description: 'Maintain logos, colors, and branded portal presentation.',
    icon: Palette,
    roles: ['developer', 'agent', 'attorney', 'bond_originator'],
  },
  {
    to: '/settings/commission',
    title: 'Commission',
    description: 'Configure commission structures, splits, and referral rules.',
    icon: BadgePercent,
    roles: ['developer', 'agent'],
  },
  {
    to: '/settings/users',
    title: 'Users',
    description: 'Invite team members and review access permissions.',
    icon: UsersRound,
    roles: ['developer', 'agent'],
  },
  {
    to: '/settings/lead-capture',
    title: 'Lead Capture',
    description: 'Manage forwarding addresses, agent activation, and inbound enquiry health.',
    icon: Mail,
    roles: ['agent'],
  },
  {
    to: '/settings/integrations',
    title: 'Integrations',
    description: 'Review connected services, provider setup, and platform links.',
    icon: PlugZap,
  },
  {
    to: '/settings/api',
    title: 'API',
    description: 'Manage API and webhook settings for connected workflows.',
    icon: Code2,
  },
  {
    to: '/settings/billing',
    title: 'Billing',
    description: 'Review subscription, plan, usage, and billing controls.',
    icon: CreditCard,
    roles: ['developer', 'agent'],
  },
]

function canShowCard(card, role) {
  if (!card.roles) return true
  return card.roles.includes(role)
}

export default function SettingsLanding() {
  const { role } = useWorkspace()
  const cards = SETTINGS_CARDS.filter((card) => canShowCard(card, role))

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Workspace Settings"
        description="Open the settings area you need to configure account, workspace, platform, and lead capture operations."
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.to}
              to={card.to}
              className="group grid min-h-[148px] gap-4 rounded-[12px] border border-[#e4ebf2] bg-white p-4 shadow-[0_8px_20px_rgba(15,23,42,0.04)] transition hover:border-[#bdd9cc] hover:shadow-[0_14px_30px_rgba(15,23,42,0.07)]"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#dce8ef] bg-[#f6faf8] text-[#0f7f4f]">
                <Icon className="h-5 w-5" strokeWidth={1.9} />
              </span>
              <span className="grid gap-1.5">
                <span className="text-base font-semibold text-[#162334]">{card.title}</span>
                <span className="text-sm leading-6 text-[#6b7d93]">{card.description}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
