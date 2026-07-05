import { CheckCircle2, Code2, KeyRound, PlugZap, Settings2 } from 'lucide-react'
import { SettingsBanner, SettingsPageHeader, SettingsSectionCard, settingsPageClass } from './settingsUi'

const INTEGRATIONS = [
  { name: 'Property24', category: 'Listing portal', status: 'Ready to connect', description: 'Sync published listing references and portal URLs.' },
  { name: 'Private Property', category: 'Listing portal', status: 'Ready to connect', description: 'Manage external listing links and publication references.' },
  { name: 'Resend', category: 'Email delivery', status: 'Configured by environment', description: 'Transactional email delivery for onboarding and notifications.' },
  { name: 'WhatsApp', category: 'Messaging', status: 'Configured by environment', description: 'Send onboarding and operational notifications through WhatsApp.' },
  { name: 'Google Places', category: 'Location', status: 'Configured by environment', description: 'Address autocomplete and location enrichment.' },
  { name: 'Supabase', category: 'Core platform', status: 'Active', description: 'Authentication, database and document storage.' },
]

export default function SettingsIntegrationsPage({ view = 'integrations' }) {
  if (view === 'api') {
    return (
      <div className={settingsPageClass}>
        <SettingsPageHeader
          kicker="Platform"
          title="API"
          description="API access, keys, and webhook configuration."
        />

        <SettingsBanner tone="warning">API keys are managed by platform administrators until self-service key rotation is enabled.</SettingsBanner>

        <SettingsSectionCard title="API Access" description="Developer access for the current workspace.">
          <div className="grid gap-3 md:grid-cols-2">
            <article className="rounded-[12px] border border-[#e1e8f0] bg-white p-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d9e4ef] bg-[#f8fbff] text-[#35546c]">
                <KeyRound size={18} strokeWidth={1.8} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-[#162334]">API keys</h3>
              <p className="mt-2 text-sm leading-5 text-[#607387]">Workspace-scoped keys will appear here when the API key service is available.</p>
            </article>
            <article className="rounded-[12px] border border-[#e1e8f0] bg-white p-4">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d9e4ef] bg-[#f8fbff] text-[#35546c]">
                <Code2 size={18} strokeWidth={1.8} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-[#162334]">Webhooks</h3>
              <p className="mt-2 text-sm leading-5 text-[#607387]">Event subscriptions for leads, documents, transactions, and billing are configured by implementation support.</p>
            </article>
          </div>
        </SettingsSectionCard>
      </div>
    )
  }

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="System"
        title="Integrations"
        description="Connect and manage third-party services, API connections and platform providers."
      />

      <SettingsSectionCard title="Connected Services" description="Platform integrations are shown as cards so configuration status is easy to scan.">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {INTEGRATIONS.map((integration) => (
            <article key={integration.name} className="rounded-[16px] border border-[#e1e8f0] bg-[#fbfdff] p-4 transition hover:border-[#cbd9e6] hover:bg-white">
              <div className="flex items-start justify-between gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#eaf7ef] text-[#0f7f4f]">
                  <PlugZap size={19} strokeWidth={1.8} />
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#607387]">
                  <CheckCircle2 size={13} />
                  {integration.status}
                </span>
              </div>
              <h3 className="mt-4 text-sm font-semibold text-[#121c2d]">{integration.name}</h3>
              <p className="mt-1 text-xs font-medium uppercase text-[#7b8ca2]">{integration.category}</p>
              <p className="mt-2 text-sm font-normal leading-5 text-[#607387]">{integration.description}</p>
              <button type="button" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#0f7f4f]" disabled>
                <Settings2 size={15} />
                Configure
              </button>
            </article>
          ))}
        </div>
      </SettingsSectionCard>
    </div>
  )
}
