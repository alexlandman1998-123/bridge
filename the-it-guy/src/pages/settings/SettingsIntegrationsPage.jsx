import { ChevronRight, PlugZap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { settingsPageClass, SettingsPageHeader } from './settingsUi'

const INTEGRATION_CARDS = [
  {
    to: '/settings/integrations/whatsapp',
    label: 'WhatsApp',
    description: 'Configure Meta embedded signup, branch overrides, and webhook routing for multi-tenant WhatsApp messaging.',
    status: 'Embedded signup ready',
  },
]

function IntegrationCard({ to, label, description, status }) {
  return (
    <Link
      to={to}
      className="group grid min-h-[220px] gap-5 rounded-[24px] border border-[#dfe8f1] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#c8d7e5] hover:shadow-[0_20px_40px_rgba(15,23,42,0.09)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef7f2] text-[#0f7f4f]">
          <PlugZap className="h-5 w-5" />
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[#8292a7] transition group-hover:translate-x-0.5 group-hover:text-[#0f7f4f]" />
      </div>

      <div className="grid gap-3">
        <div className="space-y-1">
          <h2 className="text-[1.1rem] font-semibold tracking-[-0.02em] text-[#152132]">{label}</h2>
          <p className="text-sm leading-6 text-[#61748a]">{description}</p>
        </div>
        <span className="inline-flex w-max rounded-full border border-[#cfe8d9] bg-[#f0fbf4] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#1f7a45]">
          {status}
        </span>
      </div>
    </Link>
  )
}

export default function SettingsIntegrationsPage() {
  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Platform management"
        title="Integrations"
        description="Connect external messaging providers and platform services from one place."
      />

      <section className="grid gap-5 md:grid-cols-2">
        {INTEGRATION_CARDS.map((card) => (
          <IntegrationCard key={card.to} {...card} />
        ))}
      </section>
    </div>
  )
}
