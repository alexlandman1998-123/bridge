import { BookOpenText, LifeBuoy, Mail } from 'lucide-react'
import UxDiagnosticsHistoryPanel from '../../components/feedback/UxDiagnosticsHistoryPanel'
import { SettingsPageHeader, SettingsSectionCard, settingsPageClass } from './settingsUi'

const SUPPORT_OPTIONS = [
  {
    title: 'Help Centre',
    description: 'Product guidance, setup notes, and operating playbooks for workspace administrators.',
    icon: BookOpenText,
  },
  {
    title: 'Support Inbox',
    description: 'Escalate account, billing, and transaction workflow issues to the Arch9 support team.',
    icon: Mail,
  },
  {
    title: 'Implementation Support',
    description: 'Coordinate onboarding, data readiness, and enterprise rollout assistance.',
    icon: LifeBuoy,
  },
]

export default function SettingsSupportPage() {
  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Support"
        title="Help Centre"
        description="Workspace support and implementation resources."
      />

      <SettingsSectionCard title="Support Options">
        <div className="grid gap-3 md:grid-cols-3">
          {SUPPORT_OPTIONS.map((option) => {
            const Icon = option.icon
            return (
              <article key={option.title} className="rounded-[12px] border border-[#e1e8f0] bg-white p-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#d9e4ef] bg-[#f8fbff] text-[#35546c]">
                  <Icon size={18} strokeWidth={1.8} />
                </span>
                <h3 className="mt-3 text-sm font-semibold text-[#162334]">{option.title}</h3>
                <p className="mt-2 text-sm leading-5 text-[#607387]">{option.description}</p>
              </article>
            )
          })}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Recent Diagnostics">
        <UxDiagnosticsHistoryPanel
          title="Local support packets"
          description="Recent issue references saved on this browser."
          emptyMessage="No support packets saved on this browser yet."
          compact
        />
      </SettingsSectionCard>
    </div>
  )
}
