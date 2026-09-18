import { LockKeyhole, MessageSquareText } from 'lucide-react'
import { SettingsPageHeader, settingsPageClass } from './settingsUi'

export default function SettingsCommunicationsComingSoonPage() {
  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Communications"
        description="Communication settings will be available here soon."
      />

      <section className="grid max-w-2xl gap-5 rounded-[20px] border border-[#dce6ef] bg-[linear-gradient(135deg,#f8fbff_0%,#f2f8f4_100%)] p-7 shadow-[0_14px_34px_rgba(15,23,42,0.05)]">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-[14px] bg-white text-[#0f7f4f] shadow-sm">
          <MessageSquareText size={23} />
        </span>
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#142132]">Coming soon</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#60758d]">
            Email templates and communication controls are being prepared for a future release. They are not configurable in Arch9 yet.
          </p>
        </div>
        <p className="inline-flex w-max items-center gap-2 rounded-full border border-[#d3e4d9] bg-white px-3 py-1.5 text-xs font-semibold text-[#2c704a]">
          <LockKeyhole size={14} /> Settings locked
        </p>
      </section>
    </div>
  )
}
