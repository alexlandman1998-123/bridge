import { MobileCard, MobileEmptyState } from '../../components/mobile-shell/MobileShellStates'
import { getMobileSharedActivity } from '../../services/mobileWorkspaceService'

export default function MobileActivityPage() {
  const activity = getMobileSharedActivity()
  return (
    <div className="space-y-4">
      <h1 className="text-[28px] font-semibold text-[#10243a]">Activity</h1>
      {activity.length ? (
        <MobileCard className="p-2">
        <div className="space-y-2">
          {activity.map((item) => (
            <div key={item.id} className="flex items-start gap-3 rounded-[18px] bg-[#f8fafc] px-3 py-3">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#1f7a5a]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#10243a]">{item.title}</span>
                <span className="block truncate text-xs text-[#60758d]">{item.body}</span>
              </span>
              <span className="text-xs font-semibold text-[#94a3b8]">{item.time}</span>
            </div>
          ))}
        </div>
        </MobileCard>
      ) : <MobileEmptyState title="No activity yet." body="System, transaction, matter, application and deal activity will appear here." />}
    </div>
  )
}
