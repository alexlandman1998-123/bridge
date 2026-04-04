import { ArrowRight, Building2, CreditCard, Home, Shield, UserCircle2, Workflow } from 'lucide-react'
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
        description="Control the operating defaults behind your organisation, developments, users, workflows, and billing in one place."
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SETTINGS_CARDS.map((card) => {
          const Icon = card.icon
          return (
            <Link
              key={card.to}
              to={card.to}
              className="group rounded-[24px] border border-[#dde4ee] bg-white p-5 shadow-[0_12px_28px_rgba(15,23,42,0.06)] transition duration-150 ease-out hover:-translate-y-0.5 hover:border-[#cedae6] hover:bg-[#fbfdff]"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#d9e4ef] bg-[#f6faff] text-[#35546c]">
                  <Icon size={20} />
                </span>
                <ArrowRight size={16} className="text-[#7b8da6] transition duration-150 ease-out group-hover:translate-x-1 group-hover:text-[#35546c]" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-[#162334]">{card.title}</h3>
                <p className="text-sm leading-6 text-[#6b7d93]">{card.description}</p>
              </div>
            </Link>
          )
        })}
      </section>
    </div>
  )
}
