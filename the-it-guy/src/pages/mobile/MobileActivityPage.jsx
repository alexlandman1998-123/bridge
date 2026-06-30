import { FileText, ListChecks, MessageCircle, ScrollText } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MobileCard, MobileEmptyState, MobileFilterChips } from '../../components/mobile-shell/MobileShellStates'
import { getMobileSharedActivity } from '../../services/mobileWorkspaceService'

const FILTERS = ['All', 'Transactions', 'Documents', 'Leads', 'Tasks', 'Messages']

const ICONS = {
  Transactions: ScrollText,
  Documents: FileText,
  Tasks: ListChecks,
  Messages: MessageCircle,
  Leads: MessageCircle,
  All: MessageCircle,
}

export default function MobileActivityPage() {
  const [filter, setFilter] = useState('All')
  const activity = getMobileSharedActivity()
  const rows = useMemo(() => {
    if (filter === 'All') return activity
    return activity.filter((item) => `${item.title} ${item.body}`.toLowerCase().includes(filter.slice(0, -1).toLowerCase()))
  }, [activity, filter])

  return (
    <div className="space-y-6">
      <section className="pt-2">
        <h1 className="text-[34px] font-bold text-[#10243a]">Activity</h1>
        <p className="mt-2 text-[16px] leading-7 text-[#60758d]">A clean timeline of what changed and what needs a quick look.</p>
      </section>

      <MobileFilterChips items={FILTERS} active={filter} onChange={setFilter} />

      {rows.length ? (
        <section className="space-y-4">
          <div>
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#60758d]">Today</p>
            <MobileCard className="pb-1">
              {rows.map((item, index) => {
                const key = FILTERS.find((entry) => `${item.title} ${item.body}`.toLowerCase().includes(entry.slice(0, -1).toLowerCase())) || 'All'
                const Icon = ICONS[key] || MessageCircle
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    <span className="flex flex-col items-center">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#e8f6ef] text-[#1f7a5a]">
                        <Icon className="h-4 w-4" />
                      </span>
                      {index < rows.length - 1 ? <span className="mt-1 h-10 w-px bg-[#dfe7ef]" /> : null}
                    </span>
                    <span className="min-w-0 flex-1 pb-4">
                      <span className="block text-[15px] font-semibold text-[#10243a]">{item.title}</span>
                      <span className="mt-1 block truncate text-[13px] text-[#60758d]">{item.body}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-semibold text-[#94a3b8]">{item.time}</span>
                  </div>
                )
              })}
            </MobileCard>
          </div>
        </section>
      ) : <MobileEmptyState title="No activity found." body="Try another activity filter." />}
    </div>
  )
}
