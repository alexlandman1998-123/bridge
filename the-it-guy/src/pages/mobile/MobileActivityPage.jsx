import { BriefcaseBusiness, FileText, Landmark, ListChecks, MessageCircle, ScrollText, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import MobileCreateSheet, { MobileDraftCard } from '../../components/mobile-shell/MobileCreateSheet'
import { mobileDraftMatchesModule } from '../../components/mobile-shell/mobileCreateConfig'
import { MobileCard, MobileEmptyState, MobileFilterChips } from '../../components/mobile-shell/MobileShellStates'
import { getOfflineDrafts } from '../../services/mobileProductivityService'
import { getMobileSharedActivity } from '../../services/mobileWorkspaceService'

const FILTERS = [
  { value: 'All', label: 'All' },
  { value: 'transaction', label: 'Transactions' },
  { value: 'matter', label: 'Matters' },
  { value: 'application', label: 'Applications' },
  { value: 'deal', label: 'Deals' },
  { value: 'lead', label: 'Leads' },
]

const ICONS = {
  transaction: ScrollText,
  matter: ShieldCheck,
  application: Landmark,
  deal: BriefcaseBusiness,
  lead: MessageCircle,
  Documents: FileText,
  Tasks: ListChecks,
  All: MessageCircle,
}

export default function MobileActivityPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [filter, setFilter] = useState('All')
  const [drafts, setDrafts] = useState(() => getOfflineDrafts())
  const createType = searchParams.get('create') || ''
  const createOpen = createType === 'note'
  const activity = getMobileSharedActivity()
  const rows = useMemo(() => {
    if (filter === 'All') return activity
    return activity.filter((item) => item.module === filter || `${item.title} ${item.body}`.toLowerCase().includes(filter.toLowerCase()))
  }, [activity, filter])
  const pendingDrafts = useMemo(() => (
    drafts.filter((draft) => mobileDraftMatchesModule(draft, 'activity'))
  ), [drafts])

  function clearCreateIntent() {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('create')
    setSearchParams(nextParams, { replace: true })
  }

  function handleDraftSaved() {
    setDrafts(getOfflineDrafts())
  }

  return (
    <div className="space-y-6" data-mobile-shared-activity>
      <section className="rounded-[30px] bg-[#10243a] p-5 text-white shadow-[0_20px_46px_rgba(15,23,42,0.18)]">
        <p className="text-[11px] font-semibold uppercase text-[#9fe0bd]">Live Workstream</p>
        <h1 className="mt-2 text-[34px] font-bold leading-tight text-white">Activity</h1>
        <p className="mt-2 text-[16px] leading-7 text-[#dce8f2]">A chronological feed across transactions, matters, applications, leads and commercial work.</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-[20px] bg-white/10 p-3">
            <p className="text-[22px] font-semibold">{activity.length}</p>
            <p className="text-[11px] font-semibold text-[#c7d7e4]">Events</p>
          </div>
          <div className="rounded-[20px] bg-white/10 p-3">
            <p className="text-[22px] font-semibold">{new Set(activity.map((item) => item.module)).size}</p>
            <p className="text-[11px] font-semibold text-[#c7d7e4]">Modules</p>
          </div>
          <div className="rounded-[20px] bg-white/10 p-3">
            <p className="text-[22px] font-semibold">{rows.length}</p>
            <p className="text-[11px] font-semibold text-[#c7d7e4]">Visible</p>
          </div>
        </div>
      </section>

      <MobileFilterChips items={FILTERS} active={filter} onChange={setFilter} />

      {pendingDrafts.length ? (
        <section className="space-y-3" data-mobile-pending-notes>
          {pendingDrafts.map((draft) => <MobileDraftCard key={draft.id} draft={draft} />)}
        </section>
      ) : null}

      {rows.length ? (
        <section className="space-y-4">
          <div>
            <p className="mb-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#60758d]">Today</p>
            <MobileCard className="pb-1">
              {rows.map((item, index) => {
                const Icon = ICONS[item.module] || MessageCircle
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
                      <span className="mt-1 block truncate text-[13px] text-[#60758d]">{item.body}{item.actor ? ` · ${item.actor}` : ''}</span>
                    </span>
                    <span className="shrink-0 text-[12px] font-semibold text-[#94a3b8]">{item.time}</span>
                  </div>
                )
              })}
            </MobileCard>
          </div>
        </section>
      ) : pendingDrafts.length && filter === 'All' ? null : <MobileEmptyState title="No activity found." body="Try another activity filter." />}
      <MobileCreateSheet
        open={createOpen}
        type={createType}
        route="/mobile/activity"
        onClose={clearCreateIntent}
        onSaved={handleDraftSaved}
      />
    </div>
  )
}
