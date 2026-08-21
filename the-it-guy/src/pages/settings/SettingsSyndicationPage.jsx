import { ChevronRight, PlugZap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { settingsPageClass } from './settingsUi'

const PORTAL_CARDS = [
  {
    to: '/settings/syndication/property24',
    label: 'Property24',
    description: 'Set up Property24 publishing, agent mapping, and portal health checks.',
    logoSrc: '/lead-sources/property24.png',
    logoAlt: 'Property24 logo',
  },
  {
    to: '/settings/syndication/private-property',
    label: 'Private Property',
    description: 'Configure your Private Property syndication profile and routing details.',
    logoSrc: '/lead-sources/private-property.jpeg',
    logoAlt: 'Private Property logo',
  },
]

function PortalCard({ to, label, description, logoSrc, logoAlt }) {
  return (
    <Link
      to={to}
      className="group grid min-h-[240px] gap-5 rounded-[24px] border border-[#dfe8f1] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:border-[#c8d7e5] hover:shadow-[0_20px_40px_rgba(15,23,42,0.09)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef7f2] text-[#0f7f4f]">
          <PlugZap className="h-5 w-5" />
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[#8292a7] transition group-hover:translate-x-0.5 group-hover:text-[#0f7f4f]" />
      </div>

      <div className="grid gap-5">
        <div className="flex min-h-[110px] items-center justify-center rounded-[20px] border border-[#e4ebf2] bg-[#f9fbfe] p-5">
          <img
            src={logoSrc}
            alt={logoAlt}
            className="max-h-[72px] w-full max-w-[220px] object-contain"
          />
        </div>

        <div className="grid gap-2">
          <h2 className="text-[1.1rem] font-semibold tracking-[-0.02em] text-[#152132]">{label}</h2>
          <p className="text-sm leading-6 text-[#61748a]">{description}</p>
        </div>
      </div>
    </Link>
  )
}

export default function SettingsSyndicationPage() {
  return (
    <div className={`${settingsPageClass} settings-dashboard-page`}>
      <header className="space-y-3">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#65748b]">Platform management</p>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#13202f]">Syndication</h1>
        <p className="max-w-3xl text-sm leading-6 text-[#60758d]">
          Choose the portal you want to configure. Each logo opens the relevant setup page for its syndication account.
        </p>
      </header>

      <section className="grid gap-5 md:grid-cols-2">
        {PORTAL_CARDS.map((card) => (
          <PortalCard key={card.to} {...card} />
        ))}
      </section>
    </div>
  )
}
