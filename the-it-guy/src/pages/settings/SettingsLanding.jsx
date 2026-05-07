import { ArrowRight, Building2, CreditCard, Handshake, Home, Shield, UserCircle2, Workflow } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SettingsPageHeader, settingsPageClass } from './settingsUi'

const SETTINGS_CARDS = [
  {
    to: '/settings/account',
    title: 'Account',
    description: 'Manage your profile, notification preferences, and personal defaults.',
    icon: UserCircle2,
  },
  {
    to: '/settings/organisation',
    title: 'Organisation',
    description: 'Control company details, contact information, and workspace identity.',
    icon: Building2,
  },
  {
    to: '/settings/preferred-partners',
    title: 'Preferred Partners',
    description: 'Manage approved bond and legal partners available during deal setup.',
    icon: Handshake,
  },
  {
    to: '/settings/developments',
    title: 'Developments',
    description: 'Configure development metadata, attorney setup, and post-registration defaults.',
    icon: Home,
  },
  {
    to: '/settings/workflows',
    title: 'Workflows & Rules',
    description: 'Set onboarding, document, workflow, and automation defaults for the platform.',
    icon: Workflow,
  },
  {
    to: '/settings/users',
    title: 'Users & Permissions',
    description: 'Invite users, adjust role assignments, and control access by organisation.',
    icon: Shield,
  },
  {
    to: '/settings/billing',
    title: 'Billing',
    description: 'Review plan details, usage, renewal timing, and invoice history.',
    icon: CreditCard,
  },
]

export default function SettingsLanding() {
  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Manage how Bridge runs"
        description="Use one control panel for account, organisation, developments, workflows, users, and billing."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_CARDS.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.to}
              to={card.to}
              className="group flex h-full min-h-[180px] flex-col rounded-[18px] border border-[#e2eaf3] bg-[#fbfdff] p-5 transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[#cedae6] hover:bg-white"
            >
              <div className="mb-5 flex items-start justify-between gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-[#d9e4ef] bg-white text-[#35546c]">
                  <Icon size={20} />
                </span>
                <ArrowRight size={16} className="text-[#7b8da6] transition duration-150 ease-out group-hover:translate-x-1 group-hover:text-[#35546c]" />
              </div>
              <div className="space-y-2">
                <h3 className="text-base font-semibold text-[#162334]">{card.title}</h3>
                <p className="text-sm leading-6 text-[#6b7d93]">{card.description}</p>
              </div>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
