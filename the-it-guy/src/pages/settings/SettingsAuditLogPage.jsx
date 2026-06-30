import { Eye } from 'lucide-react'
import { SettingsPageHeader, SettingsSectionCard, settingsPageClass, settingsTableClass } from './settingsUi'

const AUDIT_ROWS = [
  { time: 'Today 08:42', user: 'System', action: 'Settings viewed', entity: 'Settings workspace', ip: 'Unavailable' },
  { time: 'Yesterday 16:15', user: 'System', action: 'Profile sync', entity: 'Account', ip: 'Unavailable' },
  { time: 'This week', user: 'System', action: 'Organisation context loaded', entity: 'Organisation', ip: 'Unavailable' },
]

export default function SettingsAuditLogPage() {
  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="System"
        title="Audit Log"
        description="View account activity and changes across account, organisation and platform settings."
      />

      <SettingsSectionCard title="Filters" description="Filter by date, user and action when audit telemetry is available.">
        <div className="grid gap-3 md:grid-cols-3">
          <button type="button" className="rounded-[12px] border border-[#dce6f2] bg-white px-4 py-2.5 text-left text-sm font-medium text-[#42566d]" disabled>Date range</button>
          <button type="button" className="rounded-[12px] border border-[#dce6f2] bg-white px-4 py-2.5 text-left text-sm font-medium text-[#42566d]" disabled>User</button>
          <button type="button" className="rounded-[12px] border border-[#dce6f2] bg-white px-4 py-2.5 text-left text-sm font-medium text-[#42566d]" disabled>Action</button>
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title="Activity" description="Recent account and organisation setting events.">
        <div className={`${settingsTableClass} overflow-x-auto`}>
          <div className="grid min-w-[760px] grid-cols-[1fr_1fr_1.2fr_1.2fr_1fr_auto] gap-3 border-b border-[#e8eef5] bg-[#f8fbfe] px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8ca2]">
            <span>Time</span>
            <span>User</span>
            <span>Action</span>
            <span>Entity</span>
            <span>IP</span>
            <span>Details</span>
          </div>
          {AUDIT_ROWS.map((row) => (
            <div key={`${row.time}-${row.action}`} className="grid min-w-[760px] grid-cols-[1fr_1fr_1.2fr_1.2fr_1fr_auto] gap-3 border-b border-[#eef3f8] px-4 py-3 text-sm font-normal text-[#42566d] last:border-b-0">
              <span>{row.time}</span>
              <span>{row.user}</span>
              <span className="font-medium text-[#162334]">{row.action}</span>
              <span>{row.entity}</span>
              <span>{row.ip}</span>
              <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0f7f4f]" disabled>
                <Eye size={14} />
                View
              </button>
            </div>
          ))}
        </div>
      </SettingsSectionCard>
    </div>
  )
}
