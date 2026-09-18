import { ChevronRight, IdCard, MessageCircle, PlugZap, Radio } from 'lucide-react'
import { Link } from 'react-router-dom'
import { settingsPageClass } from './settingsUi'

const INTEGRATION_CARDS = [
  {
    to: '/settings/syndication/property24',
    label: 'Property24',
    description: 'Set up listing publishing, agent mapping, and portal health checks.',
    logoSrc: '/lead-sources/property24.png',
    logoAlt: 'Property24 logo',
  },
  {
    to: '/settings/integrations/meta',
    label: 'Meta Lead Ads',
    description: 'Connect Facebook and Instagram forms, then choose how each form reaches your CRM.',
    icon: Radio,
    brandLabel: 'Meta',
    brandClassName: 'text-[#1877f2]',
  },
  {
    to: '/settings/integrations/digital-cards',
    label: 'Digital Cards',
    description: 'Create shareable agent cards, QR codes, and enquiry links for your team.',
    icon: IdCard,
    brandLabel: 'Digital cards',
    brandClassName: 'text-[#0f7f4f]',
  },
  {
    label: 'WhatsApp',
    description: 'WhatsApp delivery is managed by Arch9 while organisation-level sender and template setup is prepared.',
    icon: MessageCircle,
    brandLabel: 'WhatsApp',
    brandClassName: 'text-[#1a9b62]',
    status: 'Managed by Arch9',
  },
]

function IntegrationCard({ to, label, description, logoSrc, logoAlt, icon: Icon = PlugZap, brandLabel = '', brandClassName = '', status = '' }) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#eef7f2] text-[#0f7f4f]">
          <Icon className="h-5 w-5" />
        </div>
        {to ? <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[#8292a7] transition group-hover:translate-x-0.5 group-hover:text-[#0f7f4f]" /> : null}
      </div>

      <div className="grid gap-5">
        <div className="flex min-h-[110px] items-center justify-center rounded-[20px] border border-[#e4ebf2] bg-[#f9fbfe] p-5">
          {logoSrc ? (
            <img
              src={logoSrc}
              alt={logoAlt}
              className="max-h-[72px] w-full max-w-[220px] object-contain"
            />
          ) : (
            <span className={`inline-flex items-center gap-2 text-2xl font-semibold tracking-[-0.05em] ${brandClassName}`}>
              <Icon className="h-7 w-7" strokeWidth={2.2} />
              {brandLabel}
            </span>
          )}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[1.1rem] font-semibold tracking-[-0.02em] text-[#152132]">{label}</h2>
            {status ? <span className="rounded-full border border-[#dce6ef] bg-[#f7fafc] px-2 py-0.5 text-[0.68rem] font-semibold text-[#60758d]">{status}</span> : null}
          </div>
          <p className="text-sm leading-6 text-[#61748a]">{description}</p>
        </div>
      </div>
    </>
  )

  const className = "group grid min-h-[240px] gap-5 rounded-[24px] border border-[#dfe8f1] bg-white p-6 shadow-[0_16px_34px_rgba(15,23,42,0.05)] transition"
  if (!to) {
    return <article className={`${className} cursor-default`}>{content}</article>
  }

  return (
    <Link
      to={to}
      className={`${className} hover:-translate-y-0.5 hover:border-[#c8d7e5] hover:shadow-[0_20px_40px_rgba(15,23,42,0.09)]`}
    >
      {content}
    </Link>
  )
}

export default function SettingsSyndicationPage() {
  return (
    <div className={`${settingsPageClass} settings-dashboard-page`}>
      <section className="grid gap-5 md:grid-cols-2">
        {INTEGRATION_CARDS.map((card) => (
          <IntegrationCard key={card.label} {...card} />
        ))}
      </section>
    </div>
  )
}
