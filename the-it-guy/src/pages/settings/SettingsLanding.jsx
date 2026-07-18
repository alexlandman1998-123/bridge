import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../../context/WorkspaceContext'
import { canManageOrganisationSettings } from '../../lib/organisationAccess'
import { settingsPageClass, SettingsPageHeader } from './settingsUi'
import { buildVisibleSettingsGroups } from './settingsNavigation'

export default function SettingsLanding() {
  const { can, role, currentWorkspace, organisationMembershipRole, workspaceRole, workspaceType } = useWorkspace()
  const resolvedWorkspaceType = currentWorkspace?.type || workspaceType || ''
  const membershipRole = organisationMembershipRole || workspaceRole || 'viewer'
  const canManage = canManageOrganisationSettings({ appRole: role, membershipRole, workspaceType: resolvedWorkspaceType })
  const groups = buildVisibleSettingsGroups({ role, canManage, can })

  return (
    <div className={settingsPageClass}>
      <SettingsPageHeader
        kicker="Settings"
        title="Workspace settings"
        description="Manage only the settings available to your role. Every section below is connected to an active workspace function."
      />

      <div className="space-y-8">
        {groups.map((group) => (
          <section key={group.label} aria-labelledby={`settings-group-${group.label.toLowerCase()}`}>
            <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[#7c8ea2]">{group.label}</p>
                <h3 id={`settings-group-${group.label.toLowerCase()}`} className="mt-1 text-base font-semibold text-[#172536]">{group.title}</h3>
              </div>
              <p className="text-sm text-[#718398]">{group.description}</p>
            </div>
            <div className="grid overflow-hidden rounded-[16px] border border-[#dfe7ee] bg-[#fbfcfd] sm:grid-cols-2">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group flex min-h-[104px] items-center gap-4 border-b border-[#e4ebf1] bg-white p-4 transition last:border-b-0 hover:z-10 hover:bg-[#f7fbf8] sm:[&:nth-child(odd)]:border-r sm:[&:nth-last-child(-n+2)]:border-b-0"
                  >
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-[#dbe7df] bg-[#f1f8f4] text-[#176b48] transition group-hover:border-[#bcd8c8] group-hover:bg-white">
                      <Icon size={18} strokeWidth={1.9} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-[#172536]">{item.label}</span>
                      <span className="mt-1 block text-xs leading-5 text-[#718398]">{item.description}</span>
                    </span>
                    <ArrowUpRight size={16} className="shrink-0 text-[#9aa9b8] transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[#176b48]" />
                  </Link>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
